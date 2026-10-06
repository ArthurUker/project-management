import crypto from 'node:crypto';
import { PROJECT_CAPABILITIES, P0_PERMISSIONS, P1_UNFROZEN } from '../../kernel/constants.js';
const projectCapabilities: Record<string, string[]> = PROJECT_CAPABILITIES;
import { HttpError } from '../../kernel/http.js';
import { projectVisibilityFilter } from '../../kernel/projectAccess.js';

/** Current grants and scope in the same DB snapshot as the returned projection. */
export async function readAclSnapshot(db: any, authenticated: any, injectedActor: boolean) {
  let auth = authenticated;
  if (!injectedActor) {
    const user = await db.user.findUnique({ where: { id: authenticated.userId }, select: {
      id: true, systemRole: true, status: true, deletedAt: true, securityVersion: true, mustChangePassword: true,
    } });
    if (!user || user.deletedAt || user.status !== 'ACTIVE' || user.mustChangePassword
      || user.securityVersion !== authenticated.user.securityVersion) throw new HttpError(401, 'SESSION_REVOKED', '当前账号会话已变化');
    const bindings = user.systemRole === 'SUPER_ADMIN' ? [] : await db.userRole.findMany({ where: { userId: user.id },
      select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } });
    const permissions = user.systemRole === 'SUPER_ADMIN' ? [...P0_PERMISSIONS, ...P1_UNFROZEN]
      : [...new Set<string>(bindings.flatMap((b: any) => b.role.permissions.map((p: any) => p.permission.code)))];
    auth = { ...authenticated, user, systemRole: user.systemRole, permissions };
  }
  const visible = await db.project.findMany({ where: { ...(projectVisibilityFilter(auth) ?? {}), deletedAt: null },
    select: { id: true, managerId: true, members: { where: { userId: auth.userId, leftAt: null }, select: { role: true, joinedAt: true } } } });
  const projects = visible.filter((p: any) => auth.systemRole === 'SUPER_ADMIN' || p.managerId === auth.userId
    || p.members.some((m: any) => (projectCapabilities[m.role] ?? []).includes('read'))).map((p: any) => {
      const member = p.members[0];
      // Manager visibility without active membership never implies write authority.
      const capabilities = auth.systemRole === 'SUPER_ADMIN' ? ['read', 'write', 'delete', 'transition', 'assign', 'manage_members']
        : member ? projectCapabilities[member.role] ?? [] : ['read'];
      return { id: p.id, managerId: p.managerId, role: member?.role ?? null, joinedAt: member?.joinedAt ?? null, capabilities };
    }).sort((a: any, b: any) => a.id.localeCompare(b.id));
  const permissions = [...auth.permissions].sort();
  const aclVersion = crypto.createHash('sha256').update(JSON.stringify({ projectionVersion: 1, actorId: auth.userId,
    systemRole: auth.systemRole, securityVersion: auth.user?.securityVersion ?? null, permissions, projects })).digest('hex');
  return { auth, acl: { projectIds: projects.map((p: any) => p.id), projects, permissions: auth.permissions, aclVersion, projectionVersion: 1, writePolicy: {} as Record<string, unknown> } };
}
