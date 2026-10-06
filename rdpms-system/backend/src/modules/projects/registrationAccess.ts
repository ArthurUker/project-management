/** Registration is a project extension, with no ordinary global exception. */
import type { Prisma } from '@prisma/client';
import { P0_PERMISSIONS, P1_UNFROZEN, PROJECT_CAPABILITIES } from '../../kernel/constants.js';
import { HttpError } from '../../kernel/http.js';
import { getActorResolver } from '../../platform/identity/actorResolver.js';
import { assertActionPermission, type AuthActor } from '../access/writeGuards.js';

export async function registrationActor(db: Prisma.TransactionClient, authenticated: AuthActor): Promise<AuthActor> {
  if (getActorResolver()) return authenticated; // Explicit test injection, never native JWT acceptance.
  const user = await db.user.findUnique({ where: { id: authenticated.userId } });
  const version = (authenticated.user as { securityVersion?: number } | null)?.securityVersion;
  if (!user || user.deletedAt || user.status !== 'ACTIVE' || user.mustChangePassword || user.securityVersion !== version) {
    throw new HttpError(401, 'SESSION_REVOKED', '当前会话已变化');
  }
  const bindings = user.systemRole === 'SUPER_ADMIN' ? [] : await db.userRole.findMany({ where: { userId: user.id },
    select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } });
  return { userId: user.id, user, systemRole: user.systemRole, permissions: user.systemRole === 'SUPER_ADMIN'
    ? [...P0_PERMISSIONS, ...P1_UNFROZEN] : [...new Set(bindings.flatMap(b => b.role.permissions.map(p => p.permission.code)))] };
}
export function registrationScopeWhere(auth: AuthActor): Prisma.ProjectWhereInput {
  const capabilities: Record<string, string[]> = PROJECT_CAPABILITIES;
  const roles = Object.keys(capabilities).filter(role => capabilities[role].includes('read'));
  assertActionPermission(auth, 'registrations.view');
  return { subtype: 'registration', deletedAt: null, ...(auth.systemRole === 'SUPER_ADMIN' ? {} : {
    members: { some: { userId: auth.userId, leftAt: null, role: { in: roles as ('OWNER'|'MANAGER'|'MEMBER'|'VIEWER')[] } } },
  }) };
}
export function registrationLinks(auth: AuthActor) {
  const has = (code: string) => auth.permissions?.includes(code) ?? false;
  return { tasks: has('tasks.view'), members: has('projects.view'), milestones: has('milestones.view'),
    phases: has('project_phases.view'), regulatory: has('regulatory_documents.view') };
}
