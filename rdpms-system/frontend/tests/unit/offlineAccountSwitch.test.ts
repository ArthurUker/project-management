/**
 * A03 用例 —— 「A 发请求 → 暂停 → 切换 B → 释放 A 的响应」的**确定性**时序测试
 *
 * 背景（独立复核 Q7）：同步请求发出后不绑定主体与会话代次，账号切换后到达的旧响应
 * 会把 A 的草稿写进 B 的命名空间（持久拒绝区里出现 user-B 的 A 内容）。
 *
 * 本文件用**可控传输替身**（不联网、不连库）精确复现该时序，断言修复后的契约：
 *   E1 旧拉取响应不得写入 B 的镜像 / 游标 / ACL / 冲突（B 只看到自己的数据）；
 *   E2 旧拒绝响应不得在 B 的拒绝区留下任何记录，且 A 的未同步内容不被静默销毁；
 *   E3 拒绝记录可按**原 key + 原 payload + 原基线**重试，成功后移出拒绝区。
 *
 * 边界：IndexedDB 使用 fake-indexeddb（存储层语义实现），不是真实浏览器证据；
 * 真实浏览器验证见 tests/browser。
 */
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idb } from '../../src/offline/idb';

// engine 在模块加载时会读取 navigator 判定在线状态 → 先注入浏览器替身，再动态导入
(globalThis as unknown as { window: unknown }).window = {
  addEventListener() {},
  removeEventListener() {},
  setInterval: () => 1,
  clearInterval() {},
  clearTimeout() {},
};
(globalThis as unknown as { navigator: unknown }).navigator = { onLine: true, userAgent: 'node-test', platform: 'node' };

const engine = await import('../../src/offline/engine');

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const UID_A = 'user-A';
const UID_B = 'user-B';

function initResponse(overrides: Record<string, unknown> = {}) {
  return {
    serverTime: '2026-09-28T00:00:00.000Z',
    cursor: 'cursor-default',
    full: false,
    acl: { projectIds: ['project-A'], permissions: ['reports.view'], aclVersion: 'acl-A' },
    entities: [],
    changes: { reports: { upserts: [{ id: 'A-report', content: 'A 的私有内容' }], tombstones: [] } },
    ...overrides,
  } as never;
}

async function waitSyncIdle(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!engine.getState().syncing) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('同步未在预期时间内结束');
}

async function resetAll() {
  await idb.recordsClear();
  await idb.outboxClear();
  for (const uid of [UID_A, UID_B]) {
    for (const row of await idb.deadLettersForUser(uid)) await idb.deadLetterDelete(row.key);
    await idb.kvDelete(`rdpms.sync.cursor:${uid}`);
    await idb.kvDelete(`rdpms.sync.acl:${uid}`);
    await idb.kvDelete(`rdpms.sync.conflicts:${uid}`);
  }
}

test('A03-E1 A 的拉取响应在切换账号后释放：B 的镜像/游标/ACL/冲突不含 A 的数据', async () => {
  await resetAll();
  const pullA = deferred<never>();
  let initCalls = 0;
  engine.__setSyncTransport({
    init: () => {
      initCalls += 1;
      if (initCalls === 1) return pullA.promise; // 第一次（A 的请求）挂起
      return Promise.resolve(initResponse({
        cursor: 'cursor-for-B',
        acl: { projectIds: ['project-B'], permissions: ['reports.view'], aclVersion: 'acl-B' },
        changes: { reports: { upserts: [{ id: 'B-report', content: 'B 自己的内容' }], tombstones: [] } },
      }));
    },
    push: async () => ({ serverTime: '2026-09-28T00:00:00.000Z', results: [], conflictCount: 0 }),
  });

  await engine.start(UID_A);       // A 发起拉取（在途）
  await engine.resetOnLogout();    // 退出 A → 在途请求作废
  await engine.start(UID_B);       // 登录 B
  pullA.resolve(initResponse() as never); // 释放 A 的旧响应
  await waitSyncIdle();

  assert.equal(await idb.kvGet('rdpms.sync.cursor:user-B'), 'cursor-for-B', 'B 的游标只能来自 B 的响应');
  const aclB = await idb.kvGet<{ aclVersion: string }>('rdpms.sync.acl:user-B');
  assert.equal(aclB?.aclVersion, 'acl-B', 'B 的 ACL 不得被 A 的响应覆盖');
  const records = await idb.recordsAll();
  assert.equal(records.filter((r) => r.id === 'A-report').length, 0, 'A 的镜像数据不得写入共享镜像');
  assert.equal(records.filter((r) => r.id === 'B-report').length, 1, 'B 自己的数据必须正常镜像');
  const conflictsB = await idb.kvGet<unknown[]>('rdpms.sync.conflicts:user-B');
  assert.ok(!conflictsB || conflictsB.length === 0, 'B 不得继承 A 的冲突记录');

  engine.stop();
  engine.__setSyncTransport();
});

