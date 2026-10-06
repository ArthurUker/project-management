/**
 * RF04 复核第三轮用例 —— 入口矩阵（删除类权限独立）与「无基线兼容路径」的边界
 *
 * 对应用户验收要求：
 *   2. 删除/更新/新建/状态转换/指派必须分别映射到实际授权要求，不默认用 update 授权 delete；
 *   3. 无基线兼容路径必须写清适用客户端、数据状态与退出条件——
 *      已提交/已审核/实验科学数据不得借兼容路径无条件覆盖；新版客户端缺基线必须报错。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncUnitApp as createApp, syncV1JsonRequest as jsonRequest, readSyncResult } from '../helpers/syncV1Fixture.mjs';
import { createStubDb, createStubActor } from '../helpers/stubDeps.mjs';

const AUTHOR = { userId: 'u1', displayName: '作者' };
const OWNER_ACCESS = { role: 'OWNER', leftAt: null };
const CLIENT_V2 = { 'x-client-contract': 'v2' };

function draftReport(overrides = {}) {
  return {
    id: 'r1',
    projectId: 'p1',
    authorId: 'u1',
    reportType: 'MONTHLY',
    periodKey: '2026-09',
    status: 'DRAFT',
    content: {},
    deletedAt: null,
    updatedAt: new Date('2026-09-15T10:00:00Z'),
    ...overrides,
  };
}

function buildApp({ db, permissions, membership = OWNER_ACCESS }) {
  void membership;
  return createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions }),
  });
}

function syncPush(entity, id, data, op = 'upsert') {
  return {
    deviceId: 'unit-device',
    changes: [{
      clientMutationId: `unit-${entity}-${id}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      entity,
      id,
      op,
      data,
    }],
  };
}

// ── 规则 1：新版客户端必须带基线 ────────────────────────────────────────────

test('RF04-U19 声明新版契约却缺并发基线 → 400，不回落旧版兼容', async () => {
  const db = createStubDb({ reports: [draftReport()] });
  const app = buildApp({ db, permissions: ['reports.update'] });

  const modern = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: CLIENT_V2,
    body: { content: { n: 1 }, expectedUpdatedAt: undefined, clientMutationId: 'u19-v2' },
  });
  const body = await modern.json();
  assert.equal(modern.status, 400, JSON.stringify(body));
  assert.equal(body.code, 'CONCURRENCY_BASELINE_REQUIRED');
  assert.equal(db.state.mutationReceipts.length, 0, '报错前不得留下回执');
  assert.deepEqual(db.state.reports[0].content, {}, '不得写入');

  // 对照：未声明契约的旧客户端在草稿上仍可走兼容路径
  const legacy = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { content: { n: 1 }, clientMutationId: 'u19-legacy' },
  });
  assert.equal(legacy.status, 200, '旧客户端在草稿态允许无基线（过渡窗口）');
});

// ── 规则 2/3：兼容路径的数据状态边界 ────────────────────────────────────────

test('RF04-U20 旧客户端对已审阅汇报无基线 → 409，且不改数据不留回执', async () => {
  const db = createStubDb({ reports: [draftReport({ status: 'REVIEWED', content: { old: true } })] });
  const app = buildApp({ db, permissions: ['reports.update'] });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { content: { n: 1 }, clientMutationId: 'u20' },
  });
  const body = await res.json();
  assert.equal(res.status, 409, JSON.stringify(body));
  assert.ok(
    ['CONCURRENCY_BASELINE_REQUIRED', 'INVALID_STATE'].includes(body.code),
    `必须是「锁定/需基线」拒绝，实际 ${body.code}`,
  );
  assert.deepEqual(db.state.reports[0].content, { old: true }, '已审阅内容不得被覆盖');
  assert.equal(db.state.mutationReceipts.length, 0);
});

test('RF04-U21 旧客户端对实验科学数据无基线 → 409，实验数据不得无基线覆盖', async () => {
  const scientific = draftReport({
    content: { reagentReports: [{ projectId: 'p1', items: [{ name: '样品A', value: 3 }] }] },
  });
  const db = createStubDb({ reports: [scientific] });
  const app = buildApp({ db, permissions: ['reports.update'] });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { content: { n: 1 }, clientMutationId: 'u21' },
  });
  const body = await res.json();
  assert.equal(res.status, 409, JSON.stringify(body));
  assert.equal(body.code, 'CONCURRENCY_BASELINE_REQUIRED');
  assert.ok(db.state.reports[0].content.reagentReports, '实验数据必须保持原样');
});

test('RF04-U22 兼容路径放行时必须在审计中留痕（不静默降低保护）', async () => {
  const db = createStubDb({ reports: [draftReport()] });
  const app = buildApp({ db, permissions: ['reports.update'] });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { content: { n: 1 }, clientMutationId: 'u22' },
  });
  assert.equal(res.status, 200);
  const audit = db.state.auditLogs.find((a) => a.entityType === 'REPORT');
  assert.ok(audit, '必须写审计');
  assert.equal(audit.metadata.noConcurrencyBaseline, true, '必须标明未携带基线');
  assert.equal(audit.metadata.permissionCode, 'reports.update');
});

test('RF04-U22b 携带基线时审计记录基线值而非兼容标记', async () => {
  const db = createStubDb({ reports: [draftReport()] });
  const app = buildApp({ db, permissions: ['reports.update'] });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: {
      content: { n: 2 },
      expectedUpdatedAt: '2026-09-15T10:00:00.000Z',
      clientMutationId: 'u22b',
    },
  });
  assert.equal(res.status, 200);
  const audit = db.state.auditLogs.find((a) => a.entityType === 'REPORT');
  assert.equal(audit.metadata.noConcurrencyBaseline, undefined);
  assert.equal(audit.metadata.concurrencyBaseline, '2026-09-15T10:00:00.000Z');
});

// ── 规则 2（入口矩阵）：删除权限独立，不由 update 授权 ──────────────────────

test('RF04-U23 只有 milestones.update 时不能删除里程碑（删除不复用 update 授权）', async () => {
  const db = createStubDb({});
  db.state.milestones = [{
    id: 'm1', projectId: 'p1', name: '里程碑', deletedAt: null, updatedAt: new Date('2026-09-15T10:00:00Z'),
  }];
  const app = buildApp({ db, permissions: ['milestones.update'] });

  const res = await jsonRequest(app, '/api/sync/push', {
    body: syncPush('milestones', 'm1', {}, 'delete'),
  });
  const body = await readSyncResult(res);
  assert.equal(body.results[0].status, 'rejected', JSON.stringify(body.results[0]));
  assert.match(String(body.results[0].reason), /milestones\.delete/);
  assert.equal(db.state.milestones[0].deletedAt, null, '不得落软删');
});

test('RF04-U23b 具备 milestones.delete 时删除放行（软删）', async () => {
  const db = createStubDb({});
  db.state.milestones = [{
    id: 'm1', projectId: 'p1', name: '里程碑', deletedAt: null, updatedAt: new Date('2026-09-15T10:00:00Z'),
  }];
  const app = buildApp({ db, permissions: ['milestones.delete'] });

  const res = await jsonRequest(app, '/api/sync/push', {
    body: syncPush('milestones', 'm1', {}, 'delete'),
  });
  const body = await readSyncResult(res);
  assert.equal(body.results[0].status, 'applied', JSON.stringify(body.results[0]));
  assert.ok(db.state.milestones[0].deletedAt, '应写入软删时间');
});

test('RF04-U24 projects 删除必须 projects.delete；有 projects.update 也不放行', async () => {
  const db = createStubDb({});
  db.state.projects = [{ id: 'p1', name: '项目', deletedAt: null, updatedAt: new Date('2026-09-15T10:00:00Z') }];
  const app = buildApp({ db, permissions: ['projects.update'] });

  const res = await jsonRequest(app, '/api/sync/push', {
    body: syncPush('projects', 'p1', {}, 'delete'),
  });
  const body = await readSyncResult(res);
  assert.equal(body.results[0].status, 'rejected');
  assert.match(String(body.results[0].reason), /projects\.delete/);
  assert.equal(db.state.projects[0].deletedAt, null);
});

test('RF04-U25 指派与状态转换权限独立（同步入口同样分别校验）', async () => {
  const base = () => {
    const db = createStubDb({});
    db.state.tasks = [{
      id: 't1',
      projectId: 'p1',
      status: 'TODO',
      assigneeId: null,
      deletedAt: null,
      updatedAt: new Date('2026-09-15T10:00:00Z'),
    }];
    return db;
  };

  // 只有 tasks.update：不能改状态、不能指派
  const dbStatus = base();
  const statusRes = await jsonRequest(
    buildApp({ db: dbStatus, permissions: ['tasks.update'] }),
    '/api/sync/push',
    { body: syncPush('tasks', 't1', { status: 'IN_PROGRESS' }) },
  );
  assert.equal((await readSyncResult(statusRes)).results[0].status, 'rejected');
  assert.equal(dbStatus.state.tasks[0].status, 'TODO');

  const dbAssign = base();
  const assignRes = await jsonRequest(
    buildApp({ db: dbAssign, permissions: ['tasks.update'] }),
    '/api/sync/push',
    { body: syncPush('tasks', 't1', { assigneeId: 'u2' }) },
  );
  assert.equal((await readSyncResult(assignRes)).results[0].status, 'rejected');
  assert.equal(dbAssign.state.tasks[0].assigneeId, null);
});
