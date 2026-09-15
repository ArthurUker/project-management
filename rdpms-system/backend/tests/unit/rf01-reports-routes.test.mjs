/**
 * RF01 回归用例 2/3 —— 日报创建/审核/驳回不得因未导入标识符而 500（F02）
 *
 * 修复前：backend/src/routes/reports.js 调用 assertProjectCapability 但未导入，
 *   走到该行即抛 ReferenceError → 500（与 evidence/reproduction-results.json R02 一致）。
 * 修复后：三条路径在注入桩依赖、不连数据库的条件下返回业务状态码。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/bootstrap/createApp.js';
import { createStubDb, createStubActor, jsonRequest, createGate } from '../helpers/stubDeps.mjs';

const AUTHOR = { userId: 'u1', displayName: '作者' };
const REVIEWER = { userId: 'u2', displayName: '复核人' };

/** 以注入依赖构建不连数据库的应用；actor 直接由 actorResolver 提供，绕过 JWT */
async function buildAppWithActor(actor) {
  return createApp({
    db: createStubDb({ reports: [] }),
    actorResolver: async () => actor,
  });
}

test('RF01-03 POST /api/reports 创建日报不返回 ReferenceError', async () => {
  const db = createStubDb({ reports: [] });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['reports.create'] }),
  });

  const res = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: {} },
  });
  const payload = await res.json();

  assert.notEqual(res.status, 500, `不应 500，实际响应：${JSON.stringify(payload)}`);
  assert.doesNotMatch(JSON.stringify(payload), /is not defined/);
  assert.equal(res.status, 201);
  assert.equal(payload.projectId, 'p1');
});

test('RF01-04 POST /api/reports/:id/approve 审阅不返回 ReferenceError', async () => {
  const report = {
    id: 'r1',
    projectId: 'p1',
    authorId: AUTHOR.userId,
    reportType: 'DAILY',
    periodKey: '2026-09-15',
    status: 'SUBMITTED',
    content: {},
    deletedAt: null,
  };
  const db = createStubDb({ reports: [report] });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...REVIEWER, permissions: ['reports.review'] }),
  });

  const res = await jsonRequest(app, '/api/reports/r1/approve', { body: { note: 'ok' } });
  const payload = await res.json();

  assert.notEqual(res.status, 500, `不应 500，实际响应：${JSON.stringify(payload)}`);
  assert.doesNotMatch(JSON.stringify(payload), /is not defined/);
  assert.equal(res.status, 200);
  assert.equal(payload.status, 'REVIEWED');
});

test('RF01-05 POST /api/reports/:id/reject 驳回不返回 ReferenceError', async () => {
  const report = {
    id: 'r2',
    projectId: 'p1',
    authorId: AUTHOR.userId,
    reportType: 'DAILY',
    periodKey: '2026-09-15',
    status: 'SUBMITTED',
    content: {},
    deletedAt: null,
  };
  const db = createStubDb({ reports: [report] });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...REVIEWER, permissions: ['reports.review'] }),
  });

  const res = await jsonRequest(app, '/api/reports/r2/reject', { body: { note: '补充数据' } });
  const payload = await res.json();

  assert.notEqual(res.status, 500, `不应 500，实际响应：${JSON.stringify(payload)}`);
  assert.doesNotMatch(JSON.stringify(payload), /is not defined/);
  assert.equal(res.status, 200);
  assert.equal(payload.status, 'NEEDS_REVISION');
});

test('RF01-06 注入的 db 与 actor 确实生效（依赖注入而非全局单例）', async () => {
  const first = createStubDb({ reports: [] });
  const second = createStubDb({ reports: [] });

  const appA = createApp({
    db: first,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['reports.create'] }),
  });
  await jsonRequest(appA, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: {} },
  });

  assert.equal(first.state.reports.length, 1, '应写入注入的 db');
  assert.equal(second.state.reports.length, 0, '不应写入未注入的 db');

  const appB = createApp({
    db: second,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['reports.create'] }),
  });
  await jsonRequest(appB, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: {} },
  });
  assert.equal(second.state.reports.length, 1, '第二个 app 应使用第二个 db');
  assert.equal(first.state.reports.length, 1, '第一个 app 的历史数据不受第二个实例影响');
});

test('RF01-09 两个应用实例交错请求时数据库完全隔离（实例级注入）', async () => {
  const gate = createGate();
  const dbA = createStubDb({ reports: [], beforeProjectLookup: () => gate.wait() });
  const dbB = createStubDb({ reports: [] });

  const appA = createApp({
    db: dbA,
    actorResolver: async () => createStubActor({ ...AUTHOR, displayName: '实例A', permissions: ['reports.create'] }),
  });
  const appB = createApp({
    db: dbB,
    actorResolver: async () => createStubActor({ ...AUTHOR, displayName: '实例B', permissions: ['reports.create'] }),
  });

  // A 的请求先进入处理器并挂起
  const pendingA = jsonRequest(appA, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: { from: 'A' } },
  });
  await gate.arrived;

  // A 仍挂起时，B 的请求完整跑完（真交错，而不是顺序执行）
  const resB = await jsonRequest(appB, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-16', content: { from: 'B' } },
  });
  assert.equal(resB.status, 201);

  gate.release();
  const resA = await pendingA;
  assert.equal(resA.status, 201);

  assert.equal(dbA.state.reports.length, 1, '实例 A 只应写自己的 db');
  assert.equal(dbB.state.reports.length, 1, '实例 B 只应写自己的 db');
  assert.equal(dbA.state.reports[0].periodKey, '2026-09-15');
  assert.equal(dbB.state.reports[0].periodKey, '2026-09-16');
  assert.deepEqual(dbA.state.reports[0].content, { from: 'A' });
  assert.deepEqual(dbB.state.reports[0].content, { from: 'B' });
});

test('RF01-10 交错请求中的鉴权上下文同样不串用（身份来自各自实例）', async () => {
  const gate = createGate();
  const dbA = createStubDb({ reports: [], beforeProjectLookup: () => gate.wait() });
  const dbB = createStubDb({ reports: [] });

  const appA = createApp({
    db: dbA,
    actorResolver: async () => createStubActor({ userId: 'ua', permissions: ['reports.create'] }),
  });
  const appB = createApp({
    db: dbB,
    actorResolver: async () => createStubActor({ userId: 'ub', permissions: ['reports.create'] }),
  });

  const pendingA = jsonRequest(appA, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: {} },
  });
  await gate.arrived;

  await jsonRequest(appB, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-16', content: {} },
  });

  gate.release();
  await pendingA;

  assert.equal(dbA.state.reports[0].authorId, 'ua');
  assert.equal(dbB.state.reports[0].authorId, 'ub');
});
