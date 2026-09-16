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
  readClientContract,
  assertBaselineForModernClient,
  assertLegacyCompatAllowed,
  isScientificReportContent,
} from '../modules/access/editPolicy.js';
import { isReportLocked } from '../modules/access/writeGuards.js';
import {
  normalizeReportType,
  validatePeriodKey,
  isReportPeriodConflict,
} from '../modules/reports/reportRules.js';
import { assertReportWritable } from '../modules/access/writeGuards.js';
import { buildReportDraftPatch, saveReportDraft, submitReport } from '../modules/reports/reportCommands.js';

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

  // RF04：新建/保存日报接入持久幂等——同一次逻辑操作重试返回首次结果，
  // 不会因“部分保存后重试”造成覆盖或重复（回执与业务、审计同事务）。
  const { key } = resolveIdempotencyKey(c, body);
  let result;
  try {
    result = await withIdempotency({
      db: prisma,
      actor: auth,
      command: 'POST /api/reports',
      resourceScope: `report:${projectId}:${reportType}:${periodKey}`,
      idempotencyKey: key,
      payload: body,
      validate: async () => {
        // 已提交/已审阅的内容对所有入口锁定（依赖服务端当前状态，仅新命令路径执行）
        const current = await prisma.report.findUnique({
          where: { projectId_authorId_reportType_periodKey: uniqueKey },
        });
        if (current && !current.deletedAt && !['DRAFT', 'NEEDS_REVISION'].includes(current.status)) {
          throw new HttpError(409, 'INVALID_STATE', '该周期汇报已提交或已审阅，不能通过保存接口覆盖');
        }
        return current;
      },
      execute: async (tx, current) => {
        const report = await tx.report.upsert({
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
        await writeAuditStrict(tx, {
          c,
          actorId: auth.userId,
          actorName: auth.user.displayName,
          actorRole: auth.systemRole,
          action: current ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
          entityType: 'REPORT',
          entityId: report.id,
          entityLabel: `${reportType}/${periodKey}`,
          changedFields: Object.keys(data),
          metadata: { permissionCode: 'reports.create', projectId },
        });
        return { status: 201, body: report };
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
  assertNoClientStatus(body, '保存草稿');

  // 请求形状校验（只依赖载荷，与服务器状态无关）留在回执查询之前；
  // 状态锁定与周期键校验依赖服务端当前状态，放进 validate（仅新命令路径执行）。
  const allowed = pickAllowed(body, ['content', 'periodKey', 'month', 'reportType'], { entityLabel: '更新汇报' });

  // 并发基线（可选）：新版客户端传之前读到的 updatedAt，进入原子 UPDATE 条件
  const expectedUpdatedAt = body?.expectedUpdatedAt ? new Date(body.expectedUpdatedAt) : null;
  if (expectedUpdatedAt && Number.isNaN(expectedUpdatedAt.getTime())) {
    throw badRequest('VALIDATION_ERROR', 'expectedUpdatedAt 不是合法时间', { field: 'expectedUpdatedAt' });
  }
  // 规则 1：声明新版契约的客户端缺基线 → 直接报错，不回落旧版兼容
  const clientContract = readClientContract(c.req.raw.headers, body);
  assertBaselineForModernClient(clientContract, expectedUpdatedAt, 'PUT /api/reports/:id');
  if (!expectedUpdatedAt) {
    // 规则 2/3（依赖服务端状态）在 validate 中执行：只拦新命令，不拦回放（回放由回执决定）
    // eslint-disable-next-line no-console
    console.warn(`[reports.update] 旧客户端兼容路径（无基线）report=${id} actor=${auth.userId} contract=${clientContract ?? '未声明'}`);
  }

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
      validate: () => {
        // RF04/F06：项目范围 + 作者 + 状态锁定判定与同步入口同源（modules/access/writeGuards）
        assertReportWritable(existing, auth, access);
        // 规则 2/3（依赖服务端状态、只拦新命令不拦回放）：
        // 旧客户端兼容路径只对「草稿且非实验科学数据」开放；已提交/已审核/实验科学数据必须带基线。
        if (!expectedUpdatedAt) {
          assertLegacyCompatAllowed({
            locked: isReportLocked(existing),
            scientific: isScientificReportContent(existing.reportType, existing.content),
            label: `汇报 ${existing.reportType}/${existing.periodKey}`,
          });
        }
        return buildReportDraftPatch(allowed, { currentType: existing.reportType });
      },
      execute: async (tx, data) => {
        // 共用命令：草稿保存（与同步上行同一实现）。
        // 新版客户端携带 expectedUpdatedAt → 作为原子并发基线；缺失时按旧客户端兼容路径处理，
        // 并在审计里留痕（noConcurrencyBaseline），不静默降低保护（RF04 复核）。
        const saved = await saveReportDraft(tx, {
          actor: auth, reportId: id, patch: data, cas: expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : undefined,
        });
        const updated = await tx.report.findUnique({
          where: { id },
          include: { author: { select: { id: true, displayName: true } }, project: { select: { id: true, name: true } } },
        }) ?? saved;
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
          metadata: {
            permissionCode: 'reports.update',
            ...(expectedUpdatedAt ? { concurrencyBaseline: expectedUpdatedAt.toISOString() } : { noConcurrencyBaseline: true }),
          },
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

  const { key } = resolveIdempotencyKey(c, body);
  const result = await withIdempotency({
    db: prisma,
    actor: auth,
    command: 'POST /api/reports/:id/submit',
    resourceScope: `report:${id}`,
    idempotencyKey: key,
    payload: { reportId: id },
    validate: () => {
      // 状态校验放在“无回执的新命令”路径：首次提交成功后（或已被审阅后）重试同 key，
      // 必须回放首次结果，而不是被状态检查拦住（RF02 复核要求）
      if (report.status === 'REVIEWED') {
        throw new HttpError(409, 'INVALID_STATE', '已审阅的汇报不能再次提交');
      }
    },
    execute: async (tx) => {
      // 共用命令：版本快照 + 状态（与其余入口同一实现，见 modules/reports/reportCommands.ts）
      await submitReport(tx, { actor: auth, report });
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

  // RF04/F06：先解析项目范围（非成员 404），再校验作者与状态
  const access = await resolveProjectAccess(prisma, auth, report.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.delete');
  assertProjectCapability(access, 'write', 'reports.delete');
  if (report.authorId !== auth.userId) throw badRequest('FORBIDDEN', '无权删除他人的汇报');
  if (report.status !== 'DRAFT') {
    throw new HttpError(409, 'INVALID_STATE', '只能删除草稿状态的汇报');
  }

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

  // RF04/F06：撤回同样要求项目成员资格与 write 能力
  const access = await resolveProjectAccess(prisma, auth, report.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.update');
  assertProjectCapability(access, 'write', 'reports.update');
  if (report.authorId !== auth.userId) throw badRequest('FORBIDDEN', '无权撤回他人的汇报');
  if (report.status !== 'SUBMITTED') {
    throw new HttpError(409, 'INVALID_STATE', '只有已提交的汇报才能撤回');
  }

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
