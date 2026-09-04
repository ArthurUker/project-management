import { useCallback, useEffect, useMemo, useState } from 'react';
import { rolesAPI, toMessage, type PermissionCatalogItem, type RoleItem } from '@/api';
import { useHasPerm, PERMS } from '@/auth/permissions';
import { roleLabel } from '@/types/user';

/**
 * Roles —— RBAC 角色管理（M-1 §6；W10 新增）。
 *
 * 权限规则（UI 显隐；真实拦截在后端）：
 *   roles.view               —— 页面入口（仅 SUPER_ADMIN / ADMIN 持有）
 *   roles.assign_permissions —— 「分配权限」按钮（仅 SUPER_ADMIN）
 *   ADMIN 无 roles.assign_permissions，只能查看。
 */
const ROLE_STYLE: Record<string, { color: string; bg: string }> = {
  SUPER_ADMIN: { color: '#b91c1c', bg: '#fef2f2' },
  ADMIN: { color: '#7c3aed', bg: '#f5f3ff' },
  MANAGER: { color: '#2563eb', bg: '#eff6ff' },
  MEMBER: { color: '#6b7280', bg: '#f3f4f6' },
  VIEWER: { color: '#0d9488', bg: '#f0fdfa' },
  AUDITOR: { color: '#d97706', bg: '#fffbeb' },
};

export default function Roles() {
  const canView = useHasPerm(PERMS.ROLES_VIEW);
  const canAssignPermissions = useHasPerm(PERMS.ROLES_ASSIGN_PERMISSIONS);

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 权限分配弹层
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [moduleFilter, setModuleFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roleRes, catalogRes] = await Promise.all([rolesAPI.list(), rolesAPI.permissionCatalog()]);
      setRoles(roleRes.items ?? roleRes.list ?? []);
      setCatalog(catalogRes.items ?? catalogRes.list ?? []);
    } catch (e) {
      setError(toMessage(e, '加载角色失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void load();
  }, [load, canView]);

  const modules = useMemo(
    () => [...new Set(catalog.map((p) => p.module ?? 'other'))].sort(),
    [catalog],
  );
  const filteredCatalog = useMemo(
    () => (moduleFilter ? catalog.filter((p) => (p.module ?? 'other') === moduleFilter) : catalog),
    [catalog, moduleFilter],
  );

  const openAssign = (role: RoleItem) => {
    setEditingRole(role);
    setChecked(new Set(role.permissionCodes));
    setModuleFilter('');
  };

  const togglePerm = (code: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const saveAssign = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      await rolesAPI.assignPermissions(editingRole.id, [...checked]);
      setEditingRole(null);
      await load();
    } catch (e) {
      setError(toMessage(e, '保存权限失败'));
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return <div className="card p-12 text-center text-gray-500">您没有权限访问此页面</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">角色管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          权限真源为 permissions 表（M-1 P0 90 条）。角色权限数：SUPER_ADMIN 90 / ADMIN 80 / MANAGER 66 / MEMBER 31 / VIEWER 19 / AUDITOR 3。
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-left text-gray-600">
              <th className="px-4 py-2 font-medium">角色</th>
              <th className="px-4 py-2 font-medium">编码</th>
              <th className="px-4 py-2 font-medium">说明</th>
              <th className="px-4 py-2 font-medium text-center">用户数</th>
              <th className="px-4 py-2 font-medium text-center">权限数</th>
              <th className="px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const style = ROLE_STYLE[role.code] ?? { color: '#374151', bg: '#f3f4f6' };
              return (
                <tr key={role.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ background: style.bg, color: style.color }}
                    >
                      {role.name || roleLabel(role.code)}
                    </span>
                    {role.isSystem && <span className="ml-2 text-xs text-gray-400">内置</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{role.code}</td>
                  <td className="px-4 py-2 text-gray-500 max-w-sm truncate">{role.description ?? '—'}</td>
                  <td className="px-4 py-2 text-center text-gray-700">{role.userCount}</td>
                  <td className="px-4 py-2 text-center text-gray-700">{role.permissionCodes.length}</td>
                  <td className="px-4 py-2">
                    {/* M-1：roles.assign_permissions 仅 SUPER_ADMIN；ADMIN 只能查看 */}
                    {canAssignPermissions ? (
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => openAssign(role)}
                        disabled={role.code === 'SUPER_ADMIN'}
                        title={role.code === 'SUPER_ADMIN' ? 'SUPER_ADMIN 固定持有全部 P0，不可修改' : ''}
                      >
                        分配权限
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">查看</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {roles.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">暂无角色</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 权限分配弹层 */}
      {editingRole && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                分配权限 — {editingRole.name}
                <span className="ml-2 text-sm text-gray-400 font-normal">{checked.size} 项已选</span>
              </h3>
            </div>
            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
              <select className="input w-48" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                <option value="">全部模块</option>
                {modules.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">红色为高危权限（M-1 §5 八项高危）</span>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              <div className="grid grid-cols-2 gap-2">
                {filteredCatalog.map((p) => (
                  <label
                    key={p.code}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                      checked.has(p.code) ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(p.code)}
                      onChange={() => togglePerm(p.code)}
                    />
                    <span className={`font-mono text-xs ${p.isHighRisk ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                      {p.code}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingRole(null)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveAssign()} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
