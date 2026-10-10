import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { pickAllowed, pickForCreate } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { HttpError, badRequest, notFound, parsePaging, paged } from '../kernel/http.js';

/**
 * /api/reagent-lots —— 批次/库存写入唯一入口（M-1 §8.1）。
 * 不新增 reagent_lots.* 权限码：
 *   GET   /api/reagent-lots       reagents.view
 *   POST  /api/reagent-lots       reagents.create
 *   PATCH /api/reagent-lots/:id   reagents.update
 *
 * v1.1（2026-10-10）：增加结构化库位（locationId）、包装规格（spec）、管数（containerCount）、
 * 开封状态（openedStatus）、物理形态（form）、备注（notes）字段；
 * 唯一约束（materialId + lotNo）冲突从 500 改为 409 友好错误。
 */
const reagentLots = new Hono();

reagentLots.use('*', authenticate);

const LOT_FIELDS = [
  'materialId', 'lotNo', 'quantity', 'unit', 'receivedAt', 'expiryDate',
  'location', 'locationId', 'spec', 'containerCount', 'openedStatus', 'form', 'notes',
  'supplier', 'certificateUrl', 'status',
];

const OPENED_STATUSES = new Set(['SEALED', 'OPENED']);
const LOT_STATUSES = new Set(['AVAILABLE', 'RESERVED', 'DEPLETED', 'EXPIRED', 'QUARANTINED', 'DISPOSED']);

function toDateOrNull(v) {
  if (v === '' || v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeLotData(data) {
  if ('quantity' in data && data.quantity !== undefined) {
    data.quantity = typeof data.quantity === 'string' ? data.quantity : String(data.quantity);
  }
  if ('containerCount' in data) {
    if (data.containerCount === '' || data.containerCount == null) data.containerCount = null;
    else {
      const n = Number.parseFloat(String(data.containerCount));
      data.containerCount = Number.isNaN(n) ? null : n;
    }
  }
  if ('openedStatus' in data) {
    if (data.openedStatus === '' || data.openedStatus == null) data.openedStatus = null;
    else {
      const s = String(data.openedStatus).trim().toUpperCase();
      if (OPENED_STATUSES.has(s)) data.openedStatus = s;
      else delete data.openedStatus; // 非法值：不写入（避免 Prisma enum 500），null 显式清空可传
    }
  }
  if ('status' in data) {
    const s = String(data.status ?? '').trim().toUpperCase();
    data.status = LOT_STATUSES.has(s) ? s : 'AVAILABLE'; // 非法值兜底（原实现会直接 500）
  }
  if ('receivedAt' in data) data.receivedAt = toDateOrNull(data.receivedAt);
  if ('expiryDate' in data) data.expiryDate = toDateOrNull(data.expiryDate);
  if ('locationId' in data && !data.locationId) data.locationId = null;
  return data;
}

async function assertLocationExists(data) {
  if (data.locationId) {
    const loc = await prisma.storageLocation.findUnique({ where: { id: data.locationId }, select: { id: true } });
    if (!loc) throw badRequest('VALIDATION_ERROR', '库位不存在');
  }
}

function duplicateLotError() {
  return new HttpError(409, 'LOT_DUPLICATE', '该物料下已存在相同批号的批次（materialId + lotNo 唯一）');
}

reagentLots.get('/', requirePermission('reagents.view'), async (c) => {
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 50);
  const { materialId, keyword, status, locationId } = c.req.query();
  const where = {};
  if (materialId) where.materialId = materialId;
  if (status) where.status = status;
  if (locationId) where.locationId = locationId;
  if (keyword) where.lotNo = { contains: keyword };

  const [total, list] = await Promise.all([
    prisma.reagentLot.count({ where }),
    prisma.reagentLot.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        material: {
          select: {
            id: true, code: true, commonName: true, chineseName: true,
            category: true, defaultStockUnit: true, status: true,
          },
        },
        storage: { select: { id: true, code: true, name: true, path: true } },
      },
    }),
  ]);
  return c.json({ ...paged(list, total, { page, pageSize }), list });
});

reagentLots.post('/', requirePermission('reagents.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = normalizeLotData(pickForCreate(body, LOT_FIELDS, ['materialId', 'lotNo', 'quantity'], { entityLabel: '创建批次' }));

  const material = await prisma.reagentMaterial.findUnique({
    where: { id: data.materialId },
    select: { id: true, code: true, commonName: true },
  });
  if (!material) throw notFound('MATERIAL_NOT_FOUND', '原料不存在');
  await assertLocationExists(data);

  let created;
  try {
    created = await prisma.reagentLot.create({ data: { ...data, status: data.status ?? 'AVAILABLE' } });
  } catch (err) {
    if (err?.code === 'P2002') throw duplicateLotError();
    throw err;
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'REAGENT_LOT',
    entityId: created.id,
    entityLabel: `${material.commonName ?? material.code}/${created.lotNo}`,
    after: { lotNo: created.lotNo, quantity: created.quantity },
    metadata: { permissionCode: 'reagents.create' },
  });
  return c.json(created, 201);
});

reagentLots.patch('/:id', requirePermission('reagents.update'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = normalizeLotData(pickAllowed(body, LOT_FIELDS.filter((f) => f !== 'materialId'), { entityLabel: '更新批次' }));

  const before = await prisma.reagentLot.findUnique({ where: { id } });
  if (!before) throw notFound('LOT_NOT_FOUND', '批次不存在');
  await assertLocationExists(data);

  let updated;
  try {
    updated = await prisma.reagentLot.update({ where: { id }, data });
  } catch (err) {
    if (err?.code === 'P2002') throw duplicateLotError();
    throw err;
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'REAGENT_LOT',
    entityId: id,
    entityLabel: updated.lotNo,
    before: { quantity: before.quantity, status: before.status },
    after: { quantity: updated.quantity, status: updated.status },
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'reagents.update' },
  });
  return c.json(updated);
});

export default reagentLots;
