import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { pickAllowed, pickForCreate } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { notFound, parsePaging, paged } from '../kernel/http.js';

/**
 * /api/reagent-lots —— 批次/库存写入唯一入口（M-1 §8.1）。
 * 不新增 reagent_lots.* 权限码：
 *   GET   /api/reagent-lots       reagents.view
 *   POST  /api/reagent-lots       reagents.create
 *   PATCH /api/reagent-lots/:id   reagents.update
 */
const reagentLots = new Hono();

reagentLots.use('*', authenticate);

const LOT_FIELDS = [
  'materialId', 'lotNo', 'quantity', 'unit', 'receivedAt', 'expiryDate',
  'location', 'supplier', 'certificateUrl', 'status',
];

reagentLots.get('/', requirePermission('reagents.view'), async (c) => {
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 50);
  const { materialId, keyword, status } = c.req.query();
  const where = {};
  if (materialId) where.materialId = materialId;
  if (status) where.status = status;
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
      },
    }),
  ]);
  return c.json({ ...paged(list, total, { page, pageSize }), list });
});

reagentLots.post('/', requirePermission('reagents.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = pickForCreate(body, LOT_FIELDS, ['materialId', 'lotNo', 'quantity'], { entityLabel: '创建批次' });

  const material = await prisma.reagentMaterial.findUnique({
    where: { id: data.materialId },
    select: { id: true, code: true, commonName: true },
  });
  if (!material) throw notFound('MATERIAL_NOT_FOUND', '原料不存在');

  const created = await prisma.reagentLot.create({
    data: {
      ...data,
      quantity: typeof data.quantity === 'string' ? data.quantity : String(data.quantity),
      status: data.status ?? 'AVAILABLE',
    },
  });

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
  const data = pickAllowed(body, LOT_FIELDS.filter((f) => f !== 'materialId'), { entityLabel: '更新批次' });

  const before = await prisma.reagentLot.findUnique({ where: { id } });
  if (!before) throw notFound('LOT_NOT_FOUND', '批次不存在');

  const updated = await prisma.reagentLot.update({
    where: { id },
    data: {
      ...data,
      ...(data.quantity !== undefined
        ? { quantity: typeof data.quantity === 'string' ? data.quantity : String(data.quantity) }
        : {}),
    },
  });

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
