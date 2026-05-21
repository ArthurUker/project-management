import React, { useState, useEffect, useCallback } from 'react';
import { projectAPI, userAPI, projectTemplatesAPI } from '../api/client';
import { getAllowedTransitions } from '../constants/statusColors';

// ─── 与 Prisma Schema 严格对齐的类型 ───
interface Project {
  id: string;
  name: string;
  code?: string;
  type?: string;
  status?: string;
  position?: string;   // 注意：后端字段是 position，不是 description
  managerId?: string;
  startDate?: string | null;
  endDate?: string | null;
  templateId?: string | null;
  members?: Array<{ userId?: string; user?: { id?: string } }>;
  tasks?: any[];
  milestones?: any[];
}

interface User {
  id: string;
  name: string;
  username?: string;
}

interface EditProjectModalProps {
  project: Project | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_OPTIONS = ['platform', '定制', '合作', '测试', '应用', '科技项目'];
const TASK_STATUS_OPTIONS = ['待开始', '进行中', '已完成', '已暂停'];
const MILESTONE_STATUS_OPTIONS = ['待完成', '进行中', '已完成'];

function getEditDraftKey(projectId: string) {
  return `rdpms_edit_project_draft_${projectId}`;
}

interface Phase {
  id: string;
  name: string;
  order: number;
  tasks: any[];
}

const EditProjectModal = ({ project, onClose, onSaved }: EditProjectModalProps) => {
  const [form, setForm] = useState({
    name:      '',
    type:      '',
    status:    '',
    position:  '',
    managerId: '',
    startDate: '',
    endDate:   '',
    templateId: '',
  });
  const [users, setUsers]       = useState<User[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [plannedPhases, setPlannedPhases] = useState<Phase[]>([]);
  const [plannedMilestones, setPlannedMilestones] = useState<any[]>([]);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showTemplateEditorModal, setShowTemplateEditorModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string>('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateForm, setSaveTemplateForm] = useState({
    name: '',
    description: '',
    category: '',
    type: '',
  });
  const [expandedPhaseIds, setExpandedPhaseIds] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (!project) return;
    setForm({
      name:      project.name        ?? '',
      type:      project.type        ?? '',
      status:    project.status      ?? '',
      position:  project.position    ?? '',
      managerId: project.managerId   ?? '',
      startDate: project.startDate   ? String(project.startDate).slice(0, 10) : '',
      endDate:   project.endDate     ? String(project.endDate).slice(0, 10)   : '',
      templateId: project.templateId ?? '',
    });
  }, [project]);

  useEffect(() => {
    if (!project?.id) return;
    const loadProjectDetail = async () => {
      setLoadingPlan(true);
      try {
        const detail = await projectAPI.get(project.id) as any;
        const full = detail?.data || detail;
        const manager = full?.managerId || project.managerId || '';
        const memberIds = (full?.members || [])
          .map((m: any) => m.userId || m.user?.id)
          .filter(Boolean)
          .filter((uid: string) => uid !== manager) as string[];
        setParticipantIds(Array.from(new Set(memberIds)));

        // 按阶段组织任务
        const mappedTasks = (full?.tasks || []).map((t: any, idx: number) => ({
          id: t.id || `task_${idx}`,
          title: t.title || `任务 ${idx + 1}`,
          priority: t.priority || '中',
          status: t.status || '待开始',
          phase: t.phase || '',
          phaseId: t.phaseId || '',
          phaseOrder: t.phaseOrder ?? null,
          estimatedDays: t.estimatedDays ?? 3,
          dueDate: t.dueDate ? String(t.dueDate).slice(0, 10) : '',
        }));

        const phaseMap = new Map<string, any[]>();
        const phaseOrder = new Map<string, number>();
        let maxOrder = 0;
        
        mappedTasks.forEach((task) => {
          const phaseName = String(task.phase || '待分配').trim() || '待分配';
          if (!phaseMap.has(phaseName)) {
            phaseMap.set(phaseName, []);
            phaseOrder.set(phaseName, task.phaseOrder ?? ++maxOrder);
          }
          phaseMap.get(phaseName)!.push(task);
        });

        const phases: Phase[] = Array.from(phaseMap.entries())
          .sort((a, b) => (phaseOrder.get(a[0]) ?? 999) - (phaseOrder.get(b[0]) ?? 999))
          .map(([name, tasks], idx) => ({
            id: `phase_${idx}`,
            name,
            order: phaseOrder.get(name) ?? idx + 1,
            tasks,
          }));

        const mappedMilestones = (full?.milestones || []).map((m: any, idx: number) => ({
          id: m.id || `milestone_${idx}`,
          name: m.name || `里程碑 ${idx + 1}`,
          date: m.date ? String(m.date).slice(0, 10) : '',
          status: m.status || '待完成',
        }));

        let nextPhases = phases;
        let nextMilestones = mappedMilestones;
        let nextFormTemplateId = full?.templateId || project.templateId || '';
        let nextParticipantIds = Array.from(new Set(memberIds));

        const draftRaw = localStorage.getItem(getEditDraftKey(project.id));
        if (draftRaw) {
          try {
            const draft = JSON.parse(draftRaw);
            const shouldRestore = window.confirm('检测到本项目的编辑草稿，是否恢复继续编辑？');
            if (shouldRestore) {
              setForm((prev) => ({
                ...prev,
                name: draft.form?.name ?? prev.name,
                type: draft.form?.type ?? prev.type,
                status: draft.form?.status ?? prev.status,
                position: draft.form?.position ?? prev.position,
                managerId: draft.form?.managerId ?? prev.managerId,
                startDate: draft.form?.startDate ?? prev.startDate,
                endDate: draft.form?.endDate ?? prev.endDate,
                templateId: draft.form?.templateId ?? prev.templateId,
              }));
              nextFormTemplateId = draft.form?.templateId ?? nextFormTemplateId;
              nextParticipantIds = Array.isArray(draft.participantIds) ? draft.participantIds : nextParticipantIds;
              nextPhases = Array.isArray(draft.plannedPhases) ? draft.plannedPhases : nextPhases;
              nextMilestones = Array.isArray(draft.plannedMilestones) ? draft.plannedMilestones : nextMilestones;
              setShowPlanEditor(!!draft.showPlanEditor);
            }
          } catch {
            localStorage.removeItem(getEditDraftKey(project.id));
          }
        }

        setForm((prev) => ({ ...prev, templateId: nextFormTemplateId || prev.templateId }));
        setParticipantIds(nextParticipantIds);
        setPlannedPhases(nextPhases);
        setPlannedMilestones(nextMilestones);
        setExpandedPhaseIds(new Set(nextPhases.map((p) => p.id)));
        setPlanLoaded(true);
      } catch {
        setPlanLoaded(false);
      } finally {
        setLoadingPlan(false);
      }
    };
    loadProjectDetail();
  }, [project?.id]);

  useEffect(() => {
    setParticipantIds((prev) => prev.filter((id) => id !== form.managerId));
  }, [form.managerId]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await projectTemplatesAPI.list();
      const list = (res as any).templates ?? (res as any).list ?? (res as any).data ?? res;
      setTemplates(Array.isArray(list) ? list : []);
    } catch {
      // ignore
    }
  }, []);

  // 加载模版列表
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // 加载用户列表（用于负责人选择）
  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await userAPI.list();
        const data = res.users ?? res.list ?? res.data ?? res;
        setUsers(Array.isArray(data) ? data : []);
      } catch {
        // 加载失败不影响主流程
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSaving(true);
    try {
      // 从阶段结构展开成平铺任务列表
      const flatTasks = plannedPhases.flatMap((phase) =>
        phase.tasks.map((t) => ({
          title: t.title,
          priority: t.priority || '中',
          status: t.status || '待开始',
          phase: phase.name || null,
          phaseId: phase.id || null,
          phaseOrder: phase.order ?? null,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          assigneeId: form.managerId || undefined,
        }))
      );

      const payload = {
        name:      form.name,
        type:      form.type      || undefined,
        status:    form.status    || undefined,
        position:  form.position  || undefined,
        managerId: form.managerId || undefined,
        participantIds,
        startDate: form.startDate || null,
        endDate:   form.endDate   || null,
        templateId: form.templateId || undefined,
        ...(planLoaded ? {
          tasks: flatTasks,
          milestones: plannedMilestones.map((m) => ({
            name: m.name,
            date: m.date ? new Date(m.date).toISOString() : null,
            status: m.status || '待完成',
          })),
        } : {}),
      };
      await projectAPI.update(project.id, payload);
      localStorage.removeItem(getEditDraftKey(project.id));
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err?.message ?? err?.error ?? '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (!project) return null;

  const selectedTemplate = templates.find((t: any) => t.id === form.templateId);

  const addParticipant = (uid: string) => {
    if (!uid || participantIds.includes(uid) || uid === form.managerId) return;
    setParticipantIds((prev) => [...prev, uid]);
  };

  const removeParticipant = (uid: string) => {
    setParticipantIds((prev) => prev.filter((id) => id !== uid));
  };

  const updateMilestone = (id: string, field: string, value: any) => {
    setPlannedMilestones((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
  };

  const addMilestone = () => {
    setPlannedMilestones((prev) => [...prev, { id: `custom_m_${Date.now()}`, name: '新增里程碑', date: '', status: '待完成' }]);
  };

  const removeMilestone = (id: string) => {
    setPlannedMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const reloadFromTemplate = async () => {
    if (!form.templateId) return;
    setLoadingPlan(true);
    try {
      const res = await projectTemplatesAPI.apply(form.templateId, {
        startDate: form.startDate ? new Date(form.startDate).toISOString() : new Date().toISOString(),
      }) as any;
      const payload = res?.payload || {};
      const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      const milestones = Array.isArray(payload.milestones) ? payload.milestones : [];

      // 按阶段组织任务
      const phaseMap = new Map<string, any[]>();
      const phaseOrder = new Map<string, number>();
      let maxOrder = 0;

      tasks.forEach((t: any, idx: number) => {
        const phaseName = String(t.phase || '待分配').trim() || '待分配';
        if (!phaseMap.has(phaseName)) {
          phaseMap.set(phaseName, []);
          phaseOrder.set(phaseName, t.phaseOrder ?? ++maxOrder);
        }
        phaseMap.get(phaseName)!.push({
          id: `tpl_${idx}_${Date.now()}`,
          title: t.title || `任务 ${idx + 1}`,
          priority: t.priority || '中',
          status: t.status || '待开始',
          phase: phaseName,
          phaseId: t.phaseId || '',
          phaseOrder: t.phaseOrder ?? null,
          estimatedDays: t.estimatedDays ?? 3,
          dueDate: t.dueDate ? String(t.dueDate).slice(0, 10) : '',
        });
      });

      const phases: Phase[] = Array.from(phaseMap.entries())
        .sort((a, b) => (phaseOrder.get(a[0]) ?? 999) - (phaseOrder.get(b[0]) ?? 999))
        .map(([name, phaseTaskList], idx) => ({
          id: `phase_tpl_${idx}_${Date.now()}`,
          name,
          order: phaseOrder.get(name) ?? idx + 1,
          tasks: phaseTaskList,
        }));

      setPlannedPhases(phases);
      setPlannedMilestones(milestones.map((m: any, idx: number) => ({
        id: `tpl_m_${idx}_${Date.now()}`,
        name: m.name || `里程碑 ${idx + 1}`,
        date: m.date ? String(m.date).slice(0, 10) : '',
        status: m.status || '待完成',
      })));
      setExpandedPhaseIds(new Set(phases.map((p) => p.id)));
      setPlanLoaded(true);
    } finally {
      setLoadingPlan(false);
    }
  };

  const buildTemplateContent = () => {
    const phases = plannedPhases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      order: phase.order,
      type: 'normal',
      source: 'self',
      enabled: true,
      completionTip: '',
      allowSkip: false,
      totalDays: phase.tasks.reduce((sum, t) => sum + (Number(t.estimatedDays) || 3), 0),
      tasks: phase.tasks.map((t, idx) => ({
        id: t.id || `task_${idx}`,
        title: t.title || `任务 ${idx + 1}`,
        priority: (t.priority || '中') as '高' | '中' | '低',
        estimatedDays: Number(t.estimatedDays) || 3,
        role: '',
        source: 'self',
        enabled: true,
      })),
    }));

    const phaseIdByName = new Map(phases.map((p: any) => [p.name, p.id]));
    const baseDate = form.startDate ? new Date(form.startDate) : new Date();
    baseDate.setHours(0, 0, 0, 0);
    const oneDayMs = 24 * 60 * 60 * 1000;

    const milestones = plannedMilestones.map((m, idx) => {
      const d = m.date ? new Date(m.date) : new Date(baseDate);
      d.setHours(0, 0, 0, 0);
      const offsetDays = Math.max(0, Math.round((d.getTime() - baseDate.getTime()) / oneDayMs));
      const fallbackPhaseId = phases[phases.length - 1]?.id || 'phase_1';
      return {
        id: m.id || `milestone_${idx + 1}`,
        name: m.name || `里程碑 ${idx + 1}`,
        phaseId: phaseIdByName.get(String(m.name || '').trim()) || fallbackPhaseId,
        offsetDays,
      };
    });

    return { phases, milestones, defaults: {} };
  };

  const handleSaveAsTemplate = async () => {
    const name = saveTemplateForm.name.trim();
    if (!name) {
      alert('请输入新模板名称');
      return;
    }
    if (!planLoaded || plannedPhases.reduce((sum, p) => sum + p.tasks.length, 0) === 0) {
      alert('当前没有可另存的任务内容，请先编辑任务后再保存');
      return;
    }

    setSavingTemplate(true);
    try {
      const content = buildTemplateContent();
      const payload = {
        name,
        description: saveTemplateForm.description.trim(),
        category: saveTemplateForm.category || selectedTemplate?.category || null,
        type: saveTemplateForm.type || form.type || selectedTemplate?.type || null,
        parentId: form.templateId || null,
        isMaster: false,
        status: 'active',
        content,
      };
      const created = await projectTemplatesAPI.create(payload) as any;
      const createdTemplate = created?.data || created;

      if (createdTemplate?.id) {
        setTemplates((prev) => [createdTemplate, ...prev]);
        setForm((prev) => ({ ...prev, templateId: createdTemplate.id }));
      }

      setShowSaveTemplateModal(false);
      alert('已另存为新项目模板，不会影响原模板');
    } catch (err: any) {
      alert(err?.error || err?.message || '另存模板失败，请检查权限后重试');
    } finally {
      setSavingTemplate(false);
    }
  };

  const saveDraft = () => {
    if (!project?.id) return;
    const draft = {
      projectId: project.id,
      form,
      participantIds,
      plannedPhases,
      plannedMilestones,
      showPlanEditor,
      savedAt: Date.now(),
    };
    localStorage.setItem(getEditDraftKey(project.id), JSON.stringify(draft));
    alert('已暂存草稿，可稍后继续编辑');
  };

  const openTemplateEditor = () => {
    if (!form.templateId) {
      alert('请先选择项目模板');
      return;
    }
    setEditingTemplateId(form.templateId);
    setShowTemplateEditorModal(true);
  };

  const closeTemplateEditor = async () => {
    setShowTemplateEditorModal(false);
    setEditingTemplateId('');
    await loadTemplates();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg
                      max-h-[90vh] overflow-y-auto">

        {/* ── 头部 ── */}
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">编辑项目</h2>
            {project.code && (
              <p className="text-xs text-gray-400 font-mono mt-0.5">{project.code}</p>
            )}
          </div>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-gray-400 hover:text-gray-600 hover:bg-gray-100
                       transition-colors"
            onClick={onClose}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── 表单 ── */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* 项目名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              项目名称 <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200
                         focus:border-blue-400 transition-colors"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="请输入项目名称"
              required
            />
          </div>

          {/* 类型 + 项目参与人 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                项目类型
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 bg-white transition-colors"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                <option value="">- 请选择 -</option>
                {TYPE_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                项目参与人
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 bg-white transition-colors"
                value=""
                onChange={e => addParticipant(e.target.value)}
              >
                <option value="">- 请选择参与人（可多选）-</option>
                {users
                  .filter((u) => u.id !== form.managerId && !participantIds.includes(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.username ? ` (${u.username})` : ''}
                    </option>
                  ))}
              </select>
              {participantIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {participantIds.map((uid) => {
                    const u = users.find((x) => x.id === uid);
                    return (
                      <span key={uid} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-700">
                        {u?.name || uid}
                        <button type="button" className="text-blue-500 hover:text-blue-700" onClick={() => removeParticipant(uid)}>×</button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 状态 + 负责人 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                项目状态
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 bg-white transition-colors"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
              >
                <option value="">- 请选择 -</option>
                {getAllowedTransitions(project?.status).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {project?.status && (
                <p className="text-xs text-gray-400 mt-1">
                  当前：{project.status}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                项目负责人
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 bg-white transition-colors
                           disabled:bg-gray-50 disabled:text-gray-400"
                value={form.managerId}
                onChange={e => setForm({ ...form, managerId: e.target.value })}
                disabled={loadingUsers}
              >
                <option value="">
                  {loadingUsers ? '加载中...' : '- 请选择负责人 -'}
                </option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.username ? ` (${u.username})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 项目定位 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              项目定位
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200
                         focus:border-blue-400 transition-colors resize-none"
              rows={2}
              value={form.position}
              onChange={e => setForm({ ...form, position: e.target.value })}
              placeholder="项目定位或简要描述"
            />
          </div>

          {/* 项目模版 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              项目模版
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200
                         focus:border-blue-400 bg-white transition-colors"
              value={form.templateId}
              onChange={e => setForm({ ...form, templateId: e.target.value })}
            >
              <option value="">- 不使用模版 -</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
                onClick={openTemplateEditor}
              >
                编辑模板
              </button>
              {!!form.templateId && (
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={reloadFromTemplate}
                  disabled={loadingPlan}
                >
                  {loadingPlan ? '加载中...' : '按模板重载'}
                </button>
              )}
              {showPlanEditor && planLoaded && (
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs rounded border border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={() => {
                    setSaveTemplateForm({
                      name: `${form.name || project.name || '项目'}-定制模板`,
                      description: `从项目「${form.name || project.name}」另存的模板`,
                      category: selectedTemplate?.category || '',
                      type: form.type || selectedTemplate?.type || '',
                    });
                    setShowSaveTemplateModal(true);
                  }}
                >
                  另存项目模板
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              当前编辑仅影响本项目的任务与里程碑，不会修改原模板；如需复用，请使用“另存项目模板”。
            </p>
          </div>

          {/* 模版任务编辑区 */}
          {showPlanEditor && (
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">项目任务调整</h3>
                <div className="text-xs text-gray-500">
                  共 {plannedPhases.reduce((sum, p) => sum + p.tasks.length, 0)} 个任务 / {plannedMilestones.length} 个里程碑
                </div>
              </div>

              {/* 阶段和任务管理 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-700">项目阶段</h4>
                  <button
                    type="button"
                    className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                    onClick={() => {
                      const phaseName = prompt('输入新阶段名称');
                      if (phaseName) {
                        const newPhase: Phase = {
                          id: `phase_${Date.now()}`,
                          name: phaseName,
                          order: Math.max(0, ...plannedPhases.map(p => p.order)) + 1,
                          tasks: [],
                        };
                        setPlannedPhases([...plannedPhases, newPhase]);
                      }
                    }}
                  >
                    + 新增阶段
                  </button>
                </div>

                {plannedPhases.length === 0 ? (
                  <div className="text-xs text-gray-400 px-3 py-2">暂无阶段，请点击"新增阶段"</div>
                ) : (
                  plannedPhases.map((phase) => {
                    const isExpanded = expandedPhaseIds.has(phase.id);
                    const totalDays = phase.tasks.reduce((sum, t) => sum + (Number(t.estimatedDays) || 3), 0);
                    return (
                      <div
                        key={phase.id}
                        className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                      >
                        <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            <button
                              type="button"
                              className="text-gray-500 hover:text-gray-700 p-1"
                              onClick={() => {
                                const newSet = new Set(expandedPhaseIds);
                                if (newSet.has(phase.id)) {
                                  newSet.delete(phase.id);
                                } else {
                                  newSet.add(phase.id);
                                }
                                setExpandedPhaseIds(newSet);
                              }}
                            >
                              {isExpanded ? '▼' : '▶'}
                            </button>
                            <span className="text-sm font-medium text-gray-900 min-w-0 truncate">{phase.name}</span>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              {phase.tasks.length} 任务 × {totalDays} 天
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1"
                              onClick={() => {
                                const newName = prompt('编辑阶段名称', phase.name);
                                if (newName && newName !== phase.name) {
                                  setPlannedPhases(
                                    plannedPhases.map((p) =>
                                      p.id === phase.id ? { ...p, name: newName } : p
                                    )
                                  );
                                }
                              }}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                              onClick={() => {
                                if (confirm(`确定删除阶段"${phase.name}"及其所有任务吗?`)) {
                                  setPlannedPhases(plannedPhases.filter((p) => p.id !== phase.id));
                                  const newSet = new Set(expandedPhaseIds);
                                  newSet.delete(phase.id);
                                  setExpandedPhaseIds(newSet);
                                }
                              }}
                            >
                              删除
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3 py-3 space-y-2 border-t border-gray-100">
                            {phase.tasks.length === 0 ? (
                              <div className="text-xs text-gray-400 py-2">暂无任务</div>
                            ) : (
                              phase.tasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="border border-gray-100 rounded p-2 bg-white grid grid-cols-1 md:grid-cols-2 gap-2 text-xs"
                                >
                                  <input
                                    className="input"
                                    value={task.title}
                                    onChange={(e) => {
                                      setPlannedPhases(
                                        plannedPhases.map((p) =>
                                          p.id === phase.id
                                            ? {
                                                ...p,
                                                tasks: p.tasks.map((t) =>
                                                  t.id === task.id
                                                    ? { ...t, title: e.target.value }
                                                    : t
                                                ),
                                              }
                                            : p
                                        )
                                      );
                                    }}
                                    placeholder="任务标题"
                                  />
                                  <select
                                    className="input bg-white"
                                    value={task.priority || '中'}
                                    onChange={(e) => {
                                      setPlannedPhases(
                                        plannedPhases.map((p) =>
                                          p.id === phase.id
                                            ? {
                                                ...p,
                                                tasks: p.tasks.map((t) =>
                                                  t.id === task.id
                                                    ? { ...t, priority: e.target.value }
                                                    : t
                                                ),
                                              }
                                            : p
                                        )
                                      );
                                    }}
                                  >
                                    <option value="高">高</option>
                                    <option value="中">中</option>
                                    <option value="低">低</option>
                                  </select>
                                  <select
                                    className="input bg-white"
                                    value={task.status || '待开始'}
                                    onChange={(e) => {
                                      setPlannedPhases(
                                        plannedPhases.map((p) =>
                                          p.id === phase.id
                                            ? {
                                                ...p,
                                                tasks: p.tasks.map((t) =>
                                                  t.id === task.id
                                                    ? { ...t, status: e.target.value }
                                                    : t
                                                ),
                                              }
                                            : p
                                        )
                                      );
                                    }}
                                  >
                                    {TASK_STATUS_OPTIONS.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    min={1}
                                    className="input"
                                    value={task.estimatedDays ?? 3}
                                    onChange={(e) => {
                                      setPlannedPhases(
                                        plannedPhases.map((p) =>
                                          p.id === phase.id
                                            ? {
                                                ...p,
                                                tasks: p.tasks.map((t) =>
                                                  t.id === task.id
                                                    ? { ...t, estimatedDays: Number(e.target.value) || 3 }
                                                    : t
                                                ),
                                              }
                                            : p
                                        )
                                      );
                                    }}
                                    placeholder="预计天数"
                                  />
                                  <input
                                    type="date"
                                    className="input"
                                    value={task.dueDate || ''}
                                    onChange={(e) => {
                                      setPlannedPhases(
                                        plannedPhases.map((p) =>
                                          p.id === phase.id
                                            ? {
                                                ...p,
                                                tasks: p.tasks.map((t) =>
                                                  t.id === task.id
                                                    ? { ...t, dueDate: e.target.value }
                                                    : t
                                                ),
                                              }
                                            : p
                                        )
                                      );
                                    }}
                                  />
                                  <div className="md:col-span-2 text-right">
                                    <button
                                      type="button"
                                      className="text-xs text-red-500 hover:text-red-700"
                                      onClick={() => {
                                        setPlannedPhases(
                                          plannedPhases.map((p) =>
                                            p.id === phase.id
                                              ? {
                                                  ...p,
                                                  tasks: p.tasks.filter((t) => t.id !== task.id),
                                                }
                                              : p
                                          )
                                        );
                                      }}
                                    >
                                      删除任务
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                            <button
                              type="button"
                              className="w-full px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                              onClick={() => {
                                const newTask = {
                                  id: `task_${phase.id}_${Date.now()}`,
                                  title: '',
                                  priority: '中',
                                  status: '待开始',
                                  phase: phase.name,
                                  phaseId: phase.id,
                                  phaseOrder: phase.order,
                                  estimatedDays: 3,
                                  dueDate: '',
                                };
                                setPlannedPhases(
                                  plannedPhases.map((p) =>
                                    p.id === phase.id
                                      ? { ...p, tasks: [...p.tasks, newTask] }
                                      : p
                                  )
                                );
                              }}
                            >
                              + 新增任务
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">里程碑调整</h3>
                <button type="button" className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-white" onClick={addMilestone}>+ 新增里程碑</button>
              </div>
              {plannedMilestones.map((m) => (
                <div key={m.id} className="bg-white border border-gray-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <input className="input" value={m.name} onChange={(e) => updateMilestone(m.id, 'name', e.target.value)} placeholder="里程碑名称" />
                  <input type="date" className="input" value={m.date || ''} onChange={(e) => updateMilestone(m.id, 'date', e.target.value)} />
                  <select className="input bg-white" value={m.status || '待完成'} onChange={(e) => updateMilestone(m.id, 'status', e.target.value)}>
                    {MILESTONE_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="text-right">
                    <button type="button" className="text-xs text-red-500 hover:text-red-700" onClick={() => removeMilestone(m.id)}>删除里程碑</button>
                  </div>
                </div>
              ))}
              {plannedMilestones.length === 0 && <div className="text-xs text-gray-400">暂无里程碑，可点击“新增里程碑”</div>}
            </div>
          )}

          {showSaveTemplateModal && (
            <div className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-gray-100">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">另存项目模板</h4>
                  <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setShowSaveTemplateModal(false)}>×</button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">模板名称</label>
                    <input
                      className="input w-full"
                      value={saveTemplateForm.name}
                      onChange={(e) => setSaveTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="请输入模板名称"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">模板描述</label>
                    <textarea
                      className="input w-full resize-none"
                      rows={3}
                      value={saveTemplateForm.description}
                      onChange={(e) => setSaveTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="可选：说明该模板适用场景"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">类别</label>
                      <input
                        className="input w-full"
                        value={saveTemplateForm.category}
                        onChange={(e) => setSaveTemplateForm((prev) => ({ ...prev, category: e.target.value }))}
                        placeholder="如：reagent_chip"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">类型</label>
                      <input
                        className="input w-full"
                        value={saveTemplateForm.type}
                        onChange={(e) => setSaveTemplateForm((prev) => ({ ...prev, type: e.target.value }))}
                        placeholder="如：定制"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    会创建一个新模板，不会修改当前引用的原模板。
                  </p>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                  <button type="button" className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onClick={() => setShowSaveTemplateModal(false)} disabled={savingTemplate}>取消</button>
                  <button type="button" className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" onClick={handleSaveAsTemplate} disabled={savingTemplate}>
                    {savingTemplate ? '保存中...' : '确认另存'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 开始时间 + 结束时间 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                开始日期
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 transition-colors"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                结束日期
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200
                           focus:border-blue-400 transition-colors"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* ── 底部按钮 ── */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              className="px-4 py-2 text-sm text-amber-700 border border-amber-200
                         rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
              onClick={saveDraft}
              disabled={saving}
            >
              暂存草稿
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200
                         rounded-lg hover:bg-gray-50 transition-colors"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg
                         hover:bg-blue-700 transition-colors disabled:opacity-50
                         disabled:cursor-not-allowed flex items-center gap-2"
              disabled={saving}
            >
              {saving && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none"
                  viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>

        </form>
      </div>

      {showTemplateEditorModal && editingTemplateId && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="w-[min(96vw,1400px)] h-[92vh] rounded-2xl overflow-hidden bg-white shadow-2xl border border-gray-100 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">编辑模板</h4>
                <p className="text-xs text-gray-500 mt-0.5">关闭后会自动刷新模板列表</p>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
                onClick={closeTemplateEditor}
              >
                关闭
              </button>
            </div>
            <iframe
              title="模板编辑器"
              src={`/project-templates/${editingTemplateId}/edit`}
              className="w-full flex-1 border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EditProjectModal;
