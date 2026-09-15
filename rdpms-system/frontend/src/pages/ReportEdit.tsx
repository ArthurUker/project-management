import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { reportAPI, projectAPI } from '@/api';
import { useAuth } from '../auth/useAuth';
import { useSync } from '../offline/SyncProvider';
import { newClientMutationId } from '../offline/engine';
import ReagentDailyReport from '../components/ReagentDailyReport';
import DocReference from '../components/DocReference';
import { periodKeyFor, reportTypeEnum } from '../shared/reportPeriod';
import { createOperationKeyStore, operationFingerprint } from '../shared/idempotency';

// 汇报类型配置
const REPORT_TYPES = [
  { id: '日报', label: '日报', desc: '工作日 1-4（周一至周四）' },
  { id: '周报', label: '周报', desc: '工作日 5（周五）' },
  { id: '月报', label: '月报', desc: '月末最后几天' },
];

// 后端枚举（DAILY/WEEKLY/MONTHLY）→ 前端中文 id（编辑回显用）
const REPORT_TYPE_ENUM_TO_CN: Record<string, string> = { DAILY: '日报', WEEKLY: '周报', MONTHLY: '月报' };

// 日报模板类型：通用 / 试剂组综合模板
type DailyTemplate = 'general' | 'reagent';

// 模板配置
const DAILY_TEMPLATES = [
  { id: 'general' as DailyTemplate, label: '通用日报', desc: '适合项目汇报、工作总结', icon: '📋' },
  { id: 'reagent' as DailyTemplate, label: '试剂组日报', desc: '综合模板（实验记录+工作汇总）', icon: '🧪' },
];

// 根据日期自动判断报告类型
function getReportTypeByDate(date: Date): string {
  const dayOfMonth = date.getDate();
  const dayOfWeek = date.getDay();
  
  // 获取本月最后一天
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const lastDayOfMonth = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000).getDate();
  
  // 月末判断（最后3天）
  const isEndOfMonth = dayOfMonth >= lastDayOfMonth - 2;
  
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
  
  return '日报';
}

/** 把接口错误转成可读文案（逐项目反馈用） */
function describeError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; code?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || '未知错误';
}

// 单个项目汇报数据
interface DocRef {
  id: string;
  code: string;
  title: string;
  docType: string;
  version: string;
  category?: { name: string };
}

interface ProjectReport {
  projectId: string;
  plan: string;
  completed: string;
  nextPlan: string;
  docRefs: DocRef[];
}

