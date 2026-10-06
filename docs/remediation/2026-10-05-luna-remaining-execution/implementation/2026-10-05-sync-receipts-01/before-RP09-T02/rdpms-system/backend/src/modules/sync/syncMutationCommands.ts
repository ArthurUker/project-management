/** Approved RP09 candidate: bound reservations, per-item atomic execution.
 * No legacy replay, implicit reservation, GC or unsafe old-write fallback.
 */
import crypto from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { P0_PERMISSIONS, P1_UNFROZEN, AUDIT_ACTIONS } from '../../kernel/constants.js';
import { badRequest, HttpError } from '../../kernel/http.js';
import { writeAuditStrict } from '../../platform/audit/strictAudit.js';
import type { AuthActor, ProjectAccess } from '../access/writeGuards.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface SyncCommand {
  clientMutationId: string; entity: string; id: string; op: 'upsert' | 'delete';
  projectId: string; data: Record<string, Json>; baseUpdatedAt?: string | null;
  receiptHandle?: string; payloadHash: string;
}
export interface SyncContext {
  existing: Record<string, unknown> | null; data: Record<string, unknown>;
  access: ProjectAccess; requiredPermissions: string[]; requiredCapabilities: string[];
}
type Outcome = Record<string, unknown>;
interface Adapters {
  authorize(tx: Prisma.TransactionClient, actor: AuthActor, command: SyncCommand): Promise<SyncContext>;
  execute(tx: Prisma.TransactionClient, actor: AuthActor, command: SyncCommand, context: SyncContext): Promise<Outcome>;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function scalar(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw badRequest('VALIDATION_ERROR', `${name} 必须是非空字符串（最多 ${max} 字符）`);
  }
  return value;
}
/** Build strings, not an ordinary object accumulator: __proto__ stays data. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  throw badRequest('VALIDATION_ERROR', '命令包含非法 JSON 值');
}

export function parseSyncCommand(raw: unknown, entities: Record<string, unknown>): SyncCommand {
  if (!object(raw)) throw badRequest('VALIDATION_ERROR', '变更必须是对象');
  const clientMutationId = scalar(raw.clientMutationId, 'clientMutationId', 64);
  const entity = scalar(raw.entity, 'entity', 64);
  if (!Object.hasOwn(entities, entity)) throw badRequest('VALIDATION_ERROR', '未知实体');
  const id = scalar(raw.id, 'id');
  if (raw.op !== 'upsert' && raw.op !== 'delete') throw badRequest('VALIDATION_ERROR', 'op 无效');
  const data = raw.data === undefined ? {} : raw.data;
  if (!object(data)) throw badRequest('VALIDATION_ERROR', 'data 必须是 JSON 对象');
  const projectId = scalar(raw.projectId ?? data.projectId ?? (entity === 'projects' ? id : undefined), 'projectId', 180);
  const payload: Record<string, unknown> = { entity, id, op: raw.op, projectId, data };
  if (Object.hasOwn(raw, 'baseUpdatedAt')) {
    if (raw.baseUpdatedAt !== null && (typeof raw.baseUpdatedAt !== 'string' || !Number.isFinite(Date.parse(raw.baseUpdatedAt)))) {
      throw badRequest('VALIDATION_ERROR', 'baseUpdatedAt 无效');
    }
    payload.baseUpdatedAt = raw.baseUpdatedAt;
  }
  const payloadHash = crypto.createHash('sha256').update(canonical(payload)).digest('hex');
  if (raw.payloadHash !== undefined && raw.payloadHash !== payloadHash) {
    throw new HttpError(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'payloadHash 与命令不符');
  }
  const command: SyncCommand = { clientMutationId, entity, id, op: raw.op, projectId, data: data as Record<string, Json>, payloadHash };
  if (Object.hasOwn(raw, 'baseUpdatedAt')) command.baseUpdatedAt = raw.baseUpdatedAt as string | null;
  if (raw.receiptHandle !== undefined) command.receiptHandle = scalar(raw.receiptHandle, 'receiptHandle');
  return command;
}

export function parseSyncEnvelope(body: unknown): { deviceId: string; changes: unknown[] } {
  if (!object(body)) throw badRequest('VALIDATION_ERROR', '请求必须是对象');
  if (body.protocolVersion !== 1) throw new HttpError(426, 'UPGRADE_REQUIRED', '需要预约回执协议 v1；原副本必须保留');
  const deviceId = scalar(body.deviceId, 'deviceId', 64);
  if (!Array.isArray(body.changes) || body.changes.length > 500) throw badRequest('VALIDATION_ERROR', 'changes 必须是最多500项的数组');
  return { deviceId, changes: body.changes };
}

async function currentActor(tx: Prisma.TransactionClient, userId: string): Promise<AuthActor> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, systemRole: true, status: true } });
  if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'SESSION_INVALID', '当前账号不可用');
  const bindings = user.systemRole === 'SUPER_ADMIN' ? [] : await tx.userRole.findMany({ where: { userId },
    select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } });
  const permissions = user.systemRole === 'SUPER_ADMIN' ? [...P0_PERMISSIONS, ...P1_UNFROZEN]
    : [...new Set(bindings.flatMap((b) => b.role.permissions.map((p) => p.permission.code)))];
  return { userId, user, systemRole: user.systemRole, permissions };
}

const unavailable = (command: SyncCommand): Outcome => ({ clientMutationId: command.clientMutationId,
  entity: command.entity, id: command.id, op: command.op, status: 'unknown', code: 'RECEIPT_UNAVAILABLE' });
const base = (command: SyncCommand): Outcome => ({ clientMutationId: command.clientMutationId, entity: command.entity, id: command.id, op: command.op });

/** Short bounded retry with the exact same command; serialization is not a new intent. */
async function serial<T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 15000 }); }
    catch (error) {
      const code = object(error) ? error.code : (error as { code?: string })?.code;
      if ((code === 'P2034' || code === 'P2002') && attempt < 2) continue;
      throw error;
    }
  }
}

