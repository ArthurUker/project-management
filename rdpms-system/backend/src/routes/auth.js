import { Hono } from 'hono';
import { setRequestDatasetEpoch } from '../platform/requestContext.js';
import { assertRecoveryAvailable } from '../platform/recovery/dataEpoch.js';
import { prisma } from '../platform/db/client.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {
  authenticate,
  signAccessToken,
  getAuth,
  JWT_SECRET,
  parseTtlToSec,
  accessTokenExpiresInSeconds,
} from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit, requestCtx } from '../kernel/audit.js';
import { writeAuditStrict } from '../platform/audit/strictAudit.js';
import { badRequest, unauthorized } from '../kernel/http.js';

const auth = new Hono();

// 刷新令牌有效期（W12 对齐环境变量）：支持 "7d"/"12h" 等格式，缺省 7 天（M-1 口径）
const REFRESH_TTL_SEC = parseTtlToSec(process.env.JWT_REFRESH_TTL, 'JWT_REFRESH_TTL') ?? 7 * 86400;

if (!process.env.JWT_SECRET) {
  console.warn('[auth] ⚠️  JWT_SECRET 未设置，正在使用开发默认值（生产必须显式配置）');
}

// ── 会话工具 ──────────────────────────────────────────────────────────────────
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function issueRefreshToken(userId, c, db = prisma, familyId = crypto.randomUUID()) {
  const raw = crypto.randomBytes(48).toString('hex');
  await db.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      familyId,
      userAgent: c.req.header('User-Agent')?.slice(0, 512) || null,
      ip: requestCtx(c).ip,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
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
  // SUPER_ADMIN 的权限 = 全部权限码（与同步入口 acl.permissions 同口径）。
  // 修复：此前返回 undefined，调用方回落成 []，导致超管登录后前端拿不到任何权限点、
  // 界面全面 403（后端仍放行，属「前后端口径不一致」缺陷；单元用例 RF03-U-perm 覆盖）。
  if (user.systemRole === 'SUPER_ADMIN') {
    const all = await prisma.permission.findMany({ select: { code: true } });
    return all.map((p) => p.code).sort();
  }
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
  const dataset = await prisma.dataRecoveryState.findUniqueOrThrow({ where: { id: 1 } });
  await assertRecoveryAvailable(prisma, c.req.method, c.req.path);
  setRequestDatasetEpoch(dataset.epoch);
  const body = await c.req.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password) {
    throw badRequest('VALIDATION_ERROR', '用户名和密码不能为空');
  }

  // 纵深防御（t19）：软删用户直接按"不存在"处理——不再依赖 status 是否同步置为 DISABLED
  const user = await prisma.user.findFirst({ where: { username, deletedAt: null } });
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
  const loginCheckedAt = new Date();
  // LOCKED without an expiry represents a non-temporary/manual hold. A timed lock
  // is enforced only while its deadline is in the future and may recover on login.
  if ((user.status === 'LOCKED' && (!user.lockedUntil || user.lockedUntil > loginCheckedAt))
    || (user.lockedUntil && user.lockedUntil > loginCheckedAt)) {
    return c.json({ error: '账号已锁定，请稍后再试', code: 'ACCOUNT_LOCKED' }, 403);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const maxAttempts = 5;
    const failed = await prisma.$transaction(async (tx) => {
      // Atomic increment under a row update lock: simultaneous failures cannot
      // overwrite one another with the same stale absolute count.
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          OR: [
            { status: 'ACTIVE', OR: [{ lockedUntil: null }, { lockedUntil: { lte: loginCheckedAt } }] },
            { status: 'LOCKED', lockedUntil: { lte: loginCheckedAt } },
            // Preserve existing PENDING_ACTIVATION credential behavior; it is
            // not converted to ACTIVE by a login success or failure update.
            {
              status: 'PENDING_ACTIVATION',
              OR: [{ lockedUntil: null }, { lockedUntil: { lte: loginCheckedAt } }],
            },
          ],
        },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      if (changed.count !== 1) return null;
      const latest = await tx.user.findUnique({
        where: { id: user.id },
        select: { failedLoginAttempts: true },
      });
      if (!latest) return null;
      const attempts = latest.failedLoginAttempts;
      const locked = attempts >= maxAttempts;
      if (locked) {
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        await tx.user.updateMany({
          where: { id: user.id, status: { in: ['ACTIVE', 'LOCKED'] } },
          data: { status: 'LOCKED', lockedUntil },
        });
        // Pending activation remains pending. The shared lockedUntil check at
        // login entry enforces the same temporary lock without activating it.
        await tx.user.updateMany({
          where: {
            id: user.id,
            status: 'PENDING_ACTIVATION',
            failedLoginAttempts: { gte: maxAttempts },
            OR: [{ lockedUntil: null }, { lockedUntil: { lte: loginCheckedAt } }],
          },
          data: { lockedUntil },
        });
      }
      return { attempts, locked };
    });
    const current = failed ? null : await prisma.user.findUnique({
      where: { id: user.id },
      select: { status: true, failedLoginAttempts: true, lockedUntil: true },
    });
    if (current?.status === 'DISABLED') {
      return c.json({ error: '账号已停用，请联系管理员', code: 'ACCOUNT_DISABLED' }, 403);
    }
    if (current && ((current.status === 'LOCKED' && (!current.lockedUntil || current.lockedUntil > new Date()))
      || (current.lockedUntil && current.lockedUntil > new Date()))) {
      return c.json({ error: '账号已锁定，请稍后再试', code: 'ACCOUNT_LOCKED' }, 403);
    }
    const attempts = failed?.attempts ?? current?.failedLoginAttempts ?? user.failedLoginAttempts;
    await writeAudit(prisma, {
      c,
      actorId: user.id,
      actorName: user.displayName,
      actorRole: user.systemRole,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: 'USER',
      entityId: user.id,
      entityLabel: user.username,
      metadata: { attempts, locked: Boolean(failed?.locked) },
    });
    return c.json({ error: '用户名或密码错误', code: 'BAD_CREDENTIALS' }, 401);
  }

  const loginSucceededAt = new Date();
  const resetLoginState = {
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: loginSucceededAt,
    lastLoginIp: ctx.ip,
  };
  // Expired LOCKED rows are the legacy representation of a timed login lock.
  // Recover them only after correct credentials; never turn DISABLED back on.
  const reset = user.status === 'LOCKED'
    ? await prisma.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash, securityVersion: user.securityVersion, status: 'LOCKED', lockedUntil: { lte: loginSucceededAt } },
      data: { ...resetLoginState, status: 'ACTIVE' },
    })
    : await prisma.user.updateMany({
      where: {
        id: user.id,
        status: user.status,
        passwordHash: user.passwordHash,
        securityVersion: user.securityVersion,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: loginSucceededAt } }],
      },
      data: resetLoginState,
    });
  if (reset.count !== 1) {
    const current = await prisma.user.findUnique({ where: { id: user.id }, select: { status: true, securityVersion: true, passwordHash: true } });
    if (!current || current.status === 'DISABLED') {
      return c.json({ error: '账号已停用，请联系管理员', code: 'ACCOUNT_DISABLED' }, 403);
    }
    if (current.securityVersion !== user.securityVersion || current.passwordHash !== user.passwordHash) return c.json({ error: '凭据已改变，请重新登录', code: 'LOGIN_STATE_CHANGED' }, 401);
    return c.json({ error: '账号已锁定，请稍后再试', code: 'ACCOUNT_LOCKED' }, 403);
  }

  // The conditional update may have restored an expired timed-lock row.
  // Build the response from the committed state instead of the pre-update
  // login lookup, so clients observe the same status as the database.
  const { authenticatedUser, accessToken, refreshToken } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current || current.deletedAt || current.status === 'DISABLED') throw unauthorized('ACCOUNT_DISABLED', '账号已停用');
    if (current.passwordHash !== user.passwordHash || current.securityVersion !== user.securityVersion) throw unauthorized('LOGIN_STATE_CHANGED', '凭据已改变，请重新登录');
    if (current.status === 'LOCKED' || current.lockedUntil && current.lockedUntil > new Date()) throw unauthorized('ACCOUNT_LOCKED', '账号已锁定');
    return { authenticatedUser: current, accessToken: signAccessToken({ ...current, datasetEpoch: dataset.epoch }), refreshToken: await issueRefreshToken(current.id, c, tx) };
  });

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

  const permissions = await loadPermissions(authenticatedUser);
  return c.json({
    accessToken,
    refreshToken,
    expiresIn: accessTokenExpiresInSeconds(accessToken),
    token: accessToken, // 兼容旧客户端字段
    user: {
      ...(await currentUserPayload(authenticatedUser)),
      permissions: permissions ?? [],
    },
  });
});

