import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const reagents = new Hono();

// 所有路由需要认证
reagents.use('*', authMiddleware);

// GET /api/reagents - 列表，支持 ?category=&keyword=
reagents.get('/', async (c) => {
  try {
    const category = c.req.query('category');
    const keyword = c.req.query('keyword');

    const where = {};
    if (category) where.category = category;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { fullName: { contains: keyword } },
        { casNumber: { contains: keyword } },
      ];
    }

    const list = await prisma.reagent.findMany({ where, orderBy: { name: 'asc' } });
    return c.json({ success: true, list });
  } catch (err) {
    console.error('获取试剂列表失败', err);
    return c.json({ error: '获取试剂列表失败' }, 500);
  }
});

// GET /api/reagents/:id 详情（含被哪些配方使用）
reagents.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const reagent = await prisma.reagent.findUnique({ where: { id } });
    if (!reagent) return c.json({ error: '试剂不存在' }, 404);

    const usedIn = await prisma.formulaComponent.findMany({
      where: { reagentId: id },
      include: { formula: { select: { id: true, code: true, name: true, type: true } } }
    });

    return c.json({ success: true, reagent, usedIn });
  } catch (err) {
    console.error('获取试剂详情失败', err);
    return c.json({ error: '获取试剂详情失败' }, 500);
  }
});

// POST /api/reagents 新建
reagents.post('/', async (c) => {
  try {
    const data = await c.req.json();
    const created = await prisma.reagent.create({ data });
    return c.json({ success: true, reagent: created });
  } catch (err) {
    console.error('创建试剂失败', err);
    return c.json({ error: '创建试剂失败' }, 500);
  }
});

// PUT /api/reagents/:id 更新
reagents.put('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const data = await c.req.json();
    const updated = await prisma.reagent.update({ where: { id }, data });
    return c.json({ success: true, reagent: updated });
  } catch (err) {
    console.error('更新试剂失败', err);
    return c.json({ error: '更新试剂失败' }, 500);
  }
});

// DELETE /api/reagents/:id 删除（检查 FormulaComponent 引用）
reagents.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const refCount = await prisma.formulaComponent.count({ where: { reagentId: id } });
    if (refCount > 0) {
      return c.json({ error: '该试剂被配方引用，无法删除' }, 400);
    }
    await prisma.reagent.delete({ where: { id } });
    return c.json({ success: true });
  } catch (err) {
    console.error('删除试剂失败', err);
    return c.json({ error: '删除试剂失败' }, 500);
  }
});

// GET /api/reagents/:id/formulas - 该试剂被引用的配方列表
reagents.get('/:id/formulas', async (c) => {
  const id = c.req.param('id');
  try {
    const comps = await prisma.formulaComponent.findMany({
      where: { reagentId: id },
      include: { formula: true }
    });
    const formulas = comps.map((c) => c.formula);
    return c.json({ success: true, list: formulas });
  } catch (err) {
    console.error('获取引用配方失败', err);
    return c.json({ error: '获取引用配方失败' }, 500);
  }
});

export default reagents;