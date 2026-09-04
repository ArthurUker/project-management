/**
 * tests/rbac.test.mjs —— RBAC 最小化自动化测试骨架（W11）
 *
 * 覆盖（M-1 v1.0 冻结值，真源 docs/rbac/M-1-RBAC-v1.0-SIGNED.md）：
 *   T1  六角色权限数量 90/80/66/31/19/3，RolePermission 总数 289
 *   T2  ADMIN 排除 10 项（8 高危 + audit.export + system.logs.view）
 *   T3  AUDITOR 恰好 3 项（audit.view / audit.export / system.logs.view）
 *   T4  非项目成员访问项目 → 404（HTTP；需本地服务在 3000 端口运行，否则 SKIP）
 *   T5  SUPER_ADMIN 访问非成员项目 → 200 且写 elevated 审计（HTTP，同上）
 *
 * 运行方式：
 *   npm test                    # = node --test tests/
 *   # T4/T5 需先本地起服：npm start（或 node src/index.js）
 *
 * 安全守卫：仅允许连接本地开发库；staging/production 一律拒绝。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── 环境守卫（与 scripts/seed-test-files.mjs 同口径）─────────────────────────
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL 未设置');
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error(`拒绝执行：数据库 host 非本机（${parsed.hostname}）`);
  }
  const db = (parsed.pathname || '').replace(/^\//, '');
  if (/staging|prod|production/i.test(db)) {
    throw new Error(`拒绝执行：库名疑似非本地环境（${db}）`);
  }
}

const EXPECTED_COUNTS = {
  SUPER_ADMIN: 90,
  ADMIN: 80,
  MANAGER: 66,
  MEMBER: 31,
  VIEWER: 19,
  AUDITOR: 3,
};

const ADMIN_EXCLUDED = [
  'users.delete',
  'roles.create',
  'roles.update',
  'roles.delete',
  'roles.assign_permissions',
  'roles.assign_user',
  'settings.update',
  'data.export',
  'audit.export',
  'system.logs.view',
];

const AUDITOR_EXACT = ['audit.export', 'audit.view', 'system.logs.view'].sort();

const BASE = process.env.RBAC_TEST_BASE || 'http://127.0.0.1:3000';

before(async () => {
  assertLocalDatabase();
  await prisma.$connect();
});
after(async () => {
  await prisma.$disconnect();
});

async function rolePermissionCodes(roleCode) {
  const rows = await prisma.rolePermission.findMany({
    where: { role: { code: roleCode } },
    select: { permission: { select: { code: true } } },
  });
  return rows.map((r) => r.permission.code).sort();
}

// ── T1 六角色数量 ────────────────────────────────────────────────────────────
test('T1a 各角色权限数量符合 M-1（90/80/66/31/19/3）', async () => {
  for (const [code, expected] of Object.entries(EXPECTED_COUNTS)) {
    const n = await prisma.rolePermission.count({ where: { role: { code } } });
    assert.equal(n, expected, `角色 ${code} 权限数应为 ${expected}，实际 ${n}`);
  }
});

test('T1b RolePermission 总数 = 289', async () => {
  const n = await prisma.rolePermission.count();
  assert.equal(n, 289, `RolePermission 总数应为 289，实际 ${n}`);
});

test('T1c permissions 表 = 90 且无 P1/否决码入库', async () => {
  const total = await prisma.permission.count();
  assert.equal(total, 90, `permissions 总数应为 90，实际 ${total}`);

  const p1OrDenied = await prisma.permission.findMany({
    where: {
      OR: [
        { code: { in: ['projects.delete', 'tasks.delete', 'reagent_materials.export', 'files.view', 'files.restore', 'system.logs.export'] } },
        { code: { in: ['roles.export', 'system.health', 'dict.read', 'files.metadata.view', 'settings.audit.view', 'system.logs_read', 'system.logs.read', 'audit.read', 'projects.edit', 'tasks.update_status', 'users.manage', 'regulatory.manage'] } },
        { code: { startsWith: 'detection_targets.' } },
      ],
    },
    select: { code: true },
  });
  assert.deepEqual(p1OrDenied, [], `P1/否决码不应入库：${p1OrDenied.map((p) => p.code).join(', ')}`);
});

// ── T2 ADMIN 排除 10 项 ──────────────────────────────────────────────────────
test('T2 ADMIN 不持有 10 项排除权限（8 高危 + audit.export + system.logs.view）', async () => {
  const codes = await rolePermissionCodes('ADMIN');
  for (const banned of ADMIN_EXCLUDED) {
    assert.ok(!codes.includes(banned), `ADMIN 不应持有 ${banned}`);
  }
  // 反向锚点：ADMIN 必须持有的两项
  assert.ok(codes.includes('audit.view'), 'ADMIN 应持有 audit.view');
  assert.ok(codes.includes('settings.view'), 'ADMIN 应持有 settings.view');
});

// ── T3 AUDITOR 恰好 3 项 ─────────────────────────────────────────────────────
test('T3 AUDITOR 恰好持有 audit.view / audit.export / system.logs.view', async () => {
  const codes = await rolePermissionCodes('AUDITOR');
  assert.deepEqual(codes, AUDITOR_EXACT, `AUDITOR 应恰好持有 ${AUDITOR_EXACT.join('/')}`);
});

// ── T4/T5 HTTP 断言（本地服务不可达时 SKIP，不算失败）────────────────────────
async function tryLogin(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) return null;
  const body = await res.json();
  return body.accessToken ?? body.data?.accessToken ?? null;
}

test('T4 非项目成员（持 projects.view）访问项目 → 404', async (t) => {
  let saToken = null;
  try {
    saToken = await tryLogin('superadmin', process.env.SMOKE_SA_PASSWORD || '');
  } catch { /* fetch 失败即服务未启动 */ }
  if (!saToken) return t.skip('本地服务不可达或未配置 SMOKE_SA_PASSWORD，跳过 HTTP 断言');

  // 取一个 SA 可见、且 test_viewer 非成员的项目
  const listRes = await fetch(`${BASE}/api/projects?pageSize=1`, {
    headers: { Authorization: `Bearer ${saToken}` },
  });
  const list = await listRes.json();
  const first = (list.list ?? list.items ?? [])[0];
  if (!first) return t.skip('本地库无项目数据（可跑 smoke full 构造），跳过');

  const viewerToken = await tryLogin('test_viewer', process.env.SMOKE_TEST_PASSWORD || '');
  if (!viewerToken) return t.skip('test_viewer 登录失败（需 SEED_TEST_ACCOUNTS=true seed），跳过');

  const res = await fetch(`${BASE}/api/projects/${first.id}`, {
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert.equal(res.status, 404, `非成员应得 404（隐藏资源存在性），实际 ${res.status}`);
});

