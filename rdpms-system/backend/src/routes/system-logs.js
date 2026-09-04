import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate, requirePermission } from '../kernel/rbac.js';
import { parsePaging, paged } from '../kernel/http.js';

/**
 * GET /api/system-logs —— system.logs.view
 * 授权矩阵（M-1 §6.5）：SUPER_ADMIN 200 / AUDITOR 200 / ADMIN 403。
 */
const systemLogs = new Hono();

systemLogs.use('*', authenticate);

systemLogs.get('/system-logs', requirePermission('system.logs.view'), async (c) => {
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 20);
  const { level, category, action, userId, dateFrom, dateTo } = c.req.query();

  const where = {};
  if (level) where.level = level;
  if (category) where.category = category;
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const [total, list] = await Promise.all([
    prisma.systemLog.count({ where }),
    prisma.systemLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, displayName: true, username: true } } },
    }),
  ]);
  return c.json({ ...paged(list, total, { page, pageSize }), list });
});

export default systemLogs;
