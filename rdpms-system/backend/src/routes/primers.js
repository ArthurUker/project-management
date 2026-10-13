import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
import { HttpError, badRequest, notFound, parsePaging, paged } from '../kernel/http.js';

/**
 * /api/primers —— 引物探针库（W10 PG baseline 迁移）。
 *
 * 迁移要点：
 *   projectName（文本）→ projectId（外键）；detectionTarget（文本）→ targetId（DetectionTarget 外键）；
 *   speciesLatinName 等旧样本字段与 atccStrain 并入 DetectionTarget；validatedStrain（验证菌株）
 *   按 Tencent 语义保留在引物级（批次一 D-3 承接）；
 *   code @unique 必填 → CodeSequence 原子发号（PRM-）；
 *   status 'active' → ACTIVE（DocumentStatus 枚举）；createdBy → createdById。
 */
const router = new Hono();

router.use('*', authMiddleware);

const PRIMER_FIELDS = [
  'name', 'type', 'sequence', 'projectId', 'projectName', 'targetId', 'targetGene', 'validatedStrain',
  'modification5', 'modification3', 'fluorescentChannel', 'ampliconLength', 'synthesisAmount',
  'synthesisCompany', 'tubeCount', 'notes', 'status',
];

function normalizePrimerData(raw) {
  const data = pickAllowed(raw, PRIMER_FIELDS, { entityLabel: '引物', allowEmpty: true });
  if ('ampliconLength' in data) {
    data.ampliconLength = data.ampliconLength ? Number.parseInt(data.ampliconLength, 10) : null;
  }
  if ('tubeCount' in data) {
    data.tubeCount = data.tubeCount ? Number.parseInt(data.tubeCount, 10) : null;
  }
  if ('status' in data) {
    // 枚举净化（同 defaultStockUnit 事故族）：空串/非法值 → ACTIVE 兜底，避免 Prisma enum 500
    const s = String(data.status ?? '').trim().toUpperCase();
    data.status = ['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'].includes(s) ? s : 'ACTIVE';
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

// GET / —— 列表（keyword / projectId / targetGene / status）
router.get('/', requirePermission('primers.view'), async (c) => {
  const { keyword, projectId, projectName, targetGene, targetId, detectionTarget, status } = c.req.query();
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 100);

  const where = { deletedAt: null };
  if (status) where.status = String(status).toUpperCase();
  if (projectId) where.projectId = projectId;
  // 修正（2026-10-12）：projectName 是业务项目名文本，此前被当作外键使用导致按项目筛选失效
  if (projectName) where.projectName = { contains: projectName };
  if (targetId || detectionTarget) where.targetId = targetId || detectionTarget;
  if (targetGene) where.targetGene = { contains: targetGene };
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { sequence: { contains: keyword } },
      { targetGene: { contains: keyword } },
      { fluorescentChannel: { contains: keyword } },
      { projectName: { contains: keyword } },
      { code: { contains: keyword } },
    ];
  }

  const [total, list] = await Promise.all([
    prisma.primer.count({ where }),
    prisma.primer.findMany({
      where,
      orderBy: [{ projectId: 'asc' }, { name: 'asc' }],
      skip,
      take,
      include: {
        project: { select: { id: true, name: true, code: true } },
        target: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
        // v1.2：库存批次（盘点数据迁入后为列表提供位置/数量摘要）
        lots: {
          include: { storage: { select: { id: true, code: true, name: true, path: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
  ]);
  return c.json({ success: true, list, total, ...paged(list, total, { page, pageSize }) });
});

// GET /:id
router.get('/:id', requirePermission('primers.view'), async (c) => {
  const primer = await prisma.primer.findUnique({
    where: { id: c.req.param('id') },
    include: {
      project: { select: { id: true, name: true, code: true } },
      target: { select: { id: true, name: true } },
      creator: { select: { id: true, displayName: true } },
      lots: {
        include: { storage: { select: { id: true, code: true, name: true, path: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!primer || primer.deletedAt) throw notFound('PRIMER_NOT_FOUND', '引物不存在');
  return c.json(primer);
});

// POST /
router.post('/', requirePermission('primers.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  const data = normalizePrimerData(raw);
  if (!data.name) throw badRequest('VALIDATION_ERROR', 'name 必填');
  // v1.2：sequence 改为可选（库存引物通常只有名称没有序列）

  const year = new Date().getFullYear();
  const code = await nextCode(prisma, 'PRIMER', { periodKey: String(year), fallbackPrefix: `PRM-${year}-`, padding: 3 });

  const created = await prisma.primer.create({
    data: { ...data, code, status: data.status || 'ACTIVE', createdById: auth.userId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      target: { select: { id: true, name: true } },
    },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PRIMER',
    entityId: created.id,
    entityLabel: created.code,
    metadata: { permissionCode: 'primers.create' },
  });
  return c.json({ success: true, data: created }, 201);
});

// PUT /:id
router.put('/:id', requirePermission('primers.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  const data = normalizePrimerData(raw);
  if ('code' in data) delete data.code;

  const before = await prisma.primer.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('PRIMER_NOT_FOUND', '引物不存在');

  const updated = await prisma.primer.update({ where: { id }, data: { ...data, updatedById: auth.userId } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'PRIMER',
    entityId: id,
    entityLabel: before.code,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'primers.update' },
  });
  return c.json({ success: true, data: updated });
});

// ── 删除（primers.delete，P1 批次二解冻；软删+审计）──────────────────────────
router.delete('/:id', requirePermission('primers.delete'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const primer = await prisma.primer.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!primer) throw notFound('PRIMER_NOT_FOUND', '引物不存在');

  await prisma.primer.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'PRIMER',
    entityId: id,
    entityLabel: primer.code,
    before: { code: primer.code, name: primer.name },
    metadata: { permissionCode: 'primers.delete', softDelete: true },
  });
  return c.json({ success: true, id, softDeleted: true });
});

// POST /batch-import —— 批量导入（primers.import，P1 批次二解冻；Tencent 复刻：
// 前端解析 CSV 后传 rows 数组，逐行校验、逐行 CodeSequence 发号，失败行不阻断整批）
router.post('/batch-import', requirePermission('primers.import'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) throw badRequest('VALIDATION_ERROR', 'rows 不能为空');
  if (rows.length > 200) throw badRequest('VALIDATION_ERROR', '单批最多 200 条');

  const year = String(new Date().getFullYear());
  const success = [];
  const failed = [];
  for (const [index, row] of rows.entries()) {
    try {
      const data = normalizePrimerData(row);
      if (!data.name) throw new Error('name 必填');
      if ('code' in data) delete data.code; // 编号一律服务端发号
      // eslint-disable-next-line no-await-in-loop
      const code = await nextCode(prisma, 'PRIMER', { periodKey: year, fallbackPrefix: `PRM-${year}-`, padding: 3 });
      // eslint-disable-next-line no-await-in-loop
      const created = await prisma.primer.create({
        data: { ...data, code, status: data.status || 'ACTIVE', createdById: auth.userId },
        select: { id: true, code: true, name: true },
      });
      success.push({ id: created.id, code: created.code, name: created.name });
    } catch (err) {
      failed.push({ index, name: row?.name || null, reason: err?.message || '导入失败' });
    }
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PRIMER',
    entityLabel: `批量导入 ${success.length}/${rows.length}`,
    after: { total: rows.length, created: success.length, failed: failed.length },
    metadata: { permissionCode: 'primers.import', batch: true },
  });
  return c.json({ success, failed }, 201);
});

// ════════════════════════════════════════════════════════════════════════════
// 引物/探针库存批次（v1.2，2026-10-12）：盘点数据的引物落在 Primer 名称 + PrimerLot 批次。
// 权限复用 primers.update（不新增权限码）。
// ════════════════════════════════════════════════════════════════════════════
const PRIMER_LOT_FIELDS = [
  'lotNo', 'quantity', 'unit', 'spec', 'containerCount', 'openedStatus', 'form',
  'locationId', 'location', 'supplier', 'receivedAt', 'notes', 'status',
];
const LOT_OPENED_STATUSES = new Set(['SEALED', 'OPENED']);
const LOT_STATUSES = new Set(['AVAILABLE', 'RESERVED', 'DEPLETED', 'EXPIRED', 'QUARANTINED', 'DISPOSED']);

function normalizePrimerLotData(raw) {
  const data = pickAllowed(raw, PRIMER_LOT_FIELDS, { entityLabel: '引物库存批次' });
  if ('quantity' in data) {
    if (data.quantity === '' || data.quantity == null) data.quantity = null;
    else data.quantity = String(data.quantity);
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
      if (LOT_OPENED_STATUSES.has(s)) data.openedStatus = s;
      else delete data.openedStatus;
    }
  }
  if ('status' in data) {
    const s = String(data.status ?? '').trim().toUpperCase();
    data.status = LOT_STATUSES.has(s) ? s : 'AVAILABLE';
  }
  if ('receivedAt' in data) {
    if (!data.receivedAt) data.receivedAt = null;
    else {
      const d = new Date(data.receivedAt);
      data.receivedAt = Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if ('locationId' in data && !data.locationId) data.locationId = null;
  return data;
}

async function assertLocationExists(locationId) {
  if (!locationId) return;
  const loc = await prisma.storageLocation.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!loc) throw badRequest('VALIDATION_ERROR', '库位不存在');
}

const LOT_INCLUDE = { storage: { select: { id: true, code: true, name: true, path: true } } };

// POST /:id/lots —— 新增库存批次
router.post('/:id/lots', requirePermission('primers.update'), async (c) => {
  const auth = getAuth(c);
  const primer = await prisma.primer.findFirst({
    where: { id: c.req.param('id'), deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!primer) throw notFound('PRIMER_NOT_FOUND', '引物不存在');

  const raw = await c.req.json().catch(() => null);
  const data = normalizePrimerLotData(raw);
  const lotNo = String(data.lotNo || '').trim() || '未标注';
  await assertLocationExists(data.locationId);

  let created;
  try {
    created = await prisma.primerLot.create({
      data: { ...data, lotNo, primerId: primer.id, status: data.status || 'AVAILABLE' },
      include: LOT_INCLUDE,
    });
  } catch (err) {
    if (err?.code === 'P2002') throw new HttpError(409, 'LOT_DUPLICATE', '该引物下已存在相同批号的批次');
    throw err;
  }
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PRIMER_LOT',
    entityId: created.id,
    entityLabel: `${primer.name}/${created.lotNo}`,
    after: { lotNo: created.lotNo, quantity: created.quantity },
    metadata: { permissionCode: 'primers.update' },
  });
  return c.json(created, 201);
});

// PATCH /:id/lots/:lotId —— 编辑库存批次
router.patch('/:id/lots/:lotId', requirePermission('primers.update'), async (c) => {
  const auth = getAuth(c);
  const { id, lotId } = c.req.param();
  const before = await prisma.primerLot.findFirst({ where: { id: lotId, primerId: id } });
  if (!before) throw notFound('LOT_NOT_FOUND', '批次不存在');

  const raw = await c.req.json().catch(() => null);
  const data = normalizePrimerLotData(raw);
  await assertLocationExists(data.locationId);

  let updated;
  try {
    updated = await prisma.primerLot.update({ where: { id: lotId }, data, include: LOT_INCLUDE });
  } catch (err) {
    if (err?.code === 'P2002') throw new HttpError(409, 'LOT_DUPLICATE', '该引物下已存在相同批号的批次');
    throw err;
  }
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'PRIMER_LOT',
    entityId: lotId,
    entityLabel: updated.lotNo,
    before: { quantity: before.quantity, status: before.status },
    after: { quantity: updated.quantity, status: updated.status },
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'primers.update' },
  });
  return c.json(updated);
});

export default router;
