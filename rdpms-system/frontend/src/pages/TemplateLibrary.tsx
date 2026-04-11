import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectTemplatesAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

const CATEGORIES = [
  { value: '', label: '全部模版' },
  { value: 'reagent_chip', label: '试剂/芯片开发' },
  { value: 'device', label: '设备开发' },
];

const CATEGORY_LABELS: Record<string, string> = {
  reagent_chip: '试剂/芯片开发',
  device: '设备开发',
};

const CATEGORY_COLORS: Record<string, string> = {
  reagent_chip: 'bg-blue-100 text-blue-700',
  device: 'bg-purple-100 text-purple-700',
};

function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAppStore();
  const [form, setForm] = useState({ name: '', category: 'reagent_chip', description: '', isMaster: false });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await projectTemplatesAPI.create({
        name: form.name,
        category: form.category,
        description: form.description,
        isMaster: form.isMaster,
        content: JSON.stringify({ phases: [], milestones: [] }),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      alert(err?.error || '创建失败');
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== 'admin') {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-80 text-center">
          <p className="text-gray-600 mb-4">仅管理员可创建模版</p>
          <button onClick={onClose} className="btn btn-secondary w-full">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[480px]">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold">新建模版</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模版名称 *</label>
            <input
              className="input w-full"
              placeholder="输入模版名称"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">大类</label>
            <select className="input w-full" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="reagent_chip">试剂/芯片开发</option>
              <option value="device">设备开发</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              className="input w-full resize-none"
              rows={3}
              placeholder="模版描述（可选）"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isMaster"
              checked={form.isMaster}
              onChange={e => setForm(f => ({ ...f, isMaster: e.target.checked }))}
            />
            <label htmlFor="isMaster" className="text-sm text-gray-700">设为母版</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">取消</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? '创建中...' : '创建模版'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('');
  const [keyword, setKeyword] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { fetchList(); }, [category]);

  async function fetchList() {
    setLoading(true);
    try {
      const params: any = { page: 1, pageSize: 200 };
      if (category) params.category = category;
      const res = await projectTemplatesAPI.list(params);
      setList((res as any).list || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await projectTemplatesAPI.copy(id);
      fetchList();
    } catch {
      alert('复制失败');
    }
  }

  async function handleToggleStatus(tpl: any, e: React.MouseEvent) {
    e.stopPropagation();
    const newStatus = tpl.status === 'active' ? 'archived' : 'active';
    try {
      await projectTemplatesAPI.patch(tpl.id, { status: newStatus });
      fetchList();
    } catch {
      alert('操作失败');
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('确定删除此模版？')) return;
    try {
      await projectTemplatesAPI.delete(id);
      fetchList();
    } catch {
      alert('删除失败');
    }
  }

  const filtered = keyword
    ? list.filter(t => t.name.includes(keyword) || t.code.includes(keyword) || t.description?.includes(keyword))
    : list;

  const isAdmin = user?.role === 'admin';

  return (
    <div className="flex h-full gap-0">
      {/* 左侧分类筛选 */}
      <div className="w-48 shrink-0 border-r border-gray-100 pr-4 pt-1">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">按类别筛选</p>
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
              category === cat.value
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 右侧主内容 */}
      <div className="flex-1 pl-6 min-w-0">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-display font-bold text-gray-900">项目模版库</h1>
          <div className="flex items-center gap-3">
            <input
              type="text"
              className="input w-56"
              placeholder="搜索模版名称..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                + 新建模版
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div className="h-3 bg-gray-100 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>暂无模版{keyword ? `（关键词：${keyword}）` : ''}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filtered.map(tpl => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                isAdmin={isAdmin}
                onEdit={() => navigate(`/project-templates/${tpl.id}/edit`)}
                onCopy={e => handleCopy(tpl.id, e)}
                onToggleStatus={e => handleToggleStatus(tpl, e)}
                onDelete={e => handleDelete(tpl.id, e)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTemplateModal onClose={() => setShowCreate(false)} onCreated={fetchList} />
      )}
    </div>
  );
}

function TemplateCard({ tpl, isAdmin, onEdit, onCopy, onToggleStatus, onDelete }: {
  tpl: any;
  isAdmin: boolean;
  onEdit: () => void;
  onCopy: (e: React.MouseEvent) => void;
  onToggleStatus: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const catLabel = CATEGORY_LABELS[tpl.category] || tpl.category || '未分类';
  const catColor = CATEGORY_COLORS[tpl.category] || 'bg-gray-100 text-gray-600';
  const isArchived = tpl.status === 'archived';

  return (
    <div
      className={`card card-hover p-5 cursor-pointer flex flex-col gap-3 ${isArchived ? 'opacity-60' : ''}`}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900 truncate">{tpl.name}</span>
            {tpl.isMaster && (
              <span className="shrink-0 px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-700 font-medium">母版</span>
            )}
          </div>
          <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${catColor}`}>
            {catLabel}
          </span>
        </div>
        {isArchived && (
          <span className="shrink-0 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">已停用</span>
        )}
      </div>

      {tpl.parent && (
        <p className="text-xs text-gray-400">继承自 {tpl.parent.name}</p>
      )}

      {tpl.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{tpl.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>{tpl.phaseCount ?? 0} 个阶段</span>
        <span>{tpl.taskCount ?? 0} 个任务</span>
        {tpl._count?.children > 0 && <span>{tpl._count.children} 个子模版</span>}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">{tpl.creator?.name} · {new Date(tpl.createdAt).toLocaleDateString('zh-CN')}</span>
        {isAdmin && (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button
              className="px-2 py-1 text-xs text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
              onClick={onEdit}
            >
              编辑
            </button>
            <button
              className="px-2 py-1 text-xs text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
              onClick={onCopy}
            >
              复制
            </button>
            <button
              className="px-2 py-1 text-xs text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded"
              onClick={onToggleStatus}
            >
              {isArchived ? '启用' : '停用'}
            </button>
            <button
              className="px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
              onClick={onDelete}
            >
              删除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
