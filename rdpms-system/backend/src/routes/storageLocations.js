import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
import { HttpError, badRequest, notFound } from '../kernel/http.js';

/**
 * /api/storage-locations —— 库位树（v1.1，2026-10-10）。
 *
 * 结构：房间/实验室 → 柜/冰箱 → 层 → 盒/袋（自关联树 + 物化路径 path）。
 * 权限：storage_locations.view / storage_locations.manage。
 * code 由发号器生成（LOC-0001）；批次通过 ReagentLot.locationId 引用。
 */
const locations = new Hono();

locations.use('*', authenticate);

const LOCATION_TYPES = new Set(['ROOM', 'CABINET', 'FRIDGE', 'FREEZER', 'SHELF', 'DRAWER', 'BOX', 'BAG', 'OTHER']);
const LOCATION_FIELDS = ['name', 'type', 'parentId', 'sortOrder', 'notes', 'status'];
const DOC_STATUSES = new Set(['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']);

const conflict = (code, message, extra) => new HttpError(409, code, message, extra);

function normalizeLocationData(raw) {
  const data = pickAllowed(raw, LOCATION_FIELDS, { entityLabel: '库位', allowEmpty: true });
  if ('type' in data) {
    const t = String(data.type ?? '').trim().toUpperCase();
    data.type = LOCATION_TYPES.has(t) ? t : 'OTHER';
  }
  if ('status' in data) {
    const s = String(data.status ?? '').trim().toUpperCase();
    data.status = DOC_STATUSES.has(s) ? s : 'ACTIVE';
  }
  if ('sortOrder' in data) {
    const n = Number.parseInt(data.sortOrder, 10);
    data.sortOrder = Number.isNaN(n) ? 0 : n;
  }
  if ('parentId' in data && (data.parentId === '' || data.parentId === null)) data.parentId = null;
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

async function computePathAndDepth(parentId, name) {
  if (!parentId) return { path: `/${name}`, depth: 0 };
  const parent = await prisma.storageLocation.findUnique({ where: { id: parentId } });
  if (!parent || parent.status === 'ARCHIVED') throw badRequest('VALIDATION_ERROR', '父库位不存在');
  return { path: `${parent.path}/${name}`, depth: parent.depth + 1 };
}

/** 重算某节点及其子树的 path/depth（父节点或名称变化后调用） */
async function recomputeSubtree(id) {
  const node = await prisma.storageLocation.findUnique({ where: { id } });
  if (!node) return;
  const { path, depth } = await computePathAndDepth(node.parentId, node.name);
  if (path !== node.path || depth !== node.depth) {
    await prisma.storageLocation.update({ where: { id }, data: { path, depth } });
  }
  const children = await prisma.storageLocation.findMany({ where: { parentId: id }, select: { id: true } });
  for (const ch of children) {
    // eslint-disable-next-line no-await-in-loop
    await recomputeSubtree(ch.id);
  }
}

/** newParentId 是否为 id 的后代（防止挂环） */
async function isDescendant(id, newParentId) {
  let cursor = newParentId;
  const seen = new Set();
  while (cursor) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return true; // 已有环，保守拒绝
    seen.add(cursor);
    // eslint-disable-next-line no-await-in-loop
    const node = await prisma.storageLocation.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = node?.parentId ?? null;
  }
  return false;
}

// GET /（?format=tree 返回嵌套结构；默认平铺，按 path 排序）
locations.get('/', requirePermission('storage_locations.view'), async (c) => {
  const format = c.req.query('format');
  const { keyword, type } = c.req.query();
  const where = {};
  if (type && type !== 'all') where.type = type;
  if (keyword) where.OR = [{ name: { contains: keyword } }, { path: { contains: keyword } }, { code: { contains: keyword } }];

  const list = await prisma.storageLocation.findMany({
    where,
    orderBy: [{ path: 'asc' }, { sortOrder: 'asc' }],
  });

  if (format === 'tree') {
    const byId = new Map(list.map((n) => [n.id, { ...n, children: [] }]));
    const roots = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
      else roots.push(node);
    }
    return c.json({ success: true, tree: roots, total: list.length });
  }
  return c.json({ success: true, list, total: list.length });
});

