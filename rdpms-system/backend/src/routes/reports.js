import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import {
  resolveProjectAccess,
  assertProjectCapability,
  auditElevatedIfNeeded,
  projectVisibilityFilter,
} from '../kernel/projectAccess.js';
import { HttpError, badRequest, notFound } from '../kernel/http.js';
import { withIdempotency, resolveIdempotencyKey } from '../platform/idempotency/receipts.js';
import { writeAuditStrict } from '../platform/audit/strictAudit.js';
import {
  normalizeReportType,
  validatePeriodKey,
  isReportPeriodConflict,
} from '../modules/reports/reportRules.js';

/**
 * /api/reports —— 汇报管理（W10 PG baseline 迁移 + 项目∩）。
 *
 * 字段迁移：userId→authorId、month→periodKey、approvedBy/approvedAt/approveNote→reviewerId/reviewedAt/reviewNote
 * 状态迁移：草稿→DRAFT / 已提交→SUBMITTED / 需修改→NEEDS_REVISION / 已阅→REVIEWED / 已通过→REVIEWED
 * 唯一键：userId_projectId_month_reportType → projectId+authorId+reportType+periodKey
 */
const reports = new Hono();

reports.use('*', authMiddleware);

/** 内容入参兼容：对象（当前前端）或 JSON 字符串（旧前端/离线队列） */
function parseContentInput(content) {
  if (content === undefined) return {};
  if (typeof content !== 'string') return content;
  try {
    return JSON.parse(content || '{}');
  } catch {
    throw badRequest('VALIDATION_ERROR', 'content 不是合法 JSON', { field: 'content' });
  }
}

/** F05：保存接口不得携带状态（提交/审阅只能走专用命令） */
function assertNoClientStatus(body, actionLabel) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'status')) return;
  const requested = normalizeStatus(body.status);
  if (requested && requested !== 'DRAFT') {
    throw badRequest('VALIDATION_ERROR', `${actionLabel}接口不得设置汇报状态，请使用提交接口`, { field: 'status' });
  }
}

const LEGACY_STATUS_MAP = {
  '草稿': 'DRAFT',
  '已提交': 'SUBMITTED',
  'submitted': 'SUBMITTED',
  '审阅中': 'REVIEWING',
  '需修改': 'NEEDS_REVISION',
  '已阅': 'REVIEWED',
  '已通过': 'REVIEWED',
  'draft': 'DRAFT',
};
const normalizeStatus = (v) => LEGACY_STATUS_MAP[v] ?? v;

const AUTHOR_SELECT = { select: { id: true, displayName: true, position: true, department: true } };

// ── 列表（reports.view；按可见项目过滤）──────────────────────────────────────
reports.get('/', requirePermission('reports.view'), async (c) => {
  const auth = getAuth(c);
  const { page = 1, pageSize = 20, authorId, userId, projectId, periodKey, month, reportType, status } = c.req.query();

  const where = {
    deletedAt: null,
    ...(projectVisibilityFilter(auth) ? { project: projectVisibilityFilter(auth) } : {}),
  };
  if (authorId || userId) where.authorId = authorId || userId;
  if (projectId) where.projectId = projectId;
  if (periodKey || month) where.periodKey = periodKey || month;
  if (reportType) where.reportType = normalizeReportType(reportType);
  if (status) where.status = normalizeStatus(status);

  const [total, list] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      skip: (Number.parseInt(page, 10) - 1) * Number.parseInt(pageSize, 10),
      take: Number.parseInt(pageSize, 10),
      orderBy: { createdAt: 'desc' },
      include: { author: AUTHOR_SELECT, project: { select: { id: true, name: true, code: true } } },
    }),
  ]);

  return c.json({
    list, total, page: Number.parseInt(page, 10), pageSize: Number.parseInt(pageSize, 10),
  });
});

// ── 详情（reports.view + ∩ read）────────────────────────────────────────────
reports.get('/:id', requirePermission('reports.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      author: AUTHOR_SELECT,
      project: { select: { id: true, name: true, code: true, type: true } },
      reviewer: { select: { id: true, displayName: true } },
      versions: { orderBy: { version: 'desc' } },
    },
  });
  if (!report || report.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');

  const access = await resolveProjectAccess(prisma, auth, report.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.view');
  return c.json(report);
});

