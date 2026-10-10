/**
 * platform/backup/archive.ts —— 归档备份作业（运维级文件备份的应用内实现）。
 *
 * 定位：与既有的**应用层 JSON 导出/恢复**（routes/backup.js + kernel/backupRestore.js）互补。
 *   应用层 JSON：模块级、可在线自助回灌、覆盖 27 张业务表；
 *   本模块归档：整库 `pg_dump -Fc` + AES-256-GCM 加密 + 历史/校验/保留/磁盘视图，
 *               面向"灾难恢复"，恢复动作仍由运维执行 pg_restore（不在应用内做整库覆盖）。
 *
 * 一次作业的步骤（对照 /opt/foodsentinel 的 backupService.js + backupJobs.js）：
 *   0. fail-closed 前置：主密钥必须存在；归档目录必须是配置好的绝对路径；磁盘余量达标
 *   1. 单事务内：取 advisory lock → 逐表 count(*) → 读列结构 → pg_export_snapshot()
 *   2. 保持事务打开，pg_dump --snapshot=<id> 落盘到 0700 工作区
 *   3. pg_restore -l 解析 TOC，与快照表清单对账（表级；缺表即判定失败，不登记 ok）
 *   4. AES-256-GCM 加密 → 写 meta.json → 目录级 rename 原子发布到 <root>/<day>/<base>.<jobId>/
 *   5. 事务内登记 backup_archives 行 → 回写 meta.runId
 *   6. 保留策略（按天数/份数，未登记目录一律不动）
 *
 * 已知代价（沿用参考实现的取舍）：整个 dump 期间持有一个 interactive transaction
 * （快照必须由导出的那个事务维持），长事务占一个连接；生产连接池 10，属可接受范围。
 */
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { BackupError, isBackupError } from './errors.js';
import { requireMasterKey, encryptBuffer } from './kms.js';
import {
  ARTIFACT_META_VERSION,
  COMPRESSION,
  DUMP_FORMAT,
  artifactFileNames,
  type ArtifactMeta,
  type CountsCrossCheck,
  type SchemaTable,
} from './artifactMeta.js';
import {
  atomicWriteFile,
  createWorkspace,
  dirSize,
  publishDir,
  removeArtifactDir,
  sweepStaleWorkspaces,
} from './atomicFs.js';
import {
  archiveBaseName,
  backupDayDir,
  ensureArchiveRoot,
  newJobId,
  relativeToRoot,
  resolveArchiveRoot,
} from './paths.js';
import { guardDiskSpace, type MountUsage } from './diskUsage.js';
import { pgConnectionString, readTocFromFile, resolvePgBin, runCommand } from './pgTools.js';
import { applyRetention, planRetention, retentionConfig, type RetentionEntry, type RetentionOutcome } from './retention.js';
import { scanArtifacts } from './registry.js';

/** advisory lock 的命名空间键：同库内归档备份互斥（恢复走 pg_restore，不共享此锁）。 */
export const BACKUP_LOCK_CLASS = 'rdpms:backup:archive';
export const DUMP_TIMEOUT_ENV = 'BACKUP_DUMP_TIMEOUT_MS';
/** pg_dump 不导出系统 schema；对账时排除 Prisma 迁移表（业务备份不关心它的行数）。 */
export const EXCLUDED_TABLES = ['public._prisma_migrations'];
const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];
const DEFAULT_DUMP_TIMEOUT_MS = 30 * 60 * 1000;
const COUNT_CHUNK = 25;

export const ARCHIVE_RUN_TYPES = ['manual', 'scheduled', 'predeploy'] as const;
export type ArchiveRunType = (typeof ARCHIVE_RUN_TYPES)[number];

export interface RunArchiveOptions {
  prisma: PrismaClient;
  env?: NodeJS.ProcessEnv;
  codeRoot?: string;
  runType?: ArchiveRunType;
  scope?: string;
  actorId?: string | null;
  now?: Date;
  log?: (line: string) => void;
  /** 跳过保留策略（演练/调试用；生产不要开） */
  skipRetention?: boolean;
}

export interface RunArchiveResult {
  status: 'ok';
  jobId: string;
  runId: string;
  base: string;
  /** 相对归档根目录的产物路径 */
  dir: string;
  aesPath: string;
  metaPath: string;
  fileSize: number;
  plainBytes: number;
  sha256: string;
  tableCount: number;
  snapshotMode: 'exported' | 'live';
  countsCrossCheck: CountsCrossCheck;
  durationMs: number;
  mount: MountUsage;
  warnings: string[];
  retention: RetentionOutcome | null;
}

