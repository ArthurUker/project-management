/**
 * platform/backup/errors.ts —— 归档备份子系统的受控错误码。
 *
 * 边界：
 *   - 认证/授权失败不在这里表达（走 kernel/rbac.js 的 forbidden/unauthorized）；
 *   - 本模块只表达"归档作业自身"的失败，由路由层翻译 HTTP 状态码、CLI 层翻译退出码。
 *   - fail-closed：未配置主密钥 / 目录非法时直接抛错，绝不降级为明文备份。
 */
export type BackupErrorCode =
  | 'BACKUP_KMS_NOT_CONFIGURED'
  | 'BACKUP_ARCHIVE_DIR_INVALID'
  | 'BACKUP_LOCK_BUSY'
  | 'BACKUP_DISK_LOW'
  | 'BACKUP_PRIVILEGE_DENIED'
  | 'BACKUP_PG_DUMP_FAILED'
  | 'BACKUP_PG_RESTORE_FAILED'
  | 'BACKUP_CONSISTENCY_FAILED'
  | 'BACKUP_VERIFY_FAILED'
  | 'BACKUP_PATH_REJECTED'
  | 'BACKUP_ARTIFACT_NOT_FOUND'
  | 'BACKUP_META_INVALID';

const HTTP_STATUS: Record<BackupErrorCode, number> = {
  BACKUP_KMS_NOT_CONFIGURED: 503,
  BACKUP_ARCHIVE_DIR_INVALID: 503,
  BACKUP_LOCK_BUSY: 409,
  BACKUP_DISK_LOW: 507,
  BACKUP_PRIVILEGE_DENIED: 500,
  BACKUP_PG_DUMP_FAILED: 500,
  BACKUP_PG_RESTORE_FAILED: 500,
  BACKUP_CONSISTENCY_FAILED: 500,
  BACKUP_VERIFY_FAILED: 500,
  BACKUP_PATH_REJECTED: 500,
  BACKUP_ARTIFACT_NOT_FOUND: 404,
  BACKUP_META_INVALID: 500,
};

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly detail?: string;

  constructor(code: BackupErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
    this.detail = detail;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  /**
   * 与 kernel/http.js 的 HttpError 同名对齐：bootstrap/createApp.js 的全局 onError 读的是
   * `err?.status`，没有这个 getter 时任何"漏 catch"的归档错误都会被当成 500（例如生产未配置
   * BACKUP_ARCHIVE_DIR 时应为 503）。路由层仍优先用 httpStatus 给出带 detail 的响应体。
   */
  get status(): number {
    return this.httpStatus;
  }

  toJSON(): { code: BackupErrorCode; message: string; detail?: string } {
    return { code: this.code, message: this.message, detail: this.detail };
  }
}

export function isBackupError(err: unknown): err is BackupError {
  return err instanceof BackupError;
}
