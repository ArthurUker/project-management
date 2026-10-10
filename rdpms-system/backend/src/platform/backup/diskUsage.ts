/**
 * platform/backup/diskUsage.ts —— 磁盘水位与归档占用统计。
 *
 * 用于两件事：
 *   1. 备份**开始前**的门禁：可用空间低于阈值直接拒绝（fail-closed），
 *      占用率过高只告警不阻断（否则磁盘快满时反而无法补一份备份）；
 *   2. 控制台「存储用量」页：挂载水位 + 归档目录总量/份数/按天分布 + 其它备份目录占用。
 */
import fsp from 'node:fs/promises';
import { BackupError } from './errors.js';
import { dirSize } from './atomicFs.js';
import { backupDayDir, canonicalRoot } from './paths.js';

export const DISK_WARN_PCT_ENV = 'BACKUP_WARN_PCT';
export const DISK_MIN_FREE_MB_ENV = 'BACKUP_MIN_FREE_MB';
const DEFAULT_WARN_PCT = 90;
const DEFAULT_MIN_FREE_MB = 1024;

export interface MountUsage {
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usagePct: number;
}

export interface DiskGuardResult {
  mount: MountUsage;
  minFreeBytes: number;
  warnPct: number;
  level: 'ok' | 'warn' | 'low';
  warnings: string[];
}

export interface DirUsage {
  dir: string;
  bytes: number;
  files: number;
}

export interface DayUsage {
  day: string;
  bytes: number;
  count: number;
}

export interface ArchiveUsage {
  root: string;
  exists: boolean;
  totalBytes: number;
  count: number;
  byDay: DayUsage[];
  workBytes: number;
}

export function diskThresholds(env: NodeJS.ProcessEnv = process.env): { warnPct: number; minFreeMb: number } {
  const warnRaw = Number(env[DISK_WARN_PCT_ENV] ?? DEFAULT_WARN_PCT);
  const freeRaw = Number(env[DISK_MIN_FREE_MB_ENV] ?? DEFAULT_MIN_FREE_MB);
  const warnPct = Number.isFinite(warnRaw) && warnRaw > 0 && warnRaw <= 100 ? warnRaw : DEFAULT_WARN_PCT;
  const minFreeMb = Number.isFinite(freeRaw) && freeRaw >= 0 ? freeRaw : DEFAULT_MIN_FREE_MB;
  return { warnPct, minFreeMb };
}

export async function statMount(target: string): Promise<MountUsage> {
  const stats = await fsp.statfs(target);
  const blockSize = Number(stats.bsize);
  const totalBytes = Number(stats.blocks) * blockSize;
  const freeBytes = Number(stats.bavail) * blockSize;
  const usedBytes = totalBytes - Number(stats.bfree) * blockSize;
  return {
    path: target,
    totalBytes,
    freeBytes,
    usedBytes,
    usagePct: totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0,
  };
}

/** 备份前门禁：不足 minFreeMb 抛 BACKUP_DISK_LOW；超过 warnPct 仅记警告。 */
export async function guardDiskSpace(target: string, env: NodeJS.ProcessEnv = process.env): Promise<DiskGuardResult> {
  const { warnPct, minFreeMb } = diskThresholds(env);
  const mount = await statMount(target);
  const minFreeBytes = minFreeMb * 1024 * 1024;
  const warnings: string[] = [];
  if (mount.freeBytes < minFreeBytes) {
    throw new BackupError(
      'BACKUP_DISK_LOW',
      `可用空间不足：剩余 ${(mount.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB，要求 ≥ ${minFreeMb} MB`,
    );
  }
  if (mount.usagePct >= warnPct) {
    warnings.push(`磁盘占用 ${mount.usagePct}% 已达告警线 ${warnPct}%`);
  }
  return { mount, minFreeBytes, warnPct, level: warnings.length ? 'warn' : 'ok', warnings };
}

export async function dirUsage(dir: string): Promise<DirUsage> {
  const { bytes, files } = await dirSize(dir);
  return { dir, bytes, files };
}

/**
 * 归档目录用量：按 <root>/<YYYY-MM-DD>/<产物目录> 聚合。
 * 只统计日期目录下的产物，.work/ 单独报（未发布的半成品不算正式备份）。
 */
export async function archiveUsage(root: string): Promise<ArchiveUsage> {
  const base = canonicalRoot(root);
  let dayEntries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    dayEntries = await fsp.readdir(base, { withFileTypes: true });
  } catch {
    return { root: base, exists: false, totalBytes: 0, count: 0, byDay: [], workBytes: 0 };
  }
  const byDay: DayUsage[] = [];
  let totalBytes = 0;
  let count = 0;
  let workBytes = 0;
  for (const entry of dayEntries) {
    if (!entry.isDirectory()) continue;
    const dir = `${base}/${entry.name}`;
    if (entry.name === '.work') {
      workBytes = (await dirSize(dir)).bytes;
      continue;
    }
    // 只认日期目录（YYYY-MM-DD），其它目录不参与统计也不参与清理
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    const artifacts = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    let dayBytes = 0;
    let dayCount = 0;
    for (const artifact of artifacts) {
      if (!artifact.isDirectory()) continue;
      const { bytes } = await dirSize(`${dir}/${artifact.name}`);
      dayBytes += bytes;
      dayCount += 1;
    }
    totalBytes += dayBytes;
    count += dayCount;
    if (dayCount > 0) byDay.push({ day: entry.name, bytes: dayBytes, count: dayCount });
  }
  byDay.sort((a, b) => (a.day < b.day ? 1 : -1));
  return { root: base, exists: true, totalBytes, count, byDay, workBytes };
}

export const todayDayDir = backupDayDir;
