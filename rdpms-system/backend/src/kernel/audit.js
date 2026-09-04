/**
 * kernel/audit.js —— 审计写入唯一入口（M-1 §6.7）
 *
 * 规则：
 *   1. action 必须来自 AUDIT_ACTIONS 常量（禁止裸字符串散写）
 *   2. 旧 action 自动归一化（LEGACY_AUDIT_ACTION_MAP），新写入绝不含旧值
 *   3. metadata 用于 elevated / override / breakGlass / permissionCode
 *   4. 导出、权限变更、敏感读取必须写 metadata.permissionCode
 */
import { AUDIT_ACTIONS, AUDIT_ACTION_LIST, LEGACY_AUDIT_ACTION_MAP } from './constants.js';

export function normalizeAuditAction(action) {
  return LEGACY_AUDIT_ACTION_MAP[action] ?? action;
}

/** 从 Hono 上下文提取请求上下文 */
export function requestCtx(c) {
  return {
    ip: c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || c.req.header('X-Real-IP') || null,
    userAgent: c.req.header('User-Agent')?.slice(0, 512) || null,
    requestId: c.get('requestId') || c.req.header('X-Request-Id') || null,
  };
}

/**
 * 写审计日志。任何字段缺失都不阻断业务（审计失败仅告警），但 action 非法直接抛错。
 */
export async function writeAudit(prisma, entry) {
  const action = normalizeAuditAction(entry.action);
  if (!AUDIT_ACTION_LIST.includes(action)) {
    throw new Error(`writeAudit: 非法审计动作 "${entry.action}"（必须使用 AUDIT_ACTIONS 常量）`);
  }
  const row = {
    actorId: entry.actorId ?? null,
    actorName: entry.actorName ?? null,
    actorRole: entry.actorRole ?? null,
    action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    entityLabel: entry.entityLabel ?? null,
    before: entry.before === undefined ? undefined : entry.before,
    after: entry.after === undefined ? undefined : entry.after,
    changedFields: entry.changedFields ?? [],
    metadata: entry.metadata ?? undefined,
    ...requestCtx(entry.c ?? {}),
  };
  try {
    await prisma.auditLog.create({ data: row });
  } catch (err) {
    console.error('[audit] 写入失败（不阻断业务）:', err?.message || err);
  }
}

/** 常用封装：权限变更 / 导出 / 敏感读取（强制 metadata.permissionCode） */
export function auditPermissionEvent(prisma, { c, actor, action, entityType, entityId, entityLabel, permissionCode, metadata }) {
  return writeAudit(prisma, {
    c,
    actorId: actor?.id ?? null,
    actorName: actor?.displayName ?? actor?.username ?? null,
    actorRole: actor?.systemRole ?? null,
    action,
    entityType,
    entityId,
    entityLabel,
    metadata: { permissionCode, ...(metadata ?? {}) },
  });
}
