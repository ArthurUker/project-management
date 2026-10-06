/** Shared project status command guards for HTTP and offline-sync entry points. */
import { badRequest } from '../../kernel/http.js';
import {
  assertActionPermission,
  assertProjectCapability,
  type AuthActor,
  type ProjectAccess,
} from '../access/writeGuards.js';

export const PROJECT_STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  PLANNING: ['IN_PROGRESS', 'ARCHIVED', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_PROCESSING', 'PENDING_VERIFICATION', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'],
  PENDING_PROCESSING: ['IN_PROGRESS', 'PENDING_VERIFICATION', 'ARCHIVED'],
  PENDING_VERIFICATION: ['IN_PROGRESS', 'COMPLETED', 'ARCHIVED'],
  ON_HOLD: ['IN_PROGRESS', 'ARCHIVED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: ['PLANNING'],
  CANCELLED: [],
});

const PROJECT_STATUS_VALUES = new Set(Object.keys(PROJECT_STATUS_TRANSITIONS));
const LEGACY_PROJECT_STATUS: Readonly<Record<string, string>> = Object.freeze({
  '草稿': 'PLANNING',
  '规划中': 'PLANNING',
  '进行中': 'IN_PROGRESS',
  '待加工': 'PENDING_PROCESSING',
  '待验证': 'PENDING_VERIFICATION',
  '暂停': 'ON_HOLD',
  '已完成': 'COMPLETED',
  '已归档': 'ARCHIVED',
  '已取消': 'CANCELLED',
});

export function normalizeProjectStatus(value: unknown): string {
  if (typeof value !== 'string') return '';
  return LEGACY_PROJECT_STATUS[value] ?? value;
}

/**
 * Apply one authorization/state-machine rule set across HTTP and sync.
 * Project status requires projects.update plus project transition capability;
 * entering ARCHIVED additionally requires the distinct projects.archive action.
 */
export function assertProjectStatusTransition({
  actor,
  access,
  currentStatus,
  nextStatus,
}: {
  actor: AuthActor;
  access: ProjectAccess;
  currentStatus: string;
  nextStatus: unknown;
}): string {
  const normalized = normalizeProjectStatus(nextStatus);
  if (!PROJECT_STATUS_VALUES.has(normalized)) {
    throw badRequest('INVALID_STATUS', '项目状态无效', { currentStatus, nextStatus });
  }
  assertActionPermission(actor, 'projects.update');
  if (normalized === currentStatus) return normalized;
  assertProjectCapability(access, 'transition', 'projects.update');
  if (normalized === 'ARCHIVED') assertActionPermission(actor, 'projects.archive');

  const allowed = PROJECT_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(normalized)) {
    throw badRequest('INVALID_STATUS_TRANSITION', `状态不可从 ${currentStatus} 变更为 ${normalized}`, {
      current: currentStatus,
      allowedTransitions: [...allowed],
    });
  }
  return normalized;
}
