/**
 * A03 存储层用例 —— 本地缓存键按主体分片（真实 IndexedDB API，fake-indexeddb 仅作语义实现）
 *
 * 覆盖：不同账号的游标 / ACL / 冲突记录互不覆盖；登出只清理当前主体的分片键，
 * 不动其他账号数据（A03 要求「按主体隔离本地数据、统一缓存键」）。
 */
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idb } from '../../src/offline/idb';

const K = (base: string, uid: string) => `${base}:${uid}`;

test('A03-I1 不同账号的游标/ACL/冲突键互不覆盖', async () => {
  await idb.kvSet(K('rdpms.sync.cursor', 'user-a'), 'cursor-a');
  await idb.kvSet(K('rdpms.sync.cursor', 'user-b'), 'cursor-b');
  await idb.kvSet(K('rdpms.sync.conflicts', 'user-a'), [{ clientMutationId: 'a1' }]);

  assert.equal(await idb.kvGet(K('rdpms.sync.cursor', 'user-a')), 'cursor-a');
  assert.equal(await idb.kvGet(K('rdpms.sync.cursor', 'user-b')), 'cursor-b');
  assert.equal(await idb.kvGet(K('rdpms.sync.conflicts', 'user-b')), undefined, 'B 不得读到 A 的冲突记录');
});

test('A03-I2 登出只清理当前主体分片键，不得清理其他账号数据', async () => {
  await idb.kvSet(K('rdpms.sync.cursor', 'user-a'), 'cursor-a');
  await idb.kvSet(K('rdpms.sync.acl', 'user-a'), { aclVersion: 'acl-a' });
  await idb.kvSet(K('rdpms.sync.cursor', 'user-b'), 'cursor-b');
  await idb.kvSet(K('rdpms.sync.acl', 'user-b'), { aclVersion: 'acl-b' });

  // 写入侧自检：确认分片键真的落库（区分「写入没落库」与「被 clearAll 误删」）
  assert.equal(await idb.kvGet(K('rdpms.sync.cursor', 'user-a')), 'cursor-a', '写入自检 A 游标');
  assert.deepEqual(await idb.kvGet(K('rdpms.sync.acl', 'user-b')), { aclVersion: 'acl-b' }, '写入自检 B ACL');

  await idb.clearAll('user-a'); // 退出登录路径（传入被登出主体）

  assert.equal(await idb.kvGet(K('rdpms.sync.cursor', 'user-a')), undefined, 'A 游标应清理');
  assert.equal(await idb.kvGet(K('rdpms.sync.acl', 'user-a')), undefined, 'A ACL 应清理');
  assert.equal(await idb.kvGet(K('rdpms.sync.cursor', 'user-b')), 'cursor-b', '不得清理 B 游标');
  assert.deepEqual(await idb.kvGet(K('rdpms.sync.acl', 'user-b')), { aclVersion: 'acl-b' }, '不得清理 B ACL');

  await idb.clearAll('user-b');
});
