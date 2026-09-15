/**
 * RF02 真实集成测试 —— 幂等访问边界（专用隔离库 rdpms_test）
 *
 * 与路由替身测试的分工：本文件用真实 PostgreSQL 验证
 *   - 并发同键只生效一次（唯一索引 + 事务阻塞的真实语义）
 *   - 进程重启后回执仍在、重放不重复执行
 *   - 撤权后拒绝而不是回放
 *   - 事务失败不留回执
 * 桩依赖无法证明这些性质，故必须在真实库上验证。
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubActor } from '../helpers/stubDeps.mjs';
import {
  IT, seedMinimalFixture, revokeAuthorMembership, restoreAuthorMembership,
} from './fixtures.mjs';

const prisma = new PrismaClient();

const AUTHOR = createStubActor({
  userId: IT.userAuthor,
  displayName: '集成测试作者',
  permissions: ['reports.update', 'reports.submit'],
});

function buildApp(client = prisma) {
  return createApp({ db: client, actorResolver: async () => AUTHOR });
}

const PUT_KEY = 'it-key-put-0001';
const SUBMIT_KEY = 'it-key-submit-0001';

before(async () => {
  await seedMinimalFixture(prisma);
});

/**
 * audit_logs 在数据库层是 append-only（触发器禁止 UPDATE/DELETE），
 * 因此审计断言一律使用「增量」而不是绝对条数。
 */
function countReportAudits(action) {
  return prisma.auditLog.count({ where: { entityId: IT.report, ...(action ? { action } : {}) } });
}

beforeEach(async () => {
  await restoreAuthorMembership(prisma);
  await seedMinimalFixture(prisma);
  await prisma.mutationReceipt.deleteMany({ where: { actorId: AUTHOR.userId } });
  await prisma.reportVersion.deleteMany({ where: { reportId: IT.report } });
  await prisma.report.update({
    where: { id: IT.report },
    data: { status: 'DRAFT', content: {} },
  });
});

after(async () => {
  await prisma.mutationReceipt.deleteMany({ where: { actorId: AUTHOR.userId } });
  await prisma.reportVersion.deleteMany({ where: { reportId: IT.report } });
  await prisma.$disconnect();
});

function putReport(app, body, key = PUT_KEY) {
  return app.request(`/api/reports/${IT.report}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(body),
  });
}

function submitReport(app, key = SUBMIT_KEY) {
  return app.request(`/api/reports/${IT.report}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientMutationId: key }),
  });
}

test('RF02-I1 并发相同幂等键：只生效一次，其余回放同一响应', async () => {
  const app = buildApp();
  const auditsBefore = await countReportAudits('submit');

  const results = await Promise.all(
    Array.from({ length: 5 }, () => submitReport(app)),
  );
  const statuses = results.map((r) => r.status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200], `并发响应异常：${statuses}`);

  const versions = await prisma.reportVersion.count({ where: { reportId: IT.report } });
  assert.equal(versions, 1, '并发同键只能生成一个版本快照');

  const receipts = await prisma.mutationReceipt.count({ where: { actorId: AUTHOR.userId } });
  assert.equal(receipts, 1, '并发同键只能有一条回执');

  assert.equal(await countReportAudits('submit') - auditsBefore, 1, '并发同键只能写一条审计');

  const replays = results.filter((r) => r.headers.get('idempotent-replay') === 'true').length;
  assert.equal(replays, 4, `应有 4 次回放，实际 ${replays}`);
});

test('RF02-I2 进程重启后回执仍在：新客户端重放不重复执行', async () => {
  const app1 = buildApp();
  const first = await submitReport(app1);
  assert.equal(first.status, 200);

  // 模拟重启：全新的 PrismaClient 与应用实例（进程内不共享任何内存状态）
  const restartedClient = new PrismaClient();
  try {
    const app2 = createApp({ db: restartedClient, actorResolver: async () => AUTHOR });
    const second = await submitReport(app2);
    const body = await second.json();

    assert.equal(second.status, 200);
    assert.equal(second.headers.get('idempotent-replay'), 'true', '重启后必须命中持久化回执');
    assert.deepEqual(body, await first.json());

    const versions = await restartedClient.reportVersion.count({ where: { reportId: IT.report } });
    assert.equal(versions, 1, '重启后重放不得再生成版本');
  } finally {
    await restartedClient.$disconnect();
  }
});

