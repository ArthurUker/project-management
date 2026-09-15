/**
 * modules/reports/reportCommands.ts —— 汇报写命令的公共实现（RF03/RF04，TS 迁移）
 *
 * 普通 API 与同步上行必须走同一套「补丁构造 + 校验」，避免两条入口对
 * 周期键/内容形状/状态锁定的判定漂移（F07）。
 *
 * 迁移说明（v2 ADR-02）：由 reportCommands.js 迁入，行为不变；strict 模式，无 any / ts-ignore。
 */
import { badRequest, HttpError } from '../../kernel/http.js';
import { normalizeReportType, validatePeriodKey } from './reportRules.js';

/** 汇报内容（JSONB 对象） */
export interface ReportContent {
  projectReports?: unknown[];
  reagentReports?: unknown[];
  [key: string]: unknown;
}

export interface ReportDraftPatch {
  reportType?: string;
  periodKey?: string;
  content?: ReportContent;
}

export type ReportContentInput = ReportContent | string | null | undefined;

/** 内容入参兼容：对象（当前前端）或 JSON 字符串（旧前端/离线队列） */
export function parseContentInput(content: ReportContentInput): ReportContent {
  if (content === undefined || content === null) return {};
  if (typeof content !== 'string') return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content || '{}');
  } catch {
    throw badRequest('VALIDATION_ERROR', 'content 不是合法 JSON', { field: 'content' });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw badRequest('VALIDATION_ERROR', 'content 必须是 JSON 对象', { field: 'content' });
  }
  return parsed as ReportContent;
}

export interface BuildPatchInput {
  reportType?: unknown;
  periodKey?: unknown;
  month?: unknown;
  content?: ReportContentInput;
}

/**
 * 构造汇报草稿补丁：白名单字段 + 周期键按类型校验 + 内容归一化。
 * 输入来自普通 API 的请求体或同步实体的 pickFields 结果。
 */
export function buildReportDraftPatch(
  input: BuildPatchInput | null | undefined,
  { currentType }: { currentType?: string | null } = {},
): ReportDraftPatch {
  const patch: ReportDraftPatch = {};
  if (!input || typeof input !== 'object') return patch;

  if (input.reportType !== undefined) {
    patch.reportType = normalizeReportType(input.reportType);
  }
  const effectiveType = patch.reportType ?? currentType;

  const rawKey = input.periodKey !== undefined ? input.periodKey : input.month;
  if (rawKey !== undefined) {
    const check = validatePeriodKey(effectiveType, rawKey as string | number | null | undefined);
    if (!check.ok) throw badRequest('VALIDATION_ERROR', check.message, check.details);
    patch.periodKey = check.value;
  }

  if (input.content !== undefined) patch.content = parseContentInput(input.content);
  return patch;
}

/** 导出 HttpError 供调用方做类型收窄（避免各处重复 import） */
export { HttpError };
