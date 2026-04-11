import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface Phase {
  id: string;
  name: string;
  type?: 'normal' | 'milestone' | 'approval';
  source?: 'self' | 'inherited';
  enabled?: boolean;
  tasks?: any[];
}

interface ProcessFlowDiagramProps {
  phases: Phase[];
  onNodeClick?: (phase: Phase) => void;
}

// 自定义节点组件 PhaseNode
const PhaseNode = ({ data, selected }: any) => {
  const typeColors: any = {
    normal: { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' },
    milestone: { bg: '#FFF7ED', border: '#F97316', text: '#C2410C' },
    approval: { bg: '#F5F3FF', border: '#8B5CF6', text: '#6D28D9' },
  };
  const color = typeColors[data.type] || typeColors.normal;
  const isDisabled = data.enabled === false;

  return (
    <div
      className={
        `relative px-4 py-2.5 rounded-lg border-2 cursor-pointer
        transition-all duration-200 min-w-[120px] max-w-[160px]
        ${selected ? 'shadow-lg ring-2 ring-blue-300 ring-offset-1' : 'shadow-sm hover:shadow-md'}
        ${isDisabled ? 'opacity-40 border-dashed border-gray-300 bg-gray-50' : ''}`
      }
      style={isDisabled ? {} : { backgroundColor: color.bg, borderColor: color.border }}
    >
      {data.source === 'inherited' && (
        <span className="absolute -top-1.5 -right-1.5 text-xs bg-white border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
          🔒
        </span>
      )}

      <div className="text-sm font-medium truncate" style={{ color: isDisabled ? '#9CA3AF' : color.text }}>
        {data.label}
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-400">{data.taskCount ?? 0} 任务</span>
        {data.totalDays > 0 && <span className="text-xs text-gray-400">· {data.totalDays} 天</span>}
      </div>

      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-gray-300 !border-white !border-2" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-gray-300 !border-white !border-2" />
    </div>
  );
};

const nodeTypes = { phaseNode: PhaseNode };

export default function ProcessFlowDiagram({ phases = [], onNodeClick }: ProcessFlowDiagramProps) {
  const nodes = useMemo(() => {
    return phases.map((p, idx) => ({
      id: p.id,
      type: 'phaseNode',
      data: {
        label: p.name,
        type: p.type || 'normal',
        source: p.source || 'self',
        enabled: p.enabled !== false,
        taskCount: (p.tasks || []).length,
        totalDays: (p.tasks || []).reduce((s: number, t: any) => s + (t.estimatedDays || 0), 0),
      },
      position: { x: idx * 220, y: 0 },
    }));
  }, [phases]);

  const edges = useMemo(() => {
    const e: any[] = [];
    for (let i = 0; i < phases.length - 1; i++) {
      e.push({ id: `e-${phases[i].id}-to-${phases[i + 1].id}`, source: phases[i].id, target: phases[i + 1].id });
    }
    return e;
  }, [phases]);

  const defaultEdgeOptions = {
    type: 'smoothstep',
    style: { stroke: '#CBD5E1', strokeWidth: 1.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#CBD5E1',
      width: 16,
      height: 16,
    },
  };

  return (
    <div className="h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        className="bg-gray-50"
        onNodeClick={(ev, node) => {
          const phase = phases.find(p => p.id === node.id);
          if (phase && onNodeClick) onNodeClick(phase);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#E2E8F0" />
        <Controls className="!shadow-sm !border !border-gray-200 !rounded-lg" showInteractive={false} />
        <MiniMap
          className="!shadow-sm !border !border-gray-200 !rounded-lg"
          nodeColor={(node: any) => {
            if (!node.data.enabled) return '#E5E7EB';
            const colors: any = { normal: '#3B82F6', milestone: '#F97316', approval: '#8B5CF6' };
            return colors[node.data.type] || colors.normal;
          }}
          maskColor="rgba(255,255,255,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
