/** Shared project status command guards for HTTP and offline-sync entry points. */
import { badRequest } from '../../kernel/http.js';
import {
  assertActionPermission,
  assertProjectCapability,
  type AuthActor,
  type ProjectAccess,
} from '../access/writeGuards.js';

export const PROJECT_STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  PLANNING: ['IN_PROGRESS', 'ARCHIVED', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_PROCESSING', 'PENDING_VERIFICATION', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'],
  PENDING_PROCESSING: ['IN_PROGRESS', 'PENDING_VERIFICATION', 'ARCHIVED'],
  PENDING_VERIFICATION: ['IN_PROGRESS', 'COMPLETED', 'ARCHIVED'],
  ON_HOLD: ['IN_PROGRESS', 'ARCHIVED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: ['PLANNING'],
  CANCELLED: [],
});

const PROJECT_STATUS_VALUES = new Set(Object.keys(PROJECT_STATUS_TRANSITIONS));
const LEGACY_PROJECT_STATUS: Readonly<Record<string, string>> = Object.freeze({
  '草稿': 'PLANNING',
  '规划中': 'PLANNING',
  '进行中': 'IN_PROGRESS',
  '待加工': 'PENDING_PROCESSING',
  '待验证': 'PENDING_VERIFICATION',
  '暂停': 'ON_HOLD',
  '已完成': 'COMPLETED',
  '已归档': 'ARCHIVED',
  '已取消': 'CANCELLED',
});

export function normalizeProjectStatus(value: unknown): string {
  if (typeof value !== 'string') return '';
  return LEGACY_PROJECT_STATUS[value] ?? value;
}

/**
 * Apply one authorization/state-machine rule set across HTTP and sync.
 * Project status requires projects.update plus project transition capability;
 * entering ARCHIVED additionally requires the distinct projects.archive action.
 */
export function assertProjectStatusTransition({
  actor,
  access,
  currentStatus,
  nextStatus,
}: {
  actor: AuthActor;
  access: ProjectAccess;
  currentStatus: string;
  nextStatus: unknown;
}): string {
  const normalized = normalizeProjectStatus(nextStatus);
  if (!PROJECT_STATUS_VALUES.has(normalized)) {
    throw badRequest('INVALID_STATUS', '项目状态无效', { currentStatus, nextStatus });
  }
  assertActionPermission(actor, 'projects.update');
  if (normalized === currentStatus) return normalized;
  assertProjectCapability(access, 'transition', 'projects.update');
  if (normalized === 'ARCHIVED') assertActionPermission(actor, 'projects.archive');

  const allowed = PROJECT_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(normalized)) {
    throw badRequest('INVALID_STATUS_TRANSITION', `状态不可从 ${currentStatus} 变更为 ${normalized}`, {
      current: currentStatus,
      allowedTransitions: [...allowed],
    });
  }
  return normalized;
}

import type { Prisma } from '@prisma/client';
import { HttpError } from '../../kernel/http.js';
import { P0_PERMISSIONS, P1_UNFROZEN } from '../../kernel/constants.js';
import { getActorResolver } from '../../platform/identity/actorResolver.js';
import { resolveProjectAccess } from '../../kernel/projectAccess.js';
import { writeAuditStrict } from '../../platform/audit/strictAudit.js';

export function managerTransferId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 180) throw badRequest('INVALID_MANAGER', '负责人必须是有效账号ID');
  return value;
}
/** One caller transaction; no automatic enrollment or owner-role demotion. */
export async function transferProjectManager(tx: Prisma.TransactionClient, args: {
  actor: AuthActor; projectId: string; managerId: unknown; expectedUpdatedAt: unknown;
  entryPermission: 'projects.update' | 'registrations.update'; fields?: Record<string, unknown>; c?: unknown;
}) {
  const targetId = managerTransferId(args.managerId);
  if (typeof args.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(args.expectedUpdatedAt))) {
    throw new HttpError(409, 'MANAGER_BASELINE_REQUIRED', '负责人转移需要当前项目时间基线');
  }
  await tx.$queryRaw`SELECT id FROM users WHERE id IN (${args.actor.userId}, ${targetId}) ORDER BY id FOR UPDATE`;
  const currentUser = await tx.user.findUnique({ where: { id: args.actor.userId } });
  const target = await tx.user.findUnique({ where: { id: targetId } });
  if (!currentUser || currentUser.deletedAt || currentUser.status !== 'ACTIVE') throw new HttpError(401, 'SESSION_INVALID', '账号已失效');
  const injected = Boolean(getActorResolver());
  const expectedVersion = (args.actor.user as { securityVersion?: number } | null)?.securityVersion;
  if (!injected && expectedVersion !== undefined && currentUser.securityVersion !== expectedVersion) throw new HttpError(401, 'SESSION_REVOKED', '会话已撤销');
  if (currentUser.mustChangePassword) throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改密码');
  const bindings = currentUser.systemRole === 'SUPER_ADMIN' || injected ? [] : await tx.userRole.findMany({ where: { userId: currentUser.id },
    select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } });
  const actor = injected ? args.actor : { ...args.actor, user: currentUser, systemRole: currentUser.systemRole,
    permissions: currentUser.systemRole === 'SUPER_ADMIN' ? [...P0_PERMISSIONS, ...P1_UNFROZEN] : bindings.flatMap(b => b.role.permissions.map(p => p.permission.code)) };
  assertActionPermission(actor, args.entryPermission); assertActionPermission(actor, 'projects.manage_members');
  if (!target || target.deletedAt || target.status !== 'ACTIVE') throw badRequest('MANAGER_NOT_ACTIVE', '负责人必须为当前有效账号');
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${args.projectId} FOR UPDATE`;
  const access = await resolveProjectAccess(tx, actor, args.projectId); assertProjectCapability(access, 'manage_members', 'projects.manage_members');
  const project = await tx.project.findUniqueOrThrow({ where: { id: args.projectId } });
  if (project.updatedAt.getTime() !== Date.parse(args.expectedUpdatedAt)) throw new HttpError(409, 'MANAGER_CONCURRENT_CHANGE', '项目已变化，请重新核对负责人');
  const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: targetId } } });
  if (!member || member.leftAt) throw badRequest('MANAGER_NOT_MEMBER', '负责人必须为本项目当前有效成员');
  if (project.managerId === targetId) return project;
  const fields = args.fields ?? {};
  if (fields.status !== undefined) fields.status = assertProjectStatusTransition({ actor, access, currentStatus: project.status, nextStatus: fields.status });
  const previousId = project.managerId;
  await tx.projectMember.update({ where: { id: member.id }, data: { role: member.role === 'OWNER' ? 'OWNER' : 'MANAGER' } });
  if (previousId) await tx.projectMember.updateMany({ where: { projectId: project.id, userId: previousId, leftAt: null, role: 'MANAGER' }, data: { role: 'MEMBER' } });
  const changed = await tx.project.update({ where: { id: project.id }, data: { ...fields, managerId: targetId, updatedById: actor.userId } as Prisma.ProjectUncheckedUpdateInput });
  await writeAuditStrict(tx, { c: args.c, actorId: actor.userId, actorName: actor.user?.displayName ?? null,
    actorRole: actor.systemRole, action: 'update', entityType: 'PROJECT', entityId: project.id, entityLabel: project.name,
    changedFields: ['managerId', 'memberRoles'], metadata: { command: 'TRANSFER_MANAGER_V1', entryPermission: args.entryPermission,
      previousManagerId: previousId, managerId: targetId, targetRole: member.role === 'OWNER' ? 'OWNER' : 'MANAGER', elevated: Boolean(access.elevated) } });
  return changed;
}
