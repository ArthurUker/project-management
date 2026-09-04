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
  projectVisibilityFilter,
} from '../kernel/projectAccess.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/tasks —— 任务管理（W10 PG baseline 迁移 + 项目∩全量接入）。
 *
 * 迁移要点：
 *   Task.phase / Task.phaseOrder / Task.docRefs 字段已删除（阶段归属 phaseId+sortOrder；法规关联走 TaskRegulatoryDocument）；
 *   status/priority 中文 → TaskStatus/TaskPriority 枚举；
 *   applicabilityStatus → applicability（TaskApplicability 枚举）；
 *   User.name/avatar → displayName/avatarFileId。
 *
 * ∩ 判定顺序（M-1 §4.2）：资源存在 → 项目成员（404）→ 系统权限（403）→ 项目能力（403）。
 */
const tasks = new Hono();

tasks.use('*', authMiddleware);

const STATUS_MAP = {
  '待开始': 'NOT_STARTED', '未开始': 'NOT_STARTED', '进行中': 'IN_PROGRESS',
  '已完成': 'COMPLETED', '已阻塞': 'BLOCKED', '已取消': 'CANCELLED',
  draft: 'NOT_STARTED', todo: 'NOT_STARTED', doing: 'IN_PROGRESS',
  done: 'COMPLETED', blocked: 'BLOCKED', cancelled: 'CANCELLED',
};
const normalizeStatus = (v) => STATUS_MAP[String(v ?? '').toLowerCase()] ?? STATUS_MAP[v] ?? v;

const PRIORITY_MAP = { '低': 'LOW', '中': 'MEDIUM', '高': 'HIGH', '紧急': 'URGENT', low: 'LOW', medium: 'MEDIUM', high: 'HIGH', urgent: 'URGENT' };
const normalizePriority = (v) => PRIORITY_MAP[String(v ?? '').toLowerCase()] ?? PRIORITY_MAP[v] ?? v;

const APPLICABILITY_MAP = { required: 'REQUIRED', conditional: 'CONDITIONAL', not_applicable: 'NOT_APPLICABLE', to_be_confirmed: 'TO_BE_CONFIRMED' };
const normalizeApplicability = (v) => APPLICABILITY_MAP[String(v ?? '').toLowerCase()] ?? v;

const TASK_INCLUDE = {
  project: { select: { id: true, name: true, code: true } },
  assignee: { select: { id: true, displayName: true, avatarFileId: true } },
  phase: { select: { id: true, code: true, name: true, sortOrder: true } },
};

async function loadTaskOr404(id) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || task.deletedAt) throw notFound('TASK_NOT_FOUND', '任务不存在');
  return task;
}

// ── 列表（tasks.view；按可见项目过滤）────────────────────────────────────────
tasks.get('/', requirePermission('tasks.view'), async (c) => {
  const auth = getAuth(c);
  const {
    page = 1, pageSize = 50, projectId, assigneeId, status, priority,
    taskType, applicability, applicabilityStatus, regulatoryPriority,
  } = c.req.query();

  const visible = projectVisibilityFilter(auth);
  const where = {
    deletedAt: null,
    ...(visible ? { project: visible } : {}),
  };
  if (projectId) where.projectId = projectId;
  if (assigneeId) where.assigneeId = assigneeId;
  if (status) where.status = normalizeStatus(status);
  if (priority) where.priority = normalizePriority(priority);
  if (taskType) where.taskType = taskType;
  if (applicability || applicabilityStatus) where.applicability = normalizeApplicability(applicability || applicabilityStatus);
  if (regulatoryPriority) where.regulatoryPriority = regulatoryPriority;

  const [total, list] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      skip: (Number.parseInt(page, 10) - 1) * Number.parseInt(pageSize, 10),
      take: Number.parseInt(pageSize, 10),
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      include: TASK_INCLUDE,
    }),
  ]);

  return c.json({ list, total, page: Number.parseInt(page, 10), pageSize: Number.parseInt(pageSize, 10) });
});

// ── 前置任务依赖（tasks.update + ∩ write）────────────────────────────────────
tasks.post('/:id/prerequisites', requirePermission('tasks.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const { prerequisiteId, dependencyType = 'FS' } = await c.req.json().catch(() => ({}));

  if (id === prerequisiteId) throw badRequest('VALIDATION_ERROR', '任务不能以自身为前置任务');

  const task = await loadTaskOr404(id);
  const access = await resolveProjectAccess(prisma, auth, task.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'tasks.update');
  assertProjectCapability(access, 'write', 'tasks.update');

  const prerequisite = await loadTaskOr404(prerequisiteId);
  if (prerequisite.projectId !== task.projectId) {
    throw badRequest('VALIDATION_ERROR', '前置任务必须属于同一项目');
  }
  const circular = await prisma.taskDependency.findFirst({
    where: { taskId: prerequisiteId, prerequisiteId: id },
  });
  if (circular) throw badRequest('VALIDATION_ERROR', '检测到循环依赖，无法添加');

  const dep = await prisma.taskDependency.upsert({
    where: { taskId_prerequisiteId: { taskId: id, prerequisiteId } },
    update: { dependencyType },
    create: { taskId: id, prerequisiteId, dependencyType },
  });
  return c.json({ success: true, data: dep });
});

