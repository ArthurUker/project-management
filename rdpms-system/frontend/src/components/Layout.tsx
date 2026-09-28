import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { MENU, filterMenu, type MenuItem } from '../config/menu';
import { roleLabel } from '../types/user';
import OfflineBanner from './OfflineBanner';
import SyncStatusIndicator from './SyncStatusIndicator';

/**
 * 应用外壳。
 *
 * 视觉规范对齐参考仓库（Tianjiabing_foodtestlab @ Product_tencent_CVM）：
 *   1. 顶栏：深色玻璃吸顶导航（.glass-dark），右侧同步状态 / 用户徽章 / 红色登出；
 *   2. 侧栏一级菜单：图标 + 标签 + 右侧 chevron（展开时旋转 90°），
 *      激活态为「渐变浅底 + 左侧 3px 强调竖条 + 加粗」；
 *   3. 侧栏二级菜单：默认收起，展开后为**虚线导轨 + 缩进**的子项列表（点击一级项切换）；
 *   4. 折叠按钮：桌面端可把侧栏收成纯图标（对应 admin-schools.html 的 .collapsed）；
 *   5. 超管控制台配色：超管使用参考仓库 admin-schools.html 的**浅色玻璃侧栏**，
 *      其余角色使用主控制台（index.html）的深色玻璃侧栏。
 * 高度模型保持「视口固定 + 内容区内部滚动」：多个页面依赖 h-full / min-h-0 约束。
 */
