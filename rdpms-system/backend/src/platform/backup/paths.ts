/**
 * platform/backup/paths.ts —— 归档目录布局与路径守卫。
 *
 * 布局（对照 /opt/foodsentinel/backend/lib/backupJobs.js 的"目录级原子发布"）：
 *   <BACKUP_ARCHIVE_DIR>/<YYYY-MM-DD>/<base>.<jobId>/
 *     ├── <base>.dump.aes        pg_dump -Fc -Z6 输出经 AES-256-GCM 加密后的密文
 *     └── <base>.meta.json       信封/校验和/表清单等元数据（含 dekCipher）
 *
 * 两条硬规矩：
 *   1. 日期目录按 Asia/Shanghai 计算 —— 直接用 toISOString() 会把 02:00 的定时备份
 *      写进"前一天"的目录（参考实现真实踩过的坑）；
 *   2. 任何"按路径删除/读取"的操作都必须过 resolveArtifactPath() —— 拒绝越界与符号链接，
 *      否则一个被篡改的 DB 行就能让清理逻辑删掉系统里任意文件。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BackupError } from './errors.js';

export const ARCHIVE_DIR_ENV = 'BACKUP_ARCHIVE_DIR';
/** Asia/Shanghai 固定偏移（本系统部署在中国大陆，无夏令时）。 */
export const CN_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 归档产物的基础名：rdpms-<yyyymmddThhmmss>（按 Asia/Shanghai）。 */
export function archiveBaseName(now: Date = new Date()): string {
  const stamp = new Date(now.getTime() + CN_TZ_OFFSET_MS).toISOString().slice(0, 19).replace(/[-:]/g, '');
  return `rdpms-${stamp}`;
}

/** 日期目录名 YYYY-MM-DD（Asia/Shanghai）。 */
export function backupDayDir(now: Date = new Date()): string {
  return new Date(now.getTime() + CN_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** jobId：backup-<UTC yyyymmddThhmmss>-<8hex>；既排序又全局唯一（并发/重试不撞目录）。 */
export function newJobId(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '');
  return `backup-${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

export const JOB_ID_PATTERN = /^backup-\d{8}T\d{6}-[0-9a-f]{8}$/;

/**
 * 从产物目录名解析 jobId。
 * 产物目录名是 `<base>.<jobId>`（如 rdpms-20261009T170000.backup-20261009T090000-ab12cd34），
 * 取最后一段；也兼容目录名直接就是 jobId 的情形。
 */
export function jobIdFromDirName(dirName: string): string | null {
  const candidate = dirName.includes('.') ? dirName.slice(dirName.lastIndexOf('.') + 1) : dirName;
  return JOB_ID_PATTERN.test(candidate) ? candidate : null;
}

/** 解析归档根目录：生产/预发必须显式配置绝对路径，且不得落在代码目录内。 */
export function resolveArchiveRoot(env: NodeJS.ProcessEnv = process.env, codeRoot: string = process.cwd()): string {
  const strict = ['production', 'staging'].includes(env.NODE_ENV ?? '');
  const raw = (env[ARCHIVE_DIR_ENV] ?? '').trim();
  if (!raw) {
    if (strict) {
      throw new BackupError('BACKUP_ARCHIVE_DIR_INVALID', `${ARCHIVE_DIR_ENV} 未配置（生产环境必须显式指定绝对路径）`);
    }
    return path.join(codeRoot, 'backups', 'archive');
  }
  if (!path.isAbsolute(raw)) {
    throw new BackupError('BACKUP_ARCHIVE_DIR_INVALID', `${ARCHIVE_DIR_ENV} 必须是绝对路径：${raw}`);
  }
  const resolved = path.resolve(raw);
  const root = path.resolve(codeRoot);
  if (resolved === root || resolved.startsWith(root + path.sep)) {
    throw new BackupError('BACKUP_ARCHIVE_DIR_INVALID', `${ARCHIVE_DIR_ENV} 不得位于代码目录内：${resolved}`);
  }
  if (resolved.split(path.sep).filter(Boolean).length < 2) {
    throw new BackupError('BACKUP_ARCHIVE_DIR_INVALID', `${ARCHIVE_DIR_ENV} 过浅（禁止 /var 级别的路径）：${resolved}`);
  }
  return resolved;
}

function canonical(dir: string): string {
  const abs = path.resolve(dir);
  try {
    return fs.realpathSync.native(abs);
  } catch {
    return abs;
  }
}

/** root 的真实路径（root 自身允许是符号链接，例如 /opt/rdpms -> 数据盘）。 */
export function canonicalRoot(root: string): string {
  return canonical(root);
}

/**
 * 把"库里的相对/绝对路径"解析成受约束的绝对路径：
 *   - 必须落在 root 内（含 root 自身的符号链接解析）；
 *   - 路径上任何一级已存在的符号链接一律拒绝。
 */
export function resolveArtifactPath(root: string, target: string): string {
  const base = canonicalRoot(root);
  const abs = path.resolve(base, target);
  const rel = path.relative(base, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new BackupError('BACKUP_PATH_REJECTED', `路径越界：${target}（根 ${base}）`);
  }
  let cursor = base;
  for (const segment of rel.split(path.sep)) {
    cursor = path.join(cursor, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(cursor);
    } catch {
      break; // 该级尚不存在：后面由调用方创建，不存在"既有符号链接"风险
    }
    if (stat.isSymbolicLink()) {
      throw new BackupError('BACKUP_PATH_REJECTED', `拒绝符号链接路径：${cursor}`);
    }
  }
  return abs;
}

/** 相对 root 的展示路径（用于落库 file_path，避免把可变前缀写死）。 */
export function relativeToRoot(root: string, target: string): string {
  return path.relative(canonicalRoot(root), path.resolve(target)).split(path.sep).join('/');
}

/** 创建归档根目录（0700）；已存在时校验可写且不是符号链接。 */
export function ensureArchiveRoot(root: string): string {
  const existing = fs.existsSync(root);
  if (existing) {
    const stat = fs.lstatSync(root);
    if (stat.isSymbolicLink()) throw new BackupError('BACKUP_PATH_REJECTED', `归档根目录是符号链接：${root}`);
    if (!stat.isDirectory()) throw new BackupError('BACKUP_ARCHIVE_DIR_INVALID', `归档根目录不是目录：${root}`);
  } else {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  try {
    fs.accessSync(root, fs.constants.W_OK | fs.constants.X_OK);
  } catch {
    throw new BackupError('BACKUP_ARCHIVE_DIR_INVALID', `归档根目录不可写：${root}`);
  }
  return canonicalRoot(root);
}
