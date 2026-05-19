import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectAPI, projectTemplatesAPI, userAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

const PROJECT_TYPES = ['platform', '定制', '合作', '测试', '应用', '科技项目'];
const CATEGORY_LABELS: Record<string, string> = {
  reagent_chip: '试剂/芯片开发',
  device: '设备开发',
};
const CATEGORY_COLORS: Record<string, string> = {
  reagent_chip: 'bg-blue-100 text-blue-700',
  device: 'bg-purple-100 text-purple-700',
};

interface Props {
  onClose: () => void;
}

export default function CreateProjectModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [step, setStep] = useState(1);

  // Step 1 form state
  const [name, setName] = useState('');
  const [type, setType] = useState('定制');
  const [position, setPosition] = useState('');
  const [managerId, setManagerId] = useState(user?.id || '');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  // Step 2 state
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null); // null = blank
  const [blankSelected, setBlankSelected] = useState(false);
  const [tmplKeyword, setTmplKeyword] = useState('');
  const [tmplCategory, setTmplCategory] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [plannedTasks, setPlannedTasks] = useState<any[]>([]);
  const [plannedMilestones, setPlannedMilestones] = useState<any[]>([]);

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    userAPI.list({ pageSize: 200 }).then((res: any) => {
      setUsers(res.list || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (step === 2) loadTemplates();
  }, [step]);

  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const params: any = { pageSize: 200, status: 'active' };
      if (tmplCategory) params.category = tmplCategory;
      const res = await projectTemplatesAPI.list(params);
      setTemplates((res as any).list || []);
    } catch { /* noop */ } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    if (step === 2) loadTemplates();
  }, [tmplCategory]);

  useEffect(() => {
    setPlannedTasks([]);
    setPlannedMilestones([]);
  }, [selectedTemplate?.id, blankSelected]);

  useEffect(() => {
    setParticipantIds((prev) => prev.filter((id) => id !== managerId));
  }, [managerId]);

  const hasEditableTemplate = !!selectedTemplate && !blankSelected;
  const totalSteps = hasEditableTemplate ? 3 : 2;

  function validateStep1() {
    if (!name.trim()) { alert('请输入项目名称'); return false; }
    if (!managerId) { alert('请选择项目负责人'); return false; }
    return true;
  }

  async function loadTemplatePlan() {
    if (!selectedTemplate || blankSelected) return;
    setLoadingPlan(true);
    try {
      const applyRes = await projectTemplatesAPI.apply(selectedTemplate.id, {
        startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
      });
      const applyData = (applyRes as any).payload || {};
      const tasks = Array.isArray(applyData.tasks) ? applyData.tasks : [];
      const milestones = Array.isArray(applyData.milestones) ? applyData.milestones : [];
      setPlannedTasks(tasks.map((task: any, idx: number) => ({
        id: `${task.phaseId || 'task'}_${idx}_${Date.now()}`,
        title: task.title || `任务 ${idx + 1}`,
        priority: task.priority || '中',
        status: task.status || '待开始',
        phase: task.phase || '',
        phaseId: task.phaseId || '',
        phaseOrder: task.phaseOrder ?? null,
        estimatedDays: task.estimatedDays ?? 3,
        dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '',
      })));
      setPlannedMilestones(milestones.map((m: any, idx: number) => ({
        id: `milestone_${idx}_${Date.now()}`,
        name: m.name || `里程碑 ${idx + 1}`,
        date: m.date ? String(m.date).slice(0, 10) : '',
        status: m.status || '待完成',
      })));
    } finally {
      setLoadingPlan(false);
    }
  }

  async function submitProject() {
    setCreating(true);
    try {
      const payload: any = {
        name,
        type,
        position: position || undefined,
        managerId,
        participantIds,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        tasks: [],
        milestones: [],
      };

      if (selectedTemplate && !blankSelected) {
        payload.templateId = selectedTemplate.id;
        payload.tasks = plannedTasks.map((task) => ({
          title: task.title,
          status: task.status || '待开始',
          priority: task.priority || '中',
          phase: task.phase || null,
          phaseId: task.phaseId || null,
          phaseOrder: task.phaseOrder ?? null,
          estimatedDays: task.estimatedDays ? parseInt(task.estimatedDays) || 3 : 3,
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
          assigneeId: managerId,
        }));
        payload.milestones = plannedMilestones.map((m) => ({
          name: m.name,
          date: m.date ? new Date(m.date).toISOString() : undefined,
          status: m.status || '待完成',
        }));
      }

      const newProject = await projectAPI.create(payload);
      navigate(`/projects/${(newProject as any).id}`);
    } catch (err: any) {
      alert(err?.error || '创建失败');
    } finally {
      setCreating(false);
    }
  }

  async function handlePrimaryAction() {
    if (!validateStep1()) return;
    if (step === 1) { setStep(2); return; }

    if (step === 2 && hasEditableTemplate) {
      await loadTemplatePlan();
      setStep(3);
      return;
    }

    await submitProject();
  }

  const filteredTemplates = tmplKeyword
    ? templates.filter(t => t.name.includes(tmplKeyword) || t.description?.includes(tmplKeyword))
    : templates;

  const updatePlannedTask = (id: string, field: string, value: any) => {
    setPlannedTasks((prev) => prev.map((task) => (task.id === id ? { ...task, [field]: value } : task)));
  };

  const addPlannedTask = () => {
    setPlannedTasks((prev) => ([
      ...prev,
      { id: `custom_${Date.now()}`, title: '新增任务', priority: '中', status: '待开始', phase: '', phaseId: '', phaseOrder: null, estimatedDays: 3, dueDate: '' },
    ]));
  };

  const removePlannedTask = (id: string) => {
    setPlannedTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const updateMilestone = (id: string, field: string, value: any) => {
    setPlannedMilestones((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const addMilestone = () => {
    setPlannedMilestones((prev) => ([
      ...prev,
      { id: `milestone_${Date.now()}`, name: '新增里程碑', date: '', status: '待完成' },
    ]));
  };

  const removeMilestone = (id: string) => {
    setPlannedMilestones((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">新建项目</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              第 {Math.min(step, totalSteps)}/{totalSteps} 步 · {step === 1 ? '填写基本信息' : step === 2 ? '选择项目模版' : '调整任务'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-3">
          {[1, 2, 3].filter((s) => s <= totalSteps).map(s => (
            <div key={s} className="flex items-center gap-2">
              {s > 1 && <div className="h-px w-8 bg-gray-200" />}
              <div className={`flex items-center gap-1.5 ${step >= s ? 'text-primary-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > s ? 'bg-green-500 text-white' : step === s ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s ? '✓' : s}
                </div>
                <span className="text-xs font-medium">{s === 1 ? '基本信息' : s === 2 ? '选择模版' : '调整任务'}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">项目名称 *</label>
                <input
                  className="input w-full"
                  placeholder="输入项目名称"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">项目类型</label>
                <select className="input w-full" value={type} onChange={e => setType(e.target.value)}>
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">项目参与人</label>
                <select
                  className="input w-full"
                  value=""
                  onChange={(e) => {
                    const uid = e.target.value;
                    if (!uid) return;
                    if (!participantIds.includes(uid)) {
                      setParticipantIds((prev) => [...prev, uid]);
                    }
                  }}
                >
                  <option value="">请选择参与人（可多选）</option>
                  {users
                    .filter((u) => u.id !== managerId && !participantIds.includes(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.position || u.role})</option>
                    ))}
                </select>
                {participantIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {participantIds.map((uid) => {
                      const u = users.find((x) => x.id === uid);
                      return (
                        <span key={uid} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-700">
                          {u?.name || uid}
                          <button
                            type="button"
                            className="text-blue-500 hover:text-blue-700"
                            onClick={() => setParticipantIds((prev) => prev.filter((id) => id !== uid))}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">项目负责人 *</label>
                <select className="input w-full" value={managerId} onChange={e => setManagerId(e.target.value)}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.position || u.role})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                <input
                  type="date"
                  className="input w-full"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">计划结束日期</label>
                <input
                  type="date"
                  className="input w-full"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">项目定位/描述</label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  placeholder="简述项目目标和背景"
                  value={position}
                  onChange={e => setPosition(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="p-6">
              {/* Filter bar */}
              <div className="flex items-center gap-3 mb-4">
                <input
                  className="input flex-1"
                  placeholder="搜索模版..."
                  value={tmplKeyword}
                  onChange={e => setTmplKeyword(e.target.value)}
                />
                <select className="input w-44" value={tmplCategory} onChange={e => setTmplCategory(e.target.value)}>
                  <option value="">全部类别</option>
                  <option value="reagent_chip">试剂/芯片开发</option>
                  <option value="device">设备开发</option>
                </select>
              </div>

              {/* Blank option */}
              <div
                className={`border-2 rounded-xl p-4 cursor-pointer mb-4 flex items-center gap-3 transition-all ${
                  blankSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => { setBlankSelected(true); setSelectedTemplate(null); }}
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xl">📝</div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">空白项目</div>
                  <div className="text-xs text-gray-400">不使用模版，手动添加任务和里程碑</div>
                </div>
                {blankSelected && <div className="ml-auto w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs">✓</div>}
              </div>

              {/* Template cards */}
              {loadingTemplates ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4].map(i => <div key={i} className="card p-4 animate-pulse h-24" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredTemplates.map(tpl => {
                    const isSelected = selectedTemplate?.id === tpl.id && !blankSelected;
                    const catLabel = CATEGORY_LABELS[tpl.category] || tpl.category;
                    const catColor = CATEGORY_COLORS[tpl.category] || 'bg-gray-100 text-gray-600';
                    return (
                      <div
                        key={tpl.id}
                        className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                          isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => { setSelectedTemplate(tpl); setBlankSelected(false); }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-gray-900 text-sm leading-tight">{tpl.name}</span>
                          {isSelected && <div className="shrink-0 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs">✓</div>}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {catLabel && <span className={`px-1.5 py-0.5 text-xs rounded ${catColor}`}>{catLabel}</span>}
                          {tpl.isMaster && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">母版</span>}
                        </div>
                        <div className="flex gap-3 mt-2 text-xs text-gray-400">
                          <span>{tpl.phaseCount ?? 0} 阶段</span>
                          <span>{tpl.taskCount ?? 0} 任务</span>
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{tpl.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {filteredTemplates.length === 0 && !loadingTemplates && (
                <p className="text-sm text-gray-400 text-center py-6">暂无可用模版</p>
              )}
              {hasEditableTemplate && selectedTemplate && (
                <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-700">
                  已选择模版 <span className="font-semibold">{selectedTemplate.name}</span>，点击下一步后可先调整任务和里程碑，再创建项目。
                </div>
              )}
            </div>
          )}

          {step === 3 && hasEditableTemplate && (
            <div className="p-6 space-y-5">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">调整模版任务</div>
                  <div className="text-xs text-gray-500 mt-1">可修改任务标题、阶段、优先级、工期；也可新增或删除任务节点。</div>
                </div>
                <button type="button" className="btn btn-secondary" onClick={addPlannedTask}>+ 新增任务</button>
              </div>

              {loadingPlan ? (
                <div className="card p-6 text-center text-gray-500">正在加载模版任务...</div>
              ) : (
                <div className="space-y-3">
                  {plannedTasks.map((task, index) => (
                    <div key={task.id} className="card p-4 border border-gray-200">
                      <div className="flex items-start gap-3">
                        <div className="mt-2 w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-semibold flex items-center justify-center">{index + 1}</div>
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">任务标题</label>
                            <input className="input w-full" value={task.title} onChange={(e) => updatePlannedTask(task.id, 'title', e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">所属阶段</label>
                            <input className="input w-full" value={task.phase || ''} onChange={(e) => updatePlannedTask(task.id, 'phase', e.target.value)} placeholder="如：产品定义" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">优先级</label>
                            <select className="input w-full bg-white" value={task.priority || '中'} onChange={(e) => updatePlannedTask(task.id, 'priority', e.target.value)}>
                              <option value="高">高</option>
                              <option value="中">中</option>
                              <option value="低">低</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">预计工期(天)</label>
                            <input className="input w-full" type="number" min={1} value={task.estimatedDays} onChange={(e) => updatePlannedTask(task.id, 'estimatedDays', e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">截止日期</label>
                            <input className="input w-full" type="date" value={task.dueDate || ''} onChange={(e) => updatePlannedTask(task.id, 'dueDate', e.target.value)} />
                          </div>
                        </div>
                        <button type="button" className="text-red-500 hover:text-red-700 mt-1" onClick={() => removePlannedTask(task.id)}>删除</button>
                      </div>
                    </div>
                  ))}
                  {plannedTasks.length === 0 && (
                    <div className="card p-6 text-center text-gray-400">当前模版没有任务，或已被删空</div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">调整里程碑</div>
                  <div className="text-xs text-gray-500 mt-1">可新增、修改或删除里程碑。</div>
                </div>
                <button type="button" className="btn btn-secondary" onClick={addMilestone}>+ 新增里程碑</button>
              </div>

              <div className="space-y-3">
                {plannedMilestones.map((milestone) => (
                  <div key={milestone.id} className="card p-4 border border-gray-200 grid grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">里程碑名称</label>
                      <input className="input w-full" value={milestone.name} onChange={(e) => updateMilestone(milestone.id, 'name', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">日期</label>
                      <input className="input w-full" type="date" value={milestone.date || ''} onChange={(e) => updateMilestone(milestone.id, 'date', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">状态</label>
                        <select className="input w-full bg-white" value={milestone.status || '待完成'} onChange={(e) => updateMilestone(milestone.id, 'status', e.target.value)}>
                          <option value="待完成">待完成</option>
                          <option value="进行中">进行中</option>
                          <option value="已完成">已完成</option>
                        </select>
                      </div>
                      <button type="button" className="text-red-500 hover:text-red-700" onClick={() => removeMilestone(milestone.id)}>删除</button>
                    </div>
                  </div>
                ))}
                {plannedMilestones.length === 0 && (
                  <div className="card p-6 text-center text-gray-400">当前没有里程碑</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => step === 1 ? onClose() : setStep(1)}
            className="btn btn-secondary"
          >
            {step === 1 ? '取消' : '上一步'}
          </button>
          <button
            onClick={handlePrimaryAction}
            disabled={creating || loadingPlan || (step === 2 && !blankSelected && !selectedTemplate)}
            className="btn btn-primary"
          >
            {creating || loadingPlan ? '处理中...' : step === 1 ? '下一步：选择模版' : step === 2 && hasEditableTemplate ? '下一步：调整任务' : '创建项目'}
          </button>
        </div>
      </div>
    </div>
  );
}
