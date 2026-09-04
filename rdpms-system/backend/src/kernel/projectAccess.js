/**
 * kernel/projectAccess.js —— 项目权限 ∩ 模型（M-1 §6.2 / §8.3）
 *
 * 规则：
 *   1. 最终权限 = 系统权限 ∩ 项目成员能力
 *   2. 非项目成员 -> 404（隐藏资源存在性）
 *   3. 成员但项目角色能力不足 -> 403
 *   4. ProjectMember.leftAt IS NULL 才算有效成员
 *   5. SUPER_ADMIN 可访问任意项目；访问非成员项目内资源时写 metadata.elevated=true
 */
import { PROJECT_CAPABILITIES, PERM_TO_CAPABILITY, AUDIT_ACTIONS } from './constants.js';
import { notFound, forbidden } from './http.js';
import { writeAudit } from './audit.js';

const ALL_CAPABILITIES = ['read', 'write', 'delete', 'transition', 'assign', 'manage_members'];

/**
 * 解析当前用户对项目的访问上下文。
 * 无系统权限 / 非成员 -> 404；SUPER_ADMIN 返回 elevated 标记（不抛错）。
 */
export async function resolveProjectAccess(prisma, auth, projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, name: true, deletedAt: true, managerId: true },
  });
  if (!project || project.deletedAt) {
    throw notFound('PROJECT_NOT_FOUND', '项目不存在');
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth.userId } },
    select: { role: true, leftAt: true },
  });
  const isMember = Boolean(membership && membership.leftAt === null);

  if (auth.systemRole === 'SUPER_ADMIN') {
    return {
      project,
      isMember,
      memberRole: isMember ? membership.role : null,
      capabilities: ALL_CAPABILITIES,
      elevated: !isMember,
    };
  }

  if (!isMember) {
    throw notFound('PROJECT_NOT_FOUND', '项目不存在');
  }
  return {
    project,
    isMember,
    memberRole: membership.role,
    capabilities: PROJECT_CAPABILITIES[membership.role] ?? [],
    elevated: false,
  };
}

/** 断言项目能力；perm 仅用于错误信息与审计，能力缺口 -> 403 */
export function assertProjectCapability(access, capability, perm) {
  const needed = capability ?? PERM_TO_CAPABILITY[perm] ?? 'read';
  if (!access.capabilities.includes(needed)) {
    throw forbidden(
      'PROJECT_CAPABILITY_DENIED',
      `当前项目角色（${access.memberRole ?? '—'}）不具备 ${needed} 能力`,
    );
  }
}

/**
 * SUPER_ADMIN 以非成员身份访问项目内资源时，写 elevated 审计（只对单项目资源触发）。
 * 列表类全量读取不写（M-1：SUPER_ADMIN 可列全量项目，不写 elevated 审计）。
 */
export async function auditElevatedIfNeeded(prisma, c, access, permissionCode) {
  if (!access.elevated) return;
  await writeAudit(prisma, {
    c,
    actorId: c.get('auth')?.user?.id ?? null,
    actorName: c.get('auth')?.user?.displayName ?? null,
    actorRole: 'SUPER_ADMIN',
    action: AUDIT_ACTIONS.READ_SENSITIVE,
    entityType: 'PROJECT',
    entityId: access.project.id,
    entityLabel: access.project.name,
    metadata: {
      elevated: true,
      bypass: 'project_membership',
      permissionCode,
    },
  });
}

/**
 * 非 SUPER_ADMIN 的项目列表必须按成员过滤；
 * 可见 = 有效成员（leftAt IS NULL）或本人为 managerId；
 * SUPER_ADMIN 返回 null 过滤条件（列全量）。
 */
export function projectVisibilityFilter(auth) {
  if (auth.systemRole === 'SUPER_ADMIN') return null;
  return {
    OR: [
      { managerId: auth.userId },
      { members: { some: { userId: auth.userId, leftAt: null } } },
    ],
  };
}
