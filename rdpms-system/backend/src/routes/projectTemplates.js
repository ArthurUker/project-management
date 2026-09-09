import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/project-templates —— 项目模板（W10 PG baseline 迁移）。
 *
 * 迁移要点：
 *   template.content JSON 大字段 → 已删除；结构化为 TemplatePhase/TemplateTask/TemplateRole 行；
 *   自由 JSON 兜底落 config（仅无固定结构配置）；
 *   type → typeLabel；createdBy → createdById；status 'active' → ACTIVE（TemplateStatus 枚举）；
 *   projectRoleDefinition → templateRole（code 必填，permissions 为 text[]）。
 *   FE 兼容：/:id 与 /:id/preview 输出归一化 phases 形状（id/name/order/tasks/subPhases）。
 */
const templates = new Hono();

templates.use('*', authMiddleware);

/** 将模板行结构归一化为 FE 兼容形状 */
function toCompatPhases(tpl) {
  return (tpl.phases ?? []).map((p, idx) => ({
    id: p.id,
    key: p.code,
    name: p.name,
    order: p.sortOrder ?? idx + 1,
    totalDays: p.plannedDurationDays ?? 0,
    isMilestone: p.isMilestone,
    enabled: true,
    subPhases: [],
    nextPhaseIds: [],
    tasks: (p.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description || null,
      taskType: t.taskType,
      applicability: t.applicability.toLowerCase(),
      regulatoryPriority: t.regulatoryPriority,
      estimatedDays: t.estimatedHours ? Math.ceil(t.estimatedHours / 8) : 3,
      enabled: true,
    })),
  }));
}

const TEMPLATE_INCLUDE = {
  creator: { select: { id: true, displayName: true } },
  parent: { select: { id: true, name: true, code: true } },
  phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } },
  roles: { orderBy: { sortOrder: 'asc' } },
};

// ── 列表 ─────────────────────────────────────────────────────────────────────
templates.get('/', requirePermission('project_templates.view'), async (c) => {
  const { page = 1, pageSize = 50, category, parentId, keyword, status } = c.req.query();
  const where = { deletedAt: null };
  if (category) where.category = category;
  if (parentId === 'null') where.parentId = null;
  else if (parentId) where.parentId = parentId;
  if (status) where.status = String(status).toUpperCase();
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
      { description: { contains: keyword } },
    ];
  }

  const [total, list] = await Promise.all([
    prisma.projectTemplate.count({ where }),
    prisma.projectTemplate.findMany({
      where,
      skip: (Number.parseInt(page, 10) - 1) * Number.parseInt(pageSize, 10),
      take: Number.parseInt(pageSize, 10),
      orderBy: [{ isMaster: 'desc' }, { createdAt: 'asc' }],
      include: {
        creator: { select: { id: true, displayName: true } },
        parent: { select: { id: true, name: true, code: true } },
        phases: { select: { _count: { select: { tasks: true } } } },
        _count: { select: { children: true, projects: true, phases: true } },
      },
    }),
  ]);

  const listWithStats = list.map((tpl) => ({
    ...tpl,
    phaseCount: tpl._count.phases,
    taskCount: (tpl.phases ?? []).reduce((sum, ph) => sum + (ph?._count?.tasks ?? 0), 0),
  }));
  return c.json({ list: listWithStats, total, page: Number.parseInt(page, 10), pageSize: Number.parseInt(pageSize, 10) });
});

