import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/reagent-materials —— 试剂原料（W10 PG baseline 迁移）。
 *
 * 迁移要点：
 *   category 自由文本（'未分类'/逗号串）→ MaterialCategory 枚举（未识别值 → OTHER）；
 *   mw → molecularWeight；code @unique 必填（缺省自动生成）；
 *   status 'active' → ACTIVE（DocumentStatus 枚举）；
 *   FormulaComponent.reagentMaterialId → materialId；
 *   DELETE / bulk-delete 为 P1（reagent_materials.delete 不进首版库）→ 403。
 */
const materials = new Hono();

materials.use('*', authMiddleware);

const MATERIAL_CATEGORIES = new Set([
  'BUFFER', 'SALT', 'ENZYME', 'DYE', 'NUCLEIC_ACID', 'SOLVENT', 'ACID_BASE', 'SURFACTANT', 'OTHER',
]);
const CATEGORY_ALIASES = {
  '缓冲液': 'BUFFER', buffer: 'BUFFER',
  '盐类': 'SALT', salt: 'SALT',
  '酶': 'ENZYME', enzyme: 'ENZYME',
  '染料': 'DYE', dye: 'DYE',
  '核酸': 'NUCLEIC_ACID', 'nucleic acid': 'NUCLEIC_ACID',
  '溶剂': 'SOLVENT', solvent: 'SOLVENT',
  '酸碱': 'ACID_BASE',
  '表面活性剂': 'SURFACTANT', surfactant: 'SURFACTANT',
  '未分类': 'OTHER', other: 'OTHER',
};

function toCategory(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? (MATERIAL_CATEGORIES.has(String(value ?? '').toUpperCase()) ? String(value).toUpperCase() : 'OTHER');
}

function toFloatOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number.parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

const SORT_FIELD_MAP = {
  commonName: 'commonName', chineseName: 'chineseName', englishName: 'englishName',
  category: 'category', casNumber: 'casNumber', molecularFormula: 'molecularFormula',
  mw: 'molecularWeight', molecularWeight: 'molecularWeight', state: 'state',
  defaultStockConc: 'defaultStockConc', supplier: 'supplier', createdAt: 'createdAt', updatedAt: 'updatedAt',
};

// GET / —— 列表
materials.get('/', requirePermission('reagent_materials.view'), async (c) => {
  const keyword = c.req.query('keyword');
  const category = c.req.query('category');
  const state = c.req.query('state');
  const sortBy = c.req.query('sortBy');
  const sortOrder = c.req.query('sortOrder') === 'desc' ? 'desc' : 'asc';

  const where = { deletedAt: null };
  if (keyword) {
    where.OR = [
      { commonName: { contains: keyword } },
      { chineseName: { contains: keyword } },
      { englishName: { contains: keyword } },
      { casNumber: { contains: keyword } },
      { code: { contains: keyword } },
    ];
  }
  const categoryValues = String(category || '').split(',').map((s) => s.trim()).filter((s) => s && s !== 'all');
  if (categoryValues.length > 0) {
    const enums = categoryValues.map(toCategory);
    where.category = enums.length === 1 ? enums[0] : { in: enums };
  }
  if (state && state !== 'all') where.state = state;

  const orderByField = SORT_FIELD_MAP[sortBy] || 'commonName';
  const list = await prisma.reagentMaterial.findMany({ where, orderBy: { [orderByField]: sortOrder } });
  return c.json({ success: true, list });
});

// GET /:id
materials.get('/:id', requirePermission('reagent_materials.view'), async (c) => {
  const mat = await prisma.reagentMaterial.findUnique({ where: { id: c.req.param('id') } });
  if (!mat || mat.deletedAt) throw notFound('MATERIAL_NOT_FOUND', '试剂原料不存在');
  return c.json({ success: true, material: mat });
});

