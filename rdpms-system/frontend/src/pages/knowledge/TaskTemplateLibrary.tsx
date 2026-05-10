import { useEffect, useState, useMemo } from 'react';
import { taskTemplatesAPI } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { hasPerm, PERMS } from '../../utils/permissions';

// ────────────────────────────────────────────────────────────────
// 5 大阶段（统计卡片用）
// ────────────────────────────────────────────────────────────────
const PHASES = [
  {
    value: '', label: '全部模板', cats: [] as string[],
    barColor: '#9ca3af', textColor: '#6b7280', dotColor: '#9ca3af',
  },
  {
    value: 'plan', label: '立项规划',
    cats: ['立项需求类', '产品定义类', '项目管理类'],
    barColor: '#8b5cf6', textColor: '#7c3aed', dotColor: '#8b5cf6',
  },
  {
    value: 'rd', label: '实验研发',
    cats: ['生信设计类', '样本前处理类', '核酸提取类', '片外体系类'],
    barColor: '#3b82f6', textColor: '#2563eb', dotColor: '#3b82f6',
  },
  {
    value: 'integration', label: '集成验证',
    cats: ['芯片集成类', '桥接验证类', '性能验证类', '质控判读类', '稳定性验证类'],
    barColor: '#10b981', textColor: '#059669', dotColor: '#10b981',
  },
  {
    value: 'production', label: '量产交付',
    cats: ['生产QC类', '应用验证类', '文档交付类', '风险问题类', '发布迭代类'],
    barColor: '#f59e0b', textColor: '#d97706', dotColor: '#f59e0b',
  },
];

// ────────────────────────────────────────────────────────────────
// 17 详细分类（过滤栏 & 新建表单用）
// ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: '立项需求类',   label: '立项需求',   phase: 'plan' },
  { value: '产品定义类',   label: '产品定义',   phase: 'plan' },
  { value: '项目管理类',   label: '项目管理',   phase: 'plan' },
  { value: '生信设计类',   label: '生信设计',   phase: 'rd' },
  { value: '样本前处理类', label: '样本前处理', phase: 'rd' },
  { value: '核酸提取类',   label: '核酸提取',   phase: 'rd' },
  { value: '片外体系类',   label: '片外体系',   phase: 'rd' },
  { value: '芯片集成类',   label: '芯片集成',   phase: 'integration' },
  { value: '桥接验证类',   label: '桥接验证',   phase: 'integration' },
  { value: '性能验证类',   label: '性能验证',   phase: 'integration' },
  { value: '质控判读类',   label: '质控判读',   phase: 'integration' },
  { value: '稳定性验证类', label: '稳定性验证', phase: 'integration' },
  { value: '生产QC类',    label: '生产QC',    phase: 'production' },
  { value: '应用验证类',   label: '应用验证',   phase: 'production' },
  { value: '文档交付类',   label: '文档交付',   phase: 'production' },
  { value: '风险问题类',   label: '风险问题',   phase: 'production' },
  { value: '发布迭代类',   label: '发布迭代',   phase: 'production' },
];

// 分类 → 颜色
const CAT_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  '立项需求类':   { bg: '#f5f3ff', text: '#6d28d9', bar: '#7c3aed' },
  '产品定义类':   { bg: '#ede9fe', text: '#7c3aed', bar: '#8b5cf6' },
  '项目管理类':   { bg: '#e0e7ff', text: '#4338ca', bar: '#6366f1' },
  '生信设计类':   { bg: '#dbeafe', text: '#1d4ed8', bar: '#2563eb' },
  '样本前处理类': { bg: '#e0f2fe', text: '#0369a1', bar: '#0ea5e9' },
  '核酸提取类':   { bg: '#cffafe', text: '#0e7490', bar: '#06b6d4' },
  '片外体系类':   { bg: '#d1fae5', text: '#065f46', bar: '#10b981' },
  '芯片集成类':   { bg: '#dcfce7', text: '#15803d', bar: '#22c55e' },
  '桥接验证类':   { bg: '#ecfdf5', text: '#059669', bar: '#34d399' },
  '性能验证类':   { bg: '#fef9c3', text: '#854d0e', bar: '#eab308' },
  '质控判读类':   { bg: '#fef3c7', text: '#92400e', bar: '#f59e0b' },
  '稳定性验证类': { bg: '#ffedd5', text: '#9a3412', bar: '#f97316' },
  '生产QC类':    { bg: '#fee2e2', text: '#991b1b', bar: '#ef4444' },
  '应用验证类':   { bg: '#fce7f3', text: '#9d174d', bar: '#ec4899' },
  '文档交付类':   { bg: '#f3e8ff', text: '#6b21a8', bar: '#a855f7' },
  '风险问题类':   { bg: '#fdf4ff', text: '#86198f', bar: '#d946ef' },
  '发布迭代类':   { bg: '#f0f9ff', text: '#075985', bar: '#0284c7' },
};

