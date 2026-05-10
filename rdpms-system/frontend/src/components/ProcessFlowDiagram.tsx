import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  useReactFlow,
  EdgeLabelRenderer,
  getBezierPath,
  ConnectionLineType,
  type EdgeProps,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ─── 类型 ────────────────────────────────────────────────────────────────────
interface Phase {
  id: string;
  name: string;
  order: number;
  x?: number;
  y?: number;
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
  onDropInsertBetween?: (draggedId: string, targetId: string, x?: number, y?: number) => void;
  onDropParallelWithSuccessor?: (draggedId: string, targetId: string, x?: number, y?: number) => void;
  onDropInsertBefore?: (draggedId: string, targetId: string, x?: number, y?: number) => void;
  onNodePositionChange?: (phaseId: string, x: number, y: number) => void;
  onNodesPositionChange?: (positions: Array<{ id: string; x: number; y: number }>) => void;
  readonly?: boolean;
}

// ─── 自适应分层布局 ─────────────────────────────────────────────────────────────
const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const RANK_SEP = 80;
const NODE_SEP = 50;
type LayoutMode = 'compact' | 'readable';

const layoutConfigByMode = (mode: LayoutMode) => {
  if (mode === 'readable') {
    return {
      ranksep: 120,
      nodesep: 90,
      marginx: 60,
      marginy: 60,
      fitPadding: 0.35,
      tailThresholdFactor: 1.9,
      tailMinGap: NODE_HEIGHT + 32,
    };
  }
  return {
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 40,
    marginy: 40,
    fitPadding: 0.25,
    tailThresholdFactor: 1.4,
    tailMinGap: NODE_HEIGHT + 16,
  };
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], mode: LayoutMode = 'compact') => {
  const cfg = layoutConfigByMode(mode);

  // 仅保留有效边
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const validEdges = edges.filter((e) => nodeById.has(String(e.source)) && nodeById.has(String(e.target)));

  // 邻接表 + 入度
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  nodes.forEach((n) => {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
    inDegree.set(n.id, 0);
  });
  validEdges.forEach((e) => {
    const s = String(e.source);
    const t = String(e.target);
    outgoing.get(s)?.push(t);
    incoming.get(t)?.push(s);
    inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
  });

  // 区分孤立节点（无入边且无出边）
  const connectedNodes = nodes.filter((n) => ((incoming.get(n.id)?.length ?? 0) + (outgoing.get(n.id)?.length ?? 0)) > 0);
  const isolatedNodes = nodes.filter((n) => ((incoming.get(n.id)?.length ?? 0) + (outgoing.get(n.id)?.length ?? 0)) === 0);

  // 连通部分为空时，直接按一行摆放
  if (connectedNodes.length === 0) {
    return {
      nodes: isolatedNodes.map((n, i) => ({
        ...n,
        position: {
          x: cfg.marginx + i * (NODE_WIDTH + cfg.nodesep),
          y: cfg.marginy,
        },
      })),
      edges,
    };
  }

  // Kahn 拓扑排序（循环图时追加剩余节点，避免中断）
  const localIn = new Map<string, number>();
  connectedNodes.forEach((n) => localIn.set(n.id, inDegree.get(n.id) ?? 0));

  const queue: string[] = connectedNodes
    .filter((n) => (localIn.get(n.id) ?? 0) === 0)
    .sort((a, b) => (a.position.y ?? 0) - (b.position.y ?? 0))
    .map((n) => n.id);

  const topo: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topo.push(id);
    (outgoing.get(id) ?? []).forEach((to) => {
      if (!localIn.has(to)) return;
      localIn.set(to, (localIn.get(to) ?? 0) - 1);
      if ((localIn.get(to) ?? 0) === 0) queue.push(to);
    });
  }

  if (topo.length < connectedNodes.length) {
    const leftovers = connectedNodes
      .map((n) => n.id)
      .filter((id) => !topo.includes(id))
      .sort((a, b) => ((nodeById.get(a)?.position.y ?? 0) - (nodeById.get(b)?.position.y ?? 0)));
    topo.push(...leftovers);
  }

  // 分层：layer[v] = max(layer[pred] + 1)
  const layer = new Map<string, number>();
  topo.forEach((id) => {
    const preds = (incoming.get(id) ?? []).filter((p) => layer.has(p));
    if (preds.length === 0) {
      layer.set(id, 0);
      return;
    }
    const lv = Math.max(...preds.map((p) => layer.get(p) ?? 0)) + 1;
    layer.set(id, lv);
  });

  const maxLayer = Math.max(...connectedNodes.map((n) => layer.get(n.id) ?? 0));
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  connectedNodes.forEach((n) => {
    layers[layer.get(n.id) ?? 0].push(n.id);
  });

  // 初始化层内顺序：按当前 y（用户心智最稳定）
  const orderInLayer = new Map<string, number>();
  layers.forEach((arr) => {
    arr.sort((a, b) => ((nodeById.get(a)?.position.y ?? 0) - (nodeById.get(b)?.position.y ?? 0)));
    arr.forEach((id, idx) => orderInLayer.set(id, idx));
  });

  // === 虚拟节点插入（Dummy Node Insertion）===
  // 对跨度 >1 层的长距离边，在每个中间层插入一个占位虚拟节点。
  // 虚拟节点参与 barycenter + transposition 排序，迫使真实节点让路，
  // 避免边的路径穿过中间层的实际节点。
  const dummyIds = new Set<string>();
  const edgeDummyChain = new Map<string, string[]>(); // edgeId -> 该边的虚拟节点列表（有序）
  const layoutEdgePairs: Array<{ src: string; tgt: string }> = []; // 仅相邻层连接（含虚拟节点）

  validEdges.forEach((edge) => {
    const src = String(edge.source);
    const tgt = String(edge.target);
    const srcL = layer.get(src) ?? 0;
    const tgtL = layer.get(tgt) ?? 0;

    if (tgtL - srcL <= 1) {
      // 相邻层或同层：直接记录，无需虚拟节点
      if (tgtL > srcL) layoutEdgePairs.push({ src, tgt });
      return;
    }

    // 长距离边：在每个中间层插入一个虚拟节点
    const chain: string[] = [];
    let prev = src;

    for (let l = srcL + 1; l < tgtL; l++) {
      const did = `__d__${edge.id}__${l}`;
      dummyIds.add(did);
      layer.set(did, l);

      // 设置虚拟节点的邻接关系
      incoming.set(did, [prev]);
      outgoing.set(did, []);

      // 更新 prev 的 outgoing：第一跳把 tgt 替换为 did，后续直接追加
      const prevOuts = outgoing.get(prev) ?? [];
      if (l === srcL + 1) {
        const ti = prevOuts.indexOf(tgt);
        if (ti >= 0) prevOuts[ti] = did;
        else prevOuts.push(did);
      } else {
        prevOuts.push(did);
      }
      outgoing.set(prev, prevOuts);

      // 将虚拟节点追加到该层末尾，barycenter 迭代会将其移至正确位置
      layers[l].push(did);
      orderInLayer.set(did, layers[l].length - 1);

      layoutEdgePairs.push({ src: prev, tgt: did });
      chain.push(did);
      prev = did;
    }

    // 最后一个虚拟节点 -> 真实目标节点
    outgoing.set(prev, [tgt]);
    const tgtIns = incoming.get(tgt) ?? [];
    const si = tgtIns.indexOf(src);
    if (si >= 0) tgtIns[si] = prev;
    else tgtIns.push(prev);
    incoming.set(tgt, tgtIns);

    layoutEdgePairs.push({ src: prev, tgt });
    edgeDummyChain.set(edge.id, chain);
  });

  // Barycenter 迭代：下扫 + 上扫，减少交叉
  const getBarycenter = (id: string, refs: string[]) => {
    if (refs.length === 0) return orderInLayer.get(id) ?? 0;
    const vals = refs.map((r) => orderInLayer.get(r) ?? 0);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  for (let iter = 0; iter < 6; iter++) {
    // downward pass
    for (let l = 1; l <= maxLayer; l++) {
      layers[l].sort((a, b) => {
        const ba = getBarycenter(a, incoming.get(a) ?? []);
        const bb = getBarycenter(b, incoming.get(b) ?? []);
        if (ba !== bb) return ba - bb;
        return (orderInLayer.get(a) ?? 0) - (orderInLayer.get(b) ?? 0);
      });
      layers[l].forEach((id, idx) => orderInLayer.set(id, idx));
    }

    // upward pass
    for (let l = maxLayer - 1; l >= 0; l--) {
      layers[l].sort((a, b) => {
        const ba = getBarycenter(a, outgoing.get(a) ?? []);
        const bb = getBarycenter(b, outgoing.get(b) ?? []);
        if (ba !== bb) return ba - bb;
        return (orderInLayer.get(a) ?? 0) - (orderInLayer.get(b) ?? 0);
      });
      layers[l].forEach((id, idx) => orderInLayer.set(id, idx));
    }
  }

  // 在 barycenter 之后再做一轮基于交叉数的层内局部交换（transposition）
  // 目标：逼近用户手工拖拽得到的“更少交叉”方案。
  const countCrossingsBetweenLayers = (leftLayer: number, rightLayer: number) => {
    if (leftLayer < 0 || rightLayer > maxLayer || leftLayer >= rightLayer) return 0;
    const left = layers[leftLayer] ?? [];
    const right = layers[rightLayer] ?? [];
    if (left.length <= 1 || right.length <= 1) return 0;

    const leftOrder = new Map(left.map((id, idx) => [id, idx] as const));
    const rightOrder = new Map(right.map((id, idx) => [id, idx] as const));

    const pairs: Array<{ a: number; b: number }> = [];
    // 使用 layoutEdgePairs（含虚拟节点链）而非原始 validEdges，
    // 确保长距离边通过虚拟节点参与交叉计数。
    layoutEdgePairs.forEach(({ src: s, tgt: t }) => {
      const ls = layer.get(s);
      const lt = layer.get(t);
      if (ls == null || lt == null) return;

      if (ls === leftLayer && lt === rightLayer) {
        const a = leftOrder.get(s);
        const b = rightOrder.get(t);
        if (a != null && b != null) pairs.push({ a, b });
      } else if (ls === rightLayer && lt === leftLayer) {
        const a = leftOrder.get(t);
        const b = rightOrder.get(s);
        if (a != null && b != null) pairs.push({ a, b });
      }
    });

    if (pairs.length <= 1) return 0;

    pairs.sort((p1, p2) => (p1.a - p2.a) || (p1.b - p2.b));

    let crossings = 0;
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        if (pairs[i].b > pairs[j].b) crossings++;
      }
    }
    return crossings;
  };

  const countLayerLocalCrossings = (l: number) => {
    return countCrossingsBetweenLayers(l - 1, l) + countCrossingsBetweenLayers(l, l + 1);
  };

  const refreshLayerOrder = (l: number) => {
    (layers[l] ?? []).forEach((id, idx) => orderInLayer.set(id, idx));
  };

  for (let pass = 0; pass < 4; pass++) {
    let passImproved = false;
    for (let l = 0; l <= maxLayer; l++) {
      const arr = layers[l] ?? [];
      if (arr.length < 2) continue;

      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < arr.length - 1; i++) {
          const before = countLayerLocalCrossings(l);
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          refreshLayerOrder(l);
          const after = countLayerLocalCrossings(l);
          if (after < before) {
            improved = true;
            passImproved = true;
          } else {
            [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
            refreshLayerOrder(l);
          }
        }
      }
    }
    if (!passImproved) break;
  }

  // 计算坐标：x 按层，y 按层内顺序 + 度数自适应间距
  const xGap = NODE_WIDTH + cfg.ranksep;
  const baseYGap = NODE_HEIGHT + cfg.nodesep;

  const layerYs = new Map<number, number[]>();
  let globalMaxHeight = 0;
  layers.forEach((arr, l) => {
    const ys: number[] = [];
    let cursor = 0;
    arr.forEach((id, idx) => {
      const degree = (incoming.get(id)?.length ?? 0) + (outgoing.get(id)?.length ?? 0);
      const adaptiveExtra = Math.min(48, degree * 6);
      if (idx === 0) {
        ys.push(0);
      } else {
        cursor += baseYGap + adaptiveExtra * 0.35;
        ys.push(cursor);
      }
    });
    layerYs.set(l, ys);
    if (ys.length > 0) {
      globalMaxHeight = Math.max(globalMaxHeight, ys[ys.length - 1]);
    }
  });

  const positioned = new Map<string, { x: number; y: number }>();
  layers.forEach((arr, l) => {
    const ys = layerYs.get(l) ?? [];
    const layerHeight = ys.length > 0 ? ys[ys.length - 1] : 0;
    const layerOffsetY = cfg.marginy + (globalMaxHeight - layerHeight) / 2;
    arr.forEach((id, idx) => {
      positioned.set(id, {
        x: cfg.marginx + l * xGap,
        y: layerOffsetY + (ys[idx] ?? 0),
      });
    });
  });

  // 视觉优化：让分叉/汇合更接近“括弧式”展开再收拢
  // 做法：在不改变层内相对顺序的前提下，对 y 进行约束松弛。
  const yById = new Map<string, number>();
  positioned.forEach((pos, id) => yById.set(id, pos.y));

  const assignSymmetricTargets = (centerY: number, ids: string[], gap: number) => {
    const k = ids.length;
    if (k <= 1) return new Map<string, number>();
    const targets = new Map<string, number>();
    const start = centerY - ((k - 1) * gap) / 2;
    ids.forEach((id, idx) => targets.set(id, start + idx * gap));
    return targets;
  };

  for (let iter = 0; iter < 6; iter++) {
    const desired = new Map<string, { sum: number; w: number }>();
    const addDesired = (id: string, value: number, weight: number) => {
      const old = desired.get(id) ?? { sum: 0, w: 0 };
      desired.set(id, { sum: old.sum + value * weight, w: old.w + weight });
    };

    // 1) 邻接重心：让节点靠近前后相邻节点的平均 y
    layers.forEach((arr) => {
      arr.forEach((id) => {
        const preds = incoming.get(id) ?? [];
        const succs = outgoing.get(id) ?? [];
        const refs = [...preds, ...succs].filter((nid) => yById.has(nid));
        if (refs.length === 0) return;
        const m = refs.reduce((s, nid) => s + (yById.get(nid) ?? 0), 0) / refs.length;
        addDesired(id, m, 1.0);
      });
    });

    // 2) 分叉对称：一个父节点指向多个子节点时，子节点围绕父节点对称展开
    layers.forEach((arr) => {
      arr.forEach((pid) => {
        const children = (outgoing.get(pid) ?? []).filter((cid) => (layer.get(cid) ?? -1) === (layer.get(pid) ?? -2) + 1);
        if (children.length < 2) return;
        const pY = yById.get(pid) ?? 0;
        const ordered = [...children].sort((a, b) => (orderInLayer.get(a) ?? 0) - (orderInLayer.get(b) ?? 0));
        const targets = assignSymmetricTargets(pY, ordered, baseYGap * 0.9);
        targets.forEach((tY, cid) => addDesired(cid, tY, 1.8));
      });
    });

    // 3) 汇合对称：多个父节点指向同一子节点时，父节点围绕子节点对称分布
    layers.forEach((arr) => {
      arr.forEach((tid) => {
        const parents = (incoming.get(tid) ?? []).filter((pid) => (layer.get(pid) ?? -1) === (layer.get(tid) ?? -2) - 1);
        if (parents.length < 2) return;
        const tY = yById.get(tid) ?? 0;
        const ordered = [...parents].sort((a, b) => (orderInLayer.get(a) ?? 0) - (orderInLayer.get(b) ?? 0));
        const targets = assignSymmetricTargets(tY, ordered, baseYGap * 0.9);
        targets.forEach((pY, pid) => addDesired(pid, pY, 1.8));
      });
    });

    // 4) 应用期望 y，并保持每层顺序与最小间距约束
    layers.forEach((arr) => {
      if (arr.length === 0) return;

      const nextYs = arr.map((id) => {
        const cur = yById.get(id) ?? 0;
        const d = desired.get(id);
        if (!d || d.w <= 0) return cur;
        const target = d.sum / d.w;
        return cur * 0.6 + target * 0.4;
      });

      // forward pass: enforce min gap
      for (let i = 1; i < arr.length; i++) {
        const prevId = arr[i - 1];
        const curId = arr[i];
        const prevDeg = (incoming.get(prevId)?.length ?? 0) + (outgoing.get(prevId)?.length ?? 0);
        const curDeg = (incoming.get(curId)?.length ?? 0) + (outgoing.get(curId)?.length ?? 0);
        const gap = baseYGap + Math.min(28, (prevDeg + curDeg) * 2);
        if (nextYs[i] < nextYs[i - 1] + gap) {
          nextYs[i] = nextYs[i - 1] + gap;
        }
      }

      // backward soft-centering to avoid drift
      const layerMid = nextYs.reduce((s, v) => s + v, 0) / nextYs.length;
      const currentMid = arr.reduce((s, id) => s + (yById.get(id) ?? 0), 0) / arr.length;
      const shift = (currentMid - layerMid) * 0.35;

      arr.forEach((id, idx) => {
        yById.set(id, nextYs[idx] + shift);
      });
    });
  }

  positioned.forEach((pos, id) => {
    positioned.set(id, { ...pos, y: yById.get(id) ?? pos.y });
  });

  // === 全局纵向居中（Symmetric Centering）===
  // 松弛迭代后各层质心可能偏离全图中轴，导致首尾单节点不在同一水平线。
  // 此步骤将每一层（含虚拟节点）整体平移，使该层真实节点质心对齐到全图中轴，
  // 从而保证括弧形布局对称、起始/终止/汇聚节点处于同一水平线。
  {
    // 1) 计算所有真实节点的 Y 范围中点作为全局中轴
    let rMinY = Infinity, rMaxY = -Infinity;
    connectedNodes.forEach(n => {
      const y = positioned.get(n.id)?.y ?? 0;
      if (y < rMinY) rMinY = y;
      if (y > rMaxY) rMaxY = y;
    });
    const globalCenterY = rMinY !== Infinity ? (rMinY + rMaxY) / 2 : cfg.marginy;

    // 2) 逐层平移：整层（含虚拟节点）一起移动，保持层内相对位置
    layers.forEach(arr => {
      const realInLayer = arr.filter(id => !dummyIds.has(id));
      if (realInLayer.length === 0) return;
      const centroid = realInLayer.reduce((s, id) => s + (positioned.get(id)?.y ?? 0), 0) / realInLayer.length;
      const shift = globalCenterY - centroid;
      if (Math.abs(shift) < 0.5) return;
      arr.forEach(id => {
        const p = positioned.get(id);
        if (p) positioned.set(id, { ...p, y: p.y + shift });
      });
    });
  }

  // === 提取长距离边的路径中继点（Waypoints）===
  // 每个 dummy 节点生成「入层间隙」+「出层间隙」两个 waypoint：
  //   - enter: (dummy_x - ranksep/2,  dummy_cy)  — 在前一层间隔的中点
  //   - exit:  (dummy_x + NODE_WIDTH + ranksep/2, dummy_cy) — 在后一层间隔的中点
  // 这样：
  //   段1 source_right → enter：dx = ranksep/2，贝塞尔完全在前间隔内 ✓
  //   段2 enter → exit：enter.y == exit.y，贝塞尔退化为水平直线，仅在 dummy_y 水平穿越 ✓
  //   段3 exit → target_left：dx = ranksep/2，贝塞尔完全在后间隔内 ✓
  // 三段路径均不进入任何真实节点的边界框。
  const edgeWaypoints = new Map<string, Array<{ x: number; y: number }>>();
  validEdges.forEach((edge) => {
    const chain = edgeDummyChain.get(edge.id);
    if (!chain || chain.length === 0) return;
    const wps = chain.flatMap((did) => {
      const pos = positioned.get(did);
      if (!pos) return [];
      const cy = pos.y + NODE_HEIGHT / 2;
      return [
        { x: pos.x - cfg.ranksep / 2,                  y: cy },  // 入层间隙中点
        { x: pos.x + NODE_WIDTH + cfg.ranksep / 2,     y: cy },  // 出层间隙中点
      ];
    });
    if (wps.length > 0) edgeWaypoints.set(edge.id, wps);
  });

  const connectedLayouted: Node[] = connectedNodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) ?? node.position,
  }));

  // 孤立节点放在主流程下方，且按当前 x 排序保持稳定
  const mainMaxY = connectedLayouted.length > 0
    ? Math.max(...connectedLayouted.map((n) => n.position.y + NODE_HEIGHT))
    : cfg.marginy;
  const isolatedRowY = mainMaxY + (isolatedNodes.length > 0 ? cfg.ranksep + 16 : 0);
  const isolatedSorted = [...isolatedNodes].sort((a, b) => (a.position.x ?? 0) - (b.position.x ?? 0));
  const isolatedLayouted: Node[] = isolatedSorted.map((node, idx) => ({
    ...node,
    position: {
      x: cfg.marginx + idx * (NODE_WIDTH + cfg.nodesep),
      y: isolatedRowY,
    },
  }));

  // 将路径中继点写入边数据，供 CustomEdge 渲染多段折线路径
  const outputEdges = edges.map((edge) => {
    const wps = edgeWaypoints.get(edge.id);
    if (!wps || wps.length === 0) return edge;
    return { ...edge, data: { ...((edge.data as object) ?? {}), waypoints: wps } };
  });

  return { nodes: [...connectedLayouted, ...isolatedLayouted], edges: outputEdges };
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
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 节点卡片主体 */}
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
            'absolute -top-3 -left-3 min-w-[32px] h-6 px-2 rounded-full text-[10px]',
            'font-bold flex items-center justify-center shadow-sm',
            disabled ? 'bg-gray-200 text-gray-400' : 'bg-blue-500 text-white',
          ].join(' ')}
        >
          {data.displayOrder ?? data.order}
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
      </div>

      {/*
        连接柄（Handle）：不设置 left/right，让 React Flow 自动居中于节点边框。
        悬停时 Handle 本体变大、变蓝，无需额外 overlay div。
        connectionRadius=60 放大吸附范围，连线更容易触发。
      */}
      <Handle
        type="target"
        position={Position.Left}
        title="拖入此处以连接"
        style={{
          width: isHovered ? 28 : 18,
          height: isHovered ? 28 : 18,
          background: isHovered ? '#2563eb' : '#dbeafe',
          border: `3px solid ${isHovered ? '#1d4ed8' : '#60a5fa'}`,
          borderRadius: '50%',
          boxShadow: isHovered
            ? '0 0 0 6px rgba(37,99,235,0.18), 0 2px 8px rgba(0,0,0,0.15)'
            : '0 0 0 3px rgba(96,165,250,0.20)',
          cursor: 'crosshair',
          transition: 'all 0.12s ease',
          zIndex: 20,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        title="从此处拖出以连线"
        style={{
          width: isHovered ? 28 : 18,
          height: isHovered ? 28 : 18,
          background: isHovered ? '#2563eb' : '#dbeafe',
          border: `3px solid ${isHovered ? '#1d4ed8' : '#60a5fa'}`,
          borderRadius: '50%',
          boxShadow: isHovered
            ? '0 0 0 6px rgba(37,99,235,0.18), 0 2px 8px rgba(0,0,0,0.15)'
            : '0 0 0 3px rgba(96,165,250,0.20)',
          cursor: 'crosshair',
          transition: 'all 0.12s ease',
          zIndex: 20,
        }}
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
  data,
  selected,
}) => {
  const [hovered, setHovered] = React.useState(false);
  const { setEdges } = useReactFlow();

  // 支持虚拟节点中继点：若边数据中含 waypoints，则生成多段贝塞尔路径绕过中间节点
  const waypoints = (data as any)?.waypoints as Array<{ x: number; y: number }> | undefined;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (waypoints && waypoints.length > 0) {
    // 多段贝塞尔：穿过每个中继点，每段用水平切线确保平滑过渡
    const allPts = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }];
    let d = `M ${allPts[0].x} ${allPts[0].y}`;
    for (let i = 0; i < allPts.length - 1; i++) {
      const p0 = allPts[i];
      const p1 = allPts[i + 1];
      const dx = p1.x - p0.x;
      // 水平切线控制点：保证每段贝塞尔的入/出方向水平，视觉上自然流畅
      const cp1x = p0.x + dx * 0.5;
      const cp2x = p1.x - dx * 0.5;
      d += ` C ${cp1x} ${p0.y} ${cp2x} ${p1.y} ${p1.x} ${p1.y}`;
    }
    edgePath = d;
    const midPt = allPts[Math.floor(allPts.length / 2)];
    labelX = midPt.x;
    labelY = midPt.y;
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: 0.4,
    });
  }

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


      {/* interaction area: transparent wide path for easier clicks (kept for pointer interactions) */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {/* visible edge path */}
      <path
        d={edgePath}
        fill="none"
        stroke={selected ? '#3b82f6' : (hovered ? '#60a5fa' : (style?.stroke ?? '#bfdbfe'))}
        strokeWidth={selected || hovered ? 2 : (style?.strokeWidth ?? 1.5)}
        strokeLinecap="round"
        markerEnd={`url(#${selected ? 'arrow-selected' : hovered ? 'arrow-hover' : 'arrow-default'})`}
        className="react-flow__edge-path"
        style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
      />

      {/* overlay buttons at midpoint (show on hover or selected) */}
      {(hovered || selected) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              display: 'flex',
              gap: 6,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {hovered && (
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
            )}

            {(hovered || selected) && (
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
      )}
    </>
  );
};

