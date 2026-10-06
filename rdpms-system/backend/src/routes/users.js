import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import bcrypt from 'bcryptjs';
import { withAccountCommand, assertGrantedRoles, ACCOUNT_RANK } from '../modules/auth/accountPolicy.js';
import { writeAuditStrict } from '../platform/audit/strictAudit.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS, USER_UPDATE_FIELDS, SYSTEM_ROLES } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, notFound, parsePaging, paged } from '../kernel/http.js';

const users = new Hono();

users.use('*', authenticate);

// ── 列表（users.view）────────────────────────────────────────────────────────
users.get('/', requirePermission('users.view'), async (c) => {
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 50);
  const { department, status, keyword, systemRole } = c.req.query();

  const where = {};
  if (department) where.department = department;
  if (status) where.status = status;
  if (systemRole) where.systemRole = systemRole;
  if (keyword) {
    where.OR = [
      { username: { contains: keyword } },
      { displayName: { contains: keyword } },
      { department: { contains: keyword } },
    ];
  }

  where.deletedAt = null; // 软删用户不出现在列表中

  const [total, list] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, username: true, displayName: true, email: true,
        position: true, department: true, phone: true, systemRole: true,
        status: true, avatarFileId: true, mustChangePassword: true,
        lastLoginAt: true, createdAt: true,
      },
    }),
  ]);
  return c.json({ ...paged(list, total, { page, pageSize }), list });
});

// ── 单个（users.view）────────────────────────────────────────────────────────
users.get('/:id', requirePermission('users.view'), async (c) => {
  const id = c.req.param('id');
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, username: true, displayName: true, email: true, position: true,
      department: true, phone: true, systemRole: true, status: true, avatarFileId: true,
      mustChangePassword: true, lastLoginAt: true, createdAt: true,
      memberships: {
        where: { leftAt: null },
        include: { project: { select: { id: true, name: true, code: true } } },
      },
      managedProjects: { select: { id: true, name: true, code: true } },
    },
  });
  if (!user) throw notFound('USER_NOT_FOUND', '用户不存在');
  return c.json(user);
});

// ── 创建（users.create；systemRole 由服务端固定 MEMBER，M-1 §7.3）───────────
users.post('/', requirePermission('users.create'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(
    body,
    ['username', 'password', 'displayName', 'position', 'department', 'phone', 'email'],
    { entityLabel: '创建用户' },
  );
  const username = String(data.username).trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,64}$/.test(username)) {
    throw badRequest('VALIDATION_ERROR', '用户名仅允许小写字母/数字/下划线/中划线，2-64 位');
  }
  if (typeof data.password !== 'string' || data.password.length < 12) {
    throw badRequest('WEAK_PASSWORD', '初始密码长度不能少于 12 位');
  }
  const weak = ['admin123', '123456', 'please-change', 'password', 'admin', 'changeme', 'test1234'];
  if (weak.some((w) => data.password.toLowerCase().includes(w))) {
    throw badRequest('WEAK_PASSWORD', '初始密码命中弱口令黑名单');
  }

  const exists = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (exists) throw badRequest('USERNAME_EXISTS', '用户名已存在');

  const auth = getAuth(c);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const created = await prisma.user.create({
    data: {
      username,
      passwordHash,
      displayName: data.displayName,
      position: data.position ?? null,
      department: data.department ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      systemRole: 'MEMBER', // 策略固定：新用户默认 MEMBER，角色提升走 roles.assign_user
      status: 'ACTIVE',
      mustChangePassword: true,
      createdById: auth.userId,
    },
    select: { id: true, username: true, displayName: true, systemRole: true, status: true, createdAt: true },
  });

  // 绑定 MEMBER 系统角色，保证 systemRole 与 UserRole 一致
  const memberRole = await prisma.role.findUnique({ where: { code: 'MEMBER' } });
  if (memberRole) {
    await prisma.userRole.create({ data: { userId: created.id, roleId: memberRole.id, assignedById: auth.userId } });
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'USER',
    entityId: created.id,
    entityLabel: created.username,
    after: { username: created.username, systemRole: created.systemRole },
    metadata: { permissionCode: 'users.create' },
  });
  return c.json(created, 201);
});

