import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { HttpError, forbidden, badRequest, notFound, parsePaging, paged } from '../kernel/http.js';
import { isBackupError } from '../platform/backup/errors.js';
import { runArchive } from '../platform/backup/archive.js';
import { verifyArchive } from '../platform/backup/verify.js';
import { resolveArchiveRoot, resolveArtifactPath, ensureArchiveRoot } from '../platform/backup/paths.js';
import {
  archiveUsage,
  dirUsage,
  diskThresholds,
  guardDiskSpace,
  statMount,
} from '../platform/backup/diskUsage.js';
import { scanArtifacts } from '../platform/backup/registry.js';
import { applyRetention, planRetention, retentionConfig } from '../platform/backup/retention.js';

/**
 * /api/backup/archives —— 归档备份（运维级整库备份）的历史、校验、下载与保留策略。
 *
 * 与 routes/backup.js 的分工：
 *   - routes/backup.js：应用层 JSON 模块导出/回灌（在线自助，覆盖 27 张业务表）；
 *   - 本路由：整库 `pg_dump -Fc` + AES-256-GCM 加密产物的登记与运维面板。
 *     应用内**不做**整库恢复（那是 pg_restore 的活，需要停写与运维窗口），
 *     这里只提供"看得到、校验得了、下载得走、删得掉"。
 *
 * 权限：全部 data.export（实际等价 SUPER_ADMIN，与既有备份入口一致）+ 全程审计。
 * 挂载：app.route('/api/backup', backupArchiveRoutes)（与备份导出共用前缀，路径不重叠）。
 * 端点：
 *   GET    /api/backup/archives              历史列表（分页 + 状态筛选）
 *   POST   /api/backup/archives/run           立即生成一份归档
 *   POST   /api/backup/archives/retention     保留策略（默认 dry-run）
 *   GET    /api/backup/archives/:id           详情（meta 隐去 dekCipher）
 *   GET    /api/backup/archives/:id/download  下载（format=aes|meta）
 *   POST   /api/backup/archives/:id/verify    离线校验
 *   DELETE /api/backup/archives/:id           删除（记录 + 产物）
 *   GET    /api/backup/storage                存储用量
 */
const archives = new Hono();

archives.use('*', authMiddleware);

function assertSuperAdmin(c) {
  const auth = getAuth(c);
  if (auth.systemRole !== 'SUPER_ADMIN') {
    throw forbidden('PERMISSION_DENIED', '归档备份仅限 SUPER_ADMIN');
  }
  return auth;
}

/**
 * 归档根目录：把 BackupError 翻译成 HttpError。
 * 这样即便某个处理函数漏了 try/catch（例如 /storage、下载、删除），全局 onError 也能给出
 * 正确的状态码与错误码（生产未配置归档目录时是 503，而不是含糊的 500）。
 */
function archiveRoot() {
  try {
    return ensureArchiveRoot(resolveArchiveRoot(process.env, process.cwd()));
  } catch (err) {
    if (isBackupError(err)) {
      throw new HttpError(err.httpStatus, err.code, err.message, err.detail ? { detail: err.detail } : null);
    }
    throw err;
  }
}

function audit(c, auth, action, entityLabel, metadata) {
  return writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action,
    entityType: 'BACKUP',
    entityLabel,
    metadata,
  });
}

function respond(c, err, fallbackMessage) {
  if (isBackupError(err)) {
    return c.json({ error: err.message, code: err.code, detail: err.detail ?? null }, err.httpStatus);
  }
  // archiveRoot() 会把 BackupError 翻成 HttpError（保住状态码与错误码）
  if (err instanceof HttpError) {
    return c.json(err.payload(), err.status);
  }
  console.error('[backup/archives] 未预期失败：', err);
  return c.json({ error: fallbackMessage, code: 'INTERNAL_ERROR', detail: err?.message ?? String(err) }, 500);
}

function parseBigInt(value) {
  if (value === null || value === undefined) return null;
  try {
    return Number(value);
  } catch {
    return null;
  }
}

function serialize(row, extra = {}) {
  return {
    id: row.id,
    jobId: row.jobId,
    runType: row.runType,
    scope: row.scope,
    status: row.status,
    verifyStatus: row.verifyStatus,
    dir: row.dirPath || null,
    fileSize: parseBigInt(row.fileSize),
    plainSize: parseBigInt(row.plainSize),
    checksum: row.checksum,
    algorithm: row.algorithm,
    keyMode: row.keyMode,
    compression: row.compression,
    snapshotMode: row.snapshotMode,
    tableCount: row.tableCount,
    tableCounts: row.tableCounts ?? null,
    countsCrossCheck: row.countsCrossCheck ?? null,
    durationMs: row.durationMs,
    failureCode: row.failureCode,
    failureDetail: row.failureDetail,
    createdById: row.createdById,
    createdAt: row.createdAt,
    verifiedAt: row.verifiedAt,
    ...extra,
  };
}