export interface FailureRecord {
  jobId: string;
  code: string;
  message: string;
  durationMs: number;
  runType: ArchiveRunType;
  actorId: string | null;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qualifiedParts(qualified: string): { schema: string; table: string } {
  const idx = qualified.indexOf('.');
  return { schema: qualified.slice(0, idx), table: qualified.slice(idx + 1) };
}

/**
 * 参与备份的表：所有非系统 schema 的普通表/分区表（pg_dump 会导出它们）。
 *
 * 附带权限预检：只要有一张表当前角色读不到，就直接失败并列出表名 ——
 * 静默跳过会产出"看起来成功的缺表备份"，比备份失败危险得多。
 * （生产实证：由 postgres 等非 rdpms_migrate 角色手工建的表不会命中
 *   `ALTER DEFAULT PRIVILEGES ... TO rdpms_app`，此前的表现是一个不透明的内部错误。）
 */
async function listBackupTables(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ qualified: string; kind: string; readable: boolean }>>`
    SELECT n.nspname || '.' || c.relname AS qualified,
           CASE WHEN c.relkind = 'S' THEN 'sequence' ELSE 'table' END AS kind,
           CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(c.oid, 'SELECT')
                ELSE has_table_privilege(c.oid, 'SELECT') END AS readable
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'S')
       AND n.nspname <> ALL (${SYSTEM_SCHEMAS}::text[])
     ORDER BY n.nspname, c.relname
  `;
  const unreadable = (kind: string): string[] =>
    rows.filter((row) => row.kind === kind && !row.readable).map((row) => row.qualified);
  const badTables = unreadable('table');
  const badSequences = unreadable('sequence');
  if (badTables.length > 0 || badSequences.length > 0) {
    const brief = (list: string[]): string => `${list.slice(0, 20).join(', ')}${list.length > 20 ? ' …' : ''}`;
    throw new BackupError(
      'BACKUP_PRIVILEGE_DENIED',
      `当前角色读不到 ${badTables.length} 张表 / ${badSequences.length} 个序列，拒绝生成"缺表"的备份`,
      `表：${brief(badTables) || '—'}；序列：${brief(badSequences) || '—'}；` +
        `请补 GRANT SELECT ON TABLE / SEQUENCE（pg_dump 需要序列上的 SELECT 才能读 last_value），` +
        `或把 BACKUP_PG_DUMP_DSN 指向具备完整读权限的角色`,
    );
  }
  return rows
    .filter((row) => row.kind === 'table')
    .map((row) => row.qualified)
    .filter((table) => !EXCLUDED_TABLES.includes(table))
    .sort();
}

/** 逐表行数（同一快照内），单次往返批量取。 */
async function countRows(tx: Prisma.TransactionClient, tables: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let offset = 0; offset < tables.length; offset += COUNT_CHUNK) {
    const chunk = tables.slice(offset, offset + COUNT_CHUNK);
    // 表名来自 pg_class（非用户输入）且已按标识符规则加引号，无注入面。
    const sql = chunk
      .map((table) => {
        const { schema, table: name } = qualifiedParts(table);
        const literal = table.replace(/'/g, "''");
        return `SELECT '${literal}' AS tbl, count(*)::bigint AS rows FROM ${quoteIdent(schema)}.${quoteIdent(name)}`;
      })
      .join(' UNION ALL ');
    const rows = await tx.$queryRawUnsafe<Array<{ tbl: string; rows: bigint | number }>>(sql);
    for (const row of rows) counts[row.tbl] = Number(row.rows);
  }
  return counts;
}

async function readSchemaSnapshot(tx: Prisma.TransactionClient): Promise<SchemaTable[]> {
  const rows = await tx.$queryRaw<
    Array<{ table_name: string; table_schema: string; column_name: string; data_type: string; is_nullable: string }>
  >`
    SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable
      FROM information_schema.columns c
     WHERE c.table_schema <> ALL (${SYSTEM_SCHEMAS}::text[])
     ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `;
  const grouped = new Map<string, SchemaTable>();
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (EXCLUDED_TABLES.includes(key)) continue;
    const entry = grouped.get(key) ?? { table: key, columns: [] };
    entry.columns.push({ name: row.column_name, type: row.data_type, nullable: row.is_nullable === 'YES' });
    grouped.set(key, entry);
  }
  return [...grouped.values()].sort((a, b) => a.table.localeCompare(b.table));
}

