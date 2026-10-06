/**
 * modules/reports/reportCommands.ts —— 汇报写命令的公共实现（RF03/RF04，TS 迁移）
 *
 * 普通 API 与同步上行必须走同一套「补丁构造 + 校验」，避免两条入口对
 * 周期键/内容形状/状态锁定的判定漂移（F07）。
 *
 * 迁移说明（v2 ADR-02）：由 reportCommands.js 迁入，行为不变；strict 模式，无 any / ts-ignore。
 */
import { badRequest, HttpError } from '../../kernel/http.js';
import { REPORT_EDITABLE_STATUSES } from '../access/writeGuards.js';
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
 * 调用方必须已完成鉴权与资源授权（assertReportAuthority）。
 *
 * 写入边界与「真实可编辑状态」原子绑定（RP10-T02 / B10 返工）：
 * 早期状态校验只能基于请求进入时读到的快照，无法阻止「校验通过 → 提交先完成 → 迟到保存覆盖
 * SUBMITTED 正文」。因此这里把状态条件与并发基线放进**同一个原子 UPDATE 谓词**：
 * `UPDATE ... WHERE id = ? AND status IN (<可编辑>) [AND <并发基线>]`。
 * 迟到保存会阻塞在提交事务持有的行锁上；锁释放后 PostgreSQL 按已提交的新行版本重新求值谓词，
 * 得到 0 行更新 → 拒绝，不覆盖真实正文、不产生版本/审计/成功回执。
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
  const result = await db.report.updateMany({
    where: {
      id: reportId,
      status: { in: [...REPORT_EDITABLE_STATUSES] },
      ...(cas ?? {}),
    },
    data,
  });
  if (result.count === 0) {
    // 区分「不存在 / 已锁定 / 并发基线过期」，保留原有 404 与 409 CONFLICT 语义，
    // 并让「提交先完成」返回明确的 INVALID_STATE（不静默降级为通用冲突）。
    const current = await db.report.findUnique({ where: { id: reportId } });
    if (!current) throw new HttpError(404, 'REPORT_NOT_FOUND', '汇报不存在');
    const status = typeof current.status === 'string' ? current.status : '';
    if (!REPORT_EDITABLE_STATUSES.includes(status)) {
      throw new HttpError(409, 'INVALID_STATE', '汇报已提交或已审阅，内容已锁定');
    }
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
    report: { id: string; content: unknown; status: string; currentVersion: number;
      reportType?: string | null; periodKey?: string | null };
    snapshot?: unknown;
  },
): Promise<SubmitReportResult> {
  if (!db.reportVersion) {
    throw new Error('[reportCommands] submitReport 需要提供 reportVersion 客户端');
  }
  // D-S01-07: caller provides the row read under its transaction's report lock.
  // This guard also prevents a different command caller from allowing new-key
  // resubmission of SUBMITTED/REVIEWING/REVIEWED rows.
  if (!REPORT_EDITABLE_STATUSES.includes(report.status)) {
    throw new HttpError(409, 'INVALID_STATE', '仅草稿或需修改的汇报可以提交');
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
  const updated = await db.report.updateMany({
    where: { id: report.id, status: report.status, currentVersion: report.currentVersion, deletedAt: null },
    data: { status: 'SUBMITTED', currentVersion: version, submittedAt, updatedById: actor.userId },
  });
  if (updated.count !== 1) {
    throw new HttpError(409, 'CONFLICT', '汇报状态或版本已变化，请刷新后重试');
  }
  return { version, submittedAt };
}
