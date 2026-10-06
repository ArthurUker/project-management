import { syncAPI, authAPI, toMessage } from '@/api';
import type { SyncChange, SyncInitResponse, SyncPushResult } from '@/api';
import { safeStorage } from '@/utils/safeStorage';
import { idb, ownerIsCurrent, type OfflineOwner, type OwnedIdb } from './idb';
import { tokenStore } from '../auth/tokenStore';
import { isApiError } from '../api/error';
import {
  buildDeadLetter,
  mergeDeadLetter,
  deadLetterKey,
  toOutboxRecord,
  type DeadLetterRecord,
} from './deadLetter';
import type { OutboxRecord, RecordRow } from './idb';

/**
 * offline/engine.ts —— 离线同步 v2 客户端引擎
 *
 * 职责：
 *   1. 本地变更日志（outbox，幂等键 clientMutationId）+ 实体镜像（records）
 *   2. 增量拉取（init，带 since 光标）与上行（push，带 baseUpdatedAt 冲突检测）
 *   3. ACL 变化时清除不再可见项目的本地数据
 *   4. 冲突/拒绝项留存，供 UI 呈现与处置
 *
 * 说明：不引入 Dexie 等依赖，本地存储走 offline/idb.ts 的最小封装。
 */

const DEVICE_KEY = 'rdpms.sync.deviceId';
const CURSOR_KEY = 'rdpms.sync.cursor';
const ACL_KEY = 'rdpms.sync.acl';
const CONFLICT_KEY = 'rdpms.sync.conflicts';

/**
 * A03：本地缓存键按主体分片——不同账号不得共享游标 / ACL 快照 / 冲突记录。
 * 键必须由**发起该轮同步时捕获的 userId** 计算，而不是读取可变的 `currentUserId`：
 * 否则账号切换后到达的旧响应会被写进新账号的命名空间（复核 Q7 的同类路径）。
 */
function scopedKey(base: string, userId: string | null): string {
  return `${base}:${userId ?? 'anonymous'}`;
}
const cursorKey = (userId: string | null) => scopedKey(CURSOR_KEY, userId);
const aclKey = (userId: string | null) => scopedKey(ACL_KEY, userId);
const conflictKey = (userId: string | null) => scopedKey(CONFLICT_KEY, userId);
const SYNC_INTERVAL_MS = 60_000;

/**
 * 传输层注入点（默认 = 真实 syncAPI）。
 * 仅用于测试注入**确定性替身**（例如「请求已发出 → 暂停 → 切换账号 → 再释放响应」），
 * 生产代码不调用；默认行为与直接调用 syncAPI 完全一致。
 */
export interface SyncTransport {
  init: (params: { since?: string; aclVersion?: string; deviceId: string; deviceLabel?: string; platform?: string; paginationVersion?: 1; pageToken?: string }) => Promise<SyncInitResponse>;
  reserve: (payload: { protocolVersion: 1; deviceId: string; changes: SyncChange[] }) => Promise<{ protocolVersion: 1; results: SyncPushResult[] }>;
  query: (payload: { protocolVersion: 1; deviceId: string; changes: SyncChange[] }) => Promise<{ protocolVersion: 1; results: SyncPushResult[] }>;
  push: (payload: {
    protocolVersion: 1;
    deviceId: string;
    deviceLabel?: string;
    platform?: string;
    changes: SyncChange[];
  }) => Promise<{ serverTime: string; results: SyncPushResult[]; conflictCount: number }>;
}
let transport: SyncTransport = syncAPI;
export function __setSyncTransport(next?: SyncTransport): void {
  transport = next ?? syncAPI;
}

export interface ConflictRecord {
  clientMutationId: string;
  entity: string;
  id: string;
  op: string;
  reason?: string;
  server?: Record<string, unknown>;
  detectedAt: string;
  /** 原始变更：供「保留本地」以服务端时间为基线重推 */
  change: SyncChange;
}

export interface SyncState {
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  pending: number;
  conflicts: ConflictRecord[];
  rejections: DeadLetterRecord[];
}

type Listener = (s: SyncState) => void;

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

let state: SyncState = {
  online: isOnline(),
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  pending: 0,
  conflicts: [],
  rejections: [],
};
const listeners = new Set<Listener>();
let timer: number | null = null;
/** 当前登录账户（拒绝区按账户隔离，退出登录不清空数据但清空内存视图） */
let currentOwner: OfflineOwner | null = null;
let currentPermissions: string[] = [];
const CACHE_LEASE_MS = 5 * 60_000;
const READ_PERMISSION: Record<string, string> = { projects: 'projects.view', projectPhases: 'project_phases.view', tasks: 'tasks.view', milestones: 'milestones.view', monthlyProgress: 'progress.view', reports: 'reports.view', projectMembers: 'projects.view' };
function captureOwner(): OfflineOwner {
  if (!currentOwner || !ownerIsCurrent(currentOwner)) throw new Error('OFFLINE_AUTHENTICATED_OWNER_REQUIRED');
  return Object.freeze({ ...currentOwner });
}
function sameOwner(owner: OfflineOwner): boolean { return currentOwner?.userId === owner.userId && currentOwner.loginGeneration === owner.loginGeneration && ownerIsCurrent(owner); }
/** A03：会话代次——账号切换/登出即自增，使在途同步（含已发出的请求）整体作废 */
let sessionGen = 0;
let started = false;
let startPromise: Promise<void> | null = null;
/** 事件监听与定时器是否已挂载（账号切换时不重复挂载） */
let listenersAttached = false;

