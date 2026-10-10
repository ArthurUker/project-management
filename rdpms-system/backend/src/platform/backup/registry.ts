/**
 * platform/backup/registry.ts —— 归档产物目录的扫描与"文件系统 vs DB"一致性对账。
 *
 * 为什么要有这一层：
 *   历史列表若只读 DB，会出现"文件被手工删掉但列表还显示可下载"；
 *   若只读目录，又会出现"DB 里没有登记、无人认领的孤儿目录"。
 *   因此 UI 与清理逻辑都以**文件系统为准 + DB 标记登记状态**，两边差异显式暴露。
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { dirSize } from './atomicFs.js';
import { validateArtifactMeta, type ArtifactMeta } from './artifactMeta.js';
import { canonicalRoot, JOB_ID_PATTERN, jobIdFromDirName } from './paths.js';

export interface ArtifactRef {
  jobId: string;
  /** 相对归档根的目录路径，例如 2026-10-09/rdpms-20261009T170000.backup-20261009T090000-ab12cd34 */
  dir: string;
  dayDir: string;
  aesPath: string;
  metaPath: string;
  meta: ArtifactMeta | null;
  metaError: string | null;
  bytes: number;
  files: number;
  createdAtMs: number;
}

const DAY_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 扫描归档根目录下所有"看起来像产物"的目录（不含 .work）。 */
export async function scanArtifacts(root: string): Promise<ArtifactRef[]> {
  const base = canonicalRoot(root);
  const result: ArtifactRef[] = [];
  let dayEntries;
  try {
    dayEntries = await fsp.readdir(base, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const dayEntry of dayEntries) {
    if (!dayEntry.isDirectory() || !DAY_DIR_PATTERN.test(dayEntry.name) || dayEntry.name === '.work') continue;
    const dayPath = path.join(base, dayEntry.name);
    let artifactEntries;
    try {
      artifactEntries = await fsp.readdir(dayPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const artifact of artifactEntries) {
      if (!artifact.isDirectory()) continue;
      const dirAbs = path.join(dayPath, artifact.name);
      const relDir = `${dayEntry.name}/${artifact.name}`;
      const { bytes, files } = await dirSize(dirAbs);
      const names = await fsp.readdir(dirAbs).catch(() => [] as string[]);
      const metaName = names.find((n) => n.endsWith('.meta.json')) ?? null;
      const aesName = names.find((n) => n.endsWith('.dump.aes')) ?? null;
      const metaPath = metaName ? path.join(dirAbs, metaName) : path.join(dirAbs, `${artifact.name}.meta.json`);
      const aesPath = aesName ? path.join(dirAbs, aesName) : path.join(dirAbs, `${artifact.name}.dump.aes`);
      let meta: ArtifactMeta | null = null;
      let metaError: string | null = null;
      if (metaName) {
        try {
          meta = validateArtifactMeta(JSON.parse(await fsp.readFile(metaPath, 'utf8')));
        } catch (err) {
          metaError = err instanceof Error ? err.message : String(err);
        }
      } else {
        metaError = '目录内没有 meta.json';
      }
      const jobId = meta?.jobId ?? (JOB_ID_PATTERN.test(artifact.name) ? artifact.name : '');
      let createdAtMs = meta ? Date.parse(meta.createdAt) : Number.NaN;
      if (!Number.isFinite(createdAtMs)) {
        const stat = await fsp.stat(dirAbs).catch(() => null);
        createdAtMs = stat?.mtimeMs ?? 0;
      }
      result.push({
        jobId,
        dir: relDir,
        dayDir: dayEntry.name,
        aesPath,
        metaPath,
        meta,
        metaError,
        bytes,
        files,
        createdAtMs,
      });
    }
  }
  return result.sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export { jobIdFromDirName };
