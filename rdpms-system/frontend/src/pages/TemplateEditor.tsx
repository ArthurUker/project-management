import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { projectTemplatesAPI, taskAPI } from '../api/client';
import ProcessFlowDiagram from '../components/ProcessFlowDiagram';
import { AlignLeft, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PhaseTask {
  id: string;
  title: string;
  priority: '高' | '中' | '低';
  estimatedDays: number;
  role: string;
  source: 'self' | 'inherited';
  enabled: boolean;
}

interface Phase {
  id: string;
  name: string;
  order: number;
  type: 'normal' | 'milestone' | 'approval';
  source: 'self' | 'inherited';
  enabled: boolean;
  completionTip: string;
  allowSkip: boolean;
  tasks: PhaseTask[];
}

interface Milestone {
  id: string;
  name: string;
  phaseId: string;
  offsetDays: number;
}

// ─── Phase Node (sortable) ─────────────────────────────────────────────────

function PhaseNode({ phase, isSelected, onClick }: {
  phase: Phase;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const typeColors: Record<string, string> = {
    normal: isSelected ? 'border-primary-500 bg-primary-50' : 'border-blue-300 bg-blue-50',
    milestone: isSelected ? 'border-orange-500 bg-orange-50' : 'border-orange-300 bg-orange-50',
    approval: isSelected ? 'border-purple-500 bg-purple-50' : 'border-purple-300 bg-purple-50',
  };

  const typeIcons: Record<string, string> = {
    normal: '📋',
    milestone: '🎯',
    approval: '✅',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`border-2 rounded-lg p-3 cursor-pointer select-none transition-all ${typeColors[phase.type]} ${
          phase.enabled ? '' : 'opacity-50 border-dashed'
        }`}
        onClick={onClick}
      >
        <div className="flex items-center gap-2">
          {/* drag handle */}
          <span
            {...attributes}
            {...listeners}
            className="text-gray-300 cursor-grab active:cursor-grabbing"
            onClick={e => e.stopPropagation()}
          >
            ⠿
          </span>
          <span className="text-xs">{typeIcons[phase.type]}</span>
          <span className={`text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold ${
            phase.type === 'milestone' ? 'bg-orange-500 text-white' :
            phase.type === 'approval' ? 'bg-purple-500 text-white' :
            'bg-blue-500 text-white'
          }`}>{phase.order}</span>
          <span className={`flex-1 text-sm font-medium truncate ${!phase.enabled ? 'line-through text-gray-400' : ''}`}>
            {phase.name}
          </span>
          {phase.source === 'inherited' && <span title="继承" className="text-gray-400 text-xs">🔒</span>}
        </div>
        <div className="ml-8 mt-1 flex gap-3 text-xs text-gray-400">
          <span>{phase.tasks.filter(t => t.enabled).length} 任务</span>
          <span>~{phase.tasks.filter(t=>t.enabled).reduce((s,t)=>s+t.estimatedDays,0)} 天</span>
        </div>
      </div>
      {/* connector arrow */}
      <div className="flex justify-center py-1">
        <span className="text-gray-300 text-xs">↓</span>
      </div>
    </div>
  );
}

// ─── Task Row ──────────────────────────────────────────────────────────────

function TaskRow({ task, onChange, onDelete }: {
  task: PhaseTask;
  onChange: (updates: Partial<PhaseTask>) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`flex items-center gap-2 py-2 border-b border-gray-100 last:border-0 ${!task.enabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={task.enabled}
        onChange={e => onChange({ enabled: e.target.checked })}
        title="启用/禁用任务"
      />
      <input
        className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-primary-400"
        value={task.title}
        onChange={e => onChange({ title: e.target.value })}
        placeholder="任务名称"
      />
      <select
        className="text-xs border border-gray-200 rounded px-1 py-1"
        value={task.priority}
        onChange={e => onChange({ priority: e.target.value as any })}
      >
        <option value="高">高</option>
        <option value="中">中</option>
        <option value="低">低</option>
      </select>
      <input
        type="number"
        className="w-14 text-xs border border-gray-200 rounded px-1 py-1 text-center"
        value={task.estimatedDays}
        min={1}
        onChange={e => onChange({ estimatedDays: parseInt(e.target.value) || 1 })}
        title="预计天数"
      />
      <span className="text-xs text-gray-400">天</span>
      {task.source === 'inherited' && <span className="text-gray-300 text-xs" title="继承">🔒</span>}
      <button
        className="text-gray-300 hover:text-red-500 text-xs"
        onClick={onDelete}
        title="删除任务"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────

function PhasePanel({ phase, onChange, onDelete }: {
  phase: Phase;
  onChange: (updates: Partial<Phase>) => void;
  onDelete: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'tasks'>('tasks');

  function addTask() {
    const newTask: PhaseTask = {
      id: `task_${Date.now()}`,
      title: '新任务',
      priority: '中',
      estimatedDays: 3,
      role: 'member',
      source: 'self',
      enabled: true,
    };
    onChange({ tasks: [...phase.tasks, newTask] });
  }

  function updateTask(taskId: string, updates: Partial<PhaseTask>) {
    onChange({ tasks: phase.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) });
  }

  function deleteTask(taskId: string) {
    onChange({ tasks: phase.tasks.filter(t => t.id !== taskId) });
  }

  const totalDays = phase.tasks.filter(t => t.enabled).reduce((s, t) => s + t.estimatedDays, 0);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">阶段配置</h3>
          <button
            className="text-xs text-red-500 hover:text-red-700"
            onClick={onDelete}
          >
            删除阶段
          </button>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            className={`px-3 py-1.5 rounded ${activeTab === 'tasks' ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('tasks')}
          >
            任务列表
          </button>
          <button
            className={`px-3 py-1.5 rounded ${activeTab === 'info' ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('info')}
          >
            基础信息
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'info' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">阶段名称</label>
              <input
                className="input w-full text-sm"
                value={phase.name}
                onChange={e => onChange({ name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">节点类型</label>
              <div className="flex gap-2">
                {(['normal', 'milestone', 'approval'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => onChange({ type: t })}
                    className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                      phase.type === t
                        ? t === 'milestone' ? 'bg-orange-500 text-white border-orange-500'
                        : t === 'approval' ? 'bg-purple-500 text-white border-purple-500'
                        : 'bg-blue-500 text-white border-blue-500'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {t === 'normal' ? '普通' : t === 'milestone' ? '里程碑' : '审批'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">完成提示</label>
              <textarea
                className="input w-full text-sm resize-none"
                rows={3}
                placeholder="完成该阶段前的提示信息"
                value={phase.completionTip}
                onChange={e => onChange({ completionTip: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={phase.enabled}
                  onChange={e => onChange({ enabled: e.target.checked })}
                />
                启用该阶段
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={phase.allowSkip}
                  onChange={e => onChange({ allowSkip: e.target.checked })}
                />
                允许跳过
              </label>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500">{phase.tasks.filter(t=>t.enabled).length} 个任务 · 约 {totalDays} 天</span>
              <button
                className="text-xs px-2 py-1 bg-primary-50 text-primary-600 rounded hover:bg-primary-100"
                onClick={addTask}
              >
                + 添加任务
              </button>
            </div>
            {phase.tasks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">暂无任务，点击上方添加</p>
            ) : (
              phase.tasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onChange={updates => updateTask(task.id, updates)}
                  onDelete={() => deleteTask(task.id)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<any>(null);
  const [phases, setPhases] = useState<Phase[]>([]);

  // 将所有阶段的任务展平，附带阶段信息
  const allTasks = useMemo(() => {
    return (phases ?? []).flatMap((phase) =>
      (phase.tasks ?? []).map((task) => ({
        ...task,
        phaseId: phase.id,
        phaseName: phase.name,
        phaseOrder: phase.order ?? 0,
      }))
    );
  }, [phases]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);

  // 并行阶段选择弹窗
  const [parallelModal, setParallelModal] = useState<null | { open: boolean; sourceId: string; targetId: string }>(null);

  const handleAddParallel = useCallback((sourceId: string, targetId: string) => {
    setParallelModal({ open: true, sourceId, targetId });
  }, []);

  function updateSelectedPhaseField(key: string, value: any) {
    if (!selectedPhase) return;
    updatePhase(selectedPhase.id, { [key]: value });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (id) fetchTemplate();
  }, [id]);

  async function fetchTemplate() {
    setLoading(true);
    try {
      const res = await projectTemplatesAPI.get(id!);
      setTemplate(res);

      let content: any = {};
      if ((res as any).content) {
        try {
          content = typeof (res as any).content === 'string'
            ? JSON.parse((res as any).content)
            : (res as any).content;
        } catch { /* noop */ }
      }

      const loaded: Phase[] = ((content.phases || []) as any[]).map((p: any, idx: number) => ({
        ...p,
        id: p.id || `phase_${Date.now()}_${idx}`,
        name: p.name || `阶段 ${idx + 1}`,
        order: p.order ?? idx + 1,
        type: p.type || 'normal',
        source: p.source || 'self',
        enabled: p.enabled !== false,
        completionTip: p.completionTip || '',
        allowSkip: p.allowSkip || false,
        tasks: ((p.tasks || []) as any[]).map((t: any, ti: number) => ({
          id: t.id || `task_${Date.now()}_${ti}`,
          title: t.title || '任务',
          priority: t.priority || '中',
          estimatedDays: t.estimatedDays || 3,
          role: t.role || 'member',
          source: t.source || 'self',
          enabled: t.enabled !== false,
        })),
      }));

      setPhases(loaded.sort((a, b) => a.order - b.order));
      setMilestones((content.milestones || []).map((m: any, i: number) => ({
        id: m.id || `ms_${i}`,
        name: m.name || '里程碑',
        phaseId: m.phaseId || '',
        offsetDays: m.offsetDays || 0,
      })));
    } catch (e) {
      console.error(e);
      alert('加载模版失败');
    } finally {
      setLoading(false);
    }
  }

  // 拖拽连线回调：建立阶段流转关系（旧名兼容）
  const handlePhaseConnect = useCallback(async (sourceId: string, targetId: string) => {
    try {
      await api.post(`/phases/${sourceId}/transitions`, { toPhaseId: targetId });
      await fetchTemplate();
    } catch (err: any) {
      console.error('建立阶段流转失败', err);
    }
  }, []);

  // 在右侧面板中添加后继阶段（并行）
  const handleAddTransition = useCallback(
    async (fromId: string, toId: string) => {
      try {
        await api.post(`/phases/${fromId}/transitions`, { toPhaseId: toId });
        await fetchTemplate();
        setSelectedPhase((prev: any) =>
          prev
            ? { ...prev, nextPhaseIds: [...(prev.nextPhaseIds ?? []), toId] }
            : prev
        );
        console.log('后继阶段已添加');
      } catch (err: any) {
        console.error('添加后继阶段失败', err);
        alert(err?.response?.data?.error ?? '添加失败');
      }
    },
    []
  );

  // 右侧面板：删除后继阶段
  const handleRemoveTransition = useCallback(
    async (fromId: string, toId: string) => {
      try {
        await api.delete(`/phases/${fromId}/transitions/${toId}`);
        await fetchTemplate();
        setSelectedPhase((prev: any) =>
          prev ? { ...prev, nextPhaseIds: (prev.nextPhaseIds ?? []).filter((id: string) => id !== toId) } : prev
        );
        console.log('后继阶段已移除');
      } catch (err: any) {
        console.error('移除后继阶段失败', err);
        alert('移除失败');
      }
    },
    []
  );

  // 流程图上删除连线时调用（同步后端）
  const handleEdgeDelete = useCallback(
    async (fromId: string, toId: string) => {
      try {
        await api.delete(`/phases/${fromId}/transitions/${toId}`);
        await fetchTemplate();
        console.log('连线已删除');
      } catch (err: any) {
        console.error('删除连线失败', err);
        alert('删除失败');
      }
    },
    []
  );

  // 拖拽放置操作：设为并行（来自画布的 drop menu）
  const handleDropParallel = useCallback(async (draggedPhaseId: string, targetPhaseId: string) => {
    try {
      // 找到 target 的前置阶段（即那些指向 target 的阶段），取第一个作为分叉点
      const prevPhase = phases.find(p => (p.nextPhaseIds ?? []).includes(targetPhaseId));

      // ① 前置 -> dragged（分叉）
      if (prevPhase) {
        await api.post(`/phases/${prevPhase.id}/transitions`, { toPhaseId: draggedPhaseId });
      }

      // ② dragged -> target 的后继（汇合点），与 target 共享汇合后继
      const targetPhase = phases.find(p => p.id === targetPhaseId);
      const mergeNodeId = (targetPhase?.nextPhaseIds ?? [])[0];
      if (mergeNodeId) {
        await api.post(`/phases/${draggedPhaseId}/transitions`, { toPhaseId: mergeNodeId }).catch(() => {});
      }

      // ③ 如果 dragged 原来有前置，将其断开（避免保留旧串行关系），但不要删除与新 prevPhase 相同的引用
      const draggedPrevPhase = phases.find(p => (p.nextPhaseIds ?? []).includes(draggedPhaseId));
      if (draggedPrevPhase && draggedPrevPhase.id !== prevPhase?.id) {
        await api.delete(`/phases/${draggedPrevPhase.id}/transitions/${draggedPhaseId}`).catch(() => {});
      }

      await fetchTemplate();
      console.log('已设为并行阶段');
    } catch (err: any) {
      console.error('设为并行失败', err);
      alert(err?.response?.data?.error ?? '设为并行失败');
    }
  }, [phases]);

  // 拖拽放置操作：插入到目标节点之后
  const handleDropInsertAfter = useCallback(async (draggedPhaseId: string, targetPhaseId: string) => {
    try {
      const targetPhase = phases.find(p => p.id === targetPhaseId);
      const targetNextIds = targetPhase?.nextPhaseIds ?? [];

      // 1. target -> dragged
      await api.post(`/phases/${targetPhaseId}/transitions`, { toPhaseId: draggedPhaseId });

      // 2. dragged -> 原后继
      if (targetNextIds.length > 0) {
        await api.post(`/phases/${draggedPhaseId}/transitions`, { toPhaseId: targetNextIds[0] });
        // 3. 删除 target -> 原后继
        await api.delete(`/phases/${targetPhaseId}/transitions/${targetNextIds[0]}`);
      }

      await fetchTemplate();
      console.log('已插入到节点之后');
    } catch (err: any) {
      console.error('插入失败', err);
      alert(err?.response?.data?.error ?? '插入失败');
    }
  }, [phases]);

  // 兼容旧名：handleConnect （一些 JSX 仍引用此名）
  const handleConnect = useCallback(async (sourceId: string, targetId: string) => {
    // delegate to handlePhaseConnect
    await handlePhaseConnect(sourceId, targetId);
  }, [handlePhaseConnect]);

  // 阶段节点点击回调
  const handlePhaseClick = useCallback((phase: any) => {
    setSelectedPhase(phase);
    setRightPanelOpen(true);
    setActiveTab(0);
  }, []);

  // 自动对齐（触发重新布局 reLayout）
  const handleAutoLayout = useCallback(() => {
    window.dispatchEvent(new CustomEvent('flow:reLayout'));
  }, []);

  const handleAddPrerequisite = useCallback(async (prerequisiteId: string) => {
    if (!selectedTask) return;
    try {
      await api.post(`/tasks/${selectedTask.id}/prerequisites`, { prerequisiteId });
      await fetchTemplate();
      setSelectedTask((prev: any) => ({
        ...prev,
        prerequisites: [ ...(prev?.prerequisites ?? []), { prerequisiteId } ]
      }));
    } catch (err: any) {
      console.error('添加前置任务失败', err);
    }
  }, [selectedTask]);

  const handleRemovePrerequisite = useCallback(async (prerequisiteId: string) => {
    if (!selectedTask) return;
    try {
      await api.delete(`/tasks/${selectedTask.id}/prerequisites/${prerequisiteId}`);
      await fetchTemplate();
      setSelectedTask((prev: any) => ({
        ...prev,
        prerequisites: (prev?.prerequisites ?? []).filter((p: any) => p.prerequisiteId !== prerequisiteId)
      }));
    } catch (err: any) {
      console.error('移除前置任务失败', err);
    }
  }, [selectedTask]);

  function addPhase() {
    const newPhase: Phase = {
      id: `phase_${Date.now()}`,
      name: '新阶段',
      order: phases.length + 1,
      type: 'normal',
      source: 'self',
      enabled: true,
      completionTip: '',
      allowSkip: false,
      tasks: [],
    };
    const updated = [...phases, newPhase];
    setPhases(updated);
    setSelectedPhase(newPhase);
  }

  function handleAddMilestone() {
    const ms: Milestone = {
      id: `ms_${Date.now()}`,
      name: '新里程碑',
      phaseId: phases[0]?.id || '',
      offsetDays: 0,
    };
    setMilestones(prev => [...prev, ms]);
  }

  function updatePhase(phaseId: string, updates: Partial<Phase>) {
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, ...updates } : p));
  }

  function deletePhase(phaseId: string) {
    setPhases(prev => {
      const filtered = prev.filter(p => p.id !== phaseId);
      return filtered.map((p, i) => ({ ...p, order: i + 1 }));
    });
    if (selectedPhase?.id === phaseId) setSelectedPhase(null);
  }

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPhases(prev => {
      const oldIdx = prev.findIndex(p => p.id === active.id);
      const newIdx = prev.findIndex(p => p.id === over.id);
      return arrayMove(prev, oldIdx, newIdx).map((p, i) => ({ ...p, order: i + 1 }));
    });
  }

  async function saveTemplate() {
    if (!template) return;
    const content = {
      phases: phases.map(p => ({
        id: p.id,
        name: p.name,
        order: p.order,
        type: p.type,
        source: p.source,
        enabled: p.enabled,
        completionTip: p.completionTip,
        allowSkip: p.allowSkip,
        tasks: p.tasks.map(t => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          estimatedDays: t.estimatedDays,
          role: t.role,
          source: t.source,
          enabled: t.enabled,
        })),
      })),
      milestones,
    };

    setSaving(true);
    try {
      await projectTemplatesAPI.patch((template as any).id, { content: JSON.stringify(content) });
      alert('模版已保存！');
    } catch (e) {
      console.error(e);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }

  // selectedPhase is now a state object set directly by clicks
  // const selectedPhase = phases.find(p => p.id === selectedPhaseId) ?? null;
  const totalTasks = phases.reduce((s, p) => s + p.tasks.filter(t => t.enabled).length, 0);
  const enabledPhases = phases.filter(p => p.enabled).length;

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>;
  if (!template) return <div className="flex items-center justify-center h-full text-gray-400">模版不存在</div>;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* 顶部栏 */}
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white">
        {/* 左侧：返回 + 标题 */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/project-templates')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">← 返回列表</button>
          <div className="w-px h-4 bg-gray-200" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">{(template as any).name}</span>
              <button onClick={() => {}}><span className="text-gray-400">✎</span></button>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{(template as any).code} · {phases.length} 个阶段 · {totalTasks} 个任务</div>
          </div>
        </div>

        {/* 右侧：工具按钮 + 保存 */}
        <div className="flex items-center gap-2">
          <button onClick={() => {}} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">🔍 搜索</button>
          <button onClick={() => {}} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">批量操作</button>
          <button onClick={() => {}} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">对齐流程图</button>
          <button onClick={() => {}} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">预览</button>
          <div className="w-px h-4 bg-gray-200" />
          <button onClick={saveTemplate} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">{saving ? '保存中...' : '保存模版'}</button>
        </div>
      </div>

      {/* 主内容 */}
      {/* 主体区域 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── 左侧阶段面板 ── */}
        <div
          className={[
            'relative flex-shrink-0 flex flex-col',
            'border-r border-gray-200 bg-white',
            'transition-all duration-300 ease-in-out',
            leftPanelOpen ? 'w-72' : 'w-0 overflow-hidden',
          ].join(' ')}
        >
          {/* 面板内容（折叠时隐藏） */}
          {leftPanelOpen && (
            <div className="flex flex-col h-full w-72">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">阶段流程</span>
                <button
                  onClick={addPhase}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  + 新增阶段
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {phases.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">点击「新增阶段」开始构建流程</p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={phases.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      {phases.map(phase => (
                        <PhaseNode
                          key={phase.id}
                          phase={phase}
                          isSelected={selectedPhase?.id === phase.id}
                          onClick={() => { setSelectedPhase(phase); setRightPanelOpen(true); setActiveTab(0); }}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 左侧收起/展开按钮（悬浮在面板边缘） ── */}
        <button
          onClick={() => setLeftPanelOpen(v => !v)}
          className={[
            'absolute z-20 top-1/2 -translate-y-1/2',
            'flex items-center justify-center',
            'w-5 h-14 rounded-r-xl',
            'bg-blue-500 hover:bg-blue-600 active:bg-blue-700',
            'text-white shadow-lg',
            'transition-all duration-300 ease-in-out',
            'cursor-pointer select-none',
            leftPanelOpen ? 'left-72' : 'left-0',
          ].join(' ')}
          title={leftPanelOpen ? '收起阶段列表' : '展开阶段列表'}
        >
          <svg
            width="10" height="16" viewBox="0 0 10 16" fill="none"
            className={[
              'transition-transform duration-300',
              leftPanelOpen ? 'rotate-0' : 'rotate-180',
            ].join(' ')}
          >
            <path
              d="M7 2L2 8L7 14"
              stroke="white" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>

{/* 中央画布区域 */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* 画布工具栏 */}
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2
                          border-b border-gray-100 bg-white">
            <span className="text-xs text-gray-400">
              {phases.length} 个阶段 · {allTasks.length} 个任务
              {allTasks.length === 0 && (
                <span className="ml-2 text-amber-500">
                  ⚠️ 请先在左侧阶段中添加任务
                </span>
              )}
            </span>
            <div className="flex-1" />
            <button
              onClick={handleAutoLayout}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500
                         border border-gray-200 rounded-md hover:bg-gray-50"
            >
              <AlignLeft size={12} />
              自动对齐
            </button>
          </div>

          {/* React Flow 画布 */}
          {phases.length > 0 ? (
            <div className="flex-1">
              <ProcessFlowDiagram
                phases={phases}
                readonly={false}
                onPhaseConnect={handlePhaseConnect}
                onPhaseClick={handlePhaseClick}
                onAddParallel={handleAddParallel}
                onEdgeDelete={handleEdgeDelete}
                onDropParallel={handleDropParallel}
                onDropInsertAfter={handleDropInsertAfter}
              />
            </div>
          ) : (
            /* 空状态占位 */
            <div className="flex-1 flex flex-col items-center justify-center
                            bg-gray-50 text-gray-400">
              <div className="text-4xl mb-3">🗂</div>
              <div className="text-sm font-medium text-gray-500 mb-1">
                暂无任务节点
              </div>
              <div className="text-xs text-gray-400">
                请先在左侧阶段列表中添加任务，流程图将自动生成
              </div>
            </div>
          )}

          {/* 里程碑展示行 */}
          {milestones && milestones.length > 0 && (
            <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-400 flex-shrink-0">
                  里程碑
                </span>
                {milestones.map((ms: any, i: number) => {
                  const colors = [
                    'bg-red-50 text-red-600 border-red-200',
                    'bg-orange-50 text-orange-600 border-orange-200',
                    'bg-green-50 text-green-600 border-green-200',
                    'bg-blue-50 text-blue-600 border-blue-200',
                    'bg-purple-50 text-purple-600 border-purple-200',
                  ];
                  return (
                    <span
                      key={ms.id}
                      className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full
                                  border text-xs ${colors[i % colors.length]}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                      {ms.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── 右侧收起/展开按钮（悬浮在面板边缘） ── */}
        <button
          onClick={() => { setRightPanelOpen(v => { const next = !v; if (!next) { setSelectedPhase(null); /* clear selection on close */ } return next; }); }}
          className={[ 
            'absolute z-20 top-1/2 -translate-y-1/2',
            'flex items-center justify-center',
            'w-5 h-14 rounded-l-xl',
            rightPanelOpen ? 'right-80' : 'right-0',
            rightPanelOpen
              ? 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700'
              : 'bg-gray-400 hover:bg-blue-500 active:bg-blue-600',
            'text-white shadow-lg',
            'transition-all duration-300 ease-in-out',
            'cursor-pointer select-none',
          ].join(' ')}
          title={rightPanelOpen ? '收起节点信息' : '展开节点信息'}
        >
          <svg
            width="10" height="16" viewBox="0 0 10 16" fill="none"
            className={[
              'transition-transform duration-300',
              rightPanelOpen ? 'rotate-180' : 'rotate-0',
            ].join(' ')}
          >
            <path
              d="M7 2L2 8L7 14"
              stroke="white" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* ── 右侧节点信息面板 ── */}
        <div
          className={[
            'relative flex-shrink-0 flex flex-col',
            'border-l border-gray-200 bg-white',
            'transition-all duration-300 ease-in-out',
            rightPanelOpen ? 'w-80' : 'w-0 overflow-hidden',
          ].join(' ')}
        >
          {rightPanelOpen && selectedPhase && (
            <div className="flex flex-col h-full w-80">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 truncate">{selectedPhase.name}</h3>
                <button onClick={() => { setRightPanelOpen(false); setSelectedPhase(null); }} className="p-1 rounded hover:bg-gray-100 text-gray-400">✕</button>
              </div>

              <div className="flex border-b border-gray-100">
                {['节点信息', '节点流转', '节点事件'].map((tab, i) => (
                  <button key={i} onClick={() => setActiveTab(i)} className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === i ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeTab === 0 && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">节点名称 <span className="text-red-400">*</span></label>
                      <input className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" value={selectedPhase.name} onChange={(e) => updatePhase(selectedPhase.id, { name: e.target.value })} />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">节点类型</label>
                      <div className="flex gap-2">
                        {[{ value: 'normal', label: '普通', color: 'blue' },{ value: 'milestone', label: '里程碑', color: 'orange' },{ value: 'approval', label: '审批', color: 'purple' }].map(({ value, label, color }) => (
                          <button key={value} onClick={() => updatePhase(selectedPhase.id, { type: value as any })} className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${selectedPhase.type === value ? 'border-gray-300 font-medium text-gray-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">节点完成提示</label>
                      <textarea rows={3} placeholder="自定义提醒文案，作为节点二次确认框内容展示" className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" value={selectedPhase.completionTip || ''} onChange={(e) => updatePhase(selectedPhase.id, { completionTip: e.target.value })} />
                    </div>

                    <div className="space-y-3">
                      {[{ key: 'allowSkip', label: '允许跳过节点' },{ key: 'showProgress', label: '展示估分排期填写入口' },{ key: 'requireActualHours', label: '节点需填写实际工时' }].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{label}</span>
                          <button onClick={() => updatePhase(selectedPhase.id, { [key]: !((selectedPhase as any)[key]) })} className={`relative w-8 h-4 rounded-full transition-colors ${((selectedPhase as any)[key]) ? 'bg-blue-500' : 'bg-gray-200'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${((selectedPhase as any)[key]) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-400 mb-1 block">节点 ID</label>
                      <div className="text-xs text-gray-400 font-mono bg-gray-50 px-3 py-2 rounded-md border border-gray-100">{selectedPhase.id}</div>
                    </div>
                  </>
                )}

                {activeTab === 1 && selectedPhase && (
                  <div className="p-4 space-y-6">

                    {/* ── 前置阶段（流入） ── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          前置阶段
                        </label>
                        <span className="text-[10px] text-gray-400">完成后本阶段才可开始</span>
                      </div>

                      {/* 已有前置阶段列表 */}
                      <div className="space-y-1.5 mb-2">
                        {(() => {
                          // 找出所有以 selectedPhase 为 target 的阶段
                          const prevPhases = phases.filter(p =>
                            (p.nextPhaseIds ?? []).includes(selectedPhase.id)
                          );
                          return prevPhases.length === 0 ? (
                            <div className="text-xs text-gray-300 py-3 text-center
                                            border border-dashed border-gray-200 rounded-lg">
                              暂无前置阶段（当前为起始节点）
                            </div>
                          ) : (
                            prevPhases.map(p => (
                              <div key={p.id}
                                className="flex items-center justify-between px-3 py-2
                                           bg-gray-50 border border-gray-200 rounded-lg group"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-500
                                                   text-[10px] font-bold flex items-center
                                                   justify-center flex-shrink-0">
                                    {p.order}
                                  </span>
                                  <span className="text-xs text-gray-600 truncate">{p.name}</span>
                                </div>
                                <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">
                                  {p.tasks?.length ?? 0} 任务
                                </span>
                              </div>
                            ))
                          );
                        })()}
                      </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* ── 后继阶段（流出，支持并行） ── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          后继阶段
                        </label>
                        <span className="text-[10px] text-blue-400 font-medium">
                          可添加多个（并行）
                        </span>
                      </div>

                      {/* 已配置的后继阶段 */}
                      <div className="space-y-1.5 mb-2">
                        {(selectedPhase.nextPhaseIds ?? []).length === 0 ? (
                          <div className="text-xs text-gray-300 py-3 text-center
                                          border border-dashed border-gray-200 rounded-lg">
                            暂无后继阶段（当前为终止节点）
                          </div>
                        ) : (
                          (selectedPhase.nextPhaseIds ?? []).map((nextId: string) => {
                            const nextPhase = phases.find(p => p.id === nextId);
                            return (
                              <div key={nextId}
                                className="flex items-center justify-between px-3 py-2
                                           bg-blue-50 border border-blue-100 rounded-lg group"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-600
                                                   text-[10px] font-bold flex items-center
                                                   justify-center flex-shrink-0">
                                    {nextPhase?.order ?? '?'}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-blue-700 truncate">
                                      {nextPhase?.name ?? nextId}
                                    </div>
                                    <div className="text-[10px] text-blue-400">
                                      {nextPhase?.tasks?.length ?? 0} 任务
                                      {(nextPhase?.totalDays ?? 0) > 0 &&
                                        ` · ~${nextPhase?.totalDays} 天`}
                                    </div>
                                  </div>
                                </div>
                                {/* 删除按钮 */}
                                <button
                                  onClick={() => handleRemoveTransition(selectedPhase.id, nextId)}
                                  className="ml-2 flex-shrink-0 w-6 h-6 rounded-full
                                             flex items-center justify-center
                                             text-blue-300 hover:text-red-400
                                             hover:bg-red-50 transition-colors
                                             opacity-0 group-hover:opacity-100"
                                  title="移除此流转"
                                >
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path d="M2 2l6 6M8 2l-6 6"
                                      stroke="currentColor" strokeWidth="1.8"
                                      strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 添加后继阶段下拉 */}
                      <select
                        className="w-full text-xs border border-gray-200 rounded-lg
                                   px-3 py-2.5 text-gray-600 bg-white
                                   focus:outline-none focus:ring-2 focus:ring-blue-200
                                   cursor-pointer"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddTransition(selectedPhase.id, e.target.value);
                          }
                          e.target.value = '';
                        }}
                      >
                        <option value="">＋ 添加后继阶段（可并行）...</option>
                        {phases
                          .filter(p =>
                            p.id !== selectedPhase.id &&
                            !(selectedPhase.nextPhaseIds ?? []).includes(p.id)
                          )
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              [{p.order}] {p.name}
                              {(p.tasks?.length ?? 0) > 0 ? ` ({p.tasks.length}任务)` : ''}
                            </option>
                          ))
                        }
                      </select>

                      {/* 并行说明 */}
                      {(selectedPhase.nextPhaseIds ?? []).length > 1 && (
                        <div className="mt-2 flex items-center gap-1.5 px-3 py-2
                                        bg-amber-50 border border-amber-200 rounded-lg">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                               className="flex-shrink-0 text-amber-500">
                            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M7 4v3.5M7 9.5v.5"
                              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          <span className="text-[11px] text-amber-600">
                            已配置 {(selectedPhase.nextPhaseIds ?? []).length} 个并行后继阶段，
                            流程图将显示分叉连线
                          </span>
                        </div>
                      )}
                    </div>

                  </div>
                )}
                {activeTab === 2 && (<div className="text-xs text-gray-400 text-center py-8">事件配置开发中</div>)}
              </div>
            </div>
          )}
          {/* 并行阶段选择弹窗 */}
          {parallelModal?.open && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.3)' }}
              onClick={() => setParallelModal(null)}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-96 p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-800">添加并行阶段</h3>
                  <button onClick={() => setParallelModal(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                </div>

                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  选择一个已有阶段，将其设置为
                  <span className="font-medium text-blue-600 mx-1">
                    {phases.find(p => p.id === parallelModal.sourceId)?.name ?? '当前阶段'}
                  </span>
                  的并行后继阶段（与
                  <span className="font-medium text-blue-600 mx-1">
                    {phases.find(p => p.id === parallelModal.targetId)?.name ?? '目标阶段'}
                  </span>
                  同时进行）
                </p>

                <div className="space-y-1.5 max-h-60 overflow-y-auto mb-4">
                  {phases
                    .filter(p => p.id !== parallelModal.sourceId && p.id !== parallelModal.targetId)
                    .map(p => (
                      <button
                        key={p.id}
                        onClick={async () => {
                          // 建立：source → 新并行阶段 的流转
                          await handlePhaseConnect(parallelModal.sourceId, p.id);
                          setParallelModal(null);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                      >
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-colors">{p.order}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-700 truncate">{p.name}</div>
                          <div className="text-xs text-gray-400">{p.tasks?.length ?? 0} 任务{(p.totalDays ?? 0) > 0 && ` · ~${p.totalDays} 天`}</div>
                        </div>
                        <span className="ml-auto text-xs text-blue-400 opacity-0 group-hover:opacity-100">设为并行 →</span>
                      </button>
                    ))}
                </div>

                <button onClick={() => setParallelModal(null)} className="w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
