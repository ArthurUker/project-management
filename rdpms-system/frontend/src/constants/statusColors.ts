/**
 * 项目状态色系统 — 唯一真值源（W10 对齐后端 ProjectStatus 英文枚举）
 *
 * BE（W10 路由层迁移后）返回英文枚举值；本文件以英文枚举为主键，
 * 保留中文键作为过渡 alias（存量页面直接以中文键取色不会崩溃）。
 * 渲染 label 一律走 STATUS_LABELS（中文）。
 */

// ── ProjectStatus 枚举（与 schema.prisma 逐字一致）───────────────────────────
export const PROJECT_STATUSES = [
  'PLANNING', 'IN_PROGRESS', 'PENDING_PROCESSING', 'PENDING_VERIFICATION',
  'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'CANCELLED',
] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

export const STATUS_LABELS: Record<string, string> = {
  PLANNING: '规划中',
  IN_PROGRESS: '进行中',
  PENDING_PROCESSING: '待加工',
  PENDING_VERIFICATION: '待验证',
  ON_HOLD: '暂停',
  COMPLETED: '已完成',
  ARCHIVED: '已归档',
  CANCELLED: '已取消',
  // 任务状态
  NOT_STARTED: '待开始',
  BLOCKED: '已阻塞',
  SKIPPED: '已跳过',
  // 报告状态
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  REVIEWING: '审阅中',
  NEEDS_REVISION: '需修改',
  REVIEWED: '已阅',
};

export function statusLabel(status?: string | null): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? status;
}

