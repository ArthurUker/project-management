/**
 * modules/files/fileCommands.ts —— 文件作用域的命令（RF05 / F11）
 *
 * 职责：
 *   1. `resolveBindTarget`：把「文件绑定到某个业务实体」解析成明确的归属
 *      （项目 / 共享库 / 无归属），**不允许只凭附件关系自动授权**；
 *   2. `applyBindToFile`：暂存 → 可见 的作用域转移（写 scope/owner/规则/分类时间）；
 *   3. 删除守卫：被已发布证据引用的文件不得整体删除，只能撤销非证据展示关联；
 *   4. 历史归属分类：供回填脚本与人工分类复用同一套规则。
 *
 * 约束：本模块只做领域判定与数据写入，不 import Hono；路由负责鉴权与响应映射。
 */

import { FILE_SCOPE, SHARED_READ_PERMISSION, type FileScope } from './fileAccessPolicy.js';

/** 绑定目标解析结果：明确 scope；null 表示该实体类型暂无可推导归属（保持私有暂存） */
export type BindResolution =
  | { scope: typeof FILE_SCOPE.PROJECT; projectId: string }
  | { scope: typeof FILE_SCOPE.SHARED_LIBRARY; sharedReadPermission: string }
  | { scope: null; reason: string };

/** 需要按项目归属的实体类型 → 取 projectId 的查询键 */
export const PROJECT_SCOPED_ENTITIES: Readonly<Record<string, 'self' | 'projectId'>> = Object.freeze({
  PROJECT: 'self',
  PROJECT_PHASE: 'projectId',
  TASK: 'projectId',
  MILESTONE: 'projectId',
  REPORT: 'projectId',
  MONTHLY_PROGRESS: 'projectId',
});

/** 证据类实体：删除其引用文件时只允许解绑，不允许整体删除（05 §6） */
export const EVIDENCE_ENTITY_TYPES: readonly string[] = Object.freeze(['REGULATORY_DOCUMENT']);

export interface FileLookupDb {
  project?: { findUnique(args: Record<string, unknown>): Promise<{ id: string; deletedAt: Date | null } | null> };
  projectPhase?: { findUnique(args: Record<string, unknown>): Promise<{ projectId: string; deletedAt: Date | null } | null> };
  task?: { findUnique(args: Record<string, unknown>): Promise<{ projectId: string; deletedAt: Date | null } | null> };
  milestone?: { findUnique(args: Record<string, unknown>): Promise<{ projectId: string; deletedAt: Date | null } | null> };
  report?: { findUnique(args: Record<string, unknown>): Promise<{ projectId: string; deletedAt: Date | null } | null> };
  monthlyProgress?: { findUnique(args: Record<string, unknown>): Promise<{ projectId: string } | null> };
}

/**
 * 解析绑定目标：只对**明确登记过**的实体类型推导归属；其余一律返回 null（保持私有暂存），
 * 避免「附件挂在某个实体上」被当成隐式授权（F11 的核心问题）。
 */
export async function resolveBindTarget(
  db: FileLookupDb,
  entityType: string,
  entityId: string,
): Promise<BindResolution> {
  switch (entityType) {
    case 'PROJECT': {
      const row = await db.project?.findUnique({ where: { id: entityId }, select: { id: true, deletedAt: true } });
      return row && !row.deletedAt
        ? { scope: FILE_SCOPE.PROJECT, projectId: row.id }
        : { scope: null, reason: '项目不存在或已删除' };
    }
    case 'PROJECT_PHASE': {
      const row = await db.projectPhase?.findUnique({ where: { id: entityId }, select: { projectId: true, deletedAt: true } });
      return row && !row.deletedAt
        ? { scope: FILE_SCOPE.PROJECT, projectId: row.projectId }
        : { scope: null, reason: '阶段不存在或已删除' };
    }
    case 'TASK': {
      const row = await db.task?.findUnique({ where: { id: entityId }, select: { projectId: true, deletedAt: true } });
      return row && !row.deletedAt
        ? { scope: FILE_SCOPE.PROJECT, projectId: row.projectId }
        : { scope: null, reason: '任务不存在或已删除' };
    }
    case 'MILESTONE': {
      const row = await db.milestone?.findUnique({ where: { id: entityId }, select: { projectId: true, deletedAt: true } });
      return row && !row.deletedAt
        ? { scope: FILE_SCOPE.PROJECT, projectId: row.projectId }
        : { scope: null, reason: '里程碑不存在或已删除' };
    }
    case 'REPORT': {
      const row = await db.report?.findUnique({ where: { id: entityId }, select: { projectId: true, deletedAt: true } });
      return row && !row.deletedAt
        ? { scope: FILE_SCOPE.PROJECT, projectId: row.projectId }
        : { scope: null, reason: '汇报不存在或已删除' };
    }
    case 'MONTHLY_PROGRESS': {
      const row = await db.monthlyProgress?.findUnique({ where: { id: entityId }, select: { projectId: true } });
      return row ? { scope: FILE_SCOPE.PROJECT, projectId: row.projectId } : { scope: null, reason: '月度进展不存在' };
    }
    case 'REGULATORY_DOCUMENT':
      // 法规原文属于「共享库」：显式声明读权限，未声明规则时按私有处理
      return { scope: FILE_SCOPE.SHARED_LIBRARY, sharedReadPermission: SHARED_READ_PERMISSION.REGULATORY_DOCUMENT };
    default:
      return { scope: null, reason: `实体类型 ${entityType} 尚未定义文件归属规则（保持私有暂存）` };
  }
}

