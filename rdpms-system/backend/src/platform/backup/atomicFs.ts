/**
 * platform/backup/atomicFs.ts —— 归档产物的原子落盘/清理原语。
 *
 * 为什么需要：
 *   - meta.json 必须在"文件落盘 + fsync"后才对外可见，否则崩溃会留下"半截 meta"，
 *     而校验逻辑完全依赖 meta 判定备份是否可用；
 *   - 发布整份备份用**目录级 rename**（同文件系统内原子），避免读者看到半份产物；
 *   - 清理只允许删本人工作区（未登记的一律 fail-closed 不删）。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { BackupError } from './errors.js';
import { ensureArchiveRoot, resolveArtifactPath } from './paths.js';

/** 原子写文件：同目录临时名 → fsync → rename → fsync 父目录。 */
export async function atomicWriteFile(file: string, data: Buffer | string, mode = 0o600): Promise<void> {
  const body = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  const handle = await fsp.open(tmp, 'w', mode);
  try {
    await handle.writeFile(body);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsp.rename(tmp, file);
  await fsyncDir(dir);
}

export async function fsyncDir(dir: string): Promise<void> {
  let handle;
  try {
    handle = await fsp.open(dir, 'r');
    await handle.sync();
  } catch {
    // 目录 fsync 在部分文件系统上不支持：不因此判定备份失败
  } finally {
    await handle?.close();
  }
}

/** 创建 0700 的私有工作区（位于归档根目录内的 .work/ 下）。 */
export async function createWorkspace(root: string, jobId: string): Promise<string> {
  const base = ensureArchiveRoot(root);
  const workRoot = resolveArtifactPath(base, '.work');
  await fsp.mkdir(workRoot, { recursive: true, mode: 0o700 });
  const dir = resolveArtifactPath(base, path.join('.work', jobId));
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * 清扫陈旧工作区（<root>/.work/<jobId>）。
 *
 * 为什么必须有：pg_dump 的**明文** dump 先落在工作区，加密后才发布；若进程在
 * 加密前被 kill/掉电，工作区会连同明文一起留在磁盘上（0700，但仍是明文整库 dump）。
 * 因此每次作业开始前清扫超过阈值的工作区；阈值远大于单份 dump 超时（默认 30 分钟），
 * 不会误删正在进行的作业。
 */
export async function sweepStaleWorkspaces(root: string, olderThanMs = 12 * 60 * 60 * 1000): Promise<string[]> {
  const base = ensureArchiveRoot(root);
  const workRoot = resolveArtifactPath(base, '.work');
  if (!fs.existsSync(workRoot)) return [];
  const removed: string[] = [];
  const now = Date.now();
  const entries = await fsp.readdir(workRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const dir = path.join(workRoot, entry.name);
    const stat = await fsp.lstat(dir).catch(() => null);
    if (!stat || stat.isSymbolicLink()) continue;
    if (now - stat.mtimeMs < olderThanMs) continue;
    const target = resolveArtifactPath(base, path.join('.work', entry.name));
    await fsp.rm(target, { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}

/** 目录级原子发布：rename 到 <root>/<day>/<name>；目标已存在则拒绝覆盖。 */
export async function publishDir(root: string, workspace: string, dayDir: string, name: string): Promise<string> {
  const base = ensureArchiveRoot(root);
  const targetDir = resolveArtifactPath(base, path.join(dayDir, name));
  await fsp.mkdir(path.dirname(targetDir), { recursive: true, mode: 0o700 });
  if (fs.existsSync(targetDir)) {
    throw new BackupError('BACKUP_PATH_REJECTED', `发布目标已存在，拒绝覆盖：${targetDir}`);
  }
  await fsp.rename(workspace, targetDir);
  await fsyncDir(path.dirname(targetDir));
  return targetDir;
}

/**
 * 删除自己的工作区/产物目录。
 * 传 root 时先过路径守卫；未登记的目录由调用方决定是否跳过（见 retention.ts）。
 */
export async function removeArtifactDir(root: string, dir: string): Promise<void> {
  const target = resolveArtifactPath(root, dir);
  await fsp.rm(target, { recursive: true, force: true });
}

export async function dirSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const walk = async (current: string): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue; // 不跟随符号链接，避免统计越界/自环
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files += 1;
        try {
          bytes += (await fsp.stat(full)).size;
        } catch {
          /* 文件刚被清理：忽略 */
        }
      }
    }
  };
  await walk(dir);
  return { bytes, files };
}