// ── 批量导入（users.create；Tencent POST /users/batch 复刻，逐条校验逐条落库）──
users.post('/batch', requirePermission('users.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const userList = body?.users;
  if (!Array.isArray(userList) || userList.length === 0) {
    throw badRequest('VALIDATION_ERROR', 'users 列表不能为空');
  }
  if (userList.length > 200) {
    throw badRequest('VALIDATION_ERROR', '单批最多 200 条');
  }

  const weak = ['admin123', '123456', 'please-change', 'password', 'admin', 'changeme', 'test1234'];
  const success = [];
  const failed = [];

  for (const [index, item] of userList.entries()) {
    const rawUsername = typeof item?.username === 'string' ? item.username.trim().toLowerCase() : '';
    try {
      // Tencent 字段名 name 与 enh displayName 兼容
      const displayName = item?.displayName ?? item?.name;
      if (!rawUsername || !item?.password || !displayName) {
        throw new Error('缺少必填字段 username/password/displayName');
      }
      if (!/^[a-z0-9_-]{2,64}$/.test(rawUsername)) {
        throw new Error('用户名仅允许小写字母/数字/下划线/中划线，2-64 位');
      }
      if (typeof item.password !== 'string' || item.password.length < 12) {
        throw new Error('初始密码长度不能少于 12 位');
      }
      if (weak.some((w) => item.password.toLowerCase().includes(w))) {
        throw new Error('初始密码命中弱口令黑名单');
      }
      const exists = await prisma.user.findUnique({ where: { username: rawUsername }, select: { id: true } });
      if (exists) throw new Error('用户名已存在');

      const passwordHash = await bcrypt.hash(item.password, 12);
      const created = await prisma.user.create({
        data: {
          username: rawUsername,
          passwordHash,
          displayName: String(displayName),
          position: item.position ?? null,
          department: item.department ?? null,
          phone: item.phone ?? null,
          email: item.email ?? null,
          systemRole: 'MEMBER', // 策略与单建一致：默认 MEMBER，提升走 roles.assign_user
          status: 'ACTIVE',
          mustChangePassword: true,
          createdById: auth.userId,
        },
        select: { id: true, username: true, displayName: true, systemRole: true, status: true },
      });
      const memberRole = await prisma.role.findUnique({ where: { code: 'MEMBER' }, select: { id: true } });
      if (memberRole) {
        await prisma.userRole.create({ data: { userId: created.id, roleId: memberRole.id, assignedById: auth.userId } });
      }
      success.push({ id: created.id, username: created.username, displayName: created.displayName });
    } catch (err) {
      failed.push({ index, username: rawUsername || item?.username || null, reason: err?.message || '创建失败' });
    }
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'USER',
    entityLabel: `批量导入 ${success.length}/${userList.length}`,
    after: { total: userList.length, created: success.length, failed: failed.length },
    metadata: {
      permissionCode: 'users.create',
      batch: true,
      failedUsernames: failed.map((f) => f.username).filter(Boolean),
    },
  });
  return c.json({ success, failed }, 201);
});

// ── 更新（users.update；白名单 M-1 §6.3）────────────────────────────────────
users.put('/:id', requirePermission('users.update'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const data = pickAllowed(body, USER_UPDATE_FIELDS, { entityLabel: '更新用户' });

  const before = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, displayName: true, position: true, department: true, phone: true, email: true },
  });
  if (!before) throw notFound('USER_NOT_FOUND', '用户不存在');

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, username: true, displayName: true, email: true, position: true,
      department: true, phone: true, systemRole: true, status: true, updatedAt: true,
    },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'USER',
    entityId: id,
    entityLabel: before.username,
    before,
    after: updated,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'users.update' },
  });
  return c.json(updated);
});

// ── 启停（users.enable / users.disable）──────────────────────────────────────
users.patch('/:id/status', async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const nextStatus = body?.status;
  if (!['ACTIVE', 'DISABLED'].includes(nextStatus)) throw badRequest('VALIDATION_ERROR', 'status 仅允许 ACTIVE / DISABLED');
  const permission = nextStatus === 'ACTIVE' ? 'users.enable' : 'users.disable';
  await withAccountCommand(prisma, auth.userId, id, permission, async (tx, actor, target) => {
    await tx.user.update({ where: { id }, data: { status: nextStatus, securityVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null } });
    await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditStrict(tx, { c, actorId: actor.id, actorName: actor.displayName, actorRole: actor.systemRole,
      action: AUDIT_ACTIONS.STATUS_CHANGE, entityType: 'USER', entityId: id, entityLabel: target.username,
      before: { status: target.status }, after: { status: nextStatus }, metadata: { permissionCode: permission } });
  }, auth.user.securityVersion);
  return c.json({ id, status: nextStatus });
});

