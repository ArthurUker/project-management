import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

/** 403：已登录但权限不足。绝不跳转登录页。 */
export default function Forbidden() {
  const { user, permissions } = useAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center max-w-lg">
        <div className="text-6xl font-bold text-gray-300">403</div>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">没有访问权限</h1>
        <p className="mt-2 text-sm text-gray-500">
          你的账号（{user?.name ?? '未知用户'}）没有访问该功能的权限。
          <br />
          如需使用，请联系系统管理员开通对应权限。
        </p>

        {permissions.length === 0 && (
          <p className="mt-3 text-xs text-amber-600">
            当前账号未获取到任何权限点，可能是后端尚未配置角色权限。
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link to="/" className="btn btn-primary">
            返回仪表盘
          </Link>
          <button type="button" onClick={() => history.back()} className="btn btn-secondary">
            返回上一页
          </button>
        </div>
      </div>
    </div>
  );
}
