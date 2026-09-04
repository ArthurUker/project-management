import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { hasPerm, type MaybePerm } from '../auth/permissions';

interface RoleGuardProps {
  /** 需要全部满足的权限（AND）；不传表示仅要求已登录 */
  perm?: MaybePerm | MaybePerm[];
  /** 自定义无权限呈现；默认跳转 /403 */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * RoleGuard — 已登录但权限不足：渲染 403，绝不跳登录页。
 * 仅用于 UI 呈现，真实拦截在后端；后端返回 403 时由拦截器抛出 ApiError。
 */
export function RoleGuard({ perm, fallback, children }: RoleGuardProps) {
  const { permissions } = useAuth();

  if (!hasPerm(permissions, perm)) {
    return <>{fallback ?? <Navigate to="/403" replace />}</>;
  }

  return <>{children}</>;
}
