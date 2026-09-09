import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/docs —— 知识库文档（W10 PG baseline 迁移）。
 *
 * 迁移要点：
 *   DocCategory 必填 code @unique（缺省自动生成）；
 *   DocDocument: fileUrl/fileName/version 字段删除 → currentVersion；tags text[]（has/hasSome）；
 *              creator/approver → owner/reviewer；status 'active' → ACTIVE（DocumentStatus 枚举）；
 *   DocVersion: createdBy → createdById（必填，取当前登录人）。
 */
const docs = new Hono();

docs.use('*', authMiddleware);

// ── 分类（docs.view / docs.categories.manage）───────────────────────────────
docs.get('/categories', requirePermission('docs.view'), async (c) => {
  const categories = await prisma.docCategory.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
  });
  return c.json({ list: categories });
});

docs.post('/categories', requirePermission('docs.categories.manage'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) throw badRequest('VALIDATION_ERROR', '分类名称不能为空');

  const existing = await prisma.docCategory.findFirst({ where: { name: body.name, deletedAt: null } });
  if (existing) throw badRequest('VALIDATION_ERROR', '分类名称已存在');

  const code = body.code || `CAT-${Date.now().toString(36).toUpperCase()}`;
  const category = await prisma.docCategory.create({
    data: {
      code,
      name: body.name,
      description: body.description || null,
      icon: body.icon || null,
      sortOrder: body.sortOrder || 0,
    },
  });
  return c.json(category, 201);
});

docs.put('/categories/:id', requirePermission('docs.categories.manage'), async (c) => {
  const { id } = c.req.param();
  const data = pickAllowed(await c.req.json().catch(() => ({})), ['name', 'description', 'icon', 'sortOrder'], { entityLabel: '更新分类' });
  const category = await prisma.docCategory.update({ where: { id }, data });
  return c.json(category);
});

docs.delete('/categories/:id', requirePermission('docs.categories.manage'), async (c) => {
  const { id } = c.req.param();
  const inUse = await prisma.docDocument.count({ where: { categoryId: id, deletedAt: null } });
  if (inUse > 0) throw badRequest('VALIDATION_ERROR', `该分类下仍有 ${inUse} 份文档，无法删除`);
  await prisma.docCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  return c.json({ success: true });
});

