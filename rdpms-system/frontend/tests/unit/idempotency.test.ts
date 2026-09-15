/**
 * RF02 复核的前端用例 —— 幂等键必须对「同一次逻辑操作」稳定复用。
 *
 * 背景：若每次点保存都生成新 key，则「请求已到服务端但响应丢失」后的重试会被服务端当成新命令，
 * 造成重复写入或覆盖。稳定 key 让重试命中已提交回执、返回首次结果。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stableMutationId } from '../../src/shared/idempotency';

test('RF02-FE1 同一逻辑操作（相同内容）派生同一 key', async () => {
  const parts = { op: 'report.save', projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15', content: { n: 1 } };
  const first = await stableMutationId(parts);
  const retry = await stableMutationId({ ...parts });
  assert.equal(first, retry);
  assert.match(first, /^op-[0-9a-f]{40}$/);
});

test('RF02-FE2 内容变化后派生新 key（避免与服务端已存回执的 payloadHash 冲突）', async () => {
  const base = { op: 'report.save', projectId: 'p1', reportType: 'DAILY', periodKey: '2026-09-15' };
  const a = await stableMutationId({ ...base, content: { n: 1 } });
  const b = await stableMutationId({ ...base, content: { n: 2 } });
  assert.notEqual(a, b);
});

test('RF02-FE3 不同目标的 key 相互独立', async () => {
  const base = { op: 'report.save', reportType: 'DAILY', periodKey: '2026-09-15', content: { n: 1 } };
  const p1 = await stableMutationId({ ...base, projectId: 'p1' });
  const p2 = await stableMutationId({ ...base, projectId: 'p2' });
  assert.notEqual(p1, p2);
});

test('RF02-FE4 提交操作的 key 只与目标汇报有关', async () => {
  const a = await stableMutationId({ op: 'report.submit', reportId: 'r1' });
  const b = await stableMutationId({ op: 'report.submit', reportId: 'r1' });
  const c = await stableMutationId({ op: 'report.submit', reportId: 'r2' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