// ── 详情 ─────────────────────────────────────────────────────────────────────
templates.get('/:id', requirePermission('project_templates.view'), async (c) => {
  const id = c.req.param('id');
  const tpl = await prisma.projectTemplate.findUnique({
    where: { id },
    include: {
      ...TEMPLATE_INCLUDE,
      children: { include: { creator: { select: { id: true, displayName: true } } } },
    },
  });
  if (!tpl || tpl.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模版不存在');
  return c.json({ ...tpl, phases: toCompatPhases(tpl) });
});

// ── 创建 ─────────────────────────────────────────────────────────────────────
templates.post('/', requirePermission('project_templates.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  if (!body?.name) throw badRequest('VALIDATION_ERROR', '模版名称不能为空');

  const code = body.code || `TPL-${Date.now().toString(36).toUpperCase()}`;
  const exists = await prisma.projectTemplate.findUnique({ where: { code }, select: { id: true } });
  if (exists) throw badRequest('VALIDATION_ERROR', '模版编号已存在');

  const created = await prisma.projectTemplate.create({
    data: {
      code,
      name: body.name,
      description: body.description || null,
      category: body.category || null,
      typeLabel: body.typeLabel || body.type || null,
      parentId: body.parentId || null,
      isMaster: body.isMaster || false,
      status: body.status ? String(body.status).toUpperCase() : 'ACTIVE',
      config: body.config ?? body.content ?? null,
      createdById: auth.userId,
    },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PROJECT_TEMPLATE',
    entityId: created.id,
    entityLabel: created.name,
    metadata: { permissionCode: 'project_templates.create' },
  });
  return c.json(created, 201);
});

// ── 更新 ─────────────────────────────────────────────────────────────────────
templates.put('/:id', requirePermission('project_templates.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  const data = pickAllowed(raw, ['name', 'description', 'category', 'typeLabel', 'parentId', 'isMaster', 'status', 'config'], { entityLabel: '更新项目模板', allowEmpty: true });
  if ('status' in data) data.status = String(data.status).toUpperCase();
  if (raw?.content !== undefined && data.config === undefined) data.config = raw.content;
  data.updatedById = auth.userId;

  const before = await prisma.projectTemplate.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模版不存在');

  const tpl = await prisma.projectTemplate.update({ where: { id }, data });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'PROJECT_TEMPLATE',
    entityId: id,
    entityLabel: before.name,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'project_templates.update' },
  });
  return c.json(tpl);
});

templates.patch('/:id', requirePermission('project_templates.update'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const data = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) data.status = String(body.status).toUpperCase();
  if (body.typeLabel !== undefined) data.typeLabel = body.typeLabel;
  if (body.type !== undefined) data.typeLabel = body.type;
  if (body.config !== undefined || body.content !== undefined) {
    data.config = body.config ?? body.content;
  }
  const tpl = await prisma.projectTemplate.update({ where: { id }, data });
  return c.json(tpl);
});

// ── 删除（project_templates.delete 为 P0；软删 + 引用检查）───────────────────
templates.delete('/:id', requirePermission('project_templates.delete'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');

  const childCount = await prisma.projectTemplate.count({ where: { parentId: id, deletedAt: null } });
  if (childCount > 0) {
    throw badRequest('VALIDATION_ERROR', `无法删除：该模版下存在 ${childCount} 个子模版，请先删除所有子模版`);
  }
  const projectCount = await prisma.project.count({ where: { templateId: id, deletedAt: null } });
  if (projectCount > 0) {
    throw badRequest('VALIDATION_ERROR', `无法删除：已有 ${projectCount} 个项目套用该模版，请使用「停用」替代删除`);
  }

  const tpl = await prisma.projectTemplate.findUnique({ where: { id } });
  if (!tpl || tpl.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模版不存在');

  await prisma.projectTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'PROJECT_TEMPLATE',
    entityId: id,
    entityLabel: tpl.name,
    metadata: { permissionCode: 'project_templates.delete' },
  });
  return c.json({ success: true });
});