tasks.delete('/:id/prerequisites/:prerequisiteId', requirePermission('tasks.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const prerequisiteId = c.req.param('prerequisiteId');
  const task = await loadTaskOr404(id);
  const access = await resolveProjectAccess(prisma, auth, task.projectId);
  assertProjectCapability(access, 'write', 'tasks.update');
  await prisma.taskDependency.deleteMany({ where: { taskId: id, prerequisiteId } });
  return c.json({ success: true });
});

// ── 详情（tasks.view + ∩ read）──────────────────────────────────────────────
tasks.get('/:id', requirePermission('tasks.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      ...TASK_INCLUDE,
      prerequisites: { include: { prerequisite: { select: { id: true, title: true } } } },
      dependents: { include: { task: { select: { id: true, title: true } } } },
      regulatoryDocuments: {
        include: {
          regulatoryDocument: {
            select: { id: true, dispatchNo: true, title: true, priorityLevel: true, applicability: true },
          },
        },
      },
    },
  });
  if (!task || task.deletedAt) throw notFound('TASK_NOT_FOUND', '任务不存在');

  const access = await resolveProjectAccess(prisma, auth, task.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'tasks.view');
  assertProjectCapability(access, 'read', 'tasks.view');

  return c.json({
    ...task,
    prerequisites: (task.prerequisites || []).map((p) => ({
      prerequisiteId: p.prerequisiteId,
      dependencyType: p.dependencyType,
      prerequisite: p.prerequisite,
    })),
  });
});

// ── 创建（tasks.create + ∩ write）───────────────────────────────────────────
tasks.post('/', requirePermission('tasks.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(body, [
    'projectId', 'title', 'description', 'assigneeId', 'status', 'priority',
    'taskType', 'applicability', 'applicabilityStatus', 'regulatoryPriority',
    'expectedDeliverable', 'regulatoryNotes', 'phaseId', 'dueDate', 'startDate',
    'estimatedHours', 'sortOrder', 'templateTaskId',
  ], { entityLabel: '创建任务' });

  if (!data.projectId || !data.title) throw badRequest('VALIDATION_ERROR', '项目和标题不能为空');

  const access = await resolveProjectAccess(prisma, auth, data.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'tasks.create');
  assertProjectCapability(access, 'write', 'tasks.create');

  if (data.phaseId) {
    const phase = await prisma.projectPhase.findUnique({ where: { id: data.phaseId } });
    if (!phase || phase.projectId !== data.projectId) {
      throw badRequest('VALIDATION_ERROR', 'phaseId 不属于该项目');
    }
  }

  const created = await prisma.task.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      description: data.description || null,
      assigneeId: data.assigneeId || null,
      status: normalizeStatus(data.status) || 'NOT_STARTED',
      priority: normalizePriority(data.priority) || 'MEDIUM',
      taskType: data.taskType || null,
      applicability: normalizeApplicability(data.applicability || data.applicabilityStatus) || 'REQUIRED',
      regulatoryPriority: data.regulatoryPriority || null,
      expectedDeliverable: data.expectedDeliverable || null,
      regulatoryNotes: data.regulatoryNotes || null,
      phaseId: data.phaseId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      estimatedHours: data.estimatedHours != null ? Number.parseFloat(data.estimatedHours) : null,
      sortOrder: Number.parseInt(data.sortOrder, 10) || 0,
      templateTaskId: data.templateTaskId || null,
      createdById: auth.userId,
    },
    include: TASK_INCLUDE,
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'TASK',
    entityId: created.id,
    entityLabel: created.title,
    metadata: { permissionCode: 'tasks.create', projectId: data.projectId },
  });
  return c.json(created, 201);
});

