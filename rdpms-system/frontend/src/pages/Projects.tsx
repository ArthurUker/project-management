import { useEffect, useState } from 'react';
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
        <div className="grid grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="card card-hover p-5 block"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                    <span className="text-primary-600 font-bold text-sm">
                      {project.code.split('-').pop()}
                    </span>
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
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[project.status] || 'bg-gray-100 text-gray-600'}`}>
                  {project.status}
                </span>
                <div className="flex items-center space-x-3 text-xs text-gray-500">
                  <span>{project._count?.members || 0} 人</span>
                  <span>{project._count?.tasks || 0} 任务</span>
                </div>
              </div>
              
              {project.manager && (
                <div className="flex items-center mt-3 pt-3 border-t border-gray-100">
                  <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
                    <span className="text-xs text-gray-600">{project.manager.name?.charAt(0)}</span>
                  </div>
                  <span className="ml-2 text-sm text-gray-600">{project.manager.name}</span>
                </div>
              )}
            </Link>
          ))}
          
          {filteredProjects.length === 0 && (
            <div className="col-span-3 card p-12 text-center text-gray-500">
              暂无项目
            </div>
          )}
        </div>
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
