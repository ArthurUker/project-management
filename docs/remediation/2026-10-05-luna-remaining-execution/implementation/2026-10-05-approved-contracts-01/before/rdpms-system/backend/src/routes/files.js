import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate, getAuth, requirePermission } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { HttpError } from '../kernel/http.js';
import { notFound, forbidden, methodNotAllowed, badRequest, parsePaging, paged } from '../kernel/http.js';
import { resolveProjectAccess, projectVisibilityFilter } from '../kernel/projectAccess.js';
import fs from 'node:fs';
import { safeStoragePath, putObject } from '../kernel/storage.js';
import {
  decideFileAccess,
  listVisibilityFilter,
  FILE_ACTION,
  FILE_SCOPE,
} from '../modules/files/fileAccessPolicy.js';
import { fileDeleteGuard, applyBindToFile, resolveBindTarget } from '../modules/files/fileCommands.js';
import { decideFileRead } from '../modules/files/fileReadService.js';

/**
 * 文件元数据 + 本地对象存储（M-1 §6.5）+ 资源归属授权（RF05 / F11）
 *
 *   POST   /api/files                 files.upload   —— 一律先落私有暂存（PRIVATE_STAGING）
 *   GET    /api/files                 files.download —— 按 FileAccessPolicy 过滤可见范围
 *   GET    /api/files/:id             files.download —— 前端实际使用的下载路径（与 /download 同权）
 *   GET    /api/files/:id/download    files.download
 *   GET    /api/files/:id/metadata    files.download
 *   PATCH  /api/files/:id/scope       files.delete + SUPER_ADMIN —— 历史归属分类（人工）
 *   DELETE /api/files/:id             files.delete   —— 被证据引用时拒绝整体删除
 *
 * 授权唯一依据：FileObject.accessScope + ownerUserId / ownerProjectId / sharedReadPermission。
 * **不存在**「因为某处有一条附件关系所以自动放行」的路径。
 */
const files = new Hono();

files.use('*', authenticate);

const actorOf = (auth) => ({
  userId: auth.userId,
  systemRole: auth.systemRole,
  permissions: auth.permissions ?? [],
});

/** 该用户可见的项目 id（超管不限制；非超管按成员/负责人过滤） */
async function visibleProjectIds(auth) {
  if (auth.systemRole === 'SUPER_ADMIN') return [];
  const filter = projectVisibilityFilter(auth);
  if (!filter) return [];
  const rows = await prisma.project.findMany({ where: { ...filter, deletedAt: null }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** 项目作用域文件：解析调用方在该项目的能力（非成员按「不可见」处理） */
async function projectContextFor(auth, row) {
  if (!row || row.accessScope !== FILE_SCOPE.PROJECT || !row.ownerProjectId) return {};
  try {
    const access = await resolveProjectAccess(prisma, auth, row.ownerProjectId);
    return { projectAccess: { isMember: access.isMember, capabilities: access.capabilities } };
  } catch {
    return { projectAccess: { isMember: false, capabilities: [] } };
  }
}

/** 载入文件并按策略判定；不通过时抛 404（隐藏存在性）或 403 */
async function loadFileOrThrow(auth, id, action) {
  const row = await prisma.fileObject.findFirst({ where: { id, deletedAt: null } });
  const decision = decideFileAccess(action, actorOf(auth), row, await projectContextFor(auth, row));
  if (!decision.allow) {
    if (decision.code === 'FILE_NOT_FOUND') throw notFound('FILE_NOT_FOUND', '文件不存在');
    throw forbidden('FILE_FORBIDDEN', decision.reason);
  }
  return row;
}

/** 审计元数据：所有文件动作都带上判定依据，便于事后核查 */
const decisionMeta = (row, extra = {}) => ({
  accessScope: row.accessScope,
  ownerProjectId: row.ownerProjectId ?? null,
  ownerUserId: row.ownerUserId ?? null,
  ...extra,
});

// ── 列表（按作用域过滤；files.download）─────────────────────────────────────
files.get('/', requirePermission('files.download'), async (c) => {
  const auth = getAuth(c);
  const { page, pageSize, skip, take } = parsePaging(c.req.query(), 20);
  const { keyword, needsClassification } = c.req.query();

  const where = {
    deletedAt: null,
    ...listVisibilityFilter(actorOf(auth), { visibleProjectIds: await visibleProjectIds(auth) }),
  };
  if (keyword) where.originalName = { contains: keyword };
  // 未分类历史文件清单：仅超管可列（用于人工分类）
  if (needsClassification === 'true') {
    if (auth.systemRole !== 'SUPER_ADMIN') throw forbidden('FILE_SCOPE_FORBIDDEN', '仅超级管理员可列出未分类文件');
    where.OR = [{
      accessScope: FILE_SCOPE.PRIVATE_STAGING,
      ownerUserId: null,
      uploadedById: null,
      classifiedAt: null,
    }];
  }

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
        accessScope: true, ownerProjectId: true, ownerUserId: true, sharedReadPermission: true, classifiedAt: true,
      },
    }),
  ]);
  return c.json({
    ...paged(list, total, { page, pageSize }),
    list: list.map((row) => ({
      ...row,
      needsClassification: row.accessScope === FILE_SCOPE.PRIVATE_STAGING
        && !row.ownerUserId && !row.uploadedById && !row.classifiedAt,
    })),
  });
});

