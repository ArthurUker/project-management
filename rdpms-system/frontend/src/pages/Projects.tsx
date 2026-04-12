import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import type { Project } from '../components/ProjectCard';
import EditProjectModal from '../components/EditProjectModal';
import { projectAPI } from '../api/client';

// ── 常量 ─────────────────────────────────────────────
const TYPE_OPTIONS   = ['platform', '定制', '合作', '测试', '应用'];
const STATUS_OPTIONS = ['规划中', '进行中', '待加工', '待验证', '已完成', '已归档'];

const STATUS_CONFIG: Record<string, { label: string; barColor: string; textColor: string; dotColor: string; borderColor: string }> = {
  '规划中': { label: '规划中', barColor: '#9ca3af', textColor: '#6b7280',  dotColor: '#9ca3af', borderColor: '#e5e7eb' },
  '进行中': { label: '进行中', barColor: '#3b82f6', textColor: '#2563eb',  dotColor: '#3b82f6', borderColor: '#bfdbfe' },
  '待加工': { label: '待加工', barColor: '#f59e0b', textColor: '#d97706',  dotColor: '#f59e0b', borderColor: '#fde68a' },
  '待验证': { label: '待验证', barColor: '#8b5cf6', textColor: '#7c3aed',  dotColor: '#8b5cf6', borderColor: '#e9d5ff' },
  '已完成': { label: '已完成', barColor: '#10b981', textColor: '#059669',  dotColor: '#10b981', borderColor: '#a7f3d0' },
  '已归档': { label: '已归档', barColor: '#d1d5db', textColor: '#9ca3af',  dotColor: '#d1d5db', borderColor: '#e5e7eb' },
};

type ViewMode = 'card' | 'list' | 'kanban';

// ── 视图切换图标 ──────────────────────────────────────
const ViewIcons = {
  card: (
    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>
    </svg>
  ),
  list: (
    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
    </svg>
  ),
  kanban: (
    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <rect x="3" y="3" width="5" height="18" rx="1.5"/>
      <rect x="10" y="3" width="5" height="12" rx="1.5"/>
      <rect x="17" y="3" width="5" height="15" rx="1.5"/>
    </svg>
  ),
};

