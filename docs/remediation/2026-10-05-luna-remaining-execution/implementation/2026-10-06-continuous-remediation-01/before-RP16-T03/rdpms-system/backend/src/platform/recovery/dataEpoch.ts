import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { HttpError, forbidden, unauthorized } from '../../kernel/http.js';

type Tx = Prisma.TransactionClient;
type Actor = { userId: string; user: { securityVersion: number } };
export const canonicalRecoveryJson = (value: unknown): string => {
  const normalized: unknown = JSON.parse(JSON.stringify(value));
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)])) : v;
  return JSON.stringify(sort(normalized));
};
export const recoveryHash = (value: unknown): string => crypto.createHash('sha256').update(canonicalRecoveryJson(value)).digest('hex');
export async function restoreRunContext(tx: Tx, runId: string): Promise<void> {
  await tx.$queryRaw`SELECT set_config('rdpms.restore_run', ${runId}, true)`;
}
export async function requireRecoveryAdmin(tx: Tx, actor: Actor): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: actor.userId } });
  if (!user || user.deletedAt || user.status !== 'ACTIVE' || user.mustChangePassword
    || user.securityVersion !== actor.user.securityVersion) throw unauthorized('SESSION_INVALID', 'Current restore actor is invalid');
  if (user.systemRole !== 'SUPER_ADMIN') throw forbidden('PERMISSION_DENIED', 'Current SUPER_ADMIN required');
}
export async function assertRecoveryAvailable(db: PrismaClient, method: string, path: string): Promise<void> {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method) || path === '/api/backup/restore/reconcile') return;
  const state = await db.dataRecoveryState.findUniqueOrThrow({ where: { id: 1 } });
  if (state.status !== 'READY') throw new HttpError(503, state.status, 'Restore is not reconciled; writes are blocked', { runId: state.activeRunId });
}
export async function admitRestore(db: PrismaClient, actor: Actor, payloadHash: string): Promise<string> {
  const runId = crypto.randomUUID();
  await db.$transaction(async (tx) => {
    await requireRecoveryAdmin(tx, actor);
    await tx.$queryRaw`SELECT id FROM data_recovery_state WHERE id = 1 FOR UPDATE`;
    const state = await tx.dataRecoveryState.findUniqueOrThrow({ where: { id: 1 } });
    if (state.status !== 'READY') throw new HttpError(409, 'RESTORE_ALREADY_ACTIVE', 'Existing restore needs reconciliation', { runId: state.activeRunId });
    await tx.dataRecoveryState.update({ where: { id: 1 }, data: { status: 'RESTORING', activeRunId: runId, payloadHash, manifest: Prisma.DbNull, summary: Prisma.DbNull, failureCode: null } });
  }, { timeout: 15000, maxWait: 15000 });
  return runId;
}
