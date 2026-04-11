import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware, adminMiddleware } from './auth.js';

const templates = new Hono();

templates.use('*', authMiddleware);

// 解析模版 content JSON
function parseContent(tpl) {
  if (!tpl.content) return { phases: [], milestones: [] };
  try {
    return typeof tpl.content === 'string' ? JSON.parse(tpl.content) : tpl.content;
  } catch {
    return { phases: [], milestones: [] };
  }
}

// 获取模版列表
templates.get('/', async (c) => {
  const { page = 1, pageSize = 50, category, parentId, keyword, status } = c.req.query();
  const where = {};
  if (category) where.category = category;
  if (parentId === 'null') where.parentId = null;
  else if (parentId) where.parentId = parentId;
  if (status) where.status = status;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
      { description: { contains: keyword } }
    ];
  }

  const [total, list] = await Promise.all([
    prisma.projectTemplate.count({ where }),
    prisma.projectTemplate.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize),
      orderBy: [{ isMaster: 'desc' }, { createdAt: 'asc' }],
      include: {
        creator: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { children: true, projects: true } }
      }
    })
  ]);

  // 计算每个模版的阶段数和任务数
  const listWithStats = list.map(tpl => {
    const content = parseContent(tpl);
    const phases = (content.phases || []).filter(p => p.enabled !== false);
    const taskCount = phases.reduce((sum, p) => sum + (p.tasks || []).filter(t => t.enabled !== false).length, 0);
    return { ...tpl, phaseCount: phases.length, taskCount };
  });

  return c.json({ list: listWithStats, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 获取单个模版（含子模版列表）
templates.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tpl = await prisma.projectTemplate.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, code: true } },
      children: {
        include: { creator: { select: { id: true, name: true } } }
      }
    }
  });
  if (!tpl) return c.json({ error: '模版不存在' }, 404);
  return c.json(tpl);
});

// 创建模版（管理员）
templates.post('/', adminMiddleware, async (c) => {
  const body = await c.req.json();
  const userId = c.get('userId');

  if (!body.name) return c.json({ error: '模版名称不能为空' }, 400);

  const code = body.code || `TPL-${Date.now()}`;

  const tpl = await prisma.projectTemplate.create({
    data: {
      code,
      name: body.name,
      description: body.description || '',
      category: body.category || null,
      type: body.type || null,
      parentId: body.parentId || null,
      isMaster: body.isMaster || false,
      content: body.content ? (typeof body.content === 'string' ? body.content : JSON.stringify(body.content)) : null,
      status: body.status || 'active',
      createdBy: userId,
    }
  });

  return c.json(tpl, 201);
});

// 更新模版（管理员）
templates.put('/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  delete body.code;
  delete body.createdAt;
  delete body.createdBy;

  if (body.content && typeof body.content !== 'string') {
    body.content = JSON.stringify(body.content);
  }

  const tpl = await prisma.projectTemplate.update({ where: { id }, data: body });
  return c.json(tpl);
});

// 部分更新（仅更新 content / name / description / status 等）
templates.patch('/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const updateData = {};
  if (body.content !== undefined) {
    updateData.content = typeof body.content === 'string' ? body.content : JSON.stringify(body.content);
  }
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.type !== undefined) updateData.type = body.type;

  const tpl = await prisma.projectTemplate.update({ where: { id }, data: updateData });
  return c.json(tpl);
});

// 删除模版（管理员）
templates.delete('/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id');

  // 检查是否有子模版
  const childCount = await prisma.projectTemplate.count({
    where: { parentId: id }
  });
  if (childCount > 0) {
    return c.json({
      success: false,
      error: `无法删除：该模版下存在 ${childCount} 个子模版，请先删除所有子模版后再操作`
    }, 400);
  }

  // 检查是否有项目正在使用该模版
  const projectCount = await prisma.project.count({
    where: { templateId: id }
  });
  if (projectCount > 0) {
    return c.json({
      success: false,
      error: `无法删除：已有 ${projectCount} 个项目套用了该模版，删除后这些项目的模版关联将断开，请确认后使用「停用」功能替代删除`
    }, 400);
  }

  await prisma.projectTemplate.delete({ where: { id } });
  return c.json({ success: true });
});

// 复制模版
templates.post('/:id/copy', adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const tpl = await prisma.projectTemplate.findUnique({ where: { id } });
  if (!tpl) return c.json({ error: '模版不存在' }, 404);

  const newCode = `TPL-COPY-${Date.now()}`;
  const copy = await prisma.projectTemplate.create({
    data: {
      code: newCode,
      name: `${tpl.name}（副本）`,
      description: tpl.description || '',
      category: tpl.category,
      type: tpl.type,
      parentId: tpl.parentId,
      isMaster: false,
      content: tpl.content,
      status: 'active',
      createdBy: userId,
    }
  });
  return c.json(copy, 201);
});

// 预览模版阶段结构（用于新建项目选择）
templates.get('/:id/preview', async (c) => {
  const id = c.req.param('id');
  const tpl = await prisma.projectTemplate.findUnique({ where: { id } });
  if (!tpl) return c.json({ error: '模版不存在' }, 404);

  const content = parseContent(tpl);
  const phases = (content.phases || []).filter(p => p.enabled !== false);
  const milestones = (content.milestones || []);
  const taskCount = phases.reduce((sum, p) => sum + (p.tasks || []).filter(t => t.enabled !== false).length, 0);

  return c.json({
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    category: tpl.category,
    phases: phases.map(p => ({
      id: p.id,
      name: p.name,
      order: p.order,
      type: p.type || 'normal',
      taskCount: (p.tasks || []).filter(t => t.enabled !== false).length,
    })),
    milestones,
    phaseCount: phases.length,
    taskCount,
  });
});

// 应用模版：生成任务和里程碑数据（前端用于创建项目时预览）
templates.post('/:id/apply', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const tpl = await prisma.projectTemplate.findUnique({ where: { id } });
  if (!tpl) return c.json({ error: '模版不存在' }, 404);

  const content = parseContent(tpl);
  const startDate = body.startDate ? new Date(body.startDate) : new Date();

  // 只处理 enabled 的阶段和任务
  const phases = (content.phases || []).filter(p => p.enabled !== false);

  const tasks = [];
  let dayOffset = 0;
  for (const phase of phases) {
    const phaseTasks = (phase.tasks || []).filter(t => t.enabled !== false);
    for (const t of phaseTasks) {
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + dayOffset + (t.estimatedDays || 3));
      tasks.push({
        title: t.title,
        priority: t.priority || '中',
        status: '待开始',
        phase: phase.name,
        phaseId: phase.id,
        phaseOrder: phase.order,
        estimatedDays: t.estimatedDays || 3,
        dueDate: dueDate.toISOString(),
      });
      dayOffset += (t.estimatedDays || 3);
    }
  }

  // 里程碑按 offsetDays 计算
  const milestones = (content.milestones || []).map(m => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (m.offsetDays || 0));
    return { name: m.name, date: date.toISOString(), status: '待完成' };
  });

  return c.json({
    payload: {
      tasks,
      milestones,
      templateId: tpl.id,
      defaults: content.defaults || {},
    }
  });
});

export default templates;
