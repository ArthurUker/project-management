import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import {
  resolveProjectAccess,
  auditElevatedIfNeeded,
  projectVisibilityFilter,
} from '../kernel/projectAccess.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/progress —— 月度进展（W10 PG baseline 迁移 + 项目∩）。
 *
 * 字段迁移：month→periodKey、completion→completionPercent、submittedBy→submittedById
 * 状态迁移：projectStatus 中文 → ProjectStatus 枚举
 */
const progress = new Hono();

progress.use('*', authMiddleware);

const LEGACY_STATUS_MAP = {
  '草稿': 'PLANNING', '规划中': 'PLANNING', '进行中': 'IN_PROGRESS',
  '待加工': 'PENDING_PROCESSING', '待验证': 'PENDING_VERIFICATION',
  '暂停': 'ON_HOLD', '已完成': 'COMPLETED', '已归档': 'ARCHIVED', '已取消': 'CANCELLED',
};
const normalizeStatus = (v) => LEGACY_STATUS_MAP[v] ?? v;

// GET /project/:projectId —— 项目月度进展
progress.get('/project/:projectId', requirePermission('progress.view'), async (c) => {
  const auth = getAuth(c);
  const projectId = c.req.param('projectId');
  const { months = 6 } = c.req.query();

  const access = await resolveProjectAccess(prisma, auth, projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'progress.view');

  const list = await prisma.monthlyProgress.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { periodKey: 'desc' },
    take: Number.parseInt(months, 10),
    include: { submitter: { select: { id: true, displayName: true } } },
  });
  return c.json(list);
});

// POST /project/:projectId —— 填写/更新月度进展
progress.post('/project/:projectId', requirePermission('progress.create'), async (c) => {
  const auth = getAuth(c);
  const projectId = c.req.param('projectId');
  const body = await c.req.json().catch(() => null);
  const data = pickProgressFields(body);
  const periodKey = data.periodKey || data.month;
  if (!periodKey) throw badRequest('VALIDATION_ERROR', 'periodKey（或 month）不能为空');

  const access = await resolveProjectAccess(prisma, auth, projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'progress.create');
  assertWriteOrBetter(access, 'progress.create');

  const payload = {
    actualWork: data.actualWork ?? null,
    completionPercent: clampPercent(data.completionPercent ?? data.completion ?? 0),
    nextPlan: data.nextPlan ?? null,
    risks: data.risks ?? null,
    projectStatus: data.projectStatus ? normalizeStatus(data.projectStatus) : null,
    submittedById: auth.userId,
    submittedAt: new Date(),
    updatedById: auth.userId,
  };

  const row = await prisma.monthlyProgress.upsert({
    where: { projectId_periodKey: { projectId, periodKey } },
    update: payload,
    create: { projectId, periodKey, createdById: auth.userId, ...payload },
    include: { submitter: { select: { id: true, displayName: true } } },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'MONTHLY_PROGRESS',
    entityId: row.id,
    entityLabel: `${projectId}/${periodKey}`,
    metadata: { permissionCode: 'progress.create' },
  });
  return c.json(row, 201);
});

function pickProgressFields(body) {
  if (!body || typeof body !== 'object') return {};
  const keys = ['periodKey', 'month', 'actualWork', 'completionPercent', 'completion', 'nextPlan', 'risks', 'projectStatus'];
  const out = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

function clampPercent(v) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function assertWriteOrBetter(access, perm) {
  if (!access.capabilities.includes('write')) {
    throw badRequest('PROJECT_CAPABILITY_DENIED', `当前项目角色不具备 write 能力（${perm}）`);
  }
}

// GET /all/:periodKey —— 全部项目月度进展（progress.view；按可见项目过滤）
progress.get('/all/:periodKey', requirePermission('progress.view'), async (c) => {
  const auth = getAuth(c);
  const periodKey = c.req.param('periodKey');
  const list = await prisma.monthlyProgress.findMany({
    where: {
      periodKey,
      deletedAt: null,
      ...(projectVisibilityFilter(auth) ? { project: projectVisibilityFilter(auth) } : {}),
    },
    include: {
      project: { select: { id: true, name: true, code: true, type: true, status: true } },
    },
    orderBy: { project: { name: 'asc' } },
  });
  return c.json(list);
});

// GET /export/:periodKey —— 导出月度进展（progress.view；M-1 无 progress.export 码，导出读权限沿用）
progress.get('/export/:periodKey', requirePermission('progress.view'), async (c) => {
  const auth = getAuth(c);
  const periodKey = c.req.param('periodKey');
  const list = await prisma.monthlyProgress.findMany({
    where: {
      periodKey,
      deletedAt: null,
      ...(projectVisibilityFilter(auth) ? { project: projectVisibilityFilter(auth) } : {}),
    },
    include: {
      project: {
        include: {
          manager: { select: { id: true, displayName: true, position: true } },
          members: {
            where: { leftAt: null },
            include: { user: { select: { id: true, displayName: true, position: true } } },
          },
        },
      },
      submitter: { select: { id: true, displayName: true } },
    },
    orderBy: { project: { name: 'asc' } },
  });
  return c.json({ periodKey, progresses: list, exportedAt: new Date().toISOString() });
});

// GET / —— 兼容挂载（progress.view）
progress.get('/', requirePermission('progress.view'), async (c) => {
  const auth = getAuth(c);
  const { projectId, periodKey } = c.req.query();
  const where = {
    deletedAt: null,
    ...(projectVisibilityFilter(auth) ? { project: projectVisibilityFilter(auth) } : {}),
  };
  if (projectId) where.projectId = projectId;
  if (periodKey) where.periodKey = periodKey;
  const [total, list] = await Promise.all([
    prisma.monthlyProgress.count({ where }),
    prisma.monthlyProgress.findMany({
      where,
      orderBy: [{ periodKey: 'desc' }],
      include: { project: { select: { id: true, name: true, code: true } } },
    }),
  ]);
  return c.json({ list, total });
});

export default progress;
