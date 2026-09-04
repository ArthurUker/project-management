import { get, post, requestPaged } from '../request';
import type { DictMap, EnumMeta } from '../../types/dict';

/**
 * 审计日志契约（对齐 BE M-1 实现）：
 *   action 为 19 项动词/事件（create / login.failed / status.change ...），
 *   展示标签走 /api/dict 的 EnumMeta('AuditAction')。
 */
export interface AuditLog {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  before: unknown;
  after: unknown;
  changedFields: string[];
  /** elevated / override / breakGlass / permissionCode 等审计上下文 */
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  actor?: { id: string; displayName: string; username: string } | null;
}

export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface EntityAuditSummary {
  entityType: string;
  entityId: string;
  total: number;
  byAction: { action: string; count: number }[];
  firstSeenAt: string | null;
  firstSeenBy: string | null;
  lastSeenAt: string | null;
  lastSeenBy: string | null;
}

export const auditLogsAPI = {
  /** 审计日志：只追加，前端不提供任何修改入口。权限 audit.view */
  list: (params?: AuditLogQuery) =>
    requestPaged<AuditLog>({ method: 'GET', url: '/audit-logs', params }),
  /** 权限 audit.export（ADMIN 无此权限，仅 SUPER_ADMIN / AUDITOR 可导出） */
  export: (params?: AuditLogQuery) =>
    post<{ exportedAt: string; count: number; items: AuditLog[] }>('/audit-logs/export', params),
  /** AUDITOR 合规下钻唯一通道（audit.view） */
  entitySummary: (entityType: string, entityId: string) =>
    get<EntityAuditSummary>(`/audit/entity/${entityType}/${entityId}/summary`),
};

export interface SystemLog {
  id: string;
  level: string;
  category: string | null;
  action: string;
  message: string | null;
  context: Record<string, unknown> | null;
  userId: string | null;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
  user?: { id: string; displayName: string; username: string } | null;
}

export interface SystemLogQuery {
  page?: number;
  pageSize?: number;
  level?: string;
  category?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const systemLogsAPI = {
  /** 权限 system.logs.view（SUPER_ADMIN / AUDITOR；ADMIN 403） */
  list: (params?: SystemLogQuery) =>
    requestPaged<SystemLog>({ method: 'GET', url: '/system-logs', params }),
};

/** 枚举展示字典：DB 存英文 value，UI 显示中文 label */
export const dictAPI = {
  all: () => get<{ enums: DictMap }>('/dict'),
  byName: (enumName: string) => get<EnumMeta[]>(`/dict/${enumName}`),
};

export const healthAPI = {
  liveness: () => get<{ status: string }>('/health'),
  readiness: () => get<{ ready: boolean; db: string }>('/ready'),
};