export interface FileScopeWriteDb {
  fileObject: { update(args: Record<string, unknown>): Promise<unknown> };
}

/** 暂存 → 可见：写入明确归属（唯一授权依据） */
export async function applyBindToFile(
  db: FileScopeWriteDb,
  fileId: string,
  resolution: BindResolution,
  actorId: string | null,
  now = new Date(),
): Promise<{ applied: boolean; scope: FileScope | null; reason?: string }> {
  if (!resolution.scope) return { applied: false, scope: null, reason: resolution.reason };
  const data: Record<string, unknown> = {
    accessScope: resolution.scope,
    classifiedAt: now,
    classifiedById: actorId,
  };
  if (resolution.scope === FILE_SCOPE.PROJECT) {
    data.ownerProjectId = resolution.projectId;
    data.sharedReadPermission = null;
  } else {
    data.sharedReadPermission = resolution.sharedReadPermission;
    data.ownerProjectId = null;
  }
  await db.fileObject.update({ where: { id: fileId }, data });
  return { applied: true, scope: resolution.scope };
}

export interface AttachmentRef {
  id: string;
  entityType: string;
  entityId: string;
  label?: string | null;
  deletedAt?: Date | null;
}

/** 证据类引用（整体删除会让证据附件不可恢复） */
export function isEvidenceReference(ref: AttachmentRef): boolean {
  if (ref.deletedAt) return false;
  if (EVIDENCE_ENTITY_TYPES.includes(ref.entityType)) return true;
  return (ref.label ?? '').toLowerCase() === 'evidence';
}

export interface FileDeleteGuardResult {
  ok: boolean;
  code?: 'FILE_REFERENCED_BY_EVIDENCE';
  reason?: string;
  evidenceReferences: AttachmentRef[];
}

/**
 * 删除守卫：被已发布证据引用的文件**只能撤销非证据展示关联**，不得整体删除。
 * 调用方拿到 !ok 时应返回 409，并提示改用「解绑非证据附件」。
 */
export function fileDeleteGuard(attachments: AttachmentRef[]): FileDeleteGuardResult {
  const evidence = (attachments ?? []).filter(isEvidenceReference);
  if (evidence.length > 0) {
    return {
      ok: false,
      code: 'FILE_REFERENCED_BY_EVIDENCE',
      reason: `文件被 ${evidence.length} 条证据引用（如法规原文），只能撤销非证据展示关联`,
      evidenceReferences: evidence,
    };
  }
  return { ok: true, evidenceReferences: [] };
}

/**
 * 历史归属分类（回填脚本与人工分类共用）：给出「现有附件 → 应当归属」的建议。
 * 优先级：PROJECT（项目内实体）> SHARED_LIBRARY（法规原文）> PUBLIC（用户头像）> 未分类。
 */
export interface ClassificationInput {
  attachments: AttachmentRef[];
  isUserAvatar?: boolean;
}

export interface ClassificationResult {
  scope: FileScope;
  ownerProjectId?: string | null;
  sharedReadPermission?: string | null;
  basis: string;
}

export function classifyFromAttachments(
  input: ClassificationInput,
  projectIdByEntity: (entityType: string, entityId: string) => string | null | undefined,
): ClassificationResult {
  for (const ref of input.attachments ?? []) {
    if (ref.deletedAt) continue;
    if (!PROJECT_SCOPED_ENTITIES[ref.entityType]) continue;
    const projectId = ref.entityType === 'PROJECT' ? ref.entityId : projectIdByEntity(ref.entityType, ref.entityId);
    if (projectId) {
      return {
        scope: FILE_SCOPE.PROJECT,
        ownerProjectId: projectId,
        sharedReadPermission: null,
        basis: `附件 ${ref.entityType}:${ref.entityId} → 项目 ${projectId}`,
      };
    }
  }
  const regulatory = (input.attachments ?? []).find((r) => !r.deletedAt && r.entityType === 'REGULATORY_DOCUMENT');
  if (regulatory) {
    return {
      scope: FILE_SCOPE.SHARED_LIBRARY,
      ownerProjectId: null,
      sharedReadPermission: SHARED_READ_PERMISSION.REGULATORY_DOCUMENT,
      basis: `附件 REGULATORY_DOCUMENT:${regulatory.entityId} → 共享库（regulatory_documents.view）`,
    };
  }
  if (input.isUserAvatar) {
    return { scope: FILE_SCOPE.PUBLIC, ownerProjectId: null, sharedReadPermission: null, basis: '用户头像 → 公共' };
  }
  return {
    scope: FILE_SCOPE.PRIVATE_STAGING,
    ownerProjectId: null,
    sharedReadPermission: null,
    basis: '无可推导归属 → 未分类（不自动公开）',
  };
}
