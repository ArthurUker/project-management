/**
 * shared/idempotency.ts —— 幂等键的稳定派生（RF02 复核）
 *
 * 要求：**同一次逻辑操作必须复用同一个 key**。否则用户在「请求已到达服务端但响应丢失」时点重试，
 * 会用新 key 再执行一遍，造成重复写入或覆盖（服务端只能靠 key 去重）。
 *
 * 做法：对「操作类型 + 目标 + 参与写入的内容」求 SHA-256 派生 key：
 *   - 同一操作、同一内容重复提交 → 同一 key → 服务端回放首次结果；
 *   - 内容被用户修改后再提交 → 新 key → 视为新操作（避免与服务端已存回执的 payloadHash 冲突）。
 *
 * 环境不支持 WebCrypto（非安全上下文）时回退到随机 UUID——此时退化为「不去重」，
 * 但不会产生错误结果，且生产与开发（https / localhost）均在安全上下文中。
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 随机 key 兜底（不用 offline/engine，避免把离线栈打进纯工具模块） */
function randomKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `op-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 由逻辑操作派生稳定幂等键。
 * @param parts 参与派生的内容（应包含操作类型、目标 ID 与会写入的字段）
 */
export async function stableMutationId(parts: unknown): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return randomKey();
    const payload = new TextEncoder().encode(JSON.stringify(parts ?? null));
    const digest = await subtle.digest('SHA-256', payload);
    return `op-${toHex(new Uint8Array(digest)).slice(0, 40)}`;
  } catch {
    return randomKey();
  }
}
