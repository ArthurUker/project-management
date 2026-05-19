import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface RegulatorDoc {
  id: string;
  dispatchNo: string;
}

interface TaskRegulatoryDoc {
  regulatoryDocument: RegulatorDoc;
}

interface Task {
  id: string;
  title: string;
  status: string;
  phase?: string;
  priority?: string;
  regulatoryPriority?: string;
  applicabilityStatus?: string;
  taskType?: string;
  expectedDeliverable?: string;
  regulatoryDocuments?: TaskRegulatoryDoc[];
}

interface PhaseGroup {
  majorPhase: string;
  subPhase: string;
  tasks: Task[];
}

interface HierarchicalTaskListProps {
  tasks: Task[];
}

export default function HierarchicalTaskList({ tasks }: HierarchicalTaskListProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  // Group tasks by phase (majorPhase > subPhase)
  const phaseGroups: Map<string, PhaseGroup> = new Map();
  
  tasks.forEach((task) => {
    const phaseParts = (task.phase || '未分配').split(' > ');
    const majorPhase = phaseParts[0];
    const subPhase = phaseParts[1] || '任务';
    const groupKey = `${majorPhase}|${subPhase}`;

    if (!phaseGroups.has(groupKey)) {
      phaseGroups.set(groupKey, {
        majorPhase,
        subPhase,
        tasks: [],
      });
    }

    phaseGroups.get(groupKey)!.tasks.push(task);
  });

  // Sort and structure phases
  const majorPhaseMap: Map<string, PhaseGroup[]> = new Map();
  phaseGroups.forEach((group) => {
    if (!majorPhaseMap.has(group.majorPhase)) {
      majorPhaseMap.set(group.majorPhase, []);
    }
    majorPhaseMap.get(group.majorPhase)!.push(group);
  });

  const togglePhase = (phaseKey: string) => {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(phaseKey)) {
      newExpanded.delete(phaseKey);
    } else {
      newExpanded.add(phaseKey);
    }
    setExpandedPhases(newExpanded);
  };

  const getMajorPhaseColor = (majorPhase: string): string => {
    const colorMap: Record<string, string> = {
      '产品分类与注册策略制定': 'bg-blue-50 border-blue-200 text-blue-900',
      '注册技术文件与产品资料准备': 'bg-purple-50 border-purple-200 text-purple-900',
      '性能验证、临床评价与软件确认': 'bg-pink-50 border-pink-200 text-pink-900',
      'QMS、生产质量与注册提交': 'bg-amber-50 border-amber-200 text-amber-900',
      '审评、批准与上市后管理': 'bg-emerald-50 border-emerald-200 text-emerald-900',
    };
    return colorMap[majorPhase] || 'bg-gray-50 border-gray-200 text-gray-900';
  };

  const getPriorityColor = (priority: string): string => {
    if (priority === 'P0') return 'bg-red-100 text-red-800';
    if (priority === 'P1') return 'bg-orange-100 text-orange-800';
    if (priority === 'P2') return 'bg-yellow-100 text-yellow-800';
    if (priority === 'P3') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getApplicabilityColor = (status: string): string => {
    if (status === 'required') return 'bg-red-50 text-red-700 border-red-100';
    if (status === 'conditional') return 'bg-blue-50 text-blue-700 border-blue-100';
    if (status === 'not_applicable') return 'bg-gray-50 text-gray-700 border-gray-100';
    return 'bg-gray-50 text-gray-700 border-gray-100';
  };

  if (tasks.length === 0) {
    return <p className="text-sm text-gray-500">暂无任务，可在创建时套用模板自动生成。</p>;
  }

  return (
    <div className="space-y-4">
      {Array.from(majorPhaseMap.entries()).map(([majorPhase, subPhases]) => {
        const majorPhaseKey = majorPhase;
        const isExpanded = expandedPhases.has(majorPhaseKey);

        return (
          <div key={majorPhaseKey} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Major Phase Header */}
            <div
              onClick={() => togglePhase(majorPhaseKey)}
              className={`${getMajorPhaseColor(majorPhase)} px-4 py-3 cursor-pointer hover:opacity-90 transition flex items-center justify-between border-b`}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
                <span className="font-semibold">{majorPhase}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-white bg-opacity-50">
                  {subPhases.reduce((sum, sp) => sum + sp.tasks.length, 0)} 项任务
                </span>
              </div>
            </div>

            {/* Sub Phases and Tasks */}
            {isExpanded && (
              <div className="bg-white divide-y divide-gray-100">
                {subPhases.map((subPhaseGroup) => {
                  const subPhaseKey = `${majorPhaseKey}|${subPhaseGroup.subPhase}`;
                  const isSubExpanded = expandedPhases.has(subPhaseKey);

                  return (
                    <div key={subPhaseKey}>
                      {/* Sub Phase Header */}
                      <div
                        onClick={() => togglePhase(subPhaseKey)}
                        className="bg-gray-50 px-6 py-2 cursor-pointer hover:bg-gray-100 transition flex items-center gap-2 border-l-4 border-l-gray-300"
                      >
                        {isSubExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                        )}
                        <span className="text-sm font-medium text-gray-700">
                          {subPhaseGroup.subPhase}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                          {subPhaseGroup.tasks.length}
                        </span>
                      </div>

                      {/* Tasks */}
                      {isSubExpanded && (
                        <div className="divide-y divide-gray-50 bg-white">
                          {subPhaseGroup.tasks.map((task) => (
                            <div key={task.id} className="px-6 py-3 hover:bg-gray-50 transition">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-sm font-medium text-gray-800 flex-1">{task.title}</p>
                                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                                  {task.status}
                                </span>
                              </div>

                              {/* Priority and Type */}
                              <div className="flex flex-wrap gap-2 mb-2">
                                {task.regulatoryPriority && (
                                  <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${getPriorityColor(task.regulatoryPriority)}`}>
                                    优先级 {task.regulatoryPriority}
                                  </span>
                                )}
                                {task.applicabilityStatus && (
                                  <span className={`text-[11px] px-2 py-1 rounded-full border ${getApplicabilityColor(task.applicabilityStatus)}`}>
                                    {task.applicabilityStatus === 'required' && '必需'}
                                    {task.applicabilityStatus === 'conditional' && '条件性'}
                                    {task.applicabilityStatus === 'not_applicable' && '不适用'}
                                    {task.applicabilityStatus === 'to_be_confirmed' && '待确认'}
                                  </span>
                                )}
                                {task.taskType && (
                                  <span className="text-[11px] px-2 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-100">
                                    {task.taskType}
                                  </span>
                                )}
                              </div>

                              {/* Deliverable */}
                              {task.expectedDeliverable && (
                                <p className="text-xs text-gray-500 mb-2">
                                  <span className="font-medium">交付物:</span> {task.expectedDeliverable}
                                </p>
                              )}

                              {/* Regulatory Documents */}
                              {Array.isArray(task.regulatoryDocuments) && task.regulatoryDocuments.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {task.regulatoryDocuments.slice(0, 5).map((r, idx) => (
                                    <span
                                      key={`${task.id}-${idx}`}
                                      className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap"
                                    >
                                      {r.regulatoryDocument?.dispatchNo}
                                    </span>
                                  ))}
                                  {task.regulatoryDocuments.length > 5 && (
                                    <span className="text-[10px] px-2 py-1 text-gray-500">
                                      +{task.regulatoryDocuments.length - 5} 项
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