function emit() {
  const snapshot = { ...state };
  listeners.forEach((fn) => fn(snapshot));
}
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  emit();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => {
    listeners.delete(fn);
  };
}

export function getState(): SyncState {
  return { ...state };
}

/** 读取本地镜像（离线只读回退：列表页在断网/请求失败时用） */
export async function readCachedRecords(entity: string): Promise<RecordRow[]> {
  const owner = captureOwner(); const db = idb.forOwner(owner);
  const acl = await db.kvGet<{ projectIds: string[]; permissions: string[]; observedAt: number; loginGeneration: string }>(aclKey(owner.userId));
  const permission = READ_PERMISSION[entity];
  if (!acl || !Array.isArray(acl.permissions) || !Array.isArray(acl.projectIds) || !Number.isFinite(acl.observedAt)
    || !permission || !currentPermissions.includes(permission) || !acl.permissions.includes(permission)
    || acl.loginGeneration !== owner.loginGeneration || Date.now() - acl.observedAt > CACHE_LEASE_MS || !sameOwner(owner)) return [];
  const visible = new Set(acl.projectIds); const rows = await db.recordsAll();
  if (!sameOwner(owner)) return [];
  return rows.filter((r) => r.entity === entity && visible.has(entity === 'projects' ? r.id : String(r.projectId ?? ''))
    && (entity !== 'reports' || r.data.authorId === owner.userId));
}

/** A definitive API denial invalidates mirror authorization, never a draft. */
export async function invalidateCacheAuthorization(userId: string, loginGeneration: string): Promise<void> {
  const owner = { userId, loginGeneration };
  if (!sameOwner(owner)) return;
  await idb.forOwner(owner).kvDelete(aclKey(userId));
}

