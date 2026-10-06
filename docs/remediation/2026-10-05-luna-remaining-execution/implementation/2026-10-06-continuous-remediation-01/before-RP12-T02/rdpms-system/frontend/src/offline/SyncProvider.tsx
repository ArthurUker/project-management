import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { tokenStore } from '../auth/tokenStore';
import { useAuth } from '../auth/useAuth';
import * as engine from './engine';
import type { ConflictRecord, SyncState } from './engine';

/**
 * SyncProvider —— 同步状态与动作的 React 上下文（批次四）
 * 认证完成后启动当前 owner；身份恢复仅暂停，退出保留所有未确认草稿。
 */
interface SyncContextValue extends SyncState {
  deviceId: string;
  syncNow: () => void;
  resolveConflict: (clientMutationId: string, resolution: 'server' | 'local') => void;
  enqueueChange: typeof engine.enqueueChange;
  clearRejections: () => void;
  /** A09：拒绝草稿的查看 / 重试 / 放弃（用户可发现、可操作） */
  getRejectedPayload: typeof engine.getRejectedPayload;
  retryRejection: typeof engine.retryRejection;
  dropRejection: typeof engine.dropRejection;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, status, permissions } = useAuth();
  const [generation, setGeneration] = useState(tokenStore.generation());
  const [state, setState] = useState<SyncState>(engine.getState());

  useEffect(() => engine.subscribe(setState), []);
  useEffect(() => tokenStore.onSessionChanged(() => setGeneration(tokenStore.generation())), []);

  useEffect(() => {
    const owner = tokenStore.snapshot();
    if (status === 'authenticated' && user) void engine.start(user.id, permissions).catch(() => {
      if (owner && tokenStore.sameLogin(owner)) engine.pauseForBootstrap();
    });
    else if (status === 'bootstrapping') engine.pauseForBootstrap();
    else void engine.resetOnLogout();
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, status, generation, permissions]);

  const value: SyncContextValue = {
    ...state,
    deviceId: engine.getDeviceId(),
    syncNow: () => void engine.syncNow(),
    resolveConflict: (id, resolution) => void engine.resolveConflict(id, resolution),
    enqueueChange: engine.enqueueChange,
    clearRejections: engine.clearRejections,
    getRejectedPayload: engine.getRejectedPayload,
    retryRejection: engine.retryRejection,
    dropRejection: engine.dropRejection,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync 必须在 SyncProvider 内使用');
  return ctx;
}

export type { ConflictRecord };
