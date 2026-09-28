/**
 * shared/idempotency.ts —— 幂等键的**操作会话 + 子操作槽位 + 资源作用域**模型
 *
 * 背景（两轮独立复核确认的产品缺陷）：
 *   v1（已废弃）：只保存一个全局 fingerprint，任何内容变化即清空整个 Map —— 多项目 A/B、
 *     保存/提交并存时，重试必然换新 key，服务端回执全部失效。
 *   v2（已废弃）：改为「会话 + 槽位」，但**任一槽位签名变化就轮换整个会话** ——
 *     用户在同一个页面里修改了 B 项目的内容，已经保存成功的 A 也会被换上新 key，
 *     于是 A 的下一次点击变成「新的写入」而不是回执重放（A04 复核指出的残留缺口）。
 *
 * v3（本文件）：
 *   - **会话 session**：一次用户操作（打开编辑页 → 保存/提交）。不含 payload，只含操作类型与目标；
 *   - **槽位 slot**：会话内的稳定子操作，如 `save:<projectId>` / `update:<reportId>` / `submit:<reportId>`；
 *   - **资源作用域 scope**：同一份业务资源的多个命令共享作用域（`report:<id>` 覆盖 update+submit）。
 *     签名变化只在该作用域内轮换，**不牵连其它项目/其它资源已成功的 key**；
 *   - **成功标记 succeeded**：已经成功的子步骤保留原 key（重试即服务端回执重放，不产生新写入）；
 *   - 全部成功后 `complete()` 关闭会话，用户下一次主动操作才是新 key。
 *
 * 与内容哈希语义的区别：签名只用于**同一会话内**的漂移检测，不会把「内容相同」当作
 * 「永远是同一次业务操作」——会话边界由用户操作决定。
 */

function randomKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `op-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export interface SlotState {
  key: string;
  signature: string;
  /** 该子步骤是否已确认成功（成功后保留 key，重试走服务端回执重放） */
  succeeded: boolean;
  /** 资源作用域：同作用域的槽位一起轮换 */
  scope: string;
}

export interface OperationKeyStore {
  /**
   * 取某个子操作的幂等键。
   * @param session 操作会话标识（同一次用户操作内保持不变，不含 payload 内容）
   * @param slot 子操作槽位（`save:<projectId>` / `update:<id>` / `submit:<id>`）
   * @param signature 该槽位的载荷签名（无载荷用 ''）；变化即视为该资源的新的业务操作身份
   * @param scope 资源作用域（同一业务资源的多个命令传同一个值；缺省 = 槽位自身）
   */
  keyFor(session: string, slot: string, signature?: string, scope?: string): string;
  /** 标记子步骤已成功（保留 key；与传入 key 不一致时不覆盖，防止误标） */
  markSucceeded(session: string, slot: string, key?: string): void;
  /** 观察/断言用：该槽位是否已成功 */
  hasSucceeded(session: string, slot: string): boolean;
  /** 观察/断言用：当前会话的槽位明细 */
  openSlots(session: string): Record<string, SlotState>;
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

  const resetForSession = (session: string) => {
    if (sessionId !== session) {
      sessionId = session;
      slots = new Map();
    }
  };

  return {
    keyFor(session, slot, signature = '', scope) {
      resetForSession(session);
      const effectiveScope = scope || slot;
      const prev = slots.get(slot);
      if (prev && prev.signature === signature) return prev.key;
      if (prev && prev.signature !== signature) {
        // 该槽位载荷发生变化 → 只轮换**同一资源作用域**内的槽位；
        // 其它资源（其它项目 / 其它日报）已分配的 key 必须保留（A04：失败重试与部分成功重试）
        slots = new Map([...slots.entries()].filter(([, v]) => v.scope !== effectiveScope));
      }
      const key = generate();
      slots.set(slot, { key, signature, succeeded: false, scope: effectiveScope });
      return key;
    },
    markSucceeded(session, slot, key) {
      if (sessionId !== session) return;
      const prev = slots.get(slot);
      if (!prev) return;
      // 只允许标记「当前 key」成功，避免用旧 key 覆盖已轮换的新身份
      if (key && key !== prev.key) return;
      slots.set(slot, { ...prev, succeeded: true });
    },
    hasSucceeded(session, slot) {
      if (sessionId !== session) return false;
      return slots.get(slot)?.succeeded === true;
    },
    openSlots(session) {
      if (sessionId !== session) return {};
      return Object.fromEntries(slots.entries());
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

/** 构造槽位载荷签名（仅用于同会话、同资源作用域内的漂移检测） */
export function slotSignature(payload: unknown): string {
  if (payload === undefined || payload === null) return '';
  return typeof payload === 'string' ? payload : JSON.stringify(payload);
}
