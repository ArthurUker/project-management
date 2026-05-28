/**
 * versionLock.js — Prisma 乐观锁工具（去重层 3）
 *
 * 原理：
 *   数据库记录携带 version 字段（整数，默认 0）。
 *   客户端更新时附带上次读取的 version。
 *   服务端校验 version 是否匹配：
 *     - 匹配 → 执行更新，version + 1
 *     - 不匹配 → 抛出 409 ConflictError
 *   前端 AdaptiveUploadQueue 收到 409 后，拉取最新 version 并重试。
 *
 * 使用示例（在路由中）：
 *   import { updateWithVersionLock } from '../utils/versionLock.js';
 *   import { prisma } from '../index.js';
 *
 *   router.put('/:id', async (c) => {
 *     const id   = c.req.param('id');
 *     const body = await c.req.json();
 *     const updated = await updateWithVersionLock(prisma.project, id, body);
 *     return c.json(updated);
 *   });
 *
 * 注意：
 *   - 若 dto 中未携带 version 字段，则跳过版本校验（向后兼容旧客户端）。
 *   - 需确保对应 Prisma model 已添加 `version Int @default(0)` 字段。
 *     （可通过 ensureVersionColumn() 动态兼容历史表结构）
 */

import { ConflictError } from './errors.js';

/**
 * 带乐观锁的记录更新。
 *
 * @template T
 * @param {import('@prisma/client').PrismaDelegate} model  Prisma model 委托（如 prisma.project）
 * @param {string}                                  id     记录 ID
 * @param {Record<string, unknown>}                 dto    更新数据（可含 version 字段）
 * @param {{ where?: Record<string, unknown> }}     [opts] 额外的 where 条件
 * @returns {Promise<T>}
 * @throws {ConflictError} 当 dto.version 与数据库版本不匹配时
 * @throws {import('@prisma/client').PrismaClientKnownRequestError} P2025 记录不存在
 */
export async function updateWithVersionLock(model, id, dto, opts = {}) {
  const existing = await model.findUnique({
    where: { id, ...opts.where },
  });

  if (!existing) {
    const err = new Error(`记录不存在: ${id}`);
    err.status = 404;
    throw err;
  }

  // 仅在客户端传了 version 时才执行版本校验（向后兼容）
  if (dto.version !== undefined && dto.version !== existing.version) {
    throw new ConflictError({
      message:       '版本冲突，请获取最新数据后重试',
      serverVersion: existing.version,
      clientVersion: dto.version,
    });
  }

  const { version: _version, ...rest } = dto;
  return model.update({
    where: { id },
    data: {
      ...rest,
      version:   (existing.version ?? 0) + 1,
      updatedAt: new Date(),
    },
  });
}

/**
 * 为历史表动态添加 version 列（SQLite raw SQL）。
 * 在 ensureXxxColumns() 函数中调用。
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tableName  表名（大小写与 schema.prisma 中的 model 名一致）
 */
export async function ensureVersionColumn(prisma, tableName) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`);
  const hasVersion = (columns || []).some((col) => col.name === 'version');
  if (!hasVersion) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${tableName}" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0`,
    );
    console.log(`✅ Patched ${tableName}: added version column`);
  }
}
