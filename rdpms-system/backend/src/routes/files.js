import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { HttpError } from '../kernel/http.js';
import { notFound, forbidden, methodNotAllowed, badRequest, parsePaging, paged } from '../kernel/http.js';
import fs from 'node:fs';
import { safeStoragePath, putObject } from '../kernel/storage.js';

/**
 * 文件元数据 + 本地对象存储（M-1 §6.5）：
 *   POST   /api/files              files.upload
 *   GET    /api/files/:id/download files.download（INFECTED 禁止下载）
 *   GET    /api/files/:id/metadata files.download
 *   DELETE /api/files/:id          files.delete（软删）
 */
const files = new Hono();

files.use('*', authenticate);

// ── 列表（元数据；files.download）────────────────────────────────────────────
files.get('/', requirePermission('files.download'), async (c) => {
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 20);
  const { keyword } = c.req.query();
  const where = { deletedAt: null };
  if (keyword) where.originalName = { contains: keyword };
  const [total, list] = await Promise.all([
    prisma.fileObject.count({ where }),
    prisma.fileObject.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, originalName: true, mimeType: true, sizeBytes: true,
        scanStatus: true, scannedAt: true, uploadedById: true, createdAt: true,
      },
    }),
  ]);
  return c.json({ ...paged(list, total, { page, pageSize }), list });
});

// ── 上传 ─────────────────────────────────────────────────────────────────────
files.post('/', requirePermission('files.upload'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || typeof file === 'string') throw badRequest('VALIDATION_ERROR', '缺少文件字段 file');

  const maxMb = 50;
  if (file.size > maxMb * 1024 * 1024) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `单文件不超过 ${maxMb}MB`);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const created = await putObject(prisma, {
    buffer: buf,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    uploadedById: auth.userId,
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPLOAD,
    entityType: 'FILE',
    entityId: created.id,
    entityLabel: created.originalName,
    metadata: { permissionCode: 'files.upload', sizeBytes: created.sizeBytes },
  });
  return c.json(created, 201);
});

// ── 元数据 ───────────────────────────────────────────────────────────────────
files.get('/:id/metadata', requirePermission('files.download'), async (c) => {
  const row = await prisma.fileObject.findFirst({
    where: { id: c.req.param('id'), deletedAt: null },
  });
  if (!row) throw notFound('FILE_NOT_FOUND', '文件不存在');
  const { storageKey: _s, ...meta } = row;
  return c.json(meta);
});

// ── 下载 ─────────────────────────────────────────────────────────────────────
files.get('/:id/download', requirePermission('files.download'), async (c) => {
  const auth = getAuth(c);
  const row = await prisma.fileObject.findFirst({
    where: { id: c.req.param('id'), deletedAt: null },
  });
  if (!row) throw notFound('FILE_NOT_FOUND', '文件不存在');

  if (row.scanStatus === 'INFECTED') {
    await writeAudit(prisma, {
      c,
      actorId: auth.userId,
      actorRole: auth.systemRole,
      action: AUDIT_ACTIONS.DOWNLOAD,
      entityType: 'FILE',
      entityId: row.id,
      entityLabel: row.originalName,
      metadata: { permissionCode: 'files.download', denied: 'INFECTED' },
    });
    throw forbidden('FILE_INFECTED', '文件已感染，禁止下载');
  }

  const full = safeStoragePath(row.storageKey);
  if (!fs.existsSync(full)) throw notFound('FILE_MISSING', '文件内容缺失，请联系管理员');

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DOWNLOAD,
    entityType: 'FILE',
    entityId: row.id,
    entityLabel: row.originalName,
    metadata: {
      permissionCode: 'files.download',
      scanStatus: row.scanStatus,
      riskHint: row.scanStatus === 'FAILED',
    },
  });

  const stream = fs.createReadStream(full);
  return new Response(stream, {
    headers: {
      'Content-Type': row.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
    },
  });
});

// ── 软删除 ───────────────────────────────────────────────────────────────────
files.delete('/:id', requirePermission('files.delete'), async (c) => {
  const auth = getAuth(c);
  const row = await prisma.fileObject.findFirst({ where: { id: c.req.param('id'), deletedAt: null } });
  if (!row) throw notFound('FILE_NOT_FOUND', '文件不存在');
  await prisma.fileObject.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'FILE',
    entityId: row.id,
    entityLabel: row.originalName,
    metadata: { permissionCode: 'files.delete' },
  });
  return c.json({ id: row.id });
});

// 聚合路由不支持批量写
files.all('/', () => { throw methodNotAllowed(); });

export default files;
