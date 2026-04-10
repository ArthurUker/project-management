import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { statsAPI, projectAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

export default function Dashboard() {
  const { user, projects, tasks, reports } = useAppStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadStats();
  }, []);
  
  const loadStats = async () => {
    try {
      const data = await statsAPI.dashboard();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // 获取我的任务
  const myTasks = tasks.filter(t => t.assigneeId === user?.id);
  const pendingTasks = myTasks.filter(t => t.status !== '已完成');
  
  // 获取我的汇报
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const myReports = reports.filter(r => r.userId === user?.id && r.month === currentMonth);
  
  const statusColors: Record<string, string> = {
    '进行中': 'bg-primary-100 text-primary-700',
    '已完成': 'bg-green-100 text-green-700',
    '待加工': 'bg-orange-100 text-orange-700',
    '待验证': 'bg-yellow-100 text-yellow-700',
    '待开始': 'bg-gray-100 text-gray-700',
    '已归档': 'bg-gray-100 text-gray-500',
  };
  
  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div>
      {/* 欢迎语 */}
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-gray-900">
          欢迎回来，{user?.name}
        </h1>
        <p className="text-gray-500 mt-1">
          {new Date().toLocaleDateString('zh-CN', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
          })}
        </p>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">进行中项目</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.projects?.active || 0}</p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">我的待办</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{pendingTasks.length}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">本月汇报</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{myReports.length}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>
        
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">待审批</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.reports?.pending || 0}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      
      {/* 内容区 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 项目列表 */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">进行中的项目</h2>
            <Link to="/projects" className="text-primary-500 text-sm hover:underline">查看全部</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {projects.slice(0, 5).map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <span className="text-primary-600 font-semibold text-sm">
                      {project.code.split('-').pop()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{project.name}</p>
                    <p className="text-xs text-gray-500">{project.code}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[project.status] || 'bg-gray-100 text-gray-600'}`}>
                  {project.status}
                </span>
              </Link>
            ))}
            {projects.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-500">
                暂无项目
              </div>
            )}
          </div>
        </div>
        
        {/* 待办任务 */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">我的待办</h2>
            <Link to="/tasks" className="text-primary-500 text-sm hover:underline">查看全部</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="px-5 py-3">
                <div className="flex items-start space-x-3">
                  <div className={`w-2 h-2 mt-2 rounded-full ${
                    task.priority === '高' ? 'bg-red-500' : 
                    task.priority === '中' ? 'bg-yellow-500' : 'bg-gray-300'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{task.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {task.project?.name} · {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '无截止日期'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {pendingTasks.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-500">
                暂无待办任务
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
