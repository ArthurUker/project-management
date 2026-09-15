/**
 * RF02 复核第二轮用例 —— 幂等键的操作生命周期
 *
 * 关键区别：
 *   重试（同一操作同一 payload）→ 同 key；
 *   改内容 / 用户再次主动发起（即使内容相同）→ 新 key。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOperationKeyStore, operationFingerprint } from '../../src/shared/idempotency';

function seqGenerator() {
  let n = 0;
  return () => `key-${++n}`;
}

test('RF02-FE1 网络重试（同一操作、同一内容）复用同一 key', () => {
  const store = createOperationKeyStore(seqGenerator());
  const fp = operationFingerprint({ op: 'report.save', projectId: 'p1', content: { n: 1 } });

  const first = store.keyFor(fp, 'p1');
  const retry = store.keyFor(fp, 'p1');

  assert.equal(first, retry, '重试必须复用 key，否则服务端会重复执行');
});

test('RF02-FE2 用户修改内容后是新的操作 → 新 key', () => {
  const store = createOperationKeyStore(seqGenerator());
  const before = operationFingerprint({ op: 'report.save', projectId: 'p1', content: { n: 1 } });
  const after = operationFingerprint({ op: 'report.save', projectId: 'p1', content: { n: 2 } });

  const k1 = store.keyFor(before, 'p1');
  const k2 = store.keyFor(after, 'p1');

  assert.notEqual(k1, k2);
});

test('RF02-FE3 操作成功后再次发起（内容完全相同）必须是新 key', () => {
  const store = createOperationKeyStore(seqGenerator());
  const fp = operationFingerprint({ op: 'report.save', projectId: 'p1', content: { n: 1 } });

  const first = store.keyFor(fp, 'p1');
  store.complete(); // 操作成功结束
  const second = store.keyFor(fp, 'p1');

  assert.notEqual(first, second, '内容相同不等于同一次业务操作');
});

test('RF02-FE4 多项目保存：不同 slot 的 key 相互独立', () => {
  const store = createOperationKeyStore(seqGenerator());
  const fp = operationFingerprint({ op: 'report.save', reportType: 'DAILY', periodKey: '2026-09-15' });

  const p1 = store.keyFor(fp, 'p1');
  const p2 = store.keyFor(fp, 'p2');

  assert.notEqual(p1, p2);
  assert.equal(store.keyFor(fp, 'p1'), p1, '同一 slot 重试仍复用');
});

test('RF02-FE5 操作指纹对字段顺序不敏感（同一内容只应有一个指纹）', () => {
  const a = operationFingerprint({ op: 'report.save', projectId: 'p1', content: { n: 1 } });
  const b = operationFingerprint({ content: { n: 1 }, projectId: 'p1', op: 'report.save' });
  assert.equal(a, b);

  const store = createOperationKeyStore(seqGenerator());
  assert.equal(store.keyFor(a, 'p1'), store.keyFor(b, 'p1'));
});

test('RF02-FE6 提交操作与保存操作互不串用 key', () => {
  const store = createOperationKeyStore(seqGenerator());
  const saveFp = operationFingerprint({ op: 'report.save', projectId: 'p1' });
  const submitFp = operationFingerprint({ op: 'report.submit', reportId: 'r1' });

  assert.notEqual(store.keyFor(saveFp, 'p1'), store.keyFor(submitFp, 'r1'));
});
