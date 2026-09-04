import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS, P0_PERMISSIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/roles —— 角色与角色权限（M-1 P0）。
 *   GET    /api/roles                  roles.view
 *   POST   /api/roles                  roles.create
 *   PATCH  /api/roles/:id              roles.update
 *   DELETE /api/roles/:id              roles.delete
 *   POST   /api/roles/:id/permissions  roles.assign_permissions
 */
const roles = new Hono();

roles.use('*', authenticate);

// GET /permission-catalog —— P0 权限目录（roles.view；权限分配弹窗数据源）
roles.get('/permission-catalog', requirePermission('roles.view'), async (c) => {
  const rows = await prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, code: true, name: true, module: true, isHighRisk: true, sortOrder: true },
  });
  return c.json({ items: rows, list: rows, total: rows.length });
});

roles.get('/', requirePermission('roles.view'), async (c) => {
  const list = await prisma.role.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      permissions: { include: { permission: { select: { code: true, name: true, isHighRisk: true } } } },
      users: { where: { user: { deletedAt: null } }, select: { userId: true } },
    },
  });
  return c.json({
    items: list.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      sortOrder: r.sortOrder,
      userCount: r.users.length,
      permissionCodes: r.permissions.map((p) => p.permission.code),
    })),
    list: list.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      sortOrder: r.sortOrder,
      userCount: r.users.length,
      permissionCodes: r.permissions.map((p) => p.permission.code),
    })),
  });
});

roles.post('/', requirePermission('roles.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(body, ['code', 'name', 'description'], { entityLabel: '创建角色' });
  if (!data.code || !data.name) throw badRequest('VALIDATION_ERROR', 'code 与 name 必填');
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(data.code)) {
    throw badRequest('VALIDATION_ERROR', '角色 code 仅允许大写字母/数字/下划线');
  }
  const exists = await prisma.role.findUnique({ where: { code: data.code } });
  if (exists) throw badRequest('CODE_EXISTS', '角色编码已存在');

  const maxOrder = await prisma.role.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.role.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description ?? null,
      isSystem: false,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      createdById: auth.userId,
    },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'ROLE',
    entityId: created.id,
    entityLabel: created.code,
    metadata: { permissionCode: 'roles.create' },
  });
  return c.json(created, 201);
});

roles.patch('/:id', requirePermission('roles.update'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const data = pickAllowed(await c.req.json().catch(() => null), ['name', 'description'], { entityLabel: '更新角色' });
  const before = await prisma.role.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('ROLE_NOT_FOUND', '角色不存在');

  const updated = await prisma.role.update({ where: { id }, data });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'ROLE',
    entityId: id,
    entityLabel: before.code,
    before: { name: before.name, description: before.description },
    after: updated,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'roles.update' },
  });
  return c.json(updated);
});

roles.delete('/:id', requirePermission('roles.delete'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const before = await prisma.role.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { users: true } } },
  });
  if (!before) throw notFound('ROLE_NOT_FOUND', '角色不存在');
  if (before.isSystem) throw badRequest('SYSTEM_ROLE', '系统内置角色不可删除');
  if (before._count.users > 0) throw badRequest('ROLE_IN_USE', '角色仍被用户绑定，先解除绑定');

  await prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'ROLE',
    entityId: id,
    entityLabel: before.code,
    metadata: { permissionCode: 'roles.delete' },
  });
  return c.json({ id });
});

roles.post('/:id/permissions', requirePermission('roles.assign_permissions'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const permissionCodes = body?.permissionCodes;
  if (!Array.isArray(permissionCodes)) {
    throw badRequest('VALIDATION_ERROR', 'permissionCodes 必须是数组');
  }
  const role = await prisma.role.findFirst({ where: { id, deletedAt: null } });
  if (!role) throw notFound('ROLE_NOT_FOUND', '角色不存在');
  if (role.code === 'SUPER_ADMIN') {
    throw badRequest('SYSTEM_ROLE', 'SUPER_ADMIN 固定持有全部 P0，不可修改');
  }

  const invalid = permissionCodes.filter((code) => !P0_PERMISSIONS.includes(code));
  if (invalid.length) {
    throw badRequest('VALIDATION_ERROR', `以下权限码不在 P0 清单中: ${invalid.join(', ')}`, { invalidCodes: invalid });
  }
  const perms = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
    }),
  ]);

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.PERMISSION_CHANGE,
    entityType: 'ROLE',
    entityId: id,
    entityLabel: role.code,
    after: { permissionCodes },
    metadata: { permissionCode: 'roles.assign_permissions', count: perms.length },
  });
  return c.json({ id, permissionCodes });
});

export default roles;
