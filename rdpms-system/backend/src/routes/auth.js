import { Hono } from 'hono';
import { prisma } from '../index.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {
  authenticate,
  signAccessToken,
  getAuth,
  JWT_SECRET,
} from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit, requestCtx } from '../kernel/audit.js';
import { badRequest, unauthorized } from '../kernel/http.js';

const auth = new Hono();

const REFRESH_TTL_DAYS = 7;

if (!process.env.JWT_SECRET) {
  console.warn('[auth] ⚠️  JWT_SECRET 未设置，正在使用开发默认值（生产必须显式配置）');
}

// ── 会话工具 ──────────────────────────────────────────────────────────────────
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function issueRefreshToken(userId, c) {
  const raw = crypto.randomBytes(48).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      familyId: crypto.randomUUID(),
      userAgent: c.req.header('User-Agent')?.slice(0, 512) || null,
      ip: requestCtx(c).ip,
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
    },
  });
  return raw;
}

async function writeSystemLog(entry) {
  try {
    await prisma.systemLog.create({
      data: {
        level: entry.level ?? 'INFO',
        category: entry.category ?? 'auth',
        action: entry.action,
        message: entry.message ?? '',
        context: entry.context ?? undefined,
        userId: entry.userId ?? null,
        ip: entry.ip ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  } catch (err) {
    console.error('[auth] systemLog 写入失败:', err?.message || err);
  }
}

async function loadPermissions(user) {
  if (user.systemRole === 'SUPER_ADMIN') return undefined; // 由调用方短路
  const bindings = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } },
  });
  return [...new Set(bindings.flatMap((b) => b.role.permissions.map((p) => p.permission.code)))];
}

/** CurrentUser 响应形状（M-1 §6.1）：permissions 为唯一权限出口 */
async function currentUserPayload(user) {
  const permissions = await loadPermissions(user);
  return {
    id: user.id,
    username: user.username,
    name: user.displayName, // 兼容字段：FE 读取 name
    displayName: user.displayName,
    email: user.email,
    position: user.position,
    department: user.department,
    phone: user.phone,
    systemRole: user.systemRole,
    role: user.systemRole, // 兼容字段：FE 旧读取 role
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    avatar: user.avatarFileId,
    avatarFileId: user.avatarFileId,
    permissions: permissions ?? [],
  };
}

// ── 登录 ─────────────────────────────────────────────────────────────────────
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password) {
    throw badRequest('VALIDATION_ERROR', '用户名和密码不能为空');
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const ctx = requestCtx(c);

  if (!user) {
    await writeAudit(prisma, {
      c,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: 'USER',
      entityLabel: username,
      metadata: { reason: 'user_not_found' },
    });
    return c.json({ error: '用户名或密码错误', code: 'BAD_CREDENTIALS' }, 401);
  }

  if (user.status === 'DISABLED') {
    return c.json({ error: '账号已停用，请联系管理员', code: 'ACCOUNT_DISABLED' }, 403);
  }
  if (user.status === 'LOCKED' || (user.lockedUntil && user.lockedUntil > new Date())) {
    return c.json({ error: '账号已锁定，请稍后再试', code: 'ACCOUNT_LOCKED' }, 403);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const maxAttempts = 5;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= maxAttempts ? new Date(Date.now() + 15 * 60 * 1000) : null,
        status: attempts >= maxAttempts ? 'LOCKED' : user.status,
      },
    });
    await writeAudit(prisma, {
      c,
      actorId: user.id,
      actorName: user.displayName,
      actorRole: user.systemRole,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: 'USER',
      entityId: user.id,
      entityLabel: user.username,
      metadata: { attempts },
    });
    return c.json({ error: '用户名或密码错误', code: 'BAD_CREDENTIALS' }, 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ctx.ip,
    },
  });

  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, c);

  await writeAudit(prisma, {
    c,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.systemRole,
    action: AUDIT_ACTIONS.LOGIN,
    entityType: 'USER',
    entityId: user.id,
    entityLabel: user.username,
  });
  await writeSystemLog({ ...ctx, action: 'login', userId: user.id, message: `${user.username} 登录成功` });

  const permissions = await loadPermissions(user);
  return c.json({
    accessToken,
    refreshToken,
    expiresIn: 7200,
    token: accessToken, // 兼容旧客户端字段
    user: {
      ...(await currentUserPayload(user)),
      permissions: permissions ?? [],
    },
  });
});