// ── 上传（files.upload）：一律先落私有暂存，绑定后才可见 ─────────────────────
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
  // RF05：上传结果一律是「上传者私有暂存」，仅在明确绑定命令之后才转为项目/共享库可见
  const staged = await prisma.fileObject.update({
    where: { id: created.id },
    data: { accessScope: FILE_SCOPE.PRIVATE_STAGING, ownerUserId: auth.userId },
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
    metadata: decisionMeta(staged, {
      permissionCode: 'files.upload',
      sizeBytes: created.sizeBytes,
      intent: typeof body.resourceType === 'string' ? body.resourceType : null,
      intentId: typeof body.resourceId === 'string' ? body.resourceId : null,
      note: 'resourceType/resourceId 仅作意图记录，绑定以业务命令为准',
    }),
  });
  return c.json(staged, 201);
});

// ── 元数据 ───────────────────────────────────────────────────────────────────
files.get('/:id/metadata', requirePermission('files.download'), async (c) => {
  const auth = getAuth(c);
  const row = await loadFileOrThrow(auth, c.req.param('id'), FILE_ACTION.METADATA);
  const { storageKey: _s, ...meta } = row;
  return c.json(meta);
});

// ── 下载（前端 downloadFile 使用的正是 /api/files/:id，与 /download 同权）─────
async function downloadFile(c) {
  const auth = getAuth(c);
  const row = await loadFileOrThrow(auth, c.req.param('id'), FILE_ACTION.DOWNLOAD);

  const scanDecision = decideFileRead(row.scanStatus);
  if (!scanDecision.allow) {
    await writeAudit(prisma, {
      c,
      actorId: auth.userId,
      actorRole: auth.systemRole,
      action: AUDIT_ACTIONS.DOWNLOAD,
      entityType: 'FILE',
      entityId: row.id,
      entityLabel: row.originalName,
      metadata: decisionMeta(row, { permissionCode: 'files.download', denied: 'INFECTED' }),
    });
    throw forbidden(scanDecision.code, scanDecision.reason);
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
    metadata: decisionMeta(row, {
      permissionCode: 'files.download',
      scanStatus: row.scanStatus,
      riskHint: row.scanStatus === 'FAILED',
    }),
  });

  const stream = fs.createReadStream(full);
  return new Response(stream, {
    headers: {
      'Content-Type': row.mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
    },
  });
}

files.get('/:id/download', requirePermission('files.download'), downloadFile);
files.get('/:id', requirePermission('files.download'), downloadFile);

