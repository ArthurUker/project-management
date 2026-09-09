import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
import { badRequest, notFound, parsePaging, paged } from '../kernel/http.js';

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
  'name', 'type', 'sequence', 'projectId', 'targetId', 'targetGene', 'validatedStrain',
  'modification5', 'modification3', 'ampliconLength', 'synthesisAmount',
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
  if ('status' in data) data.status = String(data.status).toUpperCase();
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

// GET / —— 列表（keyword / projectId / targetGene / status）
router.get('/', requirePermission('primers.view'), async (c) => {
  const { keyword, projectId, projectName, targetGene, targetId, detectionTarget, status } = c.req.query();
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 100);

  const where = { deletedAt: null };
  if (status) where.status = String(status).toUpperCase();
  if (projectId || projectName) where.projectId = projectId || projectName;
  if (targetId || detectionTarget) where.targetId = targetId || detectionTarget;
  if (targetGene) where.targetGene = { contains: targetGene };
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { sequence: { contains: keyword } },
      { targetGene: { contains: keyword } },
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
  if (!data.sequence) throw badRequest('VALIDATION_ERROR', 'sequence 必填');

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

// M-1：primers.delete 为 P1 后置权限，端点暂不提供
router.delete('/:id', async (c) => {
  return c.json({ error: '引物删除属 P1 后置权限，本轮未启用', code: 'PERMISSION_NOT_AVAILABLE' }, 403);
});

// M-1：primers.import 为 P1 后置权限，端点暂不提供
router.post('/batch-import', async (c) => {
  return c.json({ error: '引物批量导入属 P1 后置权限，本轮未启用', code: 'PERMISSION_NOT_AVAILABLE' }, 403);
});

export default router;
