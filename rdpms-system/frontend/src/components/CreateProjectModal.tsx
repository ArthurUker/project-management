import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectAPI, projectTemplatesAPI, taskTemplatesAPI, userAPI } from '../api/client';
import { useAppStore } from '../store/appStore';
import ProcessFlowDiagram from './ProcessFlowDiagram';

const PROJECT_TYPES = ['platform', '定制', '合作', '测试', '应用', '科技项目'];
const CATEGORY_LABELS: Record<string, string> = {
  reagent_chip: '试剂/芯片开发',
  device: '设备开发',
};
const CATEGORY_COLORS: Record<string, string> = {
  reagent_chip: 'bg-blue-100 text-blue-700',
  device: 'bg-purple-100 text-purple-700',
};
const CREATE_PROJECT_DRAFT_KEY = 'rdpms_create_project_draft_v1';

function normalizeTemplateCategory(category?: string | null) {
  const raw = String(category || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'reagent_chip' || raw === 'reagent/chip' || raw === '试剂/芯片' || raw === '试剂芯片' || raw === '试剂/芯片开发') {
    return 'reagent_chip';
  }
  if (raw === 'device' || raw === '设备' || raw === '设备开发') {
    return 'device';
  }
  return raw;
}

interface PlannedPhase {
  id: string;
  name: string;
  order: number;
  nextPhaseIds: string[];
  x?: number;
  y?: number;
  tasks: any[];
}

function buildPhasesFromTasks(tasks: any[]): PlannedPhase[] {
  const phaseMap = new Map<string, PlannedPhase>();
  let seq = 1;

  tasks.forEach((task: any) => {
    const phaseName = String(task.phase || '未分组节点').trim() || '未分组节点';
    const key = task.phaseId || `phase_name_${phaseName}`;
    if (!phaseMap.has(key)) {
      phaseMap.set(key, {
        id: task.phaseId || `phase_${seq}`,
        name: phaseName,
        order: Number(task.phaseOrder) || seq,
        nextPhaseIds: [],
        tasks: [],
      });
      seq += 1;
    }
    const phase = phaseMap.get(key)!;
    phase.tasks.push({
      ...task,
      phase: phase.name,
      phaseId: phase.id,
      phaseOrder: phase.order,
    });
  });

  const phases = Array.from(phaseMap.values()).sort((a, b) => a.order - b.order).map((phase, idx) => ({
    ...phase,
    order: idx + 1,
    tasks: phase.tasks.map((task: any) => ({ ...task, phaseOrder: idx + 1 })),
  }));

  const hasConnections = phases.some((phase) => (phase.nextPhaseIds || []).length > 0);
  if (!hasConnections) {
    phases.forEach((phase, idx) => {
      phase.nextPhaseIds = idx < phases.length - 1 ? [phases[idx + 1].id] : [];
    });
  }

  return phases;
}

function flattenTasksFromPhases(phases: PlannedPhase[]) {
  return phases.flatMap((phase) =>
    phase.tasks.map((task: any) => ({
      ...task,
      phase: phase.name,
      phaseId: phase.id,
      phaseOrder: phase.order,
    }))
  );
}

interface Props {
  onClose: () => void;
  initialDraftProjectId?: string;
}

