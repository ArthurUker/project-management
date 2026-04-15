import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const materials = new Hono();
materials.use('*', authMiddleware);

// GET /api/reagent-materials - 列表，支持 ?keyword=
materials.get('/', async (c) => {
  try {
    const keyword = c.req.query('keyword');
    const where = {};
    if (keyword) {
      where.OR = [
        { commonName: { contains: keyword } },
        { chineseName: { contains: keyword } },
        { englishName: { contains: keyword } },
        { casNumber: { contains: keyword } },
      ];
    }
    const list = await prisma.reagentMaterial.findMany({ where, orderBy: { commonName: 'asc' } });
    return c.json({ success: true, list });
  } catch (err) {
    console.error('获取试剂原料列表失败', err);
    return c.json({ error: '获取试剂原料列表失败' }, 500);
  }
});

// GET /api/reagent-materials/:id
materials.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const mat = await prisma.reagentMaterial.findUnique({ where: { id } });
    if (!mat) return c.json({ error: '试剂原料不存在' }, 404);
    return c.json({ success: true, material: mat });
  } catch (err) {
    console.error('获取试剂原料详情失败', err);
    return c.json({ error: '获取试剂原料详情失败' }, 500);
  }
});

// POST /api/reagent-materials
materials.post('/', async (c) => {
  try {
    const data = await c.req.json();
    const created = await prisma.reagentMaterial.create({ data });
    return c.json({ success: true, material: created });
  } catch (err) {
    console.error('创建试剂原料失败', err);
    return c.json({ error: '创建试剂原料失败' }, 500);
  }
});

// PUT /api/reagent-materials/:id
materials.put('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const data = await c.req.json();
    const updated = await prisma.reagentMaterial.update({ where: { id }, data });
    return c.json({ success: true, material: updated });
  } catch (err) {
    console.error('更新试剂原料失败', err);
    return c.json({ error: '更新试剂原料失败' }, 500);
  }
});

// DELETE /api/reagent-materials/:id（检查引用）
materials.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const refCount = await prisma.formulaComponent.count({ where: { reagentMaterialId: id } });
    if (refCount > 0) return c.json({ error: '该原料被配方引用，无法删除' }, 400);
    await prisma.reagentMaterial.delete({ where: { id } });
    return c.json({ success: true });
  } catch (err) {
    console.error('删除试剂原料失败', err);
    return c.json({ error: '删除试剂原料失败' }, 500);
  }
});

// POST /api/reagent-materials/bulk-delete
materials.post('/bulk-delete', async (c) => {
  try {
    const body = await c.req.json();
    const ids = body.ids || [];
    const force = !!body.force;

    // check references
    const refs = [];
    for (const id of ids) {
      const count = await prisma.formulaComponent.count({ where: { reagentMaterialId: id } });
      if (count > 0) refs.push({ id, count });
    }

    if (refs.length > 0 && !force) {
      return c.json({ error: 'has_references', details: refs }, 400);
    }

    // start transaction: if force, nullify references first
    await prisma.$transaction(async (tx) => {
      if (refs.length > 0 && force) {
        await tx.formulaComponent.updateMany({ where: { reagentMaterialId: { in: ids } }, data: { reagentMaterialId: null } });
      }
      await tx.reagentMaterial.deleteMany({ where: { id: { in: ids } } });
    });

    return c.json({ success: true });
  } catch (err) {
    console.error('批量删除试剂原料失败', err);
    return c.json({ error: '批量删除试剂原料失败' }, 500);
  }
});

export default materials;