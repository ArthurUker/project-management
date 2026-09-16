/**
 * offline/deadLetter.ts —— 被服务端拒绝的离线变更（持久拒绝区）纯逻辑（F10）
 *
 * 为什么必须持久化：
 *   拒绝（rejected）与冲突（conflict）不同——冲突可以重新合并，拒绝意味着这条变更
 *   **服务端永远不会接受**（权限不足、跨项目、锁定、校验失败等）。若只在内存里提示，
 *   用户刷新/换设备/重新登录后，他填过的内容就永久丢失。
 *
 * 设计要点：
 *   - 按账户隔离：key = `${userId}:${clientMutationId}`，读取时再按 userId 过滤（双保险）；
 *   - 保留原始 payload、拒绝原因、用户与项目归属、操作身份（幂等键 + 基线）；
 *   - 重复拒绝同一条变更时**不丢内容**：保留最早的 payload，累加 attempts 并更新原因。
 */
import type { OutboxRecord } from './idb';

export interface DeadLetterRecord {
  /** `${userId}:${clientMutationId}` */
  key: string;
  userId: string;
  projectId: string | null;
  entity: string;
  op: 'upsert' | 'delete';
  id: string;
  /** 操作身份：幂等键（重试同一操作时不变） */
  clientMutationId: string;
  /** 原始提交内容（一字不改地保留） */
  payload?: Record<string, unknown>;
  baseUpdatedAt?: string;
  /** 服务端给出的拒绝原因与错误码 */
  reason: string;
  code?: string;
  /** 首次被拒绝的时间 */
  firstRejectedAt: string;
  /** 最近一次被拒绝的时间 */
  lastRejectedAt: string;
  /** 被拒绝次数（用于提示“同一条变更反复失败”） */
  attempts: number;
}

export function deadLetterKey(userId: string, clientMutationId: string): string {
  return `${userId}:${clientMutationId}`;
}

/** 归属读取：只有本人能看到自己的草稿（不同账户隔离） */
export function isVisibleTo(record: Pick<DeadLetterRecord, 'userId'>, userId: string | null): boolean {
  if (!userId) return false;
  return record.userId === userId;
}

export function buildDeadLetter(params: {
  userId: string;
  outbox: Pick<OutboxRecord, 'clientMutationId' | 'entity' | 'op' | 'id' | 'data' | 'baseUpdatedAt'>;
  projectId?: string | null;
  reason: string;
  code?: string;
  now: string;
}): DeadLetterRecord {
  const { userId, outbox, projectId = null, reason, code, now } = params;
  return {
    key: deadLetterKey(userId, outbox.clientMutationId),
    userId,
    projectId,
    entity: outbox.entity,
    op: outbox.op,
    id: outbox.id,
    clientMutationId: outbox.clientMutationId,
    payload: outbox.data,
    baseUpdatedAt: outbox.baseUpdatedAt,
    reason,
    code,
    firstRejectedAt: now,
    lastRejectedAt: now,
    attempts: 1,
  };
}

/**
 * 重复拒绝合并：保留最早的 payload 与首次时间，累加次数并刷新原因。
 * 任何情况下都不得用新记录覆盖掉旧内容（旧内容可能更完整）。
 */
export function mergeDeadLetter(
  prev: DeadLetterRecord | undefined,
  next: DeadLetterRecord,
): DeadLetterRecord {
  if (!prev) return next;
  return {
    ...prev,
    reason: next.reason,
    code: next.code ?? prev.code,
    lastRejectedAt: next.lastRejectedAt,
    attempts: prev.attempts + 1,
    payload: next.payload ?? prev.payload,
  };
}

/** 从拒绝记录重建一条可再次入队的变更（用户“重试/复制出来”用） */
export function toOutboxRecord(record: DeadLetterRecord, now = new Date().toISOString()): OutboxRecord {
  return {
    clientMutationId: record.clientMutationId,
    entity: record.entity,
    op: record.op,
    id: record.id,
    data: record.payload,
    baseUpdatedAt: record.baseUpdatedAt,
    createdAt: now,
  };
}
