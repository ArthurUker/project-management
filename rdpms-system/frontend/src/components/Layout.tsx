import { useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { MENU, filterMenu, type MenuItem } from '../config/menu';
import { roleLabel } from '../types/user';


export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, permissions, logout } = useAuth();

  /** 菜单由后端下发的 permissions 驱动；无权限项直接隐藏 */
  const filteredNav = useMemo<MenuItem[]>(() => filterMenu(MENU, permissions), [permissions]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  
  return (
    <div className="flex h-screen" style={{ background: 'transparent' }}>
      {/* 侧边栏 */}
      <aside className="w-64 border-r border-gray-200 flex flex-col" style={{ background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', borderRight: '1px solid rgba(255,255,255,0.70)', boxShadow: '2px 0 20px rgba(0,0,0,0.05)', position: 'relative', zIndex: 10 }}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">RD</span>
            </div>
            <div>
              <h1 className="font-display font-semibold text-gray-900">研发项目管理系统</h1>
              <p className="text-xs text-gray-500">R&D PMS</p>
            </div>
          </div>
        </div>
        
        {/* 导航 */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {filteredNav.map((item) => {
            // handle parent items with children
            const isParentActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            if (item.children && item.children.length) {
              return (
                <div key={item.path} className="mb-2">
                  <div
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                      isParentActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                      </svg>
                      <span className="font-medium">{item.label}</span>
                    </div>
                    {/* link to parent page */}
                    {item.path && (
                      <Link to={item.path} className="text-sm text-gray-400 hover:text-gray-600">查看</Link>
                    )}
                  </div>

                  <div className="pl-8">
                    {item.children.map((child: any) => {
                      const isActive = location.pathname === child.path || (child.path !== '/' && location.pathname.startsWith(child.path));
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={`block px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                            isActive ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <span className="font-medium">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            const isActive = isParentActive;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        {/* 用户信息 */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-primary-600 font-semibold">
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {user?.position || roleLabel(user?.systemRole ?? user?.role)}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              title="退出登录"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
      
      {/* 主内容区 */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="p-6 flex-1 min-h-0 overflow-hidden flex flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
}