function normalizeMaterialData(raw, { forCreate }) {
  const data = pickAllowed(raw, [
    'code', 'commonName', 'chineseName', 'englishName', 'category', 'casNumber',
    'molecularFormula', 'molecularWeight', 'mw', 'purity', 'density', 'state',
    'defaultStockConc', 'defaultStockUnit', 'hazardLevel', 'supplier',
    'storageCondition', 'notes', 'status',
  ], { entityLabel: '试剂原料', allowEmpty: false });

  if ('mw' in data) { data.molecularWeight = toFloatOrNull(data.mw); delete data.mw; }
  if ('molecularWeight' in data) data.molecularWeight = toFloatOrNull(data.molecularWeight);
  if ('purity' in data) data.purity = toFloatOrNull(data.purity);
  if ('density' in data) data.density = toFloatOrNull(data.density);
  if ('defaultStockConc' in data) data.defaultStockConc = toFloatOrNull(data.defaultStockConc);
  if ('category' in data) data.category = toCategory(data.category);
  if ('status' in data) data.status = String(data.status).toUpperCase();
  // MaterialState 枚举（SOLID/LIQUID/SOLUTION/GAS）：兼容旧客户端小写，非法值丢弃走默认
  if ('state' in data) {
    const st = String(data.state).toUpperCase();
    if (['SOLID', 'LIQUID', 'SOLUTION', 'GAS'].includes(st)) data.state = st;
    else delete data.state;
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

// POST /
materials.post('/', requirePermission('reagent_materials.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  const data = normalizeMaterialData(raw, { forCreate: true });
  if (!data.commonName) throw badRequest('VALIDATION_ERROR', 'commonName 必填');
  if (!data.code) {
    data.code = `RM-${Date.now().toString(36).toUpperCase()}`;
  }
  const exists = await prisma.reagentMaterial.findUnique({ where: { code: data.code }, select: { id: true } });
  if (exists) throw badRequest('VALIDATION_ERROR', '原料编号已存在');

  const created = await prisma.reagentMaterial.create({ data: { ...data, createdById: auth.userId } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'REAGENT_MATERIAL',
    entityId: created.id,
    entityLabel: created.commonName,
    metadata: { permissionCode: 'reagent_materials.create' },
  });
  return c.json({ success: true, material: created }, 201);
});

// PUT /:id
materials.put('/:id', requirePermission('reagent_materials.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  const data = normalizeMaterialData(raw, { forCreate: false });
  if ('code' in data) delete data.code; // 编号不可改

  const before = await prisma.reagentMaterial.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('MATERIAL_NOT_FOUND', '试剂原料不存在');

  const updated = await prisma.reagentMaterial.update({ where: { id }, data: { ...data, updatedById: auth.userId } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'REAGENT_MATERIAL',
    entityId: id,
    entityLabel: updated.commonName,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'reagent_materials.update' },
  });
  return c.json({ success: true, material: updated });
});

// ── 删除（reagent_materials.delete，P1 批次二解冻；软删+审计）────────────────
materials.delete('/:id', requirePermission('reagent_materials.delete'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const material = await prisma.reagentMaterial.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, commonName: true },
  });
  if (!material) throw notFound('MATERIAL_NOT_FOUND', '试剂原料不存在');

  await prisma.reagentMaterial.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'REAGENT_MATERIAL',
    entityId: id,
    entityLabel: material.code || material.commonName,
    before: { code: material.code, commonName: material.commonName },
    metadata: { permissionCode: 'reagent_materials.delete', softDelete: true },
  });
  return c.json({ success: true, id, softDeleted: true });
});

// POST /bulk-delete —— 批量软删（reagent_materials.delete）
materials.post('/bulk-delete', requirePermission('reagent_materials.delete'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string' && x) : [];
  if (ids.length === 0) throw badRequest('VALIDATION_ERROR', 'ids 不能为空');
  if (ids.length > 200) throw badRequest('VALIDATION_ERROR', '单批最多 200 条');

  const targets = await prisma.reagentMaterial.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, code: true },
  });
  if (targets.length === 0) throw notFound('MATERIAL_NOT_FOUND', '试剂原料不存在或已删除');

  await prisma.reagentMaterial.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { deletedAt: new Date() },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'REAGENT_MATERIAL',
    entityId: targets[0].id,
    entityLabel: `批量删除 ${targets.length} 项原料`,
    metadata: {
      permissionCode: 'reagent_materials.delete',
      softDelete: true,
      batch: true,
      ids: targets.map((t) => t.id),
    },
  });
  return c.json({ success: true, deleted: targets.length });
});

export default materials;