async function tryArchiveLock(tx: Prisma.TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ locked: number }>>`
    SELECT pg_try_advisory_xact_lock(hashtext(${BACKUP_LOCK_CLASS})::bigint)::int AS locked
  `;
  return Number(rows[0]?.locked ?? 0) === 1;
}

/** 导出快照 id；PG 不支持时返回 null（作业降级为 live，并记入 meta 与告警）。 */
async function exportSnapshot(tx: Prisma.TransactionClient): Promise<string | null> {
  try {
    const rows = await tx.$queryRaw<Array<{ snapshot: string }>>`SELECT pg_export_snapshot() AS snapshot`;
    return rows[0]?.snapshot ?? null;
  } catch {
    return null;
  }
}

interface PgDumpOptions {
  dumpPath: string;
  dsn: string;
  snapshotId: string | null;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  log: (line: string) => void;
}

/** 执行 pg_dump；snapshot 不被支持时自动降级重跑一次（记 live）。 */
async function runPgDump(options: PgDumpOptions): Promise<{ snapshotMode: 'exported' | 'live'; warnings: string[] }> {
  const bin = resolvePgBin('dump', options.env);
  const baseArgs = [
    `--dbname=${options.dsn}`,
    '--format=custom',
    '--compress=6',
    '--no-owner',
    '--no-acl',
    '--lock-wait-timeout=30',
  ];
  const warnings: string[] = [];
  const attempt = async (snapshotId: string | null) => {
    const args = [...baseArgs, ...(snapshotId ? [`--snapshot=${snapshotId}`] : []), `--file=${options.dumpPath}`];
    options.log(`${bin} ${args.filter((a) => !a.startsWith('--dbname')).join(' ')}`);
    return runCommand(bin, args, { timeoutMs: options.timeoutMs });
  };

  let result = await attempt(options.snapshotId);
  if (result.code !== 0 && options.snapshotId && /snapshot/i.test(result.stderr)) {
    warnings.push('pg_dump 不支持 --snapshot，本次降级为 live 模式（一致性靠单事务内计数对账）');
    result = await attempt(null);
  }
  if (result.timedOut) {
    throw new BackupError('BACKUP_PG_DUMP_FAILED', `pg_dump 超时（${options.timeoutMs} ms）`);
  }
  if (result.code !== 0) {
    throw new BackupError('BACKUP_PG_DUMP_FAILED', `pg_dump 失败：${result.stderr.trim() || `退出码 ${result.code}`}`);
  }
  return { snapshotMode: options.snapshotId ? 'exported' : 'live', warnings };
}

/** 表级对账：TOC 的表集合必须覆盖 meta 记录的表；TOC 多出的（其它 schema/扩展表）只记警告。 */
export function crossCheckTables(
  metaTables: string[],
  tocTables: string[],
): { cross: CountsCrossCheck; warnings: string[] } {
  const toc = new Set(tocTables);
  const meta = new Set(metaTables);
  const missing = metaTables.filter((t) => !toc.has(t)).sort();
  const extra = tocTables.filter((t) => !meta.has(t)).sort();
  const cross: CountsCrossCheck = {
    mode: 'toc-vs-snapshot',
    result: missing.length === 0 ? 'passed' : 'failed',
    tables: metaTables.length,
    missing,
    extra,
  };
  const warnings = extra.length ? [`归档包含未纳入计数范围的对象：${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ' …' : ''}`] : [];
  return { cross, warnings };
}

async function registerFailure(prisma: PrismaClient, failure: FailureRecord): Promise<void> {
  try {
    await prisma.backupArchive.create({
      data: {
        jobId: failure.jobId,
        runType: failure.runType,
        scope: 'all',
        status: 'failed',
        verifyStatus: 'unknown',
        dirPath: '',
        aesPath: '',
        metaPath: '',
        fileSize: 0n,
        checksum: '',
        snapshotMode: 'live',
        tableCounts: {},
        tableCount: 0,
        durationMs: failure.durationMs,
        failureCode: failure.code,
        failureDetail: failure.message.slice(0, 1000),
        createdById: failure.actorId,
      },
    });
  } catch (err) {
    console.error('[backup/archive] 失败记录写入 backup_archives 失败：', err);
  }
}

