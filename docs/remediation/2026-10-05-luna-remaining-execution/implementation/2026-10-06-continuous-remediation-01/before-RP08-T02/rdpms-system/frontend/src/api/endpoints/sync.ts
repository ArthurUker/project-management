import { get, post } from '../request';

/**
 * 离线同步 v2（批次四）——协议门面
 *   init：增量拉取（业务表 updatedAt/deletedAt 派生）+ acl（可见项目/权限）供本地清除
 *   push：上行变更（clientMutationId 幂等、baseUpdatedAt 冲突检测）
 *   status / registerDevice：设备与状态
 */

export type SyncEntityKey =
  | 'projects'
  | 'projectPhases'
  | 'tasks'
  | 'milestones'
  | 'monthlyProgress'
  | 'reports'
  | 'projectMembers';

export type SyncOp = 'upsert' | 'delete';

export interface SyncChange {
  clientMutationId: string;
  entity: SyncEntityKey | string;
  op: SyncOp;
  id: string;
  data?: Record<string, unknown>;
  /** 客户端最后一次看到的服务端 updatedAt（ISO）；用于服务端冲突检测 */
  baseUpdatedAt?: string;
  projectId?: string;
  /** Explicit local causal prerequisites, not server authorization. */
  dependsOn?: string[];
  receiptHandle?: string;
  payloadHash?: string;
}

export type SyncChangeStatus = 'applied' | 'conflict' | 'rejected' | 'pending' | 'unknown' | 'expired';

export interface SyncPushResult {
  clientMutationId: string;
  entity: string;
  id: string;
  op: string;
  status: SyncChangeStatus;
  action?: string;
  reason?: string;
  /** 拒绝原因错误码（如 PERMISSION_DENIED / CONCURRENCY_BASELINE_REQUIRED） */
  code?: string;
  /** 冲突时的服务端快照（含 updatedAt） */
  server?: Record<string, unknown>;
  replayed?: boolean;
  receiptHandle?: string;
  payloadHash?: string;
  expiresAt?: string;
  result?: SyncPushResult | null;
  httpStatus?: number;
}

export interface SyncInitResponse {
  serverTime: string;
  cursor: string;
  full: boolean;
  acl: { projectIds: string[]; permissions: string[]; aclVersion: string };
  entities: string[];
  changes: Record<string, { upserts: Array<Record<string, unknown>>; tombstones: string[] }>;
  pagination?: { hasMore: boolean; nextPageToken: string | null };
}

export interface SyncStatusResponse {
  devices: Array<{
    id: string;
    label?: string | null;
    platform?: string | null;
    lastSyncAt?: string | null;
    lastPushAt?: string | null;
    createdAt?: string;
  }>;
  mutations: number;
  conflicts: number;
  serverTime: string;
}

export const syncAPI = {
  init: (params: { since?: string; deviceId: string; deviceLabel?: string; platform?: string; paginationVersion?: 1; pageToken?: string }) =>
    get<SyncInitResponse>('/sync/init', { params } as never),

  push: (payload: { deviceId: string; deviceLabel?: string; platform?: string; changes: SyncChange[] }) =>
    post<{ serverTime: string; results: SyncPushResult[]; conflictCount: number }>('/sync/push', { protocolVersion: 1, ...payload }),

  reserve: (payload: { protocolVersion: 1; deviceId: string; changes: SyncChange[] }) =>
    post<{ protocolVersion: 1; results: SyncPushResult[] }>('/sync/receipts/reserve', payload),
  query: (payload: { protocolVersion: 1; deviceId: string; changes: SyncChange[] }) =>
    post<{ protocolVersion: 1; results: SyncPushResult[] }>('/sync/receipts/query', payload),

  registerDevice: (payload: { deviceId: string; label?: string; platform?: string }) =>
    post<{ id: string }>('/sync/device', payload),

  status: () => get<SyncStatusResponse>('/sync/status'),
};