export default function ReportEdit() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  
  // 汇报类型（默认根据当前日期判断）
  const [reportType, setReportType] = useState(() => {
    const typeFromUrl = searchParams.get('type');
    return typeFromUrl || getReportTypeByDate(new Date());
  });
  
  // 汇报月份
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // 试剂组日报实际日期（完整 YYYY-MM-DD）
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // 项目汇报列表
  const [projectReports, setProjectReports] = useState<ProjectReport[]>([]);
  
  // 日报模板类型：通用 / 试剂组综合模板
  const [dailyTemplate, setDailyTemplate] = useState<DailyTemplate>('general');
  
  // 试剂组日报数据
  const [reagentReports, setReagentReports] = useState<any[]>([]);

  // 内容不可解析时的错误（RF03/F04：必须显式提示，禁止把空表当原文保存）
  const [contentError, setContentError] = useState<string | null>(null);

  // 并发基线（RF04）：编辑时读到的 updatedAt，随保存提交做原子版本校验
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);

  // 幂等键按「一次逻辑操作」生成：重试复用，内容变化或用户再次发起则换新（RF02 复核）
  const opKeysRef = useRef(createOperationKeyStore());
  
  useEffect(() => {
    loadData();
  }, [id]);
  
  const loadData = async () => {
    setLoading(true);
    try {
      // 获取项目列表
      const projectsRes = await projectAPI.list({ pageSize: 100 });
      const projectList = projectsRes.items || [];
      setProjects(projectList);
      
      if (id && id !== 'new') {
        // 编辑现有汇报（content 已由接口适配器归一化为对象，见 api/adapters/report.ts）
        const reportData = await reportAPI.get(id);
        const rtRaw = reportData.reportType as string | undefined;
        setReportType(rtRaw ? (REPORT_TYPE_ENUM_TO_CN[rtRaw] ?? rtRaw) : '日报');

        // 周期键：DAILY 为完整日期，用作日期回填；WEEKLY/MONTHLY 用月份回填
        const key = reportData.periodKey || '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          setDate(key);
          setMonth(key.slice(0, 7));
        } else if (/^\d{4}-\d{2}$/.test(key)) {
          setMonth(key);
        }

        setLoadedUpdatedAt(typeof reportData.updatedAt === 'string' ? reportData.updatedAt : null);

        if (reportData.contentReadError) {
          // 解析失败必须显式告警，且禁止把空表当成原文保存（F04）
          setContentError(`${reportData.contentReadError}；为避免覆盖服务端原文，请勿直接保存`);
          setProjectReports([]);
          setReagentReports([]);
          return;
        }

        const content = reportData.content;
        setProjectReports((content.projectReports as any[]) || []);
        const normalizedReagentReports = ((content.reagentReports as any[]) || []).map((r: any) => {
          if (r?.projectId) return r;
          if (r?.projectName) {
            const matched = projectList.find((p: any) => p.name === r.projectName);
            if (matched) return { ...r, projectId: matched.id };
          }
          return { ...r, projectId: r?.projectId || '' };
        });
        setReagentReports(normalizedReagentReports);
        // 根据内容类型自动识别模板
        if (content.reagentReports) {
          setDailyTemplate('reagent');
          const firstDate = (content.reagentReports as any[])?.[0]?.date;
          if (firstDate) setDate(firstDate);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddProject = (projectId: string) => {
    if (!projectId || projectReports.some(r => r.projectId === projectId)) return;
    setProjectReports([...projectReports, {
      projectId,
      plan: '',
      completed: '',
      nextPlan: '',
      docRefs: []
    }]);
    setShowAddProject(false);
  };
  
  const handleRemoveProject = (index: number) => {
    setProjectReports(projectReports.filter((_, i) => i !== index));
  };
  
  const handleUpdateProject = (index: number, field: keyof ProjectReport, value: string) => {
    const updated = [...projectReports];
    updated[index] = { ...updated[index], [field]: value };
    setProjectReports(updated);
  };

  const handleUpdateDocRefs = (index: number, docRefs: DocRef[]) => {
    const updated = [...projectReports];
    updated[index] = { ...updated[index], docRefs };
    setProjectReports(updated);
  };
  
  // 离线同步 v2：草稿可离线保存（写入本地变更日志），提交/新建需联网
  const { online, enqueueChange } = useSync();

  /**
   * 保存 / 提交（RF03）：
   *   - 保存草稿：只写内容与周期键，**不携带 status**；
   *   - 提交：先保存成功，再调用服务端提交命令（写版本与状态）。
   * 多项目时逐条保存并逐条报告结果，避免 Promise.all 部分成功却显示整体失败。
   */
  const handleSave = async (asDraft: boolean = true) => {
    if (contentError) {
      alert(contentError);
      return;
    }
    // 验证
    if (dailyTemplate === 'general' && projectReports.length === 0) {
      alert('请至少添加一个项目');
      return;
    }
    if (dailyTemplate === 'reagent' && reagentReports.length === 0) {
      alert('请至少添加一个实验记录');
      return;
    }
    const typeEnum = reportTypeEnum(reportType);
    if (!typeEnum) {
      alert('汇报类型无法识别，请重新选择');
      return;
    }
    const periodKey = periodKeyFor(typeEnum, { date, month });
    if (!periodKey) {
      alert(typeEnum === 'DAILY' ? '请选择日报日期（必须精确到某一天）' : '请选择汇报月份');
      return;
    }
    if (!online && !asDraft) {
      alert('离线状态暂不支持提交审批，请先保存草稿；联网后再提交。');
      return;
    }
    if (!online && (!id || id === 'new')) {
      alert('离线状态暂不支持新建汇报，请联网后再试。');
      return;
    }

    setSaving(true);
    const opKeys = opKeysRef.current;
    try {
      const content: any = dailyTemplate === 'general' ? { projectReports } : { reagentReports };
      const saved: { id: string; label: string }[] = [];
      const failures: string[] = [];

      if (id && id !== 'new') {
        // 编辑已有汇报
        if (!online) {
          // 离线：仅内容进变更日志（status 为服务端权威字段）
          await enqueueChange({
            clientMutationId: newClientMutationId(),
            entity: 'reports',
            op: 'upsert',
            id: id as string,
            data: { content },
          });
          saved.push({ id: id as string, label: '当前汇报' });
        } else {
          try {
            const updated = await reportAPI.update(id as string, {
              content,
              reportType: typeEnum,
              periodKey,
              ...(loadedUpdatedAt ? { expectedUpdatedAt: loadedUpdatedAt } : {}),
              // 同一次逻辑操作复用同一 key：失败重试由服务端回放，不会重复写入（RF02）
              clientMutationId: opKeys.keyFor(
                operationFingerprint({ op: 'report.update', reportId: id, reportType: typeEnum, periodKey, content }),
                String(id),
              ),
            });
            saved.push({ id: updated.id, label: '当前汇报' });
          } catch (err) {
            failures.push(`当前汇报：${describeError(err)}`);
          }
        }
      } else {
        // 新建：按项目逐条保存（后端以 项目+作者+类型+周期 为唯一键）
        const items: { projectId: string; content: any; label: string }[] = [];
        if (dailyTemplate === 'general') {
          for (const r of projectReports) {
            items.push({
              projectId: r.projectId,
              content: { projectReports: [r] },
              label: projects.find((p) => p.id === r.projectId)?.name || r.projectId,
            });
          }
        } else {
          const reportsByProject: Record<string, any[]> = {};
          for (const r of reagentReports) {
            const pid = r.projectId || 'NO_PROJECT';
            if (!reportsByProject[pid]) reportsByProject[pid] = [];
            reportsByProject[pid].push(r);
          }
          const entries = Object.entries(reportsByProject);
          if (entries.length === 1 && entries[0][0] === 'NO_PROJECT') {
            alert('请为试验记录关联项目后再提交');
            setSaving(false);
            return;
          }
          for (const [pid, arr] of entries) {
            if (pid === 'NO_PROJECT') continue;
            items.push({
              projectId: pid,
              content: { reagentReports: arr },
              label: projects.find((p) => p.id === pid)?.name || pid,
            });
          }
        }

        for (const item of items) {
          try {
            const created = await reportAPI.save({
              projectId: item.projectId,
              reportType: typeEnum,
              periodKey,
              content: item.content,
              // 逐项目一个 key（slot 区分）：部分失败后重试复用同一 key，不重复建/覆盖（RF02/RF04）
              clientMutationId: opKeys.keyFor(
                operationFingerprint({
                  op: 'report.save', reportType: typeEnum, periodKey, content: item.content,
                }),
                item.projectId,
              ),
            });
            saved.push({ id: created.id, label: item.label });
          } catch (err) {
            failures.push(`${item.label}：${describeError(err)}`);
          }
        }
      }

      // 提交：只提交保存成功的汇报；服务端负责写版本与状态
      if (!asDraft) {
        for (const item of saved) {
          try {
            // 提交同样按操作复用 key：重试命中已提交回执，不会重复写版本
            await reportAPI.submit(
              item.id,
              opKeys.keyFor(operationFingerprint({ op: 'report.submit', reportId: item.id }), item.id),
            );
          } catch (err) {
            failures.push(`${item.label}（提交）：${describeError(err)}`);
          }
        }
      }

      if (failures.length > 0) {
        alert(`部分操作未成功：\n${failures.join('\n')}\n已成功的部分已保留，可重试。`);
        // 保留键位：用户重试失败项时复用同一 key，服务端回放已成功的部分
        return;
      }
      // 操作成功结束 → 清空键位：用户再次主动发起（即使内容相同）也视为新操作
      opKeysRef.current.complete();
      navigate('/reports');
    } catch (err) {
      console.error('Failed to save:', err);
      alert(`保存失败：${describeError(err)}`);
    } finally {
      setSaving(false);
    }
  };
  
  // 当月份变化时，自动判断报告类型
  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    // 根据选择的月份自动判断类型
    if (newMonth) {
      const [year, monthStr] = newMonth.split('-');
      const date = new Date(parseInt(year), parseInt(monthStr) - 1, 1);
      setReportType(getReportTypeByDate(date));
    }
  };
  
  // 可添加的项目列表（排除已添加的）
  const availableProjects = projects.filter(p => 
    !projectReports.some(r => r.projectId === p.id)
  );
  
  // 获取当前类型信息
  const currentTypeInfo = REPORT_TYPES.find(t => t.id === reportType) || REPORT_TYPES[0];
  
  if (loading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>;
  }
  
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {/* 返回 */}
      <Link to="/reports" className="inline-flex items-center text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回汇报列表
      </Link>
      
      <div className="card">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-display font-bold text-gray-900">
              {id === 'new' ? `填写${reportType}` : `编辑${reportType}`}
            </h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              reportType === '日报' ? 'bg-blue-100 text-blue-700' :
                reportType === '周报' ? 'bg-green-100 text-green-700' :
                'bg-purple-100 text-purple-700'
            }`}>
              {currentTypeInfo.desc}
            </span>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {contentError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {contentError}
            </div>
          )}

          {/* 类型选择 */}
          <div>
            <label className="label">汇报类型</label>
            <div className="flex items-center space-x-3">
              {REPORT_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => setReportType(type.id)}
                  disabled={id !== 'new'}
                  className={`px-4 py-2 rounded-lg border-2 transition-all ${
                    reportType === type.id
                      ? type.id === '日报' ? 'border-blue-400 bg-blue-50' :
                        type.id === '周报' ? 'border-green-400 bg-green-50' :
                        'border-purple-400 bg-purple-50'
                      : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                  } ${id !== 'new' ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* 日报模板选择（仅日报时显示） */}
          {reportType === '日报' && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
              <label className="label flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7m-7 0l4 4m0 0l4-4m-4 4V6" />
                </svg>
                选择日报模板
              </label>
              <div className="grid grid-cols-2 gap-3 mt-2 max-w-xl">
                {DAILY_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => setDailyTemplate(tpl.id)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      dailyTemplate === tpl.id
                        ? 'border-blue-400 bg-white shadow-md ring-2 ring-blue-200'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{tpl.icon}</span>
                      <div>
                        <div className="font-medium text-gray-800">{tpl.label}</div>
                        <div className="text-xs text-gray-500">{tpl.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {/* 模板说明 */}
              <div className="mt-3 p-3 bg-white/50 rounded-lg text-sm text-gray-600">
                {dailyTemplate === 'general' && '适用于多项目通用的日报格式，按项目维度汇报工作进展。'}
                {dailyTemplate === 'reagent' && '试剂组综合模板，整合详细实验记录与工作汇总，包含：基础信息、实验记录（样本/试剂/步骤/参数）、配方工作、产出交接、异常评估、明日计划等功能。'}
              </div>
            </div>
          )}
          
          {/* 月份和日期选择 */}
          <div className="flex items-center space-x-4">
            <div>
              <label className="label">{reportType === '日报' ? '月份' : '汇报月份'}</label>
              <input
                type="month"
                className="input w-48"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
              />
            </div>
            
            {reportType === '日报' && (
              <div>
                <label className="label">日期</label>
                <input
                  type="date"
                  className="input w-40"
                  value={date}
                  onChange={(e) => {
                    const d = new Date(e.target.value);
                    setDate(e.target.value);
                    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                  }}
                />
              </div>
            )}
            
            <div className="flex-1">
              <label className="label">汇报人</label>
              <div className="input bg-gray-50">{user?.name || '-'}</div>
            </div>
          </div>
          
          {/* 已添加的项目列表 */}
          {reportType === '日报' && dailyTemplate === 'reagent' ? (
            // 试剂组综合模板
            <ReagentDailyReport 
              date={date}
              projects={projects}
              value={reagentReports}
              onChange={setReagentReports}
            />
          ) : projectReports.length > 0 ? (
            // 通用日报/周报/月报模板
            <div className="space-y-6">
              {projectReports.map((report, index) => {
                const project = projects.find(p => p.id === report.projectId);
                return (
                  <div key={report.projectId} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                    {/* 项目标题栏 */}
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                      <div className="flex items-center">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mr-3 ${
                          reportType === '日报' ? 'bg-blue-500 text-white' :
                            reportType === '周报' ? 'bg-green-500 text-white' :
                            'bg-purple-500 text-white'
                        }`}>
                          {index + 1}
                        </span>
                        <div>
                          <h3 className="font-semibold text-gray-900">{project?.name || '未知项目'}</h3>
                          <span className="text-sm text-gray-500">{project?.code}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveProject(index)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="移除项目"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* 项目详情表单 */}
                    <div className="space-y-4 pl-10">
                      <div>
                        <label className="label">{
                          reportType === '日报' ? '今日计划' :
                          reportType === '周报' ? '本周计划' : '本月计划'
                        }</label>
                        <textarea
                          className="input h-20"
                          placeholder={
                            reportType === '日报' ? '描述今日计划完成的工作...' :
                            reportType === '周报' ? '描述本周计划完成的工作...' : '描述本月计划完成的工作...'
                          }
                          value={report.plan}
                          onChange={(e) => handleUpdateProject(index, 'plan', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label">{
                          reportType === '日报' ? '今日完成情况' :
                          reportType === '周报' ? '本周完成情况' : '本月完成情况'
                        }</label>
                        <textarea
                          className="input h-20"
                          placeholder={
                            reportType === '日报' ? '描述今日实际完成的工作...' :
                            reportType === '周报' ? '描述本周实际完成的工作...' : '描述本月实际完成的工作...'
                          }
                          value={report.completed}
                          onChange={(e) => handleUpdateProject(index, 'completed', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label">{
                          reportType === '日报' ? '明日计划' :
                          reportType === '周报' ? '下周计划' : '下月计划'
                        }</label>
                        <textarea
                          className="input h-20"
                          placeholder={
                            reportType === '日报' ? '描述明日工作计划...' :
                            reportType === '周报' ? '描述下周工作计划...' : '描述下月工作计划...'
                          }
                          value={report.nextPlan}
                          onChange={(e) => handleUpdateProject(index, 'nextPlan', e.target.value)}
                        />
                      </div>

                      {/* 文档引用 */}
                      <div>
                        <label className="label flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          引用文档
                        </label>
                        <DocReference
                          value={report.docRefs || []}
                          onChange={(refs) => handleUpdateDocRefs(index, refs)}
                          placeholder="搜索 SOP、模板、指南..."
                          maxItems={5}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>暂无项目汇报</p>
              <p className="text-sm">请点击下方按钮添加项目</p>
            </div>
          )}
          
          {/* 添加项目区域（通用模板 - 非日报或日报但选择通用模板） */}
          {(reportType !== '日报' || dailyTemplate === 'general') && dailyTemplate !== 'reagent' ? (
            showAddProject ? (
              <div className={`border-2 rounded-lg p-4 ${
                reportType === '日报' ? 'border-blue-200 bg-blue-50/30' :
                  reportType === '周报' ? 'border-green-200 bg-green-50/30' :
                  'border-purple-200 bg-purple-50/30'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-700">选择要添加的项目</span>
                  <button
                    onClick={() => setShowAddProject(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {availableProjects.length > 0 ? (
                    availableProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleAddProject(p.id)}
                        className="text-left p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-white transition-colors"
                      >
                        <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.code}</div>
                      </button>
                    ))
                  ) : (
                    <div className="col-span-2 text-center py-4 text-gray-500 text-sm">
                      所有项目已添加完毕
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddProject(true)}
                className={`w-full py-4 border-2 border-dashed rounded-lg transition-colors flex items-center justify-center space-x-2 ${
                  reportType === '日报' ? 'border-blue-300 text-blue-600 hover:border-blue-400 hover:bg-blue-50' :
                    reportType === '周报' ? 'border-green-300 text-green-600 hover:border-green-400 hover:bg-green-50' :
                    'border-purple-300 text-purple-600 hover:border-purple-400 hover:bg-purple-50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>添加项目</span>
              </button>
            )
          ) : null}
        </div>
        
        {/* 操作按钮 */}
        <div className="p-6 border-t border-gray-100 flex items-center justify-end space-x-3">
          <button
            onClick={() => navigate('/reports')}
            className="btn btn-secondary"
          >
            取消
          </button>
          {id && id !== 'new' && (
            <button
              onClick={async () => {
                if (!window.confirm('确认删除该草稿？')) return;
                try {
                  await reportAPI.remove(id as string);
                  navigate('/reports');
                } catch (err) {
                  console.error('删除失败', err);
                  alert('删除失败，请重试');
                }
              }}
              className="text-red-500 border border-red-300 px-4 py-2 rounded hover:bg-red-50"
            >
              删除草稿
            </button>
          )}
          <button
            onClick={() => handleSave(true)}
            className="btn btn-secondary"
            disabled={saving}
          >
            保存草稿
          </button>
          <button
            onClick={() => handleSave(false)}
            className={`btn ${reportType === '日报' ? 'btn-primary' : reportType === '周报' ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'}`}
            disabled={saving || 
              (dailyTemplate === 'general' ? projectReports.length === 0 : reagentReports.length === 0)}
          >
            {saving ? '提交中...' : `提交${reportType}`}
          </button>
        </div>
      </div>
    </div>
  );
}
