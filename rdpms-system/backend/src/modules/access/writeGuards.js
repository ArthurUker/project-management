/**
 * modules/access/writeGuards.js —— 写入口的动作级授权守卫（RF04）
 *
 * 背景（F06/F07/F13）：同一业务动作在不同入口要求的权限不一致——
 *   - 普通路由的专用状态接口要求 tasks.change_status + 项目 transition 能力，
 *     但通用 PUT 只要 tasks.update + write，就能顺手把 status/assigneeId 写掉；
 *   - 同步上行只校验项目 write 能力，完全不看实体动作权限；
 *   - 汇报的更新/撤回/删除只校验作者或全局权限，不校验项目成员资格。
 *
 * 本模块把「动作 → 系统权限 + 项目能力」的对应关系收敛到一处，
 * 普通 API、同步、离线队列全部调用同一套判定（05 §2）。
 */
import { HttpError, forbidden, badRequest } from '../../kernel/http.js';
import { hasPermission } from '../../kernel/rbac.js';
import { assertProjectCapability } from '../../kernel/projectAccess.js';

export { assertProjectCapability };

/** 系统权限断言（缺失 → 403） */
export function assertActionPermission(auth, code, message) {
  if (!hasPermission(auth, code)) {
    throw forbidden('PERMISSION_DENIED', message ?? `缺少权限 ${code}`);
  }
}

/** 任务编辑（标题/描述/工期等字段）：tasks.update + 项目 write */
export function assertTaskEdit(auth, access) {
  assertActionPermission(auth, 'tasks.update');
  assertProjectCapability(access, 'write', 'tasks.update');
}

/** 任务状态流转：tasks.change_status + 项目 transition（F13 的核心） */
export function assertTaskStatusChange(auth, access) {
  assertActionPermission(auth, 'tasks.change_status');
  assertProjectCapability(access, 'transition', 'tasks.change_status');
}

/** 任务指派：tasks.assign + 项目 assign */
export function assertTaskAssign(auth, access) {
  assertActionPermission(auth, 'tasks.assign');
  assertProjectCapability(access, 'assign', 'tasks.assign');
}

/** 阶段状态流转：project_phases.change_status + 项目 transition */
export function assertPhaseStatusChange(auth, access) {
  assertActionPermission(auth, 'project_phases.change_status');
  assertProjectCapability(access, 'transition', 'project_phases.change_status');
}

/**
 * 跨项目引用校验（验收：跨项目 phaseId 被拒绝）。
 * 必须归属同一个项目，且未被软删。
 */
export async function assertPhaseBelongsToProject(db, phaseId, projectId) {
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
export const REPORT_EDITABLE_STATUSES = Object.freeze(['DRAFT', 'NEEDS_REVISION']);

export function isReportLocked(report) {
  return !REPORT_EDITABLE_STATUSES.includes(report?.status);
}

/**
 * 汇报可写判定：项目 write 能力 + 作者本人 + 状态未锁定。
 * 普通 API（PUT/DELETE/recall）与同步上行共用。
 */
export function assertReportWritable(report, actor, access, permissionCode = 'reports.update') {
  assertProjectCapability(access, 'write', permissionCode);
  if (report.authorId !== actor.userId) {
    throw forbidden('FORBIDDEN', '无权修改他人的汇报');
  }
  if (isReportLocked(report)) {
    throw new HttpError(409, 'INVALID_STATE', '汇报已提交或已审阅，内容已锁定');
  }
}
