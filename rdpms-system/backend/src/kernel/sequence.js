/**
 * kernel/sequence.js —— CodeSequence 原子发号（M-1 §6.4）
 *
 * 用 INSERT ... ON CONFLICT DO UPDATE ... RETURNING 替代 count()+1，
 * 消除并发创建时的编号竞态与唯一约束冲突。
 */
import { randomUUID } from 'node:crypto';
import { badRequest } from './http.js';

/**
 * 取下一个业务编号。
 * @param {PrismaClient} prisma
 * @param {string} scope 发号器域（PROJECT / PRIMER / SAMPLE / ...）
 * @param {{ periodKey?: string, fallbackPrefix?: string, padding?: number }} opts
 * @returns {Promise<string>} 形如 SMP-2026-001
 */
export async function nextCode(prisma, scope, opts = {}) {
  const periodKey = opts.periodKey ?? '';
  const rows = await prisma.$queryRaw`
    INSERT INTO "code_sequences" ("id", "scope", "period_key", "prefix", "padding", "last_value", "updated_at")
    VALUES (${randomUUID()}, ${scope}, ${periodKey}, ${opts.fallbackPrefix ?? scope + '-'}, ${opts.padding ?? 3}, 1, NOW())
    ON CONFLICT ("scope", "period_key")
    DO UPDATE SET "last_value" = "code_sequences"."last_value" + 1, "updated_at" = NOW()
    RETURNING "last_value" AS last_value, "prefix" AS prefix, "padding" AS padding
  `;
  const row = rows?.[0];
  if (!row) throw badRequest('SEQUENCE_ERROR', `发号器 ${scope} 不可用`);
  return `${row.prefix}${String(row.last_value).padStart(row.padding, '0')}`;
}
