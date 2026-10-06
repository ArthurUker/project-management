import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';

const prisma = new PrismaClient();
const app = createApp();
const PASSWORD = 'Rp02 synthetic account password 2026!';
let userId;

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

after(async () => {
  await prisma.$disconnect();
});

async function makeUser(overrides = {}) {
  userId = `rp02-${crypto.randomUUID()}`;
  return prisma.user.create({
    data: {
      id: userId,
      username: userId,
      displayName: 'RP02 synthetic user',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      systemRole: 'MEMBER',
      status: 'ACTIVE',
      ...overrides,
    },
  });
}

async function login(password = PASSWORD) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: userId, password }),
  });
  return { response, body: await response.json() };
}

function assertResponseLifetime(body) {
  const decoded = jwt.decode(body.accessToken);
  assert.ok(decoded && typeof decoded === 'object' && typeof decoded.exp === 'number');
  assert.equal(typeof decoded.iat, 'number');
  const observedRemaining = decoded.exp - Math.floor(Date.now() / 1000);
  assert.ok(body.expiresIn >= observedRemaining - 1 && body.expiresIn <= observedRemaining + 1,
    `expiresIn=${body.expiresIn}, JWT remaining=${observedRemaining}`);
  assert.notEqual(body.expiresIn, 7200, 'response must not retain the unrelated fixed 7200-second value');
}

test('RP02 AC-B14-01 five consecutive wrong passwords enter a bounded timed lock', async () => {
  await makeUser();
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const { response, body } = await login('wrong synthetic password');
    assert.equal(response.status, 401);
    assert.equal(body.code, 'BAD_CREDENTIALS');
  }

  const stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.failedLoginAttempts, 5);
  assert.equal(stored.status, 'LOCKED');
  assert.ok(stored.lockedUntil instanceof Date && stored.lockedUntil > new Date());
});

test('RP02 pending activation remains pending and a fifth bad password installs an enforced timed lock', async () => {
  await makeUser({ status: 'PENDING_ACTIVATION' });
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { response } = await login('wrong synthetic password');
    assert.equal(response.status, 401);
  }
  let stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.status, 'PENDING_ACTIVATION');
  assert.equal(stored.failedLoginAttempts, 4);
  assert.equal(stored.lockedUntil, null);

  const fifth = await login('wrong synthetic password');
  assert.equal(fifth.response.status, 401);
  stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.status, 'PENDING_ACTIVATION');
  assert.equal(stored.failedLoginAttempts, 5);
  assert.ok(stored.lockedUntil instanceof Date && stored.lockedUntil > new Date());
  const audit = await prisma.auditLog.findFirst({
    where: { actorId: userId, action: 'login.failed' },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(audit.metadata.locked, true);
  assert.equal(audit.metadata.attempts, 5);

  const blockedCorrectPassword = await login();
  assert.equal(blockedCorrectPassword.response.status, 403);
  assert.equal(blockedCorrectPassword.body.code, 'ACCOUNT_LOCKED');
  await prisma.user.update({
    where: { id: userId },
    data: { lockedUntil: new Date(Date.now() - 60_000) },
  });
  const afterExpiry = await login();
  assert.equal(afterExpiry.response.status, 200, JSON.stringify(afterExpiry.body));
  assert.equal(afterExpiry.body.user.status, 'PENDING_ACTIVATION');
  stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.status, 'PENDING_ACTIVATION');
  assert.equal(stored.failedLoginAttempts, 0);
  assert.equal(stored.lockedUntil, null);
});

test('RP02 concurrent bad-password requests do not lose increments or extend an active lock indefinitely', async () => {
  await makeUser();
  const results = await Promise.all(Array.from({ length: 8 }, () => login('wrong synthetic password')));
  for (const { response, body } of results) {
    assert.ok([401, 403].includes(response.status), `unexpected status ${response.status}: ${JSON.stringify(body)}`);
  }
  const stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.failedLoginAttempts, 5);
  assert.equal(stored.status, 'LOCKED');
  assert.ok(stored.lockedUntil instanceof Date && stored.lockedUntil > new Date());
});

