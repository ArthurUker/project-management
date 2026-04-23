/**
 * 项目状态色系统 — 唯一真值源
 * 统一 ProjectCard / Projects / EditProjectModal 的状态色与允许迁移规则
 */

// ── 卡片/Badge 风格色 ─────────────────────────────────
export const STATUS_COLORS: Record<string, {
  color: string;
  bg: string;
  dot: string;
  border: string;
}> = {
  '筹备中': { color: '#64748b', bg: 'rgba(100,116,139,0.10)', dot: '#94a3b8',  border: 'rgba(100,116,139,0.25)' },
  '规划中': { color: '#64748b', bg: 'rgba(100,116,139,0.10)', dot: '#94a3b8',  border: 'rgba(100,116,139,0.25)' },
  '进行中': { color: '#2563eb', bg: 'rgba(37,99,235,0.10)',   dot: '#3b82f6',  border: 'rgba(59,130,246,0.30)'  },
  '待加工': { color: '#d97706', bg: 'rgba(217,119,6,0.10)',   dot: '#f59e0b',  border: 'rgba(245,158,11,0.30)'  },
  '待验证': { color: '#7c3aed', bg: 'rgba(124,58,237,0.10)',  dot: '#8b5cf6',  border: 'rgba(139,92,246,0.30)'  },
  '已完成': { color: '#059669', bg: 'rgba(5,150,105,0.10)',   dot: '#10b981',  border: 'rgba(16,185,129,0.30)'  },
  '已归档': { color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', dot: '#cbd5e1',  border: 'rgba(203,213,225,0.30)' },
};

// ── 进度条/筛选栏风格色 ──────────────────────────────
export const STATUS_CONFIG: Record<string, {
  label: string;
  barColor: string;
  textColor: string;
  dotColor: string;
  borderColor: string;
}> = {
  '规划中': { label: '规划中', barColor: '#9ca3af', textColor: '#6b7280',  dotColor: '#9ca3af', borderColor: '#e5e7eb' },
  '进行中': { label: '进行中', barColor: '#3b82f6', textColor: '#2563eb',  dotColor: '#3b82f6', borderColor: '#bfdbfe' },
  '待加工': { label: '待加工', barColor: '#f59e0b', textColor: '#d97706',  dotColor: '#f59e0b', borderColor: '#fde68a' },
  '待验证': { label: '待验证', barColor: '#8b5cf6', textColor: '#7c3aed',  dotColor: '#8b5cf6', borderColor: '#e9d5ff' },
  '已完成': { label: '已完成', barColor: '#10b981', textColor: '#059669',  dotColor: '#10b981', borderColor: '#a7f3d0' },
  '已归档': { label: '已归档', barColor: '#d1d5db', textColor: '#9ca3af',  dotColor: '#d1d5db', borderColor: '#e5e7eb' },
};

export const ALL_STATUSES = ['规划中', '进行中', '待加工', '待验证', '已完成', '已归档'] as const;
export type ProjectStatus = typeof ALL_STATUSES[number];

// ── 状态机：允许的迁移路径 ────────────────────────────
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  '规划中': ['进行中', '已归档'],
  '进行中': ['待加工', '待验证', '已完成', '已归档'],
  '待加工': ['进行中', '待验证', '已归档'],
  '待验证': ['进行中', '已完成', '已归档'],
  '已完成': ['已归档'],
  '已归档': ['规划中'],
};

/**
 * 根据当前状态返回允许迁移到的目标状态列表（包含自身，便于显示"保持不变"）
 */
export function getAllowedTransitions(currentStatus: string | undefined): string[] {
  if (!currentStatus) return [...ALL_STATUSES];
  const transitions = STATUS_TRANSITIONS[currentStatus] ?? [...ALL_STATUSES];
  // 始终包含当前状态本身，避免"无法保存原状态"的问题
  return [currentStatus, ...transitions.filter(s => s !== currentStatus)];
}

export function getStatusColor(status: string | undefined) {
  return STATUS_COLORS[status ?? ''] ?? STATUS_COLORS['规划中'];
}
