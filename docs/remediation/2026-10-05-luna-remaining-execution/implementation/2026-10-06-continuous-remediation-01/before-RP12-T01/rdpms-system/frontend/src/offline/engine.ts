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
  init: (params: { since?: string; deviceId: string; deviceLabel?: string; platform?: string; paginationVersion?: 1; pageToken?: string }) => Promise<SyncInitResponse>;
  push: (payload: {
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

/** 实体 → 项目归属字段（用于 ACL 变化时清除本地越权数据） */
const PROJECT_SCOPED: Record<string, 'projectId' | 'self'> = {
  projects: 'self',
  projectPhases: 'projectId',
  tasks: 'projectId',
  milestones: 'projectId',
  monthlyProgress: 'projectId',
  reports: 'projectId',
  projectMembers: 'projectId',
};

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

/** 本地变更入队（离线写入唯一入口）；在线时立即触发同步 */
export async function enqueueChange(change: SyncChange): Promise<void> {
  const owner = captureOwner(); const db = idb.forOwner(owner);
  // A03：入队时标记主体归属——登出切换账号时不得把 A 的未同步内容并入 B
  const row: OutboxRecord = {
    ...change,
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

async function applyPull(res: SyncInitResponse, session: SyncSession, commitCursor = true): Promise<void> {
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
  await db.recordsPutMany(upserts);
  if (session.isStale()) return;
  await db.recordsDeleteMany(tombstoneKeys);
  if (session.isStale()) return;

  // ACL 变化：清除不再可见项目的本地数据（权限回收后本地不可残留）
  const aclKeyForSession = aclKey(session.userId);
  const prevAcl = await db.kvGet<{ aclVersion: string }>(aclKeyForSession);
  if (session.isStale()) return;
  if (!prevAcl || prevAcl.aclVersion !== res.acl.aclVersion) {
    const visible = new Set(res.acl.projectIds);
    const all = await db.recordsAll();
    if (session.isStale()) return;
    const purge = all
      .filter((r) => {
        const scope = PROJECT_SCOPED[r.entity];
        if (!scope) return false;
        const pid = scope === 'self' ? r.id : String(r.projectId ?? '');
        return pid ? !visible.has(pid) : false;
      })
      .map((r) => r.key);
    await db.recordsDeleteMany(purge);
    if (session.isStale()) return;
    await db.kvSet(aclKeyForSession, {
      aclVersion: res.acl.aclVersion,
      projectIds: res.acl.projectIds,
      permissions: res.acl.permissions,
      observedAt: Date.now(),
      loginGeneration: session.owner.loginGeneration,
    });
  }
  if (session.isStale()) return;
  await db.kvSet(aclKeyForSession, { ...res.acl, observedAt: Date.now(), loginGeneration: session.owner.loginGeneration });
  if (session.isStale()) return;
  if (commitCursor) await db.kvSet(cursorKey(session.userId), res.cursor);
}

export async function syncNow(): Promise<void> {
  if (state.syncing || !state.online) return;
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
    let firstPull = await transport.init({
      since: since || undefined,
      deviceId,
      paginationVersion: 1,
      ...deviceMeta(),
    });
    const oldAcl = await db.kvGet<{ aclVersion: string; loginGeneration: string }>(aclKey(myUserId));
    if (isStale()) return;
    if (since && (!oldAcl || oldAcl.aclVersion !== firstPull.acl.aclVersion || oldAcl.loginGeneration !== owner.loginGeneration)) {
      firstPull = await transport.init({ deviceId, paginationVersion: 1, ...deviceMeta() });
    }
    if (isStale()) return;
    if (firstPull.full || !oldAcl || oldAcl.aclVersion !== firstPull.acl.aclVersion) await db.recordsClear();
    let pull = firstPull;
    while (true) {
      if (isStale()) return; // 旧会话的拉取结果不得落盘
      const hasMore = Boolean(pull.pagination?.hasMore);
      await applyPull(pull, session, !hasMore);
      if (!hasMore) break;
      const pageToken = pull.pagination?.nextPageToken;
      if (!pageToken) throw new Error('同步分页响应缺少 nextPageToken');
      pull = await transport.init({ pageToken, deviceId, paginationVersion: 1, ...deviceMeta() });
    }
    const res = pull;

    const outbox = await db.outboxAll();
    const nextRejections: DeadLetterRecord[] = [];
    if (outbox.length) {
      const { results } = await transport.push({
        deviceId,
        ...deviceMeta(),
        changes: outbox.map((r) => ({
          clientMutationId: r.clientMutationId,
          entity: r.entity,
          op: r.op,
          id: r.id,
          data: r.data,
          baseUpdatedAt: r.baseUpdatedAt,
        })),
      });
      for (const r of results) {
        if (isStale()) return; // A03：账号已切换，本轮上行结果一律不落盘
        if (r.status === 'applied') {
          await db.outboxDelete(r.clientMutationId);
        } else if (r.status === 'conflict') {
          const src = outbox.find((o) => o.clientMutationId === r.clientMutationId);
          if (src) {
            const conflict: ConflictRecord = { clientMutationId: r.clientMutationId, entity: r.entity, id: r.id, op: r.op,
              reason: r.reason, server: r.server, detectedAt: new Date().toISOString(), change: { ...src } };
            await db.conflictMove(src, conflictKey(myUserId), conflict);
          }
        } else {
          // F10：同一 IndexedDB 事务内「写入持久拒绝区 → 移出待发送队列」，
          // 失败会整体回滚（内容留在队列里下次重试），不会只删不存。
          const src = outbox.find((o) => o.clientMutationId === r.clientMutationId);
          if (src && myUserId) {
            const record = buildDeadLetter({
              userId: myUserId,
              outbox: src,
              projectId: (src.data?.projectId as string | undefined) ?? null,
              reason: r.reason ?? '服务端拒绝',
              code: r.code,
              now: new Date().toISOString(),
            });
            await db.deadLetterMove(record, (existing) => mergeDeadLetter(
              existing as DeadLetterRecord | undefined,
              record,
            ));
            nextRejections.push(record);
          } else if (src) {
            // 没有主体归属时**不得删除**待发送队列：宁可留待下轮同步，也不能静默销毁用户内容
            // （正常情况下 syncNow 已在无主体时提前返回，这里是兜底）
            set({ pending: (await db.outboxAll()).length });
          } else {
            await db.outboxDelete(r.clientMutationId);
          }
        }
      }
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
    if (isApiError(e) && [401, 403, 404].includes(e.status)) await db.kvDelete(aclKey(myUserId)).catch(() => undefined);
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
    ...pending.map((r) => ({ kind: 'pending' as const, key: r.clientMutationId, entity: r.entity, id: r.id, payload: r.data, baseUpdatedAt: r.baseUpdatedAt })),
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
  await db.conflictResolve(conflictKey(owner.userId), clientMutationId, { ...target.change, op: target.change.op as 'upsert' | 'delete', userId: owner.userId,
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
