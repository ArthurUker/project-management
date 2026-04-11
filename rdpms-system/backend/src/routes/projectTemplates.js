import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware, adminMiddleware } from './auth.js';

const templates = new Hono();

// 需要登录
templates.use('*', authMiddleware);

// 列表
templates.get('/', async (c) => {
  const { page = 1, pageSize = 50, category, keyword } = c.req.query();
  const where = {};
  if (category) where.category = category;
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
      orderBy: { createdAt: 'desc' },
      include: { creator: { select: { id: true, name: true } } }
    })
  ]);

  return c.json({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 获取单个模版
templates.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tpl = await prisma.projectTemplate.findUnique({ where: { id }, include: { creator: { select: { id: true, name: true } } } });
  if (!tpl) return c.json({ error: '模版不存在' }, 404);
  return c.json(tpl);
});

// 创建（管理员或项目经理）
templates.post('/', adminMiddleware, async (c) => {
  const body = await c.req.json();
  const userId = c.get('userId');

  if (!body.name) return c.json({ error: '模版名称不能为空' }, 400);

  const code = body.code || `TEMPLATE-${Date.now()}`;

  const tpl = await prisma.projectTemplate.create({
    data: {
      code,
      name: body.name,
      description: body.description || '',
      category: body.category || null,
      parentId: body.parentId || null,
      isMaster: body.isMaster || false,
      content: body.content || null,
      createdBy: userId,
    }
  });

  return c.json(tpl, 201);
});

// 更新
templates.put('/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  delete body.code;
  delete body.createdAt;

  const tpl = await prisma.projectTemplate.update({ where: { id }, data: body });
  return c.json(tpl);
});

// 部分更新（仅更新content）
templates.patch('/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const updateData = {};
  if (body.content !== undefined) updateData.content = body.content;
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;

  const tpl = await prisma.projectTemplate.update({ where: { id }, data: updateData });
  return c.json(tpl);
});

// 删除
templates.delete('/:id', adminMiddleware, async (c) => {
  const id = c.req.param('id');
  await prisma.projectTemplate.delete({ where: { id } });
  return c.json({ success: true });
});

// 应用模版：生成项目草稿（不直接写入项目表）
templates.post('/:id/apply', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const tpl = await prisma.projectTemplate.findUnique({ where: { id } });
  if (!tpl) return c.json({ error: '模版不存在' }, 404);
  let content = {};
  try { content = tpl.content ? JSON.parse(tpl.content) : {}; } catch (e) { content = {}; }

  const tasks = (content.tasks || (content.phases ? content.phases.flatMap(p => p.tasks || []) : []));
  const milestones = content.milestones || [];

  const payload = {
    code: body.code || `PRJ-${Date.now()}`,
    name: body.name || `${tpl.name} 项目草稿`,
    type: tpl.category || 'template',
    startDate: body.startDate || new Date().toISOString(),
    tasks,
    milestones,
    defaults: content.defaults || {}
  };

  return c.json({ payload });
});

export default templates;