test('RF02-I3 撤权后不得回放：同一 key 重试被拒绝', async () => {
  const app = buildApp();
  const ok = await putReport(app, { content: { n: 1 } });
  assert.equal(ok.status, 200);
  assert.equal(await prisma.mutationReceipt.count({ where: { actorId: AUTHOR.userId } }), 1);

  await revokeAuthorMembership(prisma);
  try {
    const retry = await putReport(app, { content: { n: 1 } });
    const body = await retry.json();
    assert.equal(retry.status, 404, `撤权后应拒绝，实际 ${retry.status}：${JSON.stringify(body)}`);
    assert.equal(retry.headers.get('idempotent-replay'), null, '不得回放撤权前的成功响应');
  } finally {
    await restoreAuthorMembership(prisma);
  }
});

test('RF02-I4 事务失败（状态不允许）：不留回执、不改数据', async () => {
  const app = buildApp();
  await prisma.report.update({ where: { id: IT.report }, data: { status: 'REVIEWED' } });

  const res = await submitReport(app, 'it-key-submit-failure');
  // 状态错误统一 409 INVALID_STATE（方案 §G；与保存/删除/撤回口径一致）
  assert.equal(res.status, 409, '已审阅的汇报不能再次提交');

  const receipts = await prisma.mutationReceipt.count({
    where: { actorId: AUTHOR.userId, idempotencyKey: 'it-key-submit-failure' },
  });
  assert.equal(receipts, 0, '失败不得留下回执');
  assert.equal(await prisma.reportVersion.count({ where: { reportId: IT.report } }), 0);
});

test('RF02-I5 相同幂等键、不同请求内容 → 409 且不改数据', async () => {
  const app = buildApp();
  const ok = await putReport(app, { content: { n: 1 } });
  assert.equal(ok.status, 200);

  const conflict = await putReport(app, { content: { n: 2 } });
  const body = await conflict.json();
  assert.equal(conflict.status, 409);
  assert.equal(body.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');

  const report = await prisma.report.findUnique({ where: { id: IT.report } });
  assert.deepEqual(report.content, { n: 1 }, '冲突请求不得改写业务数据');
  assert.equal(await prisma.mutationReceipt.count({ where: { actorId: AUTHOR.userId } }), 1);
});

test('RF02-I7 首次提交成功并改变状态后，同 key 同 payload 重试仍回放首次结果', async () => {
  const app = buildApp();
  const key = 'it-key-submit-state-change';

  const first = await submitReport(app, key);
  assert.equal(first.status, 200);
  const versionsAfterFirst = await prisma.reportVersion.count({ where: { reportId: IT.report } });
  assert.equal(versionsAfterFirst, 1);

  // 首次成功之后状态被复核为已审阅（内容锁定）——重试必须回放，而不是被状态检查拦住
  await prisma.report.update({ where: { id: IT.report }, data: { status: 'REVIEWED' } });

  const retry = await submitReport(app, key);
  const retryBody = await retry.json();
  assert.equal(retry.status, 200, `锁定后重试应回放，实际：${JSON.stringify(retryBody)}`);
  assert.equal(retry.headers.get('idempotent-replay'), 'true');
  assert.deepEqual(retryBody, await first.clone().json());
  assert.equal(
    await prisma.reportVersion.count({ where: { reportId: IT.report } }),
    1,
    '回放不得重复生成版本',
  );
});

test('RF02-I8 新 key 的锁定汇报仍被拒绝（回放机制不放宽新命令的状态校验）', async () => {
  const app = buildApp();
  await prisma.report.update({ where: { id: IT.report }, data: { status: 'REVIEWED' } });

  const res = await submitReport(app, 'it-key-submit-new-on-reviewed');
  assert.equal(res.status, 409, '新 key 的锁定汇报必须拒绝');
  assert.equal(
    await prisma.mutationReceipt.count({
      where: { actorId: AUTHOR.userId, idempotencyKey: 'it-key-submit-new-on-reviewed' },
    }),
    0,
    '被拒绝的新命令不得留下回执',
  );
});

test('RF02-I6 业务与审计同事务：提交后审计与版本都在同一提交中', async () => {
  const app = buildApp();
  const auditsBefore = await countReportAudits('submit');

  const res = await submitReport(app);
  assert.equal(res.status, 200);

  const receipt = await prisma.mutationReceipt.findFirst({
    where: { actorId: AUTHOR.userId, command: 'POST /api/reports/:id/submit' },
  });
  assert.ok(receipt, '成功后必须留下回执');
  assert.equal(receipt.responseStatus, 200);
  assert.equal(receipt.resourceScope, `report:${IT.report}`);

  assert.equal(await countReportAudits('submit') - auditsBefore, 1, '提交必须恰好写一条审计');
  assert.equal(await prisma.reportVersion.count({ where: { reportId: IT.report } }), 1);
});