test('A03-E2 A 的上行拒绝响应在切换账号后释放：B 拒绝区为空，A 的未同步内容不被销毁', async () => {
  await resetAll();
  const initGate = deferred<void>();
  const pushStarted = deferred<void>();
  const pushA = deferred<never>();
  let initCalls = 0;
  engine.__setSyncTransport({
    init: async () => {
      initCalls += 1;
      if (initCalls === 1) await initGate.promise; // A 的拉取先挂起，保证入队发生在上行读取之前
      return initResponse({ changes: {} });
    },
    push: () => { pushStarted.resolve(); return pushA.promise; },
  });

  await engine.start(UID_A);
  await engine.enqueueChange({
    clientMutationId: 'A-change',
    entity: 'reports',
    op: 'upsert',
    id: 'A-report',
    data: { content: 'A 的草稿正文' },
    baseUpdatedAt: '2026-09-27T00:00:00.000Z',
  });
  initGate.resolve();
  await pushStarted.promise;      // 上行已发出（在途，响应被挂起）

  await engine.resetOnLogout();   // 退出 A：未同步内容必须转入 A 自己的拒绝区
  await engine.start(UID_B);      // 登录 B
  pushA.resolve({
    serverTime: '2026-09-28T00:00:00.000Z',
    conflictCount: 1,
    results: [{
      clientMutationId: 'A-change', entity: 'reports', id: 'A-report', op: 'upsert',
      status: 'rejected', reason: '合成的拒绝原因',
    }],
  } as never);
  await waitSyncIdle();

  assert.equal((await idb.deadLettersForUser(UID_B)).length, 0, 'B 的拒绝区不得出现 A 的内容（原 Q7 缺陷）');
  const mine = await idb.deadLettersForUser(UID_A);
  assert.equal(mine.length, 1, 'A 的未同步内容必须被保留（不能静默销毁）');
  assert.equal(mine[0].payload?.content, 'A 的草稿正文', '正文必须原样保留');
  assert.equal(mine[0].clientMutationId, 'A-change', '操作身份必须保留（可重试）');
  assert.equal(mine[0].code, 'LOGOUT_UNSYNCED');
  assert.equal((await idb.outboxAll()).length, 0, '切换后的待发送队列不得残留 A 的变更');

  engine.stop();
  engine.__setSyncTransport();
});

