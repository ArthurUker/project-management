/**
 * kernel/constants.js —— 权限与审计常量（M-1 v1.0 冻结值）
 *
 * 真源：docs/rbac/M-1-RBAC-v1.0-SIGNED.md
 * 本文件只做「常量镜像 + 运行期校验」，不得在此新增/删除/改名权限码。
 */

export const SYSTEM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'AUDITOR'];

/** P0 90 条权限码（与 seed.js / M-1 §2 逐字一致） */
export const P0_PERMISSIONS = [
  'users.view', 'users.create', 'users.update', 'users.enable', 'users.disable',
  'users.reset_password', 'users.delete',
  'roles.view', 'roles.create', 'roles.update', 'roles.delete',
  'roles.assign_permissions', 'roles.assign_user',
  'projects.view', 'projects.create', 'projects.update', 'projects.archive',
  'projects.manage_members',
  'project_phases.view', 'project_phases.create', 'project_phases.update',
  'project_phases.change_status',
  'tasks.view', 'tasks.create', 'tasks.update', 'tasks.change_status', 'tasks.assign',
  'milestones.view', 'milestones.create', 'milestones.update',
  'reports.view', 'reports.create', 'reports.update', 'reports.submit',
  'reports.review', 'reports.export',
  'progress.view', 'progress.create', 'progress.update',
  'docs.view', 'docs.create', 'docs.update', 'docs.review', 'docs.categories.manage',
  'regulatory_documents.view', 'regulatory_documents.create',
  'regulatory_documents.update', 'regulatory_documents.delete',
  'registrations.view', 'registrations.create', 'registrations.update',
  'registrations.change_stage', 'registrations.export',
  'project_templates.view', 'project_templates.create', 'project_templates.update',
  'project_templates.delete',
  'task_templates.view', 'task_templates.create', 'task_templates.update',
  'task_templates.delete',
  'primers.view', 'primers.create', 'primers.update', 'primers.export',
  'samples.view', 'samples.create', 'samples.update',
  'reagent_materials.view', 'reagent_materials.create', 'reagent_materials.update',
  'reagents.view', 'reagents.create', 'reagents.update', 'reagents.export',
  'formulas.view', 'formulas.create', 'formulas.update',
  'prep_records.view', 'prep_records.create',
  'files.upload', 'files.download', 'files.delete',
  'audit.view', 'audit.export',
  'settings.view', 'settings.update',
  'dashboard.view',
  'data.export',
  'system.logs.view',
];

/** P1 30 条：不得授予、不得出现在 permissions 表 */
export const P1_MANIFEST = [
  'users.import', 'users.export',
  'projects.restore', 'projects.delete',
  'project_phases.delete', 'tasks.delete', 'milestones.delete',
  'reports.delete', 'progress.delete',
  'docs.publish', 'docs.archive', 'docs.delete',
  'regulatory_documents.import', 'regulatory_documents.export',
  'registrations.delete', 'project_templates.copy',
  'primers.import', 'primers.delete',
  'samples.export', 'samples.delete',
  'reagent_materials.import', 'reagent_materials.delete', 'reagent_materials.export',
  'reagents.delete', 'formulas.delete',
  'prep_records.update', 'prep_records.delete',
  'files.view', 'files.restore', 'system.logs.export',
];

/** 8 项高危（M-1 §5） */
export const HIGH_RISK_PERMISSIONS = [
  'users.delete',
  'roles.create',
  'roles.update',
  'roles.delete',
  'roles.assign_permissions',
  'roles.assign_user',
  'settings.update',
  'data.export',
];

/** ADMIN 总排除 10 项 = 8 高危 + audit.export + system.logs.view */
export const ADMIN_EXCLUDED_PERMISSIONS = [
  ...HIGH_RISK_PERMISSIONS,
  'audit.export',
  'system.logs.view',
];

/**
 * AuditAction —— 19 项（M-1 §4）。
 * 命名空间与 Permission.code（resource.action）不同：这里是「动词/事件优先」。
 * 禁止裸字符串散写，一律走 AUDIT_ACTIONS.* 。
 */
