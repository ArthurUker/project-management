import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
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
  // v1.1（2026-10-10）：实验室台账扩展分类
  'PRIMER_PROBE', 'MAGNETIC_BEAD', 'PLASMID', 'STRAIN', 'MEDIA', 'CONTROL', 'KIT',
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
  // v1.1 别名
  '引物探针': 'PRIMER_PROBE', '引物': 'PRIMER_PROBE', '探针': 'PRIMER_PROBE',
  '磁珠': 'MAGNETIC_BEAD',
  '质粒': 'PLASMID', '假病毒': 'PLASMID',
  '菌株': 'STRAIN', '菌': 'STRAIN',
  '培养基': 'MEDIA',
  '对照品': 'CONTROL', '质控品': 'CONTROL',
  '试剂盒': 'KIT', '预混液': 'KIT',
};

function toCategory(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? (MATERIAL_CATEGORIES.has(String(value ?? '').toUpperCase()) ? String(value).toUpperCase() : 'OTHER');
}

/**
 * ConcentrationUnit 枚举（defaultStockUnit）：下拉框空值/非法值一律落 null。
 * 实机事故（2026-09-10）：前端表单不选浓度单位时提交 ""，直接进 Prisma 触发
 * `Invalid value for argument defaultStockUnit. Expected ConcentrationUnit` → 500。
 */
const CONCENTRATION_UNITS = new Set(['M', 'MM', 'UM', 'NM', 'NG_PER_UL', 'MG_PER_ML', 'PERCENT', 'X', 'OTHER']);
/** DocumentStatus 枚举（status） */
const DOCUMENT_STATUSES = new Set(['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']);

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
      { externalCode: { contains: keyword } },
      { projectLabel: { contains: keyword } },
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
    'storageCondition', 'externalCode', 'projectLabel', 'notes', 'status',
  ], { entityLabel: '试剂原料', allowEmpty: false });

  if ('mw' in data) { data.molecularWeight = toFloatOrNull(data.mw); delete data.mw; }
  if ('molecularWeight' in data) data.molecularWeight = toFloatOrNull(data.molecularWeight);
  if ('purity' in data) data.purity = toFloatOrNull(data.purity);
  if ('density' in data) data.density = toFloatOrNull(data.density);
  if ('defaultStockConc' in data) data.defaultStockConc = toFloatOrNull(data.defaultStockConc);
  if ('category' in data) data.category = toCategory(data.category);
  if ('status' in data) {
    const s = String(data.status ?? '').trim().toUpperCase();
    data.status = DOCUMENT_STATUSES.has(s) ? s : 'ACTIVE';
  }
  // 枚举列净化：defaultStockUnit 为非空列（@default(M)）——空串/非法值必须"删字段"让默认值兜底，
  // 既不能直接透传空串（Prisma enum 校验 500），也不能置 null（非空约束 500）
  if ('defaultStockUnit' in data) {
    const u = String(data.defaultStockUnit ?? '').trim().toUpperCase();
    if (CONCENTRATION_UNITS.has(u)) data.defaultStockUnit = u;
    else delete data.defaultStockUnit;
  }
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
    // v1.1：统一走发号器（RM-00001），替代旧的 base36 时间戳编号
    data.code = await nextCode(prisma, 'MATERIAL', { periodKey: '', fallbackPrefix: 'RM-', padding: 5 });
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

// POST /batch-import —— 批量导入（reagent_materials.import，2026-10-10 解冻）。
// 逐行校验、逐行发号；同名已存在（未删除）按重复行标记失败，不自动合并。
materials.post('/batch-import', requirePermission('reagent_materials.import'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) throw badRequest('VALIDATION_ERROR', 'rows 不能为空');
  if (rows.length > 200) throw badRequest('VALIDATION_ERROR', '单批最多 200 条');

  const success = [];
  const failed = [];
  for (const [index, row] of rows.entries()) {
    try {
      const data = normalizeMaterialData(row, { forCreate: true });
      if (!data.commonName) throw new Error('commonName 必填');
      const name = String(data.commonName).trim();
      // eslint-disable-next-line no-await-in-loop
      const dup = await prisma.reagentMaterial.findFirst({
        where: { commonName: name, deletedAt: null },
        select: { id: true, code: true },
      });
      if (dup) throw new Error(`同名物料已存在: ${dup.code}`);
      // eslint-disable-next-line no-await-in-loop
      const code = await nextCode(prisma, 'MATERIAL', { periodKey: '', fallbackPrefix: 'RM-', padding: 5 });
      // eslint-disable-next-line no-await-in-loop
      const created = await prisma.reagentMaterial.create({
        data: { ...data, code, createdById: auth.userId },
        select: { id: true, code: true, commonName: true },
      });
      success.push({ id: created.id, code: created.code, name: created.commonName });
    } catch (err) {
      failed.push({ index, name: row?.commonName || null, reason: err?.message || '导入失败' });
    }
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'REAGENT_MATERIAL',
    entityLabel: `批量导入试剂原料 ${success.length}/${rows.length}`,
    after: { total: rows.length, created: success.length, failed: failed.length },
    metadata: { permissionCode: 'reagent_materials.import', batch: true },
  });
  return c.json({ success, failed }, 201);
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