test('A03-E4 登出与登录交叠：新主体不被登出尾段覆盖，上一账号的未同步内容按原主体留存', async () => {
  await resetAll();
  const pushed: Array<Record<string, unknown>> = [];
  engine.__setSyncTransport({
    init: async () => initResponse({ changes: {} }),
    push: async (payload) => {
      pushed.push(...(payload.changes as unknown as Array<Record<string, unknown>>));
      return {
        serverTime: '2026-09-28T00:00:00.000Z',
        conflictCount: payload.changes.length,
        // 全部拒绝：用于检验「被拒变更是否按发起时主体留存」而不是被丢弃
        results: payload.changes.map((c) => ({
          clientMutationId: c.clientMutationId, entity: c.entity, id: c.id, op: c.op, status: 'rejected' as const, reason: '合成拒绝',
        })),
      };
    },
  });

  // A 已登录，且队列里有一条属于 A 的未同步变更
  await engine.start(UID_A);
  await idb.outboxPut({
    clientMutationId: 'A-pending', entity: 'reports', op: 'upsert', id: 'A-report',
    data: { content: 'A 的未同步内容' }, createdAt: '2026-09-27T00:00:00.000Z', userId: UID_A,
  });

  // 「登出 → 立刻登录」：登出的异步清理尾段与 B 的登录交叠（React 实际发生的时序）
  const logoutPromise = engine.resetOnLogout();
  await engine.start(UID_B);
  await logoutPromise;

  // B 自己的变更被拒绝时必须落在 B 名下（证明 B 的主体没有被登出尾段清空）
  engine.__setSyncTransport({
    init: async () => initResponse({ changes: {} }),
    push: async (payload) => ({
      serverTime: '2026-09-28T00:00:00.000Z',
      conflictCount: payload.changes.length,
      results: payload.changes.map((c) => ({
        clientMutationId: c.clientMutationId, entity: c.entity, id: c.id, op: c.op, status: 'rejected' as const, reason: '合成拒绝',
      })),
    }),
  });
  await engine.enqueueChange({
    clientMutationId: 'B-change', entity: 'reports', op: 'upsert', id: 'B-report', data: { content: 'B 的内容' },
  });
  await waitSyncIdle();

  const bRows = await idb.deadLettersForUser(UID_B);
  assert.equal(bRows.length, 1, 'B 的拒绝内容必须归属 B（主体被清空时会退化成直接丢弃）');
  assert.equal(bRows[0].clientMutationId, 'B-change');
  assert.equal(
    pushed.some((c) => c.clientMutationId === 'A-pending'),
    false,
    'B 不得代发 A 的变更',
  );
  const aRows = await idb.deadLettersForUser(UID_A);
  assert.equal(aRows.length, 1, 'A 的未同步内容必须按其主体留存');
  assert.equal(aRows[0].clientMutationId, 'A-pending');
  assert.equal(aRows[0].payload?.content, 'A 的未同步内容');

  engine.stop();
  engine.__setSyncTransport();
});

test('A03-E3 拒绝记录可按原 key + 原 payload + 原基线重试，成功后移出拒绝区', async () => {
  await resetAll();
  const pushed: Array<Record<string, unknown>> = [];
  engine.__setSyncTransport({
    init: async () => initResponse({ changes: {} }),
    push: async (payload) => {
      pushed.push(...(payload.changes as unknown as Array<Record<string, unknown>>));
      return {
        serverTime: '2026-09-28T00:00:00.000Z',
        conflictCount: 0,
        results: payload.changes.map((c) => ({
          clientMutationId: c.clientMutationId, entity: c.entity, id: c.id, op: c.op, status: 'applied' as const,
        })),
      };
    },
  });

  // 先造一条 A 的拒绝记录（等价于 E2 结束时留在本地的状态）
  await engine.start(UID_A);
  await idb.outboxPut({
    clientMutationId: 'A-retry', entity: 'reports', op: 'upsert', id: 'A-report',
    data: { content: '待重试的正文' }, baseUpdatedAt: '2026-09-27T00:00:00.000Z',
    createdAt: '2026-09-27T00:00:00.000Z', userId: UID_A,
  });
  await engine.resetOnLogout();
  await engine.start(UID_A);
  assert.equal((await idb.deadLettersForUser(UID_A)).length, 1, '登出后未同步内容应出现在拒绝区');

  const ok = await engine.retryRejection('A-retry');
  assert.equal(ok, true);
  await waitSyncIdle();

  const retried = pushed.find((c) => c.clientMutationId === 'A-retry');
  assert.ok(retried, '重试必须按原 key 上行');
  assert.deepEqual(retried?.data, { content: '待重试的正文' }, '重试必须使用原 payload');
  assert.equal(retried?.baseUpdatedAt, '2026-09-27T00:00:00.000Z', '重试必须保留原并发基线');
  assert.equal((await idb.deadLettersForUser(UID_A)).length, 0, '成功后必须移出拒绝区');
  assert.equal((await idb.outboxAll()).length, 0);

  engine.stop();
  engine.__setSyncTransport();
});
