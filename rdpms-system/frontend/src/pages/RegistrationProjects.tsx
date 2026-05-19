import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registrationsAPI, taskAPI } from '../api/client';
import { useHasPerm, PERMS } from '../utils/permissions';

interface RegistrationItem {
  id: string;
  code: string;
  name: string;
  subtype?: string;
  status: string;
  manager?: { id: string; name: string; position?: string };
  registrationProfile?: {
    registrationType?: string;
    currentStage?: string;
    riskLevel?: string;
    region?: string;
    authority?: string;
    expectedApprovalDate?: string;
  };
  due?: {
    daysLeft: number | null;
    alertLevel: 'none' | 'normal' | 'warning' | 'critical' | 'overdue';
  };
  _count?: { tasks?: number };
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  projectId: string;
  assignee?: { id: string; name: string };
  dueDate?: string;
  priority?: string;
}

const STAGES = ['资料准备', '送检受理', '技术审评', '行政审批', '取证归档'];

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  '资料准备': { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
  '送检受理': { bg: '#fefce8', border: '#fde047', text: '#854d0e', dot: '#eab308' },
  '技术审评': { bg: '#fdf4ff', border: '#e9d5ff', text: '#7e22ce', dot: '#a855f7' },
  '行政审批': { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', dot: '#f97316' },
  '取证归档': { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', dot: '#22c55e' },
};

const RISK_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  高: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
  中: { bg: '#fffbeb', border: '#fde68a', text: '#d97706' },
  低: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a' },
};

const ALERT_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  overdue:  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  critical: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  warning:  { bg: '#fefce8', text: '#a16207', border: '#fde68a' },
  normal:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  none:     { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
};

function dueLabel(daysLeft: number | null) {
  if (daysLeft == null) return '未设时限';
  if (daysLeft < 0) return `超期 ${Math.abs(daysLeft)} 天`;
  if (daysLeft === 0) return '今日到期';
  return `剩 ${daysLeft} 天`;
}

function stageIndex(stage?: string) {
  const idx = STAGES.indexOf(stage || '');
  return idx === -1 ? 0 : idx;
}

// 头像颜色
const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

type ViewMode = 'pipeline' | 'assignee' | 'list';

export default function RegistrationProjects() {
  const navigate = useNavigate();
  const canEdit = useHasPerm(PERMS.REGISTRATIONS_EDIT);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<RegistrationItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [stats, setStats] = useState<{
    total?: number;
    byStage?: Record<string, number>;
    byRisk?: Record<string, number>;
    overdueCount?: number;
    dueSoonCount?: number;
  }>({});
  const [templates, setTemplates] = useState<any[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [keyword, setKeyword] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    registrationType: 'IVD',
    region: '中国澳门',
    authority: '',
    currentStage: '资料准备',
    riskLevel: '中',
    templateId: '',
    expectedApprovalDate: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, statsRes, templatesRes] = await Promise.all([
        registrationsAPI.list({ keyword, currentStage: stageFilter || undefined, riskLevel: riskFilter || undefined }),
        registrationsAPI.stats(),
        registrationsAPI.templates(),
      ]);

      const list = (listRes as any).list || (listRes as any).data?.list || [];
      const statsData = (statsRes as any).data || statsRes;
      const tplList = (templatesRes as any).list || (templatesRes as any).data?.list || [];

      setItems(Array.isArray(list) ? list : []);
      setStats(statsData || {});
      setTemplates(Array.isArray(tplList) ? tplList : []);

      if (!createForm.templateId && Array.isArray(tplList) && tplList.length > 0) {
        setCreateForm((prev) => ({ ...prev, templateId: tplList[0].id }));
      }

      // 加载所有注册项目的任务（用于人员视图）
      if (Array.isArray(list) && list.length > 0) {
        try {
          const taskRes = await taskAPI.list({ pageSize: 500, status: 'pending,in_progress,todo' });
          const allTasks = (taskRes as any).list || (taskRes as any).data?.list || [];
          setTasks(Array.isArray(allTasks) ? allTasks : []);
        } catch { /* 任务加载失败不影响主流程 */ }
      }
    } catch (e: any) {
      setError(e?.error || e?.message || '加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (keyword && !item.name.toLowerCase().includes(keyword.toLowerCase()) && !item.code.toLowerCase().includes(keyword.toLowerCase())) return false;
      if (stageFilter && item.registrationProfile?.currentStage !== stageFilter) return false;
      if (riskFilter && item.registrationProfile?.riskLevel !== riskFilter) return false;
      return true;
    });
  }, [items, keyword, stageFilter, riskFilter]);

  // 按阶段分组（流水线视图）
  const byStage = useMemo(() => {
    const map: Record<string, RegistrationItem[]> = {};
    STAGES.forEach(s => { map[s] = []; });
    filteredItems.forEach(item => {
      const s = item.registrationProfile?.currentStage || '资料准备';
      if (map[s]) map[s].push(item);
      else map['资料准备'].push(item);
    });
    return map;
  }, [filteredItems]);

  // 按负责人分组（人员视角）
  const byAssignee = useMemo(() => {
    const map: Record<string, { manager: { id: string; name: string }; projects: RegistrationItem[] }> = {};
    filteredItems.forEach(item => {
      const mgr = item.manager;
      const key = mgr?.id || '__unassigned__';
      if (!map[key]) map[key] = { manager: mgr || { id: '__unassigned__', name: '未分配' }, projects: [] };
      map[key].projects.push(item);
    });
    return Object.values(map).sort((a, b) => b.projects.length - a.projects.length);
  }, [filteredItems]);

  // 任务按项目分组
  const tasksByProject = useMemo(() => {
    const map: Record<string, TaskItem[]> = {};
    tasks.forEach(t => {
      if (!map[t.projectId]) map[t.projectId] = [];
      map[t.projectId].push(t);
    });
    return map;
  }, [tasks]);

  const stageCompletion = useMemo(() => {
    const total = stats.total || 0;
    if (total === 0) return 0;
    const done = stats.byStage?.['取证归档'] || 0;
    return Math.round((done / total) * 100);
  }, [stats]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      alert('请输入项目名称');
      return;
    }
    setCreating(true);
    try {
      const created = await registrationsAPI.create({
        ...createForm,
        expectedApprovalDate: createForm.expectedApprovalDate || null,
      });
      const id = (created as any).id || (created as any).data?.id;
      setShowCreate(false);
      setCreateForm((prev) => ({ ...prev, name: '' }));
      await loadData();
      if (id) navigate(`/registrations/${id}`);
    } catch (e: any) {
      alert(e?.error || e?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  // ── 项目卡片（流水线用）──────────────────────────
  function PipelineCard({ item }: { item: RegistrationItem }) {
    const risk = item.registrationProfile?.riskLevel || '中';
    const alertLevel = item.due?.alertLevel || 'none';
    const riskStyle = RISK_COLORS[risk] || RISK_COLORS['中'];
    const alertStyle = ALERT_BADGE[alertLevel] || ALERT_BADGE.none;
    const projTasks = tasksByProject[item.id] || [];
    const pendingTasks = projTasks.filter(t => t.status !== 'done' && t.status !== 'completed');

    return (
      <div
        onClick={() => navigate(`/registrations/${item.id}`)}
        style={{
          background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb',
          padding: '12px', cursor: 'pointer', transition: 'all .15s',
          marginBottom: '8px',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.1)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#93c5fd'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb'; }}
      >
        <div style={{ fontWeight: 600, fontSize: '13px', color: '#111827', marginBottom: '4px', lineHeight: 1.3 }}>{item.name}</div>
        <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace', marginBottom: '8px' }}>{item.code}</div>

        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', border: `1px solid ${riskStyle.border}`, background: riskStyle.bg, color: riskStyle.text, fontWeight: 600 }}>
            风险{risk}
          </span>
          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', border: `1px solid ${alertStyle.border}`, background: alertStyle.bg, color: alertStyle.text }}>
            {dueLabel(item.due?.daysLeft ?? null)}
          </span>
        </div>

        {/* 负责人 */}
        {item.manager && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: pendingTasks.length > 0 ? '6px' : 0 }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: avatarColor(item.manager.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '9px', fontWeight: 700, flexShrink: 0 }}>
              {item.manager.name.slice(0, 1)}
            </div>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>{item.manager.name}</span>
          </div>
        )}

        {/* 进行中任务（最多2条）*/}
        {pendingTasks.slice(0, 2).map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
            {t.assignee && (
              <span style={{ fontSize: '9px', color: '#9ca3af', flexShrink: 0 }}>@{t.assignee.name}</span>
            )}
          </div>
        ))}
        {pendingTasks.length > 2 && (
          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>+{pendingTasks.length - 2} 项任务</div>
        )}
        {pendingTasks.length === 0 && (item._count?.tasks || 0) > 0 && (
          <div style={{ fontSize: '10px', color: '#d1d5db', marginTop: '2px' }}>共 {item._count?.tasks} 项任务</div>
        )}
      </div>
    );
  }

  // ── 列表行 ────────────────────────────────────────
  function ListRow({ item }: { item: RegistrationItem }) {
    const risk = item.registrationProfile?.riskLevel || '中';
    const alertLevel = item.due?.alertLevel || 'none';
    const stage = item.registrationProfile?.currentStage || '资料准备';
    const stageIdx = stageIndex(stage);
    const riskStyle = RISK_COLORS[risk] || RISK_COLORS['中'];
    const alertStyle = ALERT_BADGE[alertLevel] || ALERT_BADGE.none;
    const stageColor = STAGE_COLORS[stage] || STAGE_COLORS['资料准备'];

    return (
      <div
        onClick={() => navigate(`/registrations/${item.id}`)}
        style={{
          display: 'grid', gridTemplateColumns: '2fr 140px 100px 130px 110px 90px',
          alignItems: 'center', gap: '12px', padding: '12px 16px',
          borderBottom: '1px solid #f3f4f6', cursor: 'pointer', transition: 'background .1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* 项目名 */}
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{item.name}</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{item.code}</div>
        </div>
        {/* 阶段进度条 */}
        <div>
          <div style={{ fontSize: '11px', color: stageColor.text, fontWeight: 600, marginBottom: '4px' }}>{stage}</div>
          <div style={{ display: 'flex', gap: '2px' }}>
            {STAGES.map((_, i) => (
              <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i <= stageIdx ? stageColor.dot : '#e5e7eb', transition: 'background .2s' }} />
            ))}
          </div>
        </div>
        {/* 风险 */}
        <span style={{ display: 'inline-block', fontSize: '12px', padding: '3px 9px', borderRadius: '20px', border: `1px solid ${riskStyle.border}`, background: riskStyle.bg, color: riskStyle.text, fontWeight: 600, textAlign: 'center' }}>
          风险{risk}
        </span>
        {/* 负责人 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {item.manager ? (
            <>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: avatarColor(item.manager.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                {item.manager.name.slice(0, 1)}
              </div>
              <span style={{ fontSize: '12px', color: '#374151' }}>{item.manager.name}</span>
            </>
          ) : (
            <span style={{ fontSize: '12px', color: '#d1d5db' }}>未分配</span>
          )}
        </div>
        {/* 时限 */}
        <span style={{ display: 'inline-block', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', border: `1px solid ${alertStyle.border}`, background: alertStyle.bg, color: alertStyle.text, textAlign: 'center' }}>
          {dueLabel(item.due?.daysLeft ?? null)}
        </span>
        {/* 任务数 */}
        <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'right' }}>
          {item._count?.tasks || 0} 项任务
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

      {/* ══ 页面头部 ══ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#111827', margin: 0 }}>项目注册管理</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>阶段流水线 · 人员工作负载 · 风险预警</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 视图切换 */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '10px', padding: '3px', gap: '2px' }}>
            {([
              { key: 'pipeline', label: '流水线', icon: '⇒' },
              { key: 'assignee', label: '人员视角', icon: '👤' },
              { key: 'list',     label: '列表',   icon: '≡' },
            ] as const).map(v => (
              <button key={v.key} onClick={() => setViewMode(v.key)} style={{
                padding: '6px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', border: 'none', transition: 'all .15s',
                background: viewMode === v.key ? '#fff' : 'transparent',
                color: viewMode === v.key ? '#2563eb' : '#6b7280',
                boxShadow: viewMode === v.key ? '0 1px 4px rgba(37,99,235,.15)' : 'none',
              }}>
                {v.label}
              </button>
            ))}
          </div>
          <button style={{ padding: '7px 16px', border: '1.5px solid #e5e7eb', borderRadius: '9px', fontSize: '14px', color: '#374151', background: '#fff', cursor: 'pointer' }} onClick={loadData}>刷新</button>
          {canEdit && (
            <button style={{ padding: '7px 16px', borderRadius: '9px', fontSize: '14px', fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }} onClick={() => setShowCreate(true)}>
              + 新建注册项目
            </button>
          )}
        </div>
      </div>

      {/* ══ 统计卡片 ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: '总项目数', value: stats.total || 0, color: '#2563eb' },
          { label: '高风险', value: stats.byRisk?.['高'] || 0, color: '#dc2626' },
          { label: '30天到期', value: stats.dueSoonCount || 0, color: '#d97706' },
          { label: '超期', value: stats.overdueCount || 0, color: '#b91c1c' },
          { label: '归档完成率', value: `${stageCompletion}%`, color: '#059669' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: s.color, marginTop: '6px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ══ 搜索 + 筛选 ══ */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="搜索项目名/编码..."
          style={{ padding: '7px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#fff', outline: 'none', minWidth: '200px' }}
        />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ padding: '7px 24px 7px 10px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#fff', cursor: 'pointer' }}>
          <option value="">全部阶段</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} style={{ padding: '7px 24px 7px 10px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#fff', cursor: 'pointer' }}>
          <option value="">全部风险</option>
          <option value="高">高风险</option>
          <option value="中">中风险</option>
          <option value="低">低风险</option>
        </select>
        {(keyword || stageFilter || riskFilter) && (
          <button onClick={() => { setKeyword(''); setStageFilter(''); setRiskFilter(''); }} style={{ padding: '7px 12px', border: '1.5px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#dc2626', background: '#fff', cursor: 'pointer' }}>
            清除筛选
          </button>
        )}
        <span style={{ fontSize: '13px', color: '#9ca3af', marginLeft: 'auto' }}>共 {filteredItems.length} 个项目</span>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', color: '#dc2626', fontSize: '13px' }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>加载中...</div>
      ) : (
        <>
          {/* ══ 流水线视图 ══ */}
          {viewMode === 'pipeline' && (
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '16px', alignItems: 'flex-start' }}>
              {STAGES.map(stage => {
                const stageColor = STAGE_COLORS[stage];
                const stageItems = byStage[stage] || [];
                return (
                  <div key={stage} style={{ flex: '0 0 240px', minWidth: '240px' }}>
                    {/* 阶段列头 */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: '8px 8px 0 0', marginBottom: '8px',
                      background: stageColor.bg, border: `1px solid ${stageColor.border}`, borderBottom: 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stageColor.dot }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: stageColor.text }}>{stage}</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: stageColor.text, background: '#fff', borderRadius: '20px', padding: '1px 8px', border: `1px solid ${stageColor.border}` }}>{stageItems.length}</span>
                    </div>
                    {/* 卡片列 */}
                    <div style={{ background: '#f9fafb', border: `1px solid ${stageColor.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '8px', minHeight: '100px' }}>
                      {stageItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#d1d5db', fontSize: '13px' }}>暂无项目</div>
                      ) : stageItems.map(item => <PipelineCard key={item.id} item={item} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ 人员视角 ══ */}
          {viewMode === 'assignee' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {byAssignee.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af', fontSize: '14px' }}>暂无项目</div>
              )}
              {byAssignee.map(({ manager, projects: mgrProjects }) => (
                <div key={manager.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
                  {/* 负责人头部 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: manager.id === '__unassigned__' ? '#e5e7eb' : avatarColor(manager.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '15px', fontWeight: 700, flexShrink: 0 }}>
                      {manager.id === '__unassigned__' ? '?' : manager.name.slice(0, 1)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{manager.name}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '1px' }}>负责 {mgrProjects.length} 个注册项目</div>
                    </div>
                    {/* 快速统计 */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {['高','中','低'].map(r => {
                        const cnt = mgrProjects.filter(p => (p.registrationProfile?.riskLevel || '中') === r).length;
                        if (cnt === 0) return null;
                        const rc = RISK_COLORS[r];
                        return (
                          <div key={r} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: rc.text }}>{cnt}</div>
                            <div style={{ fontSize: '10px', color: '#9ca3af' }}>风险{r}</div>
                          </div>
                        );
                      })}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b' }}>
                          {mgrProjects.filter(p => ['overdue','critical','warning'].includes(p.due?.alertLevel || '')).length}
                        </div>
                        <div style={{ fontSize: '10px', color: '#9ca3af' }}>紧急</div>
                      </div>
                    </div>
                  </div>

                  {/* 项目列表 */}
                  <div>
                    {mgrProjects.map((item, idx) => {
                      const risk = item.registrationProfile?.riskLevel || '中';
                      const alertLevel = item.due?.alertLevel || 'none';
                      const stage = item.registrationProfile?.currentStage || '资料准备';
                      const stageIdx = stageIndex(stage);
                      const riskStyle = RISK_COLORS[risk] || RISK_COLORS['中'];
                      const alertStyle = ALERT_BADGE[alertLevel] || ALERT_BADGE.none;
                      const stageColor = STAGE_COLORS[stage] || STAGE_COLORS['资料准备'];
                      const projTasks = tasksByProject[item.id] || [];
                      const pendingTasks = projTasks.filter(t => t.status !== 'done' && t.status !== 'completed');

                      return (
                        <div
                          key={item.id}
                          onClick={() => navigate(`/registrations/${item.id}`)}
                          style={{
                            padding: '14px 18px', borderBottom: idx < mgrProjects.length - 1 ? '1px solid #f3f4f6' : 'none',
                            cursor: 'pointer', transition: 'background .1s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            {/* 左：项目名+阶段 */}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{item.name}</span>
                                <span style={{ fontSize: '11px', color: stageColor.text, background: stageColor.bg, border: `1px solid ${stageColor.border}`, padding: '1px 7px', borderRadius: '20px', fontWeight: 600 }}>{stage}</span>
                                <span style={{ fontSize: '11px', color: riskStyle.text, background: riskStyle.bg, border: `1px solid ${riskStyle.border}`, padding: '1px 7px', borderRadius: '20px', fontWeight: 600 }}>风险{risk}</span>
                              </div>
                              {/* 阶段进度 */}
                              <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                                {STAGES.map((s, i) => (
                                  <div key={s} title={s} style={{ flex: 1, height: '5px', borderRadius: '3px', background: i <= stageIdx ? stageColor.dot : '#e5e7eb', transition: 'background .2s' }} />
                                ))}
                              </div>
                              {/* 进行中任务 */}
                              {pendingTasks.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  {pendingTasks.slice(0, 3).map(t => (
                                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                                      <span style={{ fontSize: '12px', color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                                      {t.assignee && (
                                        <span style={{ fontSize: '10px', color: '#9ca3af', flexShrink: 0, background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }}>@{t.assignee.name}</span>
                                      )}
                                    </div>
                                  ))}
                                  {pendingTasks.length > 3 && (
                                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>还有 {pendingTasks.length - 3} 项进行中任务...</span>
                                  )}
                                </div>
                              ) : (
                                <div style={{ fontSize: '12px', color: '#d1d5db' }}>共 {item._count?.tasks || 0} 项任务</div>
                              )}
                            </div>
                            {/* 右：时限 */}
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '20px', border: `1px solid ${alertStyle.border}`, background: alertStyle.bg, color: alertStyle.text, display: 'inline-block' }}>
                                {dueLabel(item.due?.daysLeft ?? null)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══ 列表视图 ══ */}
          {viewMode === 'list' && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
              {/* 表头 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 140px 100px 130px 110px 90px',
                gap: '12px', padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
                fontSize: '12px', fontWeight: 600, color: '#6b7280',
              }}>
                <span>项目名称</span>
                <span>注册阶段</span>
                <span>风险等级</span>
                <span>负责人</span>
                <span>取证时限</span>
                <span style={{ textAlign: 'right' }}>任务数</span>
              </div>
              {filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af', fontSize: '14px' }}>暂无匹配项目</div>
              ) : (
                filteredItems.map(item => <ListRow key={item.id} item={item} />)
              )}
            </div>
          )}
        </>
      )}

      {/* ══ 新建弹窗 ══ */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '560px', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>新建注册项目</h2>
              <button style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }} onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>项目名称 *</label>
                <input style={{ marginTop: '4px', width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="请输入项目名称" />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>注册类型</label>
                <input style={{ marginTop: '4px', width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} value={createForm.registrationType} onChange={e => setCreateForm(p => ({ ...p, registrationType: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>当前阶段</label>
                <select style={{ marginTop: '4px', width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} value={createForm.currentStage} onChange={e => setCreateForm(p => ({ ...p, currentStage: e.target.value }))}>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>地区</label>
                <input style={{ marginTop: '4px', width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} value={createForm.region} onChange={e => setCreateForm(p => ({ ...p, region: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>受理机构</label>
                <input style={{ marginTop: '4px', width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} value={createForm.authority} onChange={e => setCreateForm(p => ({ ...p, authority: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>风险等级</label>
                <select style={{ marginTop: '4px', width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} value={createForm.riskLevel} onChange={e => setCreateForm(p => ({ ...p, riskLevel: e.target.value }))}>
                  <option value="高">高</option>
                  <option value="中">中</option>
                  <option value="低">低</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>预计取证日</label>
                <input type="date" style={{ marginTop: '4px', width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} value={createForm.expectedApprovalDate} onChange={e => setCreateForm(p => ({ ...p, expectedApprovalDate: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>任务模板</label>
                <select style={{ marginTop: '4px', width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} value={createForm.templateId} onChange={e => setCreateForm(p => ({ ...p, templateId: e.target.value }))}>
                  <option value="">不套用模板</option>
                  {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button style={{ padding: '8px 20px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#374151', background: '#fff', cursor: 'pointer' }} onClick={() => setShowCreate(false)}>取消</button>
              <button style={{ padding: '8px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, background: creating ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', cursor: creating ? 'not-allowed' : 'pointer' }} disabled={creating} onClick={handleCreate}>
                {creating ? '创建中...' : '创建项目'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
