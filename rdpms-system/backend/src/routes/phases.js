import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import {
  resolveProjectAccess,
  assertProjectCapability,
  auditElevatedIfNeeded,
} from '../kernel/projectAccess.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/phases —— 项目阶段（W10 PG baseline 迁移 + 项目∩）。
 *
 * ProjectPhase 必填 code（缺省自动生成 PH-<projectId8>-<n>）；
 * PhaseStatus 枚举：NOT_STARTED/IN_PROGRESS/COMPLETED/BLOCKED/SKIPPED/CANCELLED；
 * PhaseTransition 为阶段间流转关系图（fromPhaseId→toPhaseId），id 为 uuid。
 */
const phases = new Hono();

phases.use('*', authMiddleware);

const PHASE_STATUS_MAP = {
  '未开始': 'NOT_STARTED', '进行中': 'IN_PROGRESS', '已完成': 'COMPLETED',
  '已阻塞': 'BLOCKED', '已跳过': 'SKIPPED', '已取消': 'CANCELLED',
};
const normalizePhaseStatus = (v) => PHASE_STATUS_MAP[v] ?? v;

// GET /?projectId= —— 阶段列表（project_phases.view + ∩ read）
phases.get('/', requirePermission('project_phases.view'), async (c) => {
  const auth = getAuth(c);
  const { projectId } = c.req.query();
  if (projectId) {
    const access = await resolveProjectAccess(prisma, auth, projectId);
    await auditElevatedIfNeeded(prisma, c, access, 'project_phases.view');
    assertProjectCapability(access, 'read', 'project_phases.view');
    const list = await prisma.projectPhase.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } });
    return c.json({ list, total: list.length });
  }
  // 无 projectId：仅返回可见项目阶段
  const { projectVisibilityFilter } = await import('../kernel/projectAccess.js');
  const visible = projectVisibilityFilter(auth);
  const list = await prisma.projectPhase.findMany({
    where: visible ? { project: visible } : {},
    orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }],
    take: 500,
  });
  return c.json({ list, total: list.length });
});

// POST / —— 创建阶段（project_phases.create + ∩ write）
phases.post('/', requirePermission('project_phases.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(body, ['projectId', 'code', 'name', 'sortOrder', 'status', 'plannedStart', 'plannedEnd'], { entityLabel: '创建阶段' });
  if (!data.projectId) throw badRequest('VALIDATION_ERROR', 'projectId 不能为空');
  if (!data.name) throw badRequest('VALIDATION_ERROR', 'name 不能为空');

  const access = await resolveProjectAccess(prisma, auth, data.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'project_phases.create');
  assertProjectCapability(access, 'write', 'project_phases.create');

  const count = await prisma.projectPhase.count({ where: { projectId: data.projectId } });
  const created = await prisma.projectPhase.create({
    data: {
      projectId: data.projectId,
      code: data.code || `PH-${data.projectId.slice(0, 8)}-${count + 1}`,
      name: data.name,
      sortOrder: data.sortOrder ?? count,
      status: normalizePhaseStatus(data.status) || 'NOT_STARTED',
      plannedStart: data.plannedStart ? new Date(data.plannedStart) : null,
      plannedEnd: data.plannedEnd ? new Date(data.plannedEnd) : null,
    },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PROJECT_PHASE',
    entityId: created.id,
    entityLabel: created.name,
    metadata: { permissionCode: 'project_phases.create' },
  });
  return c.json(created, 201);
});

// GET /:id —— 详情
phases.get('/:id', requirePermission('project_phases.view'), async (c) => {
  const auth = getAuth(c);
  const phase = await prisma.projectPhase.findUnique({ where: { id: c.req.param('id') } });
  if (!phase) throw notFound('PHASE_NOT_FOUND', '阶段不存在');
  const access = await resolveProjectAccess(prisma, auth, phase.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'project_phases.view');
  return c.json(phase);
});

