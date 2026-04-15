import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const templates = new Hono();
templates.use('*', authMiddleware);

// GET /api/task-templates - 列表 支持 ?keyword=&category=
templates.get('/', async (c) => {
  try {
    const keyword = c.req.query('keyword');
    const category = c.req.query('category');
    const where = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { description: { contains: keyword } },
        { tags: { contains: keyword } },
        { category: { contains: keyword } },
      ];
    }
    if (category) where.category = category;

    const list = await prisma.taskTemplate.findMany({ where, orderBy: { name: 'asc' } });

    // enrich with usageCount (projects referencing this template)
    const enriched = await Promise.all(list.map(async (t) => ({
      ...t,
      usageCount: await prisma.project.count({ where: { templateId: t.id } })
    })));

    return c.json({ success: true, list: enriched });
  } catch (err) {
    console.error('获取任务模板列表失败', err);
    return c.json({ error: '获取任务模板列表失败' }, 500);
  }
});

// GET /api/task-templates/:id
templates.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const t = await prisma.taskTemplate.findUnique({ where: { id } });
    if (!t) return c.json({ error: '模板不存在' }, 404);
    const steps = await prisma.taskTemplateStep.findMany({ where: { templateId: id }, orderBy: { order: 'asc' } });
    const usageCount = await prisma.project.count({ where: { templateId: id } });
    return c.json({ success: true, template: { ...t, steps, usageCount } });
  } catch (err) {
    console.error('获取任务模板详情失败', err);
    return c.json({ error: '获取任务模板详情失败' }, 500);
  }
});

// POST /api/task-templates
templates.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const steps = body.steps || [];
    const data = {
      name: body.name,
      category: body.category,
      description: body.description,
      estimatedDays: body.estimatedDays || 0,
      priority: body.priority || 'medium',
      tags: Array.isArray(body.tags) ? (body.tags || []).join(',') : (body.tags || null),
    };

    const created = await prisma.taskTemplate.create({
      data: {
        ...data,
        steps: { create: steps.map((s, idx) => ({
          order: s.order ?? (s.order ?? idx+1),
          title: s.title,
          description: s.description || null,
          estimatedHours: s.estimatedHours || null,
          assigneeRole: s.assigneeRole || null,
          checklist: Array.isArray(s.checklist) ? s.checklist.join('|') : (s.checklist || null),
        })) }
      }
    });

    return c.json({ success: true, template: created });
  } catch (err) {
    console.error('创建任务模板失败', err);
    return c.json({ error: '创建任务模板失败' }, 500);
  }
});

// PUT /api/task-templates/:id
templates.put('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    const steps = body.steps || [];

    await prisma.$transaction(async (tx) => {
      await tx.taskTemplate.update({ where: { id }, data: {
        name: body.name,
        category: body.category,
        description: body.description,
        estimatedDays: body.estimatedDays || 0,
        priority: body.priority || 'medium',
        tags: Array.isArray(body.tags) ? body.tags.join(',') : body.tags || null,
      }});

      // replace steps: delete then create
      await tx.taskTemplateStep.deleteMany({ where: { templateId: id } });
      for (const s of steps) {
        await tx.taskTemplateStep.create({ data: {
          templateId: id,
          order: s.order,
          title: s.title,
          description: s.description || null,
          estimatedHours: s.estimatedHours || null,
          assigneeRole: s.assigneeRole || null,
          checklist: Array.isArray(s.checklist) ? s.checklist.join('|') : (s.checklist || null),
        }});
      }
    });

    const updated = await prisma.taskTemplate.findUnique({ where: { id } });
    return c.json({ success: true, template: updated });
  } catch (err) {
    console.error('更新任务模板失败', err);
    return c.json({ error: '更新任务模板失败' }, 500);
  }
});

// DELETE /api/task-templates/:id
templates.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const usage = await prisma.project.count({ where: { templateId: id } });
    if (usage > 0) return c.json({ error: 'has_references', usageCount: usage }, 400);

    await prisma.$transaction(async (tx) => {
      await tx.taskTemplateStep.deleteMany({ where: { templateId: id } });
      await tx.taskTemplate.delete({ where: { id } });
    });
    return c.json({ success: true });
  } catch (err) {
    console.error('删除任务模板失败', err);
    return c.json({ error: '删除任务模板失败' }, 500);
  }
});

// POST /api/task-templates/bulk-delete
templates.post('/bulk-delete', async (c) => {
  try {
    const body = await c.req.json();
    const ids = body.ids || [];
    const force = !!body.force;

    const refs = [];
    for (const id of ids) {
      const count = await prisma.project.count({ where: { templateId: id } });
      if (count > 0) refs.push({ id, count });
    }

    if (refs.length > 0 && !force) return c.json({ error: 'has_references', details: refs }, 400);

    await prisma.$transaction(async (tx) => {
      if (refs.length > 0 && force) {
        // nothing to nullify currently; keeping for future
      }
      await tx.taskTemplateStep.deleteMany({ where: { templateId: { in: ids } } });
      await tx.taskTemplate.deleteMany({ where: { id: { in: ids } } });
    });

    return c.json({ success: true });
  } catch (err) {
    console.error('批量删除任务模板失败', err);
    return c.json({ error: '批量删除任务模板失败' }, 500);
  }
});

export default templates;