const edgeTypes = { custom: CustomEdge };


// helper to build edge options including data callback for adding parallel
const buildEdgeStyle = (onAddParallel: (s: string, t: string) => void) => ({
  type: 'custom' as const,
  style: { stroke: '#bfdbfe', strokeWidth: 1.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#bfdbfe',
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
  onDropInsertBetween,
  onDropParallelWithSuccessor,
  onDropInsertBefore,
  onNodePositionChange,
  onNodesPositionChange,
  readonly = false,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView, getNodes, getEdges } = useReactFlow();

  // drag-to-snap: disabled (set to 0 so menu never triggers; users connect via handles)
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const SNAP_DISTANCE = 0;

  const [dropMenuState, setDropMenuState] = useState<{
    visible: boolean;
    draggedPhaseId: string;
    targetPhaseId: string;
    x: number;
    y: number;
  }>({ visible: false, draggedPhaseId: '', targetPhaseId: '', x: 0, y: 0 });
  const hasInitialAutoFitRef = useRef(false);

  // helper to build edges using current onAddParallel
  const edgeOptions = buildEdgeStyle(onAddParallel ?? (() => {}));

  const mergeEdgesWithCurrent = useCallback((phaseEdges: Edge[], currentEdges: Edge[]) => {
    const merged = new Map<string, Edge>();

    // Start with current edges so visible edges are not dropped by a relayout.
    (currentEdges || []).forEach((e) => {
      const source = String((e as any).source ?? '');
      const target = String((e as any).target ?? '');
      if (!source || !target) return;
      const id = `e-${source}-${target}`;
      merged.set(id, {
        ...e,
        id,
        source,
        target,
        type: 'custom',
        animated: false,
        data: {
          ...((e as any).data ?? {}),
          onAddParallel: onAddParallel ?? (() => {}),
          onDelete: onEdgeDelete,
        },
      } as Edge);
    });

    // Phase edges are authoritative when present and overwrite same id.
    phaseEdges.forEach((e) => {
      const source = String((e as any).source ?? '');
      const target = String((e as any).target ?? '');
      if (!source || !target) return;
      const id = `e-${source}-${target}`;
      merged.set(id, {
        ...e,
        id,
        source,
        target,
        type: 'custom',
        animated: false,
        data: {
          ...((e as any).data ?? {}),
          onAddParallel: onAddParallel ?? (() => {}),
          onDelete: onEdgeDelete,
        },
      } as Edge);
    });

    return Array.from(merged.values());
  }, [onAddParallel, onEdgeDelete]);

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

  /**
   * 计算每个 phase 的显示编号（string），并行层级按 Y 排序（上方编号较小）
   * @param phs phases list
   * @param nodePositions Map of node id to {x,y}
   */
  const computeDisplayOrder = (phs: Phase[], nodePositions: Map<string, { x: number; y: number }>) => {
    const displayOrderMap = new Map<string, string>();
    const inDegree = new Map<string, number>();
    const children = new Map<string, string[]>();

    phs.forEach(p => {
      if (!inDegree.has(p.id)) inDegree.set(p.id, 0);
      const nexts = p.nextPhaseIds ?? [];
      children.set(p.id, nexts);
      nexts.forEach(nid => {
        inDegree.set(nid, (inDegree.get(nid) ?? 0) + 1);
      });
    });

    const queue: string[] = [];
    phs.forEach(p => {
      if ((inDegree.get(p.id) ?? 0) === 0) queue.push(p.id);
    });

    let order = 1;
    let current = [...queue];
    while (current.length > 0) {
      const isParallel = current.length > 1;

      const sorted = isParallel
        ? [...current].sort((a, b) => {
            const ya = nodePositions.get(a)?.y ?? 0;
            const yb = nodePositions.get(b)?.y ?? 0;
            return ya - yb;
          })
        : current;

      sorted.forEach((id, subIndex) => {
        if (isParallel) displayOrderMap.set(id, `${order}-${subIndex + 1}`);
        else displayOrderMap.set(id, `${order}`);
      });

      const next: string[] = [];
      current.forEach(id => {
        (children.get(id) ?? []).forEach(nid => {
          inDegree.set(nid, (inDegree.get(nid) ?? 1) - 1);
          if (inDegree.get(nid) === 0) next.push(nid);
        });
      });

      order++;
      current = next;
    }

    return displayOrderMap;
  };



  // phases → nodes + edges
  useEffect(() => {
    if (!phases?.length) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Sort phases and compute displayOrder so parallel phases share same number
    const sortedPhases = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));



    const rawNodes: Node[] = sortedPhases.map((p) => ({
      id: p.id,
      type: 'phase',
      position: {
        x: typeof p.x === 'number' ? p.x : 0,
        y: typeof p.y === 'number' ? p.y : 0,
      },
      data: {
        label: p.name,
        order: p.order ?? 1,
        // initial displayOrder uses numeric order; layout will recompute actual strings
        displayOrder: String(p.order ?? 1),
        taskCount: p.tasks?.length ?? 0,
        totalDays: p.totalDays ?? 0,
        enabled: p.enabled !== false,
      },
    }));

    // build helper: identify parallel groups before layout
    const getParallelGroups = (phs: Phase[]) => {
      const inDegree = new Map<string, number>();
      const children = new Map<string, string[]>();
      phs.forEach(p => { if (!inDegree.has(p.id)) inDegree.set(p.id, 0); const nexts = p.nextPhaseIds ?? []; children.set(p.id, nexts); nexts.forEach(nid => inDegree.set(nid, (inDegree.get(nid) ?? 0) + 1)); });
      const groups: string[][] = [];
      let current: string[] = [];
      phs.forEach(p => { if ((inDegree.get(p.id) ?? 0) === 0) current.push(p.id); });
      while (current.length > 0) {
        if (current.length > 1) groups.push([...current]);
        const next: string[] = [];
        current.forEach(id => { (children.get(id) ?? []).forEach(nid => { inDegree.set(nid, (inDegree.get(nid) ?? 1) - 1); if (inDegree.get(nid) === 0) next.push(nid); }); });
        current = next;
      }
      return groups;
    };

    // 构建边：优先用 nextPhaseIds，回退到按 order 线性连接
    const rawEdges: Edge[] = [];

    // 判断是否有任何阶段配置了显式流转
    const hasExplicitEdges = phases.some(
      (p) => Array.isArray(p.nextPhaseIds) && p.nextPhaseIds.length > 0
    );

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
    }
    // 不再回退到线性连接：若用户清除了所有 nextPhaseIds，节点保持无连线状态

    const mergedEdges = mergeEdgesWithCurrent(rawEdges, getEdges());

    // identify parallel groups and record user order
    const parallelGroups = getParallelGroups(sortedPhases);
    const currentNodes = (typeof getNodes === 'function') ? getNodes() : [];
    const userOrderMap = new Map<string, number>();
    parallelGroups.forEach(group => {
      const sortedByY = [...group].sort((a, b) => {
        const ya = currentNodes.find(n => n.id === a)?.position.y ?? 0;
        const yb = currentNodes.find(n => n.id === b)?.position.y ?? 0;
        return ya - yb;
      });
      sortedByY.forEach((id, idx) => userOrderMap.set(id, idx));
    });

    const hasAllSavedPositions = sortedPhases.length > 0 && sortedPhases.every(
      (p) => typeof p.x === 'number' && typeof p.y === 'number'
    );

    const { nodes: ln, edges: le } = hasAllSavedPositions
      ? { nodes: rawNodes, edges: mergedEdges }
      : getLayoutedElements(rawNodes, mergedEdges);

    const currentPosMap = new Map(currentNodes.map((n) => [n.id, n.position] as [string, { x: number; y: number }]));

    let lnWithManualPos = ln.map((n) => {
      const phase = sortedPhases.find((p) => p.id === n.id);
      if (phase && typeof phase.x === 'number' && typeof phase.y === 'number') {
        return { ...n, position: { x: phase.x, y: phase.y } };
      }
      const pos = currentPosMap.get(n.id);
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        return { ...n, position: { x: pos.x, y: pos.y } };
      }
      return n;
    });

    // Use latest/manual positions as the source of truth for subsequent Y adjustments.
    const nodeMap = new Map(lnWithManualPos.map((n) => [n.id, n]));

    // After layout/manual merge: reassign Y within each parallel group to preserve user order
    let lnAdjusted = lnWithManualPos;
    parallelGroups.forEach(group => {
      if (group.length < 2) return;
      const dagreYs = [...group]
        .map(id => nodeMap.get(id)?.position.y ?? 0)
        .sort((a, b) => a - b);
      lnAdjusted = lnAdjusted.map(n => {
        if (!group.includes(n.id)) return n;
        const userRank = userOrderMap.get(n.id) ?? 0;
        return { ...n, position: { ...n.position, y: dagreYs[userRank] } };
      });
    });

    // compute displayOrder using adjusted positions
    const nodePositions = new Map<string, { x: number; y: number }>(lnAdjusted.map(n => [n.id, n.position] as [string, {x:number,y:number}]));
    const displayOrderMap = computeDisplayOrder(sortedPhases, nodePositions);

    const lnUpdated = lnAdjusted.map(n => ({
      ...n,
      data: {
        ...n.data,
        displayOrder: displayOrderMap.get(n.id) ?? String(n.data?.order ?? 1),
      },
    }));

    setNodes(lnUpdated);
    setEdges(le);

    // Keep user zoom/viewport during editing. Auto-fit only once when data is first loaded.
    if (!hasInitialAutoFitRef.current && sortedPhases.length > 0) {
      hasInitialAutoFitRef.current = true;
      setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 50);
    }
  }, [phases, fitView, getNodes, getEdges, onAddParallel, onEdgeDelete, setEdges, setNodes, mergeEdgesWithCurrent]);

  // 监听外部 fitView / reLayout 事件
  useEffect(() => {
    const fitHandler = () => fitView({ padding: 0.25, duration: 400 });

    const handleReLayout = (evt?: Event) => {
      if (!phases?.length) return;
      const mode: LayoutMode = (evt as CustomEvent | undefined)?.detail?.mode === 'readable' ? 'readable' : 'compact';
      const cfg = layoutConfigByMode(mode);

      // Build raw nodes/edges and run adaptive layout directly.
      // Do not apply legacy parallel/tail post-processors; they can reintroduce crossings.
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
      }
      // 无显式连线时不再回退到线性连接（TemplateEditor 加载时已保证初始连线）

      const mergedEdges = mergeEdgesWithCurrent(rawEdges, getEdges());
      const { nodes: ln, edges: le } = getLayoutedElements(rawNodes, mergedEdges, mode);

      // Recompute display order using adaptive-layout positions
      const nodePositions = new Map<string, { x: number; y: number }>(ln.map(n => [n.id, n.position] as [string, {x:number,y:number}]));
      const displayOrderMap = computeDisplayOrder(phases, nodePositions);
      const lnUpdated = ln.map(n => ({ ...n, data: { ...n.data, displayOrder: displayOrderMap.get(n.id) ?? String(n.data?.order ?? 1) } }));

      setNodes(lnUpdated);
      setEdges(le);
      onNodesPositionChange?.(lnUpdated.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })));
      setTimeout(() => fitView({ padding: cfg.fitPadding, duration: 400 }), 50);
    };

    window.addEventListener('flow:fitView', fitHandler);
    window.addEventListener('flow:reLayout', handleReLayout);
    return () => {
      window.removeEventListener('flow:fitView', fitHandler);
      window.removeEventListener('flow:reLayout', handleReLayout);
    };
  }, [fitView, getNodes, getEdges, onAddParallel, onEdgeDelete, onNodesPositionChange, phases, setEdges, setNodes, mergeEdgesWithCurrent]);

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

  // 拖拽节点：不做磁吸检测，允许节点自由拖拽到任意位置
  const handleNodeDrag = useCallback((_: any, _draggedNode: Node) => {
    // snap detection disabled – free dragging
  }, []);

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    if (typeof draggedNode.position?.x === 'number' && typeof draggedNode.position?.y === 'number') {
      onNodePositionChange?.(draggedNode.id, draggedNode.position.x, draggedNode.position.y);
    }
    setDragOverNodeId(null);
    // Note: displayOrder is calculated in the main effect when phases change.
    // We do NOT recalculate here to avoid triggering setNodes during drag stop,
    // which would block the drag animation and cause MiniMap flickering.
  }, [onNodePositionChange]);

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
    <svg style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
      <defs>
        <marker id="arrow-default" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z" fill="#bfdbfe" />
        </marker>
        <marker id="arrow-hover" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z" fill="#60a5fa" />
        </marker>
        <marker id="arrow-selected" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z" fill="#3b82f6" />
        </marker>
      </defs>
    </svg>
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
      connectionRadius={60}
      connectionLineType={ConnectionLineType.Bezier}
      defaultEdgeOptions={{ type: 'default', animated: false, style: { stroke: '#bfdbfe', strokeWidth: 1.5 } }}
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

      {/* 画布内浮动「自动整理」按钮 */}
      {!readonly && (
        <Panel position="top-right">
          <div className="flex flex-col gap-1.5 mr-1 mt-1">
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('flow:reLayout', { detail: { mode: 'compact' } })
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-blue-50 hover:border-blue-300 text-gray-600 transition-colors"
              title="自动整理节点位置，消除连线交叉（紧凑）"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 2.5h10M1 5.5h7M1 8.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              自动整理
            </button>
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('flow:reLayout', { detail: { mode: 'readable' } })
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-purple-50 hover:border-purple-300 text-gray-600 transition-colors"
              title="间距更大的易读布局"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 2.5h10M1 5.5h10M1 8.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              宽松布局
            </button>
          </div>
        </Panel>
      )}
    </ReactFlow>

    {/* Drop menu (outside ReactFlow but inside provider) */}
    {dropMenuState.visible && (
      <>
        {(() => {
          const targetPhase = phases.find((p) => p.id === dropMenuState.targetPhaseId);
          const successorId = (targetPhase?.nextPhaseIds ?? [])[0];
          const successor = phases.find((p) => p.id === successorId);

          return (
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

          {successor && (
            <div className="px-4 py-2 text-[11px] text-gray-500 bg-amber-50 border-b border-amber-100">
              检测到后继节点：
              <span className="font-semibold text-amber-700 ml-1">{successor.name}</span>
            </div>
          )}

          {successor && (
            <>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 transition-colors text-left group"
                onClick={() => {
                  setDropMenuState(s => ({ ...s, visible: false }));
                  onDropInsertBetween?.(dropMenuState.draggedPhaseId, dropMenuState.targetPhaseId, dropMenuState.x, dropMenuState.y);
                }}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M6 5l-3 3 3 3M10 5l3 3-3 3" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700">插入在两节点之间</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">插入到“目标节点 → 后继节点”中间</div>
                </div>
              </button>

              <div className="mx-4 border-t border-gray-50" />

              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cyan-50 transition-colors text-left group"
                onClick={() => {
                  setDropMenuState(s => ({ ...s, visible: false }));
                  onDropParallelWithSuccessor?.(dropMenuState.draggedPhaseId, dropMenuState.targetPhaseId, dropMenuState.x, dropMenuState.y);
                }}
              >
                <div className="w-8 h-8 rounded-lg bg-cyan-100 group-hover:bg-cyan-200 flex items-center justify-center flex-shrink-0 transition-colors">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h10M3 12h10" stroke="#0891B2" strokeWidth="1.8" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700">与后继节点并行</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">目标节点将同时指向后继与拖拽节点</div>
                </div>
              </button>

              <div className="mx-4 border-t border-gray-50" />
            </>
          )}

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

          <div className="mx-4 border-t border-gray-50" />

          <button
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50 transition-colors text-left group"
            onClick={() => {
              setDropMenuState(s => ({ ...s, visible: false }));
              onDropInsertBefore?.(dropMenuState.draggedPhaseId, dropMenuState.targetPhaseId, dropMenuState.x, dropMenuState.y);
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center flex-shrink-0 transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 8H5M8 5L5 8l3 3" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">插入到此节点之前</div>
              <div className="text-[11px] text-gray-400 mt-0.5">当前节点前置将改为拖拽节点</div>
            </div>
          </button>

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <button className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors" onClick={() => setDropMenuState(s => ({ ...s, visible: false }))}>取消</button>
          </div>
        </div>
            </>
          );
        })()}
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