function getCatStyle(cat: string) {
  return CAT_COLORS[cat] || { bg: '#f1f5f9', text: '#475569', bar: '#64748b' };
}

// ────────────────────────────────────────────────────────────────
// 步骤编辑器组件
// ────────────────────────────────────────────────────────────────
interface StepItem {
  id: string;
  order: number;
  title: string;
  description?: string;
  estimatedHours?: number | string;
  assigneeRole?: string;
}

function StepEditor({ steps, onChange }: { steps: StepItem[]; onChange: (s: StepItem[]) => void }) {
  const addStep = () => {
    const next: StepItem = {
      id: Date.now().toString(),
      order: steps.length + 1,
      title: '',
      estimatedHours: '',
      assigneeRole: '',
      description: '',
    };
    onChange([...steps, next]);
  };

  const remove = (idx: number) => onChange(steps.filter((_, i) => i !== idx));

  const update = (idx: number, field: keyof StepItem, val: string | number) => {
    const updated = steps.map((s, i) => i === idx ? { ...s, [field]: val } : s);
    onChange(updated);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label className="text-sm font-medium text-gray-700">任务步骤 ({steps.length})</label>
        <button type="button" onClick={addStep}
          style={{ fontSize: '12px', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '5px', padding: '3px 10px', background: '#eff6ff', cursor: 'pointer', fontWeight: 500 }}>
          + 添加步骤
        </button>
      </div>
      {steps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', border: '1.5px dashed #e5e7eb', borderRadius: '8px', fontSize: '13px' }}>
          暂无步骤，点击"添加步骤"开始构建任务流程
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
          {steps.map((step, idx) => (
            <div key={step.id} style={{ border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', background: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#3b82f6', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {idx + 1}
                </span>
                <input
                  type="text"
                  placeholder="步骤名称（必填）"
                  value={step.title}
                  onChange={e => update(idx, 'title', e.target.value)}
                  required={idx === 0}
                  style={{ flex: 1, padding: '4px 8px', border: '1.5px solid #e5e7eb', borderRadius: '5px', fontSize: '13px', background: '#fff' }}
                />
                <button type="button" onClick={() => remove(idx)}
                  style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px' }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: '6px', paddingLeft: '28px' }}>
                <input
                  type="number"
                  placeholder="预计工时(h)"
                  value={step.estimatedHours ?? ''}
                  onChange={e => update(idx, 'estimatedHours', e.target.value)}
                  min={0}
                  style={{ width: '120px', padding: '3px 7px', border: '1.5px solid #e5e7eb', borderRadius: '5px', fontSize: '12px', background: '#fff' }}
                />
                <input
                  type="text"
                  placeholder="负责角色"
                  value={step.assigneeRole ?? ''}
                  onChange={e => update(idx, 'assigneeRole', e.target.value)}
                  style={{ flex: 1, padding: '3px 7px', border: '1.5px solid #e5e7eb', borderRadius: '5px', fontSize: '12px', background: '#fff' }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 新建/编辑弹窗
// ────────────────────────────────────────────────────────────────
function TemplateFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [steps, setSteps] = useState<StepItem[]>(() => {
    if (!editing?.steps) return [];
    return editing.steps.map((s: any) => ({ ...s, id: s.id || Date.now().toString() }));
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(form as any);
    data.tags = data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
    data.estimatedDays = parseInt(data.estimatedDays) || 0;
    data.steps = steps.map((s, idx) => ({
      order: idx + 1,
      title: s.title,
      description: s.description || null,
      estimatedHours: s.estimatedHours !== '' && s.estimatedHours !== undefined ? parseFloat(String(s.estimatedHours)) : null,
      assigneeRole: s.assigneeRole || null,
      checklist: [],
    }));

    setSubmitting(true);
    try {
      if (editing) await taskTemplatesAPI.update(editing.id, data);
      else         await taskTemplatesAPI.create(data);
      onSaved();
    } catch (err: any) {
      alert(err?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5">
      <div style={{ width: 'min(96vw, 700px)', maxHeight: '92vh', background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
            {editing ? '编辑模板' : '新建任务模板'}
          </h3>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 24, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            {/* 名称 */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">模板名称 *</label>
              <input name="name" defaultValue={editing?.name || ''} className="w-full input" placeholder="输入模板名称" required />
            </div>
            {/* 分类 + 优先级 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">任务分类 *</label>
                <select name="category" defaultValue={editing?.category || ''} className="w-full input bg-white" required>
                  <option value="" disabled>请选择分类</option>
                  {['立项规划阶段', '实验研发阶段', '集成验证阶段', '量产交付阶段'].map((phase, pi) => {
                    const phaseCats = [
                      ['立项需求类', '产品定义类', '项目管理类'],
                      ['生信设计类', '样本前处理类', '核酸提取类', '片外体系类'],
                      ['芯片集成类', '桥接验证类', '性能验证类', '质控判读类', '稳定性验证类'],
                      ['生产QC类', '应用验证类', '文档交付类', '风险问题类', '发布迭代类'],
                    ][pi];
                    return (
                      <optgroup key={phase} label={phase}>
                        {phaseCats.map(c => (
                          <option key={c} value={c}>{CATEGORIES.find(x => x.value === c)?.label || c}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">默认优先级</label>
                <select name="priority" defaultValue={editing?.priority || 'medium'} className="w-full input bg-white">
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="urgent">紧急</option>
                </select>
              </div>
            </div>
            {/* 描述 */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">模板描述</label>
              <textarea name="description" defaultValue={editing?.description || ''} className="w-full input resize-none" rows={2} placeholder="简要描述此模板的用途和适用场景" />
            </div>
            {/* 预计天数 + 标签 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">预计完成天数</label>
                <input type="number" name="estimatedDays" defaultValue={editing?.estimatedDays ?? 3} className="w-full input" min={0} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">标签（逗号分隔）</label>
                <input name="tags" defaultValue={(editing?.tags || '').toString()} className="w-full input" placeholder="如：PCR, 核酸, 芯片" />
              </div>
            </div>
            {/* 步骤编辑器 */}
            <StepEditor steps={steps} onChange={setSteps} />
          </div>
          <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, background: '#fafafa', borderRadius: '0 0 14px 14px' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 22px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 }}>取消</button>
            <button type="submit" disabled={submitting} style={{ padding: '8px 28px', borderRadius: 8, background: submitting ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
              {submitting ? '保存中…' : '保存模板'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 主页面
// ────────────────────────────────────────────────────────────────
export default function TaskTemplateLibrary() {
  const { user } = useAppStore();
  const canSeedTemplates = hasPerm(user, PERMS.USERS_MANAGE);
  const [list, setList]                         = useState<any[]>([]);
  const [loading, setLoading]                   = useState(false);
  const [seeding, setSeeding]                   = useState(false);
  const [keyword, setKeyword]                   = useState('');
  const [phaseFilter, setPhaseFilter]           = useState('');
  const [catFilter, setCatFilter]               = useState('');
  const [showDrawer, setShowDrawer]             = useState(false);
  const [editing, setEditing]                   = useState<any | null>(null);
  const [selectedIds, setSelectedIds]           = useState<string[]>([]);
  const [showConfirm, setShowConfirm]           = useState(false);
  const [confirmTargets, setConfirmTargets]     = useState<any[]>([]);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [forceDetails, setForceDetails]         = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await taskTemplatesAPI.list({});
      setList(res.list || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // 统计卡片：5 大阶段
  const statCards = useMemo(() => {
    const total = list.length;
    const pct = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;
    return PHASES.map(ph => {
      const count = ph.cats.length === 0 ? total : list.filter(t => ph.cats.includes(t.category)).length;
      return {
        ...ph,
        count,
        percent: ph.value === '' ? 100 : pct(count),
        action: () => { setPhaseFilter(ph.value); setCatFilter(''); },
      };
    });
  }, [list]);

  // 过滤逻辑
  const filtered = useMemo(() => {
    return list.filter(t => {
      let matchCat = true;
      if (catFilter) {
        matchCat = t.category === catFilter;
      } else if (phaseFilter) {
        const ph = PHASES.find(p => p.value === phaseFilter);
        matchCat = ph ? ph.cats.includes(t.category) : true;
      }
      const kw = keyword.trim().toLowerCase();
      const matchKw = !kw
        || t.name?.toLowerCase().includes(kw)
        || t.description?.toLowerCase().includes(kw)
        || (t.tags || '').toString().toLowerCase().includes(kw);
      return matchCat && matchKw;
    });
  }, [list, catFilter, phaseFilter, keyword]);

  const toggleSelect    = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(t => t.id));

  const initiateDelete = () => {
    if (!selectedIds.length) return;
    const targets = list.filter(t => selectedIds.includes(t.id)).map(t => ({ id: t.id, name: t.name }));
    setConfirmTargets(targets);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    setShowConfirm(false);
    try {
      await taskTemplatesAPI.bulkDelete(selectedIds);
      setSelectedIds([]); load();
    } catch (err: any) {
      if (err?.error === 'has_references' && err.details) {
        setForceDetails(err.details); setShowForceConfirm(true);
      } else alert(err?.message || '删除失败');
    }
  };

  const forceDelete = async () => {
    try {
      await taskTemplatesAPI.bulkDelete(selectedIds, true);
      setShowForceConfirm(false); setSelectedIds([]); load();
    } catch (e: any) { alert(e?.message || '强制删除失败'); }
  };

  const handleSeed = async () => {
    if (!canSeedTemplates) {
      alert('仅管理员可执行模板初始化');
      return;
    }
    if (!window.confirm('将预置芯片检测试剂盒项目标准任务模板（共 17 大类约 79 个模板），已存在的同名模板将跳过。是否继续？')) return;
    setSeeding(true);
    try {
      const res = await (taskTemplatesAPI as any).seed();
      alert(`初始化完成：新增 ${res.created} 个模板，跳过 ${res.skipped} 个已存在模板`);
      load();
    } catch (e: any) { alert(e?.message || '初始化失败'); }
    finally { setSeeding(false); }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── 固定顶部 ── */}
      <div style={{ flexShrink: 0 }}>

        {/* 标题行 */}
        <div className="flex items-center justify-between mb-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="text-2xl font-display font-bold text-gray-900">任务模板</h1>
            <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 10px', borderRadius: '20px', fontWeight: 500 }}>
              {list.length} 个模板
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {selectedIds.length > 0 && (
              <button onClick={initiateDelete} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                删除所选 ({selectedIds.length})
              </button>
            )}
            <button onClick={load} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              刷新
            </button>
            {canSeedTemplates && (
              <button onClick={handleSeed} disabled={seeding} title="一键导入标准任务模板（管理员）" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid #a7f3d0', background: seeding ? '#f0fdf4' : '#ecfdf5', color: '#059669', cursor: seeding ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                {seeding ? '导入中…' : '一键初始化'}
              </button>
            )}
            <button onClick={() => { setEditing(null); setShowDrawer(true); }} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
              新建模板
            </button>
          </div>
        </div>

        {/* 统计卡片（5 大阶段） */}
        <div className="card p-4 mb-6">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
            {statCards.map(stat => {
              const isActive = phaseFilter === stat.value && !catFilter;
              return (
                <div key={stat.value}
                  style={{ borderRadius: '10px', padding: '14px 16px', border: `1px solid ${isActive ? stat.barColor : '#e5e7eb'}`, borderLeft: `4px solid ${stat.barColor}`, cursor: 'pointer', transition: 'all .2s', background: isActive ? '#f8fafc' : '#fff', boxShadow: isActive ? `0 4px 16px rgba(0,0,0,.06)` : undefined }}
                  onClick={stat.action}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'); }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget.style.boxShadow = 'none'); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: stat.textColor, fontWeight: 600 }}>{stat.label}</span>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: stat.dotColor, display: 'block' }} />
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: stat.textColor, lineHeight: 1 }}>{stat.count}</div>
                  <div style={{ height: '4px', borderRadius: '3px', background: '#f3f4f6', overflow: 'hidden', marginTop: '8px' }}>
                    <div style={{ height: '100%', borderRadius: '3px', background: stat.barColor, width: stat.percent + '%', transition: 'width .3s' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#d1d5db', marginTop: '4px' }}>占比 {stat.percent}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 筛选区 */}
        <div className="card p-3 mb-6">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* 搜索框 */}
            <div style={{ position: 'relative', flex: '0 0 220px' }}>
              <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
              </svg>
              <input
                style={{ width: '100%', padding: '6px 10px 6px 30px', border: '1.5px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', color: '#374151', outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }}
                placeholder="搜索模板名称/标签…"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
              />
            </div>
            <div style={{ width: '1px', height: '22px', background: '#e5e7eb', flexShrink: 0 }} />
            {/* 全部按钮 */}
            <button onClick={() => { setCatFilter(''); setPhaseFilter(''); }}
              style={{ padding: '4px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: 'none', transition: 'all .15s', background: (!catFilter && !phaseFilter) ? '#eff6ff' : '#f3f4f6', color: (!catFilter && !phaseFilter) ? '#2563eb' : '#6b7280', outline: (!catFilter && !phaseFilter) ? '1.5px solid #bfdbfe' : 'none' }}>全部</button>
            {/* 分类按钮（按阶段分组显示） */}
            {[
              { phase: 'plan',        label: '立项规划', color: '#8b5cf6' },
              { phase: 'rd',          label: '研发',     color: '#3b82f6' },
              { phase: 'integration', label: '集成验证', color: '#10b981' },
              { phase: 'production',  label: '量产交付', color: '#f59e0b' },
            ].map(({ phase, color }) => (
              CATEGORIES.filter(c => c.phase === phase).map(cat => {
                const isActive = catFilter === cat.value;
                const cs = getCatStyle(cat.value);
                return (
                  <button key={cat.value} onClick={() => { setCatFilter(cat.value); setPhaseFilter(''); }}
                    style={{ padding: '4px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: 'none', transition: 'all .15s', background: isActive ? cs.bg : '#f3f4f6', color: isActive ? cs.text : '#6b7280', outline: isActive ? `1.5px solid ${cs.bar}40` : 'none' }}
                  >{cat.label}</button>
                );
              })
            ))}
          </div>
        </div>
      </div>

      {/* ── 可滚动卡片区 ── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 24 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[1,2,3,4,5,6].map(i => (
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
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
              暂无模板{keyword ? `（关键词：${keyword}）` : ''}
            </div>
            <div style={{ fontSize: '14px', marginBottom: '20px' }}>
              点击右上角"一键初始化"可快速导入芯片检测试剂盒标准任务模板
            </div>
            <button onClick={() => { setEditing(null); setShowDrawer(true); }} className="btn btn-primary">
              + 新建模板
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{ width: '14px', height: '14px', cursor: 'pointer' }} />
              <span style={{ fontSize: '13px', color: '#9ca3af' }}>
                {selectedIds.length > 0 ? `已选 ${selectedIds.length} / ${filtered.length} 条` : `共 ${filtered.length} 个模板`}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {filtered.map(t => {
                const cs         = getCatStyle(t.category);
                const stepCount  = t.steps?.length || 0;
                const tags: string[] = (t.tags || '').toString().split(',').map((s: string) => s.trim()).filter(Boolean);
                const isSelected = selectedIds.includes(t.id);
                return (
                  <div key={t.id}
                    style={{ background: '#fff', borderRadius: '14px', border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'box-shadow .2s, transform .15s', boxShadow: isSelected ? '0 0 0 4px rgba(59,130,246,0.12)' : undefined }}
                    onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,.10)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; } }}
                    onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.transform = ''; } }}
                  >
                    <div style={{ height: '4px', background: cs.bar, flexShrink: 0 }} />
                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(t.id)} onClick={e => e.stopPropagation()} style={{ marginTop: '3px', flexShrink: 0, width: '13px', height: '13px', cursor: 'pointer' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{t.name}</span>
                          </div>
                          {t.category && (
                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: cs.bg, color: cs.text }}>{t.category}</span>
                          )}
                          {t.description && (
                            <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{t.description}</p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: '#64748b' }}>
                        <span>📋 {stepCount} 个步骤</span>
                        <span>⏱ 预计 {t.estimatedDays || 0} 天</span>
                      </div>
                      {tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {tags.slice(0, 4).map((tag: string, i: number) => (
                            <span key={i} style={{ padding: '2px 7px', background: '#f1f5f9', color: '#64748b', borderRadius: '5px', fontSize: '11px', fontWeight: 500 }}>{tag}</span>
                          ))}
                          {tags.length > 4 && <span style={{ fontSize: '11px', color: '#9ca3af', alignSelf: 'center' }}>+{tags.length - 4}</span>}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #f1f5f9', marginTop: 'auto' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>引用 {t.usageCount || 0} 次</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={e => { e.stopPropagation(); setEditing(t); setShowDrawer(true); }}
                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget.style.borderColor = '#bfdbfe'); (e.currentTarget.style.color = '#2563eb'); }}
                            onMouseLeave={e => { (e.currentTarget.style.borderColor = '#e2e8f0'); (e.currentTarget.style.color = '#374151'); }}>编辑</button>
                          <button onClick={e => { e.stopPropagation(); alert('使用模板功能即将上线'); }}
                            style={{ padding: '4px 12px', borderRadius: '6px', background: '#2563eb', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>使用</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── 新建/编辑弹窗 ── */}
      {showDrawer && (
        <TemplateFormModal
          editing={editing}
          onClose={() => setShowDrawer(false)}
          onSaved={() => { setShowDrawer(false); load(); }}
        />
      )}

      {/* ── 确认删除弹窗 ── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16, color: '#1e293b' }}>确认删除</h3>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: '12px' }}>即将删除以下 {confirmTargets.length} 个模板，此操作不可撤销：</p>
            <ul style={{ listStyle: 'disc', paddingLeft: '20px', fontSize: 13, color: '#374151', marginBottom: '16px' }}>
              {confirmTargets.slice(0, 5).map(t => <li key={t.id}>{t.name}</li>)}
              {confirmTargets.length > 5 && <li style={{ color: '#9ca3af' }}>…等 {confirmTargets.length} 条</li>}
            </ul>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowConfirm(false)} style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>取消</button>
              <button onClick={confirmDelete} style={{ padding: '7px 18px', borderRadius: 8, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 强制删除弹窗 ── */}
      {showForceConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16, color: '#dc2626' }}>检测到被引用</h3>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: '12px' }}>以下模板正在被项目使用，强制删除后将影响已引用的项目：</p>
            <ul style={{ listStyle: 'disc', paddingLeft: '20px', fontSize: 13, color: '#374151', marginBottom: '16px' }}>
              {forceDetails.map(d => <li key={d.id}>模板 {d.id} 被 {d.count} 个项目引用</li>)}
            </ul>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowForceConfirm(false)} style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>取消</button>
              <button onClick={forceDelete} style={{ padding: '7px 18px', borderRadius: 8, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>强制删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}