import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const samples = new Hono();
samples.use('*', authMiddleware);

// GET /api/samples - 列表，支持 ?keyword=&projectId=
samples.get('/', async (c) => {
  try {
    const keyword = c.req.query('keyword');
    const projectId = c.req.query('projectId');
    const where = {};
    if (projectId) where.projectId = projectId;
    if (keyword) {
      where.OR = [
        { sampleCode: { contains: keyword } },
        { sampleName: { contains: keyword } },
        { sampleType: { contains: keyword } },
        { species: { contains: keyword } },
        { tissue: { contains: keyword } },
      ];
    }
    const list = await prisma.sampleMaterial.findMany({
      where,
      orderBy: { sampleCode: 'asc' },
      include: { project: { select: { id: true, name: true, code: true } } },
    });
    return c.json({ success: true, list });
  } catch (err) {
    console.error('获取样本列表失败', err);
    return c.json({ error: '获取样本列表失败' }, 500);
  }
});

// GET /api/samples/:id
samples.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const s = await prisma.sampleMaterial.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true, code: true } } },
    });
    if (!s) return c.json({ error: '样本不存在' }, 404);
    return c.json({ success: true, sample: s });
  } catch (err) {
    return c.json({ error: '获取样本失败' }, 500);
  }
});

// POST /api/samples
samples.post('/', async (c) => {
  try {
    const raw = await c.req.json();
    const { id: _id, createdAt, updatedAt, project, ...rest } = raw;
    // 空字符串的可选字段转 null
    const emptyToNull = ['species', 'tissue', 'concentration', 'volume', 'collectionDate', 'expiryDate', 'supplier', 'notes', 'projectId'];
    emptyToNull.forEach(k => { if (rest[k] === '' || rest[k] === undefined) rest[k] = null; });
    // 自动生成编号
    if (!rest.sampleCode) {
      const count = await prisma.sampleMaterial.count();
      rest.sampleCode = `SMP-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
    }
    const created = await prisma.sampleMaterial.create({ data: rest });
    return c.json({ success: true, sample: created });
  } catch (err) {
    console.error('创建样本失败', err);
    return c.json({ error: err.message || '创建样本失败' }, 500);
  }
});

// PUT /api/samples/:id
samples.put('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const raw = await c.req.json();
    const { id: _id, createdAt, updatedAt, project, ...rest } = raw;
    const emptyToNull = ['species', 'tissue', 'concentration', 'volume', 'collectionDate', 'expiryDate', 'supplier', 'notes', 'projectId'];
    emptyToNull.forEach(k => { if (rest[k] === '' || rest[k] === undefined) rest[k] = null; });
    Object.keys(rest).forEach(k => rest[k] === undefined && delete rest[k]);
    const updated = await prisma.sampleMaterial.update({ where: { id }, data: rest });
    return c.json({ success: true, sample: updated });
  } catch (err) {
    console.error('更新样本失败', err);
    return c.json({ error: err.message || '更新样本失败' }, 500);
  }
});

// DELETE /api/samples/:id
samples.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await prisma.sampleMaterial.delete({ where: { id } });
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: '删除样本失败' }, 500);
  }
});

export default samples;
