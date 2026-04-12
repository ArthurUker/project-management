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
    phase?: string;
    phaseOrder?: number;
    status: string;
  }>;
  onPhaseClick?: (phase: PhaseInfo) => void;
}

export default function PhaseProgressBar({ template, tasks, onPhaseClick }: Props) {
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);

  const phases = useMemo<PhaseInfo[]>(() => {
    let content: any = {};
    try {
      content = template.content
        ? (typeof template.content === 'string' ? JSON.parse(template.content) : template.content)
        : {};
    } catch { /* noop */ }

    const rawPhases: any[] = (content.phases || []).filter((p: any) => p.enabled !== false);
    if (rawPhases.length === 0) return [];

    // Group tasks by phaseId
    const tasksByPhase: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      if (task.phaseId) {
        if (!tasksByPhase[task.phaseId]) tasksByPhase[task.phaseId] = [];
        tasksByPhase[task.phaseId].push(task);
      }
    }

    return rawPhases
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p: any): PhaseInfo => {
        const phaseTasks = tasksByPhase[p.id] || [];
        const tasksTotal = phaseTasks.length;
        const tasksDone = phaseTasks.filter(t => t.status === '已完成').length;
        const inProgress = phaseTasks.some(t => t.status === '进行中');

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

  if (phases.length === 0) return null;

  // Find the current in-progress phase index
  const currentIdx = phases.findIndex(p => p.status === 'in_progress');
  const completedCount = phases.filter(p => p.status === 'completed').length;

  const statusConfig = {
    completed: {
      dot: 'bg-green-500 border-green-500',
      text: 'text-green-700',
      label: '已完成',
    },
    in_progress: {
      dot: 'bg-blue-500 border-blue-500 ring-4 ring-blue-100',
      text: 'text-blue-700 font-semibold',
      label: '进行中',
    },
    not_started: {
      dot: 'bg-white border-gray-300',
      text: 'text-gray-400',
      label: '未开始',
    },
  };

  return (
    <div className="w-full">
      {/* Template label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">来自模版：{template.name}</span>
        <span className="text-xs text-gray-400">
          {completedCount}/{phases.length} 阶段完成
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex items-start overflow-x-auto pb-2 scrollbar-hide">
        {phases.map((phase, idx) => {
          const config = statusConfig[phase.status];
          const isActive = activePhaseId === phase.id;
          const isCurrent = phase.status === 'in_progress';

          return (
            <div key={phase.id} className="flex items-start shrink-0">
              {/* Phase node */}
              <div
                className={`flex flex-col items-center cursor-pointer group ${idx === currentIdx ? '' : ''}`}
                onClick={() => {
                  setActivePhaseId(isActive ? null : phase.id);
                  onPhaseClick?.(phase);
                }}
              >
                {/* Dot and line */}
                <div className="flex items-center">
                  {idx > 0 && (
                    <div className={`h-0.5 w-8 ${phases[idx - 1].status === 'completed' ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                  <div
                    className={`w-4 h-4 rounded-full border-2 transition-all ${config.dot} ${isActive ? 'scale-125' : 'group-hover:scale-110'}`}
                    title={config.label}
                  />
                  {idx < phases.length - 1 && (
                    <div className={`h-0.5 w-8 ${phase.status === 'completed' ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>

                {/* Phase name */}
                <div className={`mt-2 text-center max-w-[80px] ${config.text}`}>
                  <p className="text-xs leading-tight truncate" title={phase.name}>{phase.name}</p>
                  {phase.tasksTotal > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">{phase.tasksDone}/{phase.tasksTotal}</p>
                  )}
                  {isCurrent && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-xs leading-none">当前</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active phase task preview */}
      {activePhaseId && (() => {
        const phase = phases.find(p => p.id === activePhaseId);
        if (!phase) return null;
        const phaseTasks = tasks.filter(t => t.phaseId === activePhaseId);
        if (phaseTasks.length === 0) return null;
        return (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-xs font-medium text-gray-600 mb-2">{phase.name} 的任务</p>
            <div className="space-y-1">
              {phaseTasks.map((task, tIdx) => (
                <div key={task.id ?? `task-${phase.id}-${tIdx}`} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    task.status === '已完成' ? 'bg-green-500' :
                    task.status === '进行中' ? 'bg-blue-500' :
                    task.status === '已阻塞' ? 'bg-red-500' :
                    'bg-gray-300'
                  }`} />
                  <span className={`${task.status === '已完成' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {task.title}
                  </span>
                  <span className="ml-auto text-gray-400">{task.status}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
