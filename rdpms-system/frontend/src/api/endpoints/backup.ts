import { http } from '../http';
import { del, get, post } from '../request';

/**
 * 备份 / 恢复 v2（批次三）
 *   - 导出：GET /backup/export（data.export，仅 SUPER_ADMIN）
 *   - 预检：POST /backup/restore/preview（只读校验 + 逐表差异）
 *   - 应用：POST /backup/restore（单事务，失败整体回滚，仅 SUPER_ADMIN）
 * 运维级整库恢复仍以 pg_dump / pg_restore 为准。
 */

export const BACKUP_MODULES: Array<{ key: string; label: string }> = [
  { key: 'users', label: '用户' },
  { key: 'projects', label: '项目（含成员/任务/依存/里程碑/阶段流转）' },
  { key: 'reports', label: '汇报（含版本/月度进展）' },
  { key: 'docs', label: '知识库（分类/文档/版本）' },
  { key: 'projectTemplates', label: '项目模板' },
  { key: 'taskTemplates', label: '任务模板' },
  { key: 'reagents', label: '试剂（原料/批次/配方/组分/配制记录）' },
  { key: 'primers', label: '引物探针' },
  { key: 'samples', label: '样本' },
  { key: 'rbac', label: '角色与权限' },
  { key: 'systemLogs', label: '系统日志' },
];

export interface BackupPayload {
  version?: string;
  exportedAt?: string;
  modules?: string[];
  data: Record<string, unknown[]>;
}

export interface RestorePreviewTable {
  key: string;
  rows: number;
  existing: number;
  new: number;
  errors: string[];
  warnings: string[];
}

export interface RestoreValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  tables: RestorePreviewTable[];
  includedKeys: string[];
}

export interface RestoreSummary {
  mode: 'merge' | 'replace';
  created: number;
  updated: number;
  deleted: number;
  durationMs: number;
  tables: Array<Record<string, unknown>>;
}