test('RP02 AC-B14-02 expired timed lock recovers only after valid credentials and resets state', async () => {
  await makeUser({
    status: 'LOCKED',
    failedLoginAttempts: 5,
    lockedUntil: new Date(Date.now() - 60_000),
  });
  const { response, body } = await login();
  assert.equal(response.status, 200, JSON.stringify(body));
  assertResponseLifetime(body);
  assert.equal(body.user.status, 'ACTIVE');

  const stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.status, 'ACTIVE');
  assert.equal(stored.failedLoginAttempts, 0);
  assert.equal(stored.lockedUntil, null);
  assert.equal(await prisma.refreshToken.count({ where: { userId, revokedAt: null } }), 1);
});

test('RP02 AC-B14-02 future timed lock and indefinite manual LOCKED state remain rejected', async () => {
  await makeUser({ status: 'LOCKED', failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) });
  const first = await login();
  assert.equal(first.response.status, 403);
  assert.equal(first.body.code, 'ACCOUNT_LOCKED');

  await prisma.user.update({ where: { id: userId }, data: { lockedUntil: null } });
  const second = await login();
  assert.equal(second.response.status, 403);
  assert.equal(second.body.code, 'ACCOUNT_LOCKED');
  const stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.status, 'LOCKED');
  assert.equal(stored.failedLoginAttempts, 5);
});

test('RP02 AC-B14-03 disabled account is never reactivated by elapsed lock metadata', async () => {
  await makeUser({ status: 'DISABLED', failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - 60_000) });
  const { response, body } = await login();
  assert.equal(response.status, 403);
  assert.equal(body.code, 'ACCOUNT_DISABLED');
  const stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.status, 'DISABLED');
  assert.equal(stored.failedLoginAttempts, 5);
});

test('RP02 AC-B14-04 successful login clears failures and login/refresh expiresIn matches JWT exp', async () => {
  await makeUser({ failedLoginAttempts: 4, lockedUntil: new Date(Date.now() - 60_000) });
  const initial = await login();
  assert.equal(initial.response.status, 200, JSON.stringify(initial.body));
  assertResponseLifetime(initial.body);

  const refreshedResponse = await app.request('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: initial.body.refreshToken }),
  });
  const refreshed = await refreshedResponse.json();
  assert.equal(refreshedResponse.status, 200, JSON.stringify(refreshed));
  assertResponseLifetime(refreshed);

  const stored = await prisma.user.findUnique({ where: { id: userId } });
  assert.equal(stored.failedLoginAttempts, 0);
  assert.equal(stored.lockedUntil, null);
});

// ── LR2-04 补验：并发 disable/login 确定性双方向屏障 + 锁内正确/错误密码 ─────────
//
// 线性化点（本次只登记，不改变既有语义）：
//   * 登录成功：条件 `user.updateMany`（按当前 status/锁条件重置登录状态）提交成功。
//     该写入提交前若停用已提交，条件不再匹配 → 403 ACCOUNT_DISABLED。
//   * 登录拒绝：入口状态读（DISABLED / 有效锁）即为该请求的判定点。
//   * 管理员停用：`PATCH /api/users/:id/status` 的 `user.update` 提交成功。
//   * 因此「登录的条件写入先于停用提交」= 合法的更早成功，不追溯撤销；
//     停用提交之后的任何新登录都被拒绝。会话/refresh 家族的追溯处置属 RP02-T02（T-RP-09），本任务不动。

