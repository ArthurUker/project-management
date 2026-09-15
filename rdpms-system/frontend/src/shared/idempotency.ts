/**
 * shared/idempotency.ts —— 幂等键的**操作生命周期**（RF02 复核第二轮）
 *
 * 语义修正：幂等键属于「一次逻辑操作」，**不是**内容哈希。
 *   - 网络重试（同一操作、同一 payload）→ 复用同一 key，服务端回放首次结果；
 *   - 用户修改内容后再提交 → 新 key（旧 key 已绑定旧 payloadHash，复用会 409）；
 *   - 用户明确再次发起操作，即使内容一模一样 → 仍是**新 key**（新的一次业务操作）；
 *   - 操作成功结束后，键位清空，下一次点击一定是新 key。
 *
 * 反例（已废弃）：用「内容哈希」直接当 key —— 会把两次独立的业务操作误判为同一次，
 * 导致第二次操作被服务端当作重放而静默不生效。
 */

function randomKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `op-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export interface OperationKeyStore {
  /**
   * 取本次逻辑操作的 key。
   * @param fingerprint 操作身份（操作类型 + 目标 + 会写入的内容）；相同即视为同一次操作的重试
   * @param slot 同一操作内可有多条子写入（例如多项目分别保存），用 slot 区分
   */
  keyFor(fingerprint: string, slot?: string): string;
  /** 操作成功结束：清空键位，使用户下次主动发起的相同操作获得新 key */
  complete(): void;
  /** 当前操作指纹（供调试/测试观察） */
  currentFingerprint(): string | null;
}

/** 构造一个操作级 key 存储（纯内存，不跨页面刷新保留——刷新后的再次提交视为新操作） */
export function createOperationKeyStore(generate: () => string = randomKey): OperationKeyStore {
  let current: { fingerprint: string; keys: Map<string, string> } | null = null;

  return {
    keyFor(fingerprint, slot = 'default') {
      if (!current || current.fingerprint !== fingerprint) {
        current = { fingerprint, keys: new Map() };
      }
      const existing = current.keys.get(slot);
      if (existing) return existing;
      const key = generate();
      current.keys.set(slot, key);
      return key;
    },
    complete() {
      current = null;
    },
    currentFingerprint() {
      return current?.fingerprint ?? null;
    },
  };
}

/** 构造操作指纹：只包含「操作类型 + 目标 + 会写入的字段」，顺序稳定 */
export function operationFingerprint(parts: Record<string, unknown>): string {
  const normalized = Object.keys(parts)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = parts[key];
      return acc;
    }, {});
  return JSON.stringify(normalized);
}
