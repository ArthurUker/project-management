/**
 * modules/files/fileAccessPolicy.ts —— 文件资源归属授权（RF05 / F11）
 *
 * 背景（F11 P0）：文件接口只校验全局 files 权限，不检查附件所属项目、上传者与 isPublic，
 * 因此任何持 files.download 的用户都能列举/读取/下载/删除别人的文件。
 *
 * 设计（05 §6）：
 *   - 每个 FileObject 有明确 accessScope：PRIVATE_STAGING / PROJECT / SHARED_LIBRARY / PUBLIC，
 *     以及明确归属 ownerUserId / ownerProjectId / sharedReadPermission；
 *   - **不能因为文件中存在任意一条附件关系就自动获得权限**：归属必须由绑定命令显式写入；
 *   - 私有暂存仅上传人可见；绑定项目后按项目成员授权；共享库按声明的读权限；公共发布单独判定；
 *   - list / metadata / download / delete / import-source（法规原文等来源文件）**共用本策略**；
 *   - 历史无归属的文件**不自动公开**：归属不明一律按私有暂存处理，未分类记录只对超管开放以做人工分类。
 *
 * 本模块是纯规则（不 import Hono / Prisma），真实约束由 routes 层与集成测试覆盖。
 */

export const FILE_SCOPE = Object.freeze({
  PRIVATE_STAGING: 'PRIVATE_STAGING',
  PROJECT: 'PROJECT',
  SHARED_LIBRARY: 'SHARED_LIBRARY',
  PUBLIC: 'PUBLIC',
} as const);
export type FileScope = (typeof FILE_SCOPE)[keyof typeof FILE_SCOPE];

export const FILE_ACTION = Object.freeze({
  LIST: 'list',
  METADATA: 'metadata',
  DOWNLOAD: 'download',
  DELETE: 'delete',
  /** 来源文件（如法规原文）读取：与 download 同权，但语义上属于「导入来源」 */
  IMPORT_SOURCE: 'import_source',
  /** 暂存 → 可见的绑定动作 */
  BIND: 'bind',
} as const);
export type FileAction = (typeof FILE_ACTION)[keyof typeof FILE_ACTION];

/** 共享库的读权限规则：必须显式声明，未声明 = 不共享（不做隐式公开） */
export const SHARED_READ_PERMISSION = Object.freeze({
  REGULATORY_DOCUMENT: 'regulatory_documents.view',
} as const);

export interface FileRecord {
  id: string;
  accessScope: string;
  ownerUserId?: string | null;
  ownerProjectId?: string | null;
  /** 共享库的读权限码；为空表示未声明共享规则（按私有处理） */
  sharedReadPermission?: string | null;
  uploadedById?: string | null;
  isPublic?: boolean;
  classifiedAt?: Date | string | null;
  deletedAt?: Date | string | null;
}

export interface FileActor {
  userId: string;
  systemRole?: string;
  permissions?: string[];
}

export interface ProjectAccessLike {
  isMember: boolean;
  capabilities?: string[];
  /** Only the server's current project resolver may grant this context. */
  elevated?: boolean;
}

export interface FileAccessContext {
  /** 由调用方（路由）解析后注入：非成员/无能力时 policy 直接拒绝 */
  projectAccess?: ProjectAccessLike | null;
}

export type FileDecisionCode = 'OK' | 'FILE_NOT_FOUND' | 'FORBIDDEN';

export interface FileDecision {
  allow: boolean;
  code: FileDecisionCode;
  reason: string;
}

const allow = (reason: string): FileDecision => ({ allow: true, code: 'OK', reason });
const hidden = (reason: string): FileDecision => ({ allow: false, code: 'FILE_NOT_FOUND', reason });
const deny = (reason: string): FileDecision => ({ allow: false, code: 'FORBIDDEN', reason });

const isSuper = (actor: FileActor): boolean => actor.systemRole === 'SUPER_ADMIN';
const hasPermission = (actor: FileActor, code: string): boolean => (actor.permissions ?? []).includes(code);

