import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { registrationsAPI, userAPI } from '../api/client';
import { useHasPerm, PERMS } from '../utils/permissions';
import HierarchicalTaskList from '../components/HierarchicalTaskList';

const STAGES = ['资料准备', '送检受理', '技术审评', '行政审批', '取证归档'];

function getStageIndex(stage: string) {
  return STAGES.indexOf(stage);
}

function formatDate(dateText?: string | null) {
  if (!dateText) return '-';
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

export default function RegistrationProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useHasPerm(PERMS.REGISTRATIONS_EDIT);
  const canApprove = useHasPerm(PERMS.REGISTRATIONS_APPROVE);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [project, setProject] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'tasks' | 'timeline'>('profile');
  const [nextStage, setNextStage] = useState('');

  const [form, setForm] = useState({
    name: '',
    status: '规划中',
    registrationType: 'IVD',
    region: '',
    authority: '',
    submissionNo: '',
    certificateNo: '',
    currentStage: '资料准备',
    plannedSubmissionDate: '',
    expectedApprovalDate: '',
    complianceOwnerId: '',
    riskLevel: '中',
    notes: '',
  });

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detailRes, usersRes] = await Promise.all([
        registrationsAPI.get(id),
        userAPI.list(),
      ]);

      const detail = (detailRes as any).data || detailRes;
      const userList = (usersRes as any).users || (usersRes as any).list || (usersRes as any).data || [];

      setProject(detail);
      setUsers(Array.isArray(userList) ? userList : []);

      const stage = detail.registrationProfile?.currentStage || '资料准备';
      const allowed = (detail.allowedStageTransitions || []) as string[];
      setNextStage(allowed[0] || stage);

      setForm({
        name: detail.name || '',
        status: detail.status || '规划中',
        registrationType: detail.registrationProfile?.registrationType || detail.subtype || 'IVD',
        region: detail.registrationProfile?.region || '',
        authority: detail.registrationProfile?.authority || '',
        submissionNo: detail.registrationProfile?.submissionNo || '',
        certificateNo: detail.registrationProfile?.certificateNo || '',
        currentStage: stage,
        plannedSubmissionDate: detail.registrationProfile?.plannedSubmissionDate
          ? String(detail.registrationProfile.plannedSubmissionDate).slice(0, 10)
          : '',
        expectedApprovalDate: detail.registrationProfile?.expectedApprovalDate
          ? String(detail.registrationProfile.expectedApprovalDate).slice(0, 10)
          : '',
        complianceOwnerId: detail.registrationProfile?.complianceOwnerId || '',
        riskLevel: detail.registrationProfile?.riskLevel || '中',
        notes: detail.registrationProfile?.notes || '',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const currentStageIndex = useMemo(() => getStageIndex(form.currentStage), [form.currentStage]);
  const dueDays = project?.due?.daysLeft;

  const dueText = useMemo(() => {
    if (dueDays == null) return '未设置预计取证日';
    if (dueDays < 0) return `已超期 ${Math.abs(dueDays)} 天`;
    if (dueDays === 0) return '今日到期';
    return `剩余 ${dueDays} 天`;
  }, [dueDays]);

  const onSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await registrationsAPI.update(id, {
        name: form.name,
        status: form.status,
        registrationType: form.registrationType,
        subtype: form.registrationType,
        region: form.region,
        authority: form.authority,
        submissionNo: form.submissionNo,
        certificateNo: form.certificateNo,
        currentStage: form.currentStage,
        plannedSubmissionDate: form.plannedSubmissionDate || null,
        expectedApprovalDate: form.expectedApprovalDate || null,
        complianceOwnerId: form.complianceOwnerId || null,
        riskLevel: form.riskLevel,
        notes: form.notes,
      });
      await loadData();
      alert('保存成功');
    } catch (e: any) {
      alert(e?.error || e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleStageTransition = async () => {
    if (!id || !nextStage) return;
    setTransitioning(true);
    try {
      await registrationsAPI.updateStage(id, nextStage);
      await loadData();
      alert('阶段推进成功');
    } catch (e: any) {
      alert(e?.error || e?.message || '阶段推进失败');
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return <div className="text-gray-500">加载中...</div>;
  }

  if (!project) {
    return <div className="text-gray-500">注册项目不存在</div>;
  }

  const allowedTransitions = (project.allowedStageTransitions || []) as string[];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pb-2">
      <Link to="/registrations" className="inline-flex items-center text-gray-500 hover:text-gray-700 mb-4">
        返回注册项目列表
      </Link>

      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{project.code}</p>
          </div>
          <div className="text-sm text-gray-500 text-right">
            <p>负责人：{project.manager?.name || '-'}</p>
            <p className="mt-1">阶段：{form.currentStage}</p>
            <p className="mt-1">时限：{dueText}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-2">
          {STAGES.map((stage, idx) => {
            const isDone = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            return (
              <div
                key={stage}
                className={`rounded-lg px-3 py-2 border text-xs ${isCurrent ? 'border-primary-300 bg-primary-50 text-primary-700' : isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}
              >
                <p>{idx + 1}. {stage}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <select
            value={nextStage}
            disabled={!canEdit || (allowedTransitions.length === 0 && !canApprove)}
            onChange={(e) => setNextStage(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            {allowedTransitions.length === 0 && !canApprove ? (
              <option value="">当前无可推进阶段</option>
            ) : (
              (canApprove ? STAGES : allowedTransitions).map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))
            )}
          </select>
          {canEdit && (
            <button
              className="btn btn-primary"
              disabled={transitioning || !nextStage || nextStage === form.currentStage}
              onClick={handleStageTransition}
            >
              {transitioning ? '推进中...' : '推进阶段'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'profile' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          注册档案
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'tasks' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          任务清单
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'timeline' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          里程碑
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">注册档案</h2>
              {canEdit && (
                <button className="btn btn-primary" disabled={saving} onClick={onSave}>
                  {saving ? '保存中...' : '保存'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">项目名称</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.name} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">项目状态</label>
                <select className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.status} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="规划中">规划中</option>
                  <option value="进行中">进行中</option>
                  <option value="待加工">待加工</option>
                  <option value="待验证">待验证</option>
                  <option value="已完成">已完成</option>
                  <option value="已归档">已归档</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">注册类型</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.registrationType} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, registrationType: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">当前阶段</label>
                <select className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.currentStage} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, currentStage: e.target.value }))}>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">风险等级</label>
                <select className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.riskLevel} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, riskLevel: e.target.value }))}>
                  <option value="高">高</option>
                  <option value="中">中</option>
                  <option value="低">低</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">地区</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.region} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">受理机构</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.authority} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, authority: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">受理号</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.submissionNo} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, submissionNo: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">注册证号</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.certificateNo} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, certificateNo: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">计划申报日</label>
                <input type="date" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.plannedSubmissionDate} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, plannedSubmissionDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">预计取证日</label>
                <input type="date" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.expectedApprovalDate} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, expectedApprovalDate: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">合规负责人</label>
                <select className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.complianceOwnerId} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, complianceOwnerId: e.target.value }))}>
                  <option value="">未指定</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">备注</label>
                <textarea className="mt-1 w-full min-h-24 px-3 py-2 border border-gray-200 rounded-lg" value={form.notes} disabled={!canEdit} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">关键信息</h2>
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-gray-400">模板</p>
                <p className="text-gray-700 mt-1">{project.template?.name || '-'}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-gray-400">创建时间</p>
                <p className="text-gray-700 mt-1">{formatDate(project.createdAt)}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-gray-400">预计取证日</p>
                <p className="text-gray-700 mt-1">{formatDate(project.registrationProfile?.expectedApprovalDate)}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-gray-400">风险等级</p>
                <p className="text-gray-700 mt-1">{form.riskLevel}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">任务清单（法规驱动·层级化）</h2>
          <HierarchicalTaskList tasks={project.tasks || []} />
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">里程碑时间线</h2>
          <div className="space-y-3">
            {(project.milestones || []).map((m: any) => (
              <div key={m.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary-500 mt-2" />
                <div className="flex-1 border border-gray-100 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-800">{m.name}</p>
                  <p className="text-xs text-gray-500 mt-1">计划日期：{formatDate(m.date)} · 状态：{m.status}</p>
                </div>
              </div>
            ))}
            {(!project.milestones || project.milestones.length === 0) && (
              <p className="text-sm text-gray-500">暂无里程碑，可通过模板生成。</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