// ── 文档（docs.view / docs.create / docs.update）────────────────────────────
docs.get('/documents', requirePermission('docs.view'), async (c) => {
  const { categoryId, docType, status, keyword, page = 1, pageSize = 20 } = c.req.query();

  const where = { deletedAt: null };
  if (categoryId) where.categoryId = categoryId;
  if (docType) where.docType = docType;
  if (status) where.status = status;
  if (keyword) {
    where.OR = [
      { title: { contains: keyword } },
      { code: { contains: keyword } },
      { description: { contains: keyword } },
      { tags: { has: keyword } },
    ];
  }

  const [documents, total] = await Promise.all([
    prisma.docDocument.findMany({
      where,
      include: {
        category: true,
        owner: { select: { id: true, displayName: true } },
        reviewer: { select: { id: true, displayName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (Number.parseInt(page, 10) - 1) * Number.parseInt(pageSize, 10),
      take: Number.parseInt(pageSize, 10),
    }),
    prisma.docDocument.count({ where }),
  ]);

  return c.json({ list: documents, total, page: Number.parseInt(page, 10), pageSize: Number.parseInt(pageSize, 10) });
});

docs.get('/documents/:id', requirePermission('docs.view'), async (c) => {
  const { id } = c.req.param();
  const document = await prisma.docDocument.findUnique({
    where: { id },
    include: {
      category: true,
      owner: { select: { id: true, displayName: true } },
      reviewer: { select: { id: true, displayName: true } },
      versions: {
        orderBy: { createdAt: 'desc' },
        include: { creator: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!document || document.deletedAt) throw notFound('DOC_NOT_FOUND', '文档不存在');
  return c.json(document);
});

docs.post('/documents', requirePermission('docs.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body.title) throw badRequest('VALIDATION_ERROR', '文档标题不能为空');
  if (!body.categoryId) throw badRequest('VALIDATION_ERROR', 'categoryId 不能为空');

  const code = body.code || `DOC-${Date.now().toString(36).toUpperCase()}`;
  const existing = await prisma.docDocument.findUnique({ where: { code } });
  if (existing) throw badRequest('VALIDATION_ERROR', '文档编号已存在');

  const version = body.currentVersion || body.version || 'V1.0';
  const document = await prisma.docDocument.create({
    data: {
      categoryId: body.categoryId,
      code,
      title: body.title,
      description: body.description || null,
      docType: body.docType || 'SOP',
      content: body.content || null,
      currentVersion: version,
      tags: Array.isArray(body.tags) ? body.tags : [],
      ownerId: auth.userId,
      createdById: auth.userId,
    },
    include: { category: true, owner: { select: { id: true, displayName: true } } },
  });

  await prisma.docVersion.create({
    data: {
      documentId: document.id,
      version,
      content: body.content || '',
      changelog: '初始版本',
      createdById: auth.userId,
    },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'DOC',
    entityId: document.id,
    entityLabel: document.title,
    metadata: { permissionCode: 'docs.create' },
  });
  return c.json(document, 201);
});

docs.put('/documents/:id', requirePermission('docs.update'), async (c) => {
  const auth = getAuth(c);
  const { id } = c.req.param();
  const raw = await c.req.json().catch(() => null);

  const existing = await prisma.docDocument.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound('DOC_NOT_FOUND', '文档不存在');

  const data = pickAllowed(raw, ['title', 'description', 'content', 'tags', 'status', 'docType', 'currentVersion'], { entityLabel: '更新文档' });
  if (data.tags !== undefined && !Array.isArray(data.tags)) delete data.tags;
  if (data.status !== undefined) data.status = String(data.status).toUpperCase();
  if (data.docType !== undefined) data.docType = String(data.docType).toUpperCase();
  data.updatedById = auth.userId;

  // 版本变化 → 追加版本历史（docs.review 语义：审阅人升级版本）
  const newVersion = raw?.currentVersion || raw?.version;
  if (newVersion && newVersion !== existing.currentVersion) {
    data.currentVersion = newVersion;
    if (auth.permissions.includes('docs.review')) {
      data.reviewerId = auth.userId;
      data.reviewedAt = new Date();
    }
    await prisma.docVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        content: raw?.content ?? existing.content ?? '',
        changelog: raw?.changelog || '版本更新',
        createdById: auth.userId,
      },
    });
  }

  const document = await prisma.docDocument.update({
    where: { id },
    data,
    include: {
      category: true,
      owner: { select: { id: true, displayName: true } },
      reviewer: { select: { id: true, displayName: true } },
    },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'DOC',
    entityId: id,
    entityLabel: document.title,
    changedFields: Object.keys(data),
    metadata: { permissionCode: 'docs.update' },
  });
  return c.json(document);
});

// ── 删除文档（docs.delete，P1 批次二解冻；软删+审计）─────────────────────────
docs.delete('/documents/:id', requirePermission('docs.delete'), async (c) => {
  const auth = getAuth(c);
  const { id } = c.req.param();
  const document = await prisma.docDocument.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, code: true },
  });
  if (!document) throw notFound('DOCUMENT_NOT_FOUND', '文档不存在');

  await prisma.docDocument.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'DOC',
    entityId: id,
    entityLabel: document.title,
    before: { title: document.title, code: document.code },
    metadata: { permissionCode: 'docs.delete', softDelete: true },
  });
  return c.json({ success: true, id, softDeleted: true });
});

docs.get('/documents/:id/versions', requirePermission('docs.view'), async (c) => {
  const { id } = c.req.param();
  const versions = await prisma.docVersion.findMany({
    where: { documentId: id },
    orderBy: { createdAt: 'desc' },
    include: { creator: { select: { id: true, displayName: true } } },
  });
  return c.json({ list: versions });
});

// 关键词搜索（供日报快速引用）
docs.get('/search', requirePermission('docs.view'), async (c) => {
  const { keyword, docType, limit = 10 } = c.req.query();
  if (!keyword) return c.json({ list: [] });

  const documents = await prisma.docDocument.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      docType: docType || undefined,
      OR: [
        { title: { contains: keyword } },
        { code: { contains: keyword } },
        { tags: { has: keyword } },
      ],
    },
    select: {
      id: true, code: true, title: true, currentVersion: true, docType: true,
      category: { select: { name: true } },
    },
    take: Number.parseInt(limit, 10),
    orderBy: { updatedAt: 'desc' },
  });
  return c.json({ list: documents });
});

export default docs;