/** 产物是否真的还在磁盘上（列表里必须能看出来，否则会出现"点下载才 404"）。 */
function artifactPresence(root, dirPath) {
  if (!dirPath) return { exists: false, reason: '该记录没有产物（失败留痕）' };
  try {
    const abs = resolveArtifactPath(root, dirPath);
    return { exists: fs.existsSync(abs), reason: fs.existsSync(abs) ? null : '产物目录已不在磁盘上' };
  } catch (err) {
    return { exists: false, reason: `路径校验失败：${err.message}` };
  }
}

// ─── GET /api/backup/archives —— 历史列表 ────────────────────────────────────
archives.get('/archives', async (c) => {
  assertSuperAdmin(c);
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 20, 100);
  const status = c.req.query('status');
  const runType = c.req.query('runType');
  const where = {};
  if (status === 'ok' || status === 'failed') where.status = status;
  if (runType) where.runType = runType;

  const [rows, total] = await Promise.all([
    prisma.backupArchive.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.backupArchive.count({ where }),
  ]);

  let root = null;
  let storageError = null;
  try {
    root = archiveRoot();
  } catch (err) {
    storageError = isBackupError(err) ? err.message : String(err);
  }

  const items = rows.map((row) => {
    if (!root) return serialize(row, { fileExists: null, fileReason: storageError });
    const presence = artifactPresence(root, row.dirPath);
    return serialize(row, { fileExists: presence.exists, fileReason: presence.reason });
  });

  return c.json({ ...paged(items, total, { page, pageSize }), storageError });
});

// ─── POST /api/backup/archives/run —— 立即生成一份归档 ───────────────────────
// 注：该请求会阻塞到 pg_dump + 加密 + 发布完成（几十秒级）；同一时刻只有一份作业能跑，
//     并发请求得到 409（PG advisory lock，非进程内互斥）。
archives.post('/archives/run', requirePermission('data.export'), async (c) => {
  const auth = assertSuperAdmin(c);
  const body = await c.req.json().catch(() => ({}));
  const runType = ['manual', 'scheduled', 'predeploy'].includes(body?.runType) ? body.runType : 'manual';
  try {
    const result = await runArchive({
      prisma,
      env: process.env,
      runType,
      actorId: auth.userId,
      log: (line) => console.log(`[backup/archives] ${line}`),
    });
    await audit(c, auth, AUDIT_ACTIONS.EXPORT, `归档备份 ${result.jobId}`, {
      operation: 'backup.archive.run',
      jobId: result.jobId,
      runId: result.runId,
      dir: result.dir,
      fileSize: result.fileSize,
      tableCount: result.tableCount,
      snapshotMode: result.snapshotMode,
      durationMs: result.durationMs,
      retention: result.retention ? { removed: result.retention.removed.length, removedBytes: result.retention.removedBytes } : null,
      warnings: result.warnings,
    });
    return c.json({ success: true, result });
  } catch (err) {
    await audit(c, auth, AUDIT_ACTIONS.EXPORT, '归档备份失败', {
      operation: 'backup.archive.run',
      failed: true,
      code: isBackupError(err) ? err.code : 'INTERNAL_ERROR',
      reason: err?.message ?? String(err),
    }).catch(() => undefined);
    return respond(c, err, '归档备份失败');
  }
});

