import { Hono } from 'hono';
import { prisma } from '../index.js';
import bcrypt from 'bcryptjs';
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

  if (nextStatus === 'ACTIVE') {
    if (!auth.permissions.includes('users.enable')) {
      throw badRequest('PERMISSION_DENIED', '缺少权限 users.enable');
    }
  } else if (nextStatus === 'DISABLED') {
    if (!auth.permissions.includes('users.disable')) {
      throw badRequest('PERMISSION_DENIED', '缺少权限 users.disable');
    }
  } else {
    throw badRequest('VALIDATION_ERROR', 'status 仅允许 ACTIVE / DISABLED');
  }
  if (id === auth.userId && nextStatus === 'DISABLED') {
    throw badRequest('VALIDATION_ERROR', '不能停用自己');
  }

  const before = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, status: true } });
  if (!before) throw notFound('USER_NOT_FOUND', '用户不存在');

  await prisma.user.update({
    where: { id },
    data: { status: nextStatus, failedLoginAttempts: 0, lockedUntil: null },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    entityType: 'USER',
    entityId: id,
    entityLabel: before.username,
    before: { status: before.status },
    after: { status: nextStatus },
    metadata: { permissionCode: nextStatus === 'ACTIVE' ? 'users.enable' : 'users.disable' },
  });
  return c.json({ id, status: nextStatus });
});

// ── 角色绑定唯一入口（roles.assign_user；M-1 §6.3）──────────────────────────
users.put('/:id/roles', requirePermission('roles.assign_user'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const roleCodes = body?.roleCodes ?? (body?.roleCode ? [body.roleCode] : null);
  if (!Array.isArray(roleCodes) || roleCodes.length === 0) {
    throw badRequest('VALIDATION_ERROR', 'roleCodes 不能为空');
  }
  const invalid = roleCodes.filter((rc) => !SYSTEM_ROLES.includes(rc));
  if (invalid.length) throw badRequest('VALIDATION_ERROR', `非法角色: ${invalid.join(', ')}`);

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, systemRole: true } });
  if (!target) throw notFound('USER_NOT_FOUND', '用户不存在');

  const roles = await prisma.role.findMany({ where: { code: { in: roleCodes } } });
  if (roles.length !== roleCodes.length) throw badRequest('VALIDATION_ERROR', '存在未知的角色编码');

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: id } }),
    prisma.userRole.createMany({
      data: roles.map((r) => ({ userId: id, roleId: r.id, assignedById: auth.userId })),
    }),
    // systemRole 与 UserRole 绑定保持一致（取排序最高角色）
    prisma.user.update({
      where: { id },
      data: { systemRole: roleCodes.includes(target.systemRole) ? target.systemRole : roleCodes[0] },
    }),
  ]);

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.PERMISSION_CHANGE,
    entityType: 'USER',
    entityId: id,
    entityLabel: target.username,
    before: { systemRole: target.systemRole },
    after: { roleCodes },
    metadata: { permissionCode: 'roles.assign_user' },
  });
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
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
  if (!target) throw notFound('USER_NOT_FOUND', '用户不存在');

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: true,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.PASSWORD_CHANGE,
    entityType: 'USER',
    entityId: id,
    entityLabel: target.username,
    metadata: { permissionCode: 'users.reset_password', targetUser: target.username },
  });
  return c.json({ success: true });
});

// ── 删除（users.delete，8 项高危之一，仅 SUPER_ADMIN 持有）──────────────────
users.delete('/:id', requirePermission('users.delete'), async (c) => {
  const id = c.req.param('id');
  const auth = getAuth(c);
  if (id === auth.userId) throw badRequest('VALIDATION_ERROR', '不能删除自己');

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, deletedAt: true },
  });
  if (!target) throw notFound('USER_NOT_FOUND', '用户不存在');
  if (target.deletedAt) return c.json({ id, alreadyDeleted: true });

  // ⚠️ 合规约束：audit_logs 为 append-only（DB 触发器禁止 UPDATE/DELETE），
  //    而 AuditLog.actor 关系为 onDelete: SetNull —— 硬删用户会触发对审计行的 UPDATE，
  //    被触发器拒绝并导致 500。因此删除一律走软删（deletedAt + DISABLED），
  //    既保留审计链条完整性，又不触碰 append-only 约束。
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DISABLED' },
    });
    await tx.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.userRole.deleteMany({ where: { userId: id } });
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'USER',
    entityId: id,
    entityLabel: target.username,
    metadata: { permissionCode: 'users.delete', softDelete: true },
  });
  return c.json({ id, softDeleted: true });
});

export default users;