// ── 复制（project_templates.copy，P1 批次二解冻；roles/phases/tasks 深拷贝）──
templates.post('/:id/copy', requirePermission('project_templates.copy'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const src = await prisma.projectTemplate.findUnique({
    where: { id },
    include: {
      roles: { orderBy: { sortOrder: 'asc' } },
      phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!src || src.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模版不存在');

  const code = `TPL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.projectTemplate.create({
      data: {
        code,
        name: `${src.name}（副本）`,
        description: src.description ?? null,
        category: src.category ?? null,
        typeLabel: src.typeLabel ?? null,
        parentId: src.parentId ?? null,
        isMaster: false, // 副本永远不是母版
        status: 'DRAFT',
        createdById: auth.userId,
      },
    });

    if (src.roles.length) {
      await tx.templateRole.createMany({
        data: src.roles.map((r) => ({
          templateId: created.id,
          code: r.code,
          name: r.name,
          description: r.description ?? null,
          permissions: r.permissions,
          sortOrder: r.sortOrder ?? 0,
        })),
      });
    }

    for (const ph of src.phases) {
      // eslint-disable-next-line no-await-in-loop
      const newPhase = await tx.templatePhase.create({
        data: {
          templateId: created.id,
          code: ph.code,
          name: ph.name,
          description: ph.description ?? null,
          sortOrder: ph.sortOrder,
          plannedStartOffsetDays: ph.plannedStartOffsetDays ?? null,
          plannedDurationDays: ph.plannedDurationDays ?? null,
          isMilestone: ph.isMilestone,
        },
      });
      if (ph.tasks.length) {
        await tx.templateTask.createMany({
          data: ph.tasks.map((t) => ({
            templatePhaseId: newPhase.id,
            code: t.code ?? null,
            title: t.title,
            description: t.description ?? null,
            taskType: t.taskType,
            applicability: t.applicability,
            regulatoryPriority: t.regulatoryPriority,
            expectedDeliverable: t.expectedDeliverable ?? null,
            regulatoryNotes: t.regulatoryNotes ?? null,
            estimatedHours: t.estimatedHours ?? null,
            assigneeRoleCode: t.assigneeRoleCode ?? null,
            sortOrder: t.sortOrder,
          })),
        });
      }
    }
    return created;
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PROJECT_TEMPLATE',
    entityId: copy.id,
    entityLabel: copy.name,
    after: { copyOf: src.id, sourceName: src.name },
    metadata: { permissionCode: 'project_templates.copy' },
  });
  return c.json({ success: true, template: copy }, 201);
});

// ── 预览 ─────────────────────────────────────────────────────────────────────
templates.get('/:id/preview', requirePermission('project_templates.view'), async (c) => {
  const id = c.req.param('id');
  const tpl = await prisma.projectTemplate.findUnique({
    where: { id },
    include: { phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!tpl || tpl.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模版不存在');

  const phases = toCompatPhases(tpl);
  const taskCount = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  return c.json({
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    category: tpl.category,
    typeLabel: tpl.typeLabel,
    phases,
    milestones: [],
    phaseCount: phases.length,
    taskCount,
  });
});

// ── 应用预览（前端创建项目时预览生成结果）────────────────────────────────────
templates.post('/:id/apply', requirePermission('project_templates.view'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const tpl = await prisma.projectTemplate.findUnique({
    where: { id },
    include: { phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!tpl || tpl.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模版不存在');

  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  let dayOffset = 0;
  const phases = toCompatPhases(tpl);
  const tasks = [];
  for (const phase of phases) {
    for (const t of phase.tasks) {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + dayOffset + (t.estimatedDays || 3));
      tasks.push({
        title: t.title,
        taskType: t.taskType,
        applicability: t.applicability,
        regulatoryPriority: t.regulatoryPriority,
        priority: 'MEDIUM',
        status: 'NOT_STARTED',
        phaseKey: phase.key,
        phaseId: phase.key,
        phaseOrder: phase.order,
        estimatedDays: t.estimatedDays || 3,
        dueDate: dueDate.toISOString(),
      });
      dayOffset += t.estimatedDays || 3;
    }
  }
  return c.json({
    payload: {
      tasks,
      milestones: [],
      templateId: tpl.id,
      defaults: tpl.config?.defaults ?? {},
    },
  });
});

// ── 模板角色（templateRole；code 必填）───────────────────────────────────────
templates.get('/:templateId/roles', requirePermission('project_templates.view'), async (c) => {
  const { templateId } = c.req.param();
  const roles = await prisma.templateRole.findMany({
    where: { templateId },
    orderBy: { sortOrder: 'asc' },
  });
  return c.json({ roles });
});

templates.post('/:templateId/roles', requirePermission('project_templates.update'), async (c) => {
  const { templateId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  if (!body.code) throw badRequest('VALIDATION_ERROR', '角色 code 必填');
  const role = await prisma.templateRole.create({
    data: {
      templateId,
      code: body.code,
      name: body.name,
      description: body.description || null,
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
      sortOrder: body.sortOrder || 0,
    },
  });
  return c.json({ role }, 201);
});

templates.put('/:templateId/roles/:roleId', requirePermission('project_templates.update'), async (c) => {
  const { roleId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const role = await prisma.templateRole.update({
    where: { id: roleId },
    data: {
      name: body.name,
      description: body.description,
      permissions: Array.isArray(body.permissions) ? body.permissions : undefined,
      sortOrder: body.sortOrder,
    },
  });
  return c.json({ role });
});

templates.delete('/:templateId/roles/:roleId', requirePermission('project_templates.update'), async (c) => {
  const { roleId } = c.req.param();
  await prisma.templateRole.delete({ where: { id: roleId } });
  return c.json({ success: true });
});

templates.post('/:templateId/roles/batch', requirePermission('project_templates.update'), async (c) => {
  const { templateId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const { roles } = body;

  await prisma.templateRole.deleteMany({ where: { templateId } });
  const createdRoles = [];
  for (const [index, role] of (roles || []).entries()) {
    // eslint-disable-next-line no-await-in-loop
    const row = await prisma.templateRole.create({
      data: {
        templateId,
        code: role.code || `role_${index + 1}`,
        name: role.name,
        description: role.description || null,
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
        sortOrder: role.sortOrder ?? index,
      },
    });
    createdRoles.push(row);
  }
  return c.json({ roles: createdRoles }, 201);
});

export default templates;
