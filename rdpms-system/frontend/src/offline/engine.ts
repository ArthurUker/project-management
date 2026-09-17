import { syncAPI, toMessage } from '@/api';
import type { SyncChange, SyncInitResponse } from '@/api';
import { safeStorage } from '@/utils/safeStorage';
import { idb } from './idb';
import {
  buildDeadLetter,
  mergeDeadLetter,
  deadLetterKey,
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

/** A03：本地缓存键按主体分片——不同账号不得共享游标 / ACL 快照 / 冲突记录 */
function scopedKey(base: string, userId: string | null): string {
  return `${base}:${userId ?? 'anonymous'}`;
}
const cursorKey = () => scopedKey(CURSOR_KEY, currentUserId);
const aclKey = () => scopedKey(ACL_KEY, currentUserId);
const conflictKey = () => scopedKey(CONFLICT_KEY, currentUserId);
const SYNC_INTERVAL_MS = 60_000;

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
let currentUserId: string | null = null;
/** A03：会话代次——账号切换/登出即自增，使在途同步（含已发出的请求）整体作废 */
let sessionGen = 0;
let started = false;

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
  const all = await idb.recordsAll();
  return all.filter((r) => r.entity === entity);
}

/** 生成幂等键（clientMutationId）；同一变更重放不会重复写库 */
export function newClientMutationId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDeviceId(): string {
  let id = safeStorage.get(DEVICE_KEY);
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}`;
    safeStorage.set(DEVICE_KEY, id);
  }
  return id;
}

function deviceMeta() {
  if (typeof navigator === 'undefined') return { deviceLabel: undefined, platform: undefined };
  return { deviceLabel: navigator.userAgent.slice(0, 120), platform: navigator.platform };
}

async function refreshPending() {
  set({ pending: (await idb.outboxAll()).length });
}

/** 本地变更入队（离线写入唯一入口）；在线时立即触发同步 */
export async function enqueueChange(change: SyncChange): Promise<void> {
  const row: OutboxRecord = { ...change, createdAt: new Date().toISOString() };
  await idb.outboxPut(row);
  await refreshPending();
  if (state.online) void syncNow();
}

async function applyPull(res: SyncInitResponse): Promise<void> {
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
  await idb.recordsPutMany(upserts);
  await idb.recordsDeleteMany(tombstoneKeys);

  // ACL 变化：清除不再可见项目的本地数据（权限回收后本地不可残留）
  const prevAcl = await idb.kvGet<{ aclVersion: string }>(aclKey());
  if (!prevAcl || prevAcl.aclVersion !== res.acl.aclVersion) {
    const visible = new Set(res.acl.projectIds);
    const all = await idb.recordsAll();
    const purge = all
      .filter((r) => {
        const scope = PROJECT_SCOPED[r.entity];
        if (!scope) return false;
        const pid = scope === 'self' ? r.id : String(r.projectId ?? '');
        return pid ? !visible.has(pid) : false;
      })
      .map((r) => r.key);
    await idb.recordsDeleteMany(purge);
    await idb.kvSet(aclKey(), {
      aclVersion: res.acl.aclVersion,
      projectIds: res.acl.projectIds,
      permissions: res.acl.permissions,
    });
  }
  await idb.kvSet(cursorKey(), res.cursor);
}

export async function syncNow(): Promise<void> {
  if (state.syncing || !state.online) return;
  set({ syncing: true, lastError: null });
  const deviceId = getDeviceId();
  // A03：本轮同步绑定「发起时的主体 + 会话代次」。之后任何异步回包、落盘、状态写入
  // 都必须校验代次未变——账号切换后到达的旧响应不得写入新账号命名空间（原 Q7 缺陷）。
  const myGen = sessionGen;
  const myUserId = currentUserId;
  const isStale = () => myGen !== sessionGen;
  try {
    const since = await idb.kvGet<string>(cursorKey());
    const res = await syncAPI.init({
      since: since || undefined,
      deviceId,
      ...deviceMeta(),
    });
    if (isStale()) return; // 旧会话的拉取结果不得落盘
    await applyPull(res);

    const outbox = await idb.outboxAll();
    const nextConflicts: ConflictRecord[] = [];
    const nextRejections: DeadLetterRecord[] = [];
    if (outbox.length) {
      const { results } = await syncAPI.push({
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
        if (r.status === 'applied') {
          await idb.outboxDelete(r.clientMutationId);
        } else if (r.status === 'conflict') {
          await idb.outboxDelete(r.clientMutationId);
          const src = outbox.find((o) => o.clientMutationId === r.clientMutationId);
          if (src) {
            nextConflicts.push({
              clientMutationId: r.clientMutationId,
              entity: r.entity,
              id: r.id,
              op: r.op,
              reason: r.reason,
              server: r.server,
              detectedAt: new Date().toISOString(),
              change: {
                clientMutationId: src.clientMutationId,
                entity: src.entity,
                op: src.op,
                id: src.id,
                data: src.data,
              },
            });
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
            await idb.deadLetterMove(record, (existing) => mergeDeadLetter(
              existing as DeadLetterRecord | undefined,
              record,
            ));
            nextRejections.push(record);
          } else {
            await idb.outboxDelete(r.clientMutationId);
          }
        }
      }
    }

    const merged = [
      ...state.conflicts.filter((c) => !nextConflicts.some((n) => n.clientMutationId === c.clientMutationId)),
      ...nextConflicts,
    ];
    if (isStale()) return; // 旧会话不得写入冲突记录与状态
    await idb.kvSet(conflictKey(), merged);
    set({
      lastSyncAt: res.serverTime,
      pending: (await idb.outboxAll()).length,
      conflicts: merged,
      rejections: (await idb.deadLettersForUser(currentUserId ?? '')) as DeadLetterRecord[],
    });
  } catch (e) {
    if (isStale()) return; // A03：旧会话的失败不得污染当前账号状态
    set({ lastError: toMessage(e, '同步失败') });
  } finally {
    set({ syncing: false });
  }
}

/** 冲突处置：server=采用服务端（丢弃本地）；local=以服务端时间为基线重推本地版本 */
export async function resolveConflict(clientMutationId: string, resolution: 'server' | 'local'): Promise<void> {
  const target = state.conflicts.find((c) => c.clientMutationId === clientMutationId);
  if (!target) return;
  if (resolution === 'local') {
    const base = (target.server?.updatedAt as string | undefined) ?? target.change.baseUpdatedAt;
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cm-${Date.now()}`;
    await enqueueChange({ ...target.change, clientMutationId: newId, baseUpdatedAt: base });
  }
  const rest = state.conflicts.filter((c) => c.clientMutationId !== clientMutationId);
  await idb.kvSet(conflictKey(), rest);
  set({ conflicts: rest });
  if (resolution === 'local' && state.online) void syncNow();
}