/** 归档作业主体。失败一律抛 BackupError（已尽力登记失败行），不返回半成品结果。 */
export async function runArchive(options: RunArchiveOptions): Promise<RunArchiveResult> {
  const env = options.env ?? process.env;
  const log = options.log ?? (() => {});
  const now = options.now ?? new Date();
  const runType: ArchiveRunType = options.runType ?? 'manual';
  const started = Date.now();
  const master = requireMasterKey(env);
  const root = ensureArchiveRoot(resolveArchiveRoot(env, options.codeRoot ?? process.cwd()));
  const guard = await guardDiskSpace(root, env);
  const warnings = [...guard.warnings];
  const jobId = newJobId(now);
  const base = archiveBaseName(now);
  const dayDir = backupDayDir(now);
  const { aes: aesName, meta: metaName } = artifactFileNames(base);
  const dumpTimeoutMs = Number(env[DUMP_TIMEOUT_ENV] ?? DEFAULT_DUMP_TIMEOUT_MS);
  // 先清陈旧的 .work（可能残留"加密前被中断"的明文 dump），再开自己的工作区
  const swept = await sweepStaleWorkspaces(root).catch(() => [] as string[]);
  if (swept.length > 0) {
    warnings.push(`已清扫 ${swept.length} 个陈旧工作区（>12h 未完成，可能含未加密明文）`);
  }
  const workspace = await createWorkspace(root, jobId);

  try {
    const outcome = await options.prisma.$transaction(
      async (tx) => {
        if (!(await tryArchiveLock(tx))) {
          throw new BackupError('BACKUP_LOCK_BUSY', '另一个归档备份正在进行（advisory lock 被占用）');
        }
        const tables = await listBackupTables(tx);
        if (tables.length === 0) {
          throw new BackupError('BACKUP_CONSISTENCY_FAILED', '未发现任何可备份的表（库名/权限是否正确？）');
        }
        log(`快照内计数 ${tables.length} 张表…`);
        const tableCounts = await countRows(tx, tables);
        const schemaSnapshot = await readSchemaSnapshot(tx);
        const snapshotId = await exportSnapshot(tx);
        if (!snapshotId) warnings.push('未能导出一致性快照（pg_export_snapshot 不可用），本次按 live 模式记录');

        const dumpPath = path.join(workspace, `${base}.dump`);
        const dump = await runPgDump({
          dumpPath,
          dsn: pgConnectionString(env),
          snapshotId,
          env,
          timeoutMs: dumpTimeoutMs,
          log,
        });
        warnings.push(...dump.warnings);

        log('解析归档 TOC 并对账表清单…');
        const toc = await readTocFromFile(dumpPath, env);
        const { cross } = crossCheckTables(tables, toc.tables);
        // 有意排除的表（_prisma_migrations）不算"意外多出的对象"，不必每次都刷告警
        const notableExtra = cross.extra.filter((table) => !EXCLUDED_TABLES.includes(table));
        if (notableExtra.length > 0) {
          warnings.push(
            `归档包含未纳入计数范围的对象：${notableExtra.slice(0, 5).join(', ')}${notableExtra.length > 5 ? ' …' : ''}`,
          );
        }
        if (cross.result === 'failed') {
          throw new BackupError(
            'BACKUP_CONSISTENCY_FAILED',
            `归档与快照表清单不一致：缺少 ${cross.missing.slice(0, 5).join(', ')}${cross.missing.length > 5 ? ' …' : ''}`,
          );
        }

        const plain = await fsp.readFile(dumpPath);
        const sha256 = crypto.createHash('sha256').update(plain).digest('hex');
        log(`加密归档（明文 ${plain.length} 字节）…`);
        const { cipher, envelope } = encryptBuffer(plain, master);

        const meta: ArtifactMeta = {
          ...envelope,
          version: ARTIFACT_META_VERSION,
          jobId,
          base,
          runType,
          scope: options.scope ?? 'all',
          dumpFormat: DUMP_FORMAT,
          compression: COMPRESSION,
          sha256,
          fileSize: cipher.length,
          plainBytes: plain.length,
          createdAt: now.toISOString(),
          tableCounts,
          tableCount: tables.length,
          excludedTables: EXCLUDED_TABLES,
          schemaSnapshot,
          snapshotMode: dump.snapshotMode,
          toc: { tables: toc.tables, dataEntries: toc.dataEntries, entries: toc.entries },
          countsCrossCheck: cross,
          runId: null,
          archiveDir: null,
          tool: { node: process.version, pgDump: resolvePgBin('dump', env) },
        };

        await atomicWriteFile(path.join(workspace, aesName), cipher);
        await atomicWriteFile(path.join(workspace, metaName), `${JSON.stringify(meta, null, 2)}\n`);

        // 关键：发布前必须清掉 pg_dump 的明文 dump，否则它会跟着工作区一起被 rename 进归档目录，
        // 加密就形同虚设（演练实测踩到过）。随后再断言工作区只剩 aes + meta，做了别的就拒绝发布。
        await fsp.rm(dumpPath, { force: true });
        const leftovers = (await fsp.readdir(workspace)).filter((name) => name !== aesName && name !== metaName);
        if (leftovers.length > 0) {
          throw new BackupError(
            'BACKUP_CONSISTENCY_FAILED',
            `工作区存在未加密的残留文件，拒绝发布：${leftovers.join(', ')}`,
          );
        }

        const publishedDir = await publishDir(root, workspace, dayDir, `${base}.${jobId}`);
        const relDir = relativeToRoot(root, publishedDir);
        const record = await tx.backupArchive.create({
          data: {
            jobId,
            runType,
            scope: meta.scope,
            status: 'ok',
            verifyStatus: 'unknown',
            dirPath: relDir,
            aesPath: `${relDir}/${aesName}`,
            metaPath: `${relDir}/${metaName}`,
            fileSize: BigInt(cipher.length),
            plainSize: BigInt(plain.length),
            checksum: sha256,
            algorithm: meta.algorithm,
            keyMode: meta.keyMeta.mode,
            compression: COMPRESSION,
            snapshotMode: meta.snapshotMode,
            tableCounts,
            schemaSnapshot: schemaSnapshot as unknown as Prisma.InputJsonValue,
            countsCrossCheck: cross as unknown as Prisma.InputJsonValue,
            tableCount: tables.length,
            durationMs: Date.now() - started,
            createdById: options.actorId ?? null,
          },
          select: { id: true },
        });
        meta.runId = record.id;
        meta.archiveDir = relDir;
        await atomicWriteFile(path.join(publishedDir, metaName), `${JSON.stringify(meta, null, 2)}\n`);

        return {
          runId: record.id,
          relDir,
          publishedDir,
          meta,
          tocTables: toc.tables.length,
          sha256,
          plainBytes: plain.length,
          fileSize: cipher.length,
          snapshotMode: dump.snapshotMode,
          cross,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: dumpTimeoutMs + 120_000,
        maxWait: 15_000,
      },
    );

    let retention: RetentionOutcome | null = null;
    if (!options.skipRetention) {
      const { keepDays, keepCount } = retentionConfig(env);
      const refs = await scanArtifacts(root);
      const entries: RetentionEntry[] = refs.map((ref) => ({
        jobId: ref.jobId,
        dir: ref.dir,
        createdAtMs: ref.createdAtMs,
        bytes: ref.bytes,
        registered: Boolean(ref.meta?.runId),
      }));
      const plan = planRetention(entries, { keepDays, keepCount });
      retention = await applyRetention(plan, {
        root,
        deleteRegistryRow: async (removedJobId) => {
          const deleted = await options.prisma.backupArchive.deleteMany({ where: { jobId: removedJobId } });
          if (deleted.count === 0) {
            throw new BackupError('BACKUP_ARTIFACT_NOT_FOUND', `保留策略未找到登记行：${removedJobId}`);
          }
        },
      });
    }

    return {
      status: 'ok',
      jobId,
      runId: outcome.runId,
      base,
      dir: outcome.relDir,
      aesPath: `${outcome.relDir}/${aesName}`,
      metaPath: `${outcome.relDir}/${metaName}`,
      fileSize: outcome.fileSize,
      plainBytes: outcome.plainBytes,
      sha256: outcome.sha256,
      tableCount: outcome.meta.tableCount,
      snapshotMode: outcome.snapshotMode,
      countsCrossCheck: outcome.cross,
      durationMs: Date.now() - started,
      mount: guard.mount,
      warnings,
      retention,
    };
  } catch (err) {
    // 只清理自己的工作区（未登记的目录不碰）；失败行尽力登记，留痕供排查。
    await fsp.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    const failure: FailureRecord = {
      jobId,
      code: isBackupError(err) ? err.code : 'BACKUP_PG_DUMP_FAILED',
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      runType,
      actorId: options.actorId ?? null,
    };
    await registerFailure(options.prisma, failure);
    throw err;
  }
}

/** 供路由/CLI 复用的产物目录用量与删除（均过路径守卫）。 */
export async function artifactSize(root: string, dir: string): Promise<{ bytes: number; files: number }> {
  const abs = path.join(ensureArchiveRoot(root), dir);
  return dirSize(abs);
}

export async function removeArtifact(root: string, dir: string): Promise<void> {
  await removeArtifactDir(root, dir);
}