// ─── POST /api/backup/archives/retention —— 保留策略（默认 dry-run）──────────
archives.post('/archives/retention', requirePermission('data.export'), async (c) => {
  const auth = assertSuperAdmin(c);
  const body = await c.req.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false;
  const root = archiveRoot();
  const { keepDays, keepCount } = retentionConfig(process.env);
  const refs = await scanArtifacts(root);
  const plan = planRetention(
    refs.map((ref) => ({
      jobId: ref.jobId,
      dir: ref.dir,
      createdAtMs: ref.createdAtMs,
      bytes: ref.bytes,
      registered: Boolean(ref.meta?.runId),
    })),
    { keepDays, keepCount },
  );

  if (dryRun) {
    return c.json({
      dryRun: true,
      keepDays,
      keepCount,
      keep: plan.keep.length,
      remove: plan.remove.map((item) => ({ jobId: item.jobId, dir: item.dir, bytes: item.bytes })),
      skipped: plan.skipped.map((item) => ({ jobId: item.jobId, dir: item.dir, bytes: item.bytes })),
    });
  }

  const outcome = await applyRetention(plan, {
    root,
    deleteRegistryRow: async (jobId) => {
      const deleted = await prisma.backupArchive.deleteMany({ where: { jobId } });
      if (deleted.count === 0) throw new Error(`未找到登记行：${jobId}`);
    },
  });
  await audit(c, auth, AUDIT_ACTIONS.DELETE, '归档保留策略执行', {
    operation: 'backup.archive.retention',
    keepDays,
    keepCount,
    removed: outcome.removed.map((item) => item.jobId),
    removedBytes: outcome.removedBytes,
    errors: outcome.errors,
  });
  return c.json({ dryRun: false, keepDays, keepCount, ...outcome });
});

// ─── GET /api/backup/storage —— 磁盘用量概览 ────────────────────────────────
archives.get('/storage', async (c) => {
  assertSuperAdmin(c);
  const root = archiveRoot();
  const thresholds = diskThresholds(process.env);
  const guard = await guardDiskSpace(root, process.env).catch((err) => ({
    mount: null,
    minFreeBytes: thresholds.minFreeMb * 1024 * 1024,
    warnPct: thresholds.warnPct,
    level: 'unknown',
    warnings: [isBackupError(err) ? err.message : String(err)],
  }));
  const usage = await archiveUsage(root);
  const uploadDir = process.env.UPLOAD_DIR ?? null;
  const backupRoot = process.env.BACKUP_ROOT_DIR ?? path.dirname(usage.root);
  const extraDirs = [
    { label: '存量备份根', dir: backupRoot },
    { label: '上传文件', dir: uploadDir },
    { label: 'PG 运维备份', dir: `${backupRoot}/pg` },
    { label: 'uploads 快照', dir: `${backupRoot}/uploads` },
  ].filter((item) => item.dir);
  const dirs = [];
  for (const item of extraDirs) {
    if (!fs.existsSync(item.dir)) continue;
    const used = await dirUsage(item.dir);
    dirs.push({ label: item.label, dir: item.dir, bytes: used.bytes, files: used.files });
  }
  const refs = await scanArtifacts(root);
  const unregistered = refs
    .filter((ref) => !ref.meta?.runId)
    .map((ref) => ({ dir: ref.dir, bytes: ref.bytes, reason: ref.metaError ?? '未在数据库登记（保留策略不会删除）' }));

  let mount = guard.mount ?? null;
  if (!mount) mount = await statMount(root).catch(() => null);

  return c.json({
    thresholds: { ...thresholds },
    level: guard.level,
    warnings: guard.warnings,
    mount,
    archive: {
      root: usage.root,
      exists: usage.exists,
      totalBytes: usage.totalBytes,
      count: usage.count,
      byDay: usage.byDay,
      workBytes: usage.workBytes,
    },
    dirs,
    unregistered,
    retention: retentionConfig(process.env),
  });
});

// ─── GET /api/backup/archives/:id —— 单份详情（隐去 dekCipher）───────────────
archives.get('/archives/:id', async (c) => {
  assertSuperAdmin(c);
  const row = await prisma.backupArchive.findUnique({ where: { id: c.req.param('id') } });
  if (!row) throw notFound('NOT_FOUND', '归档记录不存在');
  let meta = null;
  let metaError = null;
  try {
    const root = archiveRoot();
    const abs = resolveArtifactPath(root, row.metaPath);
    const parsed = JSON.parse(await fsp.readFile(abs, 'utf8'));
    // dekCipher 属敏感字段（虽然单独拿到也解不开），面板不返回
    if (parsed?.keyMeta) delete parsed.keyMeta.dekCipher;
    meta = parsed;
  } catch (err) {
    metaError = isBackupError(err) ? err.message : String(err);
  }
  const presence = (() => {
    try {
      return artifactPresence(archiveRoot(), row.dirPath);
    } catch (err) {
      return { exists: null, reason: isBackupError(err) ? err.message : String(err) };
    }
  })();
  return c.json({ item: serialize(row, { fileExists: presence.exists, fileReason: presence.reason, meta, metaError }) });
});

