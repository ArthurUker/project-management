import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/task-templates —— 任务流程模板（W10 PG baseline 迁移）。
 *
 * 迁移要点：
 *   code @unique 必填（缺省自动生成）；tags 逗号串 → text[]；
 *   priority 'medium' → TaskPriority 枚举（LOW/MEDIUM/HIGH/URGENT）；
 *   TaskTemplateStep: order→sortOrder、assigneeRole→assigneeRoleCode、checklist 串→text[]。
 */
const templates = new Hono();

templates.use('*', authMiddleware);

const PRIORITY_MAP = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', urgent: 'URGENT', '低': 'LOW', '中': 'MEDIUM', '高': 'HIGH', '紧急': 'URGENT' };
const normalizePriority = (v) => PRIORITY_MAP[String(v ?? '').toLowerCase()] ?? PRIORITY_MAP[v] ?? 'MEDIUM';

function normalizeTags(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(/[,，;；|]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function normalizeSteps(steps) {
  return (steps ?? []).map((s, idx) => ({
    sortOrder: s.sortOrder ?? s.order ?? idx + 1,
    title: s.title,
    description: s.description || null,
    estimatedHours: s.estimatedHours != null && s.estimatedHours !== '' ? Number.parseFloat(s.estimatedHours) : null,
    assigneeRoleCode: s.assigneeRoleCode || s.assigneeRole || null,
    checklist: normalizeTags(s.checklist),
  }));
}

// GET / —— 列表
templates.get('/', requirePermission('task_templates.view'), async (c) => {
  const keyword = c.req.query('keyword');
  const category = c.req.query('category');
  const where = { deletedAt: null };
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { description: { contains: keyword } },
      { tags: { has: keyword } },
      { category: { contains: keyword } },
    ];
  }
  if (category) where.category = category;

  const list = await prisma.taskTemplate.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
  const enriched = await Promise.all(list.map(async (t) => ({
    ...t,
    usageCount: await prisma.project.count({ where: { templateId: t.id, deletedAt: null } }),
  })));
  return c.json({ success: true, list: enriched });
});

// GET /:id
templates.get('/:id', requirePermission('task_templates.view'), async (c) => {
  const id = c.req.param('id');
  const t = await prisma.taskTemplate.findUnique({
    where: { id },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!t || t.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模板不存在');
  const usageCount = await prisma.project.count({ where: { templateId: id, deletedAt: null } });
  return c.json({ success: true, template: { ...t, usageCount } });
});

// POST /
templates.post('/', requirePermission('task_templates.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(body, ['name', 'category', 'description', 'estimatedDays', 'priority', 'tags', 'code'], { entityLabel: '创建任务模板' });
  if (!data.name) throw badRequest('VALIDATION_ERROR', '模板名称不能为空');

  const created = await prisma.taskTemplate.create({
    data: {
      code: data.code || `TT-${Date.now().toString(36).toUpperCase()}`,
      name: data.name,
      category: data.category || null,
      description: data.description || null,
      estimatedDays: Number.parseInt(data.estimatedDays, 10) || 0,
      priority: normalizePriority(data.priority),
      tags: normalizeTags(data.tags),
      createdById: auth.userId,
      steps: {
        create: normalizeSteps(body?.steps).filter((s) => s.title).map((s) => ({
          sortOrder: s.sortOrder,
          title: s.title,
          description: s.description,
          estimatedHours: s.estimatedHours,
          assigneeRoleCode: s.assigneeRoleCode,
          checklist: s.checklist,
        })),
      },
    },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'TASK_TEMPLATE',
    entityId: created.id,
    entityLabel: created.name,
    metadata: { permissionCode: 'task_templates.create' },
  });
  return c.json({ success: true, template: created }, 201);
});

// PUT /:id
templates.put('/:id', requirePermission('task_templates.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(body, ['name', 'category', 'description', 'estimatedDays', 'priority', 'tags'], { entityLabel: '更新任务模板', allowEmpty: true });
  if ('estimatedDays' in data) data.estimatedDays = Number.parseInt(data.estimatedDays, 10) || 0;
  if ('priority' in data) data.priority = normalizePriority(data.priority);
  if ('tags' in data) data.tags = normalizeTags(data.tags);
  data.updatedById = auth.userId;

  const before = await prisma.taskTemplate.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模板不存在');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.taskTemplate.update({ where: { id }, data });
    if (body?.steps !== undefined) {
      await tx.taskTemplateStep.deleteMany({ where: { templateId: id } });
      const steps = normalizeSteps(body.steps).filter((s) => s.title);
      if (steps.length > 0) {
        await tx.taskTemplateStep.createMany({
          data: steps.map((s) => ({ ...s, templateId: id })),
        });
      }
    }
    return tx.taskTemplate.findUnique({ where: { id }, include: { steps: { orderBy: { sortOrder: 'asc' } } } });
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'TASK_TEMPLATE',
    entityId: id,
    entityLabel: updated.name,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'task_templates.update' },
  });
  return c.json({ success: true, template: updated });
});

