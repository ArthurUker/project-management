import { syncAPI, toMessage } from '@/api';
import type { SyncChange, SyncInitResponse, SyncPushResult } from '@/api';
import { safeStorage } from '@/utils/safeStorage';
import { idb } from './idb';
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
let currentUserId: string | null = null;
/** A03：会话代次——账号切换/登出即自增，使在途同步（含已发出的请求）整体作废 */
let sessionGen = 0;
let started = false;
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
  const ua = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  return { deviceLabel: ua ? ua.slice(0, 120) : undefined, platform: navigator.platform };
}

async function refreshPending() {
  set({ pending: (await idb.outboxAll()).length });
}

/** 本地变更入队（离线写入唯一入口）；在线时立即触发同步 */
export async function enqueueChange(change: SyncChange): Promise<void> {
  // A03：入队时标记主体归属——登出切换账号时不得把 A 的未同步内容并入 B
  const row: OutboxRecord = {
    ...change,
    createdAt: new Date().toISOString(),
    userId: currentUserId ?? undefined,
  };
  await idb.outboxPut(row);
  await refreshPending();
  if (state.online) void syncNow();
}

/** 一轮同步的会话快照：主体与代次在**发起时**固定，回包一律按它校验 */
interface SyncSession {
  userId: string | null;
  isStale: () => boolean;
}

async function applyPull(res: SyncInitResponse, session: SyncSession, commitCursor = true): Promise<void> {
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
  if (session.isStale()) return;
  await idb.recordsDeleteMany(tombstoneKeys);
  if (session.isStale()) return;

  // ACL 变化：清除不再可见项目的本地数据（权限回收后本地不可残留）
  const aclKeyForSession = aclKey(session.userId);
  const prevAcl = await idb.kvGet<{ aclVersion: string }>(aclKeyForSession);
  if (session.isStale()) return;
  if (!prevAcl || prevAcl.aclVersion !== res.acl.aclVersion) {
    const visible = new Set(res.acl.projectIds);
    const all = await idb.recordsAll();
    if (session.isStale()) return;
    const purge = all
      .filter((r) => {
        const scope = PROJECT_SCOPED[r.entity];
        if (!scope) return false;
        const pid = scope === 'self' ? r.id : String(r.projectId ?? '');
        return pid ? !visible.has(pid) : false;
      })
      .map((r) => r.key);
    await idb.recordsDeleteMany(purge);
    if (session.isStale()) return;
    await idb.kvSet(aclKeyForSession, {
      aclVersion: res.acl.aclVersion,
      projectIds: res.acl.projectIds,
      permissions: res.acl.permissions,
    });
  }
  if (session.isStale()) return;
  if (commitCursor) await idb.kvSet(cursorKey(session.userId), res.cursor);
}