// ── 刷新 ─────────────────────────────────────────────────────────────────────
auth.post('/refresh', async (c) => {
  const dataset = await prisma.dataRecoveryState.findUniqueOrThrow({ where: { id: 1 } });
  await assertRecoveryAvailable(prisma, c.req.method, c.req.path);
  setRequestDatasetEpoch(dataset.epoch);
  const body = await c.req.json().catch(() => null);
  const refreshToken = body?.refreshToken;
  if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
    throw badRequest('VALIDATION_ERROR', 'refreshToken 必须是非空字符串');
  }
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
  if (!row || row.datasetEpoch !== dataset.epoch) throw unauthorized('INVALID_REFRESH_TOKEN', '刷新令牌无效或已过期');

  const result = await prisma.$transaction(async (tx) => {
    // Consistent lock order: current actor first, then conditional token consume.
    // A committed disable/soft-delete before this boundary cannot issue a token;
    // a concurrent actor update waits until this short transaction finishes.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${row.userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: row.userId } });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw unauthorized('INVALID_REFRESH_TOKEN', '刷新令牌无效或已过期');
    }
    const consumedAt = new Date();
    const consumed = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null, expiresAt: { gt: consumedAt } },
      data: { revokedAt: consumedAt },
    });
    if (consumed.count !== 1) {
      const current = await tx.refreshToken.findUnique({ where: { id: row.id } });
      if (current?.revokedAt) {
        // A normal race is not proof of theft. Keep the winning family alive.
        throw unauthorized('REFRESH_TOKEN_REPLAYED', '刷新令牌已被消费，请确认当前会话或重新登录');
      }
      throw unauthorized('INVALID_REFRESH_TOKEN', '刷新令牌无效或已过期');
    }
    const accessToken = signAccessToken({ ...user, datasetEpoch: dataset.epoch });
    const newRefresh = await issueRefreshToken(user.id, c, tx, row.familyId);
    await writeAuditStrict(tx, {
      c,
      actorId: user.id,
      actorRole: user.systemRole,
      action: AUDIT_ACTIONS.TOKEN_REFRESH,
      entityType: 'USER',
      entityId: user.id,
    });
    return { accessToken, refreshToken: newRefresh };
  });
  return c.json({
    ...result,
    expiresIn: accessTokenExpiresInSeconds(result.accessToken),
  });
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
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current || current.deletedAt || current.status !== 'ACTIVE') throw unauthorized('SESSION_INVALID', '账号已失效');
    if (current.securityVersion !== getAuth(c).user.securityVersion) throw unauthorized('SESSION_REVOKED', '会话已撤销');
    if (force && !current.mustChangePassword) throw badRequest('FORBIDDEN', '当前账号不处于强制改密状态');
    if (!force && !await bcrypt.compare(c.get('plainOldPassword') ?? '', current.passwordHash)) throw badRequest('WRONG_OLD_PASSWORD', '旧密码错误');
    const changedAt = new Date();
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, securityVersion: { increment: 1 }, mustChangePassword: false,
      passwordChangedAt: changedAt, failedLoginAttempts: 0, lockedUntil: null } });
    await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: changedAt } });
    await writeAuditStrict(tx, { c, actorId: current.id, actorName: current.displayName, actorRole: current.systemRole,
      action: AUDIT_ACTIONS.PASSWORD_CHANGE, entityType: 'USER', entityId: current.id, entityLabel: current.username });
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
