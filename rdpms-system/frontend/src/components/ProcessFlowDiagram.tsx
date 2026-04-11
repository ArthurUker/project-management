import React, { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  useReactFlow,
  EdgeLabelRenderer,
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

// ─── 类型 ────────────────────────────────────────────────────────────────────
interface Phase {
  id: string;
  name: string;
  order: number;
  totalDays?: number;
  tasks?: any[];
  enabled?: boolean;
  // 后继阶段 ID 列表（支持并行分叉）
  // 字段名根据 Task1 确认的实际字段填写，默认尝试 nextPhaseIds
  nextPhaseIds?: string[];
}

interface ProcessFlowDiagramProps {
  phases: Phase[];
  onPhaseConnect?: (sourceId: string, targetId: string) => void;
  onPhaseClick?: (phase: Phase) => void;
  onAddParallel?: (sourceId: string, targetId: string) => void;
  readonly?: boolean;
}

// ─── Dagre 布局 ───────────────────────────────────────────────────────────────
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',   // 左→右
    nodesep: 50,     // 垂直间距
    ranksep: 100,    // 水平间距
    marginx: 60,
    marginy: 60,
  });

  nodes.forEach((n) => g.setNode(n.id, { width: 150, height: 64 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return {
    nodes: nodes.map((n) => {
      const { x, y } = g.node(n.id);
      return { ...n, position: { x: x - 75, y: y - 32 } };
    }),
    edges,
  };
};

// ─── 阶段节点组件 ─────────────────────────────────────────────────────────────
const PhaseNodeComponent = ({
  data,
  selected,
}: {
  data: any;
  selected: boolean;
}) => {
  const disabled = data.enabled === false;

  return (
    <div
      className={[
        'relative w-[150px] rounded-xl border-2 px-4 py-3',
        'transition-all duration-150 cursor-pointer select-none',
        selected
          ? 'border-blue-500 shadow-lg ring-2 ring-blue-200 ring-offset-1 bg-white'
          : disabled
          ? 'border-dashed border-gray-300 bg-gray-50 shadow-none'
          : 'border-blue-200 bg-blue-50 shadow-sm hover:shadow-md hover:border-blue-400',
      ].join(' ')}
    >
      {/* 序号徽标 */}
      <span
        className={[
          'absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full text-[10px]','font-bold flex items-center justify-center shadow-sm',
          disabled
            ? 'bg-gray-200 text-gray-400'
            : 'bg-blue-500 text-white',
        ].join(' ')}
      >
        {data.order}
      </span>

      {/* 阶段名称 */}
      <div
        className={[
          'text-sm font-semibold leading-tight truncate',
          disabled ? 'text-gray-400' : 'text-blue-800',
        ].join(' ')}
      >
        {data.label}
      </div>

      {/* 任务数 + 工期 */}
      <div className="flex items-center gap-2 mt-1.5">
        <span
          className={[
            'text-[11px]',
            disabled ? 'text-gray-400' : 'text-blue-500',
          ].join(' ')}
        >
          {data.taskCount ?? 0} 任务
        </span>
        {(data.totalDays ?? 0) > 0 && (
          <span
            className={[
              'text-[11px]',
              disabled ? 'text-gray-400' : 'text-blue-400',
            ].join(' ')}
          >
            · ~{data.totalDays} 天
          </span>
        )}
      </div>

      {/* 连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-white !border-2 !border-blue-300 hover:!border-blue-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-white !border-2 !border-blue-300 hover:!border-blue-500"
      />
    </div>
  );
};

const nodeTypes = { phase: PhaseNodeComponent };

// ─── 自定义边（含中点 + 按钮） ───────────────────────────────────────────
interface CustomEdgeData {
  onAddParallel?: (sourceId: string, targetId: string) => void;
}

const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}) => {
  const [hovered, setHovered] = React.useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const hitAreaPath = edgePath;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: hovered ? '#3B82F6' : (style?.stroke ?? '#93C5FD'),
          strokeWidth: hovered ? 2.5 : (style?.strokeWidth ?? 2),
          transition: 'stroke 0.15s, stroke-width 0.15s',
        }}
        markerEnd={markerEnd}
      />

      <path
        d={hitAreaPath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {hovered && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const edgeData = data as CustomEdgeData;
                const parts = (id || '').split('->');
                const sourceId = parts[0] || '';
                const targetId = parts[1] || '';
                edgeData?.onAddParallel?.(sourceId, targetId);
              }}
              className={"w-6 h-6 rounded-full bg-white border-2 border-blue-400 text-blue-500 text-sm font-bold flex items-center justify-center shadow-md hover:bg-blue-50 hover:border-blue-500 hover:shadow-lg transition-all duration-150 cursor-pointer select-none"}
              title="在此处添加并行阶段"
            >
              +
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const edgeTypes = { custom: CustomEdge };


// helper to build edge options including data callback for adding parallel
const buildEdgeStyle = (onAddParallel: (s: string, t: string) => void) => ({
  type: 'custom' as const,
  style: { stroke: '#93C5FD', strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#93C5FD',
    width: 16,
    height: 16,
  },
  data: { onAddParallel },
});

// fallback default for compatibility
const defaultEdgeStyle = buildEdgeStyle(() => {});

// ─── 内部图组件（需要在 ReactFlowProvider 内） ────────────────────────────────
const FlowInner: React.FC<ProcessFlowDiagramProps> = ({
  phases,
  onPhaseConnect,
  onPhaseClick,
  onAddParallel,
  readonly = false,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // helper to build edges using current onAddParallel
  const edgeOptions = buildEdgeStyle(onAddParallel ?? (() => {}));

  // phases → nodes + edges
  useEffect(() => {
    if (!phases?.length) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const rawNodes: Node[] = phases.map((p) => ({
      id: p.id,
      type: 'phase',
      position: { x: 0, y: 0 },
      data: {
        label: p.name,
        order: p.order ?? 1,
        taskCount: p.tasks?.length ?? 0,
        totalDays: p.totalDays ?? 0,
        enabled: p.enabled !== false,
      },
    }));

    // 构建边：优先用 nextPhaseIds，否则按 order 线性连接
    const rawEdges: Edge[] = [];
    const hasExplicitEdges = phases.some(
      (p) => (p.nextPhaseIds ?? []).length > 0
    );

    if (hasExplicitEdges) {
      phases.forEach((p) => {
        (p.nextPhaseIds ?? []).forEach((nextId) => {
          rawEdges.push({
            id: `${p.id}->${nextId}`,
            source: p.id,
            target: nextId,
            ...edgeOptions,
          });
        });
      });
    } else {
      // 按 order 排序后线性连接（默认无并行）
      const sorted = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (let i = 0; i < sorted.length - 1; i++) {
        rawEdges.push({
          id: `${sorted[i].id}->${sorted[i + 1].id}`,
          source: sorted[i].id,
          target: sorted[i + 1].id,
          ...edgeOptions,
        });
      }
    }

    const { nodes: ln, edges: le } = getLayoutedElements(rawNodes, rawEdges);
    setNodes(ln);
    setEdges(le);

    // 布局完成后自适应视图
    setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 50);
  }, [phases, onAddParallel]);

  // 监听外部 fitView / reLayout 事件
  useEffect(() => {
    const fitHandler = () => fitView({ padding: 0.25, duration: 400 });

    const handleReLayout = () => {
      if (!phases?.length) return;

      const rawNodes: Node[] = phases.map((p) => ({
        id: p.id,
        type: 'phase',
        position: { x: 0, y: 0 },
        data: {
          label: p.name,
          order: p.order ?? 1,
          taskCount: p.tasks?.length ?? 0,
          totalDays: p.totalDays ?? 0,
          enabled: p.enabled !== false,
        },
      }));

      const rawEdges: Edge[] = [];
      const hasExplicitEdges = phases.some((p) => (p.nextPhaseIds ?? []).length > 0);
      if (hasExplicitEdges) {
        phases.forEach((p) => {
          (p.nextPhaseIds ?? []).forEach((nextId) => {
            rawEdges.push({ id: `${p.id}->${nextId}`, source: p.id, target: nextId, ...edgeOptions });
          });
        });
      } else {
        const sorted = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (let i = 0; i < sorted.length - 1; i++) {
          rawEdges.push({ id: `${sorted[i].id}->${sorted[i + 1].id}`, source: sorted[i].id, target: sorted[i + 1].id, ...edgeOptions });
        }
      }

      const { nodes: ln, edges: le } = getLayoutedElements(rawNodes, rawEdges);
      setNodes(ln);
      setEdges(le);
      setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 50);
    };

    window.addEventListener('flow:fitView', fitHandler);
    window.addEventListener('flow:reLayout', handleReLayout);
    return () => {
      window.removeEventListener('flow:fitView', fitHandler);
      window.removeEventListener('flow:reLayout', handleReLayout);
    };
  }, [phases, fitView, onAddParallel]);

  // 拖拽连线
  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, ...edgeOptions }, eds));
      if (onPhaseConnect && connection.source && connection.target) {
        onPhaseConnect(connection.source, connection.target);
      }
    },
    [onPhaseConnect, onAddParallel]
  );

  // 节点点击
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const phase = phases.find((p) => p.id === node.id);
      if (phase && onPhaseClick) onPhaseClick(phase);
    },
    [phases, onPhaseClick]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={handleConnect}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={2.5}
      nodesDraggable={!readonly}
      nodesConnectable={!readonly}
      elementsSelectable
      defaultEdgeOptions={edgeOptions}
      edgeTypes={edgeTypes}
      className="bg-gray-50"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#DBEAFE"
      />
      <Controls
        showInteractive={false}
        className="!shadow-sm !border !border-gray-200 !rounded-lg !bg-white"
      />
      <MiniMap
        nodeColor={(n) => (n.data.enabled === false ? '#E5E7EB' : '#93C5FD')}
        maskColor="rgba(248,250,252,0.85)"
        className="!shadow-sm !border !border-gray-200 !rounded-xl"
      />
    </ReactFlow>
  );
};

// ─── 导出组件（包裹 Provider） ────────────────────────────────────────────────
const ProcessFlowDiagram: React.FC<ProcessFlowDiagramProps> = (props) => (
  <ReactFlowProvider>
    <div className="w-full h-full">
      <FlowInner {...props} />
    </div>
  </ReactFlowProvider>
);

export default ProcessFlowDiagram;
