import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { reportAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '已提交': 'bg-yellow-100 text-yellow-700',
  '已通过': 'bg-green-100 text-green-700',
  '已驳回': 'bg-red-100 text-red-600',
};

const REPORT_TYPES = [
  { id: '日报', label: '日报', desc: '工作日 1-4（周一至周四）', icon: '📅', color: 'blue' },
  { id: '周报', label: '周报', desc: '工作日 5（周五）', icon: '📊', color: 'green' },
  { id: '月报', label: '月报', desc: '月末最后一天', icon: '📆', color: 'purple' },
];

// 判断当前应该填写哪种汇报
function getCurrentReportType(): string {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const dayOfWeek = now.getDay(); // 0=周日, 1=周一...5=周五, 6=周六
  
  // 月末判断（简单判断：下个月的第一天往前推1-3天）
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastDayOfMonth = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
  const isEndOfMonth = dayOfMonth >= lastDayOfMonth.getDate() - 2 && dayOfMonth <= lastDayOfMonth.getDate();
  
  if (isEndOfMonth) {
    return '月报';
  }
  
  // 周五判断
  if (dayOfWeek === 5) {
    return '周报';
  }
  
  // 工作日1-4判断
  if (dayOfWeek >= 1 && dayOfWeek <= 4) {
    return '日报';
  }
  
  return '日报'; // 默认
}

export default function Reports() {
  const { user } = useAppStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<string>(getCurrentReportType());
  const [filter, setFilter] = useState<'my' | 'all' | 'pending'>('my');
  const [reportList, setReportList] = useState<any[]>([]);
  
  useEffect(() => {
    loadReports();
  }, [activeType, filter]);
  
  const loadReports = async () => {
    setLoading(true);
    try {
      const params: any = { reportType: activeType, pageSize: 100 };
      if (filter === 'my') params.userId = user?.id;
      if (filter === 'pending') params.status = '已提交';
      
      const res = await reportAPI.list(params);
      setReportList(res.list || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // 计算当前月份
  const now = new Date();
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${d.getFullYear()}年${d.getMonth() + 1}月`
    });
  }
  
  // 按月份分组
  const groupedReports = reportList.reduce((acc: any, report) => {
    if (!acc[report.month]) acc[report.month] = [];
    acc[report.month].push(report);
    return acc;
  }, {});
  
  const handleNewReport = () => {
    navigate(`/reports/new?type=${activeType}`);
  };
  
  // 获取当前类型信息

  
  return (
    <div>
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-gray-900">汇报管理</h1>
        <button onClick={handleNewReport} className="btn btn-primary">
          + 填写{activeType}
        </button>
      </div>
      
      {/* 汇报类型切换 */}
      <div className="card p-4 mb-6">
        <div className="flex items-center space-x-3 overflow-x-auto">
          {REPORT_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => setActiveType(type.id)}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all min-w-max ${
                activeType === type.id 
                  ? type.color === 'blue' ? 'bg-blue-50 border-2 border-blue-300' :
                    type.color === 'green' ? 'bg-green-50 border-2 border-green-300' :
                    'bg-purple-50 border-2 border-purple-300'
                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
              }`}
            >
              <span className="text-2xl">{type.icon}</span>
              <div className="text-left">
                <div className="font-semibold text-gray-900">{type.label}</div>
                <div className="text-xs text-gray-500">{type.desc}</div>
              </div>
              {activeType === type.id && (
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                  type.color === 'blue' ? 'bg-blue-500 text-white' :
                    type.color === 'green' ? 'bg-green-500 text-white' :
                    'bg-purple-500 text-white'
                }`}>
                  当前
                </span>
              )}
            </button>
          ))}
          
          <div className="flex-1" />
          
          <button 
            onClick={loadReports} 
            className="btn btn-secondary"
          >
            刷新
          </button>
        </div>
      </div>
      
      {/* 筛选 */}
      <div className="card p-3 mb-6">
        <div className="flex items-center space-x-2">
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'my' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => setFilter('my')}
          >
            我的汇报
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => setFilter('all')}
          >
            全部汇报
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'pending' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => setFilter('pending')}
          >
            待审批
            {reportList.filter(r => r.status === '已提交').length > 0 && (
              <span className="ml-1.5 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {reportList.filter(r => r.status === '已提交').length}
              </span>
            )}
          </button>
        </div>
      </div>
      
      {/* 汇报列表 */}
      {loading ? (
        <div className="card p-12 text-center text-gray-500 animate-pulse">
          加载中...
        </div>
      ) : Object.keys(groupedReports).length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-4">📝</div>
          <div className="text-gray-500 mb-4">暂无{activeType}记录</div>
          <button onClick={handleNewReport} className="btn btn-primary">
            填写{activeType}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {months.map(month => {
            const monthReports = groupedReports[month.value] || [];
            if (monthReports.length === 0) return null;
            
            return (
              <div key={month.value}>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <span className={`w-2 h-6 rounded-full mr-2 ${
                    activeType === '日报' ? 'bg-blue-500' :
                      activeType === '周报' ? 'bg-green-500' :
                      'bg-purple-500'
                  }`} />
                  {month.label}
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    ({monthReports.length}份{activeType})
                  </span>
                </h2>
                <div className="space-y-3">
                  {monthReports.map(report => (
                    <Link
                      key={report.id}
                      to={`/reports/${report.id}`}
                      className="card card-hover p-5 block"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            activeType === '日报' ? 'bg-blue-100' :
                              activeType === '周报' ? 'bg-green-100' :
                              'bg-purple-100'
                          }`}>
                            <span className={`text-lg`}>
                              {activeType === '日报' ? '📅' : activeType === '周报' ? '📊' : '📆'}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900">
                              {report.project?.name || '未知项目'}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                              {report.user?.name} · {report.project?.code}
                              {(() => {
                                try {
                                  const content = JSON.parse(report.content);
                                  if (content.projectReports?.length > 0) {
                                    return <span className="ml-2 text-primary-500">({content.projectReports.length}个项目)</span>;
                                  }
                                  if (content.reagentReports?.length > 0) {
                                    return <span className="ml-2 text-purple-500">({content.reagentReports.length}个实验记录)</span>;
                                  }
                                } catch {}
                                return null;
                              })()}
                            </p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[report.status]}`}>
                          {report.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
