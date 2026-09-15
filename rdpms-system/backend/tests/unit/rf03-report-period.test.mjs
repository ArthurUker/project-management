/**
 * RF03 回归用例 —— 日报周期键与提交语义（路由替身测试，不连数据库）
 *
 * 对应发现：F03（DAILY 按月份保存导致不同日期互相覆盖）、
 *          F05（POST 可原地写入 status；保存与提交不分）
 * 验收（06_重构任务与发布门禁.md RF03）：
 *   - 同人同项目两天 DAILY 产生两条
 *   - 「提交」确实写版本和状态
 *   - 客户端 REVIEWED 被拒绝
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubDb, createStubActor, jsonRequest } from '../helpers/stubDeps.mjs';

const AUTHOR = { userId: 'u1', displayName: '作者' };

function buildApp(db, permissions = ['reports.create', 'reports.update', 'reports.submit']) {
  return createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions }),
  });
}

function dailyReport(overrides = {}) {
  return {
    id: 'r1',
    projectId: 'p1',
    authorId: AUTHOR.userId,
    reportType: 'DAILY',
    periodKey: '2026-09-15',
    status: 'DRAFT',
    content: {},
    deletedAt: null,
    ...overrides,
  };
}

test('RF03-U1 DAILY 拒绝月份键（F03：09-14 与 09-15 不能落到同一键）', async () => {
  const db = createStubDb({ reports: [] });
  const app = buildApp(db);

  const res = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09', content: {} },
  });
  const body = await res.json();

  assert.equal(res.status, 400, `月份键应被拒绝，实际：${JSON.stringify(body)}`);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(db.state.reports.length, 0, '非法键不得写入');
});

test('RF03-U2 同人同项目两天 DAILY 产生两条', async () => {
  const db = createStubDb({ reports: [] });
  const app = buildApp(db);

  const r14 = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-14', content: { n: 14 } },
  });
  const r15 = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: { n: 15 } },
  });

  assert.equal(r14.status, 201);
  assert.equal(r15.status, 201);
  assert.equal(db.state.reports.length, 2, '两天必须产生两条，而不是互相覆盖');
  assert.deepEqual(
    db.state.reports.map((r) => r.periodKey).sort(),
    ['2026-09-14', '2026-09-15'],
  );
});

test('RF03-U3 同一天重复保存仍然只更新同一条（幂等键语义不变）', async () => {
  const db = createStubDb({ reports: [] });
  const app = buildApp(db);

  await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: { n: 1 } },
  });
  await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: { n: 2 } },
  });

  assert.equal(db.state.reports.length, 1);
  assert.deepEqual(db.state.reports[0].content, { n: 2 });
});

test('RF03-U4 WEEKLY / MONTHLY 键格式校验', async () => {
  const db = createStubDb({ reports: [] });
  const app = buildApp(db);

  const bad = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'WEEKLY', periodKey: '2026-38', content: {} },
  });
  assert.equal(bad.status, 400, 'WEEKLY 必须是 ISO 周键');

  const ok = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'WEEKLY', periodKey: '2026-W38', content: {} },
  });
  assert.equal(ok.status, 201);

  const badMonth = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'MONTHLY', periodKey: '2026-13', content: {} },
  });
  assert.equal(badMonth.status, 400, '月份必须在 01-12');
});

test('RF03-U5 不存在的日期（2026-02-30）被拒绝', async () => {
  const db = createStubDb({ reports: [] });
  const app = buildApp(db);

  const res = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-02-30', content: {} },
  });
  assert.equal(res.status, 400);
});

test('RF03-U6 客户端 REVIEWED 被拒绝（F05：保存接口不得写入状态）', async () => {
  const db = createStubDb({ reports: [] });
  const app = buildApp(db);

  const res = await jsonRequest(app, '/api/reports', {
    body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: {}, status: 'REVIEWED' },
  });
  const body = await res.json();

  assert.equal(res.status, 400, `客户端不得设置状态，实际：${JSON.stringify(body)}`);
  assert.equal(db.state.reports.length, 0);
});

test('RF03-U7 已提交/已审阅的汇报不能被保存接口覆盖', async () => {
  for (const status of ['SUBMITTED', 'REVIEWED']) {
    const db = createStubDb({ reports: [dailyReport({ status })] });
    const app = buildApp(db);

    const res = await jsonRequest(app, '/api/reports', {
      body: { projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: { hacked: true } },
    });

    assert.equal(res.status, 409, `${status} 汇报不得被保存接口覆盖`);
    assert.deepEqual(db.state.reports[0].content, {}, '已提交内容必须保持不变');
  }
});

test('RF03-U8 PUT 同样按类型校验 periodKey', async () => {
  const db = createStubDb({ reports: [dailyReport()] });
  const app = buildApp(db);

  const bad = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { periodKey: '2026-09' },
  });
  assert.equal(bad.status, 400, 'DAILY 的 PUT 不得写入月份键');

  const ok = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { periodKey: '2026-09-16' },
  });
  assert.equal(ok.status, 200);
  assert.equal(db.state.reports[0].periodKey, '2026-09-16');
});

test('RF03-U9 PUT 改类型时必须与键格式一致', async () => {
  const db = createStubDb({ reports: [dailyReport()] });
  const app = buildApp(db);

  const mismatch = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { reportType: 'MONTHLY', periodKey: '2026-09-16' },
  });
  const body = await mismatch.json();
  assert.equal(mismatch.status, 400, `类型与键必须一致，实际：${JSON.stringify(body)}`);

  const ok = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { reportType: 'MONTHLY', periodKey: '2026-09' },
  });
  assert.equal(ok.status, 200);
  assert.equal(db.state.reports[0].reportType, 'MONTHLY');
});

test('RF03-U10 提交确实写版本与状态（并留严格审计）', async () => {
  const db = createStubDb({ reports: [dailyReport()] });
  const app = buildApp(db);

  const res = await jsonRequest(app, '/api/reports/r1/submit', {
    body: { clientMutationId: 'rf03-submit-key' },
  });

  assert.equal(res.status, 200);
  assert.equal(db.state.reports[0].status, 'SUBMITTED');
  assert.equal(db.state.reportVersions.length, 1, '提交必须写版本快照');
  assert.equal(db.state.reportVersions[0].version, 1);
  assert.equal(db.state.auditLogs.length, 1);
  assert.equal(db.state.auditLogs[0].action, 'submit');
});
