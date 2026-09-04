import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, notFound, parsePaging, paged } from '../kernel/http.js';

/**
 * 审计日志（M-1 §6.5）：
 *   GET  /api/audit-logs                       audit.view
 *   POST /api/audit-logs/export                audit.export（ADMIN 403 / AUDITOR 200）
 *   GET  /api/audit/entity/:type/:id/summary   audit.view（AUDITOR 下钻唯一通道）
 */
const audit = new Hono();

audit.use('*', authenticate);

audit.get('/audit-logs', requirePermission('audit.view'), async (c) => {
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 20);
  const { action, entityType, entityId, actorId, dateFrom, dateTo } = c.req.query();

  const where = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (actorId) where.actorId = actorId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const [total, list] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, displayName: true, username: true } } },
    }),
  ]);
  return c.json({
    ...paged(list, total, { page, pageSize }),
    list: list.map((row) => ({
      ...row,
      actorName: row.actor?.displayName ?? row.actorName ?? row.actorId ?? '—',
      metadata: row.metadata ?? null,
    })),
  });
});

audit.post('/audit-logs/export', requirePermission('audit.export'), async (c) => {
  const auth = getAuth(c);
  const { dateFrom, dateTo, action, entityType } = c.req.query();
  const where = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }
  const limit = Math.min(10000, Number.parseInt(c.req.query('limit') || '5000', 10));
  const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.EXPORT,
    entityType: 'AUDIT_LOG',
    metadata: { permissionCode: 'audit.export', count: rows.length },
  });
  return c.json({ exportedAt: new Date().toISOString(), count: rows.length, items: rows });
});

/** AUDITOR 合规下钻：仅聚合摘要，不吐业务明细 */
audit.get('/audit/entity/:type/:id/summary', requirePermission('audit.view'), async (c) => {
  const entityType = c.req.param('type').toUpperCase();
  const entityId = c.req.param('id');
  if (!entityId) throw badRequest('VALIDATION_ERROR', '缺少实体 ID');

  const [byAction, first, last, total] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { entityType, entityId },
      _count: { _all: true },
    }),
    prisma.auditLog.findFirst({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, actorName: true },
    }),
    prisma.auditLog.findFirst({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, actorName: true },
    }),
    prisma.auditLog.count({ where: { entityType, entityId } }),
  ]);
  if (total === 0) throw notFound('NOT_FOUND', '该实体暂无审计记录');

  return c.json({
    entityType,
    entityId,
    total,
    byAction: byAction.map((r) => ({ action: r.action, count: r._count._all })),
    firstSeenAt: first?.createdAt ?? null,
    firstSeenBy: first?.actorName ?? null,
    lastSeenAt: last?.createdAt ?? null,
    lastSeenBy: last?.actorName ?? null,
  });
});

export default audit;