export function clearRejections(): void {
  const uid = currentUserId;
  set({ rejections: [] });
  if (uid) void idb.deadLettersClearForUser(uid);
}

/** 从持久拒绝区恢复（进入应用/登录后调用） */
export async function restoreDeadLetters(): Promise<void> {
  if (!currentUserId) return;
  const rows = (await idb.deadLettersForUser(currentUserId)) as DeadLetterRecord[];
  set({ rejections: rows });
}

/** 取回一条被拒绝的变更内容（用户复制/另存），跨刷新可用 */
export async function getRejectedPayload(
  clientMutationId: string,
): Promise<DeadLetterRecord | undefined> {
  if (!currentUserId) return undefined;
  const rows = (await idb.deadLettersForUser(currentUserId)) as DeadLetterRecord[];
  return rows.find((r) => r.clientMutationId === clientMutationId);
}

/** 删除一条拒绝记录（用户明确放弃该变更） */
export async function dropRejection(clientMutationId: string): Promise<void> {
  if (!currentUserId) return;
  await idb.deadLetterDelete(deadLetterKey(currentUserId, clientMutationId));
  await restoreDeadLetters();
}

export async function hydrate(): Promise<void> {
  const conflicts = (await idb.kvGet<ConflictRecord[]>(conflictKey())) ?? [];
  const cursor = await idb.kvGet<string>(cursorKey());
  set({
    conflicts,
    pending: (await idb.outboxAll()).length,
    lastSyncAt: cursor ?? null,
    online: isOnline(),
  });
}

export async function start(userId?: string): Promise<void> {
  currentUserId = userId ?? currentUserId;
  sessionGen += 1; // 新会话：使上一账号的在途同步作废
  if (started) return;
  started = true;
  void hydrate();
  // F10：恢复本账户的持久拒绝区（刷新/重新登录后内容不丢）
  await restoreDeadLetters();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  timer = window.setInterval(() => {
    if (state.online) void syncNow();
  }, SYNC_INTERVAL_MS);
  if (state.online) void syncNow();
}

function onOnline() {
  set({ online: true });
  void syncNow();
}
function onOffline() {
  set({ online: false });
}

export function stop(): void {
  if (!started) return;
  started = false;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
}

/** 退出登录：清空本地镜像与队列（共享设备安全） */
export async function resetOnLogout(): Promise<void> {
  stop();
  // 注意：clearAll 不清空持久拒绝区（那是用户尚未取回的内容，重新登录同一账户需恢复）
  const uidAtLogout = currentUserId;
  await idb.clearAll(uidAtLogout); // A03：只清理当前主体的分片键
  currentUserId = null;
  sessionGen += 1; // A03：登出使在途请求与回包全部作废
  state = {
    online: isOnline(),
    syncing: false,
    lastSyncAt: null,
    lastError: null,
    pending: 0,
    conflicts: [],
    rejections: [],
  };
  emit();
}