// ── 更新（tasks.update + ∩ write；定位任务 → projectId → ∩）─────────────────
tasks.put('/:id', requirePermission('tasks.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  const data = pickAllowed(raw, [
    'title', 'description', 'assigneeId', 'status', 'priority', 'taskType',
    'applicability', 'applicabilityStatus', 'regulatoryPriority', 'expectedDeliverable',
    'regulatoryNotes', 'sortOrder', 'estimatedHours', 'actualHours', 'progressPercent',
    'startDate', 'dueDate', 'phaseId', 'templateTaskId',
  ], { entityLabel: '更新任务' });

  const task = await loadTaskOr404(id);
  const access = await resolveProjectAccess(prisma, auth, task.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'tasks.update');
  assertProjectCapability(access, 'write', 'tasks.update');

  if (data.applicabilityStatus !== undefined) {
    data.applicability = normalizeApplicability(data.applicabilityStatus);
    delete data.applicabilityStatus;
  } else if (data.applicability !== undefined) {
    data.applicability = normalizeApplicability(data.applicability);
  }
  if ('status' in data) data.status = normalizeStatus(data.status);
  if ('priority' in data) data.priority = normalizePriority(data.priority);
  if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.startDate !== undefined) data.startDate = data.startDate ? new Date(data.startDate) : null;
  for (const k of ['estimatedHours', 'actualHours']) {
    if (data[k] !== undefined) data[k] = data[k] === null ? null : Number.parseFloat(data[k]);
  }
  if ('sortOrder' in data) data.sortOrder = Number.parseInt(data.sortOrder, 10) || 0;
  if (data.phaseId) {
    const phase = await prisma.projectPhase.findUnique({ where: { id: data.phaseId } });
    if (!phase || phase.projectId !== task.projectId) {
      throw badRequest('VALIDATION_ERROR', 'phaseId 不属于该项目');
    }
  }

  // 状态迁移副作用
  if (data.status === 'COMPLETED') {
    data.completedAt = new Date();
    if (data.progressPercent === undefined) data.progressPercent = 100;
  }
  if (data.status === 'IN_PROGRESS' && !task.startedAt) {
    data.startedAt = new Date();
  }

  const updated = await prisma.task.update({
    where: { id },
    data: { ...data, updatedById: auth.userId },
    include: TASK_INCLUDE,
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'TASK',
    entityId: id,
    entityLabel: task.title,
    changedFields: Object.keys(data),
    metadata: {
      permissionCode: 'tasks.update',
      ...(access.elevated ? { elevated: true, bypass: 'project_membership' } : {}),
    },
  });
  return c.json(updated);
});

// ── 状态流转（tasks.change_status + ∩ transition；Kanban 拖拽）───────────────
tasks.patch('/:id/status', requirePermission('tasks.change_status'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const status = normalizeStatus(body?.status);
  if (!status) throw badRequest('VALIDATION_ERROR', 'status 不能为空');

  const task = await loadTaskOr404(id);
  const access = await resolveProjectAccess(prisma, auth, task.projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'tasks.change_status');
  assertProjectCapability(access, 'transition', 'tasks.change_status');

  const data = { status, updatedById: auth.userId };
  if (status === 'COMPLETED') { data.completedAt = new Date(); data.progressPercent = 100; }
  if (status === 'IN_PROGRESS' && !task.startedAt) data.startedAt = new Date();

  const updated = await prisma.task.update({ where: { id }, data, include: TASK_INCLUDE });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    entityType: 'TASK',
    entityId: id,
    entityLabel: task.title,
    before: { status: task.status },
    after: { status: updated.status },
    metadata: { permissionCode: 'tasks.change_status' },
  });
  return c.json(updated);
});

// M-1：tasks.delete 为 P1 后置权限（不进首版库），端点暂不提供
tasks.delete('/:id', async (c) => {
  return c.json({ error: '任务删除属 P1 后置权限，本轮未启用', code: 'PERMISSION_NOT_AVAILABLE' }, 403);
});

// ── 看板（tasks.view + ∩ read；英文枚举分组）────────────────────────────────
tasks.get('/board/:projectId', requirePermission('tasks.view'), async (c) => {
  const auth = getAuth(c);
  const projectId = c.req.param('projectId');
  const access = await resolveProjectAccess(prisma, auth, projectId);
  await auditElevatedIfNeeded(prisma, c, access, 'tasks.view');
  assertProjectCapability(access, 'read', 'tasks.view');

  const list = await prisma.task.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: { assignee: { select: { id: true, displayName: true, avatarFileId: true } } },
  });

  const board = {
    NOT_STARTED: list.filter((t) => t.status === 'NOT_STARTED'),
    IN_PROGRESS: list.filter((t) => t.status === 'IN_PROGRESS'),
    COMPLETED: list.filter((t) => t.status === 'COMPLETED'),
    BLOCKED: list.filter((t) => t.status === 'BLOCKED'),
  };
  return c.json(board);
});

// 批量更新状态（逐任务 ∩ transition）
tasks.post('/batch/status', requirePermission('tasks.change_status'), async (c) => {
  const auth = getAuth(c);
  const { updates } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(updates)) throw badRequest('VALIDATION_ERROR', '更新数据格式错误');

  let updatedCount = 0;
  for (const { id, status } of updates) {
    // eslint-disable-next-line no-await-in-loop
    const task = await loadTaskOr404(id);
    // eslint-disable-next-line no-await-in-loop
    const access = await resolveProjectAccess(prisma, auth, task.projectId);
    assertProjectCapability(access, 'transition', 'tasks.change_status');
    const data = { status: normalizeStatus(status), updatedById: auth.userId };
    if (data.status === 'COMPLETED') { data.completedAt = new Date(); data.progressPercent = 100; }
    // eslint-disable-next-line no-await-in-loop
    await prisma.task.update({ where: { id }, data });
    updatedCount += 1;
  }
  return c.json({ success: true, updated: updatedCount });
});

export default tasks;
