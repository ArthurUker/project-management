/**
 * MindMapView — 将 Markdown 内容渲染为横向扩展思维导图
 *
 * Markdown 语法规则：
 *   # 一级标题    → 根节点（最左侧）
 *   ## 二级标题   → 一级分支
 *   ### 三级标题  → 二级分支
 *   #### 四级标题 → 三级分支
 *   - 列表项      → 叶节点（挂在当前最近标题下）
 *   普通文本行   → 同叶节点
 */
import { useMemo } from 'react';

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface MindNode {
  id: string;
  label: string;
  level: number; // 1=根, 2,3,4,5=叶
  children: MindNode[];
}

interface LayoutNode {
  node: MindNode;
  x: number;
  y: number;
}

// ─── 布局常量 ────────────────────────────────────────────────────────────────

const NODE_H   = 30;   // 节点高度 px
const ROW_GAP  = 10;   // 同级节点纵向间距
const ROW_SLOT = NODE_H + ROW_GAP; // 每个"叶槽"占用高度
const COL_GAP  = 52;   // 父子节点横向间距
const PADDING  = 24;   // 画布内边距

// 每一层节点宽度（越深越窄）
const LEVEL_W: Record<number, number> = {
  1: 180, 2: 160, 3: 150, 4: 140, 5: 130,
};
function nodeW(level: number) { return LEVEL_W[level] ?? 120; }

// 每一层节点样式
const LEVEL_STYLE: Record<number, { bg: string; text: string; border: string; fw: number; radius: number }> = {
  1: { bg: '#1d4ed8', text: '#fff',    border: '#1d4ed8', fw: 700, radius: 8 },
  2: { bg: '#2563eb', text: '#fff',    border: '#2563eb', fw: 600, radius: 6 },
  3: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', fw: 600, radius: 5 },
  4: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', fw: 500, radius: 4 },
  5: { bg: '#f8fafc', text: '#374151', border: '#e2e8f0', fw: 400, radius: 4 },
};
function nodeStyle(level: number) { return LEVEL_STYLE[level] ?? LEVEL_STYLE[5]; }

// 连线颜色（与父节点配套）
const LINE_COLOR: Record<number, string> = {
  1: '#3b82f6', 2: '#60a5fa', 3: '#93c5fd', 4: '#bfdbfe', 5: '#e2e8f0',
};
function lineColor(parentLevel: number) { return LINE_COLOR[parentLevel] ?? '#e2e8f0'; }

// ─── Markdown → 树 ──────────────────────────────────────────────────────────

function parseMarkdown(content: string): MindNode {
  const lines = content.split('\n');
  const root: MindNode = { id: 'root', label: '', level: 0, children: [] };
  const stack: MindNode[] = [root];
  let counter = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    // 跳过 Markdown 表格分隔行
    if (/^\|?[\s\-:|]+\|/.test(line.trim())) continue;
    // 跳过表格数据行
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) continue;

    let level = 5;
    let label = '';

    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    const h4 = line.match(/^####\s+(.*)/);
    const bullet = line.match(/^[-*+]\s+(.*)/);

    if (h1)     { level = 1; label = h1[1].trim(); }
    else if (h2){ level = 2; label = h2[1].trim(); }
    else if (h3){ level = 3; label = h3[1].trim(); }
    else if (h4){ level = 4; label = h4[1].trim(); }
    else if (bullet) { level = 5; label = bullet[1].trim(); }
    else { level = 5; label = line.trim(); }

    if (!label) continue;

    const node: MindNode = { id: `n${counter++}`, label, level, children: [] };

    // 找到合适的父节点（level 更低的）
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  // 如果只有一个 h1 子节点，提升为根
  if (root.children.length === 1 && root.children[0].level === 1) {
    const h1node = root.children[0];
    root.label = h1node.label;
    root.level = 1;
    root.children = h1node.children;
  } else if (root.children.length > 0) {
    root.label = '文档概览';
    root.level = 1;
  } else {
    root.label = '暂无内容';
    root.level = 1;
  }

  return root;
}

// ─── 布局算法 ─────────────────────────────────────────────────────────────────

function countLeaves(node: MindNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((s, c) => s + countLeaves(c), 0);
}

function layoutNodes(node: MindNode, x: number, startY: number): LayoutNode[] {
  const leaves    = countLeaves(node);
  const totalH    = leaves * ROW_SLOT;
  const cy        = startY + Math.floor(totalH / 2) - Math.floor(NODE_H / 2);
  const result: LayoutNode[] = [{ node, x, y: cy }];

  let childY = startY;
  for (const child of node.children) {
    const childLeaves = countLeaves(child);
    // 子节点的 x = 父节点左边 + 父节点宽度 + COL_GAP
    result.push(...layoutNodes(child, x + nodeW(node.level) + COL_GAP, childY));
    childY += childLeaves * ROW_SLOT;
  }
  return result;
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export default function MindMapView({ content }: { content: string }) {
  const { layoutList, connections, canvasW, canvasH } = useMemo(() => {
    const root = parseMarkdown(content || '');
    const layoutList = layoutNodes(root, PADDING, PADDING);

    // 坐标索引
    const posMap: Record<string, { x: number; y: number }> = {};
    for (const l of layoutList) posMap[l.node.id] = { x: l.x, y: l.y };

    // 收集连线
    const connections: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    function collectConns(node: MindNode) {
      const p = posMap[node.id];
      if (!p) return;
      for (const child of node.children) {
        const c = posMap[child.id];
        if (!c) continue;
        connections.push({
          x1: p.x + nodeW(node.level),
          y1: p.y + NODE_H / 2,
          x2: c.x,
          y2: c.y + NODE_H / 2,
          color: lineColor(node.level),
        });
        collectConns(child);
      }
    }
    collectConns(root);

    const canvasW = Math.max(...layoutList.map(l => l.x + nodeW(l.node.level))) + PADDING;
    const canvasH = Math.max(...layoutList.map(l => l.y + NODE_H)) + PADDING;
    return { layoutList, connections, canvasW, canvasH };
  }, [content]);

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', width: '100%' }}>
      <div style={{ position: 'relative', width: canvasW, height: canvasH, minWidth: 300 }}>
        {/* 连线 SVG */}
        <svg
          style={{ position: 'absolute', top: 0, left: 0, width: canvasW, height: canvasH, pointerEvents: 'none' }}
        >
          {connections.map((c, i) => {
            const midX = (c.x1 + c.x2) / 2;
            return (
              <path
                key={i}
                d={`M ${c.x1},${c.y1} C ${midX},${c.y1} ${midX},${c.y2} ${c.x2},${c.y2}`}
                fill="none"
                stroke={c.color}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {/* 节点 */}
        {layoutList.map(({ node, x, y }) => {
          const s = nodeStyle(node.level);
          const w = nodeW(node.level);
          return (
            <div
              key={node.id}
              title={node.label}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                height: NODE_H,
                background: s.bg,
                color: s.text,
                border: `1.5px solid ${s.border}`,
                borderRadius: s.radius,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 8,
                paddingRight: 8,
                fontSize: node.level === 1 ? 13 : 12,
                fontWeight: s.fw,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                boxShadow: node.level <= 2 ? '0 2px 6px rgba(37,99,235,0.15)' : 'none',
                userSelect: 'none',
                boxSizing: 'border-box',
                cursor: 'default',
                letterSpacing: node.level === 1 ? '0.01em' : 'normal',
              }}
            >
              {node.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
