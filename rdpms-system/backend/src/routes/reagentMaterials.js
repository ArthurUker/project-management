import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const materials = new Hono();
materials.use('*', authMiddleware);

const normalizeCategory = (value) => {
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item || '').trim()).filter(Boolean);
    return cleaned.length > 0 ? Array.from(new Set(cleaned)).join(',') : '未分类';
  }
  if (value == null) return '未分类';
  const text = String(value).trim();
  if (!text) return '未分类';
  const parts = text
    .split(/[，,;；|、/\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length > 0 ? Array.from(new Set(parts)).join(',') : '未分类';
};

// GET /api/reagent-materials - 列表，支持 ?keyword=
materials.get('/', async (c) => {
  try {
    const keyword = c.req.query('keyword');
    const category = c.req.query('category');
    const state = c.req.query('state');
    const sortBy = c.req.query('sortBy');
    const sortOrder = c.req.query('sortOrder') === 'desc' ? 'desc' : 'asc';
    const where = {};
    if (keyword) {
      where.OR = [
        { commonName: { contains: keyword } },
        { chineseName: { contains: keyword } },
        { englishName: { contains: keyword } },
        { casNumber: { contains: keyword } },
      ];
    }
    const categoryValues = String(category || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item && item !== 'all');
    if (categoryValues.length > 0) {
      where.AND = where.AND || [];
      where.AND.push({
        OR: categoryValues.map((item) => ({ category: { contains: item } })),
      });
    }
    if (state && state !== 'all') {
      where.state = state;
    }

    const allowedSortFields = new Set([
      'commonName',
      'chineseName',
      'englishName',
      'category',
      'casNumber',
      'molecularFormula',
      'mw',
      'state',
      'defaultStockConc',
      'supplier',
      'createdAt',
      'updatedAt',
    ]);
    const orderBy = allowedSortFields.has(sortBy) ? { [sortBy]: sortOrder } : { commonName: 'asc' };

    const list = await prisma.reagentMaterial.findMany({ where, orderBy });
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
    const raw = await c.req.json();
    const { id: _id, createdAt, updatedAt, components, ...rest } = raw;

    const toFloat = (v) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? undefined : n; };
    const toFloatOrNull = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v)); return isNaN(n) ? null : n; };

    const data = { ...rest };
    if ('mw' in data) data.mw = toFloat(data.mw) ?? 0;
    if ('purity' in data) { const p = toFloat(data.purity); data.purity = p !== undefined ? p : 98; }
    if ('density' in data) data.density = toFloatOrNull(data.density);
    if ('defaultStockConc' in data) data.defaultStockConc = toFloatOrNull(data.defaultStockConc);
    if ('category' in data) data.category = normalizeCategory(data.category);
    if (!('category' in data)) data.category = '未分类';

    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

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
    const raw = await c.req.json();
    // 去除不可更新字段（Prisma 不允许在 data 中包含主键或关联列表）
    const { id: _id, createdAt, updatedAt, components, ...rest } = raw;

    // FormData 传来的数值都是字符串，需要强转；空字符串的可选字段转为 null
    const toFloat = (v) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? undefined : n; };
    const toFloatOrNull = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v)); return isNaN(n) ? null : n; };

    const data = { ...rest };
    if ('mw' in data) data.mw = toFloat(data.mw);
    if ('purity' in data) { const p = toFloat(data.purity); data.purity = p !== undefined ? p : 98; }
    if ('density' in data) data.density = toFloatOrNull(data.density);
    if ('defaultStockConc' in data) data.defaultStockConc = toFloatOrNull(data.defaultStockConc);
    if ('category' in data) data.category = normalizeCategory(data.category);

    // 移除 undefined 值，避免 Prisma 类型校验失败
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

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