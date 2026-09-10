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
}

export type SyncChangeStatus = 'applied' | 'conflict' | 'rejected';

export interface SyncPushResult {
  clientMutationId: string;
  entity: string;
  id: string;
  op: string;
  status: SyncChangeStatus;
  action?: string;
  reason?: string;
  /** 冲突时的服务端快照（含 updatedAt） */
  server?: Record<string, unknown>;
  replayed?: boolean;
}

export interface SyncInitResponse {
  serverTime: string;
  cursor: string;
  full: boolean;
  acl: { projectIds: string[]; permissions: string[]; aclVersion: string };
  entities: string[];
  changes: Record<string, { upserts: Array<Record<string, unknown>>; tombstones: string[] }>;
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
  init: (params: { since?: string; deviceId: string; deviceLabel?: string; platform?: string }) =>
    get<SyncInitResponse>('/sync/init', { params } as never),

  push: (payload: { deviceId: string; deviceLabel?: string; platform?: string; changes: SyncChange[] }) =>
    post<{ serverTime: string; results: SyncPushResult[]; conflictCount: number }>('/sync/push', payload),

  registerDevice: (payload: { deviceId: string; label?: string; platform?: string }) =>
    post<{ id: string }>('/sync/device', payload),

  status: () => get<SyncStatusResponse>('/sync/status'),
};
