/**
 * shared/idempotency.ts —— 幂等键的**操作会话 + 子操作槽位**模型（RF02 复核第三轮重设计）
 *
 * 背景（审查确认的产品缺陷）：旧实现只保存**一个** fingerprint，fingerprint 变化会清空整个 slot map。
 * 而生产路径上同一用户操作包含多个不同 fingerprint 的子操作：
 *   - 多项目保存：A/B 的 content 不同 → fingerprint 不同；
 *   - 已有日报：update 与 submit 是不同 fingerprint。
 * 结果：A 成功、B 失败后重试时 A/B 都换新 key（A 无法命中回执）；submit 响应丢失后重试会先生成新的
 * update key，可能被状态锁拦住而根本走不到 submit 重放。
 *
 * 新模型：
 *   - **操作会话（session）** = 一次用户操作（例如「编辑某日报」），与 payload 内容无关；
 *   - **槽位（slot）** = 会话内的稳定子操作，如 `save:<projectId>` / `update:<reportId>` / `submit:<reportId>`；
 *   - 每个槽位保存 `{key, signature}`：签名不变 → 重试复用同一 key；
 *   - 任一槽位签名变化（用户真改了内容）→ 视为**新的业务操作身份**：轮换会话、全部槽位换新 key；
 *   - 全部成功后 `complete()` 关闭会话，用户再次主动操作才是新 key。
 *
 * 与内容哈希语义的区别：签名只用于**同一会话内**的漂移检测，不会把「内容相同」直接当作
 * 「永远是同一次业务操作」——会话边界由用户操作决定。
 */

function randomKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `op-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

interface SlotState {
  key: string;
  signature: string;
}

export interface OperationKeyStore {
  /**
   * 取某个子操作的幂等键。
   * @param session 操作会话标识（同一次用户操作内保持不变，不含 payload 内容）
   * @param slot 子操作槽位（`save:<projectId>` / `update:<id>` / `submit:<id>`）
   * @param signature 该槽位的载荷签名（无载荷用 ''）；变化即视为新的业务操作身份
   */
  keyFor(session: string, slot: string, signature?: string): string;
  /** 全部子操作成功：关闭会话，下一次主动操作生成全新 key */
  complete(): void;
  /** 观察用：当前会话标识（测试/调试） */
  currentSession(): string | null;
  /** 观察用：当前会话内已分配的槽位与 key（测试/调试） */
  snapshot(): Record<string, string>;
}

export function createOperationKeyStore(generate: () => string = randomKey): OperationKeyStore {
  let sessionId: string | null = null;
  let slots = new Map<string, SlotState>();

  return {
    keyFor(session, slot, signature = '') {
      // 会话切换（用户发起了另一次操作）：全新开始
      if (sessionId !== session) {
        sessionId = session;
        slots = new Map();
      }
      const prev = slots.get(slot);
      if (prev && prev.signature === signature) return prev.key;
      if (prev && prev.signature !== signature) {
        // 该槽位载荷发生变化 → 新的业务操作身份：整会话轮换（其它槽位也不得复用旧回执）
        slots = new Map();
      }
      const key = generate();
      slots.set(slot, { key, signature });
      return key;
    },
    complete() {
      sessionId = null;
      slots = new Map();
    },
    currentSession() {
      return sessionId;
    },
    snapshot() {
      return Object.fromEntries([...slots.entries()].map(([k, v]) => [k, v.key]));
    },
  };
}

/** 构造会话标识：只含「操作类型 + 目标」，不含 payload，保证一次操作内所有子操作共享会话 */
export function operationSession(parts: Record<string, unknown>): string {
  const normalized = Object.keys(parts)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = parts[key];
      return acc;
    }, {});
  return JSON.stringify(normalized);
}

/** 构造槽位载荷签名（仅用于同会话内的漂移检测） */
export function slotSignature(payload: unknown): string {
  if (payload === undefined || payload === null) return '';
  return typeof payload === 'string' ? payload : JSON.stringify(payload);
}
