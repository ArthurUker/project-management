import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { FullPageSpinner } from '../components/FullPageSpinner';

/**
 * AuthGuard — 未登录一律跳登录页，并记住来源路径以便登录后回跳。
 * bootstrapping 期间必须渲染 loading，否则刷新页面会被误判为未登录。
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'bootstrapping') return <FullPageSpinner />;

  if (status === 'anonymous' || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // 种子 / 重置密码账号：强制改密
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
