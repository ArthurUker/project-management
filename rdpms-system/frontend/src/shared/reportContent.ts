/**
 * shared/reportContent.ts —— 汇报内容的边界适配器（RF03 / F04）
 *
 * 背景：后端 content 是 JSONB（对象），但旧前端按字符串 JSON.parse：
 * 解析对象直接抛错 → 编辑页 catch 后清空项目汇报数组（回填丢项、评审页空白）。
 *
 * 约定：
 *   - 对象：直接使用（当前后端形状）；
 *   - 字符串：兼容旧数据/旧客户端（JSON 解析后必须是对象）；
 *   - 解析失败：返回 ok=false 并带原因，**调用方必须提示用户**，
 *     不得把空默认表当成原文保存（否则会静默覆盖服务端内容）。
 */

export interface ReportContent {
  projectReports?: unknown[];
  reagentReports?: unknown[];
  [key: string]: unknown;
}

/**
 * 读取结果：ok=false 时 value 为 {}，error 给出原因。
 * 刻意不用可辨识联合——本项目 tsconfig 未开启 strictNullChecks，
 * 联合收窄在该配置下不生效（构件会退化为不可读），统一用 ok + 可选 error 更稳。
 */
export interface ReadReportContentResult {
  ok: boolean;
  value: ReportContent;
  error?: string;
}

function isPlainObject(value: unknown): value is ReportContent {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读取汇报内容（对象 / JSON 字符串 / 空值），失败时显式返回错误原因 */
export function readReportContent(input: unknown): ReadReportContentResult {
  if (input === null || input === undefined || input === '') {
    return { ok: true, value: {} };
  }
  if (isPlainObject(input)) {
    return { ok: true, value: input };
  }
  if (typeof input === 'string') {
    try {
      const parsed: unknown = JSON.parse(input);
      if (isPlainObject(parsed)) return { ok: true, value: parsed };
      return { ok: false, value: {}, error: '汇报内容解析失败：不是 JSON 对象' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, value: {}, error: `汇报内容解析失败：${reason}` };
    }
  }
  return { ok: false, value: {}, error: `汇报内容解析失败：不支持的类型 ${typeof input}` };
}

/** 便捷入口：不可解析时返回空对象（只用于展示，不可用于回写） */
export function normalizeReportContent(input: unknown): ReportContent {
  const result = readReportContent(input);
  return result.ok ? result.value : {};
}
