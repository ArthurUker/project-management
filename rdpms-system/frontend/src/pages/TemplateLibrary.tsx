import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectTemplatesAPI } from '../api/client';
import { useAppStore } from '../store/appStore';
import { hasPerm, PERMS } from '../utils/permissions';

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

  if (!hasPerm(user, PERMS.TEMPLATES_CREATE)) {
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
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { fetchList(); }, []);

  async function fetchList() {
    setLoading(true);
    try {
      const res = await projectTemplatesAPI.list({ page: 1, pageSize: 200 });
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

  const statCards = useMemo(() => {
    const total = list.length;
    const reagent = list.filter(t => t.category === 'reagent_chip').length;
    const device = list.filter(t => t.category === 'device').length;
    const active = list.filter(t => t.status !== 'archived').length;
    const archived = list.filter(t => t.status === 'archived').length;
    return [
      { label: '全部模版', count: total, percent: 100, barColor: '#9ca3af', textColor: '#6b7280', dotColor: '#9ca3af', action: () => { setCategory(''); setStatusFilter(''); } },
      { label: '试剂/芯片', count: reagent, percent: total > 0 ? Math.round(reagent / total * 100) : 0, barColor: '#3b82f6', textColor: '#2563eb', dotColor: '#3b82f6', action: () => { setCategory('reagent_chip'); setStatusFilter(''); } },
      { label: '设备开发', count: device, percent: total > 0 ? Math.round(device / total * 100) : 0, barColor: '#8b5cf6', textColor: '#7c3aed', dotColor: '#8b5cf6', action: () => { setCategory('device'); setStatusFilter(''); } },
      { label: '启用中', count: active, percent: total > 0 ? Math.round(active / total * 100) : 0, barColor: '#10b981', textColor: '#059669', dotColor: '#10b981', action: () => { setCategory(''); setStatusFilter('active'); } },
      { label: '已停用', count: archived, percent: total > 0 ? Math.round(archived / total * 100) : 0, barColor: '#f59e0b', textColor: '#d97706', dotColor: '#f59e0b', action: () => { setCategory(''); setStatusFilter('archived'); } },
    ];
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter(t => {
      const matchCat = !category || t.category === category;
      const matchStatus =
        !statusFilter ? true :
        statusFilter === 'archived' ? t.status === 'archived' :
        t.status !== 'archived';
      const matchKw = !keyword || t.name.includes(keyword) || t.description?.includes(keyword);
      return matchCat && matchStatus && matchKw;
    });
  }, [list, category, statusFilter, keyword]);

  const isAdmin = user?.role === 'admin';

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

      {/* ══ 页面标题行 ══ */}
      <div className="flex items-center justify-between mb-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="text-2xl font-display font-bold text-gray-900">项目模版库</h1>
          <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 10px', borderRadius: '20px', fontWeight: 500 }}>
            {list.length} 个模版
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchList}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            刷新
          </button>
          {isAdmin && (
            <button
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setShowCreate(true)}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
              新建模版
            </button>
          )}
        </div>
      </div>

      {/* ══ 统计卡片 ══ */}
      <div className="card p-4 mb-6">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
          {statCards.map(stat => (
            <div
              key={stat.label}
              style={{
                borderRadius: '10px', padding: '14px 16px',
                border: '1px solid #e5e7eb', borderLeft: `4px solid ${stat.barColor}`,
                cursor: 'pointer', transition: 'all .2s', background: 'transparent',
              }}
              onClick={stat.action}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: stat.textColor, fontWeight: 500 }}>{stat.label}</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: stat.dotColor, display: 'block' }} />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: stat.textColor, lineHeight: 1 }}>{stat.count}</div>
              <div style={{ height: '4px', borderRadius: '3px', background: '#f3f4f6', overflow: 'hidden', marginTop: '8px' }}>
                <div style={{ height: '100%', borderRadius: '3px', background: stat.barColor, width: `${stat.percent}%`, transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: '11px', color: '#d1d5db', marginTop: '4px' }}>占比 {stat.percent}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 筛选区 ══ */}
      <div className="card p-3 mb-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* 搜索框 */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '280px' }}>
            <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
            </svg>
            <input
              style={{ width: '100%', padding: '7px 12px 7px 34px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }}
              placeholder="搜索模版名称..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>

          <div style={{ width: '1px', height: '26px', background: '#e5e7eb' }} />

          {/* 大类标签 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 500 }}>大类：</span>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                style={{
                  padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', transition: 'all .15s', border: 'none',
                  background: category === cat.value ? '#eff6ff' : '#f3f4f6',
                  color: category === cat.value ? '#2563eb' : '#6b7280',
                  outline: category === cat.value ? '1.5px solid #bfdbfe' : 'none',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '26px', background: '#e5e7eb' }} />

          {/* 状态下拉 */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '7px 24px 7px 10px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#f9fafb', cursor: 'pointer', outline: 'none', fontWeight: 500 }}
          >
            <option value="">全部状态</option>
            <option value="active">启用中</option>
            <option value="archived">已停用</option>
          </select>
        </div>
      </div>

      {/* ══ 内容区 ══ */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', marginBottom: '14px' }} />
              <div style={{ height: '16px', background: '#f3f4f6', borderRadius: '4px', width: '70%', marginBottom: '8px' }} />
              <div style={{ height: '12px', background: '#f3f4f6', borderRadius: '4px', width: '40%' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '64px 24px', color: '#9ca3af' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>暂无模版{keyword ? `（关键词：${keyword}）` : ''}</div>
          <div style={{ fontSize: '14px' }}>尝试调整筛选条件，或新建一个模版</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
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
  const topColor = tpl.category === 'reagent_chip' ? '#3b82f6' : tpl.category === 'device' ? '#8b5cf6' : '#9ca3af';

  return (
    <div
      style={{
        background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb',
        overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow .2s, transform .15s',
        opacity: isArchived ? 0.65 : 1, display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,.10)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
      onClick={onEdit}
    >
      {/* 顶部色条 */}
      <div style={{ height: '4px', background: topColor, flexShrink: 0 }} />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
        {/* 标题行 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{tpl.name}</span>
              {tpl.isMaster && (
                <span style={{ padding: '2px 7px', fontSize: '11px', borderRadius: '5px', background: '#fef3c7', color: '#d97706', fontWeight: 600 }}>母版</span>
              )}
            </div>
            <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${catColor}`}>{catLabel}</span>
          </div>
          {isArchived && (
            <span style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '5px', background: '#f3f4f6', color: '#9ca3af', fontWeight: 500, flexShrink: 0 }}>已停用</span>
          )}
        </div>

        {/* 继承自 */}
        {tpl.parent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#9ca3af' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
            <span>继承自</span>
            <span style={{ color: topColor, fontWeight: 500 }}>{tpl.parent.name}</span>
          </div>
        )}

        {/* 描述 */}
        {tpl.description && (
          <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{tpl.description}</p>
        )}

        {/* 阶段/任务数 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#9ca3af' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            {tpl.phaseCount ?? 0} 个阶段
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {tpl.taskCount ?? 0} 个任务
          </span>
          {tpl._count?.children > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              {tpl._count.children} 个子模版
            </span>
          )}
        </div>

        {/* 底部：创建人 + 操作 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #f3f4f6', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: topColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 700 }}>
              {(tpl.creator?.name ?? '?').slice(0, 1)}
            </div>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>{tpl.creator?.name} · {new Date(tpl.createdAt).toLocaleDateString('zh-CN')}</span>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} onClick={e => e.stopPropagation()}>
              {([
                { label: '编辑', handler: onEdit, hoverBg: '#eff6ff', hoverColor: '#2563eb' },
                { label: '复制', handler: onCopy, hoverBg: '#f0fdf4', hoverColor: '#16a34a' },
                { label: isArchived ? '启用' : '停用', handler: onToggleStatus, hoverBg: '#fff7ed', hoverColor: '#ea580c' },
                { label: '删除', handler: onDelete, hoverBg: '#fef2f2', hoverColor: '#dc2626' },
              ] as { label: string; handler: (e: React.MouseEvent) => void; hoverBg: string; hoverColor: string }[]).map(btn => (
                <button
                  key={btn.label}
                  style={{ padding: '4px 8px', fontSize: '12px', color: '#6b7280', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = btn.hoverBg; (e.currentTarget as HTMLButtonElement).style.color = btn.hoverColor; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#6b7280'; }}
                  onClick={btn.handler}
                >{btn.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