// ── 主页面组件 ────────────────────────────────────────
const Projects: React.FC = () => {
  const navigate = useNavigate();

  // 数据
  const [projects,       setProjects]       = useState<Project[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  // 视图
  const [viewMode,       setViewMode]       = useState<ViewMode>('card');

  // 筛选
  const [filterType,     setFilterType]     = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterManager,  setFilterManager]  = useState('');
  const [searchKeyword,  setSearchKeyword]  = useState('');

  // 批量操作
  const [selectedIds,    setSelectedIds]    = useState<string[]>([]);

  // 编辑弹窗
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // ── 加载项目列表 ──
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await projectAPI.list();
      const data = res.projects ?? res.list ?? res.flat ?? res.data ?? res;
      setProjects(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message ?? err?.error ?? '加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // ── 前端筛选 ──
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchType    = !filterType    || p.type    === filterType;
      const matchStatus  = !filterStatus  || p.status  === filterStatus;
      const matchManager = !filterManager || p.manager?.name === filterManager;
      const matchKeyword = !searchKeyword ||
        p.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        p.code.toLowerCase().includes(searchKeyword.toLowerCase());
      return matchType && matchStatus && matchManager && matchKeyword;
    });
  }, [projects, filterType, filterStatus, filterManager, searchKeyword]);

  // ── 状态统计 ──
  const statusStats = useMemo(() => {
    const total = projects.length || 1;
    return STATUS_OPTIONS.map(s => ({
      ...STATUS_CONFIG[s],
      count: projects.filter(p => p.status === s).length,
      percent: Math.round((projects.filter(p => p.status === s).length / total) * 100),
    }));
  }, [projects]);

  // ── 负责人列表（用于筛选下拉）──
  const managerOptions = useMemo(() => {
    const names = [...new Set(projects.map(p => p.manager?.name).filter(Boolean))] as string[];
    return names;
  }, [projects]);

  // ── 全选 ──
  const allSelected = filteredProjects.length > 0 && filteredProjects.every(p => selectedIds.includes(p.id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : filteredProjects.map(p => p.id));
  };

  // ── 批量删除 ──
  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 个项目？`)) return;
    try {
      await projectAPI.batchDelete(selectedIds);
      setSelectedIds([]);
      loadProjects();
    } catch (err: any) {
      alert(err?.message ?? '删除失败');
    }
  };

  // ── 批量改状态 ──
  const handleBatchStatus = async (status: string) => {
    if (!selectedIds.length) return;
    try {
      await projectAPI.batchUpdateStatus(selectedIds, status);
      setSelectedIds([]);
      loadProjects();
    } catch (err: any) {
      alert(err?.message ?? '操作失败');
    }
  };

  // ── 列表视图行 ──
  const ListRow: React.FC<{ project: Project }> = ({ project }) => {
    const statusCfg = STATUS_CONFIG[project.status ?? ''] ?? STATUS_CONFIG['规划中'];
    const total    = project.taskCount ?? 0;
    const done     = project.taskDoneCount ?? 0;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div
        style={{
          display: 'grid', gridTemplateColumns: '32px 2fr 1fr 1fr 1fr 120px 100px',
          alignItems: 'center', gap: '12px',
          padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
          cursor: 'pointer', transition: 'background .15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        <input type="checkbox" checked={selectedIds.includes(project.id)}
          style={{ accentColor: '#3b82f6' }}
          onChange={e => { e.stopPropagation(); setSelectedIds(prev => e.target.checked ? [...prev, project.id] : prev.filter(id => id !== project.id)); }}
          onClick={e => e.stopPropagation()}
        />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{project.name}</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{project.code}</div>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {project.type && <span style={{ fontSize: '11px', background: '#f3f4f6', color: '#4b5563', padding: '2px 7px', borderRadius: '4px', fontWeight: 500 }}>{project.type}</span>}
          {project.subtype && <span style={{ fontSize: '11px', background: '#f3f4f6', color: '#4b5563', padding: '2px 7px', borderRadius: '4px', fontWeight: 500 }}>{project.subtype}</span>}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 500, color: statusCfg.textColor, background: 'transparent' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusCfg.dotColor, display: 'inline-block', flexShrink: 0 }} />
          {statusCfg.label}
        </span>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
            <span>{done}/{total}</span><span>{progress}%</span>
          </div>
          <div style={{ height: '4px', borderRadius: '2px', background: '#f3f4f6', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: '2px', background: statusCfg.barColor, width: `${progress}%` }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 700 }}>
            {(project.manager?.name ?? '?').slice(0, 1)}
          </div>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>{project.manager?.name ?? '未分配'}</span>
        </div>
        <button
          style={{ fontSize: '12px', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', background: '#fff', cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); setEditingProject(project); }}
        >
          编辑
        </button>
      </div>
    );
  };

  // ── 看板视图列 ──
  const KanbanColumn: React.FC<{ status: string }> = ({ status }) => {
    const cfg  = STATUS_CONFIG[status] ?? STATUS_CONFIG['规划中'];
    const list = filteredProjects.filter(p => p.status === status);
    return (
      <div style={{ flex: '0 0 280px', minWidth: '280px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '0 4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.dotColor, display: 'inline-block' }} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>{status}</span>
          <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f3f4f6', padding: '1px 8px', borderRadius: '20px', marginLeft: 'auto' }}>{list.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {list.map(p => (
            <ProjectCard key={p.id} project={p} onEdit={setEditingProject} onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
          {list.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#d1d5db', fontSize: '14px', border: '2px dashed #e5e7eb', borderRadius: '12px' }}>
              暂无项目
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── 渲染 ──────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>

      {/* ══ 顶部栏 ══ */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '0 28px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 30,
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#111827' }}>项目管理</h1>
          <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 10px', borderRadius: '20px', fontWeight: 500 }}>
            {projects.length} 个项目
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

          {/* 视图切换 */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#f3f4f6', borderRadius: '12px', padding: '5px', gap: '4px' }}>
            {(['card', 'list', 'kanban'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 20px', borderRadius: '9px',
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none',
                  transition: 'all .15s',
                  background: viewMode === mode ? '#fff' : 'transparent',
                  color: viewMode === mode ? '#2563eb' : '#6b7280',
                  boxShadow: viewMode === mode ? '0 1px 4px rgba(37,99,235,.15)' : 'none',
                  outline: viewMode === mode ? '1.5px solid #bfdbfe' : 'none',
                }}
              >
                {ViewIcons[mode]}
                {{ card: '卡片', list: '列表', kanban: '看板' }[mode]}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '24px', background: '#e5e7eb' }} />

          {/* 批量操作（有选中时显示） */}
          {selectedIds.length > 0 && (
            <>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>已选 {selectedIds.length} 项</span>
              <select
                style={{ padding: '7px 28px 7px 12px', border: '1.5px solid #e5e7eb', borderRadius: '9px', fontSize: '14px', color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none' }}
                onChange={e => { if (e.target.value) handleBatchStatus(e.target.value); e.target.value = ''; }}
                defaultValue=""
              >
                <option value="" disabled>批量改状态</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={handleBatchDelete}
                style={{ padding: '7px 14px', border: '1.5px solid #fca5a5', borderRadius: '9px', fontSize: '14px', color: '#dc2626', background: '#fff', cursor: 'pointer', fontWeight: 500 }}
              >
                删除
              </button>
            </>
          )}

          {/* 刷新 */}
          <button
            onClick={loadProjects}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', border: '1.5px solid #e5e7eb', borderRadius: '9px', background: '#fff', fontSize: '14px', color: '#6b7280', cursor: 'pointer', fontWeight: 500 }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            刷新
          </button>

          {/* 新建 */}
          <button
            onClick={() => navigate('/projects/new')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,.3)' }}
          >
            <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
            新建项目
          </button>
        </div>
      </div>

      {/* ══ 主内容 ══ */}
      <div style={{ padding: '24px 28px', maxWidth: '1400px', margin: '0 auto' }}>

        {/* 状态统计栏 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '14px', marginBottom: '22px' }}>
          {statusStats.map(stat => (
            <div
              key={stat.label}
              style={{
                background: '#fff', borderRadius: '12px', padding: '16px 20px',
                border: '1px solid #e5e7eb', borderLeft: `4px solid ${stat.barColor}`,
                cursor: 'pointer', transition: 'all .2s',
              }}
              onClick={() => setFilterStatus(filterStatus === stat.label ? '' : stat.label)}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: stat.textColor, fontWeight: 500 }}>{stat.label}</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: stat.dotColor, display: 'block' }} />
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: stat.textColor, lineHeight: 1 }}>{stat.count}</div>
              <div style={{ height: '5px', borderRadius: '3px', background: '#f3f4f6', overflow: 'hidden', marginTop: '10px' }}>
                <div style={{ height: '100%', borderRadius: '3px', background: stat.barColor, width: `${stat.percent}%`, transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: '11px', color: '#d1d5db', marginTop: '5px' }}>占比 {stat.percent}%</div>
            </div>
          ))}
        </div>

        {/* 筛选栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px',
          flexWrap: 'wrap', background: '#fff', padding: '16px 22px',
          borderRadius: '12px', border: '1px solid #e5e7eb',
          boxShadow: '0 1px 4px rgba(0,0,0,.04)',
        }}>
          {/* 搜索框 */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '320px' }}>
            <svg style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
            </svg>
            <input
              style={{ width: '100%', padding: '8px 12px 8px 34px', border: '1.5px solid #e5e7eb', borderRadius: '9px', fontSize: '14px', color: '#374151', outline: 'none' }}
              placeholder="搜索项目名称或编号..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
            />
          </div>

          <div style={{ width: '1px', height: '28px', background: '#e5e7eb' }} />

          {/* 类型标签筛选 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 500, whiteSpace: 'nowrap' }}>类型：</span>
            {['', ...TYPE_OPTIONS].map(t => (
              <button
                key={t || 'all'}
                onClick={() => setFilterType(t)}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, height: '42px',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
                  border: filterType === t ? '1.5px solid #3b82f6' : '1.5px solid #e5e7eb',
                  background: filterType === t ? '#eff6ff' : '#fff',
                  color: filterType === t ? '#2563eb' : '#6b7280',
                }}
              >
                {t || '全部'}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '28px', background: '#e5e7eb' }} />

          {/* 状态下拉 */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 28px 8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '9px', fontSize: '14px', color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none', fontWeight: 500 }}
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* 负责人下拉 */}
          <select
            value={filterManager}
            onChange={e => setFilterManager(e.target.value)}
            style={{ padding: '8px 28px 8px 12px', border: '1.5px solid #e5e7eb', borderRadius: '9px', fontSize: '14px', color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none', fontWeight: 500 }}
          >
            <option value="">全部负责人</option>
            {managerOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          {/* 全选（列表/卡片视图） */}
          {viewMode !== 'kanban' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#6b7280', cursor: 'pointer', marginLeft: 'auto' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} />
              全选
            </label>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', color: '#dc2626', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
            {error}
            <button onClick={loadProjects} style={{ marginLeft: 'auto', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>重试</button>
          </div>
        )}

        {/* 加载骨架屏 */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: '14px', height: '180px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <div style={{ height: '4px', background: '#e5e7eb' }} />
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f3f4f6' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ height: '14px', background: '#f3f4f6', borderRadius: '4px', marginBottom: '6px', width: '70%' }} />
                      <div style={{ height: '10px', background: '#f3f4f6', borderRadius: '4px', width: '50%' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <div style={{ height: '20px', width: '50px', background: '#f3f4f6', borderRadius: '5px' }} />
                    <div style={{ height: '20px', width: '60px', background: '#f3f4f6', borderRadius: '5px' }} />
                  </div>
                  <div style={{ height: '5px', background: '#f3f4f6', borderRadius: '3px' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 卡片视图 ── */}
        {!loading && viewMode === 'card' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
            {filteredProjects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                selected={selectedIds.includes(p.id)}
                onSelect={(id, checked) => setSelectedIds(prev => checked ? [...prev, id] : prev.filter(x => x !== id))}
                onEdit={setEditingProject}
                onClick={() => navigate(`/projects/${p.id}`)}
              />
            ))}
            {/* 新建引导卡 */}
            <div
              onClick={() => navigate('/projects/new')}
              style={{
                border: '2px dashed #d1d5db', borderRadius: '14px',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', minHeight: '180px',
                transition: 'all .2s', gap: '8px',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLDivElement).style.background = '#eff6ff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" fill="none" stroke="#9ca3af" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
              </div>
              <span style={{ fontSize: '14px', color: '#9ca3af', fontWeight: 500 }}>新建项目</span>
            </div>
          </div>
        )}

        {/* ── 列表视图 ── */}
        {!loading && viewMode === 'list' && (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {/* 表头 */}
            <div style={{
              display: 'grid', gridTemplateColumns: '32px 2fr 1fr 1fr 1fr 120px 100px',
              gap: '12px', padding: '10px 16px',
              background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
              fontSize: '12px', fontWeight: 600, color: '#6b7280',
            }}>
              <span></span>
              <span>项目名称</span><span>类型</span><span>状态</span>
              <span>任务进度</span><span>负责人</span><span>操作</span>
            </div>
            {filteredProjects.length === 0
              ? <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af', fontSize: '14px' }}>暂无项目</div>
              : filteredProjects.map(p => <ListRow key={p.id} project={p} />)
            }
          </div>
        )}

        {/* ── 看板视图 ── */}
        {!loading && viewMode === 'kanban' && (
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px' }}>
            {STATUS_OPTIONS.map(s => <KanbanColumn key={s} status={s} />)}
          </div>
        )}

        {/* 空状态 */}
        {!loading && filteredProjects.length === 0 && viewMode !== 'kanban' && (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: '#9ca3af' }}>
            <svg style={{ margin: '0 auto 16px', display: 'block', opacity: .4 }} width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1"><path d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/></svg>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>暂无匹配项目</div>
            <div style={{ fontSize: '14px' }}>尝试调整筛选条件，或新建一个项目</div>
          </div>
        )}

      </div>

      {/* 编辑弹窗 */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => { setEditingProject(null); loadProjects(); }}
        />
      )}

    </div>
  );
};

export default Projects;
