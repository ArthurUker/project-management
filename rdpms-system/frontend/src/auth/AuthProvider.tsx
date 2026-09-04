import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext, type AuthStatus } from './AuthContext';
import { tokenStore } from './tokenStore';
import { authAPI } from '../api/endpoints/auth';
import { isApiError } from '../api/error';
import type { CurrentUser } from '../types/user';

/**
 * AuthProvider — 会话状态的唯一持有者
 *
 * 设计要点：
 *   1. bootstrapping 状态必须存在，否则刷新页面时 AuthGuard 会在会话恢复前误跳登录
 *   2. 会话失效由 http 拦截器广播（tokenStore.emitSessionExpired），此处单点跳转
 *   3. 权限永远来自后端，前端不缓存角色 → 权限的映射
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const navigate = useNavigate();
  const location = useLocation();

  const applyUser = useCallback((next: CurrentUser | null) => {
    setUser(next);
    setPermissions(next?.permissions ?? []);
    setStatus(next ? 'authenticated' : 'anonymous');
  }, []);

  // ── 启动引导 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokenStore.hasSession()) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      try {
        const me = await authAPI.me();
        if (!cancelled) applyUser(me);
      } catch (e) {
        // /me 失败：优先用旧 verify 兜底一次，仍失败则判定会话失效
        if (isApiError(e) && e.isAuth) {
          try {
            const res = await authAPI.verify();
            if (!cancelled && res?.user) applyUser(res.user);
            return;
          } catch {
            /* fallthrough */
          }
        }
        tokenStore.clear();
        if (!cancelled) applyUser(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyUser]);

  // ── 全局会话失效 ──────────────────────────────────────────────────────────
  // 用 ref 持有最新路径，避免每次路由变化都重新订阅/退订
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(
    () =>
      tokenStore.onSessionExpired(() => {
        const { pathname, search } = locationRef.current;
        applyUser(null);
        navigate('/login', { replace: true, state: { from: pathname + search } });
      }),
    [applyUser, navigate],
  );

  // ── 登录 ──────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (username: string, password: string) => {
      const result = await authAPI.login({ username, password });
      tokenStore.setTokens(result.accessToken, result.refreshToken);
      applyUser(result.user);
      return result.user;
    },
    [applyUser],
  );

  // ── 登出 ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authAPI.logout(tokenStore.getRefreshToken());
    } catch {
      /* 登出失败也要清理本地会话 */
    }
    tokenStore.clear();
    applyUser(null);
  }, [applyUser]);

  // ── 手动刷新用户信息（改密 / 权限变更后调用）────────────────────────────
  const refreshUser = useCallback(async () => {
    const me = await authAPI.me();
    applyUser(me);
  }, [applyUser]);

  const value = useMemo(
    () => ({ status, user, permissions, login, logout, refreshUser }),
    [status, user, permissions, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
