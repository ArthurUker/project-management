import type { EnumValue, ID, Timestamps } from './common';

export interface ReportRef {
  id: ID;
  name: string;
  code: string;
}

/** 通用日报中「按项目」的汇报条目 */
export interface ProjectReportItem {
  projectId: ID;
  plan: string;
  completed: string;
  nextPlan: string;
  docRefs: unknown[];
}

/** 汇报内容对象（后端 content 为 JSONB 对象） */
export interface ReportContent {
  projectReports?: ProjectReportItem[];
  reagentReports?: unknown[];
  [key: string]: unknown;
}

/**
 * 后端原始响应形状（仅边界适配器使用）。
 * 含历史字段：month / userId，content 可能是 JSON 字符串（旧数据或旧客户端写入）。
 */
export interface RawReport {
  id: ID;
  projectId: ID;
  authorId?: ID;
  userId?: ID;
  reportType?: string;
  periodKey?: string;
  month?: string;
  content?: unknown;
  status: EnumValue;
  [key: string]: unknown;
}

/**
 * 汇报领域模型（RF03 起组件只使用本形状）。
 * periodKey：DAILY=YYYY-MM-DD、WEEKLY=YYYY-Www、MONTHLY=YYYY-MM。
 */
export interface Report extends Timestamps {
  id: ID;
  projectId: ID;
  authorId: ID;
  reportType: string;
  periodKey: string;
  content: ReportContent;
  /** 内容不可解析时的原因；存在该字段时禁止把空内容回写服务端 */
  contentReadError?: string;
  status: EnumValue;
  currentVersion?: number;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reviewerId?: ID | null;
  deletedAt?: string | null;
  author?: { id: ID; displayName: string; position?: string | null };
  project?: ReportRef;
  [key: string]: unknown;
}

export interface ReportVersion extends Timestamps {
  id: ID;
  reportId: ID;
  version: number;
  content: ReportContent;
  createdById?: ID;
}

export interface CreateReportDto {
  projectId: ID;
  reportType: string;
  periodKey: string;
  content: ReportContent;
  /** 幂等键（RF02）：重试不重复写入 */
  clientMutationId?: string;
}

export type UpdateReportDto = {
  content?: ReportContent;
  reportType?: string;
  periodKey?: string;
  clientMutationId?: string;
};
