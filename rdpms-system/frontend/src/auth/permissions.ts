import { useAuth } from './useAuth';

/**
 * permissions.ts — M-1 v1.0 P0 90 条权限码常量与判定
 *
 * 安全边界声明：
 *   权限的唯一来源是后端 /api/auth/me 返回的 permissions[]。
 *   前端只做 UI 显隐（菜单、按钮），不承担任何安全判定——
 *   即使前端放开，后端仍会返回 403。
 *
 * 真源：docs/rbac/M-1-RBAC-v1.0-SIGNED.md（冻结，不得改码）
 * 本文件禁止出现任何「角色 → 权限」的本地映射表；
 * 禁止出现「未解冻 P1」/否决清单中的任何权限码字符串；
 * 批次二（2026-09-09）解冻的 8 个 P1 码见下方 P1 解冻子集段（与后端 P1_UNFROZEN 对齐）。
 */

export const PERMS = {
  // ── users（7）
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_ENABLE: 'users.enable',
  USERS_DISABLE: 'users.disable',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_DELETE: 'users.delete',
  // ── roles（6）
  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN_PERMISSIONS: 'roles.assign_permissions',
  ROLES_ASSIGN_USER: 'roles.assign_user',
  // ── projects / project_phases / tasks / milestones（17）
  PROJECTS_VIEW: 'projects.view',
  PROJECTS_CREATE: 'projects.create',
  PROJECTS_UPDATE: 'projects.update',
  PROJECTS_ARCHIVE: 'projects.archive',
  PROJECTS_MANAGE_MEMBERS: 'projects.manage_members',
  PROJECT_PHASES_VIEW: 'project_phases.view',
  PROJECT_PHASES_CREATE: 'project_phases.create',
  PROJECT_PHASES_UPDATE: 'project_phases.update',
  PROJECT_PHASES_CHANGE_STATUS: 'project_phases.change_status',
  TASKS_VIEW: 'tasks.view',
  TASKS_CREATE: 'tasks.create',
  TASKS_UPDATE: 'tasks.update',
  TASKS_CHANGE_STATUS: 'tasks.change_status',
  TASKS_ASSIGN: 'tasks.assign',
  MILESTONES_VIEW: 'milestones.view',
  MILESTONES_CREATE: 'milestones.create',
  MILESTONES_UPDATE: 'milestones.update',
  // ── reports / progress（9）
  REPORTS_VIEW: 'reports.view',
  REPORTS_CREATE: 'reports.create',
  REPORTS_UPDATE: 'reports.update',
  REPORTS_SUBMIT: 'reports.submit',
  REPORTS_REVIEW: 'reports.review',
  REPORTS_EXPORT: 'reports.export',
  PROGRESS_VIEW: 'progress.view',
  PROGRESS_CREATE: 'progress.create',
  PROGRESS_UPDATE: 'progress.update',
  // ── docs（5）
  DOCS_VIEW: 'docs.view',
  DOCS_CREATE: 'docs.create',
  DOCS_UPDATE: 'docs.update',
  DOCS_REVIEW: 'docs.review',
  DOCS_CATEGORIES_MANAGE: 'docs.categories.manage',
  // ── regulatory_documents / registrations（9）
  REGULATORY_DOCUMENTS_VIEW: 'regulatory_documents.view',
  REGULATORY_DOCUMENTS_CREATE: 'regulatory_documents.create',
  REGULATORY_DOCUMENTS_UPDATE: 'regulatory_documents.update',
  REGULATORY_DOCUMENTS_DELETE: 'regulatory_documents.delete',
  REGISTRATIONS_VIEW: 'registrations.view',
  REGISTRATIONS_CREATE: 'registrations.create',
  REGISTRATIONS_UPDATE: 'registrations.update',
  REGISTRATIONS_CHANGE_STAGE: 'registrations.change_stage',
  REGISTRATIONS_EXPORT: 'registrations.export',
  // ── project_templates / task_templates（8）
  PROJECT_TEMPLATES_VIEW: 'project_templates.view',
  PROJECT_TEMPLATES_CREATE: 'project_templates.create',
  PROJECT_TEMPLATES_UPDATE: 'project_templates.update',
  PROJECT_TEMPLATES_DELETE: 'project_templates.delete',
  TASK_TEMPLATES_VIEW: 'task_templates.view',
  TASK_TEMPLATES_CREATE: 'task_templates.create',
  TASK_TEMPLATES_UPDATE: 'task_templates.update',
  TASK_TEMPLATES_DELETE: 'task_templates.delete',
  // ── primers / samples / reagent_materials / reagents / formulas / prep_records（19）
  PRIMERS_VIEW: 'primers.view',
  PRIMERS_CREATE: 'primers.create',
  PRIMERS_UPDATE: 'primers.update',
  PRIMERS_EXPORT: 'primers.export',
  SAMPLES_VIEW: 'samples.view',
  SAMPLES_CREATE: 'samples.create',
  SAMPLES_UPDATE: 'samples.update',
  REAGENT_MATERIALS_VIEW: 'reagent_materials.view',
  REAGENT_MATERIALS_CREATE: 'reagent_materials.create',
  REAGENT_MATERIALS_UPDATE: 'reagent_materials.update',
  REAGENTS_VIEW: 'reagents.view',
  REAGENTS_CREATE: 'reagents.create',
  REAGENTS_UPDATE: 'reagents.update',
  REAGENTS_EXPORT: 'reagents.export',
  FORMULAS_VIEW: 'formulas.view',
  FORMULAS_CREATE: 'formulas.create',
  FORMULAS_UPDATE: 'formulas.update',
  PREP_RECORDS_VIEW: 'prep_records.view',
  PREP_RECORDS_CREATE: 'prep_records.create',
  // ── files / audit / settings / dashboard / data / system（10）
  FILES_UPLOAD: 'files.upload',
  FILES_DOWNLOAD: 'files.download',
  FILES_DELETE: 'files.delete',
  AUDIT_VIEW: 'audit.view',
  AUDIT_EXPORT: 'audit.export',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',
  DASHBOARD_VIEW: 'dashboard.view',
  DATA_EXPORT: 'data.export',
  SYSTEM_LOGS_VIEW: 'system.logs.view',

  // ── P1 解冻子集（批次二，2026-09-09；对齐后端 kernel/constants.js P1_UNFROZEN）（8）
  PROJECTS_DELETE: 'projects.delete',
  TASKS_DELETE: 'tasks.delete',
  REPORTS_DELETE: 'reports.delete',
  DOCS_DELETE: 'docs.delete',
  PROJECT_TEMPLATES_COPY: 'project_templates.copy',
  PRIMERS_DELETE: 'primers.delete',
  PRIMERS_IMPORT: 'primers.import',
  REAGENT_MATERIALS_DELETE: 'reagent_materials.delete',

  // ══════════════════════════════════════════════════════════════════
  // 兼容别名：旧键名 → M-1 P0 新码。仅为存量页面平滑迁移保留；
  // 新代码一律使用上面的规范键。
  // ══════════════════════════════════════════════════════════════════
  PROJECTS_EDIT: 'projects.update',
  PROJECTS_UPDATE_STATUS: 'projects.update',
  TASKS_UPDATE_STATUS: 'tasks.change_status',
  USERS_MANAGE: 'users.view',
  TEMPLATES_CREATE: 'project_templates.create',
  TEMPLATES_EDIT: 'project_templates.update',
  REGISTRATIONS_EDIT: 'registrations.update',
  REGISTRATIONS_APPROVE: 'registrations.change_stage',
  REPORTS_WRITE: 'reports.view',
  REPORTS_APPROVE: 'reports.review',
  REGULATORY_MANAGE: 'regulatory_documents.view',
  DOCS_READ: 'docs.view',
  DOCS_WRITE: 'docs.create',
  PRIMERS_READ: 'primers.view',
  REAGENTS_READ: 'reagents.view',
  SAMPLES_READ: 'samples.view',
  AUDIT_READ: 'audit.view',
  SYSTEM_SETTINGS_MANAGE: 'settings.view',
} as const;

export type PermCode = (typeof PERMS)[keyof typeof PERMS];
export type MaybePerm = PermCode | string;

/** 判定：所有列出的权限都必须具备（AND 语义） */
export function hasPerm(permissions: string[] | undefined, perm?: MaybePerm | MaybePerm[]): boolean {
  if (!perm) return true;
  const required = Array.isArray(perm) ? perm : [perm];
  if (required.length === 0) return true;
  const owned = new Set(permissions ?? []);
  return required.every((p) => owned.has(p));
}

/** 判定：具备任意一个即可（OR 语义），用于「有查看权或有编辑权都显示」的场景 */
export function hasAnyPerm(permissions: string[] | undefined, perm?: MaybePerm[]): boolean {
  if (!perm || perm.length === 0) return true;
  const owned = new Set(permissions ?? []);
  return perm.some((p) => owned.has(p));
}

/** 组件内使用 */
export function useHasPerm(perm?: MaybePerm | MaybePerm[]): boolean {
  const { permissions } = useAuth();
  return hasPerm(permissions, perm);
}

export function useHasAnyPerm(perm?: MaybePerm[]): boolean {
  const { permissions } = useAuth();
  return hasAnyPerm(permissions, perm);
}
