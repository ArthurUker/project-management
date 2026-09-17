/**
 * modules/access/writeGuards.ts —— 写入口的动作级授权守卫（RF04，TS 迁移）
 *
 * 背景（F06/F07/F13）：同一业务动作在不同入口要求的权限不一致——
 *   - 普通路由的专用状态接口要求 tasks.change_status + 项目 transition 能力，
 *     但通用 PUT 只要 tasks.update + write，就能顺手把 status/assigneeId 写掉；
 *   - 同步上行只校验项目 write 能力，完全不看实体动作权限；
 *   - 汇报的更新/撤回/删除只校验作者或全局权限，不校验项目成员资格。
 *
 * 本模块把「动作 → 系统权限 + 项目能力」的对应关系收敛到一处，
 * 普通 API、同步、离线队列全部调用同一套判定（05 §2）。
 *
 * 迁移说明（v2 ADR-02）：由 writeGuards.js 迁入，行为不变；strict 模式，无 any / ts-ignore。
 */
import { HttpError, forbidden, badRequest } from '../../kernel/http.js';
import { hasPermission } from '../../kernel/rbac.js';
import { assertProjectCapability } from '../../kernel/projectAccess.js';

export { assertProjectCapability };

/** 认证主体（与 kernel/rbac.js 装载的形状一致） */
export interface AuthActor {
  userId: string;
  permissions?: string[];
  systemRole?: string;
  user?: { id?: string; displayName?: string | null } | null;
}

/** 项目访问上下文（resolveProjectAccess / loadSyncAccess 的产物） */
export interface ProjectAccess {
  capabilities: string[];
  memberRole?: string | null;
  elevated?: boolean;
}

/** 可写汇报的最小形状 */
export interface ReportLike {
  id: string;
  authorId: string;
  status: string;
}

/** 系统权限断言（缺失 → 403） */
export function assertActionPermission(auth: AuthActor, code: string, message?: string): void {
  if (!hasPermission(auth, code)) {
    throw forbidden('PERMISSION_DENIED', message ?? `缺少权限 ${code}`);
  }
}

/** 任务编辑（标题/描述/工期等字段）：tasks.update + 项目 write */
export function assertTaskEdit(auth: AuthActor, access: ProjectAccess): void {
  assertActionPermission(auth, 'tasks.update');
  assertProjectCapability(access, 'write', 'tasks.update');
}

/** 任务状态流转：tasks.change_status + 项目 transition（F13 的核心） */
export function assertTaskStatusChange(auth: AuthActor, access: ProjectAccess): void {
  assertActionPermission(auth, 'tasks.change_status');
  assertProjectCapability(access, 'transition', 'tasks.change_status');
}

/** 任务指派：tasks.assign + 项目 assign */
export function assertTaskAssign(auth: AuthActor, access: ProjectAccess): void {
  assertActionPermission(auth, 'tasks.assign');
  assertProjectCapability(access, 'assign', 'tasks.assign');
}

/** 阶段状态流转：project_phases.change_status + 项目 transition */
export function assertPhaseStatusChange(auth: AuthActor, access: ProjectAccess): void {
  assertActionPermission(auth, 'project_phases.change_status');
  assertProjectCapability(access, 'transition', 'project_phases.change_status');
}

/** 跨项目引用校验所需的最小数据库接口 */
export interface PhaseLookupDb {
  projectPhase: {
    findUnique(args: { where: { id: string }; select: { id: true; projectId: true; deletedAt: true } }): Promise<
      { id: string; projectId: string; deletedAt: Date | null } | null
    >;
  };
}

/**
 * 跨项目引用校验（验收：跨项目 phaseId 被拒绝）。
 * 必须归属同一个项目，且未被软删。
 */
export async function assertPhaseBelongsToProject(
  db: PhaseLookupDb,
  phaseId: string,
  projectId: string,
): Promise<{ id: string; projectId: string; deletedAt: Date | null }> {
  const phase = await db.projectPhase.findUnique({
    where: { id: phaseId },
    select: { id: true, projectId: true, deletedAt: true },
  });
  if (!phase || phase.deletedAt || phase.projectId !== projectId) {
    throw badRequest('INVALID_REFERENCE', 'phaseId 不属于该项目', { field: 'phaseId', projectId });
  }
  return phase;
}

/** 汇报允许编辑的状态（其余一律锁定） */
export const REPORT_EDITABLE_STATUSES: readonly string[] = Object.freeze(['DRAFT', 'NEEDS_REVISION']);

export function isReportLocked(report: Pick<ReportLike, 'status'> | null | undefined): boolean {
  return !REPORT_EDITABLE_STATUSES.includes(report?.status ?? '');
}

/**
 * 汇报可写判定：项目 write 能力 + 作者本人 + 状态未锁定。
 * 普通 API（PUT/DELETE/recall）与同步上行共用。
 */
/**
 * 汇报的**当前资源授权**判定：项目 write capability + 作者归属。
 *
 * 与 assertReportWritable 的区别（RF04 复核）：**不含状态锁**。
 * 理由：幂等回执不是永久授权凭证——当前授权必须在 receipt lookup 之前重新校验；
 * 而状态锁（SUBMITTED/REVIEWED）会因第一次成功而自然变化，同 key 的合法 replay 必须能绕过它，
 * 因此状态锁只能留在 validate()（仅新命令路径执行）。
 */
export function assertReportAuthority(
  report: ReportLike | null | undefined,
  actor: AuthActor,
  access: ProjectAccess,
  permissionCode = 'reports.update',
): void {
  assertProjectCapability(access, 'write', permissionCode);
  if (!report || report.authorId !== actor.userId) {
    throw forbidden('FORBIDDEN', '无权修改他人的汇报');
  }
}

/** 汇报可写判定（授权 + 状态锁）：仅用于新命令路径（validate），不得前移到 receipt lookup 之前 */
export function assertReportWritable(
  report: ReportLike | null | undefined,
  actor: AuthActor,
  access: ProjectAccess,
  permissionCode = 'reports.update',
): void {
  assertReportAuthority(report, actor, access, permissionCode);
  if (isReportLocked(report)) {
    throw new HttpError(409, 'INVALID_STATE', '汇报已提交或已审阅，内容已锁定');
  }
}
