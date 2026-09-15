/**
 * RF03 前端用例 —— 汇报周期键（F03 回归）
 *
 * 缺陷背景：编辑页把 period 一律 slice(0,7)，DAILY 也提交月份键，
 * 导致同人同项目不同日期落到同一个唯一键上（09-14 与 09-15 都变成 2026-09）。
 *
 * 期望：DAILY 用完整日期、WEEKLY 用 ISO 周、MONTHLY 用月份；缺少必要输入返回 null。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodKeyFor,
  isoWeekKey,
  REPORT_TYPE_CN_TO_ENUM,
  reportTypeEnum,
} from '../../src/shared/reportPeriod';

test('RF03-F1 DAILY 使用完整日期键（不是月份键）', () => {
  assert.equal(periodKeyFor('DAILY', { date: '2026-09-15', month: '2026-09' }), '2026-09-15');
});

test('RF03-F2 同月两天必须得到不同的键（F03 直接回归）', () => {
  const d14 = periodKeyFor('DAILY', { date: '2026-09-14', month: '2026-09' });
  const d15 = periodKeyFor('DAILY', { date: '2026-09-15', month: '2026-09' });
  assert.notEqual(d14, d15);
  assert.equal(d14, '2026-09-14');
  assert.equal(d15, '2026-09-15');
});

test('RF03-F3 WEEKLY 使用 ISO 周键', () => {
  assert.equal(periodKeyFor('WEEKLY', { date: '2026-09-15' }), '2026-W38');
});

test('RF03-F4 MONTHLY 使用 YYYY-MM', () => {
  assert.equal(periodKeyFor('MONTHLY', { date: '2026-09-15', month: '2026-09' }), '2026-09');
});

test('RF03-F5 缺少必要输入返回 null（不得猜造日期）', () => {
  assert.equal(periodKeyFor('DAILY', {}), null);
  assert.equal(periodKeyFor('DAILY', { month: '2026-09' }), null);
  assert.equal(periodKeyFor('MONTHLY', {}), null);
  assert.equal(periodKeyFor('WEEKLY', {}), null);
});

test('RF03-F6 ISO 周跨年边界正确', () => {
  // 2026-01-01 是周四 → 属于 2026-W01，该周从 2025-12-29（周一）开始
  assert.equal(isoWeekKey('2026-01-01'), '2026-W01');
  assert.equal(isoWeekKey('2025-12-29'), '2026-W01');
  assert.equal(isoWeekKey('2026-01-04'), '2026-W01'); // 周日仍属同一 ISO 周
  assert.equal(isoWeekKey('2026-01-05'), '2026-W02');
});

test('RF03-F7 中文类型标签 → 后端枚举（值发枚举，中文只做 label）', () => {
  assert.deepEqual(REPORT_TYPE_CN_TO_ENUM, { 日报: 'DAILY', 周报: 'WEEKLY', 月报: 'MONTHLY' });
  assert.equal(reportTypeEnum('日报'), 'DAILY');
  assert.equal(reportTypeEnum('DAILY'), 'DAILY', '已是枚举值时原样返回');
  assert.equal(reportTypeEnum('未知类型'), null);
});
