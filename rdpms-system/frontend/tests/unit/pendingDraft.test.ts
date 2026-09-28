/**
 * A05 用例 —— 缺项目记录的「显式列出 + 本地留存 + 可恢复」
 *
 * 背景（独立复核 A05）：试剂组日报混合「有关联项目 / 无关联项目」时，
 * 旧实现把无项目的记录 `continue` 跳过，有项目的保存成功后清 key 离开页面，
 * 被跳过内容既没有失败项也没有持久留存 —— 用户以为全部成功，正文已丢。
 */
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idb } from '../../src/offline/idb';
import {
  clearPendingDraft,
  loadPendingDraft,
  mergePendingRecords,
  partitionByProject,
  savePendingDraft,
} from '../../src/offline/pendingDraft';

test('A05-P1 混合输入分组：可提交与缺项目必须分开（缺项目不得被静默丢弃）', () => {
  const records = [
    { id: 'r1', projectId: 'p1', mainContent: '有关联项目' },
    { id: 'r2', projectId: '', mainContent: '缺项目' },
    { id: 'r3', mainContent: '完全没有项目字段' },
  ];
  const { bound, unbound } = partitionByProject(records);
  assert.deepEqual(bound.map((r) => r.id), ['r1']);
  assert.deepEqual(unbound.map((r) => r.id), ['r2', 'r3'], '缺项目的记录必须全部进入未提交组');
});

test('A05-P2 缺项目记录本地留存：刷新后可恢复，其它账号读不到，保存成功后清除', async () => {
  await clearPendingDraft('user-a');
  await savePendingDraft('user-a', '2026-09-28', [
    { id: 'r2', projectId: '', mainContent: '无项目的正文' },
  ]);

  // 模拟页面刷新：只从存储读取
  const restored = await loadPendingDraft('user-a');
  assert.equal(restored?.records.length, 1);
  assert.equal(restored?.records[0].mainContent, '无项目的正文', '正文必须原样保留');
  assert.equal(restored?.periodKey, '2026-09-28');

  assert.equal(await loadPendingDraft('user-b'), null, '其它账号不得读到 A 的未提交内容');

  // 关联项目并保存成功 → 覆盖式写入空数组即清除
  await savePendingDraft('user-a', '2026-09-28', []);
  assert.equal(await loadPendingDraft('user-a'), null, '已无缺项目记录时必须清除本地留存');
});

test('A05-P3 恢复时按记录身份去重（不产生重复条目）', () => {
  const current = [{ id: 'r1', projectId: 'p1', mainContent: 'A' }];
  const merged = mergePendingRecords(current, [
    { id: 'r1', projectId: '', mainContent: 'A（旧副本）' },
    { id: 'r2', mainContent: '待补关联' },
  ]);
  assert.deepEqual(merged.map((r) => r.id), ['r1', 'r2']);
  assert.equal(merged.length, 2);
});

test('A05-P4 留存键按主体分片（不与其它本地键冲突）', async () => {
  await savePendingDraft('user-a', '2026-09-28', [{ id: 'r9', projectId: '' }]);
  const raw = await idb.kvGet<unknown>('rdpms.pendingDraft:user-a');
  assert.ok(raw, '留存必须落在按主体命名的键上');
  assert.equal(await idb.kvGet('rdpms.pendingDraft:user-b'), undefined);
  await clearPendingDraft('user-a');
  assert.equal(await idb.kvGet('rdpms.pendingDraft:user-a'), undefined);
});