export async function syncNow(): Promise<void> {
  if (state.syncing || !state.online) return;
  // A03：没有绑定主体时**不得同步**——否则服务端拒绝的回包会被当成「无主变更」直接丢弃，
  // 用户未提交的内容就被静默销毁了（F10 浏览器验收实测到的路径）
  if (!currentUserId) return;
  set({ syncing: true, lastError: null });
  const deviceId = getDeviceId();
  // A03：本轮同步绑定「发起时的主体 + 会话代次」。之后任何异步回包、落盘、状态写入
  // 都必须校验代次未变——账号切换后到达的旧响应不得写入新账号命名空间（原 Q7 缺陷）。
  const myGen = sessionGen;
  const myUserId = currentUserId;
  const isStale = () => myGen !== sessionGen;
  const session: SyncSession = { userId: myUserId, isStale };
  try {
    const since = await idb.kvGet<string>(cursorKey(myUserId));
    const firstPull = await transport.init({
      since: since || undefined,
      deviceId,
      paginationVersion: 1,
      ...deviceMeta(),
    });
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

    const outbox = await idb.outboxAll();
    const nextConflicts: ConflictRecord[] = [];
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
          } else if (src) {
            // 没有主体归属时**不得删除**待发送队列：宁可留待下轮同步，也不能静默销毁用户内容
            // （正常情况下 syncNow 已在无主体时提前返回，这里是兜底）
            set({ pending: (await idb.outboxAll()).length });
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
    await idb.kvSet(conflictKey(myUserId), merged);
    if (isStale()) return;
    set({
      lastSyncAt: res.serverTime,
      pending: (await idb.outboxAll()).length,
      conflicts: merged,
      // 拒绝区读取也必须按**发起时主体**，不能读当前账号（否则会把 A 的内容显示给 B）
      rejections: myUserId
        ? (await idb.deadLettersForUser(myUserId)) as DeadLetterRecord[]
        : [],
    });
  } catch (e) {
    if (isStale()) return; // A03：旧会话的失败不得污染当前账号状态
    set({ lastError: toMessage(e, '同步失败') });
  } finally {
    // A03：旧会话不得改写新会话的「同步中」标志（否则会把当前账号的同步卡住或提前放行）
    if (!isStale()) set({ syncing: false });
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
  await idb.kvSet(conflictKey(currentUserId), rest);
  set({ conflicts: rest });
  if (resolution === 'local' && state.online) void syncNow();
}

/**
 * A09：把一条被拒绝的变更重新入队（用户点击「重试」）。
 * - 复用**原 clientMutationId 与原 payload/基线**（不是新操作，服务端可回执去重）；
 * - 是否真的允许写入由服务端在本次上行中按**当前权限与基线**重新判定；
 * - 只有成功移出拒绝区后才从本地删除该记录。
 */
export async function retryRejection(clientMutationId: string): Promise<boolean> {
  const uid = currentUserId;
  if (!uid) return false;
  const record = await getRejectedPayload(clientMutationId);
  if (!record) return false;
  await idb.outboxPut({ ...toOutboxRecord(record), userId: uid });
  await idb.deadLetterDelete(deadLetterKey(uid, clientMutationId));
  await restoreDeadLetters();
  await refreshPending();
  if (state.online) void syncNow();
  return true;
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
  const conflicts = (await idb.kvGet<ConflictRecord[]>(conflictKey(currentUserId))) ?? [];
  const cursor = await idb.kvGet<string>(cursorKey(currentUserId));
  set({
    conflicts,
    pending: (await idb.outboxAll()).length,
    lastSyncAt: cursor ?? null,
    online: isOnline(),
  });
}

export async function start(userId?: string): Promise<void> {
  const nextUserId = userId ?? currentUserId;
  // A03：账号切换（即使未经过登出）同样必须作废在途同步，并解除上一会话遗留的「同步中」标志
  const switched = nextUserId !== currentUserId;
  currentUserId = nextUserId;
  const myGen = ++sessionGen; // 新会话：使上一账号的在途同步整体作废
  if (started && !switched) return; // 同一账号重复调用：幂等，不重复挂监听
  if (started) set({ syncing: false });
  started = true;
  void hydrate();
  // F10：恢复本账户的持久拒绝区（刷新/重新登录后内容不丢）
  await restoreDeadLetters();
  // A03：期间若又发生切换（或登出），本次启动的尾段不得再挂监听/触发同步
  if (sessionGen !== myGen) return;
  // A03：把上一账号残留在队列里的变更按原主体留存，绝不由本账号代发
  await isolateForeignOutbox(nextUserId);
  if (sessionGen !== myGen) return;
  if (!listenersAttached) {
    listenersAttached = true;
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    timer = window.setInterval(() => {
      if (state.online) void syncNow();
    }, SYNC_INTERVAL_MS);
  }
  if (state.online) void syncNow();
}

function onOnline() {
  set({ online: true });
  void syncNow();
}
function onOffline() {
  set({ online: false });
}

/**
 * 退出登录前：把该主体的未同步变更转入持久拒绝区（同一 IndexedDB 事务内「写入 → 出队」）。
 * 未标记主体的历史行视为当前登出账户所有（本设备只有其在用），一并保留。
 */
async function preservePendingForUser(userId: string | null): Promise<number> {
  const rows = await idb.outboxAll();
  if (!rows.length) return 0;
  const mine = rows.filter((r) => !r.userId || r.userId === userId);
  const owner = userId ?? 'anonymous';
  for (const row of mine) {
    const record = buildDeadLetter({
      userId: owner,
      outbox: row,
      projectId: (row.data?.projectId as string | undefined) ?? null,
      reason: '退出登录时仍未同步（内容已保留，重新登录后可重试）',
      code: 'LOGOUT_UNSYNCED',
      now: new Date().toISOString(),
    });
    await idb.deadLetterMove(record, (existing) => mergeDeadLetter(
      existing as DeadLetterRecord | undefined,
      record,
    ));
  }
  return mine.length;
}

export function stop(): void {
  if (!started) return;
  started = false;
  if (listenersAttached) {
    listenersAttached = false;
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  }
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
}

/**
 * 退出登录：清空本地镜像与分片键（共享设备安全）。
 *
 * A03：**不得静默销毁用户未提交的内容**——outbox 里还没同步出去的变更必须先转入
 * 该账户的持久拒绝区（重新登录后仍可恢复/重试），然后才清空队列。
 */
export async function resetOnLogout(): Promise<void> {
  // A03（浏览器验收实测的竞态）：状态切换必须在**任何 await 之前**同步完成。
  // 否则「退出 → 立刻登录」时，登出的异步尾段会把新账号刚设好的主体覆盖成 null，
  // 后续同步就成了无主同步 —— 服务端拒绝的回包会被当成无主变更丢弃（用户内容静默消失）。
  const uidAtLogout = currentUserId;
  const genAtLogout = ++sessionGen; // A03：登出使在途请求与回包全部作废
  stop();
  currentUserId = null;
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

  // 存储清理按**登出时的主体**执行，且只在会话未被新账号接管时进行
  // （新会话已开始写入时，清空会误删它刚写入的数据）
  if (sessionGen !== genAtLogout) return;
  await preservePendingForUser(uidAtLogout);
  if (sessionGen !== genAtLogout) return;
  // 注意：clearAll 不清空持久拒绝区（那是用户尚未取回的内容，重新登录同一账户需恢复）
  await idb.clearAll(uidAtLogout); // A03：只清理当前主体的分片键
}

/**
 * A03：新会话开始时隔离队列中的**他人**变更——
 * 「退出 → 立刻登录」可能让上一个账号的清理来不及执行，此时它的未同步行仍留在队列里。
 * 这些行绝不能由新账号代发（会被当成新账号的变更），必须按**原主体**转入其持久拒绝区。
 */
async function isolateForeignOutbox(userId: string | null): Promise<void> {
  const rows = await idb.outboxAll();
  const foreign = rows.filter((r) => r.userId && r.userId !== userId);
  for (const row of foreign) {
    const record = buildDeadLetter({
      userId: String(row.userId),
      outbox: row,
      projectId: (row.data?.projectId as string | undefined) ?? null,
      reason: '账号切换时仍未同步（已按原主体留存，重新登录后可重试）',
      code: 'ACCOUNT_SWITCHED',
      now: new Date().toISOString(),
    });
    await idb.deadLetterMove(record, (existing) => mergeDeadLetter(
      existing as DeadLetterRecord | undefined,
      record,
    ));
  }
}
