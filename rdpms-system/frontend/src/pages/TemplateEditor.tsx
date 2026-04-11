import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectTemplatesAPI } from '../api/client';
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
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<number>(0);

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
    setSelectedPhaseId(newPhase.id);
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
    if (selectedPhaseId === phaseId) setSelectedPhaseId(null);
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

  const selectedPhase = phases.find(p => p.id === selectedPhaseId) ?? null;
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
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：阶段列表 */}
        <div className="w-72 shrink-0 flex flex-col bg-gray-50 border-r border-gray-200">
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
                      isSelected={selectedPhaseId === phase.id}
                      onClick={() => setSelectedPhaseId(phase.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* 中央：流程图预览 */}
        <div className="flex-1 flex flex-col bg-gray-50 overflow-auto p-6">
          <div className="flex items-center gap-3 flex-wrap">
            {phases.length === 0 ? (
              <p className="text-gray-400 text-sm">从左侧添加阶段后，流程图将显示在此处</p>
            ) : (
              phases.map((phase, idx) => (
                <div key={phase.id} className="flex items-center">
                  {idx > 0 && <span className="text-gray-300 mx-2">→</span>}
                  <div
                    className={`rounded-lg border-2 p-3 min-w-[100px] cursor-pointer transition-all ${
                      phase.enabled
                        ? phase.type === 'milestone'
                          ? 'border-orange-400 bg-orange-50'
                          : phase.type === 'approval'
                          ? 'border-purple-400 bg-purple-50'
                          : 'border-blue-400 bg-blue-50'
                        : 'border-dashed border-gray-300 bg-gray-50 opacity-50'
                    } ${selectedPhaseId === phase.id ? 'ring-2 ring-primary-400' : ''}`}
                    onClick={() => setSelectedPhaseId(phase.id)}
                  >
                    <div className="text-xs font-medium text-gray-700 truncate max-w-[100px]">{phase.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {phase.tasks.filter(t => t.enabled).length} 任务
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

              {/* 里程碑展示行 */}
          {milestones.length > 0 && (
            <div className="flex-shrink-0 border-t border-gray-100 bg-white px-6 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-medium text-gray-400 flex-shrink-0">里程碑</span>
                {milestones.map((ms, i) => {
                  const colors = [
                    'bg-red-50 text-red-600 border-red-200',
                    'bg-orange-50 text-orange-600 border-orange-200',
                    'bg-green-50 text-green-600 border-green-200',
                    'bg-blue-50 text-blue-600 border-blue-200',
                    'bg-purple-50 text-purple-600 border-purple-200',
                  ];
                  return (
                    <div
                      key={ms.id}
                      title={`关联阶段：${ms.phaseId} · 偏移 ${ms.offsetDays} 天`}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs cursor-pointer hover:opacity-80 transition-opacity ${colors[i % colors.length]}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                      {ms.name}
                    </div>
                  );
                })}
                <button
                  onClick={handleAddMilestone}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 border border-dashed border-gray-200 rounded-full hover:border-gray-300 hover:text-gray-500 transition-colors"
                >
                  + 添加里程碑
                </button>
              </div>
            </div>
          )}

          {/* 统计信息 */}
          <div className="mt-auto pt-6 flex gap-6 text-sm text-gray-500">
            <div>
              <span className="font-medium text-gray-900">{enabledPhases}</span>
              <span className="ml-1">个阶段</span>
            </div>
            <div>
              <span className="font-medium text-gray-900">{totalTasks}</span>
              <span className="ml-1">个任务</span>
            </div>
            <div>
              <span className="font-medium text-gray-900">
                {phases.reduce((s, p) => s + p.tasks.filter(t=>t.enabled).reduce((ss, t) => ss + t.estimatedDays, 0), 0)}
              </span>
              <span className="ml-1">天（预计）</span>
            </div>
            <div>
              <span className="font-medium text-gray-900">{milestones.length}</span>
              <span className="ml-1">个里程碑</span>
            </div>
          </div>
        </div>

        {/* 右侧配置面板 */}
        <div className={`flex-shrink-0 border-l border-gray-200 bg-white transition-all duration-300 overflow-hidden ${selectedPhase ? 'w-72' : 'w-0'}`}>
          {selectedPhase && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 truncate">{selectedPhase.name}</h3>
                <button onClick={() => setSelectedPhaseId(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400">✕</button>
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

                {activeTab === 1 && (<div className="text-xs text-gray-400 text-center py-8">流转配置开发中</div>)}
                {activeTab === 2 && (<div className="text-xs text-gray-400 text-center py-8">事件配置开发中</div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
