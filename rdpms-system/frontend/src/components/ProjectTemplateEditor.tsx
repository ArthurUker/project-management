import { useEffect, useState } from 'react';
import { projectTemplatesAPI } from '../api/client';

interface Role {
  id?: string;
  name: string;
  description?: string;
  permissions?: string;
  sortOrder?: number;
}

interface Props {
  templateId: string;
  onClose: () => void;
  onSave?: () => void;
}

export default function ProjectTemplateEditor({ templateId, onClose, onSave }: Props) {
  const [template, setTemplate] = useState<any>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'roles'>('overview');
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);

  useEffect(() => {
    loadData();
  }, [templateId]);

  async function loadData() {
    setLoading(true);
    try {
      const [tplRes, rolesRes] = await Promise.all([
        projectTemplatesAPI.get(templateId),
        projectTemplatesAPI.roles.list(templateId),
      ]);
      setTemplate(tplRes.data || tplRes);
      setRoles((rolesRes as any).roles || []);
    } catch (err) {
      console.error('Failed to load template:', err);
      alert('加载模板失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRole() {
    if (!editingRole?.name.trim()) {
      alert('请输入角色名称');
      return;
    }

    setSaving(true);
    try {
      if (editingRole.id) {
        // 编辑
        await projectTemplatesAPI.roles.update(templateId, editingRole.id, editingRole);
      } else {
        // 创建
        await projectTemplatesAPI.roles.create(templateId, editingRole);
      }
      await loadData();
      setEditingRole(null);
      setShowRoleForm(false);
    } catch (err: any) {
      alert(err?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole(roleId: string) {
    if (!window.confirm('确认删除此角色？')) return;
    try {
      await projectTemplatesAPI.roles.delete(templateId, roleId);
      await loadData();
    } catch (err: any) {
      alert(err?.error || '删除失败');
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-96 text-center">
          <div className="animate-pulse">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{template?.name || '模板编辑'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{template?.code}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100 bg-gray-50">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'overview'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            概览
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'roles'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            角色定义 ({roles.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">模板名称</label>
                <p className="text-gray-900 font-medium">{template?.name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">分类</label>
                <p className="text-gray-600">
                  {template?.category === 'reagent_chip' ? '试剂/芯片开发' : template?.category === 'device' ? '设备开发' : '其他'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
                <p className="text-gray-600">{template?.description || '无'}</p>
              </div>

              {template?.phases && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">模板结构</label>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">{template.phases.length} 个阶段</span>
                    </p>
                    <ul className="space-y-1 text-sm">
                      {template.phases.slice(0, 5).map((phase: any, idx: number) => (
                        <li key={idx} className="text-gray-600">
                          • {phase.name || phase.title}
                        </li>
                      ))}
                      {template.phases.length > 5 && (
                        <li className="text-gray-400">... 等 {template.phases.length - 5} 个</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'roles' && (
            <div className="p-6">
              {showRoleForm ? (
                <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold text-gray-900">
                    {editingRole?.id ? '编辑角色' : '新建角色'}
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">角色名称 *</label>
                    <input
                      type="text"
                      className="input w-full"
                      placeholder="如：项目负责人、技术负责人、成员"
                      value={editingRole?.name || ''}
                      onChange={e => setEditingRole(r => r ? { ...r, name: e.target.value } : null)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                    <textarea
                      className="input w-full resize-none"
                      rows={2}
                      placeholder="角色描述（可选）"
                      value={editingRole?.description || ''}
                      onChange={e => setEditingRole(r => r ? { ...r, description: e.target.value } : null)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">权限</label>
                    <input
                      type="text"
                      className="input w-full"
                      placeholder="如：view,edit,approve（逗号分隔，可选）"
                      value={editingRole?.permissions || ''}
                      onChange={e => setEditingRole(r => r ? { ...r, permissions: e.target.value } : null)}
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setEditingRole(null);
                        setShowRoleForm(false);
                      }}
                      className="btn btn-secondary flex-1"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveRole}
                      disabled={saving}
                      className="btn btn-primary flex-1"
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingRole({ name: '', description: '', permissions: '', sortOrder: roles.length });
                      setShowRoleForm(true);
                    }}
                    className="btn btn-primary mb-4 w-full"
                  >
                    + 新增角色
                  </button>

                  {roles.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <p>暂无角色定义</p>
                      <p className="text-sm mt-1">点击"新增角色"开始定义项目团队角色</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {roles.map((role, idx) => (
                        <div key={role.id || idx} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{role.name}</h4>
                              {role.description && (
                                <p className="text-sm text-gray-600 mt-1">{role.description}</p>
                              )}
                              {role.permissions && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {role.permissions.split(',').map((perm, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded"
                                    >
                                      {perm.trim()}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setEditingRole(role);
                                  setShowRoleForm(true);
                                }}
                                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => handleDeleteRole(role.id!)}
                                className="text-red-600 hover:text-red-700 text-sm font-medium"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn btn-secondary">
            关闭
          </button>
          {onSave && (
            <button onClick={onSave} className="btn btn-primary">
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
