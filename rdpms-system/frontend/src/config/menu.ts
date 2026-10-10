import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Boxes,
  ClipboardList,
  FileText,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  MapPin,
  Scale,
  Settings,
  Wrench,
} from 'lucide-react';
import { PERMS, hasPerm, type MaybePerm } from '../auth/permissions';

/**
 * menu.ts — permissions 驱动的菜单配置（M-1 §7.2 菜单收窄）
 *
 * 规则：
 *   1. 菜单项只声明 perm，不声明角色
 *   2. 无权限的项直接隐藏；子项全被隐藏时父级一并隐藏
 *   3. 这里只影响「看不看得见」，不影响「能不能访问」（真实拦截在后端）
 *   4. AUDITOR 只会出现：审计日志 / 系统日志（+右上角修改密码）
 *
 * icon 为 lucide-react 图标组件（与参考仓库「每项带图标」的侧栏规范对齐）。
 */

export interface MenuItem {
  key: string;
  label: string;
  path?: string;
  perm?: MaybePerm | MaybePerm[];
  icon?: LucideIcon;
  children?: MenuItem[];
  /**
   * 标记「二级菜单在运行时由数据构建」。
   * 目前只有知识库使用：它的分类存在数据库里（用户可增删），
   * 静态配置无法覆盖，因此由 buildKnowledgeChildren() 在拿到分类后替换 children；
   * 配置里的 children 仅作为分类尚未加载 / 请求失败时的兜底。
   */
  dynamic?: 'knowledge-categories';
}

export const MENU: MenuItem[] = [
  { key: 'dashboard', label: '仪表盘', path: '/', perm: PERMS.DASHBOARD_VIEW, icon: LayoutDashboard },
  { key: 'projects', label: '项目管理', path: '/projects', perm: PERMS.PROJECTS_VIEW, icon: FolderKanban },
  {
    key: 'registrations',
    label: '项目注册管理',
    path: '/registrations',
    perm: PERMS.REGISTRATIONS_VIEW,
    icon: ClipboardList,
  },
  { key: 'reports', label: '汇报管理', path: '/reports', perm: PERMS.REPORTS_VIEW, icon: FileText },
  {
    key: 'regulatory',
    label: '法规文档',
    path: '/regulatory-documents',
    perm: PERMS.REGULATORY_DOCUMENTS_VIEW,
    icon: Scale,
  },
  {
    key: 'knowledge',
    label: '知识库',
    path: '/knowledge',
    perm: PERMS.DOCS_VIEW,
    icon: BookOpen,
    // 二级菜单运行时按后端分类构建（见 buildKnowledgeChildren）；
    // 下列静态项是分类未加载完成或请求失败时的兜底。
    dynamic: 'knowledge-categories',
    children: [
      { key: 'k-docs', label: '全部文档', path: '/knowledge', perm: PERMS.DOCS_VIEW },
      { key: 'k-primers', label: '引物探针库', path: '/knowledge?module=primers', perm: PERMS.PRIMERS_VIEW },
      { key: 'k-reagents', label: '试剂原料库', path: '/knowledge?module=reagents', perm: PERMS.REAGENTS_VIEW },
      { key: 'k-samples', label: '样本库', path: '/knowledge?module=samples', perm: PERMS.SAMPLES_VIEW },
    ],
    },
  { key: 'tasks', label: '任务管理', path: '/tasks', perm: PERMS.TASKS_VIEW, icon: ListChecks },
  {
    key: 'templates',
    label: '模板库',
    path: '/project-templates',
    perm: [PERMS.PROJECT_TEMPLATES_VIEW, PERMS.TASK_TEMPLATES_VIEW],
    icon: LayoutTemplate,
    children: [
      { key: 't-project', label: '项目模板', path: '/project-templates', perm: PERMS.PROJECT_TEMPLATES_VIEW },
      { key: 't-task', label: '任务模板', path: '/task-templates', perm: PERMS.TASK_TEMPLATES_VIEW },
    ],
  },
  {
    key: 'reagent-formula',
    label: '试剂配方',
    path: '/reagent-formula',
    perm: PERMS.REAGENTS_VIEW,
    icon: FlaskConical,
  },
  {
    // v1.1（2026-10-10）：实验台账（库存批次 / 设备台账 / 库位管理）
    key: 'lab-inventory',
    label: '实验台账',
    icon: Boxes,
    perm: [PERMS.REAGENTS_VIEW, PERMS.EQUIPMENT_VIEW, PERMS.STORAGE_LOCATIONS_VIEW],
    children: [
      { key: 'li-lots', label: '库存批次', path: '/inventory', perm: PERMS.REAGENTS_VIEW, icon: Boxes },
      { key: 'li-equipment', label: '设备台账', path: '/equipment', perm: PERMS.EQUIPMENT_VIEW, icon: Wrench },
      { key: 'li-locations', label: '库位管理', path: '/storage-locations', perm: PERMS.STORAGE_LOCATIONS_VIEW, icon: MapPin },
    ],
  },
  {
    key: 'system',
    label: '系统',
    icon: Settings,
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

export interface KnowledgeCategory {
  id: string;
  name: string;
}

/**
 * 知识库分类 → 权限位。
 *
 * 分类本身没有独立权限位（它是用户可增删的数据），因此：
 *   - 有对应权限位的分类，按其权限位控制可见性（与改造前的 3 个入口一致）；
 *   - 其余分类统一用 docs.view，与知识库页面内的可见范围保持一致。
 */
const KNOWLEDGE_CATEGORY_PERM: Record<string, MaybePerm> = {
  引物探针库: PERMS.PRIMERS_VIEW,
  试剂原料库: PERMS.REAGENTS_VIEW,
  样本库: PERMS.SAMPLES_VIEW,
};

/**
 * 依据后端返回的知识库分类构建二级菜单。
 *
 * 结构：全部文档 → 各分类（顺序与后端返回一致，即页面顶部分类按钮的顺序）→ 法规知识库。
 * 这样侧边栏与知识库页面内的分类始终一致，用户新增分类后无需改代码。
 */
export function buildKnowledgeChildren(categories: KnowledgeCategory[]): MenuItem[] {
  return [
    { key: 'k-docs', label: '全部文档', path: '/knowledge', perm: PERMS.DOCS_VIEW },
    ...categories.map((cat) => ({
      key: `k-cat-${cat.id}`,
      label: cat.name,
      path: `/knowledge?category=${cat.id}`,
      perm: KNOWLEDGE_CATEGORY_PERM[cat.name] ?? PERMS.DOCS_VIEW,
    })),
    {
      key: 'k-regulatory',
      label: '法规知识库',
      path: '/knowledge?module=regulatory',
      perm: PERMS.REGULATORY_DOCUMENTS_VIEW,
    },
  ];
}

/** 按 permissions 递归过滤菜单 */
export function filterMenu(items: MenuItem[], permissions: string[]): MenuItem[] {
  return items
    .filter((item) => hasPerm(permissions, item.perm))
    .map((item) =>
      item.children ? { ...item, children: filterMenu(item.children, permissions) } : item,
    )
    .filter((item) => item.path || (item.children && item.children.length > 0));
}
