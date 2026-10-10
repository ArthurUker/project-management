import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
import { HttpError, badRequest, notFound, parsePaging, paged } from '../kernel/http.js';

/**
 * /api/detection-targets —— 检测靶标（v1.1，2026-10-10）。
 *
 * 权限遵循既有契约：靶标不设独立权限码（DENIED_PATTERNS 明确否决 detection_targets.* 通配），
 * 读写复用 primers 域权限：
 *   GET   primers.view
 *   POST  primers.create
 *   PUT   primers.update
 *   DELETE primers.delete（有引物引用时拒绝）
 * code 由发号器生成（TGT-001）。
 */
const targets = new Hono();

targets.use('*', authenticate);

const TARGET_FIELDS = ['name', 'geneSymbol', 'organismLatin', 'organismChinese', 'taxid', 'atccStrain', 'notes', 'status'];
const DOC_STATUSES = new Set(['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']);

const conflict = (code, message, extra) => new HttpError(409, code, message, extra);

function normalizeTargetData(raw) {
  const data = pickAllowed(raw, TARGET_FIELDS, { entityLabel: '检测靶标', allowEmpty: true });
  if ('status' in data) {
    const s = String(data.status ?? '').trim().toUpperCase();
    data.status = DOC_STATUSES.has(s) ? s : 'ACTIVE';
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

// GET /
targets.get('/', requirePermission('primers.view'), async (c) => {
  const { keyword, status } = c.req.query();
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 100);

  const where = {};
  if (status && status !== 'all') where.status = String(status).toUpperCase();
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
      { organismLatin: { contains: keyword } },
      { organismChinese: { contains: keyword } },
      { geneSymbol: { contains: keyword } },
      { taxid: { contains: keyword } },
    ];
  }

  const [total, list] = await Promise.all([
    prisma.detectionTarget.count({ where }),
    prisma.detectionTarget.findMany({ where, orderBy: [{ code: 'asc' }], skip, take,
      include: { _count: { select: { primers: true } } } }),
  ]);
  return c.json({ success: true, list, total, ...paged(list, total, { page, pageSize }) });
});

// GET /:id
targets.get('/:id', requirePermission('primers.view'), async (c) => {
  const row = await prisma.detectionTarget.findUnique({ where: { id: c.req.param('id') } });
  if (!row) throw notFound('TARGET_NOT_FOUND', '检测靶标不存在');
  return c.json({ success: true, target: row });
});

// POST /
targets.post('/', requirePermission('primers.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  const data = normalizeTargetData(raw);
  if (!data.name) throw badRequest('VALIDATION_ERROR', 'name 必填');

  const code = await nextCode(prisma, 'DETECTION_TARGET', { periodKey: '', fallbackPrefix: 'TGT-', padding: 3 });
  const created = await prisma.detectionTarget.create({ data: { ...data, code, status: data.status || 'ACTIVE' } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'DETECTION_TARGET',
    entityId: created.id,
    entityLabel: `${created.code} ${created.name}`,
    metadata: { permissionCode: 'primers.create' },
  });
  return c.json({ success: true, target: created }, 201);
});

// PUT /:id
targets.put('/:id', requirePermission('primers.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  const data = normalizeTargetData(raw);

  const before = await prisma.detectionTarget.findUnique({ where: { id } });
  if (!before) throw notFound('TARGET_NOT_FOUND', '检测靶标不存在');

  const updated = await prisma.detectionTarget.update({ where: { id }, data });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'DETECTION_TARGET',
    entityId: id,
    entityLabel: `${updated.code} ${updated.name}`,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'primers.update' },
  });
  return c.json({ success: true, target: updated });
});

// DELETE /:id（有引物引用时拒绝）
targets.delete('/:id', requirePermission('primers.delete'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const row = await prisma.detectionTarget.findUnique({ where: { id } });
  if (!row) throw notFound('TARGET_NOT_FOUND', '检测靶标不存在');

  const primerCount = await prisma.primer.count({ where: { targetId: id, deletedAt: null } });
  if (primerCount > 0) throw conflict('TARGET_IN_USE', `存在 ${primerCount} 条引物引用该靶标，不能删除`);

  await prisma.detectionTarget.delete({ where: { id } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'DETECTION_TARGET',
    entityId: id,
    entityLabel: `${row.code} ${row.name}`,
    metadata: { permissionCode: 'primers.delete' },
  });
  return c.json({ success: true, id, deleted: true });
});

export default targets;