/** 实际归属人：显式 owner 优先，其次上传者 */
export function fileOwnerUserId(file: Pick<FileRecord, 'ownerUserId' | 'uploadedById'>): string | null {
  return file.ownerUserId ?? file.uploadedById ?? null;
}

/**
 * 有效作用域：归属不明（PROJECT 缺项目 / SHARED_LIBRARY 缺读权限规则）的历史记录
 * 一律降级为私有暂存 —— 这是「历史无归属不自动公开」的落点。
 */
export function effectiveScope(
  file: Pick<FileRecord, 'accessScope' | 'ownerProjectId' | 'sharedReadPermission' | 'classifiedAt'>,
): FileScope {
  if (file.accessScope === FILE_SCOPE.PROJECT && !file.ownerProjectId) return FILE_SCOPE.PRIVATE_STAGING;
  if (file.accessScope === FILE_SCOPE.SHARED_LIBRARY && !file.sharedReadPermission) return FILE_SCOPE.PRIVATE_STAGING;
  if (file.accessScope === FILE_SCOPE.PUBLIC && !file.classifiedAt) {
    // 公共发布必须经过显式分类（避免历史 isPublic=true 的脏数据被当成公开）
    return FILE_SCOPE.PRIVATE_STAGING;
  }
  return (file.accessScope as FileScope) ?? FILE_SCOPE.PRIVATE_STAGING;
}

/** 未分类历史文件：既无显式 owner 也无上传者，需要人工分类 */
export function isUnclassified(file: FileRecord): boolean {
  return effectiveScope(file) === FILE_SCOPE.PRIVATE_STAGING && !fileOwnerUserId(file) && !file.classifiedAt;
}

/**
 * 单条文件的访问判定。返回 `FILE_NOT_FOUND` 时调用方应按 404 处理（隐藏资源存在性）。
 */
export function decideFileAccess(
  action: FileAction,
  actor: FileActor,
  file: FileRecord | null | undefined,
  ctx: FileAccessContext = {},
): FileDecision {
  if (!file || file.deletedAt) return hidden('文件不存在');

  const scope = effectiveScope(file);
  const owner = fileOwnerUserId(file);
  const isOwner = Boolean(owner) && owner === actor.userId;
  const projectAccess = ctx.projectAccess ?? null;
  const canDelete = hasPermission(actor, 'files.delete');

  switch (scope) {
    case FILE_SCOPE.PRIVATE_STAGING: {
      if (action === FILE_ACTION.DELETE) {
        // 非本人不得知道该暂存是否存在 → 返回 404 语义（与 metadata/download 一致）
        if (isOwner) return canDelete ? allow('上传人删除自己的暂存文件') : deny('缺少 files.delete 权限');
        if (isSuper(actor)) return canDelete ? allow('超管清理暂存文件（需留审计）') : deny('缺少 files.delete 权限');
        return hidden('暂存文件仅上传人可见');
      }
      if (action === FILE_ACTION.BIND) {
        if (isOwner) return allow('上传人可绑定自己的暂存文件');
        return isSuper(actor) ? deny('超管请使用作用域分类接口') : hidden('暂存文件仅上传人可见');
      }
      if (isOwner) return allow('上传人可读自己的暂存文件');
      if (isUnclassified(file) && isSuper(actor)) return allow('超管可读未分类历史文件以便人工分类');
      return hidden('暂存文件仅上传人可见');
    }

    case FILE_SCOPE.PROJECT: {
      if (!projectAccess?.isMember && !(isSuper(actor) && projectAccess?.elevated)) {
        return hidden('非项目成员不可见该项目文件');
      }
      const capabilities = projectAccess.capabilities ?? [];
      if (action === FILE_ACTION.DELETE) {
        if (!canDelete) return deny('缺少 files.delete 权限');
        if (isOwner || capabilities.includes('write')) return allow('项目写能力 + files.delete');
        return deny('项目能力不足（需 write）');
      }
      if (action === FILE_ACTION.BIND) {
        return capabilities.includes('write') ? allow('项目写能力可绑定') : deny('项目能力不足（需 write）');
      }
      return allow('项目成员可读项目文件');
    }

    case FILE_SCOPE.SHARED_LIBRARY: {
      const rule = file.sharedReadPermission;
      if (!rule) return hidden('未声明共享规则的资料不对普通用户开放');
      if (action === FILE_ACTION.DELETE) {
        if (!canDelete) return deny('缺少 files.delete 权限');
        if (isOwner || isSuper(actor)) return allow('上传人/超管可删除共享库文件');
        return deny('共享库文件仅上传人或超管可删除');
      }
      if (action === FILE_ACTION.BIND) {
        return isSuper(actor) ? allow('超管可调整共享库绑定') : deny('共享库绑定仅超管可调整');
      }
      if (isSuper(actor)) return allow('超管可读');
      return hasPermission(actor, rule)
        ? allow(`持有共享读权限 ${rule}`)
        : deny(`缺少共享读权限 ${rule}`);
    }

    case FILE_SCOPE.PUBLIC: {
      if (isSuper(actor)) return allow('超管可读');
      if (action === FILE_ACTION.DELETE) {
        if (!canDelete) return deny('缺少 files.delete 权限');
        return isOwner ? allow('上传人可删除公共文件') : deny('公共文件仅上传人或超管可删除');
      }
      if (action === FILE_ACTION.BIND) return deny('公共文件绑定仅超管可调整');
      if (action === FILE_ACTION.LIST) return allow('公共文件');
      return hasPermission(actor, 'files.download') ? allow('公共文件') : deny('缺少 files.download');
    }

    default:
      return hidden('未知作用域按不可见处理');
  }
}