export const AUDIT_ACTIONS = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  RESTORE: 'restore',
  LOGIN: 'login',
  LOGIN_FAILED: 'login.failed',
  LOGOUT: 'logout',
  TOKEN_REFRESH: 'token.refresh',
  PASSWORD_CHANGE: 'password.change',
  PERMISSION_CHANGE: 'permission.change',
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  ASSIGN: 'assign',
  STATUS_CHANGE: 'status.change',
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  EXPORT: 'export',
  READ_SENSITIVE: 'read.sensitive',
});

export const AUDIT_ACTION_LIST = Object.values(AUDIT_ACTIONS);

/** 旧审计 action 迁移映射：读到旧值时归一化，但禁止再写入旧值 */
export const LEGACY_AUDIT_ACTION_MAP = Object.freeze({
  'auth.login': AUDIT_ACTIONS.LOGIN,
  'auth.login_failed': AUDIT_ACTIONS.LOGIN_FAILED,
  'auth.logout': AUDIT_ACTIONS.LOGOUT,
  'auth.password_change': AUDIT_ACTIONS.PASSWORD_CHANGE,
  'project.create': AUDIT_ACTIONS.CREATE,
  'project.update': AUDIT_ACTIONS.UPDATE,
  'project.delete': AUDIT_ACTIONS.DELETE,
  'task.create': AUDIT_ACTIONS.CREATE,
  'task.update': AUDIT_ACTIONS.UPDATE,
  'task.delete': AUDIT_ACTIONS.DELETE,
  'user.create': AUDIT_ACTIONS.CREATE,
  'user.update': AUDIT_ACTIONS.UPDATE,
  'user.disable': AUDIT_ACTIONS.STATUS_CHANGE,
  'user.enable': AUDIT_ACTIONS.STATUS_CHANGE,
  'file.upload': AUDIT_ACTIONS.UPLOAD,
  'file.download': AUDIT_ACTIONS.DOWNLOAD,
  'file.delete': AUDIT_ACTIONS.DELETE,
  'backup.export': AUDIT_ACTIONS.EXPORT,
});

/** 项目成员能力集（M-1 §8.3） */
export const PROJECT_CAPABILITIES = Object.freeze({
  OWNER: ['read', 'write', 'delete', 'transition', 'assign', 'manage_members'],
  MANAGER: ['read', 'write', 'transition', 'assign'],
  MEMBER: ['read', 'write'],
  VIEWER: ['read'],
});

/** 系统权限 -> 所需项目能力 */
export const PERM_TO_CAPABILITY = Object.freeze({
  'projects.view': 'read',
  'projects.update': 'write',
  'projects.archive': 'transition',
  'projects.manage_members': 'manage_members',
  'project_phases.view': 'read',
  'project_phases.update': 'write',
  'project_phases.change_status': 'transition',
  'tasks.view': 'read',
  'tasks.update': 'write',
  'tasks.change_status': 'transition',
  'tasks.assign': 'assign',
  'milestones.view': 'read',
  'milestones.update': 'write',
  'reports.view': 'read',
  'reports.update': 'write',
  'reports.review': 'transition',
  'progress.view': 'read',
  'progress.update': 'write',
});

/** 全局禁止由客户端提交的字段（mass-assignment 黑名单） */
export const GLOBAL_FORBIDDEN_FIELDS = Object.freeze([
  'id',
  'code',
  'sampleCode',
  'dispatchNo',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdById',
  'updatedById',
  'passwordHash',
  'systemRole',
  'roleIds',
  'permissions',
  'failedLoginAttempts',
  'lockedUntil',
  'mustChangePassword',
]);

/** users.update 白名单（M-1 §6.3） */
export const USER_UPDATE_FIELDS = Object.freeze([
  'displayName',
  'position',
  'department',
  'phone',
  'email',
  'avatarFileId',
]);
