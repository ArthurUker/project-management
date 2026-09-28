/**
 * F10 用例 —— 被拒绝的离线变更必须持久、可恢复、按账户隔离
 *
 * 这里跑的是**真实 IndexedDB 实现**（fake-indexeddb，浏览器外的同款 API），
 * 走的是 src/offline/idb.ts 的生产代码路径，不是内存替身：
 *   - 拒绝 = 同一事务内「写入持久拒绝区 → 移出待发送队列」；
 *   - 刷新 / 重新登录后仍能恢复；
 *   - 重复拒绝不丢内容；不同账户读不到彼此的草稿。
 */
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idb } from '../../src/offline/idb';
import {
  buildDeadLetter,
  mergeDeadLetter,
  deadLetterKey,
  isVisibleTo,
  type DeadLetterRecord,
} from '../../src/offline/deadLetter';

const U_A = 'user-a';
const U_B = 'user-b';

async function cleanup(): Promise<void> {
  await idb.outboxClear();
  for (const uid of [U_A, U_B]) {
    for (const row of await idb.deadLettersForUser(uid)) {
      await idb.deadLetterDelete(row.key);
    }
  }
}

function outboxRow(clientMutationId: string) {
  return {
    clientMutationId,
    entity: 'tasks',
    op: 'upsert' as const,
    id: 't1',
    data: { title: '离线改名', projectId: 'p1' },
    baseUpdatedAt: '2026-09-15T10:00:00.000Z',
    createdAt: '2026-09-15T10:05:00.000Z',
  };
}

test('F10-I1 拒绝时同一事务完成「写入拒绝区 + 移出队列」', async () => {
  await cleanup();
  const row = outboxRow('ml-1');
  await idb.outboxPut(row);

  const record = buildDeadLetter({
    userId: U_A,
    outbox: row,
    projectId: 'p1',
    reason: '缺少权限 tasks.assign',
    code: 'PERMISSION_DENIED',
    now: '2026-09-15T10:06:00.000Z',
  });
  await idb.deadLetterMove(record, (existing) => mergeDeadLetter(
    existing as DeadLetterRecord | undefined,
    record,
  ));

  const stored = await idb.deadLettersForUser(U_A);
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].payload, { title: '离线改名', projectId: 'p1' }, '原始 payload 必须原样保留');
  assert.equal(stored[0].reason, '缺少权限 tasks.assign');
  assert.equal(stored[0].projectId, 'p1', '项目归属必须保留');
  assert.equal(stored[0].clientMutationId, 'ml-1', '操作身份必须保留');
  assert.equal((await idb.outboxAll()).length, 0, '必须同时移出待发送队列');
});

test('F10-I2 刷新后仍能恢复（数据在 IndexedDB，不在内存）', async () => {
  await cleanup();
  const row = outboxRow('ml-2');
  const record = buildDeadLetter({
    userId: U_A, outbox: row, reason: '跨项目 phaseId', now: '2026-09-15T10:06:00.000Z',
  });
  await idb.outboxPut(row);
  await idb.deadLetterMove(record, () => record);

  // 模拟页面刷新：只从存储重新读取
  const afterReload = await idb.deadLettersForUser(U_A);
  assert.equal(afterReload.length, 1);
  assert.deepEqual(afterReload[0].payload, row.data, '刷新后内容必须还在');
});

test('F10-I3 重复拒绝不丢内容：保留最早 payload，累加次数', async () => {
  await cleanup();
  const first = buildDeadLetter({
    userId: U_A,
    outbox: outboxRow('ml-3'),
    reason: '第一次：权限不足',
    now: '2026-09-15T10:06:00.000Z',
  });
  await idb.deadLetterMove(first, () => first);

  // 第二次拒绝：这次没有 payload（例如已从队列取不到内容）
  const second = buildDeadLetter({
    userId: U_A,
    outbox: { clientMutationId: 'ml-3', entity: 'tasks', op: 'upsert', id: 't1' },
    reason: '第二次：仍然权限不足',
    now: '2026-09-15T10:09:00.000Z',
  });
  await idb.deadLetterMove(second, (existing) => mergeDeadLetter(
    existing as DeadLetterRecord | undefined,
    second,
  ));

  const stored = await idb.deadLettersForUser(U_A);
  assert.equal(stored.length, 1, '同一条变更只应有一条记录');
  assert.equal(stored[0].attempts, 2);
  assert.deepEqual(stored[0].payload, { title: '离线改名', projectId: 'p1' }, '第二次缺 payload 时不得清空');
  assert.equal(stored[0].firstRejectedAt, '2026-09-15T10:06:00.000Z');
  assert.equal(stored[0].reason, '第二次：仍然权限不足', '原因刷新为最新');
});