function useMenuMatch() {
  const location = useLocation();
  return useCallback(
    (target?: string) => {
      if (!target) return false;
      const [pathname, query] = target.split('?');
      const pathHit =
        location.pathname === pathname ||
        (!query && pathname !== '/' && location.pathname.startsWith(`${pathname}/`));
      if (!pathHit) return false;
      if (!query) return true;
      const want = new URLSearchParams(query);
      const have = new URLSearchParams(location.search);
      for (const [k, v] of want.entries()) if (have.get(k) !== v) return false;
      return true;
    },
    [location.pathname, location.search],
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, permissions, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  /** 菜单由后端下发的 permissions 驱动；无权限项直接隐藏 */
  const filteredNav = useMemo<MenuItem[]>(() => filterMenu(MENU, permissions), [permissions]);

  const isActive = useMenuMatch();
  const isSuperAdmin = String(user?.systemRole ?? user?.role ?? '') === 'SUPER_ADMIN';

  /** 超管 = 参考仓库超管控制台（浅色玻璃）；其他角色 = 主控制台（深色玻璃） */
  const chrome = {
    aside: isSuperAdmin ? 'glass text-slate-700' : 'glass-dark text-white',
    divider: isSuperAdmin ? 'border-slate-900/10' : 'border-white/15',
    brandTitle: isSuperAdmin ? 'text-slate-800' : 'text-white',
    brandSub: isSuperAdmin ? 'text-slate-500' : 'text-white/60',
    iconTile: isSuperAdmin
      ? 'border-white/60 bg-gradient-to-br from-blue-500 to-indigo-500 text-white'
      : 'border-white/25 bg-white/15 text-white',
    collapseBtn: isSuperAdmin
      ? 'bg-slate-900/5 text-slate-500 hover:bg-slate-900/10'
      : 'bg-white/10 text-white/70 hover:bg-white/20',
    itemBase: isSuperAdmin
      ? 'text-slate-600 hover:bg-blue-500/10 hover:text-blue-800'
      : 'text-white/75 hover:bg-white/10 hover:text-white',
    itemActive: isSuperAdmin
      ? 'bg-gradient-to-r from-blue-500/15 to-indigo-500/15 font-semibold text-[#1e3a8a] shadow-[inset_3px_0_0_#3b82f6]'
      : 'bg-white/20 font-semibold text-white shadow-[inset_3px_0_0_rgba(255,255,255,0.85)]',
    chevron: isSuperAdmin ? 'text-slate-400' : 'text-white/45',
    rail: isSuperAdmin ? 'border-slate-900/15' : 'border-white/25',
    subItemBase: isSuperAdmin
      ? 'text-slate-500 hover:bg-blue-500/10 hover:text-blue-800'
      : 'text-white/65 hover:bg-white/10 hover:text-white',
    subItemActive: isSuperAdmin
      ? 'bg-blue-500/15 font-semibold text-[#1e3a8a]'
      : 'bg-white/20 font-semibold text-white',
  };

  /** 移动端：路由切换后自动收起侧栏 */
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  /** 二级菜单：当前路由所在的分组默认展开 */
  useEffect(() => {
    const hit = filteredNav.find((item) => item.children?.some((child) => isActive(child.path)));
    if (hit) setExpanded((prev) => (prev[hit.key] ? prev : { ...prev, [hit.key]: true }));
  }, [filteredNav, isActive]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const renderIcon = (Icon?: LucideIcon) =>
    Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> : null;

  const roleText = user?.position || roleLabel(user?.systemRole ?? user?.role);

  const width = collapsed ? 'w-[76px]' : 'w-64';

  return (
    <div className="flex h-screen flex-col">
      {/* 顶部导航（深色玻璃，吸顶） */}
      <nav className="glass-dark z-40 shrink-0 text-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 md:hidden"
              title="菜单"
            >
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15">
              <span className="text-sm font-bold tracking-wide">RD</span>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight">
                研发项目管理系统
                {isSuperAdmin && (
                  <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 align-middle text-xs font-normal">
                    超级管理员
                  </span>
                )}
              </h1>
              <p className="truncate text-[11px] text-white/60">R&amp;D Project Management System</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SyncStatusIndicator />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-sm text-white/85">{user?.name}</span>
              <span className="rounded-full border border-white/20 bg-white/15 px-2 py-0.5 text-xs text-white/85">
                {roleText}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl bg-red-600/90 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-600"
              title="退出登录"
            >
              登出
            </button>
          </div>
        </div>
      </nav>

      {/* 主体：玻璃侧栏 + 玻璃内容区 */}
      <div className="flex min-h-0 flex-1 gap-5 px-4 py-4">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/45 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`${chrome.aside} ${width} shrink-0 flex-col overflow-hidden transition-[width] duration-200 ${
            sidebarOpen ? 'fixed inset-y-3 left-3 z-50 flex md:static md:inset-auto md:z-0' : 'hidden md:flex'
          }`}
        >
          {/* 品牌区 + 折叠按钮（对齐参考仓库 admin-sidebar__brand） */}
          <div className={`flex items-center gap-3 border-b px-4 py-3 ${chrome.divider}`}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${chrome.iconTile}`}>
              <span className="text-sm font-bold">RD</span>
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-bold ${chrome.brandTitle}`}>
                  {isSuperAdmin ? '超管控制台' : '工作台'}
                </p>
                <p className={`truncate text-[11px] ${chrome.brandSub}`}>研发项目管理系统</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors md:inline-flex ${chrome.collapseBtn}`}
              title={collapsed ? '展开菜单' : '折叠菜单'}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* 一级 / 二级菜单 */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-2.5">
            {filteredNav.map((item) => {
              const hasChildren = !!item.children?.length;
              const childActive = hasChildren && item.children!.some((c) => isActive(c.path));
              const selfActive = isActive(item.path) || childActive;
              const open = !collapsed && !!expanded[item.key];

              if (!hasChildren) {
                return (
                  <Link
                    key={item.key}
                    to={item.path as string}
                    title={item.label}
                    className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors ${
                      chrome.itemBase
                    } ${selfActive ? chrome.itemActive : ''} ${collapsed ? 'justify-center px-0' : ''}`}
                  >
                    {renderIcon(item.icon)}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              }

              return (
                <div key={item.key}>
                  <div
                    role="button"
                    tabIndex={0}
                    title={item.label}
                    onClick={() => {
                      setExpanded((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                      if (item.path) navigate(item.path);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpanded((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                        if (item.path) navigate(item.path);
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors ${
                      chrome.itemBase
                    } ${selfActive ? chrome.itemActive : ''} ${collapsed ? 'justify-center px-0' : ''}`}
                  >
                    {renderIcon(item.icon)}
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${chrome.chevron} ${
                            open ? 'rotate-90' : ''
                          }`}
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </div>

                  {/* 二级菜单：虚线导轨 + 缩进（对齐参考仓库 .admin-sidebar__subnav） */}
                  {open && (
                    <div
                      className={`ml-3 mr-2 mt-1 space-y-0.5 border-l border-dashed py-1 pl-3 ${chrome.rail}`}
                    >
                      {item.children!.map((child) => {
                        const active = isActive(child.path);
                        return (
                          <Link
                            key={child.key}
                            to={child.path as string}
                            title={child.label}
                            className={`flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors ${
                              chrome.subItemBase
                            } ${active ? chrome.subItemActive : ''}`}
                          >
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* 用户区 */}
          <div className={`border-t p-3 ${chrome.divider}`}>
            <div
              className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''} ${
                isSuperAdmin ? 'rounded-2xl border border-white/60 bg-white/40 p-2.5' : 'rounded-2xl border border-white/15 bg-white/10 p-2.5'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                  isSuperAdmin ? 'border-white/70 bg-white text-[#1e3a8a]' : 'border-white/20 bg-white/15 text-white'
                }`}
              >
                <span className="text-sm font-semibold">{user?.name?.charAt(0) || 'U'}</span>
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${chrome.brandTitle}`}>{user?.name}</p>
                    <p className={`truncate text-xs ${chrome.brandSub}`}>{roleText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={`rounded-lg p-2 transition-colors ${
                      isSuperAdmin ? 'text-slate-400 hover:bg-slate-900/5 hover:text-slate-600' : 'text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                    title="退出登录"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <OfflineBanner />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
