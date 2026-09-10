import { PERMS, hasPerm, type MaybePerm } from '../auth/permissions';

/**
 * menu.ts — permissions 驱动的菜单配置（M-1 §7.2 菜单收窄）
 *
 * 规则：
 *   1. 菜单项只声明 perm，不声明角色
 *   2. 无权限的项直接隐藏；子项全被隐藏时父级一并隐藏
 *   3. 这里只影响「看不看得见」，不影响「能不能访问」（真实拦截在后端）
 *   4. AUDITOR 只会出现：审计日志 / 系统日志（+右上角修改密码）
 */

export interface MenuItem {
  key: string;
  label: string;
  path?: string;
  perm?: MaybePerm | MaybePerm[];
  icon?: string;
  children?: MenuItem[];
}

export const MENU: MenuItem[] = [
  { key: 'dashboard', label: '仪表盘', path: '/', perm: PERMS.DASHBOARD_VIEW },
  { key: 'projects', label: '项目管理', path: '/projects', perm: PERMS.PROJECTS_VIEW },
  {
    key: 'registrations',
    label: '项目注册管理',
    path: '/registrations',
    perm: PERMS.REGISTRATIONS_VIEW,
  },
  { key: 'reports', label: '汇报管理', path: '/reports', perm: PERMS.REPORTS_VIEW },
  {
    key: 'regulatory',
    label: '法规文档',
    path: '/regulatory-documents',
    perm: PERMS.REGULATORY_DOCUMENTS_VIEW,
  },
  {
    key: 'knowledge',
    label: '知识库',
    path: '/knowledge',
    perm: PERMS.DOCS_VIEW,
    children: [
      { key: 'k-primers', label: '引物探针库', path: '/knowledge?module=primers', perm: PERMS.PRIMERS_VIEW },
      { key: 'k-reagents', label: '试剂库', path: '/knowledge?module=reagents', perm: PERMS.REAGENTS_VIEW },
      { key: 'k-samples', label: '样本库', path: '/knowledge?module=samples', perm: PERMS.SAMPLES_VIEW },
    ],
  },
  { key: 'tasks', label: '任务管理', path: '/tasks', perm: PERMS.TASKS_VIEW },
  {
    key: 'templates',
    label: '模板库',
    path: '/project-templates',
    perm: [PERMS.PROJECT_TEMPLATES_VIEW, PERMS.TASK_TEMPLATES_VIEW],
    children: [
      { key: 't-project', label: '项目模板', path: '/project-templates', perm: PERMS.PROJECT_TEMPLATES_VIEW },
      { key: 't-task', label: '任务模板', path: '/task-templates', perm: PERMS.TASK_TEMPLATES_VIEW },
    ],
  },
  { key: 'reagent-formula', label: '试剂配方', path: '/reagent-formula', perm: PERMS.REAGENTS_VIEW },
  {
    key: 'system',
    label: '系统',
    perm: [
      PERMS.USERS_VIEW,
      PERMS.AUDIT_VIEW,
      PERMS.SYSTEM_LOGS_VIEW,
      PERMS.SETTINGS_VIEW,
      PERMS.DATA_EXPORT,
    ],
    children: [
      { key: 's-users', label: '成员管理', path: '/users', perm: PERMS.USERS_VIEW },
      { key: 's-roles', label: '角色管理', path: '/roles', perm: PERMS.ROLES_VIEW },
      { key: 's-audit', label: '审计日志', path: '/audit-logs', perm: PERMS.AUDIT_VIEW },
      { key: 's-system-logs', label: '系统日志', path: '/system-logs', perm: PERMS.SYSTEM_LOGS_VIEW },
      { key: 's-backup', label: '数据备份与恢复', path: '/backup', perm: PERMS.DATA_EXPORT },
      { key: 's-settings', label: '系统设置', path: '/settings', perm: PERMS.SETTINGS_VIEW },
    ],
  },
];

/** 按 permissions 递归过滤菜单 */
export function filterMenu(items: MenuItem[], permissions: string[]): MenuItem[] {
  return items
    .filter((item) => hasPerm(permissions, item.perm))
    .map((item) =>
      item.children ? { ...item, children: filterMenu(item.children, permissions) } : item,
    )
    .filter((item) => item.path || (item.children && item.children.length > 0));
}
