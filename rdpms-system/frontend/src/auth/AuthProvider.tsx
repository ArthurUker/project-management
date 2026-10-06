import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext, type AuthStatus } from './AuthContext';
import { tokenStore, type SessionSnapshot } from './tokenStore';
import { authAPI } from '../api/endpoints/auth';
import { ApiError } from '../api/error';
import type { CurrentUser } from '../types/user';

/** Profiles, tokens and navigation belong to the initiating login generation. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const userRef = useRef<CurrentUser | null>(null);
  const mounted = useRef(false);
  const shownGeneration = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const applyUser = useCallback((next: CurrentUser | null) => {
    if (!mounted.current) return;
    userRef.current = next; setUser(next); setPermissions(next?.permissions ?? []);
    setStatus(next ? 'authenticated' : 'anonymous');
  }, []);
  const applyOwned = useCallback((owner: SessionSnapshot, next: CurrentUser) => {
    if (!tokenStore.sameLogin(owner) || next.id !== owner.actorId) return false;
    shownGeneration.current = owner.loginGeneration; applyUser(next); return true;
  }, [applyUser]);
  const loadCurrent = useCallback(async (owner: SessionSnapshot) => {
    try { const me = await authAPI.me(); applyOwned(owner, me); }
    catch {
      // HTTP owns definitive auth cleanup. Network/403/stale results never clear tokens.
      if (mounted.current && tokenStore.sameLogin(owner) && !userRef.current) setStatus('anonymous');
    }
  }, [applyOwned]);
  useEffect(() => {
    mounted.current = true;
    const onChange = (next: SessionSnapshot | null) => {
      if (!next) { shownGeneration.current = null; applyUser(null); return; }
      if (shownGeneration.current === next.loginGeneration && userRef.current?.id === next.actorId) return;
      userRef.current = null; setUser(null); setPermissions([]); setStatus('bootstrapping');
      void loadCurrent(next);
    };
    const offChange = tokenStore.onSessionChanged(onChange);
    const offExpired = tokenStore.onSessionExpired((generation) => {
      if (tokenStore.generation() !== generation || tokenStore.hasSession()) return;
      const { pathname, search } = locationRef.current;
      applyUser(null); navigate('/login', { replace: true, state: { from: pathname + search } });
    });
    onChange(tokenStore.snapshot());
    return () => { mounted.current = false; offChange(); offExpired(); };
  }, [applyUser, loadCurrent, navigate]);
  const login = useCallback(async (username: string, password: string) => {
    const ticket = await tokenStore.beginLogin();
    const result = await authAPI.login({ username, password });
    const owner = await tokenStore.finishLogin(ticket, result.user.id, result.accessToken, result.refreshToken);
    if (!owner || !applyOwned(owner, result.user)) throw new ApiError(0,
      { code: 'SESSION_CHANGED', message: '登录操作已被较新的会话替代' });
    return result.user;
  }, [applyOwned]);
  const logout = useCallback(async () => {
    const owner = tokenStore.snapshot(); const generation = tokenStore.generation();
    // Explicit captured Bearer: no refresh, and never borrow a later user's credential.
    const request = owner ? authAPI.logout(owner.refreshToken, owner.accessToken).catch(() => undefined) : Promise.resolve();
    await tokenStore.clearGeneration(generation); // invalidate without waiting for network
    await request; // completion cannot clear or apply a newer login
  }, []);
  const refreshUser = useCallback(async () => {
    const owner = tokenStore.snapshot(); if (!owner) return;
    const me = await authAPI.me(); applyOwned(owner, me);
  }, [applyOwned]);
  const value = useMemo(() => ({ status, user, permissions, login, logout, refreshUser }),
    [status, user, permissions, login, logout, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