// ── 刷新 ─────────────────────────────────────────────────────────────────────
auth.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json().catch(() => ({}));
  if (!refreshToken) throw badRequest('VALIDATION_ERROR', '缺少 refreshToken');
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) }, include: { user: true } });
  if (!row || row.revokedAt || row.expiresAt < new Date() || !row.user || row.user.status !== 'ACTIVE') {
    throw unauthorized('INVALID_REFRESH_TOKEN', '刷新令牌无效或已过期');
  }
  // 轮换：旧令牌立即吊销
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  const accessToken = signAccessToken(row.user);
  const newRefresh = await issueRefreshToken(row.user.id, c);
  await writeAudit(prisma, {
    c,
    actorId: row.user.id,
    actorRole: row.user.systemRole,
    action: AUDIT_ACTIONS.TOKEN_REFRESH,
    entityType: 'USER',
    entityId: row.user.id,
  });
  return c.json({ accessToken, refreshToken: newRefresh, expiresIn: 7200 });
});

// ── 登出 ─────────────────────────────────────────────────────────────────────
auth.post('/logout', authenticate, async (c) => {
  const { refreshToken } = await c.req.json().catch(() => ({}));
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const { user } = getAuth(c);
  const ctx = requestCtx(c);
  await writeAudit(prisma, {
    c,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.systemRole,
    action: AUDIT_ACTIONS.LOGOUT,
    entityType: 'USER',
    entityId: user.id,
  });
  await writeSystemLog({ ...ctx, action: 'logout', userId: user.id, message: `${user.username} 登出` });
  return c.json({ success: true });
});

// ── 当前用户（M-1 权限唯一出口）──────────────────────────────────────────────
auth.get('/me', authenticate, async (c) => {
  const { user } = getAuth(c);
  return c.json(await currentUserPayload(user));
});

// 旧端点兼容：/verify 返回与 /me 一致
auth.post('/verify', authenticate, async (c) => {
  const { user } = getAuth(c);
  return c.json({ valid: true, user: await currentUserPayload(user) });
});

auth.get('/profile', authenticate, async (c) => {
  const { user } = getAuth(c);
  return c.json(await currentUserPayload(user));
});

// ── 修改密码 ─────────────────────────────────────────────────────────────────
async function applyPasswordChange(c, user, newPassword, { force = false } = {}) {
  if (typeof newPassword !== 'string' || newPassword.length < 12) {
    throw badRequest('WEAK_PASSWORD', '新密码长度不能少于 12 位');
  }
  const weak = ['admin123', '123456', 'please-change', 'password', 'admin', 'changeme', 'test1234'];
  if (weak.some((w) => newPassword.toLowerCase().includes(w))) {
    throw badRequest('WEAK_PASSWORD', '新密码命中弱口令黑名单');
  }
  if (!force) {
    const valid = await bcrypt.compare(c.get('plainOldPassword') ?? '', user.passwordHash);
    if (!valid) throw badRequest('WRONG_OLD_PASSWORD', '旧密码错误');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  // 改密后吊销全部刷新令牌
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAudit(prisma, {
    c,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.systemRole,
    action: AUDIT_ACTIONS.PASSWORD_CHANGE,
    entityType: 'USER',
    entityId: user.id,
    entityLabel: user.username,
  });
}

auth.put('/password', authenticate, async (c) => {
  const authCtx = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  c.set('plainOldPassword', body?.oldPassword ?? '');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: authCtx.user.id } });
  await applyPasswordChange(c, user, body?.newPassword, { force: false });
  return c.json({ success: true });
});

// 首登强制改密：无需旧密码，但仅当 mustChangePassword=true
auth.put('/password/force', authenticate, async (c) => {
  const authCtx = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: authCtx.user.id } });
  if (!user.mustChangePassword) {
    throw badRequest('FORBIDDEN', '当前账号不处于强制改密状态');
  }
  await applyPasswordChange(c, user, body?.newPassword, { force: true });
  return c.json({ success: true });
});

export { authenticate as authMiddleware };
export default auth;
