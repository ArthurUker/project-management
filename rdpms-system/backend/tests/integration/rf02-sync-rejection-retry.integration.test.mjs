/**
 * RF02 真实集成测试 —— 同步回执的「失败可重试、成功不重复」语义（专用隔离库 rdpms_test）
 *
 * 背景（F10 浏览器验收实测的阻断点）：
 *   旧实现在预取阶段对**任何**已记录的 clientMutationId 都直接回放首次结果，
 *   包括 rejected / conflict。于是「变更被拒 → 用户修好原因 → 点重试」永远拿到旧的拒绝，
 *   恢复闭环根本走不通；而回执本来的意义只是「已成功写入的不要重复写」。
 *
 * 本用例锁定新语义：
 *   - applied  → 回放首次结果，不再写库（幂等）；
 *   - rejected → 重新判定（原因已修复则成功落库）；
 *   - 失败结果被成功覆盖后，回执记录也更新为最新结果。
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubActor } from '../helpers/stubDeps.mjs';
import { IT, seedMinimalFixture, restoreAuthorMembership } from './fixtures.mjs';

const prisma = new PrismaClient();
const AUTHOR_ID = IT.userAuthor;

function buildApp(permissions) {
  return createApp({
    db: prisma,
    actorResolver: async () => createStubActor({ userId: AUTHOR_ID, displayName: '集成测试作者', permissions }),
  });
}

function push(app, clientMutationId, data) {
  return app.request('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'it-device-retry',
      changes: [{ clientMutationId, entity: 'reports', id: IT.report, op: 'upsert', data }],
    }),
  });
}

before(async () => {
  await seedMinimalFixture(prisma);
});

beforeEach(async () => {
  await restoreAuthorMembership(prisma);
  await seedMinimalFixture(prisma);
  await prisma.report.update({
    where: { id: IT.report },
    data: { status: 'DRAFT', content: {}, deletedAt: null },
  });
});

after(async () => {
  await prisma.syncMutation.deleteMany({ where: { clientMutationId: { startsWith: 'it-retry-' } } });
  await prisma.$disconnect();
});

test('RF02-I4 被拒绝的同步变更：修好原因后用同一 key 重试必须真正落库', async () => {
  const app = buildApp(['reports.update', 'reports.create']);
  const mutationId = `it-retry-${Date.now()}`;

  // 1) 已审阅 → 拒绝
  await prisma.report.update({ where: { id: IT.report }, data: { status: 'REVIEWED' } });
  const first = await (await push(app, mutationId, { content: { round: 1 } })).json();
  assert.equal(first.results[0].status, 'rejected', `锁定状态必须拒绝：${JSON.stringify(first.results[0])}`);
  let row = await prisma.report.findUnique({ where: { id: IT.report } });
  assert.deepEqual(row.content, {}, '被拒时不得写库');

  // 2) 修好原因（退回草稿）→ 同一 key 重试
  await prisma.report.update({ where: { id: IT.report }, data: { status: 'DRAFT' } });
  const second = await (await push(app, mutationId, { content: { round: 2 } })).json();
  assert.equal(
    second.results[0].status,
    'applied',
    `原因修复后同 key 重试必须放行，而不是回放旧的 rejected：${JSON.stringify(second.results[0])}`,
  );
  row = await prisma.report.findUnique({ where: { id: IT.report } });
  assert.deepEqual(row.content, { round: 2 }, '重试必须真正写入');

  // 3) 回执被更新为最新结果（不是留着第一次的 rejected）
  const receipt = await prisma.syncMutation.findUnique({ where: { clientMutationId: mutationId } });
  assert.equal(receipt.status, 'applied');

  // 4) 成功之后再推同一 key：回放首次结果，不重复写库（幂等语义不被削弱）
  const third = await (await push(app, mutationId, { content: { round: 3 } })).json();
  assert.equal(third.results[0].status, 'applied');
  assert.equal(third.results[0].replayed, true, '已成功的变更必须标记为回放');
  row = await prisma.report.findUnique({ where: { id: IT.report } });
  assert.deepEqual(row.content, { round: 2 }, '回放不得再次写入（内容保持首次成功的结果）');
});