// ── 人工分类（历史无归属文件）：仅超管 ───────────────────────────────────────
files.patch('/:id/scope', requirePermission('files.delete'), async (c) => {
  const auth = getAuth(c);
  if (auth.systemRole !== 'SUPER_ADMIN') {
    throw forbidden('FILE_SCOPE_FORBIDDEN', '仅超级管理员可调整文件作用域（历史归属分类）');
  }
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const scope = body?.scope;
  const allowed = Object.values(FILE_SCOPE);
  if (!allowed.includes(scope)) {
    throw badRequest('VALIDATION_ERROR', `scope 仅允许 ${allowed.join('/')}`, { field: 'scope' });
  }

  const row = await prisma.fileObject.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw notFound('FILE_NOT_FOUND', '文件不存在');

  let resolution = { scope: null };
  if (scope === FILE_SCOPE.PROJECT) {
    const projectId = body?.ownerProjectId;
    if (!projectId) throw badRequest('VALIDATION_ERROR', 'PROJECT 作用域必须提供 ownerProjectId', { field: 'ownerProjectId' });
    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } });
    if (!project) throw badRequest('INVALID_REFERENCE', 'ownerProjectId 指向的项目不存在', { field: 'ownerProjectId' });
    resolution = { scope: FILE_SCOPE.PROJECT, projectId: project.id };
  } else if (scope === FILE_SCOPE.SHARED_LIBRARY) {
    const permission = body?.sharedReadPermission;
    if (!permission || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(permission)) {
      throw badRequest('VALIDATION_ERROR', 'SHARED_LIBRARY 必须提供合法的 sharedReadPermission', { field: 'sharedReadPermission' });
    }
    resolution = { scope: FILE_SCOPE.SHARED_LIBRARY, sharedReadPermission: permission };
  } else {
    // PRIVATE_STAGING / PUBLIC：清空项目与共享规则
    resolution = { scope, projectId: null, sharedReadPermission: null };
  }

  await applyBindToFile(prisma, id, resolution, auth.userId);
  const updated = await prisma.fileObject.findUnique({ where: { id } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'FILE',
    entityId: id,
    entityLabel: row.originalName,
    before: { accessScope: row.accessScope, ownerProjectId: row.ownerProjectId, sharedReadPermission: row.sharedReadPermission },
    after: { accessScope: updated.accessScope, ownerProjectId: updated.ownerProjectId, sharedReadPermission: updated.sharedReadPermission },
    metadata: { permissionCode: 'files.delete', classification: 'manual', elevated: true },
  });
  return c.json(updated);
});

// ── 软删除（被已发布证据引用时只允许解绑，不允许整体删除）────────────────────
files.delete('/:id', requirePermission('files.delete'), async (c) => {
  const auth = getAuth(c);
  const row = await loadFileOrThrow(auth, c.req.param('id'), FILE_ACTION.DELETE);

  const refs = await prisma.attachment.findMany({
    where: { fileId: row.id, deletedAt: null },
    select: { id: true, entityType: true, entityId: true, label: true, deletedAt: true },
  });
  const guard = fileDeleteGuard(refs);
  if (!guard.ok) {
    throw new HttpError(409, guard.code, guard.reason);
  }

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
    metadata: decisionMeta(row, { permissionCode: 'files.delete', softDelete: true }),
  });
  return c.json({ id: row.id });
});

// ── 恢复（撤回软删）：证据附件必须可恢复（05 §6）──────────────────────────────
// 前端 fileAPI.restore 一直在调用本端点；此前后端未实现（404）。恢复本身是管理动作：
// 仅超管且持 files.delete 可执行，且必须留审计（软删只隐藏，不物理删除）。
files.post('/:id/restore', requirePermission('files.delete'), async (c) => {
  const auth = getAuth(c);
  if (auth.systemRole !== 'SUPER_ADMIN') {
    throw forbidden('FILE_RESTORE_FORBIDDEN', '仅超级管理员可恢复已删除文件');
  }
  const id = c.req.param('id');
  const row = await prisma.fileObject.findUnique({ where: { id } });
  if (!row) throw notFound('FILE_NOT_FOUND', '文件不存在');
  if (!row.deletedAt) return c.json(row);

  const restored = await prisma.fileObject.update({ where: { id }, data: { deletedAt: null } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.RESTORE,
    entityType: 'FILE',
    entityId: id,
    entityLabel: row.originalName,
    metadata: decisionMeta(restored, { permissionCode: 'files.delete', restored: true, elevated: true }),
  });
  return c.json(restored);
});

// 聚合路由不支持批量写
files.all('/', () => { throw methodNotAllowed(); });

export default files;
