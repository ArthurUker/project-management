import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ProjectCard, { Project } from '../components/ProjectCard';
import EditProjectModal from '../components/EditProjectModal';
import api from '../lib/api'; // 根据 Task1 结果调整路径

// ─── 状态/类型选项（与 Prisma Schema 对齐）───
const TYPE_OPTIONS  = ['platform', '定制', '合作', '测试', '应用'];
const STATUS_OPTIONS = ['规划中', '进行中', '待加工', '待验证', '已完成', '已归档'];

const ProjectList: React.FC = () => {
  const navigate = useNavigate();

  // ── 数据 ──
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // ── 筛选 ──
  const [filterType,    setFilterType]    = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // ── 批量操作 ──
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ── 编辑弹窗 ──
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // ── 加载项目列表 ──
  const loadProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/projects');
      // 兼容 { projects: [...] } 和 [...] 两种返回格式
      setProjects(res.data.projects ?? res.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? '加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProjects(); }, []);

  // ── 前端筛选 + 搜索 ──
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchType    = !filterType    || p.type   === filterType;
      const matchStatus  = !filterStatus  || p.status === filterStatus;
      const matchKeyword = !searchKeyword ||
        p.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        p.code.toLowerCase().includes(searchKeyword.toLowerCase());
      return matchType && matchStatus && matchKeyword;
    });
  }, [projects, filterType, filterStatus, searchKeyword]);

  // ── 全选 ──
  const allSelected = filteredProjects.length > 0 &&
    filteredProjects.every(p => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    setSelectedIds(allSelected
      ? selectedIds.filter(id => !filteredProjects.find(p => p.id === id))
      : [...new Set([...selectedIds, ...filteredProjects.map(p => p.id)])]
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // ── 单个删除 ──
  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除该项目？此操作不可撤销。')) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects(prev => prev.filter(p => p.id !== id));
      setSelectedIds(prev => prev.filter(i => i !== id));
    } catch (err: any) {
      alert(err?.response?.data?.error ?? '删除失败');
    }
  };

  // ── 批量删除 ──
  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 个项目？此操作不可撤销。`)) return;
    try {
      await api.post('/projects/batch-delete', { ids: selectedIds });
      setProjects(prev => prev.filter(p => !selectedIds.includes(p.id)));
      setSelectedIds([]);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? '批量删除失败');
    }
  };

  // ── 批量改状态 ──
  const handleBatchStatus = async (status: string) => {
    if (!selectedIds.length || !status) return;
    try {
      await api.post('/projects/batch-update-status', { ids: selectedIds, status });
      setProjects(prev =>
        prev.map(p => selectedIds.includes(p.id) ? { ...p, status } : p)
      );
      setSelectedIds([]);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? '批量更新失败');
    }
  };

  // ── 统计各状态数量 ──
  const statusCount = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => { map[p.status] = (map[p.status] ?? 0) + 1; });
    return map;
  }, [projects]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* ══ 页头 ══ */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              项目管理
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              共 {projects.length} 个项目
              {filterType || filterStatus || searchKeyword
                ? `，当前显示 ${filteredProjects.length} 个`
                : ''}
            </p>
          </div>
          <button
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                       text-white px-5 py-2.5 rounded-xl text-sm font-medium
                       transition-colors shadow-sm hover:shadow-md"
            onClick={() => navigate('/projects/new')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M12 4v16m8-8H4"/>
            </svg>
            新建项目
          </button>
        </div>

        {/* ══ 状态快捷统计栏 ══ */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              className={`
                bg-white rounded-xl border px-3 py-2.5 text-center
                transition-all hover:shadow-sm cursor-pointer
                ${filterStatus === s
                  ? 'border-blue-400 ring-2 ring-blue-100'
                  : 'border-gray-200 hover:border-gray-300'}
              `}
              onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
            >
              <div className="text-lg font-bold text-gray-800">
                {statusCount[s] ?? 0}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">{s}</div>
            </button>
          ))}
        </div>

        {/* ══ 筛选工具栏 ══ */}
        <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3
                        mb-4 flex items-center gap-3 flex-wrap shadow-sm">
          {/* 全选 */}
          <label className="flex items-center gap-2 cursor-pointer select-none
                            text-sm text-gray-500 pr-3 border-r border-gray-200">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-blue-600"
              checked={allSelected}
              onChange={toggleSelectAll}
            />
            全选
          </label>

          {/* 类型筛选 */}
          <select
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                       text-gray-600 bg-gray-50 focus:outline-none focus:ring-2
                       focus:ring-blue-200 min-w-[100px]"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="">全部类型</option>
            {TYPE_OPTIONS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* 状态筛选 */}
          <select
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                       text-gray-600 bg-gray-50 focus:outline-none focus:ring-2
                       focus:ring-blue-200 min-w-[100px]"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* 搜索框 */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
            </svg>
            <input
              type="text"
              placeholder="搜索项目名称或编号..."
              className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg
                         text-sm bg-gray-50 focus:outline-none focus:ring-2
                         focus:ring-blue-200 text-gray-700"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
            />
            {searchKeyword && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2
                           text-gray-400 hover:text-gray-600"
                onClick={() => setSearchKeyword('')}
              >✕</button>
            )}
          </div>

          {/* 刷新 */}
          <button
            className="flex items-center gap-1.5 text-sm text-gray-500
                       hover:text-gray-700 border border-gray-200 rounded-lg
                       px-3 py-1.5 hover:bg-gray-50 transition-colors ml-auto"
            onClick={loadProjects}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581
                   m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            刷新
          </button>
        </div>

        {/* ══ 批量操作浮动栏（有选中时出现）══ */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 bg-blue-600 text-white
                          rounded-2xl mb-4 shadow-lg">
            <svg className="w-4 h-4 flex-shrink-0" fill="none"
              stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 13l4 4L19 7"/>
            </svg>
            <span className="text-sm font-medium">
              已选 {selectedIds.length} 个项目
            </span>
            <div className="w-px h-4 bg-blue-400" />
            <select
              className="text-sm border border-blue-400 rounded-lg px-2 py-1
                         bg-blue-700 text-white focus:outline-none"
              onChange={(e) => { if (e.target.value) handleBatchStatus(e.target.value); }}
              defaultValue=""
            >
              <option value="" disabled>批量改状态</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              className="flex items-center gap-1.5 text-sm bg-red-500 hover:bg-red-600
                         px-3 py-1.5 rounded-lg transition-colors"
              onClick={handleBatchDelete}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7
                     m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              批量删除
            </button>
            <button
              className="text-sm text-blue-200 hover:text-white ml-auto transition-colors"
              onClick={() => setSelectedIds([])}
            >
              取消选择
            </button>
          </div>
        )}

        {/* ══ 内容区 ══ */}
        {loading ? (
          // 骨架屏
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200
                                      h-48 animate-pulse">
                <div className="h-1.5 bg-gray-200 rounded-t-2xl" />
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <div className="w-4 h-4 bg-gray-200 rounded" />
                    <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="flex gap-2">
                    <div className="h-5 bg-gray-100 rounded-md w-12" />
                    <div className="h-5 bg-gray-100 rounded-md w-14" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-base font-medium text-gray-500">{error}</p>
            <button
              className="mt-4 text-sm text-blue-600 hover:underline"
              onClick={loadProjects}
            >
              点击重试
            </button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="text-5xl mb-4">📂</div>
            <p className="text-base font-medium">
              {searchKeyword || filterType || filterStatus
                ? '没有符合条件的项目'
                : '暂无项目'}
            </p>
            <p className="text-sm mt-1">
              {searchKeyword || filterType || filterStatus
                ? '尝试调整筛选条件'
                : '点击右上角「新建项目」开始创建'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProjects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                selected={selectedIds.includes(project.id)}
                onSelect={toggleSelect}
                onEdit={setEditingProject}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

      </div>

      {/* ══ 编辑弹窗 ══ */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSaved={() => { loadProjects(); setEditingProject(null); }}
        />
      )}
    </div>
  );
};

export default ProjectList;
