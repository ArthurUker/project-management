/**
 * safeStorage.ts — 隐私模式/配额异常下不抛错的 localStorage 封装（A-6）
 *
 * 背景：Safari 隐私模式等场景 localStorage.setItem 会抛 QuotaExceededError，
 * 中断保存草稿等主流程（Tencent 审查修复意图，enh 重实现）。
 * 约束：token 读写仍走 auth/tokenStore.ts（唯一令牌入口），本工具不用于令牌。
 */
const memoryFallback = new Map<string, string>();

export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  },

  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* 隐私模式/配额超限：静默降级为内存态（页面刷新即失） */
      memoryFallback.set(key, value);
    }
  },

  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
    memoryFallback.delete(key);
  },

  getJSON<T>(key: string, fallback: T): T {
    const raw = this.get(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
};