test('T5 SUPER_ADMIN 访问非成员项目 → 200 且写 elevated 审计', async (t) => {
  const saToken = await tryLogin('superadmin', process.env.SMOKE_SA_PASSWORD || '');
  if (!saToken) return t.skip('本地服务不可达或未配置 SMOKE_SA_PASSWORD，跳过 HTTP 断言');

  const listRes = await fetch(`${BASE}/api/projects?pageSize=1`, {
    headers: { Authorization: `Bearer ${saToken}` },
  });
  const list = await listRes.json();
  const first = (list.list ?? list.items ?? [])[0];
  if (!first) return t.skip('本地库无项目数据，跳过');

  const res = await fetch(`${BASE}/api/projects/${first.id}`, {
    headers: { Authorization: `Bearer ${saToken}` },
  });
  assert.equal(res.status, 200, `SUPER_ADMIN 访问应 200，实际 ${res.status}`);

  // elevated 审计三要素
  const log = await prisma.auditLog.findFirst({
    where: {
      action: 'read.sensitive',
      entityType: 'PROJECT',
      entityId: first.id,
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  assert.ok(log, '应存在 read.sensitive 审计记录');
  assert.equal(log.metadata?.elevated, true, 'metadata.elevated 应为 true');
  assert.equal(log.metadata?.bypass, 'project_membership', 'metadata.bypass 应为 project_membership');
  assert.equal(log.metadata?.permissionCode, 'projects.view', 'metadata.permissionCode 应为 projects.view');
});
