import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { promises as fs } from 'fs';
import path from 'path';
import { SEED_REGULATORY_DOCUMENTS } from '../data/regulatoryDocumentsSeed.js';
import { putObject, safeStoragePath } from '../kernel/storage.js';

const regulatoryDocuments = new Hono();
const STORAGE_DIR = path.resolve(process.cwd(), 'uploads', 'regulatory-documents');

regulatoryDocuments.use('*', authMiddleware);

// M-1：权限真源 = permissions 表（系统权限）；本路由使用 requirePermission/内嵌权限判定
function hasPerm(c, perm) {
  return getAuth(c).permissions.includes(perm);
}

function sanitizeFileName(fileName = '') {
  return String(fileName)
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBase64Payload(fileDataBase64 = '') {
  const raw = fileDataBase64.includes(',')
    ? fileDataBase64.split(',')[1]
    : fileDataBase64;
  return Buffer.from(raw, 'base64');
}

function guessMimeByFileName(fileName = '') {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

async function prepareStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

async function findOriginalFile(documentId) {
  await prepareStorageDir();
  const files = await fs.readdir(STORAGE_DIR);
  const matched = files.find((f) => f.startsWith(`${documentId}__`));
  if (!matched) return null;

  const fullPath = path.join(STORAGE_DIR, matched);
  const fileBuffer = await fs.readFile(fullPath);
  const originalName = matched.replace(`${documentId}__`, '') || `${documentId}.pdf`;
  return { fileBuffer, originalName };
}

// ── 原文附件（D-1 修复）：统一 FileObject + Attachment(entityType=REGULATORY_DOCUMENT, label='original') ──
const ORIGINAL_INCLUDE = {
  attachments: {
    where: { entityType: 'REGULATORY_DOCUMENT', label: 'original', deletedAt: null },
    include: { file: { select: { id: true, originalName: true } } },
  },
};

function mapOriginal(doc) {
  if (!doc) return doc;
  const { attachments, ...rest } = doc;
  const att = attachments && attachments[0];
  return {
    ...rest,
    originalFileId: att?.file?.id ?? null,
    fileName: att?.file?.originalName ?? null,
  };
}

async function clearOriginalAttachment(documentId) {
  await prisma.attachment.updateMany({
    where: { entityType: 'REGULATORY_DOCUMENT', entityId: documentId, label: 'original', deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

async function linkOriginalFile(documentId, fileId, userId) {
  const file = await prisma.fileObject.findFirst({ where: { id: fileId, deletedAt: null } });
  if (!file) return null;
  await clearOriginalAttachment(documentId);
  await prisma.attachment.create({
    data: {
      fileId: file.id,
      entityType: 'REGULATORY_DOCUMENT',
      entityId: documentId,
      label: 'original',
      uploadedById: userId || null,
    },
  });
  return file.id;
}

regulatoryDocuments.get('/', requirePermission('regulatory_documents.view'), async (c) => {
  const role = c.get('auth')?.systemRole;
  if (!hasPerm(c, 'regulatory_documents.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const {
    keyword,
    applicability,
    priorityLevel,
    applicableToIvd,
    category,
    page = 1,
    pageSize = 100,
  } = c.req.query();

  const where = {};
  if (applicability) where.applicability = applicability;
  if (priorityLevel) where.priorityLevel = priorityLevel;
  if (category) where.category = category;
  if (applicableToIvd !== undefined) {
    where.applicableToIvd = String(applicableToIvd) === 'true';
  }

  if (keyword) {
    where.OR = [
      { dispatchNo: { contains: keyword } },
      { title: { contains: keyword } },
      { fullTitle: { contains: keyword } },
      { summary: { contains: keyword } },
    ];
  }

  const [total, list] = await Promise.all([
    prisma.regulatoryDocument.count({ where }),
    prisma.regulatoryDocument.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize),
      orderBy: [{ priorityLevel: 'asc' }, { dispatchNo: 'asc' }],
      include: ORIGINAL_INCLUDE,
    }),
  ]);

  return c.json({
    list: list.map(mapOriginal),
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize),
  });
});

regulatoryDocuments.get('/:id', requirePermission('regulatory_documents.view'), async (c) => {
  const role = c.get('auth')?.systemRole;
  if (!hasPerm(c, 'regulatory_documents.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const item = await prisma.regulatoryDocument.findUnique({
    where: { id },
    include: ORIGINAL_INCLUDE,
  });

  if (!item) {
    return c.json({ error: '法规文件不存在' }, 404);
  }

  return c.json(mapOriginal(item));
});

regulatoryDocuments.post('/', requirePermission('regulatory_documents.create'), async (c) => {
  const role = c.get('auth')?.systemRole;
  if (!hasPerm(c, 'regulatory_documents.update')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const body = await c.req.json();
  if (!body?.dispatchNo || !body?.title) {
    return c.json({ error: '批示号和标题不能为空' }, 400);
  }

  const exists = await prisma.regulatoryDocument.findUnique({ where: { dispatchNo: body.dispatchNo } });
  if (exists) {
    return c.json({ error: '批示号已存在' }, 400);
  }

  const item = await prisma.regulatoryDocument.create({
    data: {
      dispatchNo: body.dispatchNo,
      title: body.title,
      fullTitle: body.fullTitle || null,
      category: body.category || null,
      applicability: body.applicability || 'conditional',
      applicableToIvd: Boolean(body.applicableToIvd),
      priorityLevel: body.priorityLevel || 'P2',
      summary: body.summary || null,
      applicabilityNote: body.applicabilityNote || null,
    },
  });

  return c.json(item, 201);
});

regulatoryDocuments.put('/:id', requirePermission('regulatory_documents.update'), async (c) => {
  const role = c.get('auth')?.systemRole;
  if (!hasPerm(c, 'regulatory_documents.update')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await prisma.regulatoryDocument.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ error: '法规文件不存在' }, 404);
  }

  if (body.dispatchNo && body.dispatchNo !== existing.dispatchNo) {
    const dup = await prisma.regulatoryDocument.findUnique({ where: { dispatchNo: body.dispatchNo } });
    if (dup) {
      return c.json({ error: '批示号已存在' }, 400);
    }
  }

  // D-1：原文文件改为 FileObject+Attachment 承接，前端在 /api/files 上传后回传 originalFileId
  if (body.originalFileId !== undefined) {
    if (body.originalFileId === null) {
      await clearOriginalAttachment(id);
    } else {
      const linked = await linkOriginalFile(id, body.originalFileId, getAuth(c).userId);
      if (!linked) {
        return c.json({ error: '原文文件不存在' }, 400);
      }
    }
  }

  const item = await prisma.regulatoryDocument.update({
    where: { id },
    data: {
      dispatchNo: body.dispatchNo ?? existing.dispatchNo,
      title: body.title ?? existing.title,
      fullTitle: body.fullTitle ?? existing.fullTitle,
      category: body.category ?? existing.category,
      applicability: body.applicability ?? existing.applicability,
      applicableToIvd: body.applicableToIvd == null ? existing.applicableToIvd : Boolean(body.applicableToIvd),
      priorityLevel: body.priorityLevel ?? existing.priorityLevel,
      summary: body.summary ?? existing.summary,
      applicabilityNote: body.applicabilityNote ?? existing.applicabilityNote,
    },
  });

  const fresh = await prisma.regulatoryDocument.findUnique({ where: { id }, include: ORIGINAL_INCLUDE });
  return c.json(mapOriginal(fresh));
});

regulatoryDocuments.delete('/:id', requirePermission('regulatory_documents.delete'), async (c) => {
  const role = c.get('auth')?.systemRole;
  if (!hasPerm(c, 'regulatory_documents.update')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const existing = await prisma.regulatoryDocument.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ error: '法规文件不存在' }, 404);
  }

  await prisma.regulatoryDocument.delete({ where: { id } });
  await clearOriginalAttachment(id);

  await prepareStorageDir();
  const files = await fs.readdir(STORAGE_DIR);
  const stale = files.filter((f) => f.startsWith(`${id}__`));
  await Promise.all(stale.map((f) => fs.rm(path.join(STORAGE_DIR, f), { force: true })));

  return c.json({ success: true });
});

