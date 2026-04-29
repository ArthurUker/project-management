import React, { useState, useEffect } from 'react';
import { projectAPI, userAPI, projectTemplatesAPI } from '../api/client';
import { getAllowedTransitions } from '../constants/statusColors';

// ─── 与 Prisma Schema 严格对齐的类型 ───
interface Project {
  id: string;
  name: string;
  code?: string;
  type?: string;
  subtype?: string;
  status?: string;
  position?: string;   // 注意：后端字段是 position，不是 description
  managerId?: string;
  startDate?: string | null;
  endDate?: string | null;
  templateId?: string | null;
}

interface User {
  id: string;
  name: string;
  username?: string;
}

interface EditProjectModalProps {
  project: Project | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_OPTIONS = ['platform', '定制', '合作', '测试', '应用'];

const EditProjectModal = ({ project, onClose, onSaved }: EditProjectModalProps) => {
  const [form, setForm] = useState({
    name:      '',
    type:      '',
    subtype:   '',
    status:    '',
    position:  '',
    managerId: '',
    startDate: '',
    endDate:   '',
    templateId: '',
  });
  const [users, setUsers]       = useState<User[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [saving, setSaving]     = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (!project) return;
    setForm({
      name:      project.name        ?? '',
      type:      project.type        ?? '',
      subtype:   project.subtype     ?? '',
      status:    project.status      ?? '',
      position:  project.position    ?? '',
      managerId: project.managerId   ?? '',
      startDate: project.startDate   ? String(project.startDate).slice(0, 10) : '',
      endDate:   project.endDate     ? String(project.endDate).slice(0, 10)   : '',
      templateId: project.templateId ?? '',
    });
  }, [project]);

  // 加载模版列表
  useEffect(() => {
    projectTemplatesAPI.list().then((res: any) => {
      const list = res.templates ?? res.list ?? res.data ?? res;
      setTemplates(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, []);

  // 加载用户列表（用于负责人选择）
  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await userAPI.list();
        const data = res.users ?? res.list ?? res.data ?? res;
        setUsers(Array.isArray(data) ? data : []);
      } catch {
        // 加载失败不影响主流程
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSaving(true);
    try {
      // 构造提交数据，空字符串转为 null
      const payload = {
        name:      form.name,
        type:      form.type      || undefined,
        subtype:   form.subtype   || undefined,
        status:    form.status    || undefined,
        position:  form.position  || undefined,
        managerId: form.managerId || undefined,
        startDate: form.startDate || null,
        endDate:   form.endDate   || null,
        templateId: form.templateId || undefined,
      };
      await projectAPI.update(project.id, payload);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err?.message ?? err?.error ?? '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (!project) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg
                      max-h-[90vh] overflow-y-auto">

        {/* ── 头部 ── */}
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">编辑项目</h2>
            {project.code && (
              <p className="text-xs text-gray-400 font-mono mt-0.5">{project.code}</p>
            )}
          </div>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-gray-400 hover:text-gray-600 hover:bg-gray-100
                       transition-colors"
            onClick={onClose}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── 表单 ── */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* 项目名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              项目名称 <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200
                         focus:border-blue-400 transition-colors"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="请输入项目名称"
              required
            />
          </div>

          {/* 类型 + 子类型 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                项目类型
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 bg-white transition-colors"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                <option value="">- 请选择 -</option>
                {TYPE_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                子类型
              </label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 transition-colors"
                value={form.subtype}
                onChange={e => setForm({ ...form, subtype: e.target.value })}
                placeholder="如 2.0C / 3.0 / 黑马"
              />
            </div>
          </div>

          {/* 状态 + 负责人 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                项目状态
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 bg-white transition-colors"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
              >
                <option value="">- 请选择 -</option>
                {getAllowedTransitions(project?.status).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {project?.status && (
                <p className="text-xs text-gray-400 mt-1">
                  当前：{project.status}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                项目负责人
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 bg-white transition-colors
                           disabled:bg-gray-50 disabled:text-gray-400"
                value={form.managerId}
                onChange={e => setForm({ ...form, managerId: e.target.value })}
                disabled={loadingUsers}
              >
                <option value="">
                  {loadingUsers ? '加载中...' : '- 请选择负责人 -'}
                </option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.username ? ` (${u.username})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 项目定位 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              项目定位
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200
                         focus:border-blue-400 transition-colors resize-none"
              rows={2}
              value={form.position}
              onChange={e => setForm({ ...form, position: e.target.value })}
              placeholder="项目定位或简要描述"
            />
          </div>

          {/* 项目模版 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              项目模版
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200
                         focus:border-blue-400 bg-white transition-colors"
              value={form.templateId}
              onChange={e => setForm({ ...form, templateId: e.target.value })}
            >
              <option value="">- 不使用模版 -</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* 开始时间 + 结束时间 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                开始日期
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 transition-colors"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                结束日期
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 transition-colors"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* ── 底部按钮 ── */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200
                         rounded-lg hover:bg-gray-50 transition-colors"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg
                         hover:bg-blue-700 transition-colors disabled:opacity-50
                         disabled:cursor-not-allowed flex items-center gap-2"
              disabled={saving}
            >
              {saving && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none"
                  viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default EditProjectModal;
