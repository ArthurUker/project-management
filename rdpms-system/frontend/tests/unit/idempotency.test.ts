/**
 * 幂等键「操作会话 + 子槽位」模型契约用例（生产形态，不再使用共用人工 fingerprint 的简化模型）
 *
 * 覆盖审查确认的行为契约：
 *   1) 同一次用户操作的网络重试复用原 key；
 *   2) 多项目 A/B 的 key 能同时存活；
 *   3) A 成功、B 失败后再次执行，A 命中原回执（同 key）而不是重新写；
 *   4) update 与 submit 的 key 能同时保留；
 *   5) submit 服务端成功但响应丢失后，update 与 submit 均可按原操作身份重放；
 *   6) 全部成功后 complete，再次主动操作才生成新 key；
 *   7) 用户真正修改 payload 后产生新的业务操作身份。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOperationKeyStore, operationSession, slotSignature } from '../../src/shared/idempotency';

function seq() {
  let n = 0;
  return () => `key-${++n}`;
}

// 生产形态：会话由「页面操作」决定，槽位是具体子操作
const SAVE_SESSION = operationSession({ op: 'report.edit', reportType: 'DAILY', periodKey: '2026-09-20' });
const EDIT_SESSION = operationSession({ op: 'report.edit', reportId: 'r1' });

test('RF02-K1 同一槽位重试（同一载荷）复用原 key', () => {
  const store = createOperationKeyStore(seq());
  const sig = slotSignature({ text: 'A-内容' });
  const k1 = store.keyFor(SAVE_SESSION, 'save:p1', sig);
  const k2 = store.keyFor(SAVE_SESSION, 'save:p1', sig);
  assert.equal(k1, k2);
});

test('RF02-K2 多项目 A/B 的 key 同时存活（互不清空）', () => {
  const store = createOperationKeyStore(seq());
  const kA = store.keyFor(SAVE_SESSION, 'save:p1', slotSignature({ text: 'A' }));
  const kB = store.keyFor(SAVE_SESSION, 'save:p2', slotSignature({ text: 'B' }));
  assert.notEqual(kA, kB);
  // 分配 B 之后，A 必须仍然取回原 key（旧实现会因 fingerprint 变化清空 A）
  assert.equal(store.keyFor(SAVE_SESSION, 'save:p1', slotSignature({ text: 'A' })), kA);
  assert.equal(store.keyFor(SAVE_SESSION, 'save:p2', slotSignature({ text: 'B' })), kB);
});

test('RF02-K3 A 成功、B 失败后重试：A 命中回执（同 key），B 可继续', () => {
  const store = createOperationKeyStore(seq());
  const sigA = slotSignature({ text: 'A' });
  const sigB = slotSignature({ text: 'B' });
  const kA = store.keyFor(SAVE_SESSION, 'save:p1', sigA);
  const kB = store.keyFor(SAVE_SESSION, 'save:p2', sigB);

  // 模拟：A 成功（服务端已写入回执）、B 失败 → 用户只重试 B
  assert.equal(store.keyFor(SAVE_SESSION, 'save:p2', sigB), kB, 'B 复用原 key');
  assert.equal(store.keyFor(SAVE_SESSION, 'save:p1', sigA), kA, 'A 仍为原 key（服务端将回放，不重复写）');
});

test('RF02-K4 update 与 submit 的 key 同时保留', () => {
  const store = createOperationKeyStore(seq());
  const kUpdate = store.keyFor(EDIT_SESSION, 'update:r1', slotSignature({ n: 1 }));
  const kSubmit = store.keyFor(EDIT_SESSION, 'submit:r1', '');
  assert.notEqual(kUpdate, kSubmit);
  assert.equal(store.keyFor(EDIT_SESSION, 'update:r1', slotSignature({ n: 1 })), kUpdate);
  assert.equal(store.keyFor(EDIT_SESSION, 'submit:r1', ''), kSubmit);
});

test('RF02-K5 服务端 submit 成功但响应丢失：重试时 update 与 submit 都按原身份重放', () => {
  const store = createOperationKeyStore(seq());
  const sig = slotSignature({ n: 2 });
  const kUpdate = store.keyFor(EDIT_SESSION, 'update:r1', sig);
  const kSubmit = store.keyFor(EDIT_SESSION, 'submit:r1', '');

  // 响应丢失后用户再次点击「提交」：先 update（回放已成功回执，不再写）再 submit（回放首次提交结果）
  assert.equal(store.keyFor(EDIT_SESSION, 'update:r1', sig), kUpdate);
  assert.equal(store.keyFor(EDIT_SESSION, 'submit:r1', ''), kSubmit);

  // 且 submit 重放不依赖状态锁：键位从未因 update 的再次调用而轮换
  assert.deepEqual(Object.keys(store.snapshot()).sort(), ['submit:r1', 'update:r1']);
});

test('RF02-K6 全部成功后 complete：再次主动操作生成新 key', () => {
  const store = createOperationKeyStore(seq());
  const sig = slotSignature({ text: 'A' });
  const first = store.keyFor(SAVE_SESSION, 'save:p1', sig);
  store.complete();
  const second = store.keyFor(SAVE_SESSION, 'save:p1', sig);
  assert.notEqual(first, second, '内容相同 ≠ 同一次业务操作');
  assert.equal(store.snapshot()['save:p1'], second);
});

test('RF02-K7 用户真正修改 payload → 新的业务操作身份（整会话轮换）', () => {
  const store = createOperationKeyStore(seq());
  const sig1 = slotSignature({ text: '第一版' });
  const kUpdate1 = store.keyFor(EDIT_SESSION, 'update:r1', sig1);
  store.keyFor(EDIT_SESSION, 'submit:r1', '');

  const sig2 = slotSignature({ text: '第二版（用户改了内容）' });
  const kUpdate2 = store.keyFor(EDIT_SESSION, 'update:r1', sig2);
  assert.notEqual(kUpdate1, kUpdate2, '内容变化必须换新 key');
  // 同一次提交动作里 submit 也不得复用旧回执
  const kSubmitAfterEdit = store.keyFor(EDIT_SESSION, 'submit:r1', '');
  assert.equal(store.snapshot()['update:r1'], kUpdate2);
  assert.ok(kSubmitAfterEdit);
});

test('RF02-K8 切换到另一次操作（不同会话）时槽位不复用', () => {
  const store = createOperationKeyStore(seq());
  const sig = slotSignature({ text: 'A' });
  const k1 = store.keyFor(SAVE_SESSION, 'save:p1', sig);
  const k2 = store.keyFor(EDIT_SESSION, 'update:r1', sig);
  assert.notEqual(k1, k2);
  assert.equal(store.currentSession(), EDIT_SESSION);
});

// ── A04 复核：资源作用域内的轮换 + 成功子步骤保留 ----------------------------------

test('A04-K9 A 成功、B 失败后用户改了 B 的内容再重试：A 的 key 不被牵连轮换', () => {
  const store = createOperationKeyStore(seq());
  const sigA = slotSignature({ text: 'A' });
  const kA = store.keyFor(SAVE_SESSION, 'save:p1', sigA, 'project:p1');
  const kB1 = store.keyFor(SAVE_SESSION, 'save:p2', slotSignature({ text: 'B-第一版' }), 'project:p2');

  store.markSucceeded(SAVE_SESSION, 'save:p1', kA); // A 已保存成功
  const kB2 = store.keyFor(SAVE_SESSION, 'save:p2', slotSignature({ text: 'B-第二版' }), 'project:p2');

  assert.notEqual(kB1, kB2, '被改动的项目必须换新 key（新内容 = 新写入）');
  assert.equal(
    store.keyFor(SAVE_SESSION, 'save:p1', sigA, 'project:p1'),
    kA,
    '已成功的 A 必须保留原 key（服务端回执重放，不重复写入）',
  );
  assert.equal(store.hasSucceeded(SAVE_SESSION, 'save:p1'), true);
  assert.equal(store.hasSucceeded(SAVE_SESSION, 'save:p2'), false);
});

test('A04-K10 update/submit 共享资源作用域：内容不变都复用；内容变化一起轮换', () => {
  const store = createOperationKeyStore(seq());
  const sig1 = slotSignature({ content: 'v1', expectedUpdatedAt: null });
  const kUpd1 = store.keyFor(EDIT_SESSION, 'update:r1', sig1, 'report:r1');
  const kSub1 = store.keyFor(EDIT_SESSION, 'submit:r1', '', 'report:r1');

  // 保存 → 提交（响应丢失）→ 再次点击：两个子步骤都必须复用原 key（B06 的键位契约）
  assert.equal(store.keyFor(EDIT_SESSION, 'update:r1', sig1, 'report:r1'), kUpd1);
  assert.equal(store.keyFor(EDIT_SESSION, 'submit:r1', '', 'report:r1'), kSub1);

  // 用户真的改了内容 → 同一资源的两个命令一起换新（不得用旧提交回执掩盖新内容）
  const sig2 = slotSignature({ content: 'v2', expectedUpdatedAt: null });
  const kUpd2 = store.keyFor(EDIT_SESSION, 'update:r1', sig2, 'report:r1');
  assert.notEqual(kUpd2, kUpd1);
  assert.notEqual(store.keyFor(EDIT_SESSION, 'submit:r1', '', 'report:r1'), kSub1);
});

test('A04-K11 并发基线变化必须换新 key（否则服务端 payloadHash 校验会判为不一致）', () => {
  const store = createOperationKeyStore(seq());
  const withBaseline = (b: string) => slotSignature({ content: 'x', expectedUpdatedAt: b });
  const k1 = store.keyFor(EDIT_SESSION, 'update:r1', withBaseline('2026-09-01T00:00:00.000Z'), 'report:r1');
  const k2 = store.keyFor(EDIT_SESSION, 'update:r1', withBaseline('2026-09-02T00:00:00.000Z'), 'report:r1');
  assert.notEqual(k1, k2);
});