/** 生成幂等键（clientMutationId）；同一变更重放不会重复写库 */
export function newClientMutationId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDeviceId(): string {
  const actor = currentOwner?.userId; if (!actor) return '';
  const key = `${DEVICE_KEY}:${actor}`;
  let id = safeStorage.get(key);
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}`;
    safeStorage.set(key, id);
  }
  return id;
}

function deviceMeta() {
  if (typeof navigator === 'undefined') return { deviceLabel: undefined, platform: undefined };
  const ua = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  return { deviceLabel: ua ? ua.slice(0, 120) : undefined, platform: navigator.platform };
}

async function refreshPending(owner = captureOwner()) {
  const pending = (await idb.forOwner(owner).outboxAll()).length;
  if (sameOwner(owner)) set({ pending });
}

export const SYNC_BATCH_MAX_COUNT = 500;
export const SYNC_BATCH_MAX_BYTES = 256 * 1024;
function wireChange(row: OutboxRecord): SyncChange {
  return { clientMutationId: row.clientMutationId, entity: row.entity, op: row.op, id: row.id,
    ...(row.projectId ? { projectId: row.projectId } : {}), ...(row.data !== undefined ? { data: row.data } : {}),
    ...(row.baseUpdatedAt !== undefined ? { baseUpdatedAt: row.baseUpdatedAt } : {}),
    ...(row.payloadHash ? { payloadHash: row.payloadHash } : {}), ...(row.receiptHandle ? { receiptHandle: row.receiptHandle } : {}) };
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key])).join(',') + '}';
  }
  throw new Error('SYNC_COMMAND_INVALID_JSON');
}
export async function syncPayloadHash(row: OutboxRecord): Promise<string> {
  if (!row.projectId) throw new Error('PROJECT_SCOPE_REQUIRED');
  const semantic = { entity: row.entity, id: row.id, op: row.op, projectId: row.projectId, data: row.data ?? {},
    ...(row.baseUpdatedAt !== undefined ? { baseUpdatedAt: row.baseUpdatedAt } : {}) };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(semantic)));
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
}
function validateResults(results: unknown, rows: OutboxRecord[]): SyncPushResult[] {
  if (!Array.isArray(results) || results.length !== rows.length) throw new Error('SYNC_RESULT_INCOMPLETE');
  const seen = new Set<string>();
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') throw new Error('SYNC_RESULT_TYPE');
    const result = raw as SyncPushResult; const original = rows.find((r) => r.clientMutationId === result.clientMutationId);
    if (!original || seen.has(result.clientMutationId) || result.entity !== original.entity || result.id !== original.id || result.op !== original.op
      || !['applied', 'pending', 'conflict', 'rejected', 'unknown', 'expired'].includes(result.status)) throw new Error('SYNC_RESULT_MISMATCH');
    seen.add(result.clientMutationId);
    if (['applied', 'pending', 'conflict', 'rejected'].includes(result.status)) {
      if (typeof result.receiptHandle !== 'string' || !result.receiptHandle || result.receiptHandle.length > 200
        || result.payloadHash !== original.payloadHash || (original.receiptHandle && result.receiptHandle !== original.receiptHandle)) throw new Error('SYNC_RECEIPT_BINDING_MISMATCH');
    }
  }
  return results as SyncPushResult[];
}
async function loadQueued(db: OwnedIdb, key: string) { return (await db.outboxAll()).find((r) => r.clientMutationId === key); }
async function prepareReceipt(original: OutboxRecord, db: OwnedIdb, owner: OfflineOwner, manual: boolean): Promise<OutboxRecord | null> {
  if (!sameOwner(owner) || original.origin !== 'fresh-v1') return null;
  let hash: string;
  try { hash = await syncPayloadHash(original); } catch { await db.outboxTransport(original, { recoveryStatus: 'invalid' }); return null; }
  if (original.payloadHash && original.payloadHash !== hash) { await db.outboxTransport(original, { recoveryStatus: 'invalid' }); return null; }
  const deviceId = original.deviceId ?? getDeviceId();
  if (original.receiptHandle) {
    if (!manual && ['unknown', 'expired', 'invalid'].includes(original.recoveryStatus ?? '')) return null;
    return original;
  }
  if (original.attempt === 'pushed' || original.recoveryStatus === 'unknown' || original.recoveryStatus === 'expired') return null;
  await db.outboxTransport(original, { deviceId, payloadHash: hash, attempt: 'reserving', retryCount: (original.retryCount ?? 0) + 1 });
  const reserving = (await loadQueued(db, original.clientMutationId))!;
  if (!sameOwner(owner)) return null;
  const response = await transport.reserve({ protocolVersion: 1, deviceId, changes: [wireChange(reserving)] });
  if (!sameOwner(owner)) return null;
  const result = validateResults(response.results, [reserving])[0];
  if (result.status === 'unknown' || result.status === 'expired') { await db.outboxTransport(reserving, { recoveryStatus: result.status }); return null; }
  if (typeof result.expiresAt !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('SYNC_RECEIPT_WINDOW_INVALID');
  await db.outboxTransport(reserving, { receiptHandle: result.receiptHandle, expiresAt: result.expiresAt, attempt: result.status === 'pending' ? 'bound' : 'pushed', recoveryStatus: 'pending' });
  return (await loadQueued(db, original.clientMutationId)) ?? null;
}
async function settleReceipt(row: OutboxRecord, result: SyncPushResult, db: OwnedIdb, owner: OfflineOwner): Promise<void> {
  if (!sameOwner(owner)) return;
  if (result.status === 'applied') {
    if (result.result) validateResults([result.result], [row]);
    await db.outboxConfirmApplied(row);
  } else if (result.status === 'conflict') {
    const detail = result.result ?? result;
    await db.conflictMove(row, conflictKey(owner.userId), { clientMutationId: row.clientMutationId, entity: row.entity, id: row.id, op: row.op,
      reason: detail.reason, server: detail.server, detectedAt: new Date().toISOString(), change: { ...row } } as ConflictRecord);
  } else if (result.status === 'rejected') {
    const detail = result.result ?? result; const record = buildDeadLetter({ userId: owner.userId, outbox: row,
      projectId: row.projectId ?? null, reason: detail.reason ?? detail.code ?? '服务端拒绝', code: detail.code, now: new Date().toISOString() });
    await db.deadLetterMove(record, (existing) => mergeDeadLetter(existing as DeadLetterRecord | undefined, record));
  } else await db.outboxTransport(row, { recoveryStatus: result.status === 'unknown' || result.status === 'expired' ? result.status : 'pending' });
}
async function queryReceipt(row: OutboxRecord, db: OwnedIdb, owner: OfflineOwner) {
  if (!row.deviceId || !row.receiptHandle || !sameOwner(owner)) return null;
  const response = await transport.query({ protocolVersion: 1, deviceId: row.deviceId, changes: [wireChange(row)] });
  if (!sameOwner(owner)) return null;
  const result = validateResults(response.results, [row])[0];
  if (['applied', 'conflict', 'rejected'].includes(result.status)) {
    if (!result.result || result.result.status !== result.status) throw new Error('SYNC_QUERY_OUTCOME_INCOMPLETE');
    validateResults([result.result], [row]);
  }
  await settleReceipt(row, result, db, owner); return result;
}
function freezeValue<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeValue); Object.freeze(value); }
  return value;
}
export function batchBytes(rows: OutboxRecord[], deviceId: string): number {
  return new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, deviceId, ...deviceMeta(), changes: rows.map(wireChange) })).byteLength;
}
/** Snapshot only currently ready commands. A parent is not ready until its prerequisite applied. */
export function planSyncBatch(rows: OutboxRecord[], deviceId: string, maxBytes = SYNC_BATCH_MAX_BYTES) {
  const ordered = [...rows].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.clientMutationId.localeCompare(b.clientMutationId));
  const selected: OutboxRecord[] = []; const blocked: Array<{ key: string; reason: string }> = [];
  const identities = new Set<string>(); const presentKeys = new Set(rows.map((r) => r.clientMutationId));
  for (const row of ordered) {
    const identity = `${row.entity}:${row.id}`;
    const previousSame = identities.has(identity); identities.add(identity);
    if (row.origin !== 'fresh-v1') { blocked.push({ key: row.clientMutationId, reason: 'LEGACY_UNVERIFIED' }); continue; }
    if (!row.projectId) { blocked.push({ key: row.clientMutationId, reason: 'PROJECT_SCOPE_REQUIRED' }); continue; }
    if (previousSame || row.dependsOn?.some((key) => presentKeys.has(key))) { blocked.push({ key: row.clientMutationId, reason: 'DEPENDENCY_PENDING' }); continue; }
    // Missing explicit dependencies are safe only when an applied marker was
    // recorded by the engine; the caller filters/validates those markers first.
    if (selected.length === SYNC_BATCH_MAX_COUNT) break;
    if (batchBytes([row], deviceId) > maxBytes) { blocked.push({ key: row.clientMutationId, reason: 'OVERSIZE' }); continue; }
    if (batchBytes([...selected, row], deviceId) > maxBytes) break;
    selected.push(row);
  }
  return { rows: freezeValue(structuredClone(selected)), blocked };
}

/** 本地变更入队（离线写入唯一入口）；在线时立即触发同步 */
export async function enqueueChange(change: SyncChange): Promise<void> {
  const owner = captureOwner(); const db = idb.forOwner(owner);
  // A03：入队时标记主体归属——登出切换账号时不得把 A 的未同步内容并入 B
  const cached = await db.recordsAll();
  const projectId = change.projectId ?? (typeof change.data?.projectId === 'string' ? change.data.projectId : undefined)
    ?? (change.entity === 'projects' ? change.id : cached.find((r) => r.entity === change.entity && r.id === change.id)?.projectId ?? undefined);
  const queued = await db.outboxAll();
  const prerequisites = new Set(change.dependsOn ?? []);
  for (const prior of queued) {
    if ((prior.entity === change.entity && prior.id === change.id) || (prior.entity === 'projects' && prior.id === projectId)
      || (prior.entity === 'tasks' && prior.id === change.data?.parentId) || (prior.entity === 'projectPhases' && prior.id === change.data?.phaseId)) prerequisites.add(prior.clientMutationId);
  }
  const row: OutboxRecord = {
    ...change, projectId, dependsOn: [...prerequisites], origin: 'fresh-v1',
    createdAt: new Date().toISOString(),
    userId: owner.userId,
  };
  await db.outboxPut(row);
  await refreshPending(owner);
  if (!sameOwner(owner)) return;
  if (state.online) void syncNow();
}

/** 一轮同步的会话快照：主体与代次在**发起时**固定，回包一律按它校验 */
interface SyncSession {
  userId: string;
  owner: OfflineOwner;
  db: OwnedIdb;
  isStale: () => boolean;
}

async function applyPull(res: SyncInitResponse, session: SyncSession, commitCursor: boolean, accumulated: { upserts: RecordRow[]; tombstones: string[]; full: boolean }): Promise<void> {
  const db = session.db;
  const upserts: RecordRow[] = [];
  const tombstoneKeys: string[] = [];
  for (const [entity, bucket] of Object.entries(res.changes)) {
    for (const row of bucket.upserts) {
      const rec = row as Record<string, unknown>;
      const id = String(rec.id ?? '');
      if (!id) continue;
      upserts.push({
        key: `${entity}:${id}`,
        entity,
        id,
        projectId: (rec.projectId as string | undefined) ?? null,
        data: rec,
        updatedAt: rec.updatedAt as string | undefined,
      });
    }
    for (const id of bucket.tombstones) tombstoneKeys.push(`${entity}:${id}`);
  }
  accumulated.upserts.push(...upserts); accumulated.tombstones.push(...tombstoneKeys);
  if (!commitCursor || session.isStale()) return;
  await db.publishPull(accumulated.upserts, accumulated.tombstones, accumulated.full,
    aclKey(session.userId), { ...res.acl, observedAt: Date.now(), loginGeneration: session.owner.loginGeneration },
    cursorKey(session.userId), res.cursor);
}

function canSendWithAcl(row: OutboxRecord, acl: SyncInitResponse['acl']): boolean {
  const policy = acl.writePolicy?.[row.entity];
  const project = acl.projects?.find(p => p.id === row.projectId);
  const capabilities = project?.capabilities ?? []; const grants = acl.permissions;
  return Boolean(policy && project && grants.includes(policy.read) && capabilities.includes(row.op === 'delete' ? (row.entity === 'projectMembers' ? 'manage_members' : 'delete') : policy.capability)
    && (row.op === 'delete' ? grants.includes(policy.delete) : grants.includes(policy.update) || Boolean(policy.create && grants.includes(policy.create)))
    && (!row.data || row.data.status === undefined || !policy.status || (grants.includes(policy.status) && capabilities.includes('transition')))
    && (!row.data || row.data.assigneeId === undefined || !policy.assign || (grants.includes(policy.assign) && capabilities.includes('assign'))));

}

export async function syncNow(manual = false): Promise<void> {
  if (state.syncing || !(manual ? isOnline() : state.online)) return;
  if (manual) set({ online: isOnline() });
  // A03：没有绑定主体时**不得同步**——否则服务端拒绝的回包会被当成「无主变更」直接丢弃，
  // 用户未提交的内容就被静默销毁了（F10 浏览器验收实测到的路径）
  if (!currentOwner || !ownerIsCurrent(currentOwner)) return;
  const owner = captureOwner(); const db = idb.forOwner(owner);
  set({ syncing: true, lastError: null });
  const deviceId = getDeviceId();
  // A03：本轮同步绑定「发起时的主体 + 会话代次」。之后任何异步回包、落盘、状态写入
  // 都必须校验代次未变——账号切换后到达的旧响应不得写入新账号命名空间（原 Q7 缺陷）。
  const myGen = sessionGen;
  const myUserId = owner.userId;
  const isStale = () => myGen !== sessionGen || !sameOwner(owner);
  const session: SyncSession = { userId: myUserId, owner, db, isStale };
  try {
    const since = await db.kvGet<string>(cursorKey(myUserId));
    const oldAcl = await db.kvGet<SyncInitResponse['acl'] & { loginGeneration: string }>(aclKey(myUserId));
    let firstPull = await transport.init({
      since: since || undefined,
      aclVersion: oldAcl?.aclVersion,
      deviceId,
      paginationVersion: 1,
      ...deviceMeta(),
    });
    if (isStale()) return;
    if (!oldAcl || oldAcl.aclVersion !== firstPull.acl.aclVersion) await db.kvDelete(aclKey(myUserId));
    if (since && !firstPull.full && (!oldAcl || oldAcl.aclVersion !== firstPull.acl.aclVersion || oldAcl.loginGeneration !== owner.loginGeneration)) {
      firstPull = await transport.init({ deviceId, paginationVersion: 1, ...deviceMeta() });
    }
    if (isStale()) return;
    // Record denial before cache staging. If publish aborts or a page is lost,
    // later restored grants cannot silently send previously isolated originals.
    for (const row of await db.outboxAll()) {
      if (!canSendWithAcl(row, firstPull.acl)) await db.outboxTransport(row, { scopeBlocked: firstPull.acl.aclVersion });
    }
    const changedAcl = !oldAcl || oldAcl.aclVersion !== firstPull.acl.aclVersion || oldAcl.loginGeneration !== owner.loginGeneration;
    if (changedAcl || firstPull.full) await db.kvDelete(aclKey(myUserId));
    const accumulated = { upserts: [] as RecordRow[], tombstones: [] as string[], full: firstPull.full || changedAcl };
    let pull = firstPull;
    while (true) {
      if (isStale()) return; // 旧会话的拉取结果不得落盘
      const hasMore = Boolean(pull.pagination?.hasMore);
      await applyPull(pull, session, !hasMore, accumulated);
      if (!hasMore) break;
      const pageToken = pull.pagination?.nextPageToken;
      if (!pageToken) throw new Error('同步分页响应缺少 nextPageToken');
      pull = await transport.init({ pageToken, deviceId, paginationVersion: 1, ...deviceMeta() });
    }
    const res = pull;

    const queried = new Set<string>();
    while (true) {
      const queued = await db.outboxAll();
      if (isStale()) return;
      const ready: OutboxRecord[] = [];
      for (const row of queued) {
        const allowed = canSendWithAcl(row, res.acl);
        if (!allowed) { if (row.scopeBlocked !== res.acl.aclVersion) await db.outboxTransport(row, { scopeBlocked: res.acl.aclVersion }); continue; }
        if (row.scopeBlocked && !manual) continue;
        if (row.scopeBlocked) await db.outboxTransport(row, { scopeBlocked: undefined });
        const unknownPrerequisite = (row.dependsOn ?? []).some((key) => !queued.some((r) => r.clientMutationId === key));
        if (unknownPrerequisite) {
          const applied = await Promise.all((row.dependsOn ?? []).map((key) => db.kvGet<boolean>('rdpms.sync.applied:' + key)));
          if (applied.some((v) => !v)) continue;
        }
        ready.push(row.scopeBlocked ? { ...row, scopeBlocked: undefined } : row);
      }
      const readyBound: OutboxRecord[] = [];
      for (const row of planSyncBatch(ready, deviceId).rows) {
        if (!manual && (row.retryCount ?? 0) >= 3) continue;
        const bound = await prepareReceipt(row, db, owner, manual);
        if (!bound || isStale()) continue;
        if (bound.attempt === 'pushed' || bound.recoveryStatus === 'unknown') {
          if (queried.has(bound.clientMutationId)) continue;
          queried.add(bound.clientMutationId);
          const outcome = await queryReceipt(bound, db, owner);
          if (!outcome || outcome.status !== 'pending') continue;
        }
        const current = await loadQueued(db, bound.clientMutationId); if (current) readyBound.push(current);
      }
      if (isStale()) return;
      const batchDevice = readyBound[0]?.deviceId ?? deviceId;
      const planned = planSyncBatch(readyBound.filter((r) => r.deviceId === batchDevice), batchDevice);
      const outbox = planned.rows;
      if (!outbox.length) {
        const remaining = await db.outboxAll();
        if (remaining.length < queued.length) continue;
        if (remaining.length) set({ lastError: '原文已保留：回执、历史发送状态、依赖或正文大小需要核对' });
        break;
      }
      const beforeKeys = new Set(outbox.map((r) => r.clientMutationId));
      for (const row of outbox) await db.outboxTransport(row, { attempt: 'pushed', retryCount: (row.retryCount ?? 0) + 1 });
      if (isStale()) return;
      try {
        const response = await transport.push({ protocolVersion: 1, deviceId: batchDevice, ...deviceMeta(), changes: outbox.map(wireChange) });
        if (isStale()) return;
        const results = validateResults(response.results, outbox);
        for (const result of results) await settleReceipt(outbox.find((r) => r.clientMutationId === result.clientMutationId)!, result, db, owner);
      } catch (error) {
        if (isStale()) return;
        // One recovery query per item in this run. Missing/expired is never a
        // reservation or new-key licence; response faults never delete blindly.
        for (const row of outbox) {
          const current = await loadQueued(db, row.clientMutationId); if (!current) continue;
          if (queried.has(row.clientMutationId)) { await db.outboxTransport(current, { recoveryStatus: 'unknown' }); continue; }
          queried.add(row.clientMutationId);
          try { await queryReceipt(current, db, owner); }
          catch { await db.outboxTransport(current, { recoveryStatus: 'unknown' }); }
        }
        if (!isStale()) set({ lastError: toMessage(error, '结果未确认；原文已保留，请核对回执') });
        break;
      }
      const afterKeys = new Set((await db.outboxAll()).map((r) => r.clientMutationId));
      if ([...beforeKeys].every((key) => afterKeys.has(key))) break;
    }

    if (isStale()) return;
    const merged = (await db.kvGet<ConflictRecord[]>(conflictKey(myUserId))) ?? [];
    if (isStale()) return;
    set({
      lastSyncAt: res.serverTime,
      pending: (await db.outboxAll()).length,
      conflicts: merged,
      // 拒绝区读取也必须按**发起时主体**，不能读当前账号（否则会把 A 的内容显示给 B）
      rejections: myUserId
        ? (await db.deadLettersForUser(myUserId)) as DeadLetterRecord[]
        : [],
    });
  } catch (e) {
    if (isStale()) return; // A03：旧会话的失败不得污染当前账号状态
    if (isApiError(e) && ([401, 403, 404].includes(e.status) || e.code === 'SYNC_ACL_CHANGED')) await db.kvDelete(aclKey(myUserId)).catch(() => undefined);
    if (!isStale()) set({ lastError: toMessage(e, '同步失败') });
  } finally {
    // A03：旧会话不得改写新会话的「同步中」标志（否则会把当前账号的同步卡住或提前放行）
    if (!isStale()) set({ syncing: false });
  }
}

export interface RecoveryItem {
  kind: 'pending' | 'conflict' | 'rejected'; key: string; entity: string; id: string;
  reason?: string; payload?: Record<string, unknown>; baseUpdatedAt?: string; server?: Record<string, unknown>;
}
async function freshRecovery(owner: OfflineOwner) {
  const me = await authAPI.me();
  if (!sameOwner(owner) || me.id !== owner.userId) throw new Error('OFFLINE_SESSION_CHANGED');
  const acl = await transport.init({ deviceId: getDeviceId(), paginationVersion: 1, ...deviceMeta() });
  if (!sameOwner(owner)) throw new Error('OFFLINE_SESSION_CHANGED');
  return { permissions: me.permissions, acl: acl.acl, changes: acl.changes };
}
function canRecover(item: RecoveryItem, cache: RecordRow[], grants: Awaited<ReturnType<typeof freshRecovery>>, writing = false) {
  const projectId = item.entity === 'projects' ? item.id : String(item.payload?.projectId ?? cache.find((r) => r.entity === item.entity && r.id === item.id)?.projectId ?? '');
  if (!projectId) return !writing; // own unbound original may be retrieved, never automatically retried
  const permission = READ_PERMISSION[item.entity];
  const writePermissions: Record<string, string[]> = { projects: ['projects.create', 'projects.update', 'projects.delete'], projectPhases: ['project_phases.create', 'project_phases.update', 'project_phases.delete'], tasks: Object.keys(item.payload ?? {}).every((k) => ['status', 'projectId'].includes(k)) ? ['tasks.update_status'] : ['tasks.create', 'tasks.update'], milestones: ['milestones.create', 'milestones.update'], monthlyProgress: ['progress.create', 'progress.update'], reports: ['reports.create', 'reports.update'], projectMembers: ['projects.manage_members'] };
  if (writing && !(writePermissions[item.entity] ?? []).some((p) => grants.permissions.includes(p) && grants.acl.permissions.includes(p))) return false;
  return Boolean(permission && grants.permissions.includes(permission) && grants.acl.permissions.includes(permission) && grants.acl.projectIds.includes(projectId));
}
export async function loadRecovery(): Promise<{ items: RecoveryItem[]; hidden: number; quarantine: number }> {
  const owner = captureOwner(); const db = idb.forOwner(owner); const grants = await freshRecovery(owner);
  const pending = await db.outboxAll(); const conflicts = (await db.kvGet<ConflictRecord[]>(conflictKey(owner.userId))) ?? [];
  const rejected = (await db.deadLettersForUser(owner.userId)) as DeadLetterRecord[]; const cache = await db.recordsAll();
  const all: RecoveryItem[] = [
    ...pending.map((r) => ({ kind: 'pending' as const, key: r.clientMutationId, entity: r.entity, id: r.id, payload: r.data, baseUpdatedAt: r.baseUpdatedAt, reason: r.scopeBlocked ? '授权已变化；原文隔离保全，恢复授权后需主动核对' : r.recoveryStatus ? `回执状态：${r.recoveryStatus}，原文保留，禁止自动换键` : r.origin !== 'fresh-v1' ? '历史发送状态未确认，原文保留' : r.dependsOn?.length ? '等待前序操作确认' : undefined })),
    ...conflicts.map((r) => ({ kind: 'conflict' as const, key: r.clientMutationId, entity: r.entity, id: r.id, reason: r.reason, payload: r.change.data, baseUpdatedAt: r.change.baseUpdatedAt })),
    ...rejected.map((r) => ({ kind: 'rejected' as const, key: r.clientMutationId, entity: r.entity, id: r.id, reason: r.reason, payload: r.payload, baseUpdatedAt: r.baseUpdatedAt })),
  ];
  const items = all.filter((r) => canRecover(r, cache, grants)).map((r) => ({ ...r, server: r.kind === 'conflict' ? grants.changes[r.entity]?.upserts.find((row) => row.id === r.id) : undefined })); const quarantine = await db.quarantineCount();
  if (!sameOwner(owner)) throw new Error('OFFLINE_SESSION_CHANGED');
  return { items, hidden: all.length - items.length, quarantine };
}
async function authorizedItem(owner: OfflineOwner, kind: RecoveryItem['kind'], key: string, writing = false) {
  const data = await loadRecovery(); if (!sameOwner(owner)) throw new Error('OFFLINE_SESSION_CHANGED');
  const item = data.items.find((r) => r.kind === kind && r.key === key); if (!item) throw new Error('RECOVERY_NOT_AUTHORIZED');
  if (writing) { const db = idb.forOwner(owner); const grants = await freshRecovery(owner);
    if (!canRecover(item, await db.recordsAll(), grants, true)) throw new Error('RECOVERY_PROJECT_REQUIRED'); }
  return item;
}
export async function exportRecovery(kind: RecoveryItem['kind'], key: string): Promise<string> {
  const owner = captureOwner(); const item = await authorizedItem(owner, kind, key); const db = idb.forOwner(owner);
  await db.recordExport(kind, key); if (!sameOwner(owner)) throw new Error('OFFLINE_SESSION_CHANGED');
  return JSON.stringify({ entity: item.entity, id: item.id, clientMutationId: key, payload: item.payload, baseUpdatedAt: item.baseUpdatedAt }, null, 2);
}
export async function discardRecovery(kind: RecoveryItem['kind'], key: string, confirmed = false): Promise<void> {
  if (!confirmed) throw new Error('RECOVERY_CONFIRMATION_REQUIRED');
  const owner = captureOwner(); await authorizedItem(owner, kind, key); const db = idb.forOwner(owner);
  if (kind === 'conflict') await db.conflictResolve(conflictKey(owner.userId), key);
  else await db.discard(kind === 'pending' ? 'outbox' : 'deadLetters', kind === 'pending' ? key : deadLetterKey(owner.userId, key), true);
  if (sameOwner(owner)) { await hydrate(); await restoreDeadLetters(); }
}
/** A conflict retry is an explicit new intent; unresolved/unknown receipt keys are not rekeyed here. */
export async function resolveConflict(clientMutationId: string, resolution: 'server' | 'local', confirmed = false): Promise<void> {
  if (resolution === 'server') { await discardRecovery('conflict', clientMutationId, confirmed); return; }
  const owner = captureOwner(); await authorizedItem(owner, 'conflict', clientMutationId, true); const db = idb.forOwner(owner);
  const values = (await db.kvGet<ConflictRecord[]>(conflictKey(owner.userId))) ?? [];
  const target = values.find((r) => r.clientMutationId === clientMutationId); if (!target) return;
  const base = (target.server?.updatedAt as string | undefined) ?? target.change.baseUpdatedAt;
  await db.conflictResolve(conflictKey(owner.userId), clientMutationId, { entity: target.change.entity, id: target.change.id, op: target.change.op as 'upsert' | 'delete', data: target.change.data, projectId: target.change.projectId, userId: owner.userId, origin: 'fresh-v1',
    clientMutationId: newClientMutationId(), baseUpdatedAt: base, createdAt: new Date().toISOString() });
  if (sameOwner(owner)) { await hydrate(); if (state.online) void syncNow(); }
}
export async function retryRejection(clientMutationId: string): Promise<boolean> {
  const owner = captureOwner(); await authorizedItem(owner, 'rejected', clientMutationId, true); const db = idb.forOwner(owner);
  const rows = (await db.deadLettersForUser(owner.userId)) as DeadLetterRecord[];
  const record = rows.find((r) => r.clientMutationId === clientMutationId); if (!record) return false;
  await db.deadLetterRetry(record.key, { ...toOutboxRecord(record), userId: owner.userId });
  if (sameOwner(owner)) { await restoreDeadLetters(); await refreshPending(owner); if (state.online) void syncNow(); }
  return true;
}
/** Bulk deletion is deliberately disabled; discard one selected payload with confirmation. */
export function clearRejections(): void { set({ lastError: '请逐条查看并确认放弃；原文仍已保留' }); }
export async function restoreDeadLetters(): Promise<void> {
  const owner = captureOwner(); const rows = (await idb.forOwner(owner).deadLettersForUser(owner.userId)) as DeadLetterRecord[];
  if (sameOwner(owner)) set({ rejections: rows });
}
export async function getRejectedPayload(clientMutationId: string): Promise<DeadLetterRecord | undefined> {
  const owner = captureOwner(); await authorizedItem(owner, 'rejected', clientMutationId);
  const rows = (await idb.forOwner(owner).deadLettersForUser(owner.userId)) as DeadLetterRecord[];
  return rows.find((r) => r.clientMutationId === clientMutationId);
}
export async function dropRejection(clientMutationId: string, confirmed = false): Promise<void> {
  await discardRecovery('rejected', clientMutationId, confirmed);
}

export async function hydrate(): Promise<void> {
  const owner = captureOwner(); const db = idb.forOwner(owner);
  const conflicts = (await db.kvGet<ConflictRecord[]>(conflictKey(owner.userId))) ?? [];
  const cursor = await db.kvGet<string>(cursorKey(owner.userId));
  const pending = (await db.outboxAll()).length;
  if (!sameOwner(owner)) return;
  set({
    conflicts,
    pending,
    lastSyncAt: cursor ?? null,
    online: isOnline(),
  });
}

export function start(userId?: string, permissions: string[] = []): Promise<void> {
  const login = tokenStore.snapshot();
  if (!userId || login?.actorId !== userId) { pauseForBootstrap(); return Promise.resolve(); }
  const owner = Object.freeze({ userId, loginGeneration: login.loginGeneration });
  if (sameOwner(owner) && startPromise) { currentPermissions = [...permissions]; return startPromise; }
  if (started && sameOwner(owner)) { currentPermissions = [...permissions]; return Promise.resolve(); }
  const work = initialize(owner, permissions);
  startPromise = work;
  void work.then(() => { if (startPromise === work) startPromise = null; }, () => { if (startPromise === work) startPromise = null; });
  return work;
}

async function initialize(owner: OfflineOwner, permissions: string[]): Promise<void> {
  stop(); currentOwner = owner; currentPermissions = [...permissions];
  const myGen = ++sessionGen;
  set({ syncing: false, pending: 0, conflicts: [], rejections: [], lastSyncAt: null, lastError: null });
  await idb.activateOwner(owner);
  if (myGen !== sessionGen || !sameOwner(owner)) return;
  started = true;
  await hydrate(); await restoreDeadLetters();
  if (myGen !== sessionGen || !sameOwner(owner)) return;
  if (!listenersAttached) {
    listenersAttached = true; window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); window.addEventListener('rdpms-offline-versionchange', pauseForBootstrap);
    timer = window.setInterval(() => { if (state.online) void syncNow(); }, SYNC_INTERVAL_MS);
  }
  if (state.online) void syncNow();
}
/** Identity restoration hides prior data; it is not a logout or data-clear command. */
export function pauseForBootstrap(): void {
  stop(); ++sessionGen; currentOwner = null; currentPermissions = [];
  set({ syncing: false, pending: 0, conflicts: [], rejections: [], lastSyncAt: null, lastError: null });
}

function onOnline() {
  set({ online: true });
  void syncNow();
}
function onOffline() {
  set({ online: false });
}

export function stop(): void {
  ++sessionGen; // also cancels initialization that has not attached listeners yet
  startPromise = null;
  started = false;
  if (listenersAttached) {
    listenersAttached = false;
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('rdpms-offline-versionchange', pauseForBootstrap);
  }
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
}

/** Only invalidate the captured session fence. Never delete an unconfirmed draft. */
export async function resetOnLogout(): Promise<void> {
  const owner = currentOwner;
  pauseForBootstrap();
  if (owner) await idb.deactivateOwner(owner);
}
