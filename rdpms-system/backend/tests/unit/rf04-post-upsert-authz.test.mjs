/**
 * A02 回归：POST「创建/保存草稿」命中已有汇报时，不得绕过更新权限与并发基线
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubDb, createStubActor, jsonRequest } from '../helpers/stubDeps.mjs';

const AUTHOR = { userId: 'u1', displayName: '作者' };
const OWNER = { role: 'OWNER', leftAt: null };
const V2 = { 'x-client-contract': 'v2' };
const existing = (over = {}) => ({
  id: 'r1', projectId: 'p1', authorId: 'u1', reportType: 'MONTHLY', periodKey: '2026-09',
  status: 'DRAFT', content: { oil: { result: 'pass' }, tpmValue: 0.3 }, deletedAt: null,
  updatedAt: new Date('2026-09-17T00:00:00Z'), ...over,
});
const body = (content, extra = {}) => ({
  projectId: 'p1', reportType: 'MONTHLY', periodKey: '2026-09', content,
  clientMutationId: `a02-${Math.random().toString(16).slice(2, 8)}`, ...extra,
});
function app(db, permissions) {
  return createApp({ db, actorResolver: async () => createStubActor({ ...AUTHOR, permissions }) });
}

test('A02-1 仅有 reports.create 时不得覆盖已有草稿 → 403', async () => {
  const db = createStubDb({ reports: [existing()], membership: OWNER });
  const res = await jsonRequest(app(db, ['reports.create']), '/api/reports', { body: body({ oil: { result: 'fail' } }) });
  assert.equal(res.status, 403, `期望 403，实际 ${res.status}`);
  assert.equal((await res.json()).code, 'PERMISSION_DENIED');
  assert.deepEqual(db.state.reports[0].content, { oil: { result: 'pass' }, tpmValue: 0.3 }, '内容不得被覆盖');
});

test('A02-2 新版客户端覆盖已有草稿必须带基线 → 400', async () => {
  const db = createStubDb({ reports: [existing()], membership: OWNER });
  const res = await jsonRequest(app(db, ['reports.create', 'reports.update']), '/api/reports', {
    headers: V2, body: body({ tpmValue: 0.2 }),
  });
  assert.equal(res.status, 400, `期望 400，实际 ${res.status}`);
  assert.equal((await res.json()).code, 'CONCURRENCY_BASELINE_REQUIRED');
  assert.equal(db.state.reports[0].content.tpmValue, 0.3, '不得写入');
});

test('A02-3 有 update 权限 + 正确基线 → 原子更新成功且审计记录基线', async () => {
  const db = createStubDb({ reports: [existing()], membership: OWNER });
  const res = await jsonRequest(app(db, ['reports.create', 'reports.update']), '/api/reports', {
    body: body({ tpmValue: 0.2 }, { expectedUpdatedAt: '2026-09-17T00:00:00.000Z' }),
  });
  assert.ok([200, 201].includes(res.status), `期望 2xx，实际 ${res.status}`);
  assert.equal(db.state.reports[0].content.tpmValue, 0.2, '基线匹配应写入');
  const audit = db.state.auditLogs.find((a) => a.entityType === 'REPORT');
  assert.equal(audit.metadata.permissionCode, 'reports.update', '覆盖已有汇报按 update 计权');
  assert.equal(audit.metadata.concurrencyBaseline, '2026-09-17T00:00:00.000Z');
});

test('A02-4 过期基线不得覆盖 → 409 CONFLICT', async () => {
  const db = createStubDb({ reports: [existing()], membership: OWNER });
  const res = await jsonRequest(app(db, ['reports.create', 'reports.update']), '/api/reports', {
    body: body({ tpmValue: 0.9 }, { expectedUpdatedAt: '2026-09-16T00:00:00.000Z' }),
  });
  assert.equal(res.status, 409, `期望 409，实际 ${res.status}`);
  assert.equal((await res.json()).code, 'CONFLICT');
  assert.equal(db.state.reports[0].content.tpmValue, 0.3, '过期基线不得写入');
});

test('A02-5 旧客户端对实验科学草稿无基线覆盖 → 409（兼容路径边界）', async () => {
  const db = createStubDb({
    reports: [existing({ content: { reagentReports: [{ items: [{ name: '样品A' }] }] } })], membership: OWNER,
  });
  const res = await jsonRequest(app(db, ['reports.create', 'reports.update']), '/api/reports', {
    body: body({ tpmValue: 0.1 }),
  });
  assert.equal(res.status, 409, `期望 409，实际 ${res.status}`);
  assert.equal((await res.json()).code, 'CONCURRENCY_BASELINE_REQUIRED');
  assert.ok(db.state.reports[0].content.reagentReports, '实验数据必须保持原样');
});

test('A02-6 新周期仍走创建路径（不被授权收紧误伤）', async () => {
  const db = createStubDb({ reports: [], membership: OWNER });
  const res = await jsonRequest(app(db, ['reports.create']), '/api/reports', { body: body({ tpmValue: 0.5 }) });
  assert.equal(res.status, 201, `期望 201，实际 ${res.status}`);
  assert.equal(db.state.reports.length, 1);
});