export default function CreateProjectModal({ onClose, initialDraftProjectId }: Props) {
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
  const [plannedPhases, setPlannedPhases] = useState<PlannedPhase[]>([]);
  const [plannedMilestones, setPlannedMilestones] = useState<any[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>('');

  const [creating, setCreating] = useState(false);
  const [draftProjectId, setDraftProjectId] = useState<string>(initialDraftProjectId || '');
  const [showTaskTemplatePicker, setShowTaskTemplatePicker] = useState(false);
  const [taskTemplateList, setTaskTemplateList] = useState<any[]>([]);
  const [taskTemplateKeyword, setTaskTemplateKeyword] = useState('');
  const [loadingTaskTemplates, setLoadingTaskTemplates] = useState(false);
  const [selectedTaskTemplateIds, setSelectedTaskTemplateIds] = useState<Set<string>>(new Set());
  const [templatePreviewLoaded, setTemplatePreviewLoaded] = useState(false);
  const [templatePreviewError, setTemplatePreviewError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(CREATE_PROJECT_DRAFT_KEY);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      const shouldRestore = window.confirm('检测到未完成的新建项目草稿，是否恢复继续编辑？');
      if (!shouldRestore) return;

      setStep(Number(draft.step) || 1);
      setName(draft.name || '');
      setType(draft.type || '定制');
      setPosition(draft.position || '');
      setManagerId(draft.managerId || user?.id || '');
      setParticipantIds(Array.isArray(draft.participantIds) ? draft.participantIds : []);
      setStartDate(draft.startDate || new Date().toISOString().slice(0, 10));
      setEndDate(draft.endDate || '');
      setSelectedTemplate(draft.selectedTemplate || null);
      setBlankSelected(!!draft.blankSelected);
      setTmplKeyword(draft.tmplKeyword || '');
      setTmplCategory(draft.tmplCategory || '');

      const restoredPhases = Array.isArray(draft.plannedPhases)
        ? draft.plannedPhases
        : Array.isArray(draft.plannedTasks)
        ? buildPhasesFromTasks(draft.plannedTasks)
        : [];
      setPlannedPhases(restoredPhases);
      setPlannedMilestones(Array.isArray(draft.plannedMilestones) ? draft.plannedMilestones : []);
      setSelectedPhaseId(draft.selectedPhaseId || restoredPhases[0]?.id || '');
    } catch {
      localStorage.removeItem(CREATE_PROJECT_DRAFT_KEY);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!initialDraftProjectId) return;

    const loadDraftProject = async () => {
      try {
        const detail = await projectAPI.get(initialDraftProjectId) as any;
        const full = detail?.data || detail;

        setDraftProjectId(full.id || initialDraftProjectId);
        setName(full.name || '');
        setType(full.type || '定制');
        setPosition(full.position || '');
        setManagerId(full.managerId || user?.id || '');
        setParticipantIds((full.members || [])
          .map((m: any) => m.userId || m.user?.id)
          .filter((uid: string) => uid && uid !== (full.managerId || user?.id)));
        setStartDate(full.startDate ? String(full.startDate).slice(0, 10) : new Date().toISOString().slice(0, 10));
        setEndDate(full.endDate ? String(full.endDate).slice(0, 10) : '');

        if (full.templateId) {
          setSelectedTemplate(full.template || { id: full.templateId, name: '草稿模板' });
          setBlankSelected(false);
          const phases = buildPhasesFromTasks(full.tasks || []);
          setPlannedPhases(phases);
          setSelectedPhaseId(phases[0]?.id || '');
          setPlannedMilestones((full.milestones || []).map((m: any, idx: number) => ({
            id: m.id || `draft_ms_${idx}`,
            name: m.name || `里程碑 ${idx + 1}`,
            phaseId: m.phaseId || '',
            phaseName: m.phaseName || '',
            date: m.date ? String(m.date).slice(0, 10) : '',
            status: m.status || '待完成',
          })));
          setStep(3);
        } else {
          setBlankSelected(true);
          setSelectedTemplate(null);
          setStep(1);
        }
      } catch {
        alert('加载草稿失败，请重试');
      }
    };

    loadDraftProject();
  }, [initialDraftProjectId, user?.id]);

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
      const res = await projectTemplatesAPI.list(params);
      const list = (res as any).list || (res as any).templates || (res as any).data || [];
      setTemplates(Array.isArray(list) ? list : []);
    } catch { /* noop */ } finally {
      setLoadingTemplates(false);
    }
  }

  // 立即为选中的模版预加载 plan（用于在选择模版后即刻展示预览）
  async function prefetchTemplatePlan(tpl: any) {
    if (!tpl) return false;
    setTemplatePreviewLoaded(false);
    setTemplatePreviewError(null);
    setLoadingPlan(true);
    try {
      const applyRes = await projectTemplatesAPI.apply(tpl.id, {
        startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
      });
      const applyData = (applyRes as any).payload || {};
      const tasks = Array.isArray(applyData.tasks) ? applyData.tasks : [];
      const milestones = Array.isArray(applyData.milestones) ? applyData.milestones : [];
      const normalizedTasks = tasks.map((task: any, idx: number) => ({
        id: `${task.phaseId || 'task'}_${idx}_${Date.now()}`,
        title: task.title || `任务 ${idx + 1}`,
        priority: task.priority || '中',
        status: task.status || '待开始',
        phase: task.phase || '',
        phaseId: task.phaseId || '',
        phaseOrder: task.phaseOrder ?? null,
        estimatedDays: task.estimatedDays ?? 3,
        dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '',
      }));

      const phases = buildPhasesFromTasks(normalizedTasks);
      setPlannedPhases(phases);
      setSelectedPhaseId(phases[0]?.id || '');
      setPlannedMilestones(milestones.map((m: any, idx: number) => ({
        id: `milestone_${idx}_${Date.now()}`,
        name: m.name || `里程碑 ${idx + 1}`,
        phaseId: m.phaseId || '',
        phaseName: m.phaseName || '',
        date: m.date ? String(m.date).slice(0, 10) : '',
        status: m.status || '待完成',
      })));

      setTemplatePreviewLoaded(true);
      return true;
    } catch (err: any) {
      console.error('Prefetch template failed:', err);
      setTemplatePreviewError(err?.message || '加载模版预览失败');
      setTemplatePreviewLoaded(false);
      return false;
    } finally {
      setLoadingPlan(false);
    }
  }

  useEffect(() => {
    if (step === 2) loadTemplates();
  }, [tmplCategory]);

  useEffect(() => {
    setPlannedPhases([]);
    setPlannedMilestones([]);
    setSelectedPhaseId('');
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
      const normalizedTasks = tasks.map((task: any, idx: number) => ({
        id: `${task.phaseId || 'task'}_${idx}_${Date.now()}`,
        title: task.title || `任务 ${idx + 1}`,
        priority: task.priority || '中',
        status: task.status || '待开始',
        phase: task.phase || '',
        phaseId: task.phaseId || '',
        phaseOrder: task.phaseOrder ?? null,
        estimatedDays: task.estimatedDays ?? 3,
        dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '',
      }));

      const phases = buildPhasesFromTasks(normalizedTasks);
      setPlannedPhases(phases);
      setSelectedPhaseId(phases[0]?.id || '');
      setPlannedMilestones(milestones.map((m: any, idx: number) => ({
        id: `milestone_${idx}_${Date.now()}`,
        name: m.name || `里程碑 ${idx + 1}`,
        phaseId: m.phaseId || '',
        phaseName: m.phaseName || '',
        date: m.date ? String(m.date).slice(0, 10) : '',
        status: m.status || '待完成',
      })));
      return true;
    } catch (err: any) {
      console.error('Failed to load template plan:', err);
      const message = err?.message || (err?.error ? err.error : '加载模版数据失败，请检查网络或重新登录');
      alert(message);
      return false;
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
        isDraft: false,
        status: '规划中',
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
        const plannedTasks = flattenTasksFromPhases(plannedPhases);
        payload.tasks = plannedTasks.map((task) => ({
          title: task.title,
          description: task.description || '',
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
          phaseId: m.phaseId || null,
          phaseName: plannedPhases.find((p) => p.id === m.phaseId)?.name || m.phaseName || null,
          date: m.date ? new Date(m.date).toISOString() : undefined,
          status: m.status || '待完成',
        }));
      }

      const newProject = draftProjectId
        ? await projectAPI.update(draftProjectId, payload)
        : await projectAPI.create(payload);
      localStorage.removeItem(CREATE_PROJECT_DRAFT_KEY);
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
      const ok = await loadTemplatePlan();
      if (ok) setStep(3);
      return;
    }

    await submitProject();
  }

  async function saveDraft() {
    const draft = {
      step,
      name,
      type,
      position,
      managerId,
      participantIds,
      startDate,
      endDate,
      selectedTemplate,
      blankSelected,
      tmplKeyword,
      tmplCategory,
      plannedPhases,
      plannedMilestones,
      selectedPhaseId,
      savedAt: Date.now(),
    };
    localStorage.setItem(CREATE_PROJECT_DRAFT_KEY, JSON.stringify(draft));

    try {
      const payload: any = {
        name: name || `未命名草稿-${new Date().toISOString().slice(0, 10)}`,
        type,
        status: '草稿',
        isDraft: true,
        position: position || undefined,
        managerId,
        participantIds,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        templateId: selectedTemplate?.id || undefined,
        tasks: flattenTasksFromPhases(plannedPhases).map((task: any) => ({
          title: task.title,
          description: task.description || '',
          status: task.status || '待开始',
          priority: task.priority || '中',
          phase: task.phase || null,
          phaseId: task.phaseId || null,
          phaseOrder: task.phaseOrder ?? null,
          estimatedDays: task.estimatedDays ? parseInt(task.estimatedDays) || 3 : 3,
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
          assigneeId: managerId,
        })),
        milestones: plannedMilestones.map((m) => ({
          name: m.name,
          phaseId: m.phaseId || null,
          phaseName: plannedPhases.find((p) => p.id === m.phaseId)?.name || m.phaseName || null,
          date: m.date ? new Date(m.date).toISOString() : undefined,
          status: m.status || '待完成',
        })),
      };

      const saved = draftProjectId
        ? await projectAPI.update(draftProjectId, payload)
        : await projectAPI.create(payload);

      if (!draftProjectId && (saved as any)?.id) {
        setDraftProjectId((saved as any).id);
      }

      alert('已暂存草稿（已保存到项目列表，可下次继续编辑）');
    } catch {
      alert('本地草稿已保存，但上传到服务器失败，请稍后重试');
    }
  }

  const filteredTemplates = templates.filter((tpl) => {
    const normalized = normalizeTemplateCategory(tpl.category);
    const categoryMatched = !tmplCategory || normalized === tmplCategory;
    if (!categoryMatched) return false;

    if (!tmplKeyword) return true;
    return String(tpl.name || '').includes(tmplKeyword) || String(tpl.description || '').includes(tmplKeyword);
  });

  const selectedPhase = useMemo(
    () => plannedPhases.find((phase) => phase.id === selectedPhaseId) || null,
    [plannedPhases, selectedPhaseId]
  );

  const addPhase = () => {
    const nextOrder = plannedPhases.length + 1;
    const newPhase: PlannedPhase = {
      id: `phase_${Date.now()}`,
      name: `新节点 ${nextOrder}`,
      order: nextOrder,
      nextPhaseIds: [],
      tasks: [],
    };

    setPlannedPhases((prev) => {
      if (prev.length === 0) return [newPhase];
      const cloned = prev.map((phase) => ({ ...phase, nextPhaseIds: [...(phase.nextPhaseIds || [])] }));
      const tail = cloned[cloned.length - 1];
      if ((tail.nextPhaseIds || []).length === 0) {
        tail.nextPhaseIds = [newPhase.id];
      }
      return [...cloned, newPhase];
    });
    setSelectedPhaseId(newPhase.id);
  };

  const deleteSelectedPhase = () => {
    if (!selectedPhase) return;
    if (!window.confirm(`确认删除节点“${selectedPhase.name}”及其任务吗？`)) return;

    const removedPhaseId = selectedPhase.id;

    setPlannedPhases((prev) => {
      const filtered = prev
        .filter((phase) => phase.id !== selectedPhase.id)
        .map((phase, idx) => ({
          ...phase,
          order: idx + 1,
          nextPhaseIds: (phase.nextPhaseIds || []).filter((id) => id !== selectedPhase.id),
          tasks: phase.tasks.map((task: any) => ({ ...task, phaseOrder: idx + 1 })),
        }));
      setSelectedPhaseId(filtered[0]?.id || '');
      return filtered;
    });
    setPlannedMilestones((prev) => prev.map((m) => m.phaseId === removedPhaseId ? { ...m, phaseId: '', phaseName: '' } : m));
  };

  const updateSelectedPhaseName = (nameValue: string) => {
    if (!selectedPhase) return;
    setPlannedPhases((prev) => prev.map((phase) => {
      if (phase.id !== selectedPhase.id) return phase;
      return {
        ...phase,
        name: nameValue,
        tasks: phase.tasks.map((task: any) => ({ ...task, phase: nameValue })),
      };
    }));
  };

  const addTaskToSelectedPhase = () => {
    if (!selectedPhase) return;
    const task = {
      id: `task_${Date.now()}`,
      title: '新增任务',
      priority: '中',
      status: '待开始',
      phase: selectedPhase.name,
      phaseId: selectedPhase.id,
      phaseOrder: selectedPhase.order,
      estimatedDays: 3,
      description: '',
      dueDate: '',
    };

    setPlannedPhases((prev) => prev.map((phase) => {
      if (phase.id !== selectedPhase.id) return phase;
      return { ...phase, tasks: [...phase.tasks, task] };
    }));
  };

  const updateTaskInSelectedPhase = (taskId: string, field: string, value: any) => {
    if (!selectedPhase) return;
    setPlannedPhases((prev) => prev.map((phase) => {
      if (phase.id !== selectedPhase.id) return phase;
      return {
        ...phase,
        tasks: phase.tasks.map((task: any) => task.id === taskId ? { ...task, [field]: value } : task),
      };
    }));
  };

  const moveTaskToPhase = (taskId: string, targetPhaseId: string) => {
    if (!targetPhaseId) return;

    setPlannedPhases((prev) => {
      let movingTask: any = null;
      const removed = prev.map((phase) => {
        const remain = phase.tasks.filter((task: any) => {
          const isTarget = task.id === taskId;
          if (isTarget) movingTask = task;
          return !isTarget;
        });
        return { ...phase, tasks: remain };
      });

      if (!movingTask) return prev;
      return removed.map((phase) => {
        if (phase.id !== targetPhaseId) return phase;
        return {
          ...phase,
          tasks: [
            ...phase.tasks,
            {
              ...movingTask,
              phase: phase.name,
              phaseId: phase.id,
              phaseOrder: phase.order,
            },
          ],
        };
      });
    });

    setSelectedPhaseId(targetPhaseId);
  };

  const removeTaskFromSelectedPhase = (taskId: string) => {
    if (!selectedPhase) return;
    setPlannedPhases((prev) => prev.map((phase) => {
      if (phase.id !== selectedPhase.id) return phase;
      return { ...phase, tasks: phase.tasks.filter((task: any) => task.id !== taskId) };
    }));
  };

  const addPhaseConnection = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setPlannedPhases((prev) => prev.map((phase) => {
      if (phase.id !== sourceId) return phase;
      return { ...phase, nextPhaseIds: [...new Set([...(phase.nextPhaseIds || []), targetId])] };
    }));
  };

  const removePhaseConnection = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId) return;
    setPlannedPhases((prev) => prev.map((phase) => {
      if (phase.id !== sourceId) return phase;
      return { ...phase, nextPhaseIds: (phase.nextPhaseIds || []).filter((id) => id !== targetId) };
    }));
  };

  const updatePhasePosition = (phaseId: string, x: number, y: number) => {
    setPlannedPhases((prev) => prev.map((phase) => phase.id === phaseId ? { ...phase, x, y } : phase));
  };

  const updateMilestone = (id: string, field: string, value: any) => {
    setPlannedMilestones((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      if (field === 'phaseId') {
        const phase = plannedPhases.find((p) => p.id === value);
        return { ...item, phaseId: value, phaseName: phase?.name || '' };
      }
      return { ...item, [field]: value };
    }));
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

  const filteredTaskTemplates = taskTemplateList.filter((tpl) => {
    const kw = taskTemplateKeyword.trim().toLowerCase();
    if (!kw) return true;
    return String(tpl.name || '').toLowerCase().includes(kw) || String(tpl.description || '').toLowerCase().includes(kw);
  });

  const loadTaskTemplates = async () => {
    setLoadingTaskTemplates(true);
    try {
      const res = await taskTemplatesAPI.list({ pageSize: 200 });
      const list = (res as any).list || (res as any).data || [];
      setTaskTemplateList(Array.isArray(list) ? list : []);
    } finally {
      setLoadingTaskTemplates(false);
    }
  };

  const openTaskTemplatePicker = async () => {
    if (!selectedPhase) {
      alert('请先选择节点');
      return;
    }
    setSelectedTaskTemplateIds(new Set());
    setTaskTemplateKeyword('');
    setShowTaskTemplatePicker(true);
    if (taskTemplateList.length === 0) {
      await loadTaskTemplates();
    }
  };

  const importSelectedTaskTemplates = () => {
    if (!selectedPhase || selectedTaskTemplateIds.size === 0) return;

    const priorityMap: Record<string, string> = {
      high: '高',
      medium: '中',
      low: '低',
      urgent: '高',
    };

    const selectedTpls = taskTemplateList.filter((tpl) => selectedTaskTemplateIds.has(tpl.id));
    const importedTasks = selectedTpls.map((tpl) => ({
      id: `tpl_task_${Date.now()}_${tpl.id}`,
      title: tpl.name || '模板任务',
      description: tpl.description || '',
      priority: priorityMap[String(tpl.priority || '').toLowerCase()] || '中',
      status: '待开始',
      phase: selectedPhase.name,
      phaseId: selectedPhase.id,
      phaseOrder: selectedPhase.order,
      estimatedDays: Number(tpl.estimatedDays) || 3,
      dueDate: '',
      fromTemplate: true,
      templateRefId: tpl.id,
    }));

    setPlannedPhases((prev) => prev.map((phase) => {
      if (phase.id !== selectedPhase.id) return phase;
      return { ...phase, tasks: [...phase.tasks, ...importedTasks] };
    }));
    setShowTaskTemplatePicker(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">新建项目</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              第 {Math.min(step, totalSteps)}/{totalSteps} 步 · {step === 1 ? '填写基本信息' : step === 2 ? '选择项目模版' : '调整节点与任务'}
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
                <span className="text-xs font-medium">{s === 1 ? '基本信息' : s === 2 ? '选择模版' : '调整节点与任务'}</span>
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
                        onClick={async () => { setSelectedTemplate(tpl); setBlankSelected(false); setTemplatePreviewLoaded(false); setTemplatePreviewError(null); await prefetchTemplatePlan(tpl); }}
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
                        {isSelected && templatePreviewLoaded && (
                          <div className="text-xs text-green-600 mt-1">已加载预览</div>
                        )}
                        {isSelected && templatePreviewError && (
                          <div className="text-xs text-red-600 mt-1">{templatePreviewError}</div>
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
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="font-semibold text-gray-900">先编辑项目节点，再编辑节点任务</div>
                <div className="text-xs text-gray-500 mt-1">任务会绑定到具体节点。可在画布连线定义节点流转，任务编辑区支持变更任务所属节点。</div>
              </div>

              {loadingPlan ? (
                <div className="card p-6 text-center text-gray-500">正在加载模版节点与任务...</div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-3 h-[480px] overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-gray-900">项目节点</div>
                      <button type="button" className="px-2.5 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50" onClick={addPhase}>+ 新增</button>
                    </div>
                    <div className="space-y-2">
                      {plannedPhases.map((phase) => {
                        const selected = selectedPhaseId === phase.id;
                        return (
                          <button
                            key={phase.id}
                            type="button"
                            onClick={() => setSelectedPhaseId(phase.id)}
                            className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                          >
                            <div className="text-sm font-medium text-gray-900 truncate">{phase.order}. {phase.name}</div>
                            <div className="text-xs text-gray-500 mt-1">{phase.tasks.length} 个任务</div>
                          </button>
                        );
                      })}
                      {plannedPhases.length === 0 && (
                        <div className="text-xs text-gray-400 text-center py-6">暂无节点，请先新增节点</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="text-sm font-semibold text-gray-900">节点画布</div>
                        <div className="flex items-center gap-2">
                          <button type="button" className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onClick={addPhase}>+ 新增节点</button>
                          <button type="button" className="px-3 py-1.5 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40" onClick={deleteSelectedPhase} disabled={!selectedPhase}>删除当前节点</button>
                        </div>
                      </div>
                      {selectedPhase && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">当前节点名称</label>
                            <input className="input w-full" value={selectedPhase.name} onChange={(e) => updateSelectedPhaseName(e.target.value)} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">节点编号</label>
                            <input className="input w-full bg-gray-50" value={selectedPhase.order} disabled />
                          </div>
                        </div>
                      )}
                      <div className="h-[280px] rounded-lg border border-gray-100 overflow-hidden">
                        <ProcessFlowDiagram
                          phases={plannedPhases.map((phase) => ({
                            id: phase.id,
                            name: phase.name,
                            order: phase.order,
                            tasks: phase.tasks,
                            enabled: true,
                            x: phase.x,
                            y: phase.y,
                            nextPhaseIds: phase.nextPhaseIds,
                          }))}
                          readonly={false}
                          onPhaseClick={(phase) => setSelectedPhaseId(phase.id)}
                          onPhaseConnect={addPhaseConnection}
                          onEdgeDelete={removePhaseConnection}
                          onNodePositionChange={updatePhasePosition}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-semibold text-gray-900">节点任务编辑</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {selectedPhase ? `当前节点：${selectedPhase.name}` : '请先在左侧或画布选择一个节点'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" className="px-3 py-1.5 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40" onClick={openTaskTemplatePicker} disabled={!selectedPhase}>从任务模板库选择</button>
                          <button type="button" className="btn btn-secondary" onClick={addTaskToSelectedPhase} disabled={!selectedPhase}>+ 新增任务</button>
                        </div>
                      </div>

                      {!selectedPhase ? (
                        <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-lg">请选择节点后再编辑任务</div>
                      ) : selectedPhase.tasks.length === 0 ? (
                        <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-lg">该节点下暂无任务，点击“新增任务”开始编辑</div>
                      ) : (
                        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                          {selectedPhase.tasks.map((task: any, index: number) => (
                            <div key={task.id} className="card p-4 border border-gray-200">
                              <div className="flex items-start gap-3">
                                <div className="mt-2 w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-semibold flex items-center justify-center">{index + 1}</div>
                                <div className="flex-1 grid grid-cols-2 gap-3">
                                  <div className="col-span-2">
                                    <label className="block text-xs text-gray-500 mb-1">任务标题</label>
                                    <input className="input w-full" value={task.title || ''} onChange={(e) => updateTaskInSelectedPhase(task.id, 'title', e.target.value)} />
                                  </div>
                                  <div className="col-span-2">
                                    <label className="block text-xs text-gray-500 mb-1">任务说明</label>
                                    <textarea className="input w-full resize-none" rows={2} value={task.description || ''} onChange={(e) => updateTaskInSelectedPhase(task.id, 'description', e.target.value)} />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">所属节点</label>
                                    <select
                                      className="input w-full bg-white"
                                      value={task.phaseId || selectedPhase.id}
                                      onChange={(e) => moveTaskToPhase(task.id, e.target.value)}
                                    >
                                      {plannedPhases.map((phase) => (
                                        <option key={phase.id} value={phase.id}>{phase.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">优先级</label>
                                    <select className="input w-full bg-white" value={task.priority || '中'} onChange={(e) => updateTaskInSelectedPhase(task.id, 'priority', e.target.value)}>
                                      <option value="高">高</option>
                                      <option value="中">中</option>
                                      <option value="低">低</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">预计工期(天)</label>
                                    <input className="input w-full" type="number" min={1} value={task.estimatedDays ?? 3} onChange={(e) => updateTaskInSelectedPhase(task.id, 'estimatedDays', e.target.value)} />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">截止日期</label>
                                    <input className="input w-full" type="date" value={task.dueDate || ''} onChange={(e) => updateTaskInSelectedPhase(task.id, 'dueDate', e.target.value)} />
                                  </div>
                                </div>
                                <button type="button" className="text-red-500 hover:text-red-700 mt-1" onClick={() => removeTaskFromSelectedPhase(task.id)}>删除</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
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
                  <div key={milestone.id} className="card p-4 border border-gray-200 grid grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">里程碑名称</label>
                      <input className="input w-full" value={milestone.name} onChange={(e) => updateMilestone(milestone.id, 'name', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">日期</label>
                      <input className="input w-full" type="date" value={milestone.date || ''} onChange={(e) => updateMilestone(milestone.id, 'date', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">关联节点</label>
                      <select className="input w-full bg-white" value={milestone.phaseId || ''} onChange={(e) => updateMilestone(milestone.id, 'phaseId', e.target.value)}>
                        <option value="">- 不关联 -</option>
                        {plannedPhases.map((phase) => (
                          <option key={phase.id} value={phase.id}>{phase.name}</option>
                        ))}
                      </select>
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => step === 1 ? onClose() : setStep(1)}
              className="btn btn-secondary"
            >
              {step === 1 ? '取消' : '上一步'}
            </button>
            <button
              onClick={saveDraft}
              type="button"
              className="px-3 py-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
            >
              暂存草稿
            </button>
          </div>
          <button
            onClick={handlePrimaryAction}
            disabled={creating || loadingPlan || (step === 2 && !blankSelected && !selectedTemplate)}
            className="btn btn-primary"
          >
            {creating || loadingPlan ? '处理中...' : step === 1 ? '下一步：选择模版' : step === 2 && hasEditableTemplate ? '下一步：调整节点与任务' : '创建项目'}
          </button>
        </div>

        {showTaskTemplatePicker && (
          <div className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-xl bg-white border border-gray-100 shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">选择任务模板</div>
                  <div className="text-xs text-gray-500 mt-0.5">引用后仍可在右侧任务列表继续编辑</div>
                </div>
                <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setShowTaskTemplatePicker(false)}>×</button>
              </div>

              <div className="p-4 border-b border-gray-100">
                <input className="input w-full" placeholder="搜索模板名称/描述" value={taskTemplateKeyword} onChange={(e) => setTaskTemplateKeyword(e.target.value)} />
              </div>

              <div className="max-h-[52vh] overflow-y-auto p-4 space-y-2">
                {loadingTaskTemplates ? (
                  <div className="text-sm text-gray-400 text-center py-8">加载任务模板中...</div>
                ) : filteredTaskTemplates.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8">暂无可选任务模板</div>
                ) : filteredTaskTemplates.map((tpl) => {
                  const checked = selectedTaskTemplateIds.has(tpl.id);
                  return (
                    <label key={tpl.id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedTaskTemplateIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(tpl.id);
                            else next.delete(tpl.id);
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{tpl.name}</div>
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{tpl.description || '无描述'}</div>
                        <div className="text-xs text-gray-400 mt-1">预计工期：{tpl.estimatedDays || 0} 天</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                <button type="button" className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onClick={() => setShowTaskTemplatePicker(false)}>取消</button>
                <button type="button" className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40" disabled={selectedTaskTemplateIds.size === 0} onClick={importSelectedTaskTemplates}>引用并编辑</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