// ── 卡片/Badge 风格色 ─────────────────────────────────
const _STATUS_COLORS: Record<string, { color: string; bg: string; dot: string; border: string }> = {
  PLANNING: { color: '#64748b', bg: 'rgba(100,116,139,0.10)', dot: '#94a3b8', border: 'rgba(100,116,139,0.25)' },
  IN_PROGRESS: { color: '#2563eb', bg: 'rgba(37,99,235,0.10)', dot: '#3b82f6', border: 'rgba(59,130,246,0.30)' },
  PENDING_PROCESSING: { color: '#d97706', bg: 'rgba(217,119,6,0.10)', dot: '#f59e0b', border: 'rgba(245,158,11,0.30)' },
  PENDING_VERIFICATION: { color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', dot: '#8b5cf6', border: 'rgba(139,92,246,0.30)' },
  ON_HOLD: { color: '#d97706', bg: 'rgba(217,119,6,0.10)', dot: '#f59e0b', border: 'rgba(245,158,11,0.30)' },
  COMPLETED: { color: '#059669', bg: 'rgba(5,150,105,0.10)', dot: '#10b981', border: 'rgba(16,185,129,0.30)' },
  ARCHIVED: { color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', dot: '#cbd5e1', border: 'rgba(203,213,225,0.30)' },
  CANCELLED: { color: '#dc2626', bg: 'rgba(220,38,38,0.10)', dot: '#ef4444', border: 'rgba(239,68,68,0.30)' },
};
// 中文键过渡 alias（存量引用兼容）
export const STATUS_COLORS: Record<string, { color: string; bg: string; dot: string; border: string }> = {
  ..._STATUS_COLORS,
  '规划中': _STATUS_COLORS.PLANNING,
  '进行中': _STATUS_COLORS.IN_PROGRESS,
  '待加工': _STATUS_COLORS.PENDING_PROCESSING,
  '待验证': _STATUS_COLORS.PENDING_VERIFICATION,
  '已完成': _STATUS_COLORS.COMPLETED,
  '已归档': _STATUS_COLORS.ARCHIVED,
};

// ── 进度条/筛选栏风格色 ──────────────────────────────
const _STATUS_CONFIG: Record<string, { label: string; barColor: string; textColor: string; dotColor: string; borderColor: string }> = {
  PLANNING: { label: '规划中', barColor: '#9ca3af', textColor: '#6b7280', dotColor: '#9ca3af', borderColor: '#e5e7eb' },
  IN_PROGRESS: { label: '进行中', barColor: '#3b82f6', textColor: '#2563eb', dotColor: '#3b82f6', borderColor: '#bfdbfe' },
  PENDING_PROCESSING: { label: '待加工', barColor: '#f59e0b', textColor: '#d97706', dotColor: '#f59e0b', borderColor: '#fde68a' },
  PENDING_VERIFICATION: { label: '待验证', barColor: '#8b5cf6', textColor: '#7c3aed', dotColor: '#8b5cf6', borderColor: '#e9d5ff' },
  ON_HOLD: { label: '暂停', barColor: '#f59e0b', textColor: '#d97706', dotColor: '#f59e0b', borderColor: '#fde68a' },
  COMPLETED: { label: '已完成', barColor: '#10b981', textColor: '#059669', dotColor: '#10b981', borderColor: '#a7f3d0' },
  ARCHIVED: { label: '已归档', barColor: '#d1d5db', textColor: '#9ca3af', dotColor: '#d1d5db', borderColor: '#e5e7eb' },
  CANCELLED: { label: '已取消', barColor: '#ef4444', textColor: '#dc2626', dotColor: '#ef4444', borderColor: '#fecaca' },
};
export const STATUS_CONFIG: Record<string, { label: string; barColor: string; textColor: string; dotColor: string; borderColor: string }> = {
  ..._STATUS_CONFIG,
  '规划中': _STATUS_CONFIG.PLANNING,
  '进行中': _STATUS_CONFIG.IN_PROGRESS,
  '待加工': _STATUS_CONFIG.PENDING_PROCESSING,
  '待验证': _STATUS_CONFIG.PENDING_VERIFICATION,
  '已完成': _STATUS_CONFIG.COMPLETED,
  '已归档': _STATUS_CONFIG.ARCHIVED,
};

export const ALL_STATUSES = [...PROJECT_STATUSES] as unknown as readonly ProjectStatus[];

// ── 状态机：允许的迁移路径（与 BE projects.js STATUS_TRANSITIONS 一致）───────
const _STATUS_TRANSITIONS: Record<string, string[]> = {
  PLANNING: ['IN_PROGRESS', 'ARCHIVED', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_PROCESSING', 'PENDING_VERIFICATION', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'],
  PENDING_PROCESSING: ['IN_PROGRESS', 'PENDING_VERIFICATION', 'ARCHIVED'],
  PENDING_VERIFICATION: ['IN_PROGRESS', 'COMPLETED', 'ARCHIVED'],
  ON_HOLD: ['IN_PROGRESS', 'ARCHIVED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: ['PLANNING'],
  CANCELLED: [],
};
// 中文键过渡 alias
const _LEGACY_KEY_MAP: Record<string, string> = {
  '草稿': 'PLANNING', '筹备中': 'PLANNING', '规划中': 'PLANNING',
  '进行中': 'IN_PROGRESS', '待加工': 'PENDING_PROCESSING', '待验证': 'PENDING_VERIFICATION',
  '暂停': 'ON_HOLD', '已完成': 'COMPLETED', '已归档': 'ARCHIVED', '已取消': 'CANCELLED',
};
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  ..._STATUS_TRANSITIONS,
  '规划中': _STATUS_TRANSITIONS.PLANNING,
  '进行中': _STATUS_TRANSITIONS.IN_PROGRESS,
  '待加工': _STATUS_TRANSITIONS.PENDING_PROCESSING,
  '待验证': _STATUS_TRANSITIONS.PENDING_VERIFICATION,
  '已完成': _STATUS_TRANSITIONS.COMPLETED,
  '已归档': _STATUS_TRANSITIONS.ARCHIVED,
};

/** 旧中文状态 / 英文枚举 → 英文枚举 */
export function normalizeProjectStatus(status?: string | null): ProjectStatus | undefined {
  if (!status) return undefined;
  if (_STATUS_TRANSITIONS[status]) return status as ProjectStatus;
  return _LEGACY_KEY_MAP[status] as ProjectStatus | undefined;
}

/**
 * 根据当前状态返回允许迁移到的目标状态列表（包含自身，便于显示"保持不变"）
 */
export function getAllowedTransitions(currentStatus: string | undefined): string[] {
  if (!currentStatus) return [...ALL_STATUSES];
  const key = normalizeProjectStatus(currentStatus) ?? currentStatus;
  const transitions = _STATUS_TRANSITIONS[key] ?? [...ALL_STATUSES];
  return [key, ...transitions.filter((s) => s !== key)];
}

export function getStatusColor(status: string | undefined) {
  const key = normalizeProjectStatus(status) ?? status ?? '';
  return STATUS_COLORS[key] ?? STATUS_COLORS.PLANNING;
}

export function getStatusConfig(status: string | undefined) {
  const key = normalizeProjectStatus(status) ?? status ?? '';
  return STATUS_CONFIG[key] ?? STATUS_CONFIG.PLANNING;
}
