/**
 * RF03 前端用例 —— 汇报内容归一化（F04 回归）
 *
 * 缺陷背景：后端 content 已是 JSONB 对象，前端却按字符串 JSON.parse，
 * 解析对象直接抛错，编辑页 catch 后把项目汇报数组清空（回填丢项 / 评审页空白）。
 *
 * 期望：对象与字符串（旧数据/旧客户端）都能读；解析失败必须显式暴露错误，
 * 便于编辑页禁止把空默认表当成原文保存。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readReportContent, normalizeReportContent } from '../../src/shared/reportContent';

const SAMPLE = {
  projectReports: [{ projectId: 'p1', plan: 'A', completed: 'B', nextPlan: 'C', docRefs: [] }],
};

test('RF03-F8 后端返回的对象内容必须直接可用（不再 JSON.parse）', () => {
  const result = readReportContent(SAMPLE);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.projectReports, SAMPLE.projectReports);
});

test('RF03-F9 字符串内容仍然兼容（旧数据与旧客户端）', () => {
  const result = readReportContent(JSON.stringify(SAMPLE));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.projectReports, SAMPLE.projectReports);
});

test('RF03-F10 无法解析时必须暴露错误，而不是静默返回空表', () => {
  const result = readReportContent('{ 这不是 JSON');
  assert.equal(result.ok, false);
  assert.match(String(result.error), /解析/);
});

test('RF03-F11 null / undefined / 空串视为空内容（ok=true，空对象）', () => {
  for (const input of [null, undefined, '']) {
    const result = readReportContent(input);
    assert.equal(result.ok, true, `输入 ${String(input)} 应视为空内容`);
    assert.deepEqual(result.value, {});
  }
});

test('RF03-F12 非对象 JSON（数组/数字）按非法内容处理', () => {
  assert.equal(readReportContent('[1,2,3]').ok, false);
  assert.equal(readReportContent('42').ok, false);
});

test('RF03-F13b 编辑回填无丢项：多项目与嵌套字段完整往返', () => {
  const rich = {
    projectReports: [
      { projectId: 'p1', plan: '计划1', completed: '完成1', nextPlan: '下步1', docRefs: [{ id: 'd1', code: 'DOC-1' }] },
      { projectId: 'p2', plan: '计划2', completed: '完成2', nextPlan: '下步2', docRefs: [] },
    ],
  };
  // 对象形状（当前后端）
  const fromObject = readReportContent(rich);
  assert.equal(fromObject.ok, true);
  assert.deepEqual(fromObject.value, rich);

  // 字符串形状（旧数据/旧客户端）必须得到同一结果
  const fromString = readReportContent(JSON.stringify(rich));
  assert.equal(fromString.ok, true);
  assert.deepEqual(fromString.value, rich);
});

test('RF03-F13 normalizeReportContent 提供不抛错的便捷入口', () => {
  assert.deepEqual(normalizeReportContent(SAMPLE).projectReports.length, 1);
  assert.deepEqual(normalizeReportContent('{坏'), {});
  assert.deepEqual(normalizeReportContent(null), {});
});
