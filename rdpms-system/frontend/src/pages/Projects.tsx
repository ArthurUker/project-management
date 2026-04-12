import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { projectAPI } from '../api/client';
import CreateProjectModal from '../components/CreateProjectModal';

const PROJECT_TYPES = [
  { value: '', label: '全部类型' },
  { value: 'platform', label: '平台项目' },
  { value: '定制', label: '定制项目' },
  { value: '合作', label: '合作项目' },
  { value: '测试', label: '测试项目' },
  { value: '应用', label: '应用项目' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: '进行中', label: '进行中' },
  { value: '待加工', label: '待加工' },
  { value: '待验证', label: '待验证' },
  { value: '已完成', label: '已完成' },
  { value: '已归档', label: '已归档' },
];

const statusColors: Record<string, string> = {
  '规划中': 'bg-blue-100 text-blue-700',
  '进行中': 'bg-primary-100 text-primary-700',
  '待加工': 'bg-orange-100 text-orange-700',
  '待验证': 'bg-yellow-100 text-yellow-700',
  '已完成': 'bg-green-100 text-green-700',
  '已归档': 'bg-gray-100 text-gray-500',
};

export default function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [showCreate, setShowCreate] = useState(location.pathname === '/projects/new');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingProject, setEditingProject] = useState<any | null>(null);

  const allSelected = projects.length > 0 && selectedIds.length === projects.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : projects.map(p => p.id));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 个项目？此操作不可撤销。`)) return;
    try {
      await projectAPI.batchDelete(selectedIds);
      setSelectedIds([]);
      loadProjects();
    } catch (err: any) {
      alert(err?.message || '批量删除失败');
    }
  };

  const handleBatchStatus = async (statusVal: string) => {
    if (!selectedIds.length) return;
    try {
      await projectAPI.batchUpdateStatus(selectedIds, statusVal);
      setSelectedIds([]);
      loadProjects();
    } catch (err: any) {
      alert(err?.message || '批量更新失败');
    }
  };


  useEffect(() => {
    if (location.pathname === '/projects/new' && !showCreate) {
      setShowCreate(true);
    }
  }, [location.pathname]);
  
  useEffect(() => {
    loadProjects();
  }, [type, status]);
  
  const loadProjects = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (type) params.type = type;
      if (status) params.status = status;
      if (keyword) params.keyword = keyword;
      
      const res = await projectAPI.list(params);
      setProjects(res.list || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const filteredProjects = keyword
    ? projects.filter(p => 
        p.name.includes(keyword) || 
        p.code.includes(keyword) ||
        p.subtype?.includes(keyword)
      )
    : projects;
  
  return (
    <>
    <div>
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-gray-900">项目管理</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + 新建项目
        </button>
      </div>
      
      {/* 筛选栏 */}
      <div className="card p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <input
              type="text"
              className="input"
              placeholder="搜索项目名称、编号..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <select className="input w-40" value={type} onChange={(e) => setType(e.target.value)}>
            {PROJECT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button onClick={loadProjects} className="btn btn-secondary">
            刷新
          </button>
        </div>
      </div>
      
      {/* 项目列表 */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
              <div className="h-3 bg-gray-100 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* 批量操作栏 */}
          {selectedIds.length > 0 && (
            <div className="col-span-3 mb-4">
              <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-sm text-blue-700">已选 {selectedIds.length} 个项目</span>
                <select className="text-sm border rounded px-2 py-1" onChange={(e) => e.target.value && handleBatchStatus(e.target.value)} defaultValue="">
                  <option value="" disabled>批量改状态</option>
                  <option value="进行中">进行中</option>
                  <option value="规划中">规划中</option>
                  <option value="待验证">待验证</option>
                  <option value="已完成">已完成</option>
                  <option value="暂停">暂停</option>
                </select>
                <button className="text-sm text-red-500 border border-red-300 rounded px-3 py-1 hover:bg-red-50" onClick={handleBatchDelete}>批量删除</button>
                <button className="text-sm text-gray-500 hover:text-gray-700" onClick={() => setSelectedIds([])}>取消选择</button>
                <div className="ml-auto">
                  <label className="inline-flex items-center text-sm">
                    <input type="checkbox" className="mr-2" checked={allSelected} onChange={toggleSelectAll} /> 全选
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="card card-hover p-5 block relative"
              >
                {/* 复选框 */}
                <input
                  type="checkbox"
                  className="absolute top-3 left-3 z-10 w-4 h-4 cursor-pointer"
                  checked={selectedIds.includes(project.id)}
                  onChange={(e) => { e.stopPropagation(); toggleSelect(project.id); }}
                  onClick={(e) => e.stopPropagation()}
                />

                {/* 操作菜单 */}
                <div className="absolute top-3 right-3">
                  <div className="relative inline-block">
                    <button
                      onClick={(e) => { e.stopPropagation(); const el = (e.target as HTMLElement); const menu = document.getElementById(`menu-${project.id}`); if (menu) { menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; } }}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                    >
                      ⋯
                    </button>
                    <div id={`menu-${project.id}`} style={{ display: 'none' }} className="absolute right-0 top-6 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36">
                      <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50" onClick={(e) => { e.stopPropagation(); document.getElementById(`menu-${project.id}`)!.style.display = 'none'; setEditingProject(project); }}>
                        ✏️ 编辑
                      </button>
                      <button className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50" onClick={async (e) => { e.stopPropagation(); document.getElementById(`menu-${project.id}`)!.style.display = 'none'; if (!confirm('确认删除该项目？此操作不可撤销')) return; try { await projectAPI.delete(project.id); loadProjects(); } catch (err: any) { alert(err?.message || '删除失败'); } }}>
                        🗑️ 删除
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                      <span className="text-primary-600 font-bold text-sm">{project.code.split('-').pop()}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{project.name}</h3>
                      <p className="text-xs text-gray-500">{project.code}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                  <span>{project.type}</span>
                  {project.subtype && <span>· {project.subtype}</span>}
                </div>

                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[project.status] || 'bg-gray-100 text-gray-600'}`}>{project.status}</span>
                  <div className="flex items-center space-x-3 text-xs text-gray-500">
                    <span>{project._count?.members || 0} 人</span>
                    <span>{project._count?.tasks || 0} 任务</span>
                  </div>
                </div>

                {project.manager && (
                  <div className="flex items-center mt-3 pt-3 border-t border-gray-100">
                    <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center"><span className="text-xs text-gray-600">{project.manager.name?.charAt(0)}</span></div>
                    <span className="ml-2 text-sm text-gray-600">{project.manager.name}</span>
                  </div>
                )}
              </Link>
            ))}

            {filteredProjects.length === 0 && (
              <div className="col-span-3 card p-12 text-center text-gray-500">暂无项目</div>
            )}
          </div>
        </>
      )}
    </div>

    {showCreate && (
      <CreateProjectModal
        onClose={() => {
          setShowCreate(false);
          if (location.pathname === '/projects/new') navigate('/projects');
          loadProjects();
        }}
      />
    )}
    </>
  );
}
