import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, notFound, parsePaging, paged } from '../kernel/http.js';

/**
 * /api/equipment —— 设备/仪器台账（v1.1，2026-10-10）。
 *
 * 说明：
 *   - 资产编码（code）为业务编码（如 DQ022003003），由调用方提供；
 *     因 GLOBAL_FORBIDDEN_FIELDS 禁止请求体直接携带 `code`，API 层字段名为 `assetCode`，
 *     入库时映射到 model 的 `code` 列（唯一）。
 *   - 权限：equipment.view / equipment.create / equipment.update / equipment.delete。
 */
const equipment = new Hono();

equipment.use('*', authenticate);

const EQUIPMENT_FIELDS = [
  'assetCode', 'name', 'category', 'model', 'manufacturer', 'quantity', 'unit',
  'location', 'custodian', 'startUseDate', 'nature', 'adminCode', 'origCode',
  'barcode', 'status', 'scrapped', 'inventoryResult', 'inventoryNote', 'notes',
];

const EQUIPMENT_STATUSES = new Set(['IN_USE', 'IDLE', 'REPAIRING', 'SCRAPPED', 'DISPOSED']);

function toDateOrNull(v) {
  if (v === '' || v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeEquipmentData(raw) {
  const data = pickAllowed(raw, EQUIPMENT_FIELDS, { entityLabel: '设备', allowEmpty: true });
  if ('assetCode' in data) {
    data.code = String(data.assetCode ?? '').trim();
    delete data.assetCode;
  }
  if ('quantity' in data) {
    const n = Number.parseInt(data.quantity, 10);
    data.quantity = Number.isNaN(n) || n < 1 ? 1 : n;
  }
  if ('startUseDate' in data) data.startUseDate = toDateOrNull(data.startUseDate);
  if ('scrapped' in data) data.scrapped = Boolean(data.scrapped);
  if ('status' in data) {
    const s = String(data.status ?? '').trim().toUpperCase();
    data.status = EQUIPMENT_STATUSES.has(s) ? s : 'IN_USE';
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

// GET / —— 列表
equipment.get('/', requirePermission('equipment.view'), async (c) => {
  const { keyword, category, status, location } = c.req.query();
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 50);

  const where = { deletedAt: null };
  if (status && status !== 'all') where.status = String(status).toUpperCase();
  if (category && category !== 'all') where.category = category;
  if (location) where.location = { contains: location };
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
      { model: { contains: keyword } },
      { manufacturer: { contains: keyword } },
      { adminCode: { contains: keyword } },
    ];
  }

  const [total, list] = await Promise.all([
    prisma.equipment.count({ where }),
    prisma.equipment.findMany({ where, orderBy: [{ code: 'asc' }], skip, take }),
  ]);
  return c.json({ success: true, list, total, ...paged(list, total, { page, pageSize }) });
});

// GET /:id
equipment.get('/:id', requirePermission('equipment.view'), async (c) => {
  const row = await prisma.equipment.findUnique({ where: { id: c.req.param('id') } });
  if (!row || row.deletedAt) throw notFound('EQUIPMENT_NOT_FOUND', '设备不存在');
  return c.json({ success: true, equipment: row });
});

// POST /
equipment.post('/', requirePermission('equipment.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  const data = normalizeEquipmentData(raw);
  if (!data.code) throw badRequest('VALIDATION_ERROR', 'assetCode（资产编码）必填');
  if (!data.name) throw badRequest('VALIDATION_ERROR', 'name（设备名称）必填');

  const exists = await prisma.equipment.findUnique({ where: { code: data.code }, select: { id: true } });
  if (exists) throw badRequest('VALIDATION_ERROR', '资产编码已存在');

  const created = await prisma.equipment.create({ data: { ...data, createdById: auth.userId } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'EQUIPMENT',
    entityId: created.id,
    entityLabel: `${created.code} ${created.name}`,
    metadata: { permissionCode: 'equipment.create' },
  });
  return c.json({ success: true, equipment: created }, 201);
});

// POST /batch-import —— 批量导入（equipment.create；逐行校验，失败行不阻断）
equipment.post('/batch-import', requirePermission('equipment.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) throw badRequest('VALIDATION_ERROR', 'rows 不能为空');
  if (rows.length > 200) throw badRequest('VALIDATION_ERROR', '单批最多 200 条');

  const success = [];
  const failed = [];
  for (const [index, row] of rows.entries()) {
    try {
      const data = normalizeEquipmentData(row);
      if (!data.code) throw new Error('assetCode 必填');
      if (!data.name) throw new Error('name 必填');
      // eslint-disable-next-line no-await-in-loop
      const dup = await prisma.equipment.findUnique({ where: { code: data.code }, select: { id: true } });
      if (dup) throw new Error(`资产编码已存在: ${data.code}`);
      // eslint-disable-next-line no-await-in-loop
      const created = await prisma.equipment.create({
        data: { ...data, createdById: auth.userId },
        select: { id: true, code: true, name: true },
      });
      success.push({ id: created.id, code: created.code, name: created.name });
    } catch (err) {
      failed.push({ index, code: row?.assetCode || null, reason: err?.message || '导入失败' });
    }
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'EQUIPMENT',
    entityLabel: `批量导入设备 ${success.length}/${rows.length}`,
    after: { total: rows.length, created: success.length, failed: failed.length },
    metadata: { permissionCode: 'equipment.create', batch: true },
  });
  return c.json({ success, failed }, 201);
});

// PUT /:id
equipment.put('/:id', requirePermission('equipment.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  const data = normalizeEquipmentData(raw);
  if ('code' in data) delete data.code; // 资产编码不可改

  const before = await prisma.equipment.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('EQUIPMENT_NOT_FOUND', '设备不存在');

  const updated = await prisma.equipment.update({ where: { id }, data: { ...data, updatedById: auth.userId } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'EQUIPMENT',
    entityId: id,
    entityLabel: `${updated.code} ${updated.name}`,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'equipment.update' },
  });
  return c.json({ success: true, equipment: updated });
});

// DELETE /:id —— 软删
equipment.delete('/:id', requirePermission('equipment.delete'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const row = await prisma.equipment.findFirst({ where: { id, deletedAt: null }, select: { id: true, code: true, name: true } });
  if (!row) throw notFound('EQUIPMENT_NOT_FOUND', '设备不存在');

  await prisma.equipment.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'EQUIPMENT',
    entityId: id,
    entityLabel: `${row.code} ${row.name}`,
    metadata: { permissionCode: 'equipment.delete', softDelete: true },
  });
  return c.json({ success: true, id, softDeleted: true });
});

export default equipment;
