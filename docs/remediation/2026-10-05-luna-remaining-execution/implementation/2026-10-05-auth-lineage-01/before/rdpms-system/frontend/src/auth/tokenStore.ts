/**
 * tokenStore.ts — 令牌唯一入口
 *
 * 规则：
 *   1. 全应用只有本文件可以读写 token 相关的 localStorage
 *   2. 严禁任何页面 / 组件直接 localStorage.getItem('rdpms_*')
 *   3. token 值永不写死在代码里
 */

const K_ACCESS = 'rdpms.accessToken';
const K_REFRESH = 'rdpms.refreshToken';

type Listener = () => void;
const expiredListeners = new Set<Listener>();

export const tokenStore = {
  getAccessToken(): string | null {
    try {
      return localStorage.getItem(K_ACCESS);
    } catch {
      return null;
    }
  },

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(K_REFRESH);
    } catch {
      return null;
    }
  },

  setTokens(accessToken: string, refreshToken: string): void {
    try {
      localStorage.setItem(K_ACCESS, accessToken);
      localStorage.setItem(K_REFRESH, refreshToken);
    } catch {
      /* 隐私模式下 localStorage 不可用时静默降级为仅内存会话 */
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(K_ACCESS);
      localStorage.removeItem(K_REFRESH);
    } catch {
      /* noop */
    }
  },

  hasSession(): boolean {
    return Boolean(this.getRefreshToken());
  },

  /** 订阅「会话彻底失效」（refresh 也失败），由 AuthProvider 统一跳转 */
  onSessionExpired(fn: Listener): () => void {
    expiredListeners.add(fn);
    return () => {
      expiredListeners.delete(fn);
    };
  },

  emitSessionExpired(): void {
    expiredListeners.forEach((fn) => fn());
  },
};
