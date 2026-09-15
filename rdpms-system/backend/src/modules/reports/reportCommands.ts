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

/** 汇报写入所需的最小数据库接口（Prisma 客户端或事务客户端） */
export interface ReportWriteDb {
  report: {
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include?: unknown;
    }): Promise<Record<string, unknown>>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    findUnique(args: { where: { id: string }; include?: unknown }): Promise<Record<string, unknown> | null>;
  };
  reportVersion?: {
    findFirst(args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }): Promise<{ version: number } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/**
 * 保存草稿（唯一写实现）：普通 API 与同步上行共用。
 * 调用方必须已完成鉴权、资源授权与状态判定（assertReportWritable / assertReportNotLocked）。
 */
export async function saveReportDraft(
  db: ReportWriteDb,
  { actor, reportId, patch, cas }: {
    actor: { userId: string };
    reportId: string;
    patch: ReportDraftPatch;
    /** 并发基线（如 { updatedAt: <客户端读到的值> }）：作为原子 UPDATE 的 WHERE 条件 */
    cas?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const data = { ...patch, updatedById: actor.userId };
  if (!cas) {
    return db.report.update({ where: { id: reportId }, data });
  }
  const result = await db.report.updateMany({ where: { id: reportId, ...cas }, data });
  if (result.count === 0) {
    throw new HttpError(409, 'CONFLICT', '数据已被他人修改，请基于最新版本重试');
  }
  const row = await db.report.findUnique({ where: { id: reportId } });
  if (!row) throw new HttpError(404, 'REPORT_NOT_FOUND', '汇报不存在');
  return row;
}

export interface SubmitReportResult {
  version: number;
  submittedAt: Date;
}

/**
 * 提交（唯一写实现）：写版本快照 + 状态。调用方负责鉴权、作者校验与幂等回执。
 * 事务由调用方提供（HTTP 用 withIdempotency 的事务，同步不需要提交命令）。
 */
export async function submitReport(
  db: ReportWriteDb,
  { actor, report, snapshot }: {
    actor: { userId: string };
    report: { id: string; content: unknown; reportType?: string | null; periodKey?: string | null };
    snapshot?: unknown;
  },
): Promise<SubmitReportResult> {
  if (!db.reportVersion) {
    throw new Error('[reportCommands] submitReport 需要提供 reportVersion 客户端');
  }
  const lastVersion = await db.reportVersion.findFirst({
    where: { reportId: report.id },
    orderBy: { version: 'desc' },
  });
  const version = (lastVersion?.version ?? 0) + 1;
  const submittedAt = new Date();

  await db.reportVersion.create({
    data: {
      reportId: report.id,
      version,
      content: snapshot ?? report.content,
      createdById: actor.userId,
    },
  });
  await db.report.update({
    where: { id: report.id },
    data: { status: 'SUBMITTED', submittedAt, updatedById: actor.userId },
  });
  return { version, submittedAt };
}
