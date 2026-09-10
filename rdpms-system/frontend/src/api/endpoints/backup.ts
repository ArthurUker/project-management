import { http } from '../http';
import { get, post } from '../request';

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
