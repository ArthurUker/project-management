/**
 * 权限系统工具 — 统一替换散落的 role === 'admin' 判断
 *
 * 使用方式（React 组件内）：
 *   const canEdit = useHasPerm(PERMS.PROJECTS_EDIT);
 *
 * 使用方式（组件外 / 条件渲染）：
 *   if (hasPerm(user, PERMS.USERS_MANAGE)) { ... }
 */

import { useAppStore } from '../store/appStore';

// ── 权限码常量 ────────────────────────────────────────
export const PERMS = {
  // 项目管理
  PROJECTS_CREATE:         'projects.create',
  PROJECTS_EDIT:           'projects.edit',
  PROJECTS_DELETE:         'projects.delete',
  PROJECTS_UPDATE_STATUS:  'projects.update_status',
  PROJECTS_MANAGE_MEMBERS: 'projects.manage_members',
  // 任务管理
  TASKS_CREATE:            'tasks.create',
  TASKS_UPDATE_STATUS:     'tasks.update_status',
  TASKS_DELETE:            'tasks.delete',
  // 成员管理（管理后台）
  USERS_MANAGE:            'users.manage',
  // 模版
  TEMPLATES_CREATE:        'templates.create',
  TEMPLATES_EDIT:          'templates.edit',
} as const;

export type PermCode = typeof PERMS[keyof typeof PERMS];

// ── 角色权限映射（当后端未返回 permissions 字段时的回退） ──
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: Object.values(PERMS),
  manager: [
    PERMS.PROJECTS_CREATE,
    PERMS.PROJECTS_EDIT,
    PERMS.PROJECTS_UPDATE_STATUS,
    PERMS.PROJECTS_MANAGE_MEMBERS,
    PERMS.TASKS_CREATE,
    PERMS.TASKS_UPDATE_STATUS,
    PERMS.TASKS_DELETE,
    PERMS.TEMPLATES_EDIT,
  ],
  member: [
    PERMS.TASKS_CREATE,
    PERMS.TASKS_UPDATE_STATUS,
  ],
};

// ── 工具函数（可在组件外使用，传入 user 对象） ──────────
export function hasPerm(
  user: { role: string; permissions?: string[] } | null | undefined,
  permission: string
): boolean {
  if (!user) return false;
  const perms: string[] = user.permissions ?? ROLE_PERMISSIONS[user.role] ?? [];
  return perms.includes(permission);
}

// ── React Hook（组件内使用，自动从 store 读取当前用户） ──
export function useHasPerm(permission: string): boolean {
  const { user } = useAppStore();
  return hasPerm(user, permission);
}
