import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import {
  resolveProjectAccess,
  auditElevatedIfNeeded,
  projectVisibilityFilter,
} from '../kernel/projectAccess.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/reports —— 汇报管理（W10 PG baseline 迁移 + 项目∩）。
 *
 * 字段迁移：userId→authorId、month→periodKey、approvedBy/approvedAt/approveNote→reviewerId/reviewedAt/reviewNote
 * 状态迁移：草稿→DRAFT / 已提交→SUBMITTED / 需修改→NEEDS_REVISION / 已阅→REVIEWED / 已通过→REVIEWED
 * 唯一键：userId_projectId_month_reportType → projectId+authorId+reportType+periodKey
 */
const reports = new Hono();

reports.use('*', authMiddleware);

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
  if (reportType) where.reportType = reportType;
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
reports.post('/', requirePermission('reports.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(body, ['projectId', 'reportType', 'periodKey', 'month', 'content', 'status'],
    { entityLabel: '创建汇报' });

  const projectId = data.projectId;
  const periodKey = data.periodKey || data.month;
  if (!projectId || !periodKey) throw badRequest('VALIDATION_ERROR', '项目和周期不能为空');

  const access = await resolveProjectAccess(prisma, auth, projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.create');
  assertProjectCapability(access, 'write', 'reports.create');

  const reportType = data.reportType || 'MONTHLY';
  const status = normalizeStatus(data.status) || 'DRAFT';
  const content = data.content === undefined
    ? {}
    : (typeof data.content === 'string' ? JSON.parse(data.content || '{}') : data.content);

  const report = await prisma.report.upsert({
    where: {
      projectId_authorId_reportType_periodKey: {
        projectId, authorId: auth.userId, reportType, periodKey,
      },
    },
    update: { content, status, updatedById: auth.userId },
    create: {
      projectId,
      authorId: auth.userId,
      reportType,
      periodKey,
      content,
      status,
      createdById: auth.userId,
    },
    include: {
      author: { select: { id: true, displayName: true } },
      project: { select: { id: true, name: true } },
    },
  });
  return c.json(report, 201);
});

// ── 更新（reports.update；仅作者可改草稿/被驳回稿）───────────────────────────
reports.put('/:id', requirePermission('reports.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);

  const existing = await prisma.report.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');
  if (existing.authorId !== auth.userId) throw badRequest('FORBIDDEN', '无权修改他人的汇报');
  if (!['DRAFT', 'NEEDS_REVISION'].includes(existing.status)) {
    throw badRequest('VALIDATION_ERROR', '仅草稿或需修改状态的汇报可编辑');
  }

  const data = pickAllowed(body, ['content', 'periodKey', 'month', 'reportType'], { entityLabel: '更新汇报' });
  if (data.month !== undefined) { data.periodKey = data.month; delete data.month; }
  if (data.content !== undefined) {
    data.content = typeof data.content === 'string' ? JSON.parse(data.content || '{}') : data.content;
  }

  const updated = await prisma.report.update({
    where: { id },
    data: { ...data, updatedById: auth.userId },
    include: { author: { select: { id: true, displayName: true } }, project: { select: { id: true, name: true } } },
  });
  return c.json(updated);
});

// ── 提交（reports.submit + ∩ write）─────────────────────────────────────────
reports.post('/:id/submit', requirePermission('reports.submit'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report || report.deletedAt) throw notFound('REPORT_NOT_FOUND', '汇报不存在');
  if (report.authorId !== auth.userId) throw badRequest('FORBIDDEN', '只能提交自己的汇报');
  if (report.status === 'REVIEWED') throw badRequest('VALIDATION_ERROR', '已审阅的汇报不能再次提交');

  const access = await resolveProjectAccess(prisma, auth, report.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.submit');

  await prisma.$transaction(async (tx) => {
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
  });

  await writeAudit(prisma, {
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
  return c.json({ success: true });
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
  if (reportType) where.reportType = reportType;

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

// M-1：reports.delete 为 P1 后置权限，端点暂不提供
reports.delete('/:id', async (c) => {
  return c.json({ error: '汇报删除属 P1 后置权限，本轮未启用', code: 'PERMISSION_NOT_AVAILABLE' }, 403);
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