// ── 创建/按唯一键更新（reports.create + ∩ write）────────────────────────────
// RF03：本接口只负责「保存草稿」——周期键按类型严格校验，状态由提交命令负责。
reports.post('/', requirePermission('reports.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(body, ['projectId', 'reportType', 'periodKey', 'month', 'content'],
    { entityLabel: '创建汇报' });
  assertNoClientStatus(body, '保存草稿');

  const projectId = data.projectId;
  if (!projectId) throw badRequest('VALIDATION_ERROR', '项目不能为空', { field: 'projectId' });

  const reportType = normalizeReportType(data.reportType) || 'MONTHLY';
  const keyCheck = validatePeriodKey(reportType, data.periodKey ?? data.month);
  if (!keyCheck.ok) throw badRequest('VALIDATION_ERROR', keyCheck.message, keyCheck.details);
  const periodKey = keyCheck.value;

  const access = await resolveProjectAccess(prisma, auth, projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.create');
  assertProjectCapability(access, 'write', 'reports.create');

  const content = parseContentInput(data.content);
  const uniqueKey = {
    projectId, authorId: auth.userId, reportType, periodKey,
  };

  // 已提交/已审阅的内容对所有入口锁定：保存接口不得覆盖（F05 / RF04 前置）
  const existing = await prisma.report.findUnique({
    where: { projectId_authorId_reportType_periodKey: uniqueKey },
  });
  if (existing && !existing.deletedAt && !['DRAFT', 'NEEDS_REVISION'].includes(existing.status)) {
    throw new HttpError(409, 'INVALID_STATE', '该周期汇报已提交或已审阅，不能通过保存接口覆盖');
  }

  let report;
  try {
    report = await prisma.report.upsert({
      where: { projectId_authorId_reportType_periodKey: uniqueKey },
      // 显式重建被删除的同周期汇报（否则保存会写进不可见的墓碑行）
      update: { content, updatedById: auth.userId, deletedAt: null },
      create: {
        projectId,
        authorId: auth.userId,
        reportType,
        periodKey,
        content,
        status: 'DRAFT',
        createdById: auth.userId,
      },
      include: {
        author: { select: { id: true, displayName: true } },
        project: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    if (isReportPeriodConflict(err)) {
      throw new HttpError(409, 'DUPLICATE_PERIOD_KEY', '同一项目下该类型已存在同周期的汇报');
    }
    throw err;
  }
  return c.json(report, 201);
});

// ── 更新（reports.update；仅作者可改草稿/被驳回稿）───────────────────────────
// RF02：鉴权 → 资源授权 → 状态校验 → 才允许查询幂等回执；
//       业务写入、严格审计、回执在同一事务提交（失败不留回执）。
reports.put('/:id', requirePermission('reports.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);

  const existing = await prisma.report.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');

  const access = await resolveProjectAccess(prisma, auth, existing.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.update');
  assertProjectCapability(access, 'write', 'reports.update');
  if (existing.authorId !== auth.userId) throw badRequest('FORBIDDEN', '无权修改他人的汇报');
  if (!['DRAFT', 'NEEDS_REVISION'].includes(existing.status)) {
    throw badRequest('VALIDATION_ERROR', '仅草稿或需修改状态的汇报可编辑');
  }
  assertNoClientStatus(body, '保存草稿');

  // 校验（含周期键按类型校验）在查询幂等回执之前完成：非法请求不留回执
  const data = pickAllowed(body, ['content', 'periodKey', 'month', 'reportType'], { entityLabel: '更新汇报' });
  if (data.month !== undefined) { data.periodKey = data.month; delete data.month; }
  const effectiveType = data.reportType !== undefined
    ? normalizeReportType(data.reportType)
    : existing.reportType;
  if (data.reportType !== undefined) data.reportType = effectiveType;
  if (data.periodKey !== undefined) {
    const keyCheck = validatePeriodKey(effectiveType, data.periodKey);
    if (!keyCheck.ok) throw badRequest('VALIDATION_ERROR', keyCheck.message, keyCheck.details);
    data.periodKey = keyCheck.value;
  }
  if (data.content !== undefined) data.content = parseContentInput(data.content);

  const { key } = resolveIdempotencyKey(c, body);
  let result;
  try {
    result = await withIdempotency({
      db: prisma,
      actor: auth,
      command: 'PUT /api/reports/:id',
      resourceScope: `report:${id}`,
      idempotencyKey: key,
      payload: body,
      execute: async (tx) => {
        const updated = await tx.report.update({
          where: { id },
          data: { ...data, updatedById: auth.userId },
          include: { author: { select: { id: true, displayName: true } }, project: { select: { id: true, name: true } } },
        });
        await writeAuditStrict(tx, {
          c,
          actorId: auth.userId,
          actorName: auth.user.displayName,
          actorRole: auth.systemRole,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: 'REPORT',
          entityId: id,
          entityLabel: `${existing.reportType}/${existing.periodKey}`,
          changedFields: Object.keys(data),
          metadata: { permissionCode: 'reports.update' },
        });
        return { status: 200, body: updated };
      },
    });
  } catch (err) {
    if (isReportPeriodConflict(err)) {
      throw new HttpError(409, 'DUPLICATE_PERIOD_KEY', '同一项目下该类型已存在同周期的汇报');
    }
    throw err;
  }
  if (result.replayed) c.header('Idempotent-Replay', 'true');
  return c.json(result.body, result.status);
});

// ── 提交（reports.submit + ∩ write）─────────────────────────────────────────
// RF02：版本快照、状态、严格审计、幂等回执全部在同一事务；失败不留半成品与回执。
reports.post('/:id/submit', requirePermission('reports.submit'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report || report.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');

  const access = await resolveProjectAccess(prisma, auth, report.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.submit');
  assertProjectCapability(access, 'write', 'reports.submit');
  if (report.authorId !== auth.userId) throw badRequest('FORBIDDEN', '只能提交自己的汇报');
  if (report.status === 'REVIEWED') throw badRequest('VALIDATION_ERROR', '已审阅的汇报不能再次提交');

  const { key } = resolveIdempotencyKey(c, body);
  const result = await withIdempotency({
    db: prisma,
    actor: auth,
    command: 'POST /api/reports/:id/submit',
    resourceScope: `report:${id}`,
    idempotencyKey: key,
    payload: { reportId: id },
    execute: async (tx) => {
      const lastVersion = await tx.reportVersion.findFirst({
        where: { reportId: id },
        orderBy: { version: 'desc' },
      });
      await tx.reportVersion.create({
        data: {
          reportId: id,
          version: (lastVersion?.version || 0) + 1,
          content: report.content,
          createdById: auth.userId,
        },
      });
      await tx.report.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: new Date(), updatedById: auth.userId },
      });
      await writeAuditStrict(tx, {
        c,
        actorId: auth.userId,
        actorName: auth.user.displayName,
        actorRole: auth.systemRole,
        action: AUDIT_ACTIONS.SUBMIT,
        entityType: 'REPORT',
        entityId: id,
        entityLabel: `${report.reportType}/${report.periodKey}`,
        metadata: { permissionCode: 'reports.submit' },
      });
      return { status: 200, body: { success: true } };
    },
  });
  if (result.replayed) c.header('Idempotent-Replay', 'true');
  return c.json(result.body, result.status);
});

// ── 审阅通过（reports.review + ∩ transition）────────────────────────────────
reports.post('/:id/approve', requirePermission('reports.review'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existing = await prisma.report.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');
  if (existing.authorId === auth.userId) throw badRequest('VALIDATION_ERROR', '不能审阅自己的汇报');
  if (existing.status !== 'SUBMITTED') throw badRequest('VALIDATION_ERROR', '仅已提交的汇报可审阅');

  const access = await resolveProjectAccess(prisma, auth, existing.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.review');
  assertProjectCapability(access, 'transition', 'reports.review');

  const report = await prisma.report.update({
    where: { id },
    data: {
      status: 'REVIEWED',
      reviewerId: auth.userId,
      reviewedAt: new Date(),
      reviewNote: body?.note || null,
      updatedById: auth.userId,
    },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.APPROVE,
    entityType: 'REPORT',
    entityId: id,
    metadata: { permissionCode: 'reports.review' },
  });
  return c.json(report);
});

// ── 批示需修改（reports.review + ∩ transition）──────────────────────────────
reports.post('/:id/reject', requirePermission('reports.review'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  if (!body?.note) throw badRequest('VALIDATION_ERROR', '批示修改意见不能为空');

  const existing = await prisma.report.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');
  if (existing.authorId === auth.userId) throw badRequest('VALIDATION_ERROR', '不能批示自己的汇报');
  if (existing.status !== 'SUBMITTED') throw badRequest('VALIDATION_ERROR', '仅已提交的汇报可批示');

  const access = await resolveProjectAccess(prisma, auth, existing.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.review');
  assertProjectCapability(access, 'transition', 'reports.review');

  const report = await prisma.report.update({
    where: { id },
    data: {
      status: 'NEEDS_REVISION',
      reviewerId: auth.userId,
      reviewedAt: new Date(),
      reviewNote: body.note,
      updatedById: auth.userId,
    },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.REJECT,
    entityType: 'REPORT',
    entityId: id,
    metadata: { permissionCode: 'reports.review', note: body.note },
  });
  return c.json(report);
});

// 历史版本
reports.get('/:id/versions', requirePermission('reports.view'), async (c) => {
  const id = c.req.param('id');
  const versions = await prisma.reportVersion.findMany({
    where: { reportId: id },
    orderBy: { version: 'desc' },
  });
  return c.json(versions);
});

// ── 导出（reports.export）───────────────────────────────────────────────────
reports.get('/export/month/:month', requirePermission('reports.export'), async (c) => {
  const auth = getAuth(c);
  const month = c.req.param('month');
  const { authorId, userId, projectId, reportType } = c.req.query();

  const where = { periodKey: month, deletedAt: null };
  if (authorId || userId) where.authorId = authorId || userId;
  if (projectId) where.projectId = projectId;
  if (reportType) where.reportType = normalizeReportType(reportType);

  const list = await prisma.report.findMany({
    where,
    include: { author: AUTHOR_SELECT, project: { select: { id: true, name: true, code: true, type: true } } },
    orderBy: [{ project: { type: 'asc' } }, { author: { displayName: 'asc' } }],
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.EXPORT,
    entityType: 'REPORT',
    metadata: { permissionCode: 'reports.export', periodKey: month, count: list.length },
  });
  return c.json({ month, reports: list, exportedAt: new Date().toISOString() });
});

// ── 删除（reports.delete，P1 批次二解冻；仅草稿，软删+审计）──────────────────
// Tencent 语义：只能删草稿；enh 额外由 reports.delete 权限码把关
reports.delete('/:id', requirePermission('reports.delete'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report || report.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');
  if (report.status !== 'DRAFT') throw badRequest('VALIDATION_ERROR', '只能删除草稿状态的汇报');

  await prisma.report.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'REPORT',
    entityId: id,
    entityLabel: report.title ?? report.periodKey ?? id,
    before: { status: report.status },
    metadata: { permissionCode: 'reports.delete', softDelete: true },
  });
  return c.json({ success: true, id, softDeleted: true });
});

// ── 撤回（作者本人；SUBMITTED → DRAFT）──────────────────────────────────────
reports.patch('/:id/recall', requirePermission('reports.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report || report.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');
  if (report.status !== 'SUBMITTED') throw badRequest('VALIDATION_ERROR', '只有已提交的汇报才能撤回');
  if (report.authorId !== auth.userId) throw badRequest('FORBIDDEN', '无权撤回他人的汇报');

  const updated = await prisma.report.update({
    where: { id },
    data: {
      status: 'DRAFT',
      reviewerId: null,
      reviewedAt: null,
      submittedAt: null,
      updatedById: auth.userId,
    },
  });
  return c.json({ report: updated, message: '撤回成功' });
});

export default reports;
