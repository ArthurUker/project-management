/**
 * platform/backup/artifactMeta.ts —— 归档产物 meta.json 的形状与校验。
 *
 * meta.json 是"该备份是否可用"的唯一依据：加密参数、明文校验和、表清单、
 * 快照与对账结果都在这里。因此：
 *   - 写入必须是原子的（见 atomicFs.atomicWriteFile），不能出现半截 meta；
 *   - 读取必须先过 validateArtifactMeta()，字段缺失/类型错立即拒绝，
 *     不允许"缺字段就当默认值"——那会让损坏的备份看起来像正常备份。
 */
import { BackupError } from './errors.js';
import { parseEnvelope, type BackupEnvelope } from './kms.js';
import { JOB_ID_PATTERN } from './paths.js';

export const ARTIFACT_META_VERSION = 1;
export const DUMP_FORMAT = 'pg_dump-custom';
export const COMPRESSION = 'pg_dump -Fc -Z6';

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface SchemaTable {
  table: string;
  columns: SchemaColumn[];
}

export interface TocSummary {
  tables: string[];
  dataEntries: number;
  entries: number;
}

export interface CountsCrossCheck {
  mode: 'toc-vs-snapshot';
  result: 'passed' | 'failed';
  tables: number;
  missing: string[];
  extra: string[];
}

export interface ArtifactMeta extends BackupEnvelope {
  version: number;
  jobId: string;
  base: string;
  runType: string;
  scope: string;
  dumpFormat: string;
  compression: string;
  /** 加密前 .dump 的 sha256（解密后必须复算出同一个值） */
  sha256: string;
  /** .aes 文件字节数 */
  fileSize: number;
  /** 解密后 .dump 字节数（对齐用，可选） */
  plainBytes: number;
  createdAt: string;
  /** "public.projects" → 快照时刻的行数（排除 excludedTables） */
  tableCounts: Record<string, number>;
  tableCount: number;
  excludedTables: string[];
  schemaSnapshot: SchemaTable[] | null;
  snapshotMode: 'exported' | 'live';
  toc: TocSummary | null;
  countsCrossCheck: CountsCrossCheck | null;
  runId: string | null;
  archiveDir: string | null;
  tool: { node: string; pgDump: string };
}

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function fail(message: string): never {
  throw new BackupError('BACKUP_META_INVALID', message);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) fail(`meta.${field} 缺失或非字符串`);
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(`meta.${field} 缺失或非法`);
  return value;
}

/** 严格校验 meta；任何不确定的字段组合都拒绝（不做默认值兜底）。 */
export function validateArtifactMeta(value: unknown): ArtifactMeta {
  if (!value || typeof value !== 'object') fail('meta.json 不是对象');
  const raw = value as Record<string, unknown>;
  if (raw.version !== ARTIFACT_META_VERSION) {
    fail(`不支持的 meta.version=${String(raw.version)}（当前支持 ${ARTIFACT_META_VERSION}）`);
  }
  const jobId = asString(raw.jobId, 'jobId');
  if (!JOB_ID_PATTERN.test(jobId)) fail(`meta.jobId 格式非法：${jobId}`);
  const sha256 = asString(raw.sha256, 'sha256');
  if (!SHA256_PATTERN.test(sha256)) fail('meta.sha256 必须是 64 位小写十六进制');
  const tableCountsRaw = raw.tableCounts;
  if (!tableCountsRaw || typeof tableCountsRaw !== 'object' || Array.isArray(tableCountsRaw)) {
    fail('meta.tableCounts 缺失或不是对象');
  }
  const tableCounts: Record<string, number> = {};
  for (const [key, rows] of Object.entries(tableCountsRaw as Record<string, unknown>)) {
    if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 0) fail(`meta.tableCounts["${key}"] 非法`);
    tableCounts[key] = rows;
  }
  const envelope = parseEnvelope(raw);
  const snapshotMode = raw.snapshotMode === 'live' ? 'live' : raw.snapshotMode === 'exported' ? 'exported' : null;
  if (!snapshotMode) fail(`meta.snapshotMode 非法：${String(raw.snapshotMode)}`);
  const runId = raw.runId === null || raw.runId === undefined ? null : asString(raw.runId, 'runId');
  const archiveDir = raw.archiveDir === null || raw.archiveDir === undefined ? null : asString(raw.archiveDir, 'archiveDir');
  const tool = (raw.tool ?? {}) as Record<string, unknown>;
  const meta: ArtifactMeta = {
    ...envelope,
    version: ARTIFACT_META_VERSION,
    jobId,
    base: asString(raw.base, 'base'),
    runType: typeof raw.runType === 'string' && raw.runType ? raw.runType : 'manual',
    scope: typeof raw.scope === 'string' && raw.scope ? raw.scope : 'all',
    dumpFormat: typeof raw.dumpFormat === 'string' && raw.dumpFormat ? raw.dumpFormat : DUMP_FORMAT,
    compression: typeof raw.compression === 'string' && raw.compression ? raw.compression : COMPRESSION,
    sha256,
    fileSize: asNumber(raw.fileSize, 'fileSize'),
    plainBytes: typeof raw.plainBytes === 'number' ? raw.plainBytes : 0,
    createdAt: asString(raw.createdAt, 'createdAt'),
    tableCounts,
    tableCount: Object.keys(tableCounts).length,
    excludedTables: Array.isArray(raw.excludedTables) ? raw.excludedTables.map((t) => String(t)) : [],
    schemaSnapshot: Array.isArray(raw.schemaSnapshot) ? (raw.schemaSnapshot as SchemaTable[]) : null,
    snapshotMode,
    toc: (raw.toc as TocSummary | null) ?? null,
    countsCrossCheck: (raw.countsCrossCheck as CountsCrossCheck | null) ?? null,
    runId,
    archiveDir,
    tool: { node: String(tool.node ?? ''), pgDump: String(tool.pgDump ?? '') },
  };
  return meta;
}

export function artifactFileNames(base: string): { aes: string; meta: string } {
  return { aes: `${base}.dump.aes`, meta: `${base}.meta.json` };
}