regulatoryDocuments.post('/import', async (c) => {
  const role = c.get('auth')?.systemRole;
  if (!hasPerm(c, 'regulatory_documents.update')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const body = await c.req.json();
  const { fileName, fileDataBase64 } = body || {};
  if (!fileName || !fileDataBase64) {
    return c.json({ error: '缺少文件数据' }, 400);
  }

  const fileBuffer = decodeBase64Payload(fileDataBase64);
  if (!fileBuffer.length) {
    return c.json({ error: '文件内容为空' }, 400);
  }

  const baseTitle = sanitizeFileName(fileName).replace(/\.[^.]+$/, '') || '未命名法规文件';
  const generatedDispatchNo = (body.dispatchNo || baseTitle || 'REG-IMPORT').slice(0, 80);

  let dispatchNo = generatedDispatchNo;
  let suffix = 1;
  // 避免批示号冲突
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await prisma.regulatoryDocument.findUnique({ where: { dispatchNo } });
    if (!exists) break;
    suffix += 1;
    dispatchNo = `${generatedDispatchNo}-${suffix}`;
  }

  const item = await prisma.regulatoryDocument.create({
    data: {
      dispatchNo,
      title: body.title || baseTitle,
      fullTitle: body.fullTitle || null,
      category: body.category || null,
      applicability: body.applicability || 'conditional',
      applicableToIvd: body.applicableToIvd == null ? true : Boolean(body.applicableToIvd),
      priorityLevel: body.priorityLevel || 'P2',
      summary: body.summary || null,
      applicabilityNote: body.applicabilityNote || null,
    },
  });

  // D-1：原文统一 FileObject + Attachment 承接（旧 base64 入参保持兼容，不再落 legacy 目录）
  const fileObject = await putObject(prisma, {
    buffer: fileBuffer,
    originalName: sanitizeFileName(fileName),
    mimeType: guessMimeByFileName(fileName),
    uploadedById: getAuth(c).userId,
    folder: 'regulatory-documents',
  });
  await linkOriginalFile(item.id, fileObject.id, getAuth(c).userId);

  const fresh = await prisma.regulatoryDocument.findUnique({ where: { id: item.id }, include: ORIGINAL_INCLUDE });
  return c.json(mapOriginal(fresh), 201);
});

