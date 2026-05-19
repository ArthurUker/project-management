import { useState, useEffect, useMemo } from 'react';
import { projectTemplatesAPI } from '../api/client';

interface Role {
  id?: string;
  name: string;
  description?: string;
  permissions?: string;
}

interface User {
  id: string;
  name: string;
  username?: string;
  position?: string;
}

interface Props {
  projectId: string;
  project?: any;
  availableUsers: User[];
  loadingUsers: boolean;
  onSave: (userId: string, role: string) => Promise<void>;
  onClose: () => void;
}

export default function AddMemberModal({ projectId, project, availableUsers, loadingUsers, onSave, onClose }: Props) {
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberRole, setMemberRole] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 8;

  // Load template roles if project has a template
  useEffect(() => {
    loadRoles();
  }, [projectId]);

  async function loadRoles() {
    setLoading(true);
    try {
      if (project?.templateId) {
        const res = await projectTemplatesAPI.roles.list(project.templateId);
        const roleList = (res as any).roles || [];
        setRoles(roleList);
        if (roleList.length > 0) {
          setMemberRole(roleList[0].name);
        }
      } else {
        // Fallback to default roles if no template
        setRoles([
          { name: '项目成员', description: '普通项目成员' },
          { name: '技术负责人', description: '技术方向负责' },
          { name: '项目负责人', description: '项目整体负责' },
          { name: '观察者', description: '仅查看权限' },
        ]);
        setMemberRole('项目成员');
      }
    } catch (err) {
      console.error('Failed to load roles:', err);
      // Fallback roles
      setRoles([
        { name: '成员', description: '普通成员' },
        { name: '观察者', description: '观察者' },
      ]);
      setMemberRole('成员');
    } finally {
      setLoading(false);
    }
  }

  // Filter users based on keyword
  const filteredUsers = useMemo(() => {
    return availableUsers.filter(u =>
      u.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      u.position?.toLowerCase().includes(searchKeyword.toLowerCase())
    );
  }, [availableUsers, searchKeyword]);

  // Paginate filtered users
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, page]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

  const handleAddMember = async () => {
    if (!selectedMemberId || !memberRole) {
      alert('请选择成员和角色');
      return;
    }

    setSaving(true);
    try {
      await onSave(selectedMemberId, memberRole);
      setSelectedMemberId('');
      setSearchKeyword('');
      setPage(1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">添加项目成员</h2>
            <p className="text-xs text-gray-400 mt-0.5">为当前项目添加新的协作成员</p>
          </div>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            onClick={onClose}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">搜索成员</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              placeholder="按名字、用户名或职位搜索..."
              value={searchKeyword}
              onChange={e => {
                setSearchKeyword(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Member List with Pagination */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">选择成员</label>
            {loading ? (
              <div className="text-center py-4 text-gray-400">加载角色中...</div>
            ) : loadingUsers ? (
              <div className="text-center py-4 text-gray-400">加载成员中...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-4 text-gray-400">
                {searchKeyword ? '未找到匹配的成员' : '暂无可添加成员'}
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-3 max-h-52 overflow-y-auto border border-gray-200 rounded-lg">
                  {paginatedUsers.map(user => (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer rounded"
                    >
                      <input
                        type="radio"
                        name="member"
                        value={user.id}
                        checked={selectedMemberId === user.id}
                        onChange={e => setSelectedMemberId(e.target.value)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                        {(user.username || user.position) && (
                          <p className="text-xs text-gray-500 truncate">
                            {user.username} {user.position ? `· ${user.position}` : ''}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-sm px-2">
                    <span className="text-gray-500">
                      第 {page} / {totalPages} 页 （共 {filteredUsers.length} 人）
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50"
                      >
                        上一页
                      </button>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">项目角色</label>
            {roles.length === 0 ? (
              <div className="text-center py-4 text-gray-400">加载角色中...</div>
            ) : roles.length > 4 ? (
              // Dropdown for many roles
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                value={memberRole}
                onChange={e => setMemberRole(e.target.value)}
              >
                {roles.map(role => (
                  <option key={role.name} value={role.name}>
                    {role.name} {role.description ? `- ${role.description}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              // Radio buttons for few roles
              <div className="space-y-2">
                {roles.map(role => (
                  <label key={role.name} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value={role.name}
                      checked={memberRole === role.name}
                      onChange={e => setMemberRole(e.target.value)}
                      className="w-4 h-4 mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{role.name}</p>
                      {role.description && (
                        <p className="text-xs text-gray-500">{role.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAddMember}
            disabled={saving || !selectedMemberId || !memberRole}
          >
            {saving ? '添加中...' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
