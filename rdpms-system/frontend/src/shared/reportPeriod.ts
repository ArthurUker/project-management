/**
 * shared/reportPeriod.ts —— 汇报周期键的边界适配器（RF03）
 *
 * 规则（与后端 modules/reports/reportRules.js 保持一致）：
 *   DAILY   → YYYY-MM-DD（完整日期；**不得**退化成月份，否则同月不同日会互相覆盖）
 *   WEEKLY  → YYYY-Www（ISO 8601 周）
 *   MONTHLY → YYYY-MM
 *
 * 缺少必要输入时返回 null，由调用方提示用户，不做任何猜测。
 */

export type ReportTypeEnum = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'PHASE' | 'AD_HOC';

/** 中文标签（仅用于界面显示）→ 后端枚举值（用于所有请求载荷） */
export const REPORT_TYPE_CN_TO_ENUM: Record<string, ReportTypeEnum> = {
  日报: 'DAILY',
  周报: 'WEEKLY',
  月报: 'MONTHLY',
};

const REPORT_TYPE_ENUM_SET = new Set<string>(['DAILY', 'WEEKLY', 'MONTHLY', 'PHASE', 'AD_HOC']);

/** 归一化汇报类型：接受枚举值或中文标签，未知返回 null */
export function reportTypeEnum(value?: string | null): ReportTypeEnum | null {
  if (!value) return null;
  if (REPORT_TYPE_ENUM_SET.has(value)) return value as ReportTypeEnum;
  return REPORT_TYPE_CN_TO_ENUM[value] ?? null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ONLY = /^\d{4}-\d{2}$/;

/** 解析 YYYY-MM-DD（按 UTC 处理，避免时区把日期挪一天） */
function parseDateOnly(value?: string | null): Date | null {
  if (!value || !DATE_ONLY.test(value)) return null;
  const [y, m, d] = value.split('-').map((v) => Number.parseInt(v, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  // 回读校验：2026-02-30 之类会被 Date 归一化成 3 月，必须拒绝
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** ISO 8601 周键：YYYY-Www */
export function isoWeekKey(dateStr?: string | null): string | null {
  const date = parseDateOnly(dateStr);
  if (!date) return null;
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // 周一=1 … 周日=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // 移到本周周四，周四决定 ISO 年与周序
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 月份键：优先使用已选月份，其次从完整日期推导 */
export function monthKeyFrom(input: { date?: string | null; month?: string | null }): string | null {
  if (input.month && MONTH_ONLY.test(input.month)) {
    const month = Number.parseInt(input.month.slice(5, 7), 10);
    return month >= 1 && month <= 12 ? input.month : null;
  }
  const date = parseDateOnly(input.date);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 计算提交给后端的周期键。
 * @returns 合法键；输入不足时返回 null（调用方应提示，而不是猜造）
 */
export function periodKeyFor(
  type: string | null | undefined,
  input: { date?: string | null; month?: string | null },
): string | null {
  const reportType = reportTypeEnum(type);
  if (!reportType) return null;
  switch (reportType) {
    case 'DAILY':
      return parseDateOnly(input.date) ? (input.date as string) : null;
    case 'WEEKLY':
      return isoWeekKey(input.date);
    case 'MONTHLY':
      return monthKeyFrom(input);
    default:
      return null;
  }
}
