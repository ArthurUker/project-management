import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { forbidden } from './http.js';

/**
 * kernel/storage.js — 文件二进制落盘 + FileObject 元数据的共享实现（M-1 §6.5）。
 *
 * files 域与其他需要引用文件的业务域（如法规原文、任务附件）统一走这里，
 * 保证：存储根一致（UPLOAD_DIR 优先，默认 <cwd>/uploads）、storageKey 规则一致、
 * 元数据全部在 FileObject（二进制永不进数据库）。
 */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');

export function safeStoragePath(storageKey) {
  const full = path.resolve(UPLOAD_ROOT, storageKey);
  if (full !== UPLOAD_ROOT && !full.startsWith(UPLOAD_ROOT + path.sep)) {
    throw forbidden('FORBIDDEN', '非法存储路径');
  }
  return full;
}

/**
 * 写入缓冲区并登记 FileObject。调用方负责后续 Attachment 关联与审计。
 * storageKey 形如 `<folder|年份>/<uuid>-<安全化文件名>`。
 */
export async function putObject(prisma, { buffer, originalName, mimeType, uploadedById, folder }) {
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeName = String(originalName || 'file').replace(/[^\w.\-一-龥]+/g, '_');
  const storageKey = `${folder || new Date().getFullYear()}/${crypto.randomUUID()}-${safeName}`;
  const full = safeStoragePath(storageKey);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buffer);

  return prisma.fileObject.create({
    data: {
      storageKey,
      provider: 'LOCAL',
      originalName,
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: buffer.length,
      checksum,
      // scanStatus 默认 SKIPPED：未配置扫描时不做任何安全承诺
      uploadedById: uploadedById || null,
    },
  });
}