// GET /:id（附子节点与批次计数）
locations.get('/:id', requirePermission('storage_locations.view'), async (c) => {
  const id = c.req.param('id');
  const node = await prisma.storageLocation.findUnique({ where: { id } });
  if (!node) throw notFound('LOCATION_NOT_FOUND', '库位不存在');
  const [children, lotCount] = await Promise.all([
    prisma.storageLocation.findMany({ where: { parentId: id }, orderBy: { sortOrder: 'asc' } }),
    prisma.reagentLot.count({ where: { locationId: id } }),
  ]);
  return c.json({ success: true, location: node, children, lotCount });
});

// POST /
locations.post('/', requirePermission('storage_locations.manage'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  const data = normalizeLocationData(raw);
  if (!data.name) throw badRequest('VALIDATION_ERROR', 'name 必填');

  const code = await nextCode(prisma, 'STORAGE_LOCATION', { periodKey: '', fallbackPrefix: 'LOC-', padding: 4 });
  const { path, depth } = await computePathAndDepth(data.parentId ?? null, data.name);

  const created = await prisma.storageLocation.create({
    data: { ...data, code, path, depth, status: data.status || 'ACTIVE' },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'STORAGE_LOCATION',
    entityId: created.id,
    entityLabel: `${created.code} ${created.path}`,
    metadata: { permissionCode: 'storage_locations.manage' },
  });
  return c.json({ success: true, location: created }, 201);
});

// PUT /:id
locations.put('/:id', requirePermission('storage_locations.manage'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  const data = normalizeLocationData(raw);

  const before = await prisma.storageLocation.findUnique({ where: { id } });
  if (!before) throw notFound('LOCATION_NOT_FOUND', '库位不存在');

  if ('parentId' in data && data.parentId && data.parentId !== before.parentId) {
    const exists = await prisma.storageLocation.findUnique({ where: { id: data.parentId }, select: { id: true } });
    if (!exists) throw badRequest('VALIDATION_ERROR', '父库位不存在');
    if (await isDescendant(id, data.parentId)) throw badRequest('VALIDATION_ERROR', '不能将库位移入其自身或后代之下');
  }

  const updated = await prisma.storageLocation.update({ where: { id }, data });
  if ('parentId' in data || 'name' in data) await recomputeSubtree(id);

  const after = await prisma.storageLocation.findUnique({ where: { id } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'STORAGE_LOCATION',
    entityId: id,
    entityLabel: `${updated.code} ${after?.path ?? updated.path}`,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'storage_locations.manage' },
  });
  return c.json({ success: true, location: after });
});

// DELETE /:id（有子库位或批次引用时拒绝）
locations.delete('/:id', requirePermission('storage_locations.manage'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const node = await prisma.storageLocation.findUnique({ where: { id } });
  if (!node) throw notFound('LOCATION_NOT_FOUND', '库位不存在');

  const [childCount, lotCount] = await Promise.all([
    prisma.storageLocation.count({ where: { parentId: id } }),
    prisma.reagentLot.count({ where: { locationId: id } }),
  ]);
  if (childCount > 0) throw conflict('LOCATION_HAS_CHILDREN', `存在 ${childCount} 个子库位，请先处理子库位`);
  if (lotCount > 0) throw conflict('LOCATION_IN_USE', `存在 ${lotCount} 个批次引用该库位，不能删除`);

  await prisma.storageLocation.delete({ where: { id } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'STORAGE_LOCATION',
    entityId: id,
    entityLabel: `${node.code} ${node.path}`,
    metadata: { permissionCode: 'storage_locations.manage' },
  });
  return c.json({ success: true, id, deleted: true });
});

export default locations;