test('F10-I4 不同账户隔离：B 读不到 A 的草稿', async () => {
  await cleanup();
  const recordA = buildDeadLetter({
    userId: U_A, outbox: outboxRow('ml-4'), reason: '权限不足', now: '2026-09-15T10:06:00.000Z',
  });
  await idb.deadLetterMove(recordA, () => recordA);

  assert.equal((await idb.deadLettersForUser(U_B)).length, 0, 'B 不得读到 A 的记录');
  assert.equal(isVisibleTo(recordA, U_B), false);
  assert.equal(isVisibleTo(recordA, U_A), true);
  assert.equal(isVisibleTo(recordA, null), false, '未登录不得读取任何草稿');
  assert.equal(recordA.key, deadLetterKey(U_A, 'ml-4'));
});

test('F10-I5 退出登录不清空持久拒绝区（重新登录同一账户可恢复）', async () => {
  await cleanup();
  const record = buildDeadLetter({
    userId: U_A, outbox: outboxRow('ml-5'), reason: '权限不足', now: '2026-09-15T10:06:00.000Z',
  });
  await idb.deadLetterMove(record, () => record);

  await idb.clearAll(); // 退出登录路径

  const afterRelogin = await idb.deadLettersForUser(U_A);
  assert.equal(afterRelogin.length, 1, '重新登录后必须恢复');
  assert.deepEqual(afterRelogin[0].payload, { title: '离线改名', projectId: 'p1' });

  await idb.deadLettersClearForUser(U_A);
  assert.equal((await idb.deadLettersForUser(U_A)).length, 0, '用户明确清除后才消失');
});

test('A09-I6 同 key 出现不同内容：保留最早 payload，另存冲突内容（不得静默替换）', async () => {
  await cleanup();
  const first = buildDeadLetter({
    userId: U_A, outbox: outboxRow('a09-1'), reason: '第一次：权限不足', now: '2026-09-17T00:00:00.000Z',
  });
  await idb.deadLetterMove(first, () => first);

  const second = buildDeadLetter({
    userId: U_A,
    outbox: { ...outboxRow('a09-1'), data: { title: '第二次内容（新）', projectId: 'p1' } },
    reason: '第二次：仍然权限不足',
    now: '2026-09-17T01:00:00.000Z',
  });
  await idb.deadLetterMove(second, (existing) => mergeDeadLetter(
    existing as DeadLetterRecord | undefined,
    second,
  ));

  const stored = (await idb.deadLettersForUser(U_A))[0];
  assert.deepEqual(stored.payload, { title: '离线改名', projectId: 'p1' }, '必须保留最早提交的 payload');
  assert.deepEqual(
    stored.payloadConflict?.payload,
    { title: '第二次内容（新）', projectId: 'p1' },
    '不同内容必须显式记录，供用户查看/合并',
  );
  assert.equal(stored.attempts, 2);
  assert.equal(stored.firstRejectedAt, '2026-09-17T00:00:00.000Z', '首次拒绝时间必须保留');
  assert.equal(stored.lastRejectedAt, '2026-09-17T01:00:00.000Z');
  await idb.deadLettersClearForUser(U_A);
});

test('A06 clearAll 清理真实键名（cursor/acl/conflicts），且不清空持久拒绝区', async () => {
  await cleanup();
  // 模拟 engine 真实使用的键
  await idb.kvSet('rdpms.sync.cursor', '2026-09-16T00:00:00.000Z');
  await idb.kvSet('rdpms.sync.acl', { version: 'acl-1', projectIds: ['p1'] });
  await idb.kvSet('rdpms.sync.conflicts', [{ clientMutationId: 'x' }]);
  const rec = buildDeadLetter({
    userId: U_A, outbox: outboxRow('a06-1'), reason: '权限不足', now: '2026-09-17T00:00:00.000Z',
  });
  await idb.deadLetterMove(rec, () => rec);

  await idb.clearAll(); // 退出登录路径

  assert.equal(await idb.kvGet('rdpms.sync.cursor'), undefined, '游标必须清理');
  assert.equal(await idb.kvGet('rdpms.sync.acl'), undefined, 'ACL 必须清理');
  assert.equal(await idb.kvGet('rdpms.sync.conflicts'), undefined, '冲突记录必须清理（此前从未清理）');
  assert.equal((await idb.deadLettersForUser(U_A)).length, 1, '持久拒绝区按既定策略保留');
  await idb.deadLettersClearForUser(U_A);
});