// ── 角色绑定唯一入口（roles.assign_user；M-1 §6.3）──────────────────────────
users.put('/:id/roles', requirePermission('roles.assign_user'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const roleCodes = body?.roleCodes ?? (body?.roleCode ? [body.roleCode] : null);
  if (!Array.isArray(roleCodes) || !roleCodes.length || roleCodes.some(rc => typeof rc !== 'string' || !SYSTEM_ROLES.includes(rc))
    || new Set(roleCodes).size !== roleCodes.length) throw badRequest('VALIDATION_ERROR', 'roleCodes 必须是不重复的系统角色编码');
  await withAccountCommand(prisma, auth.userId, id, 'roles.assign_user', async (tx, actor, target) => {
    assertGrantedRoles(actor, roleCodes);
    const roles = await tx.role.findMany({ where: { code: { in: roleCodes } } });
    if (roles.length !== roleCodes.length) throw badRequest('VALIDATION_ERROR', '未知的角色编码');
    const systemRole = [...roleCodes].sort((a, b) => ACCOUNT_RANK[b] - ACCOUNT_RANK[a])[0];
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userRole.createMany({ data: roles.map(r => ({ userId: id, roleId: r.id, assignedById: actor.id })) });
    await tx.user.update({ where: { id }, data: { systemRole, securityVersion: { increment: 1 } } });
    await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditStrict(tx, { c, actorId: actor.id, actorName: actor.displayName, actorRole: actor.systemRole,
      action: AUDIT_ACTIONS.PERMISSION_CHANGE, entityType: 'USER', entityId: id, entityLabel: target.username,
      before: { systemRole: target.systemRole }, after: { systemRole, roleCodes }, metadata: { permissionCode: 'roles.assign_user' } });
  }, auth.user.securityVersion);
  return c.json({ id, roleCodes });
});

// ── 重置密码（users.reset_password）──────────────────────────────────────────
users.put('/:id/reset-password', requirePermission('users.reset_password'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const newPassword = body?.newPassword;
  if (typeof newPassword !== 'string' || newPassword.length < 12) {
    throw badRequest('WEAK_PASSWORD', '新密码长度不能少于 12 位');
  }
  const weak = ['admin123', '123456', 'please-change', 'password', 'admin', 'changeme', 'test1234'];
  if (weak.some((w) => newPassword.toLowerCase().includes(w))) {
    throw badRequest('WEAK_PASSWORD', '新密码命中弱口令黑名单');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await withAccountCommand(prisma, auth.userId, id, 'users.reset_password', async (tx, actor, target) => {
    const changedAt = new Date();
    await tx.user.update({ where: { id }, data: { passwordHash, securityVersion: { increment: 1 }, mustChangePassword: true,
      passwordChangedAt: changedAt, failedLoginAttempts: 0, lockedUntil: null } });
    await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: changedAt } });
    await writeAuditStrict(tx, { c, actorId: actor.id, actorName: actor.displayName, actorRole: actor.systemRole,
      action: AUDIT_ACTIONS.PASSWORD_CHANGE, entityType: 'USER', entityId: id, entityLabel: target.username,
      metadata: { permissionCode: 'users.reset_password' } });
  }, auth.user.securityVersion);
  return c.json({ success: true });
});

// ── 删除（users.delete，8 项高危之一，仅 SUPER_ADMIN 持有）──────────────────
users.delete('/:id', requirePermission('users.delete'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  await withAccountCommand(prisma, auth.userId, id, 'users.delete', async (tx, actor, target) => {
    const changedAt = new Date();
    await tx.user.update({ where: { id }, data: { deletedAt: changedAt, status: 'DISABLED', securityVersion: { increment: 1 } } });
    await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: changedAt } });
    await tx.userRole.deleteMany({ where: { userId: id } });
    await writeAuditStrict(tx, { c, actorId: actor.id, actorName: actor.displayName, actorRole: actor.systemRole,
      action: AUDIT_ACTIONS.DELETE, entityType: 'USER', entityId: id, entityLabel: target.username,
      metadata: { permissionCode: 'users.delete', softDelete: true } });
  }, auth.user.securityVersion);
  return c.json({ id, softDeleted: true });
});

export default users;