export interface ListScopeOptions {
  /** 调用方计算出的「该用户可见项目」（成员或负责人；超管传全量或空） */
  visibleProjectIds?: string[];
}

/**
 * 列表可见性过滤片段（Prisma where）。
 * 注意：即便对超管也**不包含他人私有暂存**（暂存是个人草稿，不是共享资源）；
 * 超管额外可列出「未分类历史文件」以便人工分类。
 */
export function listVisibilityFilter(
  actor: FileActor,
  { visibleProjectIds = [] }: ListScopeOptions = {},
): Record<string, unknown> {
  const uid = actor.userId;
  const or: Array<Record<string, unknown>> = [
    { accessScope: FILE_SCOPE.PUBLIC },
  ];

  const sharedRules = (actor.permissions ?? []).filter(
    (p) => (Object.values(SHARED_READ_PERMISSION) as string[]).includes(p),
  );
  if (sharedRules.length > 0) {
    or.push({ accessScope: FILE_SCOPE.SHARED_LIBRARY, sharedReadPermission: { in: sharedRules } });
  }

  if (isSuper(actor)) {
    // 超管：所有项目文件 + 全部共享库（含未声明规则的，便于核查）+ 自己的暂存 + 未分类历史文件
    or.push({ accessScope: FILE_SCOPE.PROJECT });
    or.push({ accessScope: FILE_SCOPE.SHARED_LIBRARY });
    or.push({ accessScope: FILE_SCOPE.PRIVATE_STAGING, ownerUserId: uid });
    or.push({ accessScope: FILE_SCOPE.PRIVATE_STAGING, ownerUserId: null, uploadedById: uid });
    or.push({ accessScope: FILE_SCOPE.PRIVATE_STAGING, ownerUserId: null, uploadedById: null });
    return { OR: or };
  }

  if (visibleProjectIds.length > 0) {
    or.push({ accessScope: FILE_SCOPE.PROJECT, ownerProjectId: { in: visibleProjectIds } });
  }
  or.push({ accessScope: FILE_SCOPE.PRIVATE_STAGING, ownerUserId: uid });
  or.push({ accessScope: FILE_SCOPE.PRIVATE_STAGING, ownerUserId: null, uploadedById: uid });
  return { OR: or };
}
