/**
 * platform/audit/strictAudit.js —— 事务内严格审计（RF02）
 *
 * 与 kernel/audit.js 的 writeAudit 的差别（05 §2、F15）：
 *   - writeAudit：吞掉写入异常、多半在业务提交之后独立执行 → 不能作为业务证据；
 *   - writeAuditStrict：在业务事务内执行，写入失败即抛错并回滚业务 → 审计与业务同生共死。
 *
 * 访问日志/性能日志不在此列（可异步、可降级），业务证据必须走本模块。
 */
import { buildAuditRow } from '../../kernel/audit.js';

/**
 * 在事务客户端上写审计；失败抛出，调用方的事务随之回滚。
 * @param {object} tx     Prisma 事务客户端（$transaction 回调参数）
 * @param {object} entry 审计条目（与 writeAudit 同结构）
 */
export async function writeAuditStrict(tx, entry) {
  const row = buildAuditRow(entry);
  return tx.auditLog.create({ data: row });
}
