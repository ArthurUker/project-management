import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';
import { promises as fs } from 'fs';
import path from 'path';

const regulatoryDocuments = new Hono();
const STORAGE_DIR = path.resolve(process.cwd(), 'uploads', 'regulatory-documents');

regulatoryDocuments.use('*', authMiddleware);

const ROLE_PERMISSIONS = {
  admin: ['registrations.view', 'registrations.edit', 'registrations.approve'],
  manager: ['registrations.view', 'registrations.edit'],
  member: ['registrations.view'],
};

function hasPerm(role, perm) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(perm);
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

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

async function saveOriginalFile(documentId, originalFileName, fileBuffer) {
  await ensureStorageDir();
  const safeName = sanitizeFileName(originalFileName || 'source.pdf');
  const finalName = `${documentId}__${safeName}`;
  const finalPath = path.join(STORAGE_DIR, finalName);

  const files = await fs.readdir(STORAGE_DIR);
  const stale = files.filter((f) => f.startsWith(`${documentId}__`));
  await Promise.all(stale.map((f) => fs.rm(path.join(STORAGE_DIR, f), { force: true })));

  await fs.writeFile(finalPath, fileBuffer);
}

async function findOriginalFile(documentId) {
  await ensureStorageDir();
  const files = await fs.readdir(STORAGE_DIR);
  const matched = files.find((f) => f.startsWith(`${documentId}__`));
  if (!matched) return null;

  const fullPath = path.join(STORAGE_DIR, matched);
  const fileBuffer = await fs.readFile(fullPath);
  const originalName = matched.replace(`${documentId}__`, '') || `${documentId}.pdf`;
  return { fileBuffer, originalName };
}

regulatoryDocuments.get('/', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.view')) {
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
    }),
  ]);

  return c.json({
    list,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize),
  });
});

regulatoryDocuments.get('/:id', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const item = await prisma.regulatoryDocument.findUnique({
    where: { id },
  });

  if (!item) {
    return c.json({ error: '法规文件不存在' }, 404);
  }

  return c.json(item);
});

regulatoryDocuments.post('/', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.edit')) {
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
      fileName: body.fileName || null,
    },
  });

  return c.json(item, 201);
});

regulatoryDocuments.put('/:id', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.edit')) {
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
      fileName: body.fileName ?? existing.fileName,
    },
  });

  return c.json(item);
});

regulatoryDocuments.delete('/:id', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.edit')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const existing = await prisma.regulatoryDocument.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ error: '法规文件不存在' }, 404);
  }

  await prisma.regulatoryDocument.delete({ where: { id } });

  await ensureStorageDir();
  const files = await fs.readdir(STORAGE_DIR);
  const stale = files.filter((f) => f.startsWith(`${id}__`));
  await Promise.all(stale.map((f) => fs.rm(path.join(STORAGE_DIR, f), { force: true })));

  return c.json({ success: true });
});

regulatoryDocuments.post('/import', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.edit')) {
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
      fileName: sanitizeFileName(fileName),
    },
  });

  await saveOriginalFile(item.id, fileName, fileBuffer);
  return c.json(item, 201);
});

regulatoryDocuments.post('/:id/original-file', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.edit')) {
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

  await saveOriginalFile(id, fileName, fileBuffer);
  const updated = await prisma.regulatoryDocument.update({
    where: { id },
    data: { fileName: sanitizeFileName(fileName) },
  });

  return c.json(updated);
});

regulatoryDocuments.get('/:id/original-file', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const item = await prisma.regulatoryDocument.findUnique({ where: { id } });
  if (!item) {
    return c.json({ error: '法规文件不存在' }, 404);
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
