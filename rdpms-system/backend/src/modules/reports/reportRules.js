/**
 * modules/reports/reportRules.js —— 汇报类型与周期键规则（RF03）
 *
 * 真源（05 §4）：DAILY = 项目+人员+完整日期；WEEKLY = 项目+人员+ISO 周；MONTHLY = 项目+人员+月份。
 * 服务器必须严格验证真实日期与键格式——否则 09-14 与 09-15 会落到同一个唯一键
 * （projectId+authorId+reportType+periodKey）上互相覆盖（F03）。
 *
 * 本模块是纯规则，不依赖 HTTP/Prisma/Hono，便于单元测试与前端对齐。
 * 前端对应实现见 frontend/src/shared/reportPeriod.ts（两侧必须同步修改）。
 */

export const REPORT_TYPE_VALUES = Object.freeze(['DAILY', 'WEEKLY', 'MONTHLY', 'PHASE', 'AD_HOC']);

/** 兼容旧客户端的中文汇报类型（历史页面以 日报/周报/月报 作为值传输） */
const REPORT_TYPE_ALIASES = Object.freeze({ 日报: 'DAILY', 周报: 'WEEKLY', 月报: 'MONTHLY' });

export const PERIOD_KEY_MAX_LENGTH = 16;

/** 各类型的周期键格式说明（用于错误提示） */
export const PERIOD_KEY_FORMAT = Object.freeze({
  DAILY: 'YYYY-MM-DD',
  WEEKLY: 'YYYY-Www（ISO 周）',
  MONTHLY: 'YYYY-MM',
});

/** 归一化汇报类型：接受枚举值或中文旧值；未知返回原值（由调用方决定默认值） */
export function normalizeReportType(value) {
  if (typeof value !== 'string') return value;
  return REPORT_TYPE_ALIASES[value] ?? value;
}

const DAILY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const WEEKLY_KEY = /^\d{4}-W(\d{2})$/;
const MONTHLY_KEY = /^\d{4}-(\d{2})$/;

/** 校验真实日期（拒绝 2026-02-30 这类被 Date 归一化的输入） */
function isRealDate(value) {
  const [y, m, d] = value.split('-').map((v) => Number.parseInt(v, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * 校验周期键是否符合汇报类型。
 * @returns {{ok: true, value: string} | {ok: false, message: string, details: object}}
 */
export function validatePeriodKey(reportType, periodKey) {
  const type = normalizeReportType(reportType);
  const format = PERIOD_KEY_FORMAT[type] ?? '自定义业务键（1-16 字符）';

  if (periodKey === undefined || periodKey === null || periodKey === '') {
    return {
      ok: false,
      message: `缺少周期键（periodKey），${type} 期望格式：${format}`,
      details: { reportType: type, expectedFormat: format, field: 'periodKey' },
    };
  }
  if (typeof periodKey !== 'string') {
    return {
      ok: false,
      message: '周期键必须是字符串',
      details: { reportType: type, expectedFormat: format, field: 'periodKey' },
    };
  }
  const value = periodKey.trim();
  if (value.length === 0 || value.length > PERIOD_KEY_MAX_LENGTH) {
    return {
      ok: false,
      message: `周期键长度必须在 1-${PERIOD_KEY_MAX_LENGTH} 之间`,
      details: { reportType: type, expectedFormat: format, field: 'periodKey' },
    };
  }

  const invalid = (hint) => ({
    ok: false,
    message: `${type} 的周期键格式非法（收到 "${value}"，期望 ${format}）${hint ? `：${hint}` : ''}`,
    details: { reportType: type, expectedFormat: format, received: value, field: 'periodKey' },
  });

  switch (type) {
    case 'DAILY':
      if (!DAILY_KEY.test(value)) return invalid('日报必须精确到某一天');
      if (!isRealDate(value)) return invalid('不是真实存在的日期');
      return { ok: true, value };
    case 'WEEKLY': {
      const m = value.match(WEEKLY_KEY);
      if (!m) return invalid('周报必须使用 ISO 周键');
      const week = Number.parseInt(m[1], 10);
      if (week < 1 || week > 53) return invalid('周序必须在 01-53 之间');
      return { ok: true, value };
    }
    case 'MONTHLY': {
      const m = value.match(MONTHLY_KEY);
      if (!m) return invalid('月报必须精确到月份');
      const month = Number.parseInt(m[1], 10);
      if (month < 1 || month > 12) return invalid('月份必须在 01-12 之间');
      return { ok: true, value };
    }
    default:
      // PHASE / AD_HOC 等自定义键：只做长度校验（业务语义由调用方决定）
      return { ok: true, value };
  }
}

/** 是否为 reports 周期唯一键冲突（Prisma P2002） */
export function isReportPeriodConflict(err) {
  if (err?.code !== 'P2002') return false;
  const target = err.meta?.target;
  const flat = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return flat.includes('period_key') || flat.includes('report_type') || flat.includes('reports_project_id_author_id');
}
