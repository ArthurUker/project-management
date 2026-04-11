import React, { useCallback, useEffect, useState, useRef } from 'react';
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
  onEdgeDelete?: (sourceId: string, targetId: string) => void;
  onEdgeReconnect?: (oldEdge: Edge, newConnection: Connection) => void;
  onDropParallel?: (draggedId: string, targetId: string, x?: number, y?: number) => void;
  onDropInsertAfter?: (draggedId: string, targetId: string, x?: number, y?: number) => void;
  readonly?: boolean;
}

// ─── Dagre 布局 ───────────────────────────────────────────────────────────────
const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const RANK_SEP = 80;
const NODE_SEP = 50;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'LR',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 40,
    marginy: 40,
  });

  // 注册节点（使用统一尺寸）
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // 注册边
  edges.forEach((edge) => {
    try {
      dagreGraph.setEdge(edge.source, edge.target);
    } catch (e) {
      // ignore invalid edges
    }
  });

  // 执行布局
  dagre.layout(dagreGraph as any);

  const layoutedNodes: Node[] = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: layoutedNodes, edges };
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
  selected,
}) => {
  const [hovered] = React.useState(false);
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const handleDelete = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // remove from react-flow state
    setEdges((eds) => (eds || []).filter((ed: any) => ed.id !== id));
    // parse ids and notify parent/back-end via data.onDelete
    const parts = (id || '').split('-');
    const sourceId = parts[1] || '';
    const targetId = parts[2] || '';
    try {
      (data as any)?.onDelete?.(sourceId, targetId);
    } catch (err) {
      // ignore
    }
  }, [id, setEdges, data]);

  return (
    <>
      {/* smoothstep path rendered by BaseEdge */}
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

      {/* interaction area: transparent wide path for easier clicks (kept for pointer interactions) */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />

      {/* visible edge path */}
      <path
        d={edgePath}
        fill="none"
        stroke={selected ? '#3b82f6' : (style?.stroke ?? '#93C5FD')}
        strokeWidth={selected ? 2 : (style?.strokeWidth ?? 1.5)}
        className="react-flow__edge-path"
      />

      {/* overlay buttons at midpoint (show only when selected) */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            display: 'flex',
            gap: 6,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              const parts = (id || '').split('-');
              const sourceId = parts[1] || '';
              const targetId = parts[2] || '';
              (data as any)?.onAddParallel?.(sourceId, targetId);
            }}
            className={"w-6 h-6 rounded-full bg-white border-2 border-blue-400 text-blue-500 text-sm font-bold flex items-center justify-center shadow-md hover:bg-blue-50 hover:border-blue-500 hover:shadow-lg transition-all duration-150 cursor-pointer select-none"}
            title="在此处添加并行阶段"
          >
            +
          </button>

          {selected && (
            <button
              onClick={handleDelete}
              onContextMenu={(e) => { e.preventDefault(); handleDelete(e as any); }}
              className={"w-6 h-6 rounded-full bg-white border-2 border-red-300 text-red-500 text-sm font-bold flex items-center justify-center shadow-md hover:bg-red-50 hover:border-red-400 hover:shadow-lg transition-all duration-150 cursor-pointer select-none"}
              title="删除连线"
            >
              ✕
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
  type: 'smoothstep' as const,
  style: { stroke: '#93C5FD', strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#93C5FD',
  },
  data: { onAddParallel },
});


// ─── 内部图组件（需要在 ReactFlowProvider 内） ────────────────────────────────
const FlowInner: React.FC<ProcessFlowDiagramProps> = ({
  phases,
  onPhaseConnect,
  onPhaseClick,
  onAddParallel,
  onEdgeDelete,
  onEdgeReconnect,
  onDropParallel,
  onDropInsertAfter,
  readonly = false,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // drag-to-snap state
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const SNAP_DISTANCE = 80;

  const [dropMenuState, setDropMenuState] = useState<{
    visible: boolean;
    draggedPhaseId: string;
    targetPhaseId: string;
    x: number;
    y: number;
  }>({ visible: false, draggedPhaseId: '', targetPhaseId: '', x: 0, y: 0 });

  // helper to build edges using current onAddParallel
  const edgeOptions = buildEdgeStyle(onAddParallel ?? (() => {}));

  // reconnect tracking
  const edgeReconnectSuccessful = useRef(true);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeReconnectSuccessful.current = true;
    // update local edges: replace old edge with new connection
    setEdges((eds) => (eds || []).map((e: any) => e.id === oldEdge.id ? {
      ...e,
      id: `e-${newConnection.source}-${newConnection.target}`,
      source: newConnection.source,
      target: newConnection.target,
    } : e));

    if (onEdgeReconnect) onEdgeReconnect(oldEdge, newConnection);
  }, [onEdgeReconnect]);

  const onReconnectEnd = useCallback((_: any, edge?: Edge) => {
    if (!edgeReconnectSuccessful.current && edge) {
      // remove edge if reconnect failed
      setEdges((eds) => (eds || []).filter((e: any) => e.id !== edge.id));
      if (onEdgeDelete && edge.source && edge.target) onEdgeDelete(edge.source, edge.target);
    }
    edgeReconnectSuccessful.current = true;
  }, [onEdgeDelete]);

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

    // 构建边：优先用 nextPhaseIds，回退到按 order 线性连接
    const rawEdges: Edge[] = [];

    // DEBUG: 输出 phases 的 nextPhaseIds 以便诊断（浏览器 Console）
    console.log('[FlowDiagram] phases nextPhaseIds:', phases.map(p => ({ name: p.name, nextPhaseIds: p.nextPhaseIds })));
    // 兼容旧的诊断标识，确保搜索 '[DEBUG] phases with nextPhaseIds' 能找到输出
    console.log('[DEBUG] phases with nextPhaseIds:',
      phases.map(p => ({ name: p.name, order: p.order, nextPhaseIds: p.nextPhaseIds ?? [] }))
    );

    // 判断是否有任何阶段配置了显式流转
    const hasExplicitEdges = phases.some(
      (p) => Array.isArray(p.nextPhaseIds) && p.nextPhaseIds.length > 0
    );

    // DEBUG: 输出是否使用显式边
    console.log('[FlowDiagram] hasExplicitEdges:', hasExplicitEdges, '| rawEdges will be:', hasExplicitEdges ? 'explicit' : 'linear-fallback');

    if (hasExplicitEdges) {
      // 使用显式流转关系（支持并行分叉）
      phases.forEach((p) => {
        (p.nextPhaseIds ?? []).forEach((nextId: string) => {
          // 确认目标阶段存在
          const targetExists = phases.some((ph) => ph.id === nextId);
          if (!targetExists) return;

          rawEdges.push({
            id: `e-${p.id}-${nextId}`,
            source: p.id,
            target: nextId,
            type: 'custom',
            animated: false,
            style: { stroke: '#93C5FD', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#93C5FD',
            },
            data: { onAddParallel: onAddParallel ?? (() => {}), onDelete: onEdgeDelete },
          });
        });
      });
    } else {
      // 回退：按 order 排序后线性连接
      const sorted = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (let i = 0; i < sorted.length - 1; i++) {
        rawEdges.push({
          id: `e-${sorted[i].id}-${sorted[i + 1].id}`,
          source: sorted[i].id,
          target: sorted[i + 1].id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#93C5FD', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#93C5FD',
          },
        });
      }
    }

    const { nodes: ln, edges: le } = getLayoutedElements(rawNodes, rawEdges);
    setNodes(ln);
    setEdges(le);

    // 布局完成后自适应视图
    setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 50);
  }, [JSON.stringify(phases.map(p => ({ id: p.id, order: p.order, nextPhaseIds: p.nextPhaseIds }))), onAddParallel]);

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
            rawEdges.push({ id: `e-${p.id}-${nextId}`, source: p.id, target: nextId, type: 'custom', animated: false, style: { stroke: '#93C5FD', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#93C5FD' }, data: { onAddParallel: onAddParallel ?? (() => {}), onDelete: onEdgeDelete } });
          });
        });
      } else {
        const sorted = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (let i = 0; i < sorted.length - 1; i++) {
          if (!rawEdges.find(e => e.source === sorted[i].id)) {
          rawEdges.push({ id: `e-${sorted[i].id}-${sorted[i + 1].id}`, source: sorted[i].id, target: sorted[i + 1].id, type: 'custom', animated: false, style: { stroke: '#93C5FD', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#93C5FD' }, data: { onAddParallel: onAddParallel ?? (() => {}), onDelete: onEdgeDelete } });
        }
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
  }, [JSON.stringify(phases.map(p => ({ id: p.id, order: p.order, nextPhaseIds: p.nextPhaseIds }))), fitView, onAddParallel]);

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

  // 拖拽节点：磁吸检测
  const handleNodeDrag = useCallback((_: any, draggedNode: Node) => {
    let closestId: string | null = null;
    let closestDist = SNAP_DISTANCE;
    nodes.forEach((n) => {
      if (n.id === draggedNode.id) return;
      const dx = (n.position.x || 0) - (draggedNode.position.x || 0);
      const dy = (n.position.y || 0) - (draggedNode.position.y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = n.id;
      }
    });

    setDragOverNodeId(closestId);
  }, [nodes]);

  const handleNodeDragStop = useCallback((event: React.MouseEvent, draggedNode: Node) => {
    if (dragOverNodeId) {
      // Use mouse screen coordinates for menu placement (clientX/clientY)
      const x = (event?.clientX) ?? 0;
      const y = (event?.clientY) ?? 0;
      setDropMenuState({ visible: true, draggedPhaseId: draggedNode.id, targetPhaseId: dragOverNodeId, x, y });
    }
    setDragOverNodeId(null);
  }, [dragOverNodeId]);

  // 更新节点样式以高亮拖拽目标
  useEffect(() => {
    setNodes((cur) => cur.map(n => ({ ...n, className: dragOverNodeId === n.id ? 'ring-2 ring-blue-400 ring-offset-2 scale-105 transition-all' : '' })));
  }, [dragOverNodeId, setNodes]);

  // 节点点击
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const phase = phases.find((p) => p.id === node.id);
      if (phase && onPhaseClick) onPhaseClick(phase);
    },
    [phases, onPhaseClick]
  );

  return (
    <>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onReconnect={onReconnect}
      onReconnectStart={onReconnectStart}
      onReconnectEnd={onReconnectEnd}
      edgesReconnectable={true}
      deleteKeyCode="Delete"
      edgesFocusable={true}
      onConnect={handleConnect}
      onNodeDrag={handleNodeDrag}
      onNodeDragStop={handleNodeDragStop}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={2.5}
      nodesDraggable={!readonly}
      nodesConnectable={!readonly}
      elementsSelectable
      defaultEdgeOptions={edgeOptions}
      onEdgesDelete={(delEdges) => {
        delEdges.forEach(e => {
          const sourceId = (e as any).source || '';
          const targetId = (e as any).target || '';
          if (sourceId && targetId && onEdgeDelete) onEdgeDelete(sourceId, targetId);
        });
      }}
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

    {/* Drop menu (outside ReactFlow but inside provider) */}
    {dropMenuState.visible && (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setDropMenuState(s => ({ ...s, visible: false }))} />
        <div
          className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden min-w-[200px]"
          style={{ left: dropMenuState.x, top: dropMenuState.y, transform: 'translate(-50%, -110%)' }}
        >
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <div className="text-[11px] text-gray-400 font-medium">
              拖拽到：
              <span className="text-gray-600 font-semibold ml-1">
                {phases.find(p => p.id === dropMenuState.targetPhaseId)?.name}
              </span>
            </div>
          </div>

          <button
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left group"
            onClick={() => {
              setDropMenuState(s => ({ ...s, visible: false }));
              onDropParallel?.(dropMenuState.draggedPhaseId, dropMenuState.targetPhaseId, dropMenuState.x, dropMenuState.y);
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center flex-shrink-0 transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h10M3 12h10" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">设为并行阶段</div>
              <div className="text-[11px] text-gray-400 mt-0.5">两个阶段同时进行，流程图显示分叉</div>
            </div>
          </button>

          <div className="mx-4 border-t border-gray-50" />

          <button
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors text-left group"
            onClick={() => {
              setDropMenuState(s => ({ ...s, visible: false }));
              onDropInsertAfter?.(dropMenuState.draggedPhaseId, dropMenuState.targetPhaseId, dropMenuState.x, dropMenuState.y);
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-green-100 group-hover:bg-green-200 flex items-center justify-center flex-shrink-0 transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h8M8 5l3 3-3 3" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">插入到此节点之后</div>
              <div className="text-[11px] text-gray-400 mt-0.5">调整阶段顺序，串行排列</div>
            </div>
          </button>

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <button className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors" onClick={() => setDropMenuState(s => ({ ...s, visible: false }))}>取消</button>
          </div>
        </div>
      </>
    )}

    </>
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