export function createSyncMutationCommands(db: PrismaClient, adapters: Adapters) {
  async function context(tx: Prisma.TransactionClient, userId: string, deviceId: string, command: SyncCommand, createDevice: boolean) {
    const actor = await currentActor(tx, userId);
    const device = await tx.syncDevice.findUnique({ where: { id: deviceId } });
    if (device && device.userId !== userId) throw new HttpError(404, 'RECEIPT_UNAVAILABLE', '回执不可用');
    if (!device && !createDevice) throw new HttpError(404, 'RECEIPT_UNAVAILABLE', '回执不可用');
    // Current resource authorization precedes receipt lookup, even for an applied replay.
    const authorized = await adapters.authorize(tx, actor, command);
    if (!device) await tx.syncDevice.create({ data: { id: deviceId, userId } });
    return { actor, authorized };
  }

  async function receipt(tx: Prisma.TransactionClient, userId: string, deviceId: string, command: SyncCommand) {
    // Never lock somebody else's receipt. Scope/hash are checked after the owned row lock.
    await tx.$queryRaw`SELECT id FROM sync_mutations WHERE client_mutation_id = ${command.clientMutationId}
      AND user_id = ${userId} AND device_id = ${deviceId} FOR UPDATE`;
    const hit = await tx.syncMutation.findUnique({ where: { clientMutationId: command.clientMutationId } });
    if (!hit || hit.userId !== userId || hit.deviceId !== deviceId || hit.entity !== command.entity
      || hit.entityId !== command.id || hit.op !== command.op || hit.resourceScope !== `project:${command.projectId}`
      || hit.receiptVersion !== 1 || !hit.payloadHash || !hit.expiresAt) return null;
    if (hit.payloadHash !== command.payloadHash) throw new HttpError(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', '同key不能改变原载荷');
    if (command.receiptHandle && hit.id !== command.receiptHandle) return null;
    return hit;
  }

  function requireStoredAuthority(actor: AuthActor, authorized: SyncContext, stored: unknown) {
    if (!object(stored) || !Array.isArray(stored.requiredPermissions) || !Array.isArray(stored.requiredCapabilities)) {
      throw new HttpError(404, 'RECEIPT_UNAVAILABLE', '回执不可用');
    }
    for (const permission of stored.requiredPermissions) {
      if (typeof permission !== 'string' || !actor.permissions?.includes(permission)) throw new HttpError(403, 'PERMISSION_DENIED', '命令权限已撤销');
    }
    for (const capability of stored.requiredCapabilities) {
      if (typeof capability !== 'string' || !authorized.access.capabilities.includes(capability)) throw new HttpError(403, 'PROJECT_CAPABILITY_DENIED', '命令能力已撤销');
    }
  }

  async function reserve(userId: string, deviceId: string, command: SyncCommand): Promise<Outcome> {
    return serial(db, async (tx) => {
      const { actor, authorized } = await context(tx, userId, deviceId, command, true);
      const hit = await receipt(tx, userId, deviceId, command);
      const collision = hit ? null : await tx.syncMutation.findUnique({ where: { clientMutationId: command.clientMutationId } });
      if (collision || (!hit && command.receiptHandle)) return unavailable(command);
      if (hit) requireStoredAuthority(actor, authorized, hit.result);
      else requireStoredAuthority(actor, authorized, authorized);
      if (hit && hit.expiresAt! <= new Date()) return { ...base(command), status: 'expired' };
      const row = hit ?? await tx.syncMutation.create({ data: { clientMutationId: command.clientMutationId,
        userId, deviceId, entity: command.entity, entityId: command.id, op: command.op,
        status: 'pending', receiptVersion: 1, resourceScope: `project:${command.projectId}`,
        payloadHash: command.payloadHash, expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        result: { requiredPermissions: authorized.requiredPermissions, requiredCapabilities: authorized.requiredCapabilities,
          intendedAction: command.op === 'delete' ? 'deleted' : authorized.existing ? 'updated' : 'created' } } });
      return { ...base(command), status: row.status, receiptHandle: row.id, payloadHash: row.payloadHash, expiresAt: row.expiresAt };
    });
  }

  async function push(userId: string, deviceId: string, command: SyncCommand, c: unknown): Promise<Outcome> {
    if (!command.receiptHandle) return { ...unavailable(command), code: 'UPGRADE_REQUIRED' };
    return serial(db, async (tx) => {
      const { actor, authorized } = await context(tx, userId, deviceId, command, false);
      const hit = await receipt(tx, userId, deviceId, command);
      if (!hit) return unavailable(command);
      requireStoredAuthority(actor, authorized, hit.result);
      if (hit.expiresAt! <= new Date()) return { ...base(command), status: 'expired' };
      const stored = hit.result as Record<string, Json>;
      if (hit.status === 'applied') return { ...(stored.response as Outcome), replayed: true };
      if (command.op !== 'delete' && (stored.intendedAction === 'created') !== !authorized.existing) {
        throw new HttpError(409, 'CONFLICT', '预约后的资源存在性已变化');
      }
      if (!['pending', 'conflict', 'rejected'].includes(hit.status)) return unavailable(command);
      // Errors escape the transaction: never catch a failed ORM write and then commit partial business effects.
      const outcome = await adapters.execute(tx, actor, command, authorized);
      const record = JSON.parse(JSON.stringify({ ...base(command), ...outcome, receiptHandle: hit.id,
        payloadHash: hit.payloadHash })) as Outcome;
      if (outcome.status === 'applied') {
        await writeAuditStrict(tx, { c, actorId: userId, actorName: actor.user?.displayName,
          actorRole: actor.systemRole, action: command.op === 'delete' ? AUDIT_ACTIONS.DELETE : AUDIT_ACTIONS.UPDATE,
          entityType: null, entityId: command.id, entityLabel: `sync:${command.entity}`,
          metadata: { clientMutationId: command.clientMutationId, deviceId, payloadHash: hit.payloadHash,
            resourceScope: hit.resourceScope, op: command.op, action: outcome.action, elevated: authorized.access.elevated } });
      }
      await tx.syncMutation.update({ where: { id: hit.id }, data: {
        status: String(outcome.status), result: { ...stored, response: record } as Prisma.InputJsonObject } });
      return record;
    });
  }

  async function query(userId: string, deviceId: string, command: SyncCommand): Promise<Outcome> {
    if (!command.receiptHandle) return unavailable(command);
    try {
      return await serial(db, async (tx) => {
        const { actor, authorized } = await context(tx, userId, deviceId, command, false);
        const hit = await receipt(tx, userId, deviceId, command);
        if (!hit) return unavailable(command);
        requireStoredAuthority(actor, authorized, hit.result);
        if (hit.expiresAt! <= new Date()) return { ...base(command), status: 'expired' };
        return { ...base(command), status: hit.status, result: (hit.result as Record<string, Json>).response ?? null, receiptHandle: hit.id, payloadHash: hit.payloadHash, expiresAt: hit.expiresAt };
      });
    } catch (error) {
      // All denied/missing scopes share one result; a payload mismatch for a visible scope remains explicit.
      if (error instanceof HttpError && [401, 403, 404].includes(error.status)) return unavailable(command);
      throw error;
    }
  }
  return { reserve, push, query };
}
