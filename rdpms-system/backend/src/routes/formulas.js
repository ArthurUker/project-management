import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const formulas = new Hono();
formulas.use('*', authMiddleware);

// GET /api/formulas - 列表 支持 ?type=&pH=&reagentId=
formulas.get('/', async (c) => {
  try {
    const type = c.req.query('type');
    const reagentId = c.req.query('reagentId');
    const pH = c.req.query('pH');

    const where = {};
    if (type) where.type = type;
    if (pH) where.pH = Number(pH);

    if (reagentId) {
      // 通过 join 查询包含该试剂的配方
      const comps = await prisma.formulaComponent.findMany({ where: { reagentId }, include: { formula: true } });
      const formulasList = comps.map((c) => c.formula);
      return c.json({ success: true, list: formulasList });
    }

    const list = await prisma.reagentFormula.findMany({ where, orderBy: { updatedAt: 'desc' } });
    return c.json({ success: true, list });
  } catch (err) {
    console.error('获取配方列表失败', err);
    return c.json({ error: '获取配方列表失败' }, 500);
  }
});

// GET /api/formulas/:id 详情（含完整组分）
formulas.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const formula = await prisma.reagentFormula.findUnique({
      where: { id },
      include: {
        components: { include: { reagent: true, reagentMaterial: true }, orderBy: { sortOrder: 'asc' } },
        creator: { select: { id: true, name: true } }
      }
    });
    if (!formula) return c.json({ error: '配方不存在' }, 404);
    return c.json({ success: true, formula });
  } catch (err) {
    console.error('获取配方详情失败', err);
    return c.json({ error: '获取配方详情失败' }, 500);
  }
});

// POST /api/formulas 新建（同时创建 FormulaComponent）
formulas.post('/', async (c) => {
  try {
    const data = await c.req.json();
    const userId = c.get('userId');

    // 生成唯一 code（使用事务式自增以避免并发冲突）
    const code = data.code || await prisma.$transaction(async (tx) => {
      const last = await tx.reagentFormula.findFirst({
        where: { type: data.type },
        orderBy: { code: 'desc' }
      })
      const nextNum = last
        ? parseInt(last.code.split('-')[1]) + 1
        : 1
      return `${data.type}-${String(nextNum).padStart(2, '0')}`
    });

    const created = await prisma.reagentFormula.create({
      data: {
        code,
        name: data.name,
        type: data.type,
        pH: data.pH,
        status: data.status || '草稿',
        projectId: data.projectId || null,
        procedure: data.procedure,
        notes: data.notes,
        createdBy: userId,
        components: {
          create: (data.components || []).map((comp) => ({
            reagentId: comp.reagentId || null,
            reagentMaterialId: comp.reagentMaterialId || null,
            componentName: comp.componentName || null,
            concentration: comp.concentration,
            unit: comp.unit || 'M',
            notes: comp.notes || '',
            sortOrder: comp.sortOrder || 0,
          }))
        }
      },
      include: { components: { include: { reagent: true } } }
    });

    return c.json({ success: true, formula: created });
  } catch (err) {
    console.error('创建配方失败', err);
    return c.json({ error: '创建配方失败' }, 500);
  }
});

// PUT /api/formulas/:id 更新（支持增删改组分）
formulas.put('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const data = await c.req.json();

    // 更新主表
    const updated = await prisma.reagentFormula.update({
      where: { id },
      data: {
        name: data.name,
        pH: data.pH,
        status: data.status,
        procedure: data.procedure,
        notes: data.notes,
        projectId: data.projectId || null,
        // 不直接处理 components 这里先简单策略：删除原组件并重建
      }
    });

    if (data.components) {
      await prisma.formulaComponent.deleteMany({ where: { formulaId: id } });
      const comps = data.components.map((comp) => ({
        id: undefined,
        formulaId: id,
        reagentId: comp.reagentId || null,
        reagentMaterialId: comp.reagentMaterialId || null,
        componentName: comp.componentName || null,
        concentration: comp.concentration,
        unit: comp.unit || 'M',
        notes: comp.notes || '',
        sortOrder: comp.sortOrder || 0,
      }));
      for (const comp of comps) {
        await prisma.formulaComponent.create({ data: comp });
      }
    }

    const result = await prisma.reagentFormula.findUnique({ where: { id }, include: { components: { include: { reagent: true } } } });

    return c.json({ success: true, formula: result });
  } catch (err) {
    console.error('更新配方失败', err);
    return c.json({ error: '更新配方失败' }, 500);
  }
});

// DELETE /api/formulas/:id
formulas.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await prisma.reagentFormula.delete({ where: { id } });
    return c.json({ success: true });
  } catch (err) {
    console.error('删除配方失败', err);
    return c.json({ error: '删除配方失败' }, 500);
  }
});

// POST /api/formulas/:id/duplicate 复制配方（生成新编号）
formulas.post('/:id/duplicate', async (c) => {
  const id = c.req.param('id');
  try {
    const orig = await prisma.reagentFormula.findUnique({ where: { id }, include: { components: true } });
    if (!orig) return c.json({ error: '配方不存在' }, 404);

    // 生成新 code: type-<seq>（事务式自增）
    const newCode = await prisma.$transaction(async (tx) => {
      const last = await tx.reagentFormula.findFirst({
        where: { type: orig.type },
        orderBy: { code: 'desc' }
      });
      const nextNum = last ? parseInt(last.code.split('-')[1]) + 1 : 1;
      return `${orig.type}-${String(nextNum).padStart(2, '0')}`;
    });
    const created = await prisma.reagentFormula.create({
      data: {
        code: newCode,
        name: orig.name ? `${orig.name} (复制)` : `${orig.code} (复制)`,
        type: orig.type,
        pH: orig.pH,
        status: '草稿',
        projectId: orig.projectId,
        procedure: orig.procedure,
        notes: orig.notes,
        createdBy: c.get('userId'),
        components: {
          create: orig.components.map((comp) => ({
            reagentId: comp.reagentId,
            reagentMaterialId: comp.reagentMaterialId || null,
            componentName: comp.componentName || null,
            concentration: comp.concentration,
            unit: comp.unit,
            notes: comp.notes,
            sortOrder: comp.sortOrder
          }))
        }
      },
      include: { components: true }
    });

    return c.json({ success: true, formula: created });
  } catch (err) {
    console.error('复制配方失败', err);
    return c.json({ error: '复制配方失败' }, 500);
  }
});

export default formulas;