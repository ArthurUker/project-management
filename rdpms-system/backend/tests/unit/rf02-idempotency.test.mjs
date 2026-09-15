/**
 * RF02 回归用例 —— 幂等访问边界（路由替身测试，不连数据库）
 *
 * 对应发现：F01（鉴权前缓存命中）、F09（回执非原子、不校验内容哈希）
 * 验收（06_重构任务与发布门禁.md RF02）：
 *   - 相同 key 不同用户/路径不能回放他人内容
 *   - 撤权后不能回放
 *   - 不同 payload 409
 *   - 业务失败不留下成功回执与半成品
 * 真实数据库下的并发/重启语义由 tests/integration 覆盖（本文件用桩依赖）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/bootstrap/createApp.js';
import { createStubDb, createStubActor, jsonRequest } from '../helpers/stubDeps.mjs';

const U1 = { userId: 'u1', displayName: '作者一' };
const U2 = { userId: 'u2', displayName: '作者二' };

function draftReport(id, authorId = U1.userId) {
  return {
    id,
    projectId: 'p1',
    authorId,
    reportType: 'DAILY',
    periodKey: '2026-09-15',
    status: 'DRAFT',
    content: {},
    deletedAt: null,
  };
}

function buildApp({ db, actor }) {
  return createApp({ db, actorResolver: async () => actor });
}

const KEY = '11111111-1111-4111-8111-111111111111';
const KEY2 = '22222222-2222-4222-8222-222222222222';

test('RF02-U1 相同幂等键、不同用户：不得回放他人响应', async () => {
  const db = createStubDb({ reports: [draftReport('r1')] });

  const appA = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });
  const resA = await jsonRequest(appA, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { by: 'u1' } },
  });
  assert.equal(resA.status, 200);

  const appB = buildApp({ db, actor: createStubActor({ ...U2, permissions: ['reports.update'] }) });
  const resB = await jsonRequest(appB, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { by: 'u2' } },
  });
  const bodyB = await resB.json();

  assert.notEqual(resB.status, 200, `不得回放他人响应，实际：${JSON.stringify(bodyB)}`);
  // 非作者由路由既有口径拒绝（badRequest('FORBIDDEN')，状态码 400 + code=FORBIDDEN；
  // 统一为 403 属 RF04 的授权收敛范围，本用例只锁定「不得回放」这一 RF02 语义）
  assert.equal(bodyB.code, 'FORBIDDEN', '非作者应被拒绝');
  assert.equal(resB.headers.get('idempotent-replay'), null, '不得返回回放响应');
  assert.equal(db.state.reports[0].content.by, 'u1', '他人请求不得改写作者的汇报');
});

test('RF02-U2 相同幂等键、不同资源：不得跨资源回放', async () => {
  const db = createStubDb({ reports: [draftReport('r1'), draftReport('r2')] });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });

  const res1 = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });
  assert.equal(res1.status, 200);

  const res2 = await jsonRequest(app, '/api/reports/r2', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 2 } },
  });
  const body2 = await res2.json();

  assert.equal(res2.status, 200, '不同资源应各自执行');
  assert.equal(body2.id, 'r2', '不得返回 r1 的回放结果');
  assert.equal(res2.headers.get('idempotent-replay'), null);
  assert.equal(db.state.reports.find((r) => r.id === 'r2').content.n, 2);
});

test('RF02-U3 相同幂等键、不同请求内容 → 409 且不回放', async () => {
  const db = createStubDb({ reports: [draftReport('r1')] });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });

  const first = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });
  assert.equal(first.status, 200);

  const second = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 999 } },
  });
  const body = await second.json();

  assert.equal(second.status, 409);
  assert.equal(body.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  assert.equal(db.state.reports[0].content.n, 1, '内容不同的重试不得改写业务数据');
});

test('RF02-U4 相同幂等键、相同内容：返回存储响应且业务只执行一次', async () => {
  const db = createStubDb({ reports: [draftReport('r1')] });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });

  const payload = { content: { n: 1 }, clientMutationId: KEY };
  const first = await jsonRequest(app, '/api/reports/r1', { method: 'PUT', body: payload });
  assert.equal(first.status, 200);

  const writesAfterFirst = db.state.writes.filter((w) => w.op === 'report.update').length;
  const receiptsAfterFirst = db.state.mutationReceipts.length;
  assert.equal(receiptsAfterFirst, 1);

  const second = await jsonRequest(app, '/api/reports/r1', { method: 'PUT', body: payload });
  const body = await second.json();

  assert.equal(second.status, 200);
  assert.equal(second.headers.get('idempotent-replay'), 'true');
  assert.deepEqual(body, await first.json(), '重放必须返回与首次一致的响应体');
  assert.equal(
    db.state.writes.filter((w) => w.op === 'report.update').length,
    writesAfterFirst,
    '重放不得再次执行业务写入',
  );
  assert.equal(db.state.mutationReceipts.length, receiptsAfterFirst, '重放不得新增回执');
  assert.equal(db.state.auditLogs.length, 1, '重放不得重复写审计');
});

test('RF02-U5 业务校验失败：不留下回执与半成品', async () => {
  const reviewed = { ...draftReport('r1'), status: 'REVIEWED' };
  const db = createStubDb({ reports: [reviewed] });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });

  assert.equal(res.status, 400);
  assert.equal(db.state.mutationReceipts.length, 0, '失败不得留下回执');
  assert.equal(db.state.auditLogs.length, 0, '失败不得留下审计');
  assert.deepEqual(db.state.reports[0].content, {}, '失败不得改写业务数据');
});

test('RF02-U6 未授权（非项目成员）：先授权后回执，不产生回执', async () => {
  const db = createStubDb({ reports: [draftReport('r1')], membership: null });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });

  assert.equal(res.status, 404, '非成员应 404（隐藏资源存在性）');
  assert.equal(db.state.mutationReceipts.length, 0, '未授权请求不得写入回执');
  assert.deepEqual(db.state.reports[0].content, {});
});

test('RF02-U7 撤权后不得回放：同一 key 重试返回拒绝而不是旧成功响应', async () => {
  const db = createStubDb({ reports: [draftReport('r1')] });
  const actor = createStubActor({ ...U1, permissions: ['reports.update'] });
  const app = buildApp({ db, actor });

  // 1) 有权限时成功一次并留下回执
  const ok = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });
  assert.equal(ok.status, 200);
  assert.equal(db.state.mutationReceipts.length, 1);

  // 2) 被移出项目（leftAt 非空）后用同一 key 重试
  db.projectMember.findUnique = async () => ({ role: 'MEMBER', leftAt: new Date('2026-09-15T00:00:00Z') });
  const retry = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });
  const body = await retry.json();

  assert.equal(retry.status, 404);
  assert.equal(retry.headers.get('idempotent-replay'), null);
  assert.notEqual(body.id, 'r1', '不得回放撤权前的成功响应');
});

test('RF02-U8 审计写入失败：业务回滚，不留回执（关键证据与业务同生共死）', async () => {
  const db = createStubDb({ reports: [draftReport('r1')], failAuditWrite: true });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });

  assert.equal(res.status, 500);
  assert.deepEqual(db.state.reports[0].content, {}, '审计失败必须回滚业务写入');
  assert.equal(db.state.mutationReceipts.length, 0, '审计失败不得留下回执');
});

test('RF02-U9 提交命令（POST /submit）同样走回执：重放不重复生成版本', async () => {
  const report = { ...draftReport('r1'), status: 'DRAFT' };
  const db = createStubDb({ reports: [report] });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.submit'] }) });

  const first = await jsonRequest(app, '/api/reports/r1/submit', {
    body: { clientMutationId: KEY2 },
  });
  assert.equal(first.status, 200);
  assert.equal(db.state.reportVersions.length, 1);

  const second = await jsonRequest(app, '/api/reports/r1/submit', {
    body: { clientMutationId: KEY2 },
  });
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('idempotent-replay'), 'true');
  assert.equal(db.state.reportVersions.length, 1, '重放不得重复生成版本快照');
  assert.equal(db.state.reports[0].status, 'SUBMITTED');
  assert.equal(db.state.auditLogs.length, 1);
});

test('RF02-U11 未认证请求持相同 key：返回 401，不回放已缓存的成功响应（F01 回归）', async () => {
  const db = createStubDb({ reports: [draftReport('r1')] });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });

  const ok = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });
  assert.equal(ok.status, 200);

  // 同一 app 上不带身份头/无 actor 的请求：默认 JWT 流程应拒绝，且不得回放上面的 200
  const anonymousApp = createApp({ db }); // 不注入 actorResolver → 走默认鉴权
  const anon = await anonymousApp.request('/api/reports/r1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'idempotency-key': KEY },
    body: JSON.stringify({ content: { n: 1 } }),
  });
  assert.equal(anon.status, 401, '鉴权前不得回放任何缓存响应');
  assert.equal(anon.headers.get('idempotent-replay'), null);
});

test('RF02-U12 相同 key、不同命令：不得跨命令回放', async () => {
  const db = createStubDb({ reports: [draftReport('r1')] });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update', 'reports.submit'] }) });

  const putRes = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    headers: { 'idempotency-key': KEY },
    body: { content: { n: 1 } },
  });
  assert.equal(putRes.status, 200);

  const submitRes = await jsonRequest(app, '/api/reports/r1/submit', {
    body: { clientMutationId: KEY },
  });
  const submitBody = await submitRes.json();

  assert.equal(submitRes.status, 200, '不同命令应各自执行');
  assert.equal(submitRes.headers.get('idempotent-replay'), null);
  assert.deepEqual(submitBody, { success: true }, '不得返回 PUT 的回放响应');
  assert.equal(db.state.reports[0].status, 'SUBMITTED');
});

test('RF02-U10 无幂等键时仍执行（兼容旧客户端），但不写回执', async () => {
  const db = createStubDb({ reports: [draftReport('r1')] });
  const app = buildApp({ db, actor: createStubActor({ ...U1, permissions: ['reports.update'] }) });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { content: { n: 1 } },
  });

  assert.equal(res.status, 200);
  assert.equal(db.state.mutationReceipts.length, 0);
  assert.equal(db.state.auditLogs.length, 1, '无幂等键也必须写严格审计');
});
