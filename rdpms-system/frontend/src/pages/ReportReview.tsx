import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { reportAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-600',
  '已提交': 'bg-yellow-100 text-yellow-700',
  'submitted': 'bg-yellow-100 text-yellow-700',
  '已通过': 'bg-green-100 text-green-700',
  '已驳回': 'bg-red-100 text-red-600',
};

const submittedStatuses = ['已提交', 'submitted'];

function safeParseContent(content: string) {
  try {
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

function getPlanLabel(reportType?: string) {
  if (reportType === '周报') return '本周计划';
  if (reportType === '月报') return '本月计划';
  return '今日计划';
}

function getCompletedLabel(reportType?: string) {
  if (reportType === '周报') return '本周完成';
  if (reportType === '月报') return '本月完成';
  return '今日完成';
}

function getNextPlanLabel(reportType?: string) {
  if (reportType === '周报') return '下周计划';
  if (reportType === '月报') return '下月计划';
  return '明日计划';
}

export default function ReportReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  const isReviewer = user?.role === 'admin' || user?.role === 'manager';
  const canApprove = useMemo(() => {
    if (!report || !isReviewer) return false;
    return submittedStatuses.includes(report.status) && report.userId !== user?.id;
  }, [report, isReviewer, user?.id]);

  useEffect(() => {
    if (!id) return;
    loadReport(id);
  }, [id]);

  const loadReport = async (reportId: string) => {
    setLoading(true);
    try {
      const data = await reportAPI.get(reportId);
      setReport(data);
      setReviewNote(data?.approveNote || '');
    } catch (err) {
      console.error('Failed to load report:', err);
      alert('加载汇报失败');
      navigate('/reports');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!id || !canApprove) return;
    setSubmitting(true);
    try {
      await reportAPI.approve(id, reviewNote.trim() || undefined);
      await loadReport(id);
      alert('审批通过成功');
    } catch (err: any) {
      console.error('Approve failed:', err);
      alert(err?.error || err?.message || '审批失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!id || !canApprove) return;
    const note = reviewNote.trim();
    if (!note) {
      alert('驳回时请填写修改意见');
      return;
    }

    setSubmitting(true);
    try {
      await reportAPI.reject(id, note);
      await loadReport(id);
      alert('已驳回并返回修改意见');
    } catch (err: any) {
      console.error('Reject failed:', err);
      alert(err?.error || err?.message || '驳回失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>;
  }

  if (!report) {
    return <div className="text-center py-12 text-gray-500">汇报不存在</div>;
  }

  const content = safeParseContent(report.content);
  const projectReports = Array.isArray(content.projectReports) ? content.projectReports : [];
  const reagentReports = Array.isArray(content.reagentReports) ? content.reagentReports : [];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="flex items-center justify-between mb-4">
        <Link to="/reports" className="inline-flex items-center text-gray-500 hover:text-gray-700">
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回汇报列表
        </Link>

        <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[report.status] || 'bg-gray-100 text-gray-600'}`}>
          {report.status}
        </span>
      </div>

      <div className="card">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-display font-bold text-gray-900">{report.reportType}审批查看</h1>
          <p className="text-sm text-gray-500 mt-2">系统整理展示版（只读），用于管理员审批。</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">汇报人</div>
              <div className="text-gray-900 font-medium mt-1">{report.user?.name || '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">项目</div>
              <div className="text-gray-900 font-medium mt-1">{report.project?.name || '-'} {report.project?.code ? `· ${report.project.code}` : ''}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">汇报月份</div>
              <div className="text-gray-900 font-medium mt-1">{report.month || '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">提交时间</div>
              <div className="text-gray-900 font-medium mt-1">{report.submittedAt ? new Date(report.submittedAt).toLocaleString() : '-'}</div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {projectReports.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">项目汇报内容</h2>
              {projectReports.map((item: any, index: number) => (
                <div key={item.projectId || index} className="border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="font-medium text-gray-900 mb-3">项目 {index + 1}</div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{getPlanLabel(report.reportType)}</div>
                      <div className="bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-800">{item.plan || '未填写'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{getCompletedLabel(report.reportType)}</div>
                      <div className="bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-800">{item.completed || '未填写'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{getNextPlanLabel(report.reportType)}</div>
                      <div className="bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-800">{item.nextPlan || '未填写'}</div>
                    </div>
                    {Array.isArray(item.docRefs) && item.docRefs.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">引用文档</div>
                        <div className="flex flex-wrap gap-2">
                          {item.docRefs.map((doc: any) => (
                            <span key={doc.id || `${doc.code}-${doc.title}`} className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {doc.code || 'DOC'} {doc.title ? `· ${doc.title}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {reagentReports.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">试剂组日报内容</h2>
              {reagentReports.map((item: any, index: number) => {
                const experiments = Array.isArray(item.experiments) ? item.experiments : [];
                const experimentTypes = Array.isArray(item.experimentTypes) ? item.experimentTypes : [];
                return (
                  <div key={item.id || index} className="border border-gray-200 rounded-lg p-4 bg-white space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900">记录 {index + 1} · {item.projectName || report.project?.name || '未关联项目'}</div>
                        <div className="text-sm text-gray-500 mt-1">填报人：{item.fillPerson || report.user?.name || '-'} · 日期：{item.date || '-'}</div>
                      </div>
                      <span className="px-2 py-1 text-xs rounded bg-purple-50 text-purple-700 border border-purple-200">
                        实验总数：{item.totalExperiments || experiments.length || 0}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="bg-gray-50 rounded p-3">
                        <div className="text-gray-500">实验地点</div>
                        <div className="text-gray-900 mt-1">{item.experimentLocation || '-'}</div>
                      </div>
                      <div className="bg-gray-50 rounded p-3">
                        <div className="text-gray-500">SOP/数据路径</div>
                        <div className="text-gray-900 mt-1 break-all">{item.relatedSop || item.dataPath || '-'}</div>
                      </div>
                      <div className="bg-gray-50 rounded p-3">
                        <div className="text-gray-500">计划完成度</div>
                        <div className="text-gray-900 mt-1">{item.completedAsPlanned || '-'}</div>
                      </div>
                    </div>

                    {experimentTypes.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-2">涉及实验类型</div>
                        <div className="flex flex-wrap gap-2">
                          {experimentTypes.map((tag: string) => (
                            <span key={tag} className="px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 border border-indigo-200">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-gray-500 mb-1">主要工作内容</div>
                      <div className="bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-800">{item.mainContent || '未填写'}</div>
                    </div>

                    {experiments.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-500">实验明细</div>
                        {experiments.map((exp: any) => {
                          const samples = Array.isArray(exp.samples) ? exp.samples : [];
                          return (
                            <div key={exp.id || exp.experimentNo || Math.random()} className="border border-gray-200 rounded p-3 bg-gray-50">
                              <div className="font-medium text-gray-900">{exp.experimentNo || '-'} {exp.experimentTitle ? `· ${exp.experimentTitle}` : ''}</div>
                              <div className="text-sm text-gray-600 mt-1">
                                类型：{exp.experimentType || '-'} · 人员：{exp.personnel || '-'} · 时间：{exp.startTime || '-'} - {exp.endTime || '-'}
                              </div>
                              {samples.length > 0 && (
                                <div className="text-sm text-gray-600 mt-1">
                                  样本：{samples.map((s: any) => s.name).filter(Boolean).join('、') || '-'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {(item.uncompletedReason || item.issueDescription || item.tomorrowPlan || item.supportNeeded) && (
                      <div className="grid grid-cols-1 gap-3">
                        {item.uncompletedReason && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">未按计划完成原因</div>
                            <div className="bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-800">{item.uncompletedReason}</div>
                          </div>
                        )}
                        {item.issueDescription && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">问题与风险</div>
                            <div className="bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-800">{item.issueDescription}</div>
                          </div>
                        )}
                        {item.supportNeeded && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">需要支持</div>
                            <div className="bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-800">{item.supportNeeded}</div>
                          </div>
                        )}
                        {item.tomorrowPlan && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">明日计划</div>
                            <div className="bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-800">{item.tomorrowPlan}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {projectReports.length === 0 && reagentReports.length === 0 && (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">该汇报暂无可展示内容。</div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <h2 className="text-base font-semibold text-gray-900 mb-2">审批意见</h2>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder={canApprove ? '可填写审批通过意见或驳回修改意见' : '暂无审批意见'}
              disabled={!canApprove || submitting}
              className={`input h-24 ${!canApprove ? 'bg-gray-50 text-gray-500' : ''}`}
            />

            {report.approveNote && !canApprove && (
              <p className="text-sm text-gray-500 mt-2">当前意见：{report.approveNote}</p>
            )}

            {canApprove && (
              <div className="flex items-center gap-3 mt-4">
                <button
                  className="btn bg-green-500 hover:bg-green-600 text-white"
                  onClick={handleApprove}
                  disabled={submitting}
                >
                  {submitting ? '处理中...' : '审批通过'}
                </button>
                <button
                  className="btn bg-red-500 hover:bg-red-600 text-white"
                  onClick={handleReject}
                  disabled={submitting}
                >
                  {submitting ? '处理中...' : '驳回并返回意见'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
