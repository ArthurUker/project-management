/**
 * RF04 复核：当前授权必须前置于 idempotency receipt replay
 *
 * 契约：
 *   · 撤权（capability 丢失 / 非作者）后，同 key 重放必须被拒绝——回执不是授权凭证；
 *   · 状态锁必须**不**包含在授权判定里，否则第一次成功后的合法 replay（status 已变化）会被误拒。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReportAuthority, assertReportWritable } from '../../dist/modules/access/writeGuards.js';

const AUTHOR = { userId: 'u1', displayName: '作者' };
const OTHER = { userId: 'u2', displayName: '他人' };
const WRITE = { capabilities: ['read', 'write'] };
const READONLY = { capabilities: ['read'] };
const report = (status = 'DRAFT') => ({
  id: 'r1', projectId: 'p1', authorId: 'u1', reportType: 'MONTHLY', periodKey: '2026-09', status,
});

test('RF04-A1 失去项目 write capability → 授权判定拒绝（同 key 重放不得命中回执）', () => {
  assert.throws(() => assertReportAuthority(report(), AUTHOR, READONLY, 'reports.update'),
    (e) => e.status === 403 || e.status === 404);
});

test('RF04-A2 非作者身份 → 授权判定拒绝', () => {
  assert.throws(() => assertReportAuthority(report(), OTHER, WRITE, 'reports.update'),
    (e) => e.status === 403);
});

test('RF04-A3 授权判定不含状态锁：已提交/已审阅仍应通过（合法 replay 前提）', () => {
  for (const st of ['SUBMITTED', 'REVIEWING', 'REVIEWED']) {
    assert.doesNotThrow(() => assertReportAuthority(report(st), AUTHOR, WRITE, 'reports.update'),
      `${st} 不应在授权层被拒`);
  }
});

test('RF04-A4 状态锁仍由 assertReportWritable 承担（不得弱化）', () => {
  assert.throws(() => assertReportWritable(report('SUBMITTED'), AUTHOR, WRITE, 'reports.update'),
    (e) => e.status === 409 && e.code === 'INVALID_STATE');
  assert.throws(() => assertReportWritable(report('REVIEWED'), AUTHOR, WRITE, 'reports.update'),
    (e) => e.status === 409);
  assert.doesNotThrow(() => assertReportWritable(report('DRAFT'), AUTHOR, WRITE, 'reports.update'));
  assert.doesNotThrow(() => assertReportWritable(report('NEEDS_REVISION'), AUTHOR, WRITE, 'reports.update'));
});