regulatoryDocuments.post('/seed', requirePermission('regulatory_documents.create'), async (c) => {
  try {
    let created = 0;
    let skipped = 0;

    for (const item of SEED_REGULATORY_DOCUMENTS) {
      // 以 dispatchNo 作为幂等键，重复执行时跳过已存在记录
      // eslint-disable-next-line no-await-in-loop
      const exists = await prisma.regulatoryDocument.findUnique({
        where: { dispatchNo: item.dispatchNo },
      });

      if (exists) {
        skipped += 1;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await prisma.regulatoryDocument.create({
        data: {
          dispatchNo: item.dispatchNo,
          title: item.title,
          fullTitle: item.fullTitle || null,
          category: item.category || null,
          applicability: item.applicability || 'conditional',
          applicableToIvd: item.applicableToIvd == null ? true : Boolean(item.applicableToIvd),
          priorityLevel: item.priorityLevel || 'P2',
          summary: item.summary || null,
          applicabilityNote: item.applicabilityNote || null,
        },
      });
      created += 1;
    }

    return c.json({
      success: true,
      created,
      skipped,
      total: SEED_REGULATORY_DOCUMENTS.length,
    });
  } catch (err) {
    console.error('法规知识库初始化失败', err);
    return c.json({ error: '法规知识库初始化失败' }, 500);
  }
});

// 兼容入口：base64 直传原文（新前端一律走 POST /api/files + PUT originalFileId）
regulatoryDocuments.post('/:id/original-file', async (c) => {
  const role = c.get('auth')?.systemRole;
  if (!hasPerm(c, 'regulatory_documents.update')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const item = await prisma.regulatoryDocument.findUnique({ where: { id } });
  if (!item) {
    return c.json({ error: '法规文件不存在' }, 404);
  }

  const body = await c.req.json();
  const { fileName, fileDataBase64 } = body || {};
  if (!fileName || !fileDataBase64) {
    return c.json({ error: '缺少文件数据' }, 400);
  }

  const fileBuffer = decodeBase64Payload(fileDataBase64);
  if (!fileBuffer.length) {
    return c.json({ error: '文件内容为空' }, 400);
  }

  // D-1 修复：原先写 RegulatoryDocument.fileName（schema 无此列）必报错；现统一 FileObject + Attachment
  const fileObject = await putObject(prisma, {
    buffer: fileBuffer,
    originalName: sanitizeFileName(fileName),
    mimeType: guessMimeByFileName(fileName),
    uploadedById: getAuth(c).userId,
    folder: 'regulatory-documents',
  });
  await linkOriginalFile(id, fileObject.id, getAuth(c).userId);

  const fresh = await prisma.regulatoryDocument.findUnique({ where: { id }, include: ORIGINAL_INCLUDE });
  return c.json(mapOriginal(fresh));
});

regulatoryDocuments.get('/:id/original-file', async (c) => {
  const role = c.get('auth')?.systemRole;
  if (!hasPerm(c, 'regulatory_documents.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const item = await prisma.regulatoryDocument.findUnique({ where: { id } });
  if (!item) {
    return c.json({ error: '法规文件不存在' }, 404);
  }

  // 优先 Attachment → FileObject（新流程）；旧数据回退 legacy 目录 `${id}__*`
  const att = await prisma.attachment.findFirst({
    where: { entityType: 'REGULATORY_DOCUMENT', entityId: id, label: 'original', deletedAt: null },
    include: { file: true },
    orderBy: { createdAt: 'desc' },
  });

  if (att?.file && !att.file.deletedAt) {
    try {
      const buf = await fs.readFile(safeStoragePath(att.file.storageKey));
      c.header('Content-Type', att.file.mimeType || guessMimeByFileName(att.file.originalName));
      c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.file.originalName)}`);
      return c.body(buf);
    } catch {
      // 文件缺失则继续走 legacy 回退
    }
  }

  const found = await findOriginalFile(id);
  if (!found) {
    return c.json({ error: '未找到原始文件' }, 404);
  }

  const mime = guessMimeByFileName(found.originalName);
  c.header('Content-Type', mime);
  c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(found.originalName)}`);
  return c.body(found.fileBuffer);
});

export default regulatoryDocuments;