/** 只在指定用户上、且只在指定 ORM 调用上暂停一次（路由、事务与 SQL 全部照常执行） */
function gateOn(db, { method, matches }) {
  let ready;
  let release;
  const reached = new Promise((resolve) => { ready = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  let fired = false;
  const wrapModel = (model) => new Proxy(model, {
    get(inner, key) {
      if (key === method) {
        return (args) => {
          if (!fired && matches(args)) {
            fired = true;
            ready();
            return released.then(() => inner[method](args));
          }
          return inner[method](args);
        };
      }
      const value = inner[key];
      return typeof value === 'function' ? value.bind(inner) : value;
    },
  });
  const client = new Proxy(db, {
    get(target, prop) {
      if (prop === 'user') return wrapModel(target.user);
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { client, reached, release, fired: () => fired };
}

function makeBarrierApp(client, admin) {
  return createApp({ db: client, actorResolver: async () => ({
    userId: admin.id, user: admin,
    systemRole: 'ADMIN', permissions: ['users.disable', 'users.enable'],
  }) });
}

async function makeAdminUser() {
  const id = `rp02-admin-${crypto.randomUUID()}`;
  return prisma.user.create({ data: {
    id, username: id, displayName: 'RP02 synthetic admin',
    passwordHash: await bcrypt.hash(PASSWORD, 4), systemRole: 'ADMIN', status: 'ACTIVE',
  } });
}

async function makeTargetUser(overrides = {}) {
  const id = `rp02-barrier-${crypto.randomUUID()}`;
  return prisma.user.create({ data: {
    id, username: id, displayName: 'RP02 barrier user',
    passwordHash: await bcrypt.hash(PASSWORD, 4), systemRole: 'MEMBER', status: 'ACTIVE',
    ...overrides,
  } });
}

async function loginAs(target, targetApp, password = PASSWORD) {
  const response = await targetApp.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: target.username, password }),
  });
  return { response, body: await response.json() };
}

async function disableAsAdmin(adminApp, target) {
  const response = await adminApp.request(`/api/users/${target.id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'DISABLED' }),
  });
  return { response, body: await response.json() };
}

test('RP02 LR2-04 direction 1: disable commits before the login state read, so login is rejected and no session exists', async () => {
  const target = await makeTargetUser();
  const admin = await makeAdminUser();
  const gate = gateOn(prisma, { method: 'findFirst', matches: (args) => args?.where?.username === target.username });
  const loginApp = createApp({ db: gate.client, actorResolver: async () => null });
  const adminApp = makeBarrierApp(gate.client, admin);

  const pending = loginAs(target, loginApp);
  await Promise.race([gate.reached, new Promise((_, reject) => setTimeout(() => reject(new Error('login lookup barrier not reached')), 10000))]);
  assert.equal(gate.fired(), true, 'login must reach the real ORM state read before the disable commits');

  const disabled = await disableAsAdmin(adminApp, target);
  assert.equal(disabled.response.status, 200, JSON.stringify(disabled.body));
  gate.release();

  const attempt = await pending;
  assert.equal(attempt.response.status, 403, JSON.stringify(attempt.body));
  assert.equal(attempt.body.code, 'ACCOUNT_DISABLED');
  assert.equal(attempt.body.accessToken, undefined, 'rejected login must not return an access token');

  const stored = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(stored.status, 'DISABLED');
  assert.equal(stored.failedLoginAttempts, 0);
  assert.equal(stored.lockedUntil, null);
  assert.equal(await prisma.refreshToken.count({ where: { userId: target.id } }), 0, 'rejected login must not mint a refresh token');
  assert.equal(await prisma.auditLog.count({ where: { actorId: target.id, action: 'login' } }), 0, 'rejected login must not write a login audit row');
  assert.equal(await prisma.auditLog.count({ where: { entityId: target.id, action: 'status.change' } }), 1,
    'the administrative disable is auditable');
});

test('RP02 LR2-04 direction 2: a login whose conditional write commits before the disable stays a valid earlier success, and later logins are rejected', async () => {
  const target = await makeTargetUser();
  const admin = await makeAdminUser();
  const gate = gateOn(prisma, { method: 'update', matches: (args) => args?.where?.id === target.id && args?.data?.status === 'DISABLED' });
  const loginApp = createApp({ db: gate.client, actorResolver: async () => null });
  const adminApp = makeBarrierApp(gate.client, admin);

  const pendingDisable = disableAsAdmin(adminApp, target);
  await Promise.race([gate.reached, new Promise((_, reject) => setTimeout(() => reject(new Error('disable barrier not reached')), 10000))]);
  assert.equal(gate.fired(), true, 'the disable must reach the real ORM write before login commits');

  const attempt = await loginAs(target, loginApp);
  assert.equal(attempt.response.status, 200, JSON.stringify(attempt.body));
  assertResponseLifetime(attempt.body);
  assert.equal(attempt.body.user.status, 'ACTIVE');
  const beforeDisable = await prisma.user.findUnique({ where: { id: target.id } });
  assert.ok(beforeDisable.lastLoginAt instanceof Date, 'committed login must persist lastLoginAt');
  assert.equal(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { actorId: target.id, action: 'login' } }), 1);

  gate.release();
  const disabled = await pendingDisable;
  assert.equal(disabled.response.status, 200, JSON.stringify(disabled.body));

  const afterDisable = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(afterDisable.status, 'DISABLED', 'the later disable is authoritative for the persisted row');
  assert.equal(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } }), 1,
    'this task does not revoke sessions on disable; session-family policy belongs to RP02-T02 / T-RP-09');

  const later = await loginAs(target, loginApp);
  assert.equal(later.response.status, 403, JSON.stringify(later.body));
  assert.equal(later.body.code, 'ACCOUNT_DISABLED');
});

test('RP02 LR2-04 inside an active timed lock, the correct password neither succeeds nor extends the lock', async () => {
  const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
  const target = await makeTargetUser({ status: 'LOCKED', failedLoginAttempts: 5, lockedUntil });
  const attempt = await loginAs(target, app);

  assert.equal(attempt.response.status, 403, JSON.stringify(attempt.body));
  assert.equal(attempt.body.code, 'ACCOUNT_LOCKED');
  assert.equal(attempt.body.accessToken, undefined);
  const stored = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(stored.status, 'LOCKED');
  assert.equal(stored.failedLoginAttempts, 5, 'a blocked correct-password attempt must not touch the failure counter');
  assert.equal(stored.lockedUntil.getTime(), lockedUntil.getTime(), 'a blocked correct-password attempt must not extend the deadline');
  assert.equal(await prisma.refreshToken.count({ where: { userId: target.id } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { actorId: target.id, action: 'login' } }), 0);
});

test('RP02 LR2-04 inside an active timed lock, a wrong password does not increment or extend the lock', async () => {
  const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
  const target = await makeTargetUser({ status: 'LOCKED', failedLoginAttempts: 5, lockedUntil });
  const attempt = await loginAs(target, app, 'wrong synthetic password');

  assert.equal(attempt.response.status, 403, JSON.stringify(attempt.body));
  assert.equal(attempt.body.code, 'ACCOUNT_LOCKED');
  const stored = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(stored.status, 'LOCKED');
  assert.equal(stored.failedLoginAttempts, 5, 'blocked wrong-password attempts must not inflate the counter');
  assert.equal(stored.lockedUntil.getTime(), lockedUntil.getTime(), 'blocked wrong-password attempts must not extend the deadline');
  assert.equal(await prisma.refreshToken.count({ where: { userId: target.id } }), 0);
});

// ── C（TEST_ONLY）：固化独立复核的「条件更新前停用」屏障 ────────────────────────
//
// 与本文件既有的两个方向的差异（必须同时保留）：
//   * 既有方向 1：屏障停在 user.findFirst 之前 → 证明停用后入口拒绝（不经过旧值竞争）；
//   * 既有方向 2：停用写入暂停、登录先全部完成 → 证明合法的更早成功不被追溯撤销；
//   * 本用例：登录已读到 ACTIVE、真实 bcrypt 校验通过，屏障停在**带 lastLoginAt 重置的
//     实际条件更新执行之前**，此时管理员停用先提交 → 登录必须被拒。
// 业务实现未修改；本用例不引入 refresh 家族、追溯会话撤销、激活或强制改密政策。

test('RP02 LR3-01 C01 the conditional login reset is refused when an administrator disables the account first', async () => {
  // 0) 夹具有效性：同类合成账号先真实登录成功（token / 用户 / refresh / 审计）
  const probe = await makeTargetUser();
  const probeLogin = await loginAs(probe, app);
  assert.equal(probeLogin.response.status, 200, JSON.stringify(probeLogin.body));
  assert.ok(probeLogin.body.accessToken, 'probe login must return an access token');
  assertResponseLifetime(probeLogin.body);
  assert.equal(await prisma.refreshToken.count({ where: { userId: probe.id, revokedAt: null } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { actorId: probe.id, action: 'login' } }), 1);

  // 1) 目标账号：屏障停在实际条件更新（lastLoginAt 重置）之前
  const target = await makeTargetUser();
  const admin = await makeAdminUser();
  const gate = gateOn(prisma, {
    method: 'updateMany',
    matches: (args) => args?.where?.id === target.id && args?.data?.lastLoginAt !== undefined,
  });
  const loginApp = createApp({ db: gate.client, actorResolver: async () => null });
  const adminApp = makeBarrierApp(prisma, admin);

  try {
    const pending = loginAs(target, loginApp);
    await Promise.race([gate.reached, new Promise((_, reject) => {
      setTimeout(() => reject(new Error('C01: conditional reset barrier not reached')), 10000);
    })]);
    assert.equal(gate.fired(), true,
      'the login must reach the real conditional update after reading ACTIVE and verifying the password');

    const midFlight = await prisma.user.findUnique({ where: { id: target.id } });
    assert.equal(midFlight.status, 'ACTIVE', 'the account is still ACTIVE while the reset is paused');
    assert.equal(midFlight.lastLoginAt, null, 'no login state may be written before the conditional reset');

    // 2) 真实管理员 actor 停用并先提交
    const disabled = await disableAsAdmin(adminApp, target);
    assert.equal(disabled.response.status, 200, JSON.stringify(disabled.body));
    const afterDisable = await prisma.user.findUnique({ where: { id: target.id } });
    assert.equal(afterDisable.status, 'DISABLED');
    assert.equal(await prisma.auditLog.count({ where: { entityId: target.id, action: 'status.change' } }), 1,
      'the administrative disable must be auditable');

    // 3) 放行登录：条件更新必须失败并给出 403，且不产生任何登录副作用
    gate.release();
    const attempt = await pending;
    assert.equal(attempt.response.status, 403, JSON.stringify(attempt.body));
    assert.equal(attempt.body.code, 'ACCOUNT_DISABLED');
    assert.equal(attempt.body.accessToken, undefined, 'a rejected login must not return an access token');

    const row = await prisma.user.findUnique({ where: { id: target.id } });
    assert.equal(row.status, 'DISABLED');
    assert.equal(row.lastLoginAt, null, 'a rejected login must not write lastLoginAt');
    assert.equal(row.failedLoginAttempts, 0, 'a rejected login must not touch the failure counter');
    assert.equal(row.lockedUntil, null, 'a rejected login must not create a timed lock');
    assert.equal(await prisma.refreshToken.count({ where: { userId: target.id } }), 0,
      'a rejected login must not mint a refresh token');
    assert.equal(await prisma.auditLog.count({ where: { actorId: target.id, action: 'login' } }), 0,
      'a rejected login must not write a successful login audit row');
  } finally {
    gate.release();
  }
});
