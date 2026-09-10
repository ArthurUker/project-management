import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import * as engine from './engine';
import type { ConflictRecord, SyncState } from './engine';

/**
 * SyncProvider —— 同步状态与动作的 React 上下文（批次四）
 * 登录后自动启动引擎（增量拉取 + outbox 上行 + 在线/离线监听），登出清空本地数据。
 */
interface SyncContextValue extends SyncState {
  deviceId: string;
  syncNow: () => void;
  resolveConflict: (clientMutationId: string, resolution: 'server' | 'local') => void;
  enqueueChange: typeof engine.enqueueChange;
  clearRejections: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<SyncState>(engine.getState());

  useEffect(() => engine.subscribe(setState), []);

  useEffect(() => {
    if (user) engine.start();
    else void engine.resetOnLogout();
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const value: SyncContextValue = {
    ...state,
    deviceId: engine.getDeviceId(),
    syncNow: () => void engine.syncNow(),
    resolveConflict: (id, resolution) => void engine.resolveConflict(id, resolution),
    enqueueChange: engine.enqueueChange,
    clearRejections: engine.clearRejections,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync 必须在 SyncProvider 内使用');
  return ctx;
}

export type { ConflictRecord };
