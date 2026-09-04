/**
 * api/index.ts — 前端调用后端的唯一入口
 *
 * 规则：
 *   1. 页面 / 组件只允许从 '@/api' 导入，禁止直接 import axios 或自行发 fetch
 *   2. 所有方法返回「已解包的业务数据」，不存在 res.data 的二义性
 *   3. 所有失败抛 ApiError
 */

export { http } from './http';
export { ApiError, ERR, isApiError, toMessage } from './error';
export type { ErrorCode } from './error';

export { get, post, put, patch, del, request, requestPaged, normalizePaged } from './request';
export type { ApiMeta, ApiResponse, ErrorBody, ErrorResponse, PageQuery, Paged } from './types';

/* ── 端点 ────────────────────────────────────────────────────────────────── */
export { authAPI, userAPI } from './endpoints/auth';
export type { LoginPayload, UserQuery } from './endpoints/auth';

export { projectAPI } from './endpoints/projects';
export { taskAPI } from './endpoints/tasks';
export { reportAPI, progressAPI } from './endpoints/reports';
export type { ReportQuery } from './endpoints/reports';

export { projectTemplatesAPI, taskTemplatesAPI } from './endpoints/templates';
export type { ProjectTemplate, TaskTemplate, TaskTemplateStep } from './endpoints/templates';

export { registrationsAPI } from './endpoints/registrations';
export type {
  RegistrationProfile,
  RegistrationProject,
  RegistrationQuery,
} from './endpoints/registrations';

export { regulatoryDocumentsAPI } from './endpoints/regulatoryDocuments';
export type {
  RegulatoryDocument,
  RegulatoryDocumentQuery,
} from './endpoints/regulatoryDocuments';

export { docsAPI, primerAPI, samplesAPI } from './endpoints/knowledge';
export type {
  DocCategory,
  DocDocument,
  DocVersion,
  Primer,
  PrimerQuery,
  SampleMaterial,
} from './endpoints/knowledge';

export {
  reagentAPI,
  reagentMaterialsAPI,
  formulaAPI,
  prepAPI,
  reagentsAPI,
  reagentLotsAPI,
} from './endpoints/reagents';
export type {
  FormulaComponent,
  PrepRecord,
  ReagentFormula,
  ReagentLot,
  ReagentMaterial,
} from './endpoints/reagents';

export { auditLogsAPI, systemLogsAPI, dictAPI, healthAPI } from './endpoints/system';
export { rolesAPI } from './endpoints/roles';
export type { RoleItem, PermissionCatalogItem } from './endpoints/roles';
export type {
  AuditLog,
  AuditLogQuery,
  EntityAuditSummary,
  SystemLog,
  SystemLogQuery,
} from './endpoints/system';

export { statsAPI } from './endpoints/stats';
export type { StatsQuery } from './endpoints/stats';

/* ── 文件 ────────────────────────────────────────────────────────────────── */
export { fileAPI, downloadFile, getFileBlobUrl, uploadFile } from './files';
export type { UploadOptions } from './files';
