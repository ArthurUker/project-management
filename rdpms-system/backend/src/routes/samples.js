import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
import { badRequest, notFound, parsePaging, paged } from '../kernel/http.js';

/**
 * /api/samples（M-1 P0）：
 *   GET    /api/samples      samples.view
 *   GET    /api/samples/:id  samples.view
 *   POST   /api/samples      samples.create —— sampleCode 由 CodeSequence 原子发号，客户端传入即 400
 *   PUT    /api/samples/:id  samples.update —— 白名单写入
 *   DELETE 不提供（samples.delete 为 P1，不入库）
 */
const samples = new Hono();

samples.use('*', authenticate);

const SAMPLE_FIELDS = [
  'sampleName', 'sampleType', 'projectId', 'species', 'tissue', 'concentration',
  'volume', 'storageCondition', 'receivedAt', 'expiryDate', 'supplier', 'status', 'notes',
];
const OPTIONAL_NULLABLE = ['species', 'tissue', 'concentration', 'volume', 'receivedAt', 'expiryDate', 'supplier', 'notes', 'projectId'];

function normalize(data) {
  const out = { ...data };
  for (const key of OPTIONAL_NULLABLE) {
    if (out[key] === '' || out[key] === undefined) out[key] = null;
  }
  return out;
}

// ── 列表 ─────────────────────────────────────────────────────────────────────
samples.get('/', requirePermission('samples.view'), async (c) => {
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 50);
  const { keyword, projectId, status } = c.req.query();
  const where = {};
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (keyword) {
    where.OR = [
      { sampleCode: { contains: keyword } },
      { sampleName: { contains: keyword } },
      { species: { contains: keyword } },
      { tissue: { contains: keyword } },
    ];
  }
  const [total, list] = await Promise.all([
    prisma.sampleMaterial.count({ where }),
    prisma.sampleMaterial.findMany({
      where,
      skip,
      take,
      orderBy: { sampleCode: 'asc' },
      include: { project: { select: { id: true, name: true, code: true } } },
    }),
  ]);
  return c.json({ ...paged(list, total, { page, pageSize }), list });
});

// ── 详情 ─────────────────────────────────────────────────────────────────────
samples.get('/:id', requirePermission('samples.view'), async (c) => {
  const s = await prisma.sampleMaterial.findUnique({
    where: { id: c.req.param('id') },
    include: { project: { select: { id: true, name: true, code: true } } },
  });
  if (!s) throw notFound('SAMPLE_NOT_FOUND', '样本不存在');
  return c.json(s);
});

// ── 创建（编号竞态修复：CodeSequence 原子发号）───────────────────────────────
samples.post('/', requirePermission('samples.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  if (raw && typeof raw === 'object' && 'sampleCode' in raw) {
    throw badRequest('VALIDATION_ERROR', 'sampleCode 由服务端统一发号，禁止客户端提交');
  }
  const data = pickAllowed(raw, SAMPLE_FIELDS, { entityLabel: '创建样本' });
  const sampleName = data.sampleName;
  if (!sampleName) throw badRequest('VALIDATION_ERROR', 'sampleName 必填');

  // 原子发号：INSERT ... ON CONFLICT DO UPDATE ... RETURNING
  const year = new Date().getFullYear();
  const sampleCode = await nextCode(prisma, 'SAMPLE', {
    periodKey: String(year),
    fallbackPrefix: `SMP-${year}-`,
    padding: 3,
  });

  const created = await prisma.sampleMaterial.create({
    data: { ...normalize(data), sampleCode, status: data.status ?? 'AVAILABLE', createdById: auth.userId },
    include: { project: { select: { id: true, name: true, code: true } } },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'SAMPLE',
    entityId: created.id,
    entityLabel: created.sampleCode,
    after: { sampleCode: created.sampleCode, sampleName: created.sampleName },
    metadata: { permissionCode: 'samples.create' },
  });
  return c.json(created, 201);
});

// ── 更新（白名单；禁止改编号）────────────────────────────────────────────────
samples.put('/:id', requirePermission('samples.update'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  if (raw && typeof raw === 'object' && 'sampleCode' in raw) {
    throw badRequest('VALIDATION_ERROR', 'sampleCode 不可修改');
  }
  const data = pickAllowed(raw, SAMPLE_FIELDS, { entityLabel: '更新样本' });

  const before = await prisma.sampleMaterial.findUnique({ where: { id } });
  if (!before) throw notFound('SAMPLE_NOT_FOUND', '样本不存在');

  const updated = await prisma.sampleMaterial.update({
    where: { id },
    data: normalize(data),
    include: { project: { select: { id: true, name: true, code: true } } },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'SAMPLE',
    entityId: id,
    entityLabel: before.sampleCode,
    before: { status: before.status, sampleName: before.sampleName },
    after: { status: updated.status, sampleName: updated.sampleName },
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'samples.update' },
  });
  return c.json(updated);
});

export default samples;
