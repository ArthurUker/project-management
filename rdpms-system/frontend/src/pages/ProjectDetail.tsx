import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { projectAPI, progressAPI } from '../api/client';
import { useAppStore } from '../store/appStore';
import KanbanBoard from '../components/KanbanBoard';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { projects: _projects } = useAppStore();
  const [project, setProject] = useState<any>(null);
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'kanban'>('overview');
  
  useEffect(() => {
    if (id) {
      loadProject();
    }
  }, [id]);
  
  const loadProject = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [projectData, progressData] = await Promise.all([
        projectAPI.get(id),
        progressAPI.get(id, 6)
      ]);
      const proj = (projectData as any).data ? (projectData as any).data : projectData;
      const progRaw = (progressData as any).data ? (progressData as any).data : progressData;
      setProject(proj);
      setProgress(Array.isArray(progRaw) ? progRaw : (progRaw?.list || []));
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    '进行中': 'bg-primary-500',
    '已完成': 'bg-green-500',
    '待加工': 'bg-orange-500',
    '待验证': 'bg-yellow-500',
    '规划中': 'bg-gray-400',
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>)}
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="text-center py-12 text-gray-500">项目不存在</div>;
  }

  return (
    <div>
      {/* 返回按钮 */}
      <Link to="/projects" className="inline-flex items-center text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回项目列表
      </Link>
      
      {/* 项目头部 */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className={`w-3 h-3 rounded-full ${statusColors[project.status] || 'bg-gray-400'}`} />
              <h1 className="text-2xl font-display font-bold text-gray-900">{project.name}</h1>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span>{project.code}</span>
              <span>·</span>
              <span>{project.type}</span>
              {project.subtype && <><span>·</span><span>{project.subtype}</span></>}
            </div>
          </div>
          <div className="flex space-x-2">
            <button className="btn btn-secondary">编辑</button>
            <button className="btn btn-primary">添加成员</button>
          </div>
        </div>
        
        {/* 项目定位 */}
        {project.position && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-2">项目定位</h3>
            <p className="text-gray-600">{project.position}</p>
          </div>
        )}
        
        {/* 基本信息 */}
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-sm text-gray-500">负责人</p>
            <p className="font-medium text-gray-900 mt-1">{project.manager?.name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">开始日期</p>
            <p className="font-medium text-gray-900 mt-1">
              {project.startDate ? new Date(project.startDate).toLocaleDateString() : '-'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">预计完成</p>
            <p className="font-medium text-gray-900 mt-1">
              {project.endDate ? new Date(project.endDate).toLocaleDateString() : '-'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">团队规模</p>
            <p className="font-medium text-gray-900 mt-1">{project.members?.length || 0} 人</p>
          </div>
        </div>
      </div>
      
      {/* 标签页切换 */}
      <div className="flex items-center space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'overview'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          概览
        </button>
        <button
          onClick={() => setActiveTab('kanban')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'kanban'
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          看板
        </button>
      </div>

      {/* 内容区域 */}
      {activeTab === 'overview' ? (
        <div className="grid grid-cols-3 gap-6">
          {/* 左侧：成员和任务 */}
          <div className="col-span-2 space-y-6">
            {/* 成员列表 */}
            <div className="card">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">项目成员</h2>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-3">
                  {project.members?.map((m: any) => (
                    <div key={m.id} className="flex items-center space-x-2 bg-gray-50 rounded-lg px-3 py-2">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 text-sm font-medium">
                          {m.user?.name?.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.user?.name}</p>
                        <p className="text-xs text-gray-500">{m.user?.position || m.role}</p>
                      </div>
                    </div>
                  ))}
                  {(!project.members || project.members.length === 0) && (
                    <div className="text-gray-400 text-sm">暂无成员</div>
                  )}
                </div>
              </div>
            </div>
            
            {/* 任务列表 */}
            <div className="card">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">最近任务</h2>
                <Link to="/tasks" className="text-primary-500 text-sm hover:underline">查看全部</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {project.tasks?.slice(0, 5).map((task: any) => (
                  <div key={task.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${
                        task.status === '已完成' ? 'bg-green-500' :
                        task.status === '进行中' ? 'bg-primary-500' :
                        task.status === '已阻塞' ? 'bg-red-500' : 'bg-gray-300'
                      }`} />
                      <span className="text-gray-900">{task.title}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      {task.assignee && (
                        <span className="text-sm text-gray-500">{task.assignee.name}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        task.priority === '高' ? 'bg-red-100 text-red-600' :
                        task.priority === '中' ? 'bg-yellow-100 text-yellow-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                ))}
                {(!project.tasks || project.tasks.length === 0) && (
                  <div className="px-5 py-8 text-center text-gray-500">暂无任务</div>
                )}
              </div>
            </div>
          </div>
          
          {/* 右侧：月度进展 */}
          <div className="col-span-1">
            <div className="card">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">月度进展</h2>
              </div>
              <div className="p-5">
                {progress.map((p) => (
                  <div key={p.id} className="mb-4 pb-4 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{p.month}</span>
                      <span className="text-sm text-gray-500">{p.completion}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                      <div 
                        className="bg-primary-500 h-2 rounded-full transition-all"
                        style={{ width: `${p.completion}%` }}
                      />
                    </div>
                    {p.actualWork && (
                      <p className="text-sm text-gray-600 line-clamp-2">{p.actualWork}</p>
                    )}
                    {p.nextPlan && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        下月计划：{p.nextPlan}
                      </p>
                    )}
                  </div>
                ))}
                {progress.length === 0 && (
                  <div className="text-center text-gray-500 py-4">暂无进展记录</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 看板视图 */
        <div className="h-[calc(100vh-320px)]">
          <KanbanBoard projectId={id} />
        </div>
      )}
    </div>
  );
}
