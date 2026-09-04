import { createContext } from 'react';
import type { CurrentUser } from '../types/user';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  /** 权限唯一来源，来自后端 /api/auth/me */
  permissions: string[];
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
