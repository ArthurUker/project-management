import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
import { notFound } from '../kernel/http.js';

/**
 * /api/formulas（M-1 P0）：
 *   GET    /api/formulas           formulas.view
 *   GET    /api/formulas/:id       formulas.view
 *   POST   /api/formulas           formulas.create
 *   PUT    /api/formulas/:id       formulas.update
 *   POST   /api/formulas/:id/duplicate  formulas.create
 *   DELETE /api/formulas/:id —— P1 冻结桩（formulas.delete，解冻时改软删+审计）
 *
 * 新 schema：FormulaComponent 仅含 materialId（ReagentMaterial），无 reagentId。
 */
const formulas = new Hono();

formulas.use('*', authMiddleware);

const FORMULA_FIELDS = ['name', 'type', 'pH', 'status', 'projectId', 'procedure', 'notes'];
const COMPONENT_FIELDS = ['materialId', 'customName', 'concentration', 'unit', 'concentrationText', 'notes', 'sortOrder'];

function cleanComponents(components) {
  return (components ?? [])
    .filter((c) => c && typeof c === 'object')
    .map((c, idx) => {
      const out = {};
      for (const k of COMPONENT_FIELDS) if (c[k] !== undefined) out[k] = c[k];
      if (out.unit === undefined) out.unit = 'M';
      if (out.sortOrder === undefined) out.sortOrder = idx;
      return out;
    });
}

// GET / —— 列表（?type=&materialId=）
formulas.get('/', requirePermission('formulas.view'), async (c) => {
  const { type, materialId } = c.req.query();
  const where = {};
  if (type) where.type = type;
  if (materialId) {
    where.components = { some: { materialId } };
  }
  const list = await prisma.reagentFormula.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { components: { include: { material: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return c.json({ success: true, list });
});

// GET /:id —— 详情
formulas.get('/:id', requirePermission('formulas.view'), async (c) => {
  const formula = await prisma.reagentFormula.findUnique({
    where: { id: c.req.param('id') },
    include: {
      components: { include: { material: true }, orderBy: { sortOrder: 'asc' } },
      creator: { select: { id: true, displayName: true } },
    },
  });
  if (!formula) return c.json({ error: '配方不存在' }, 404);
  return c.json({ success: true, formula });
});

// POST / —— 新建（编号走 CodeSequence 原子发号）
formulas.post('/', requirePermission('formulas.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  if (raw && typeof raw === 'object' && 'code' in raw) {
    return c.json({ error: 'code 由服务端统一发号，禁止客户端提交' }, 400);
  }
  const data = {};
  for (const k of FORMULA_FIELDS) if (raw?.[k] !== undefined) data[k] = raw[k];
  if (!data.name) return c.json({ error: '配方名称不能为空' }, 400);
  if (!data.type) return c.json({ error: '配方类型不能为空' }, 400);

  const code = await nextCode(prisma, 'FORMULA', { fallbackPrefix: 'FRM-', padding: 3 });
  const created = await prisma.reagentFormula.create({
    data: {
      code,
      name: data.name,
      type: data.type,
      pH: data.pH ?? null,
      status: data.status ?? 'DRAFT',
      projectId: data.projectId || null,
      procedure: data.procedure ?? null,
      notes: data.notes ?? null,
      createdById: auth.userId,
      components: { create: cleanComponents(raw?.components) },
    },
    include: { components: { include: { material: true } } },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'FORMULA',
    entityId: created.id,
    entityLabel: created.code,
    metadata: { permissionCode: 'formulas.create' },
  });
  return c.json({ success: true, formula: created });
});

// PUT /:id —— 更新（组分整体重建）
formulas.put('/:id', requirePermission('formulas.update'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);

  const before = await prisma.reagentFormula.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('FORMULA_NOT_FOUND', '配方不存在');

  const data = {};
  for (const k of FORMULA_FIELDS) if (raw?.[k] !== undefined) data[k] = raw[k];
  data.updatedById = auth.userId;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.reagentFormula.update({ where: { id }, data });
    if (raw?.components !== undefined) {
      await tx.formulaComponent.deleteMany({ where: { formulaId: id } });
      if (raw.components.length) {
        await tx.formulaComponent.createMany({
          data: cleanComponents(raw.components).map((comp) => ({ ...comp, formulaId: id })),
        });
      }
    }
    return tx.reagentFormula.findUnique({
      where: { id },
      include: { components: { include: { material: true }, orderBy: { sortOrder: 'asc' } } },
    });
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'FORMULA',
    entityId: id,
    entityLabel: before.code,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'formulas.update' },
  });
  return c.json({ success: true, formula: updated });
});

// DELETE /:id —— M-1：formulas.delete 为 P1 后置权限，冻结桩（Tencent 为硬删，解冻时改软删+审计）
formulas.delete('/:id', async (c) => {
  return c.json({ error: '配方删除属 P1 后置权限，本轮未启用', code: 'PERMISSION_NOT_AVAILABLE' }, 403);
});

// POST /:id/duplicate —— 复制（formulas.create）
formulas.post('/:id/duplicate', requirePermission('formulas.create'), async (c) => {
  const auth = getAuth(c);
  const orig = await prisma.reagentFormula.findUnique({
    where: { id: c.req.param('id') },
    include: { components: true },
  });
  if (!orig) return c.json({ error: '配方不存在' }, 404);

  const code = await nextCode(prisma, 'FORMULA', { fallbackPrefix: 'FRM-', padding: 3 });
  const created = await prisma.reagentFormula.create({
    data: {
      code,
      name: orig.name ? `${orig.name}（复制）` : `${orig.code}（复制）`,
      type: orig.type,
      pH: orig.pH,
      status: 'DRAFT',
      projectId: orig.projectId,
      procedure: orig.procedure,
      notes: orig.notes,
      createdById: auth.userId,
      components: {
        create: orig.components.map((comp) => ({
          materialId: comp.materialId,
          customName: comp.customName,
          concentration: comp.concentration,
          unit: comp.unit,
          concentrationText: comp.concentrationText,
          notes: comp.notes,
          sortOrder: comp.sortOrder,
        })),
      },
    },
    include: { components: true },
  });
  return c.json({ success: true, formula: created });
});

export default formulas;