// ─── GET /api/backup/archives/:id/download?format=aes|meta ──────────────────
archives.get('/archives/:id/download', async (c) => {
  const auth = assertSuperAdmin(c);
  const row = await prisma.backupArchive.findUnique({ where: { id: c.req.param('id') } });
  if (!row) throw notFound('NOT_FOUND', '归档记录不存在');
  const format = c.req.query('format') ?? 'aes';
  if (!['aes', 'meta'].includes(format)) throw badRequest('VALIDATION_ERROR', 'format 只支持 aes / meta');
  if (row.status !== 'ok' || !row.dirPath) throw badRequest('VALIDATION_ERROR', '该记录没有可下载的产物');

  const root = archiveRoot();
  const relPath = format === 'aes' ? row.aesPath : row.metaPath;
  const abs = resolveArtifactPath(root, relPath);
  const stat = await fsp.stat(abs).catch(() => null);
  if (!stat?.isFile()) throw notFound('BACKUP_ARTIFACT_NOT_FOUND', '产物文件不存在（可能已被清理）');

  await audit(c, auth, AUDIT_ACTIONS.DOWNLOAD, `归档产物下载 ${row.jobId}`, {
    operation: 'backup.archive.download',
    jobId: row.jobId,
    format,
    bytes: stat.size,
  });

  const fileName = path.basename(abs);
  c.header('Content-Type', format === 'aes' ? 'application/octet-stream' : 'application/json; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${fileName}"`);
  c.header('Content-Length', String(stat.size));
  c.header('X-Archive-Checksum', row.checksum ?? '');
  return c.body(Readable.toWeb(fs.createReadStream(abs)));
});

// ─── POST /api/backup/archives/:id/verify —— 离线校验 ───────────────────────
archives.post('/archives/:id/verify', requirePermission('data.export'), async (c) => {
  const auth = assertSuperAdmin(c);
  const row = await prisma.backupArchive.findUnique({ where: { id: c.req.param('id') } });
  if (!row) throw notFound('NOT_FOUND', '归档记录不存在');
  if (row.status !== 'ok' || !row.dirPath) throw badRequest('VALIDATION_ERROR', '失败留痕没有产物可校验');

  try {
    const root = archiveRoot();
    const result = await verifyArchive({
      aesPath: resolveArtifactPath(root, row.aesPath),
      metaPath: resolveArtifactPath(root, row.metaPath),
      env: process.env,
    });
    await prisma.backupArchive.update({
      where: { id: row.id },
      data: { verifyStatus: result.ok ? 'passed' : 'failed', verifiedAt: new Date() },
    });
    await audit(c, auth, AUDIT_ACTIONS.READ_SENSITIVE, `归档校验 ${row.jobId}`, {
      operation: 'backup.archive.verify',
      jobId: row.jobId,
      ok: result.ok,
      checks: result.checks,
    });
    return c.json({ ok: result.ok, checks: result.checks, tocTables: result.tocTables.length, dataEntries: result.dataEntries });
  } catch (err) {
    await audit(c, auth, AUDIT_ACTIONS.READ_SENSITIVE, `归档校验失败 ${row.jobId}`, {
      operation: 'backup.archive.verify',
      jobId: row.jobId,
      failed: true,
      code: isBackupError(err) ? err.code : 'INTERNAL_ERROR',
      reason: err?.message ?? String(err),
    }).catch(() => undefined);
    return respond(c, err, '归档校验失败');
  }
});

// ─── DELETE /api/backup/archives/:id —— 删除一份归档 ────────────────────────
archives.delete('/archives/:id', requirePermission('data.export'), async (c) => {
  const auth = assertSuperAdmin(c);
  const row = await prisma.backupArchive.findUnique({ where: { id: c.req.param('id') } });
  if (!row) throw notFound('NOT_FOUND', '归档记录不存在');

  let removedBytes = 0;
  if (row.dirPath) {
    const root = archiveRoot();
    const abs = resolveArtifactPath(root, row.dirPath);
    removedBytes = await fsp
      .stat(abs)
      .then(() => Number(row.fileSize ?? 0))
      .catch(() => 0);
    await fsp.rm(abs, { recursive: true, force: true });
  }
  await prisma.backupArchive.delete({ where: { id: row.id } });
  await audit(c, auth, AUDIT_ACTIONS.DELETE, `归档删除 ${row.jobId}`, {
    operation: 'backup.archive.delete',
    jobId: row.jobId,
    dir: row.dirPath || null,
    removedBytes,
  });
  return c.json({ success: true, jobId: row.jobId, removedBytes });
});

export default archives;
