/** RP01 approved superior-only account commands, caller-tx current context. */
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { HttpError } from '../../kernel/http.js';
import { P0_PERMISSIONS, P1_UNFROZEN } from '../../kernel/constants.js';

export const ACCOUNT_RANK: Readonly<Record<string, number>> = Object.freeze({
  SUPER_ADMIN: 100, ADMIN: 80, MANAGER: 60, MEMBER: 40, AUDITOR: 40, VIEWER: 20,
});
export function assertGrantedRoles(actor: User, roleCodes: string[]) {
  if (!roleCodes.length || roleCodes.some(code => !(code in ACCOUNT_RANK)
    || ACCOUNT_RANK[code] >= ACCOUNT_RANK[actor.systemRole])) {
    throw new HttpError(403, 'ACCOUNT_TARGET_PROTECTED', '不能授予同级或更高等级角色');
  }
}
export async function withAccountCommand<T>(db: PrismaClient, actorId: string, targetId: string,
  permission: string, command: (tx: Prisma.TransactionClient, actor: User, target: User) => Promise<T>, expectedSecurityVersion?: number): Promise<T> {
  try {
    return await db.$transaction(async tx => {
      // Shared lock order also fences role assignment, disable and resets.
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${actorId}, ${targetId}) ORDER BY id FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!actor || actor.deletedAt || actor.status !== 'ACTIVE') throw new HttpError(401, 'SESSION_INVALID', '账号已失效');
      if (expectedSecurityVersion !== undefined && actor.securityVersion !== expectedSecurityVersion) throw new HttpError(401, 'SESSION_REVOKED', '会话已撤销');
      if (actor.mustChangePassword) throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改密码');
      if (!target || target.deletedAt) throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在');
      const bindings = actor.systemRole === 'SUPER_ADMIN' ? [] : await tx.userRole.findMany({ where: { userId: actorId },
        select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } });
      const permissions = actor.systemRole === 'SUPER_ADMIN' ? [...P0_PERMISSIONS, ...P1_UNFROZEN]
        : bindings.flatMap(b => b.role.permissions.map(p => p.permission.code));
      if (!permissions.includes(permission)) throw new HttpError(403, 'PERMISSION_DENIED', '当前账号缺少操作权限');
      if (actorId === targetId || !(actor.systemRole in ACCOUNT_RANK) || !(target.systemRole in ACCOUNT_RANK)
        || ACCOUNT_RANK[actor.systemRole] <= ACCOUNT_RANK[target.systemRole]) {
        throw new HttpError(403, 'ACCOUNT_TARGET_PROTECTED', '不能管理自己、同级或更高等级账号');
      }
      return command(tx, actor, target);
    }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 });
  } catch (error) {
    const e = error as { code?: string; status?: number };
    if (e.code === 'P2034') throw new HttpError(409, 'ACCOUNT_CONCURRENT_CHANGE', '账号并发变更，请重新确认后重试');
    if (e.status === 403) console.warn(JSON.stringify({ event: 'account-command-denied', actorId, targetId, permission, code: e.code }));
    throw error;
  }
}
