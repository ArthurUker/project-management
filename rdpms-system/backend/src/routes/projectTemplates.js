import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware, adminMiddleware } from './auth.js';

const templates = new Hono();

// 需要登录
templates.use('*', authMiddleware);

// 列表
templates.get('/', async (c) => {
  const { page = 1, pageSize = 50, type, keyword } = c.req.query();
  const where = {};
  if (type) where.type = type;
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
  const { id } = c.params;
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
      type: body.type || null,
      content: body.content || null,
      createdBy: userId,
    }
  });

  return c.json(tpl, 201);
});

// 更新
templates.put('/:id', adminMiddleware, async (c) => {
  const { id } = c.params;
  const body = await c.req.json();
  delete body.code;
  delete body.createdAt;

  const tpl = await prisma.projectTemplate.update({ where: { id }, data: body });
  return c.json(tpl);
});

// 删除
templates.delete('/:id', adminMiddleware, async (c) => {
  const { id } = c.params;
  await prisma.projectTemplate.delete({ where: { id } });
  return c.json({ success: true });
});

export default templates;
