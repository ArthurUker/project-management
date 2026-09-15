/**
 * platform/idempotency/receipts.js —— 持久化幂等回执（RF02）
 *
 * 修复的缺陷（F01/F09）：
 *   - 旧实现是「鉴权之前」按 Idempotency-Key 命中的内存 Map：无鉴权即可回放他人响应，
 *     键不绑定用户/路径/内容，进程重启即失效；
 *   - 同步路径的回执在业务写入之后独立创建，且不校验内容哈希，重启窗口会重复写业务。
 *
 * 现行为（05 §2）：
 *   1. 调用方必须先完成鉴权与资源授权，再调用本模块 → 回执查询永远发生在授权之后；
 *   2. 回执作用域 = actor + command + resourceScope + idempotencyKey，另记 payloadHash；
 *   3. 数据修改、关键审计、回执在同一事务提交；失败整体回滚，不留成功回执；
 *   4. 并发同键：唯一索引使后到的事务阻塞在插入上，先到者提交后，后到者读到已提交回执并回放；
 *      若先到者回滚，后到者获得写入权并真正执行。
 */
import { HttpError } from '../../kernel/http.js';
import { hashPayload } from './payloadHash.js';

/** 回执保留期（用于 expiresAt 标记；清理任务不在本期范围） */
export const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
/** 事务上限：并发同键时后到者需等待先到者提交 */
const TX_TIMEOUT_MS = 15_000;

/** 幂等键来源：优先请求体 clientMutationId（新契约），其次 Idempotency-Key 头（旧客户端） */
export function resolveIdempotencyKey(c, body) {
  const fromBody = typeof body?.clientMutationId === 'string' ? body.clientMutationId.trim() : '';
  if (fromBody) return { key: fromBody, source: 'body.clientMutationId' };
  const header = c?.req?.header?.('Idempotency-Key');
  if (header && header.trim()) return { key: header.trim(), source: 'header.Idempotency-Key' };
  return { key: null, source: null };
}

function scopeWhere(actorId, command, resourceScope, idempotencyKey) {
  return {
    actorId_command_resourceScope_idempotencyKey: {
      actorId, command, resourceScope, idempotencyKey,
    },
  };
}

/** 是否为本表幂等作用域唯一键冲突（不能把其他唯一约束冲突当成并发同键） */
function isReceiptScopeConflict(err) {
  if (err?.code !== 'P2002') return false;
  const target = err.meta?.target;
  const flat = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return flat.includes('mutation_receipts_scope_key')
    || (flat.includes('actor_id') && flat.includes('command') && flat.includes('idempotency_key'));
}

function replayReceipt(receipt, payloadHash) {
  if (receipt.payloadHash !== payloadHash) {
    throw new HttpError(
      409,
      'IDEMPOTENCY_PAYLOAD_MISMATCH',
      '相同幂等键已用于不同的请求内容，请使用新的幂等键',
    );
  }
  return { status: receipt.responseStatus, body: receipt.responseBody, replayed: true };
}

/**
 * 以幂等语义执行一个命令。
 *
 * @param {object} args
 * @param {object} args.db               数据库客户端（当前实例作用域解析出的）
 * @param {{userId: string}} args.actor  已认证主体
 * @param {string} args.command          规范化命令名（路由模板，如 'PUT /api/reports/:id'）
 * @param {string} args.resourceScope    已授权的资源作用域（如 'report:r1'）
 * @param {string|null} args.idempotencyKey
 * @param {*} args.payload               参与内容哈希的规范化请求内容
 * @param {(tx: object) => Promise<{status: number, body: object}>} args.execute
 *        事务内执行业务写入（含严格审计）。抛错即回滚，不留下回执。
 * @returns {Promise<{status: number, body: object, replayed: boolean}>}
 */
export async function withIdempotency({
  db, actor, command, resourceScope, idempotencyKey, payload, execute,
}) {
  if (!idempotencyKey) {
    // 无幂等键：不做去重（保持旧客户端可用），但仍要求事务内完成业务与审计
    const result = await db.$transaction((tx) => execute(tx), { timeout: TX_TIMEOUT_MS });
    return { ...result, replayed: false };
  }

  const payloadHash = hashPayload(payload);

  // 1) 回执查询——只在调用方完成鉴权、资源授权、状态校验之后执行
  const existing = await db.mutationReceipt.findUnique({
    where: scopeWhere(actor.userId, command, resourceScope, idempotencyKey),
  });
  if (existing) return replayReceipt(existing, payloadHash);

  // 2) 事务：占位回执（唯一键即并发锁）→ 业务与严格审计 → 回填响应
  try {
    return await db.$transaction(async (tx) => {
      const placeholder = await tx.mutationReceipt.create({
        data: {
          actorId: actor.userId,
          command,
          resourceScope,
          idempotencyKey,
          payloadHash,
          responseStatus: 0,
          responseBody: {},
          expiresAt: new Date(Date.now() + RECEIPT_TTL_MS),
        },
      });
      const result = await execute(tx);
      await tx.mutationReceipt.update({
        where: { id: placeholder.id },
        data: { responseStatus: result.status, responseBody: result.body },
      });
      return { ...result, replayed: false };
    }, { timeout: TX_TIMEOUT_MS });
  } catch (err) {
    if (isReceiptScopeConflict(err)) {
      // 并发同键：先到者已提交（或正提交），读取其回执并回放；读不到说明先到者已回滚
      const committed = await db.mutationReceipt.findUnique({
        where: scopeWhere(actor.userId, command, resourceScope, idempotencyKey),
      });
      if (committed) return replayReceipt(committed, payloadHash);
      throw new HttpError(409, 'IDEMPOTENCY_IN_PROGRESS', '相同幂等键的请求正在处理中，请稍后重试');
    }
    // 业务失败：事务已回滚，无回执、无半成品
    throw err;
  }
}
