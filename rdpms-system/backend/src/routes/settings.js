import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest } from '../kernel/http.js';

/**
 * /api/settings（M-1 §6.5）：
 *   GET   settings.view   —— SUPER_ADMIN / ADMIN 200，其他 403
 *   PATCH settings.update —— SUPER_ADMIN 200，ADMIN 403（8 项高危之一）
 */
const settings = new Hono();

settings.use('*', authenticate);

settings.get('/', requirePermission('settings.view'), async (c) => {
  const rows = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  return c.json({
    items: rows,
    settings: Object.fromEntries(rows.map((r) => [r.key, r.value])),
  });
});

settings.patch('/', requirePermission('settings.update'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const patch = body?.settings ?? body?.values;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw badRequest('VALIDATION_ERROR', '请求体必须包含 settings 对象');
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) throw badRequest('NO_VALID_FIELDS', '没有可更新的配置项');

  const before = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const beforeMap = Object.fromEntries(before.map((r) => [r.key, r.value]));

  for (const [key, value] of Object.entries(patch)) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value, updatedById: auth.userId },
      create: { key, value, updatedById: auth.userId, isPublic: false },
    });
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'SYSTEM_SETTING',
    before: beforeMap,
    after: patch,
    changedFields: keys,
    metadata: { permissionCode: 'settings.update', keys },
  });
  return c.json({ updated: keys });
});

export default settings;