export const backupAPI = {
  /** 导出 JSON 文件（blob + Authorization，不透出裸 URL） */
  async export(modules?: string[]): Promise<void> {
    const res = await http.get('/backup/export', {
      params: modules && modules.length ? { modules: modules.join(',') } : {},
      responseType: 'blob',
    } as never);

    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rdpms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /** 可恢复表清单 */
  tables: () => get<{ tables: Array<{ key: string; appendOnly: boolean }> }>('/backup/restore/tables'),

  /** 只读预检：结构/主键/外键/唯一键校验 + 逐表差异统计 */
  preview: (backup: BackupPayload, mode: 'merge' | 'replace') =>
    post<RestoreValidation>('/backup/restore/preview', { backup, mode }),

  /** 应用恢复（单事务；replace 需显式确认） */
  restore: (backup: BackupPayload, mode: 'merge' | 'replace', confirmReplace = false) =>
    post<{ success: true; summary: RestoreSummary }>('/backup/restore', { backup, mode, confirmReplace }),
};

/* ────────────────────────────────────────────────────────────────────────────
 * 归档备份（整库 pg_dump -Fc + AES-256-GCM）
 *
 * 与上面的模块级 JSON 导出互补：
 *   - JSON：模块级、可在线回灌、覆盖 27 张业务表；
 *   - 归档：整库快照 + 加密 + 历史/校验/保留/磁盘用量，恢复由运维执行 pg_restore。
 * 全部端点仅 SUPER_ADMIN（data.export），产物下载与校验均写审计。
 * ────────────────────────────────────────────────────────────────────────── */

export type ArchiveRunType = 'manual' | 'scheduled' | 'predeploy';
export type ArchiveVerifyStatus = 'unknown' | 'passed' | 'failed';

export interface ArchiveRow {
  id: string;
  jobId: string;
  runType: ArchiveRunType | string;
  scope: string;
  status: 'ok' | 'failed';
  verifyStatus: ArchiveVerifyStatus | string;
  dir: string | null;
  fileSize: number | null;
  plainSize: number | null;
  checksum: string | null;
  algorithm: string;
  keyMode: string;
  compression: string;
  snapshotMode: 'exported' | 'live';
  tableCount: number;
  tableCounts: Record<string, number> | null;
  countsCrossCheck: {
    mode: string;
    result: 'passed' | 'failed';
    tables: number;
    missing: string[];
    extra: string[];
  } | null;
  durationMs: number;
  failureCode: string | null;
  failureDetail: string | null;
  createdById: string | null;
  createdAt: string;
  verifiedAt: string | null;
  /** 产物是否仍在磁盘上（null = 归档目录不可用，看 fileReason） */
  fileExists: boolean | null;
  fileReason: string | null;
}

export interface ArchiveListResponse {
  items: ArchiveRow[];
  total: number;
  page: number;
  pageSize: number;
  storageError: string | null;
}

export interface ArchiveVerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ArchiveVerifyResponse {
  ok: boolean;
  checks: ArchiveVerifyCheck[];
  tocTables: number;
  dataEntries: number;
}

export interface ArchiveRetentionOutcome {
  removed: Array<{ jobId: string; dir: string; bytes: number }>;
  kept: number;
  skipped: number;
  removedBytes: number;
  errors: Array<{ dir: string; message: string }>;
}

export interface ArchiveRunResponse {
  success: true;
  result: {
    jobId: string;
    runId: string;
    dir: string;
    aesPath: string;
    metaPath: string;
    fileSize: number;
    plainBytes: number;
    sha256: string;
    tableCount: number;
    snapshotMode: 'exported' | 'live';
    durationMs: number;
    warnings: string[];
    retention: ArchiveRetentionOutcome | null;
  };
}

export interface ArchiveRetentionPreview {
  dryRun: boolean;
  keepDays: number;
  keepCount: number;
  keep?: number;
  remove: Array<{ jobId: string; dir: string; bytes: number }>;
  skipped: Array<{ jobId: string; dir: string; bytes: number }>;
}

export interface ArchiveStorageResponse {
  thresholds: { warnPct: number; minFreeMb: number };
  level: 'ok' | 'warn' | 'low' | 'unknown';
  warnings: string[];
  mount: { path: string; totalBytes: number; freeBytes: number; usedBytes: number; usagePct: number } | null;
  archive: {
    root: string;
    exists: boolean;
    totalBytes: number;
    count: number;
    byDay: Array<{ day: string; bytes: number; count: number }>;
    workBytes: number;
  };
  dirs: Array<{ label: string; dir: string; bytes: number; files: number }>;
  unregistered: Array<{ dir: string; bytes: number; reason: string }>;
  retention: { keepDays: number; keepCount: number };
}

const ARCHIVE_LONG_TIMEOUT = 15 * 60 * 1000;
const ARCHIVE_MEDIUM_TIMEOUT = 5 * 60 * 1000;

export const backupArchiveAPI = {
  /** 历史列表（分页 + 状态筛选） */
  list: (params?: { page?: number; pageSize?: number; status?: string; runType?: string }) =>
    get<ArchiveListResponse>('/backup/archives', { params }),

  /** 单份详情（meta 已隐去 dekCipher） */
  detail: (id: string) =>
    get<{ item: ArchiveRow & { meta: Record<string, unknown> | null; metaError: string | null } }>(
      `/backup/archives/${id}`,
    ),

  /** 立即生成一份归档（阻塞到 pg_dump + 加密 + 发布完成；并发时返回 409） */
  run: () => post<ArchiveRunResponse>('/backup/archives/run', { runType: 'manual' }, { timeout: ARCHIVE_LONG_TIMEOUT }),

  /** 离线校验：解密 + sha256 + pg_restore -l 表清单对账 */
  verify: (id: string) =>
    post<ArchiveVerifyResponse>(`/backup/archives/${id}/verify`, {}, { timeout: ARCHIVE_MEDIUM_TIMEOUT }),

  /** 删除一份归档（记录 + 产物文件） */
  remove: (id: string) => del<{ success: true; jobId: string; removedBytes: number }>(`/backup/archives/${id}`),

  /** 保留策略：dryRun=true 只预览；false 立即清理（只删已登记产物） */
  retention: (dryRun = true) =>
    post<ArchiveRetentionPreview & Partial<ArchiveRetentionOutcome>>('/backup/archives/retention', { dryRun }),

  /** 存储用量：挂载水位 + 归档占用 + 其它备份目录 + 未登记目录 */
  storage: () => get<ArchiveStorageResponse>('/backup/storage'),

  /** 下载产物（aes 密文 / meta 元数据），带 Authorization 走 blob，不透出裸 URL */
  async download(id: string, format: 'aes' | 'meta' = 'aes'): Promise<void> {
    const res = await http.get(`/backup/archives/${id}/download`, {
      params: { format },
      responseType: 'blob',
      timeout: ARCHIVE_MEDIUM_TIMEOUT,
    } as never);
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'aes' ? `archive-${id}.dump.aes` : `archive-${id}.meta.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