// PUT /:id —— 更新（project_phases.update + ∩ write）
phases.put('/:id', requirePermission('project_phases.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const before = await prisma.projectPhase.findUnique({ where: { id } });
  if (!before) throw notFound('PHASE_NOT_FOUND', '阶段不存在');

  const access = await resolveProjectAccess(prisma, auth, before.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'project_phases.update');
  assertProjectCapability(access, 'write', 'project_phases.update');

  const data = pickAllowed(await c.req.json().catch(() => ({})), ['name', 'sortOrder', 'status', 'plannedStart', 'plannedEnd'], { entityLabel: '更新阶段', allowEmpty: true });
  if ('status' in data) data.status = normalizePhaseStatus(data.status);
  if ('plannedStart' in data) data.plannedStart = data.plannedStart ? new Date(data.plannedStart) : null;
  if ('plannedEnd' in data) data.plannedEnd = data.plannedEnd ? new Date(data.plannedEnd) : null;

  const updated = await prisma.projectPhase.update({ where: { id }, data });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'PROJECT_PHASE',
    entityId: id,
    entityLabel: before.name,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'project_phases.update' },
  });
  return c.json(updated);
});

// PATCH /:id/status —— 阶段状态流转（project_phases.change_status + ∩ transition）
phases.patch('/:id/status', requirePermission('project_phases.change_status'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const { status } = await c.req.json().catch(() => ({}));
  if (!status) throw badRequest('VALIDATION_ERROR', 'status 不能为空');

  const before = await prisma.projectPhase.findUnique({ where: { id } });
  if (!before) throw notFound('PHASE_NOT_FOUND', '阶段不存在');

  const access = await resolveProjectAccess(prisma, auth, before.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'project_phases.change_status');
  assertProjectCapability(access, 'transition', 'project_phases.change_status');

  const updated = await prisma.projectPhase.update({
    where: { id },
    data: { status: normalizePhaseStatus(status) },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    entityType: 'PROJECT_PHASE',
    entityId: id,
    entityLabel: before.name,
    before: { status: before.status },
    after: { status: updated.status },
    metadata: { permissionCode: 'project_phases.change_status' },
  });
  return c.json(updated);
});

// POST /:id/transitions —— 建立阶段流转（project_phases.update + ∩ write）
phases.post('/:id/transitions', requirePermission('project_phases.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const toPhaseId = body.toPhaseId;
  if (!toPhaseId) throw badRequest('VALIDATION_ERROR', 'toPhaseId 不能为空');
  if (id === toPhaseId) throw badRequest('VALIDATION_ERROR', '不能自引用');

  const from = await prisma.projectPhase.findUnique({ where: { id } });
  if (!from) throw notFound('PHASE_NOT_FOUND', '阶段不存在');
  const access = await resolveProjectAccess(prisma, auth, from.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'project_phases.update');
  assertProjectCapability(access, 'write', 'project_phases.update');

  const circular = await prisma.phaseTransition.findFirst({ where: { fromPhaseId: toPhaseId, toPhaseId: id } });
  if (circular) throw badRequest('VALIDATION_ERROR', '检测到循环依赖');

  const transition = await prisma.phaseTransition.upsert({
    where: { fromPhaseId_toPhaseId: { fromPhaseId: id, toPhaseId } },
    update: {},
    create: { fromPhaseId: id, toPhaseId },
  });
  return c.json({ success: true, data: transition });
});

// DELETE /:id/transitions/:toPhaseId —— 删除阶段流转
phases.delete('/:id/transitions/:toPhaseId', requirePermission('project_phases.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const toPhaseId = c.req.param('toPhaseId');
  const from = await prisma.projectPhase.findUnique({ where: { id } });
  if (!from) throw notFound('PHASE_NOT_FOUND', '阶段不存在');
  const access = await resolveProjectAccess(prisma, auth, from.projectId);
  assertProjectCapability(access, 'write', 'project_phases.update');
  await prisma.phaseTransition.deleteMany({ where: { fromPhaseId: id, toPhaseId } });
  return c.json({ success: true });
});

export default phases;