// DELETE /:id（task_templates.delete 为 P0）
templates.delete('/:id', requirePermission('task_templates.delete'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const usage = await prisma.project.count({ where: { templateId: id, deletedAt: null } });
  if (usage > 0) throw badRequest('VALIDATION_ERROR', `模板仍被 ${usage} 个项目引用，无法删除`);

  const t = await prisma.taskTemplate.findUnique({ where: { id } });
  if (!t || t.deletedAt) throw notFound('TEMPLATE_NOT_FOUND', '模板不存在');

  await prisma.taskTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'TASK_TEMPLATE',
    entityId: id,
    entityLabel: t.name,
    metadata: { permissionCode: 'task_templates.delete' },
  });
  return c.json({ success: true });
});

// POST /bulk-delete —— 批量软删（Tencent 复刻；任一被项目引用则整批拒绝，语义与单删一致）
templates.post('/bulk-delete', requirePermission('task_templates.delete'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string' && x) : [];
  if (ids.length === 0) throw badRequest('VALIDATION_ERROR', 'ids 不能为空');
  if (ids.length > 200) throw badRequest('VALIDATION_ERROR', '单批最多 200 条');

  const targets = await prisma.taskTemplate.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, name: true },
  });
  if (targets.length === 0) throw notFound('TEMPLATE_NOT_FOUND', '模板不存在或已删除');

  const referenced = [];
  for (const t of targets) {
    // eslint-disable-next-line no-await-in-loop
    const usage = await prisma.project.count({ where: { templateId: t.id, deletedAt: null } });
    if (usage > 0) referenced.push({ id: t.id, name: t.name, usage });
  }
  if (referenced.length > 0) {
    throw badRequest(
      'VALIDATION_ERROR',
      `以下模板仍被项目引用，无法删除：${referenced.map((r) => `${r.name}(${r.usage})`).join('、')}`,
    );
  }

  await prisma.taskTemplate.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { deletedAt: new Date() },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'TASK_TEMPLATE',
    entityId: targets[0].id,
    entityLabel: `批量删除 ${targets.length} 个模板`,
    metadata: { permissionCode: 'task_templates.delete', batch: true, ids: targets.map((t) => t.id) },
  });
  return c.json({ success: true, deleted: targets.length });
});

// POST /seed —— 一键预置标准模板（task_templates.create）
templates.post('/seed', requirePermission('task_templates.create'), async (c) => {
  const auth = getAuth(c);
  const { SEED_TEMPLATES } = await import('../data/taskTemplateSeed.js');
  let createdCount = 0;
  let skipped = 0;

  for (const [idx, tpl] of SEED_TEMPLATES.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await prisma.taskTemplate.findFirst({ where: { name: tpl.name, deletedAt: null } });
    if (exists) { skipped += 1; continue; }

    // eslint-disable-next-line no-await-in-loop
    await prisma.taskTemplate.create({
      data: {
        code: `TT-${String(idx + 1).padStart(3, '0')}-${Date.now().toString(36).toUpperCase()}`,
        name: tpl.name,
        category: tpl.category || null,
        description: tpl.description || null,
        estimatedDays: tpl.estimatedDays || 0,
        priority: normalizePriority(tpl.priority),
        tags: normalizeTags(tpl.tags),
        createdById: auth.userId,
        steps: {
          create: (tpl.steps || []).map((s, i) => ({
            sortOrder: i + 1,
            title: s.title,
            description: s.description || null,
            estimatedHours: s.estimatedHours != null ? Number.parseFloat(s.estimatedHours) : null,
            assigneeRoleCode: null,
            checklist: [],
          })),
        },
      },
    });
    createdCount += 1;
  }
  return c.json({ success: true, created: createdCount, skipped });
});

export default templates;
