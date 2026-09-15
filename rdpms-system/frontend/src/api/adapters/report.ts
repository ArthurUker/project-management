/**
 * api/adapters/report.ts —— 汇报接口的边界适配器（RF03 / F04）
 *
 * 职责：把后端原始响应（含历史字段 month/userId、content 可能是 JSON 字符串）
 * 归一化成领域模型 Report，使页面不再自行 JSON.parse、也不再读旧字段。
 *
 * 约定：解析失败**不丢信息**——保留 `contentReadError`，页面据此提示用户并禁止回写空内容。
 */
import { readReportContent } from '../../shared/reportContent';
import type { RawReport, Report, ReportContent } from '../../types/report';

export function toReport(raw: RawReport): Report {
  const parsed = readReportContent(raw.content);
  const normalized: Report = {
    ...(raw as unknown as Report),
    authorId: (raw.authorId ?? raw.userId ?? '') as string,
    periodKey: (raw.periodKey ?? raw.month ?? '') as string,
    reportType: (raw.reportType ?? '') as string,
    content: parsed.value as ReportContent,
  };
  if (parsed.error) normalized.contentReadError = parsed.error;
  return normalized;
}

export function toReportList(raws: RawReport[]): Report[] {
  return raws.map(toReport);
}
