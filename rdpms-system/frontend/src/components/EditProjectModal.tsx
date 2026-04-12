import React, { useState, useEffect } from 'react';
import api from '../api/client';

interface Project {
  id: string;
  name: string;
  type?: string;
  status?: string;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface EditProjectModalProps {
  project: Project | null;
  onClose: () => void;
  onSaved: () => void;
}

const EditProjectModal = ({ project, onClose, onSaved }: EditProjectModalProps) => {
  const [form, setForm] = useState({
    name:        project?.name        ?? '',
    type:        project?.type        ?? '',
    status:      project?.status      ?? '',
    description: project?.description ?? '',
    startDate:   project?.startDate   ? String(project.startDate).slice(0,10) : '',
    endDate:     project?.endDate     ? String(project.endDate).slice(0,10)   : '',
  });

  useEffect(() => {
    setForm({
      name:        project?.name        ?? '',
      type:        project?.type        ?? '',
      status:      project?.status      ?? '',
      description: project?.description ?? '',
      startDate:   project?.startDate   ? String(project.startDate).slice(0,10) : '',
      endDate:     project?.endDate     ? String(project.endDate).slice(0,10)   : '',
    });
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    try {
      await api.put(`/projects/${project.id}`, form);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err?.message || '保存失败');
    }
  };

  if (!project) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 w-[480px] shadow-xl">
        <h2 className="text-lg font-semibold mb-4">编辑项目</h2>
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-sm text-gray-600">项目名称 *</label>
            <input
              className="w-full border rounded px-3 py-2 mt-1"
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600">项目类型</label>
              <select
                className="w-full border rounded px-3 py-2 mt-1"
                value={form.type}
                onChange={e => setForm({...form, type: e.target.value})}
              >
                <option value="">- 请选择 -</option>
                <option value="定制">定制</option>
                <option value="合作">合作</option>
                <option value="应用">应用</option>
                <option value="平台">平台</option>
                <option value="试剂开发">试剂开发</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">项目状态</label>
              <select
                className="w-full border rounded px-3 py-2 mt-1"
                value={form.status}
                onChange={e => setForm({...form, status: e.target.value})}
              >
                <option value="">- 请选择 -</option>
                <option value="规划中">规划中</option>
                <option value="进行中">进行中</option>
                <option value="待验证">待验证</option>
                <option value="已完成">已完成</option>
                <option value="暂停">暂停</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600">开始日期</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 mt-1"
                value={form.startDate}
                onChange={e => setForm({...form, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">结束日期</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 mt-1"
                value={form.endDate}
                onChange={e => setForm({...form, endDate: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-600">项目描述</label>
            <textarea
              className="w-full border rounded px-3 py-2 mt-1 h-20 resize-none"
              value={form.description}
              onChange={e => setForm({...form, description: e.target.value})}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="px-4 py-2 border rounded hover:bg-gray-50"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProjectModal;
