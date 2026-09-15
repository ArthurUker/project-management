/**
 * modules/reports/reportCommands.js —— 汇报写命令的公共实现（RF03/RF04）
 *
 * 普通 API 与同步上行必须走同一套「补丁构造 + 校验」，避免两条入口对
 * 周期键/内容形状/状态锁定的判定漂移（F07）。
 */
import { badRequest } from '../../kernel/http.js';
import { normalizeReportType, validatePeriodKey } from './reportRules.js';

/** 内容入参兼容：对象（当前前端）或 JSON 字符串（旧前端/离线队列） */
export function parseContentInput(content) {
  if (content === undefined) return {};
  if (typeof content !== 'string') return content;
  try {
    return JSON.parse(content || '{}');
  } catch {
    throw badRequest('VALIDATION_ERROR', 'content 不是合法 JSON', { field: 'content' });
  }
}

/**
 * 构造汇报草稿补丁：白名单字段 + 周期键按类型校验 + 内容归一化。
 * 输入来自普通 API 的请求体或同步实体的 pickFields 结果。
 *
 * @param {object} input          原始字段（可含 reportType/periodKey/month/content）
 * @param {object} options
 * @param {string} options.currentType 未显式改类型时使用的现有类型
 * @returns {{reportType?: string, periodKey?: string, content?: object}}
 */
export function buildReportDraftPatch(input, { currentType } = {}) {
  const patch = {};
  if (!input || typeof input !== 'object') return patch;

  if (input.reportType !== undefined) {
    patch.reportType = normalizeReportType(input.reportType);
  }
  const effectiveType = patch.reportType ?? currentType;

  const rawKey = input.periodKey !== undefined ? input.periodKey : input.month;
  if (rawKey !== undefined) {
    const check = validatePeriodKey(effectiveType, rawKey);
    if (!check.ok) throw badRequest('VALIDATION_ERROR', check.message, check.details);
    patch.periodKey = check.value;
  }

  if (input.content !== undefined) patch.content = parseContentInput(input.content);
  return patch;
}
