import { useMemo, useState } from 'react';

interface PhaseInfo {
  id: string;
  name: string;
  order: number;
  type: 'normal' | 'milestone' | 'approval';
  status: 'completed' | 'in_progress' | 'not_started';
  tasksDone: number;
  tasksTotal: number;
}

interface Props {
  template: {
    content?: string;
    name: string;
  };
  tasks: Array<{
    id: string;
    title: string;
    phaseId?: string;
    /** 项目实例任务的模板任务 id（apply-template 时写入），用于与 config 阶段关联 */
    templateTaskId?: string;
    phase?: string;
    phaseOrder?: number;
    status: string;
  }>;
  onPhaseClick?: (phase: PhaseInfo) => void;
}

/**
 * 阶段流转进度条（v2，2026-10-12）
 * 二级流转可视化：阶段（关键节点）横向排列，每个阶段卡片内直接呈现其下任务，
 * 「阶段内任务全部收口 → 阶段节点完成 → 流转至下一阶段」的语义用节点/连线/箭头颜色表达
 * （与飞书项目的「节点-多任务收口」模型一致）。
 */
export default function PhaseProgressBar({ template, tasks, onPhaseClick }: Props) {
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);

  const phases = useMemo<PhaseInfo[]>(() => {
    let content: any = {};
    try {
      // v2（2026-10-12）：模板完整结构存在 config（编辑器保存处）；兼容旧的 content 字段
      const raw = (template as any).content ?? (template as any).config;
      content = raw
        ? (typeof raw === 'string' ? JSON.parse(raw) : raw)
        : {};
    } catch { /* noop */ }

    const rawPhases: any[] = (content.phases || []).filter((p: any) => p.enabled !== false);
    if (rawPhases.length === 0) return [];

    // 模板任务 id → 所属阶段 id：项目实例任务的 phaseId 指向「实例阶段」，
    // 与 config 中的「模板阶段」id 不同，需经 templateTaskId 反查归属（v2，2026-10-12）
    const taskToPhase = new Map<string, string>();
    for (const p of rawPhases) {
      for (const t of p.tasks ?? []) taskToPhase.set(String(t.id), String(p.id));
    }

    // Group tasks by phase
    const tasksByPhase: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      const phaseKey = (task.templateTaskId && taskToPhase.get(String(task.templateTaskId))) || task.phaseId;
      if (phaseKey) {
        if (!tasksByPhase[phaseKey]) tasksByPhase[phaseKey] = [];
        tasksByPhase[phaseKey].push(task);
      }
    }

    return rawPhases
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p: any): PhaseInfo => {
        const phaseTasks = tasksByPhase[p.id] || [];
        const tasksTotal = phaseTasks.length;
        const tasksDone = phaseTasks.filter(t => t.status === 'COMPLETED').length;
        const inProgress = phaseTasks.some(t => t.status === 'IN_PROGRESS');

        let status: 'completed' | 'in_progress' | 'not_started';
        if (tasksTotal === 0) {
          status = 'not_started';
        } else if (tasksDone === tasksTotal) {
          status = 'completed';
        } else if (tasksDone > 0 || inProgress) {
          status = 'in_progress';
        } else {
          status = 'not_started';
        }

        return {
          id: p.id,
          name: p.name,
          order: p.order ?? 0,
          type: p.type || 'normal',
          status,
          tasksDone,
          tasksTotal,
        };
      });
  }, [template, tasks]);

  const tasksByPhase = useMemo(() => {
    const map: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      if (task.phaseId) {
        if (!map[task.phaseId]) map[task.phaseId] = [];
        map[task.phaseId].push(task);
      }
    }
    return map;
  }, [tasks]);

  if (phases.length === 0) return null;

  const completedCount = phases.filter(p => p.status === 'completed').length;

  const statusConfig = {
    completed: {
      dot: 'bg-green-500 border-green-500',
      text: 'text-green-700',
      label: '已完成',
      card: 'border-green-200 bg-green-50/70',
      line: 'bg-green-400',
      chevron: 'text-green-400',
    },
    in_progress: {
      dot: 'bg-blue-500 border-blue-500 ring-4 ring-blue-100',
      text: 'text-blue-700 font-semibold',
      label: '进行中',
      card: 'border-blue-300 bg-blue-50/70 shadow-sm',
      line: 'bg-blue-300',
      chevron: 'text-blue-400',
    },
    not_started: {
      dot: 'bg-white border-gray-300',
      text: 'text-gray-400',
      label: '未开始',
      card: 'border-gray-200 bg-white',
      line: 'bg-gray-200',
      chevron: 'text-gray-300',
    },
  };

  /** 任务状态点颜色 */
  const taskDot = (status: string) =>
    status === 'COMPLETED' ? 'bg-green-500'
      : status === 'IN_PROGRESS' ? 'bg-blue-500'
      : status === '已阻塞' ? 'bg-red-500'
      : 'bg-gray-300';

  return (
    <div className="w-full">
      {/* Template label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">来自模版：{template.name}</span>
        <span className="text-xs text-gray-400">
          {completedCount}/{phases.length} 阶段完成
        </span>
      </div>

      {/* 二级流转：阶段卡片（卡片内直接呈现任务） */}
      <div className="flex items-stretch overflow-x-auto pb-2 scrollbar-hide">
        {phases.map((phase, idx) => {
          const config = statusConfig[phase.status];
          const isActive = activePhaseId === phase.id;
          const isCurrent = phase.status === 'in_progress';
          const phaseTasks = tasksByPhase[phase.id] || [];
          // 收口语义：上一阶段全部任务完成，连线才点亮（否则为灰色未流转）
          const prevDone = idx === 0 || phases[idx - 1].status === 'completed';

          return (
            <div key={phase.id ?? `phase-${idx}`} className="flex items-stretch shrink-0">
              {/* 阶段间流转连线 + 箭头 */}
              {idx > 0 && (
                <div className="flex items-center px-0.5" title={prevDone ? '已流转' : '待上一阶段收口'}>
                  <div className={`h-0.5 w-5 ${prevDone ? config.line : 'bg-gray-200'}`} />
                  <svg className={`w-3.5 h-3.5 -ml-0.5 ${prevDone ? config.chevron : 'text-gray-300'}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}

              {/* 阶段卡片 */}
              <div
                className={`w-[176px] shrink-0 rounded-lg border p-2.5 cursor-pointer transition-all hover:shadow-md ${config.card} ${isActive ? 'ring-2 ring-blue-400' : ''}`}
                onClick={() => {
                  setActivePhaseId(isActive ? null : phase.id);
                  onPhaseClick?.(phase);
                }}
              >
                {/* 卡片头：状态点 + 阶段名 + 里程碑标记 */}
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${config.dot}`} title={config.label} />
                  <span className={`text-xs leading-tight truncate ${config.text}`} title={phase.name}>{phase.name}</span>
                  {phase.type === 'milestone' && (
                    <span className="ml-auto shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] leading-none text-amber-700" title="里程碑节点">里程碑</span>
                  )}
                </div>

                {/* 进度行：任务收口数 + 状态 */}
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">
                    {phase.tasksDone}/{phase.tasksTotal} 任务
                  </span>
                  {phase.status === 'completed' ? (
                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ) : isCurrent ? (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] leading-none text-blue-600">当前</span>
                  ) : null}
                </div>

                {/* 任务列表（二级流转内容） */}
                <div className="mt-2 max-h-[152px] space-y-1 overflow-y-auto border-t border-gray-100 pt-2">
                  {phaseTasks.length === 0 ? (
                    <div className="text-[11px] text-gray-300">暂无任务</div>
                  ) : (
                    phaseTasks.map((task, tIdx) => (
                      <div key={task.id ?? `task-${phase.id}-${tIdx}`} className="flex items-center gap-1.5" title={`${task.title}（${task.status}）`}>
                        <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${taskDot(task.status)}`} />
                        <span className={`truncate text-[11px] ${task.status === 'COMPLETED' ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                          {task.title}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 图例：收口流转说明 */}
      <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-green-400" />已流转（上一阶段任务全部收口）</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-gray-200" />待流转</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />已完成</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />进行中</span>
      </div>
    </div>
  );
}
