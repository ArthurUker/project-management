import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { checkEnvironment, loadEnvFile } from '../../scripts/lib/testDbGuard.mjs';

const envFile = process.env.RDPMS_TEST_ENV_FILE;
assert.ok(envFile, 'RDPMS_TEST_ENV_FILE must name the owned isolated fixture');
Object.assign(process.env, loadEnvFile(envFile));
process.env.NODE_ENV = 'test';
const [{ default: authRoutes }, { default: roleRoutes }, { runWithContext }] = await Promise.all([
  import('../../dist/routes/auth.js'),
  import('../../dist/routes/roles.js'),
  import('../../dist/platform/requestContext.js'),
]);

const environment = checkEnvironment();
assert.deepEqual(environment.problems, [], 'test DB guard must accept the configured target');
assert.equal(environment.dbTarget.hostname, '127.0.0.1');
assert.match(environment.dbTarget.dbName, /^rdpms_test_rp01_[a-z0-9_]+$/);
assert.equal(environment.dbTarget.dbName, environment.directTarget.dbName);

const prisma = new PrismaClient();
const codePrefix = `B17_${randomBytes(5).toString('hex').toUpperCase()}`;
const validCode = `${codePrefix}_VALID`;
let app;
let token;
let actorId;

async function requestRole(payload) {
  return fetch(`${app.base}/api/roles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function json(response) {
  return response.json();
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function startSourceApp() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // Keep this focused harness on the real auth/role route modules and DB; the
  // modules are imported from the actual compiler output; assertions unchanged.
  const api = new Hono();
  api.use('*', async (c, next) => runWithContext({ db: prisma }, next));
  api.get('/health', (c) => c.json({ status: 'ok' }));
  api.route('/api/auth', authRoutes);
  api.route('/api/roles', roleRoutes);
  api.onError((error, c) => c.json({
    error: error.message || 'Internal Server Error',
    code: error.code || error.status || 500,
  }, error.status || 500));
  api.notFound((c) => c.json({ error: 'Not Found', code: 404 }, 404));
  const server = serve({ fetch: api.fetch, port, hostname: '127.0.0.1' });
  const stop = async () => new Promise((resolve) => server.close(resolve));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return { base, stop };
    } catch { /* source server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await stop();
  throw new Error('isolated auth/role routes did not become healthy within 20s');
}

test('B17 role-create HTTP acceptance', async (t) => {
  try {
    await prisma.$connect();
    const dbIdentity = await prisma.$queryRawUnsafe(
      'SELECT current_database() AS db, host(inet_server_addr()) AS host',
    );
    assert.equal(dbIdentity[0].db, environment.dbTarget.dbName);
    assert.equal(dbIdentity[0].host, '127.0.0.1');

    app = await startSourceApp();
    const login = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.SEED_SUPER_ADMIN_USERNAME || 'superadmin',
        password: process.env.SEED_SUPER_ADMIN_PASSWORD,
      }),
    });
    assert.equal(login.status, 200, 'synthetic SUPER_ADMIN fixture must authenticate');
    let loginBody = await json(login);
    token = loginBody.accessToken;
    if (loginBody.user.mustChangePassword) {
      const nextPassword = 'Owned B17 renewedSecret2026!';
      const changed = await fetch(`${app.base}/api/auth/password/force`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: process.env.SEED_SUPER_ADMIN_PASSWORD, newPassword: nextPassword }),
      });
      assert.equal(changed.status, 200, 'owned seed must complete the real forced-password flow');
      const fresh = await fetch(`${app.base}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginBody.user.username, password: nextPassword }),
      });
      assert.equal(fresh.status, 200, 'fresh legal credential must authenticate');
      loginBody = await json(fresh); token = loginBody.accessToken;
      assert.equal(loginBody.user.mustChangePassword, false);
    }
    actorId = loginBody.user?.id;
    assert.ok(token, 'login must return a bearer token');
    assert.ok(actorId, 'login must identify the authenticated synthetic account');
    assert.ok(loginBody.user.permissions.includes('roles.create'), 'fixture must hold roles.create');

    const canView = await fetch(`${app.base}/api/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(canView.status, 200, 'authenticated fixture must reach protected roles API');
    const beforeRoleCount = await prisma.role.count();
    const beforeLinkCount = await prisma.rolePermission.count();

    await t.test('AC-B17-01: authorized code/name creates a non-system role', async () => {
      const response = await requestRole({ code: validCode, name: 'B17 合法角色', description: 'isolated acceptance fixture' });
      assert.equal(response.status, 201);
      const returned = await json(response);
      assert.equal(returned.code, validCode);
      assert.equal(returned.name, 'B17 合法角色');
      assert.equal(returned.isSystem, false);
      assert.equal(returned.createdById, actorId);

      const persisted = await prisma.role.findUnique({ where: { code: validCode } });
      assert.ok(persisted, 'created role must exist in PostgreSQL');
      assert.equal(persisted.id, returned.id);
      assert.equal(persisted.isSystem, false);
      assert.equal(persisted.name, 'B17 合法角色');
      assert.equal(persisted.createdById, actorId);
      assert.equal(await prisma.rolePermission.count({ where: { roleId: persisted.id } }), 0);
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'ROLE', entityId: persisted.id, action: 'create' },
      });
      assert.ok(audit, 'role creation audit must persist under current schema');
      assert.equal(audit.actorId, actorId);
    });

    await t.test('AC-B17-02: duplicate and invalid codes are explicitly rejected', async () => {
      const duplicate = await requestRole({ code: validCode, name: 'duplicate attempt' });
      assert.equal(duplicate.status, 400);
      assert.equal((await json(duplicate)).code, 'CODE_EXISTS');

      const invalid = await requestRole({ code: 'b17_invalid', name: 'invalid attempt' });
      assert.equal(invalid.status, 400);
      assert.equal((await json(invalid)).code, 'VALIDATION_ERROR');

      assert.equal(await prisma.role.count({ where: { code: validCode } }), 1);
      assert.equal(await prisma.role.count({ where: { code: 'b17_invalid' } }), 0);
    });

    await t.test('RP01-T01 reviewer cases: non-scalar DTO values are rejected before Prisma', async () => {
      const malformed = [
        { code: ['B17_ARRAY_CODE'], name: 'array code' },
        { code: { value: 'B17_OBJECT_CODE' }, name: 'object code' },
        { code: 17, name: 'numeric code' },
        { code: 'B17_ARRAY_NAME', name: ['array name'] },
        { code: 'B17_OBJECT_NAME', name: { value: 'object name' } },
        { code: 'B17_NUMERIC_NAME', name: 17 },
        { code: 'B17_ARRAY_DESC', name: 'array description', description: [] },
        { code: 'B17_OBJECT_DESC', name: 'object description', description: {} },
        { code: 'B17_NUMERIC_DESC', name: 'numeric description', description: 17 },
        { code: 'B17_BLANK_NAME', name: '   ' },
        { code: ' B17_SPACED_CODE', name: 'spaced code' },
      ];
      const countBefore = await prisma.role.count({ where: { code: { startsWith: 'B17_' } } });
      for (const payload of malformed) {
        const response = await requestRole(payload);
        assert.equal(response.status, 400, `${JSON.stringify(payload)} must be rejected before persistence`);
        assert.equal((await json(response)).code, 'VALIDATION_ERROR');
      }
      assert.equal(await prisma.role.count({ where: { code: { startsWith: 'B17_' } } }), countBefore);
      assert.equal(await prisma.rolePermission.count(), beforeLinkCount);
    });

    await t.test('AC-B17-03: client id, permission links and audit/system fields are rejected', async () => {
      const forbiddenFields = [
        ['id', 'client-role-id'],
        ['permissions', []],
        ['permissionIds', []],
        ['permissionCodes', []],
        ['rolePermissions', []],
        ['createdAt', new Date().toISOString()],
        ['updatedAt', new Date().toISOString()],
        ['deletedAt', new Date().toISOString()],
        ['createdById', actorId],
        ['updatedById', actorId],
        ['isSystem', true],
        ['systemRole', 'SUPER_ADMIN'],
        ['sortOrder', 1],
      ];
      for (const [field, value] of forbiddenFields) {
        const code = `${codePrefix}_${field.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}`;
        const response = await requestRole({ code, name: `injection ${field}`, [field]: value });
        assert.equal(response.status, 400, `${field} injection must be rejected`);
        const body = await json(response);
        assert.equal(body.code, 'VALIDATION_ERROR', `${field} rejection must be explicit`);
        assert.ok(body.error.includes(field), `${field} must be identified as forbidden`);
        assert.equal(await prisma.role.count({ where: { code } }), 0, `${field} injection must not persist a role`);
      }

      const persisted = await prisma.role.findUnique({ where: { code: validCode } });
      assert.ok(persisted);
      assert.equal(persisted.isSystem, false);
      assert.equal(persisted.createdById, actorId);
      assert.equal(await prisma.rolePermission.count({ where: { roleId: persisted.id } }), 0);
      assert.equal(await prisma.role.count(), beforeRoleCount + 1);
      assert.equal(await prisma.rolePermission.count(), beforeLinkCount);
    });

    await t.test('PAC-RP01-03: positive and rejected operations leave expected role/link rows', async () => {
      const actual = await prisma.role.findUnique({
        where: { code: validCode },
        include: { permissions: true },
      });
      assert.ok(actual);
      assert.equal(actual.isSystem, false);
      assert.equal(actual.permissions.length, 0);
      assert.equal(await prisma.role.count({ where: { code: { startsWith: codePrefix } } }), 1);
      assert.equal(await prisma.rolePermission.count(), beforeLinkCount);
    });

    await t.test('TASK-RP01-T01: authenticated role-create task contract is satisfied', async () => {
      assert.equal(login.status, 200);
      assert.ok(loginBody.user.permissions.includes('roles.create'));
      assert.equal(canView.status, 200);
      const actual = await prisma.role.findUnique({ where: { code: validCode } });
      assert.ok(actual);
      assert.equal(actual.isSystem, false);
      assert.equal(actual.createdById, actorId);
    });
  } finally {
    if (app) await app.stop();
    const roles = await prisma.role.findMany({
      where: { code: { startsWith: codePrefix } },
      select: { id: true },
    }).catch(() => []);
    if (roles.length) {
      await prisma.rolePermission.deleteMany({ where: { roleId: { in: roles.map((role) => role.id) } } });
      await prisma.role.deleteMany({ where: { id: { in: roles.map((role) => role.id) } } });
    }
    await prisma.$disconnect();
  }
});
