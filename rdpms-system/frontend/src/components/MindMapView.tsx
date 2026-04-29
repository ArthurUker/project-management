/**
 * MindMapView — 可折叠·可缩放·可平移思维导图
 * 嵌入预览 (inline) + 全屏交互模式
 * :::mindmap 语法块嵌入文档
 */
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────
type MindNode = { id: string; label: string; level: number; children: MindNode[] };
type LN = { node: MindNode; x: number; y: number };
type Conn = { x1: number; y1: number; x2: number; y2: number; color: string; type?: 'line' };
type Mode = 'right' | 'left' | 'bidir' | 'dir' | 'timeline' | 'fishbone';
type ThemeId = 'ocean' | 'mint' | 'sunset';
type MindMapViewProps = { content: string; editable?: boolean; onChange?: (content: string) => void; previewCollapseLevel?: number; onRequestEdit?: () => void; inlineHeight?: number };
type Variant = 'viewer' | 'editor';

// ── Constants ─────────────────────────────────────────────────────────────
const NH = 32, NG = 12, SLOT = NH + NG, CG = 64, PAD = 32, FISH_OFF = 72;
const LW: Record<number, number> = { 1: 200, 2: 180, 3: 168, 4: 156, 5: 144 };
const lw = (l: number) => LW[l] ?? 132;

const LS: Record<number, { bg: string; fg: string; bdr: string; fw: number; r: number }> = {
  1: { bg: '#1d4ed8', fg: '#fff',    bdr: '#1d4ed8', fw: 700, r: 8 },
  2: { bg: '#2563eb', fg: '#fff',    bdr: '#2563eb', fw: 600, r: 6 },
  3: { bg: '#dbeafe', fg: '#1e40af', bdr: '#93c5fd', fw: 600, r: 5 },
  4: { bg: '#eff6ff', fg: '#1e40af', bdr: '#bfdbfe', fw: 500, r: 4 },
  5: { bg: '#f8fafc', fg: '#374151', bdr: '#e2e8f0', fw: 400, r: 4 },
};
const LC: Record<number, string> = { 1: '#3b82f6', 2: '#60a5fa', 3: '#93c5fd', 4: '#bfdbfe', 5: '#e2e8f0' };
const lc = (l: number) => LC[l] ?? '#e2e8f0';

// ── Parse Markdown ────────────────────────────────────────────────────────
function parseMD(content: string): MindNode {
  const lines = content.split('\n');
  const root: MindNode = { id: 'root', label: '', level: 0, children: [] };
  const stack: MindNode[] = [root];
  let n = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^\|[\s\-:|]/.test(line.trim()) || (line.trim().startsWith('|') && line.trim().endsWith('|'))) continue;
    let level = 5, label = '';
    const m4 = line.match(/^####\s+(.*)/), m3 = line.match(/^###\s+(.*)/);
    const m2 = line.match(/^##\s+(.*)/),  m1 = line.match(/^#\s+(.*)/);
    const mb = line.match(/^[-*+]\s+(.*)/);
    if (m4)     { level = 4; label = m4[1].trim(); }
    else if (m3){ level = 3; label = m3[1].trim(); }
    else if (m2){ level = 2; label = m2[1].trim(); }
    else if (m1){ level = 1; label = m1[1].trim(); }
    else if (mb){ level = 5; label = mb[1].trim(); }
    else        { level = 5; label = line.trim(); }
    if (!label) continue;
    const node: MindNode = { id: `n${n++}`, label, level, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  if (root.children.length === 1 && root.children[0].level === 1) {
    const h1 = root.children[0];
    root.label = h1.label; root.level = 1; root.id = h1.id; root.children = h1.children;
  } else if (root.children.length > 0) {
    root.label = '文档概览'; root.level = 1;
  } else {
    root.label = '暂无内容'; root.level = 1;
  }
  return root;
}

function cloneTree(node: MindNode): MindNode {
  return { ...node, children: node.children.map(cloneTree) };
}

function normalizeLevels(node: MindNode, level = 1) {
  node.level = level;
  node.children.forEach(c => normalizeLevels(c, Math.min(level + 1, 5)));
}

function toMarkdown(node: MindNode): string {
  const lines: string[] = [];
  const walk = (n: MindNode) => {
    const lv = Math.max(1, n.level);
    if (lv <= 4) lines.push(`${'#'.repeat(lv)} ${n.label || '未命名节点'}`);
    else lines.push(`- ${n.label || '未命名节点'}`);
    n.children.forEach(walk);
  };
  walk(node);
  return lines.join('\n');
}

function findNode(node: MindNode, id: string): MindNode | null {
  if (node.id === id) return node;
  for (const c of node.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

function findParentInfo(node: MindNode, targetId: string): { parent: MindNode; index: number } | null {
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].id === targetId) return { parent: node, index: i };
    const hit = findParentInfo(node.children[i], targetId);
    if (hit) return hit;
  }
  return null;
}

function moveSibling(tree: MindNode, targetId: string, delta: -1 | 1) {
  const info = findParentInfo(tree, targetId);
  if (!info) return;
  const nextIndex = info.index + delta;
  if (nextIndex < 0 || nextIndex >= info.parent.children.length) return;
  const [item] = info.parent.children.splice(info.index, 1);
  info.parent.children.splice(nextIndex, 0, item);
}

function indentNode(tree: MindNode, targetId: string) {
  const info = findParentInfo(tree, targetId);
  if (!info || info.index === 0) return;
  const prev = info.parent.children[info.index - 1];
  const [item] = info.parent.children.splice(info.index, 1);
  prev.children.push(item);
}

function outdentNode(tree: MindNode, targetId: string) {
  const info = findParentInfo(tree, targetId);
  if (!info) return;
  const parentInfo = findParentInfo(tree, info.parent.id);
  if (!parentInfo) return;
  const [item] = info.parent.children.splice(info.index, 1);
  parentInfo.parent.children.splice(parentInfo.index + 1, 0, item);
}

const THEMES: Record<ThemeId, { bg: string; panel: string; border: string; hint: string; line: string; levels: Record<number, { bg: string; fg: string; bdr: string; fw: number; r: number }> }> = {
  ocean: {
    bg: 'rgba(15,23,42,0.97)', panel: 'rgba(30,41,59,0.88)', border: 'rgba(255,255,255,0.1)', hint: 'rgba(255,255,255,0.35)', line: '#3b82f6', levels: LS,
  },
  mint: {
    bg: 'rgba(10,35,32,0.97)', panel: 'rgba(16,52,47,0.9)', border: 'rgba(167,243,208,0.16)', hint: 'rgba(209,250,229,0.45)', line: '#34d399', levels: {
      1: { bg: '#059669', fg: '#fff', bdr: '#059669', fw: 700, r: 8 },
      2: { bg: '#10b981', fg: '#fff', bdr: '#10b981', fw: 600, r: 6 },
      3: { bg: '#d1fae5', fg: '#065f46', bdr: '#6ee7b7', fw: 600, r: 5 },
      4: { bg: '#ecfdf5', fg: '#065f46', bdr: '#a7f3d0', fw: 500, r: 4 },
      5: { bg: '#f0fdf4', fg: '#166534', bdr: '#bbf7d0', fw: 400, r: 4 },
    },
  },
  sunset: {
    bg: 'rgba(49,24,19,0.97)', panel: 'rgba(69,34,26,0.9)', border: 'rgba(253,186,116,0.16)', hint: 'rgba(254,215,170,0.45)', line: '#fb923c', levels: {
      1: { bg: '#ea580c', fg: '#fff', bdr: '#ea580c', fw: 700, r: 8 },
      2: { bg: '#f97316', fg: '#fff', bdr: '#f97316', fw: 600, r: 6 },
      3: { bg: '#ffedd5', fg: '#9a3412', bdr: '#fdba74', fw: 600, r: 5 },
      4: { bg: '#fff7ed', fg: '#9a3412', bdr: '#fed7aa', fw: 500, r: 4 },
      5: { bg: '#fffbeb', fg: '#92400e', bdr: '#fde68a', fw: 400, r: 4 },
    },
  },
};

// ── Layout helpers ────────────────────────────────────────────────────────
function cl(node: MindNode, col: Set<string>): number {
  if (node.children.length === 0 || col.has(node.id)) return 1;
  return node.children.reduce((s, c) => s + cl(c, col), 0);
}
function lr(node: MindNode, x: number, sy: number, col: Set<string>): LN[] {
  const lv = cl(node, col), cy = sy + Math.floor(lv * SLOT / 2) - Math.floor(NH / 2);
  const res: LN[] = [{ node, x, y: cy }];
  if (!col.has(node.id)) {
    let y2 = sy;
    for (const c of node.children) { res.push(...lr(c, x + lw(node.level) + CG, y2, col)); y2 += cl(c, col) * SLOT; }
  }
  return res;
}
function ll(node: MindNode, rx: number, sy: number, col: Set<string>): LN[] {
  const lv = cl(node, col), cy = sy + Math.floor(lv * SLOT / 2) - Math.floor(NH / 2);
  const res: LN[] = [{ node, x: rx - lw(node.level), y: cy }];
  if (!col.has(node.id)) {
    let y2 = sy;
    for (const c of node.children) { res.push(...ll(c, rx - lw(node.level) - CG, y2, col)); y2 += cl(c, col) * SLOT; }
  }
  return res;
}
function mw(node: MindNode, col: Set<string>): number {
  if (node.children.length === 0 || col.has(node.id)) return lw(node.level);
  return lw(node.level) + CG + Math.max(...node.children.map(c => mw(c, col)));
}

// ── Timeline layout ───────────────────────────────────────────────────────
function layoutTimeline(root: MindNode, col: Set<string>): { list: LN[]; cW: number; cH: number } {
  const list: LN[] = [];
  const children = col.has(root.id) ? [] : root.children;
  const TH = 88; // horizontal gap between L2 columns
  let aboveMax = 0, belowMax = 0;
  children.forEach((c, i) => {
    const slots = col.has(c.id) ? 0 : c.children.reduce((s, gc) => s + cl(gc, col), 0);
    if (i % 2 === 0) aboveMax = Math.max(aboveMax, slots);
    else belowMax = Math.max(belowMax, slots);
  });
  const spineY = PAD + aboveMax * SLOT;
  list.push({ node: root, x: PAD, y: spineY - NH / 2 });
  let curX = PAD + lw(1) + TH;
  children.forEach((child, idx) => {
    const goAbove = idx % 2 === 0;
    list.push({ node: child, x: curX, y: spineY - NH / 2 });
    if (!col.has(child.id) && child.children.length > 0) {
      const totalSlots = child.children.reduce((s, c) => s + cl(c, col), 0);
      let sy = goAbove ? spineY - NH / 2 - totalSlots * SLOT : spineY + NH / 2 + NG;
      for (const gc of child.children) {
        const gcSlots = cl(gc, col);
        const gcY = sy + Math.floor(gcSlots * SLOT / 2) - Math.floor(NH / 2);
        const gcX = curX + Math.floor((lw(child.level) - lw(gc.level)) / 2);
        list.push({ node: gc, x: gcX, y: gcY });
        if (!col.has(gc.id) && gc.children.length > 0) {
          let y2 = sy;
          for (const l4 of gc.children) { list.push(...lr(l4, gcX + lw(gc.level) + Math.floor(CG / 2), y2, col)); y2 += cl(l4, col) * SLOT; }
        }
        sy += gcSlots * SLOT;
      }
    }
    curX += lw(child.level) + TH;
  });
  const cW = (list.length ? Math.max(...list.map(l => l.x + lw(l.node.level))) : 0) + PAD;
  const cH = (list.length ? Math.max(...list.map(l => l.y + NH)) : 0) + PAD;
  return { list, cW, cH };
}

// ── Fishbone layout ───────────────────────────────────────────────────────
function layoutFishbone(root: MindNode, col: Set<string>): { list: LN[]; cW: number; cH: number } {
  const STEP = 180;
  const list: LN[] = [];
  const children = col.has(root.id) ? [] : root.children;
  const nPairs = Math.ceil(children.length / 2);
  const baseRootX = (nPairs + 1) * STEP;
  const spineY = FISH_OFF + NH + PAD;
  list.push({ node: root, x: baseRootX, y: spineY - NH / 2 });
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const goAbove = i % 2 === 0;
    const ribIdx = Math.floor(i / 2);
    const attachX = baseRootX - (ribIdx + 1) * STEP;
    const childCX = attachX - FISH_OFF;
    const childCY = goAbove ? spineY - FISH_OFF : spineY + FISH_OFF;
    const childX = childCX - Math.floor(lw(child.level) / 2);
    const childY = childCY - Math.floor(NH / 2);
    list.push({ node: child, x: childX, y: childY });
    if (!col.has(child.id) && child.children.length > 0) {
      child.children.forEach((gc, gi) => {
        const gcX = childX - lw(gc.level) - Math.floor(CG / 2);
        const gcCY = goAbove ? childCY - gi * SLOT : childCY + gi * SLOT;
        const gcY = gcCY - Math.floor(NH / 2);
        list.push({ node: gc, x: gcX, y: gcY });
        if (!col.has(gc.id) && gc.children.length > 0) {
          gc.children.forEach((l4, l4i) => {
            list.push({ node: l4, x: gcX - lw(l4.level) - NG, y: gcY + l4i * SLOT });
          });
        }
      });
    }
  }
  const minX = list.length ? Math.min(...list.map(l => l.x)) : PAD;
  const minY = list.length ? Math.min(...list.map(l => l.y)) : PAD;
  const shiftX = minX < PAD ? PAD - minX : 0;
  const shiftY = minY < PAD ? PAD - minY : 0;
  if (shiftX > 0 || shiftY > 0) for (const item of list) { item.x += shiftX; item.y += shiftY; }
  const cW = (list.length ? Math.max(...list.map(l => l.x + lw(l.node.level))) : 0) + PAD;
  const cH = (list.length ? Math.max(...list.map(l => l.y + NH)) : 0) + PAD;
  return { list, cW, cH };
}

function doLayout(root: MindNode, mode: Mode, col: Set<string>) {
  let list: LN[], cW: number, cH: number;
  if (mode === 'right') {
    list = lr(root, PAD, PAD, col);
    cW = Math.max(...list.map(l => l.x + lw(l.node.level))) + PAD;
    cH = Math.max(...list.map(l => l.y + NH)) + PAD;
  } else if (mode === 'left') {
    const maxW = mw(root, col);
    list = ll(root, PAD + maxW, PAD, col);
    cW = PAD + maxW + PAD; cH = Math.max(...list.map(l => l.y + NH)) + PAD;
  } else if (mode === 'bidir') {
    const ch = root.children, hi = Math.ceil(ch.length / 2);
    const rc = ch.slice(0, hi), lc2 = ch.slice(hi);
    const lmW = lc2.length > 0 ? Math.max(...lc2.map(c => mw(c, col))) + CG : 0;
    const rx = PAD + lmW, rlt = cl(root, col);
    const rootY = PAD + Math.floor(rlt * SLOT / 2) - Math.floor(NH / 2);
    const rn: LN = { node: root, x: rx, y: rootY };
    const ar: LN[] = []; const rl = rc.reduce((s, c) => s + cl(c, col), 0);
    let ry = rootY + NH / 2 - rl * SLOT / 2;
    for (const c of rc) { ar.push(...lr(c, rx + lw(root.level) + CG, ry, col)); ry += cl(c, col) * SLOT; }
    const al: LN[] = []; const ll2 = lc2.reduce((s, c) => s + cl(c, col), 0);
    let ly = rootY + NH / 2 - ll2 * SLOT / 2;
    for (const c of lc2) { al.push(...ll(c, rx - CG, ly, col)); ly += cl(c, col) * SLOT; }
    list = [rn, ...ar, ...al];
    cW = Math.max(...list.map(l => l.x + lw(l.node.level))) + PAD;
    cH = Math.max(...list.map(l => l.y + NH)) + PAD;
  } else if (mode === 'timeline') {
    return layoutTimeline(root, col);
  } else if (mode === 'fishbone') {
    return layoutFishbone(root, col);
  } else {
    // directory
    const IND = 28, VG = 8, DH = 28; list = []; let y = PAD;
    const walkDir = (node: MindNode, d: number) => {
      list.push({ node, x: PAD + d * IND, y }); y += DH + VG;
      if (!col.has(node.id)) for (const c of node.children) walkDir(c, d + 1);
    };
    walkDir(root, 0);
    cW = Math.max(...list.map(l => l.x + 480)) + PAD; cH = y + PAD;
  }
  return { list, cW, cH };
}

// ── Connections ───────────────────────────────────────────────────────────
function buildConns(list: LN[], root: MindNode, mode: Mode, col: Set<string>): Conn[] {
  const pm: Record<string, { x: number; y: number }> = {};
  for (const l of list) pm[l.node.id] = { x: l.x, y: l.y };
  const cs: Conn[] = [];

  const walkBez = (nd: MindNode, lft: boolean) => {
    const p = pm[nd.id]; if (!p || col.has(nd.id)) return;
    for (const c of nd.children) {
      const cp = pm[c.id]; if (!cp) continue;
      const x1 = lft ? p.x : p.x + lw(nd.level), x2 = lft ? cp.x + lw(c.level) : cp.x;
      cs.push({ x1, y1: p.y + NH / 2, x2, y2: cp.y + NH / 2, color: lc(nd.level) });
      walkBez(c, lft);
    }
  };

  if (mode === 'dir') {
    const walkDir = (nd: MindNode) => {
      const p = pm[nd.id]; if (!p || col.has(nd.id)) return;
      for (const c of nd.children) {
        const cp = pm[c.id]; if (!cp) continue;
        cs.push({ x1: p.x + 8, y1: p.y + 14, x2: p.x + 8, y2: cp.y + 14, color: lc(nd.level) });
        cs.push({ x1: p.x + 8, y1: cp.y + 14, x2: cp.x, y2: cp.y + 14, color: lc(nd.level) });
        walkDir(c);
      }
    };
    walkDir(root);
  } else if (mode === 'left') {
    walkBez(root, true);
  } else if (mode === 'bidir') {
    const hi = Math.ceil(root.children.length / 2);
    const rp = pm[root.id];
    if (rp && !col.has(root.id)) {
      for (const c of root.children.slice(0, hi)) {
        const cp = pm[c.id]; if (!cp) continue;
        cs.push({ x1: rp.x + lw(root.level), y1: rp.y + NH / 2, x2: cp.x, y2: cp.y + NH / 2, color: lc(root.level) });
        walkBez(c, false);
      }
      for (const c of root.children.slice(hi)) {
        const cp = pm[c.id]; if (!cp) continue;
        cs.push({ x1: rp.x, y1: rp.y + NH / 2, x2: cp.x + lw(c.level), y2: cp.y + NH / 2, color: lc(root.level) });
        walkBez(c, true);
      }
    }
  } else if (mode === 'timeline') {
    const rp = pm[root.id]; if (!rp || col.has(root.id)) return cs;
    for (const l2 of root.children) {
      const l2p = pm[l2.id]; if (!l2p) continue;
      cs.push({ x1: rp.x + lw(root.level), y1: rp.y + NH / 2, x2: l2p.x, y2: l2p.y + NH / 2, color: lc(1) });
      if (col.has(l2.id)) continue;
      const l2CX = l2p.x + Math.floor(lw(l2.level) / 2);
      for (const l3 of l2.children) {
        const l3p = pm[l3.id]; if (!l3p) continue;
        cs.push({ x1: l2CX, y1: l3p.y < l2p.y ? l2p.y : l2p.y + NH, x2: l2CX, y2: l3p.y < l2p.y ? l3p.y + NH : l3p.y, color: lc(2), type: 'line' });
        walkBez(l3, false);
      }
    }
  } else if (mode === 'fishbone') {
    const rp = pm[root.id]; if (!rp || col.has(root.id)) return cs;
    const spY = rp.y + NH / 2;
    for (const l2 of root.children) {
      const l2p = pm[l2.id]; if (!l2p) continue;
      const l2CX = l2p.x + Math.floor(lw(l2.level) / 2);
      cs.push({ x1: l2CX + FISH_OFF, y1: spY, x2: l2CX, y2: l2p.y + NH / 2, color: lc(1), type: 'line' });
      if (col.has(l2.id)) continue;
      for (const l3 of l2.children) {
        const l3p = pm[l3.id]; if (!l3p) continue;
        cs.push({ x1: l2p.x, y1: l2p.y + NH / 2, x2: l3p.x + lw(l3.level), y2: l3p.y + NH / 2, color: lc(2), type: 'line' });
        if (col.has(l3.id)) continue;
        for (const l4 of l3.children) {
          const l4p = pm[l4.id]; if (!l4p) continue;
          cs.push({ x1: l3p.x, y1: l3p.y + NH / 2, x2: l4p.x + lw(l4.level), y2: l4p.y + NH / 2, color: lc(3), type: 'line' });
        }
      }
    }
  } else {
    walkBez(root, false);
  }
  return cs;
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'right',    label: '逻辑结构' },
  { id: 'left',     label: '左逻辑结构' },
  { id: 'bidir',    label: '思维导图' },
  { id: 'dir',      label: '目录组织图' },
  { id: 'timeline', label: '时间轴' },
  { id: 'fishbone', label: '鱼骨图' },
];

function collapseFromLevel(root: MindNode, fromLevel: number): Set<string> {
  const ids = new Set<string>();
  const walk = (n: MindNode) => { if (n.children.length > 0 && n.level >= fromLevel) ids.add(n.id); for (const c of n.children) walk(c); };
  walk(root);
  return ids;
}

// ── Canvas Component ──────────────────────────────────────────────────────
function Canvas({ content, fullscreen, onClose, editable = true, onChange, variant = 'viewer', previewCollapseLevel = 0, onRequestEdit, inlineHeight }: { content: string; fullscreen: boolean; onClose?: () => void; editable?: boolean; onChange?: (content: string) => void; variant?: Variant; previewCollapseLevel?: number; onRequestEdit?: () => void; inlineHeight?: number }) {
  const isEditor = variant === 'editor';
  const showViewerSidebar = fullscreen && !isEditor;
  const [mode, setMode] = useState<Mode>('right');
  const [theme, setTheme] = useState<ThemeId>('ocean');
  const [sidebarTab, setSidebarTab] = useState<'topic' | 'map'>('topic');
  const [draftContent, setDraftContent] = useState(content || '');
  const [selectedId, setSelectedId] = useState('');
  const [editingLabel, setEditingLabel] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: PAD, y: PAD });
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const didDrag = useRef(false);
  const autoKey = useRef('');

  const activeContent = isEditor ? draftContent : (content || '');
  const root = useMemo(() => parseMD(activeContent), [activeContent]);
  const defaultCollapsed = useMemo(() => (!isEditor && previewCollapseLevel > 0 ? collapseFromLevel(root, previewCollapseLevel) : new Set<string>()), [isEditor, previewCollapseLevel, root]);
  const [collapsed, setCollapsed] = useState<Set<string>>(defaultCollapsed);
  const selectedNode = useMemo(() => findNode(root, selectedId), [root, selectedId]);
  const { list, cW, cH } = useMemo(() => doLayout(root, mode, collapsed), [root, mode, collapsed]);
  const conns = useMemo(() => buildConns(list, root, mode, collapsed), [list, root, mode, collapsed]);
  const cWRef = useRef(cW); const cHRef = useRef(cH);
  cWRef.current = cW; cHRef.current = cH;

  useEffect(() => {
    setDraftContent(content || '');
  }, [content]);

  useEffect(() => {
    if (!isEditor) setCollapsed(defaultCollapsed);
  }, [defaultCollapsed, isEditor]);

  useEffect(() => {
    if (!isEditor) return;
    const found = list.find(l => l.node.id === selectedId);
    if (found) {
      setEditingLabel(found.node.label);
      return;
    }
    if (root.id) {
      setSelectedId(root.id);
      setEditingLabel(root.label);
    }
  }, [isEditor, list, root.id, root.label, selectedId]);

  // Auto-fit when mode or fullscreen changes
  const fitKey = `${mode}_${Number(fullscreen)}`;
  useEffect(() => {
    if (fitKey === autoKey.current) return;
    autoKey.current = fitKey;
    requestAnimationFrame(() => {
      const el = containerRef.current; if (!el) return;
      const { clientWidth: cw, clientHeight: ch } = el;
      const tH = fullscreen ? ch - 52 : ch;
      const z = Math.max(0.1, Math.min(fullscreen ? 1.5 : 0.92,
        Math.min(cw / (cWRef.current + PAD), tH / (cHRef.current + PAD))));
      const px = Math.max(PAD / 2, (cw - cWRef.current * z) / 2);
      const py = Math.max(PAD / 2, (tH - cHRef.current * z) / 2);
      zoomRef.current = z; panRef.current = { x: px, y: py };
      setZoom(z); setPan({ x: px, y: py });
    });
  }, [fitKey, fullscreen]);

  // Non-passive wheel zoom towards cursor
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const fn = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 0.9;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const oldZ = zoomRef.current, newZ = Math.max(0.1, Math.min(5, oldZ * f));
      const sf = newZ / oldZ;
      const np = { x: cx - sf * (cx - panRef.current.x), y: cy - sf * (cy - panRef.current.y) };
      zoomRef.current = newZ; panRef.current = np;
      setZoom(newZ); setPan(np);
    };
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, []);

  const toggleCol = useCallback((id: string) => {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const applyTree = (changer: (tree: MindNode) => void) => {
    const next = cloneTree(root);
    changer(next);
    normalizeLevels(next);
    setDraftContent(toMarkdown(next));
    setCollapsed(new Set());
  };

  const saveDraft = () => {
    const next = draftContent.trim() ? draftContent : '# 根节点';
    setDraftContent(next);
    onChange?.(next);
  };

  const activeTheme = THEMES[theme];
  const nodeStyleFor = (level: number) => activeTheme.levels[level] ?? activeTheme.levels[5];
  const editorShellBg = '#ffffff';
  const editorTopBg = '#f8fafc';
  const editorBorder = '#e2e8f0';
  const editorText = '#0f172a';
  const editorSubText = '#64748b';
  const editorPanelBg = '#f8fafc';
  const editorButtonBg = '#ffffff';

  const changeZoom = (f: number) => {
    const nz = Math.max(0.1, Math.min(5, zoomRef.current * f));
    zoomRef.current = nz; setZoom(nz);
  };

  const resetView = () => {
    const el = containerRef.current; if (!el) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const tH = fullscreen ? ch - 52 : ch;
    const z = Math.max(0.1, Math.min(fullscreen ? 1.5 : 0.92, Math.min(cw / (cW + PAD), tH / (cH + PAD))));
    const px = Math.max(PAD / 2, (cw - cW * z) / 2);
    const py = Math.max(PAD / 2, (tH - cH * z) / 2);
    zoomRef.current = z; panRef.current = { x: px, y: py };
    setZoom(z); setPan({ x: px, y: py });
  };

  const onMD = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
    didDrag.current = false;
  };
  const onMM = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    const np = { x: dragRef.current.px + dx, y: dragRef.current.py + dy };
    panRef.current = np; setPan(np);
  };
  const onMU = () => { dragRef.current = null; };

  const containerStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 9999, background: activeTheme.bg, display: 'flex', flexDirection: 'column' }
    : isEditor
      ? { width: '100%', height: '100%', position: 'relative', background: editorShellBg, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: `1px solid ${editorBorder}` }
      : { width: '100%', height: inlineHeight ?? 230, position: 'relative', background: '#fafbfc', borderRadius: 8, overflow: 'hidden' };

  return (
    <div style={containerStyle}>
      {(fullscreen || isEditor) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${isEditor ? editorBorder : activeTheme.border}`, flexShrink: 0, userSelect: 'none', background: isEditor ? editorTopBg : activeTheme.panel }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isEditor ? '#2563eb' : '#60a5fa'} strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/>
            <line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/>
          </svg>
          <span style={{ color: isEditor ? editorText : '#e2e8f0', fontWeight: 600, fontSize: 13, marginRight: 6 }}>{isEditor ? '思维导图编辑器' : '思维导图'}</span>
          {isEditor ? (
            <>
              <button onClick={() => {
                if (!selectedId) return;
                applyTree(tree => {
                  const cur = findNode(tree, selectedId);
                  if (!cur) return;
                  cur.children.push({ id: `x_${Date.now()}`, label: '新子节点', level: Math.min(cur.level + 1, 5), children: [] });
                });
              }} style={editorTopButtonStyle}>子主题</button>
              <button onClick={() => {
                if (!selectedId) return;
                applyTree(tree => {
                  const info = findParentInfo(tree, selectedId);
                  if (!info) return;
                  const lv = info.parent.children[info.index]?.level ?? Math.min(info.parent.level + 1, 5);
                  info.parent.children.splice(info.index + 1, 0, { id: `x_${Date.now()}`, label: '新同级节点', level: lv, children: [] });
                });
              }} style={editorTopButtonStyle}>同级主题</button>
              <button onClick={() => {
                if (!selectedId || selectedId === root.id) return;
                applyTree(tree => {
                  const info = findParentInfo(tree, selectedId);
                  if (info) info.parent.children.splice(info.index, 1);
                });
                setSelectedId(root.id);
              }} style={{ ...editorTopButtonStyle, color: '#b91c1c' }}>删除</button>
            </>
          ) : (
            <>
              {MODES.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)} style={{
                  padding: '3px 10px', borderRadius: 5, fontSize: 12, border: 'none',
                  background: mode === m.id ? activeTheme.line : 'rgba(255,255,255,0.1)',
                  color: mode === m.id ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer',
                }}>{m.label}</button>
              ))}
              <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)', margin: '0 4px', flexShrink: 0 }} />
              {[
                { label: '全展', title: '展开全部', action: () => setCollapsed(new Set()) },
                { label: '展2', title: '展开至第2级', action: () => setCollapsed(collapseFromLevel(root, 2)) },
                { label: '展3', title: '展开至第3级', action: () => setCollapsed(collapseFromLevel(root, 3)) },
                { label: '展4', title: '展开至第4级', action: () => setCollapsed(collapseFromLevel(root, 4)) },
                { label: '折全', title: '折叠全部', action: () => setCollapsed(collapseFromLevel(root, 1)) },
              ].map(btn => (
                <button key={btn.label} onClick={btn.action} title={btn.title} style={{
                  padding: '3px 8px', borderRadius: 5, fontSize: 11, border: 'none',
                  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                }}>{btn.label}</button>
              ))}
            </>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ color: isEditor ? editorSubText : activeTheme.hint, fontSize: 11 }}>{isEditor ? '节点编辑放在右侧面板，结构和样式也在右侧切换' : '滚轮缩放 · 拖拽平移 · 点击节点折叠'}</span>
          <button onClick={() => changeZoom(1.2)} style={isEditor ? editorIconButtonStyle : btnStyle}>＋</button>
          <span style={{ color: isEditor ? editorSubText : 'rgba(255,255,255,0.45)', fontSize: 11, minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => changeZoom(1 / 1.2)} style={isEditor ? editorIconButtonStyle : btnStyle}>－</button>
          <button onClick={resetView} style={isEditor ? { ...editorTopButtonStyle, fontSize: 11 } : { ...btnStyle, fontSize: 11 }}>适应</button>
          {!isEditor && fullscreen && onRequestEdit && <button onClick={onRequestEdit} style={{ ...btnStyle, background: 'rgba(34,197,94,0.7)', fontSize: 12 }}>画布编辑</button>}
          {isEditor && editable && <button onClick={saveDraft} style={editorSaveButtonStyle}>保存</button>}
          {fullscreen && <button onClick={onClose} style={{ ...btnStyle, background: 'rgba(239,68,68,0.6)', marginLeft: 4 }}>✕ 关闭</button>}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      {/* Canvas area */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: 'grab', background: isEditor ? '#ffffff' : showViewerSidebar ? 'radial-gradient(circle at top, rgba(255,255,255,0.07), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))' : undefined }}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
        <div style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', width: cW, height: cH }}>
          <svg style={{ position: 'absolute', top: 0, left: 0, width: cW, height: cH, pointerEvents: 'none' }}>
            {/* Timeline spine */}
            {mode === 'timeline' && (() => {
              const l2s = list.filter(l => l.node.level === 2);
              if (!l2s.length) return null;
              const spY = list[0].y + NH / 2;
              const x1 = list[0].x + lw(list[0].node.level);
              const x2 = l2s[l2s.length - 1].x + lw(l2s[l2s.length - 1].node.level);
              return <line x1={x1} y1={spY} x2={x2} y2={spY} stroke={activeTheme.line} strokeWidth={2.5} opacity={0.35} />;
            })()}
            {/* Fishbone spine */}
            {mode === 'fishbone' && (() => {
              const rl = list.find(l => l.node.id === root.id);
              const l2s = list.filter(l => l.node.level === 2);
              if (!rl || !l2s.length) return null;
              const spY = rl.y + NH / 2;
              const x1 = Math.min(...l2s.map(l => l.x));
              return <line x1={x1} y1={spY} x2={rl.x} y2={spY} stroke={activeTheme.line} strokeWidth={3} opacity={0.45} />;
            })()}
            {conns.map((c, i) => {
              if (mode === 'dir' || c.type === 'line') return <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.color} strokeWidth={1.5} />;
              const mx = (c.x1 + c.x2) / 2;
              return <path key={i} d={`M ${c.x1},${c.y1} C ${mx},${c.y1} ${mx},${c.y2} ${c.x2},${c.y2}`} fill="none" stroke={c.color} strokeWidth={1.5} />;
            })}
          </svg>
          {list.map(({ node, x, y }) => {
            const s = nodeStyleFor(node.level);
            const w = mode === 'dir' ? undefined : lw(node.level);
            const h = mode === 'dir' ? 28 : NH;
            const hasCh = node.children.length > 0, isCo = collapsed.has(node.id);
            const isSelected = isEditor && selectedId === node.id;
            return (
              <div key={node.id} title={node.label}
                onClick={e => {
                  if (didDrag.current) return;
                  e.stopPropagation();
                  if (isEditor) {
                    setSelectedId(node.id);
                    setEditingLabel(node.label);
                    return;
                  }
                  if (hasCh) toggleCol(node.id);
                }}
                style={{
                  position: 'absolute', left: x, top: y, width: w, height: h,
                  background: s.bg, color: s.fg, border: `1.5px solid ${s.bdr}`, borderRadius: s.r,
                  display: 'flex', alignItems: 'center', paddingLeft: 8, paddingRight: hasCh ? 3 : 8,
                  fontSize: node.level === 1 ? 13 : 12, fontWeight: s.fw,
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  boxShadow: node.level <= 2 ? '0 2px 6px rgba(37,99,235,0.15)' : 'none',
                  userSelect: 'none', boxSizing: 'border-box',
                  cursor: isEditor ? 'pointer' : (hasCh ? 'pointer' : 'default'),
                  minWidth: mode === 'dir' ? 100 : undefined,
                  maxWidth: mode === 'dir' ? 600 : undefined,
                  outline: isSelected ? '2px solid #f59e0b' : 'none',
                  outlineOffset: isSelected ? 1 : 0,
                }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.label}</span>
                {hasCh && (
                  <span style={{
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: '50%', fontSize: 9, marginLeft: 2,
                    background: isCo ? (node.level <= 2 ? 'rgba(255,255,255,0.25)' : '#bfdbfe') : 'transparent',
                    color: isCo ? (node.level <= 2 ? '#fff' : '#1e40af') : (node.level <= 2 ? 'rgba(255,255,255,0.4)' : '#93c5fd'),
                    border: isCo ? 'none' : `1px solid ${node.level <= 2 ? 'rgba(255,255,255,0.25)' : '#c7d2fe'}`,
                  }}>
                    {isCo ? node.children.length : '−'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {isEditor && editable && (
        <div style={{ width: 320, flexShrink: 0, background: editorPanelBg, borderLeft: `1px solid ${editorBorder}`, display: 'flex', flexDirection: 'column', color: editorText }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${editorBorder}`, display: 'flex', gap: 8 }}>
            {[
              { id: 'topic', label: '主题' },
              { id: 'map', label: '画布' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setSidebarTab(tab.id as 'topic' | 'map')} style={{
                padding: '6px 12px', borderRadius: 8, border: `1px solid ${sidebarTab === tab.id ? '#bfdbfe' : editorBorder}`,
                background: sidebarTab === tab.id ? '#eff6ff' : '#fff', color: sidebarTab === tab.id ? '#1d4ed8' : '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>{tab.label}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sidebarTab === 'topic' ? (
              <>
                <div style={editorPanelSectionStyle}>
                  <div style={editorSectionTitleStyle}>当前节点</div>
                  <textarea value={editingLabel} onChange={e => setEditingLabel(e.target.value)} placeholder="输入节点名称" style={editorInputStyle} rows={3} />
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, color: editorSubText }}>
                    <span>层级 L{selectedNode?.level ?? 1}</span>
                    <span>子节点 {selectedNode?.children.length ?? 0}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => {
                      const text = editingLabel.trim();
                      if (!text || !selectedId) return;
                      applyTree(tree => {
                        const cur = findNode(tree, selectedId);
                        if (cur) cur.label = text;
                      });
                    }} style={editorPanelButtonStyle}>应用名称</button>
                    <button onClick={() => selectedNode && toggleCol(selectedNode.id)} style={editorPanelButtonStyle}>{selectedNode && collapsed.has(selectedNode.id) ? '展开节点' : '折叠节点'}</button>
                  </div>
                </div>

                <div style={editorPanelSectionStyle}>
                  <div style={editorSectionTitleStyle}>插入与结构</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => {
                      if (!selectedId) return;
                      applyTree(tree => {
                        const cur = findNode(tree, selectedId);
                        if (!cur) return;
                        cur.children.push({ id: `x_${Date.now()}`, label: '新子节点', level: Math.min(cur.level + 1, 5), children: [] });
                      });
                    }} style={editorPanelButtonStyle}>添加子节点</button>
                    <button onClick={() => {
                      if (!selectedId) return;
                      applyTree(tree => {
                        const info = findParentInfo(tree, selectedId);
                        if (!info) return;
                        const lv = info.parent.children[info.index]?.level ?? Math.min(info.parent.level + 1, 5);
                        info.parent.children.splice(info.index + 1, 0, { id: `x_${Date.now()}`, label: '新同级节点', level: lv, children: [] });
                      });
                    }} style={editorPanelButtonStyle}>添加同级</button>
                    <button onClick={() => {
                      if (!selectedId || selectedId === root.id) return;
                      applyTree(tree => moveSibling(tree, selectedId, -1));
                    }} style={editorPanelButtonStyle}>上移</button>
                    <button onClick={() => {
                      if (!selectedId || selectedId === root.id) return;
                      applyTree(tree => moveSibling(tree, selectedId, 1));
                    }} style={editorPanelButtonStyle}>下移</button>
                    <button onClick={() => {
                      if (!selectedId || selectedId === root.id) return;
                      applyTree(tree => outdentNode(tree, selectedId));
                    }} style={editorPanelButtonStyle}>提升一级</button>
                    <button onClick={() => {
                      if (!selectedId || selectedId === root.id) return;
                      applyTree(tree => indentNode(tree, selectedId));
                    }} style={editorPanelButtonStyle}>降为子级</button>
                  </div>
                  <button onClick={() => {
                    if (!selectedId || selectedId === root.id) return;
                    applyTree(tree => {
                      const info = findParentInfo(tree, selectedId);
                      if (info) info.parent.children.splice(info.index, 1);
                    });
                    setSelectedId(root.id);
                  }} style={{ ...editorDangerButtonStyle, marginTop: 8 }}>删除当前节点</button>
                </div>

                <div style={editorPanelSectionStyle}>
                  <div style={editorSectionTitleStyle}>Markdown 源码</div>
                  <textarea value={draftContent} onChange={e => setDraftContent(e.target.value)} rows={8} style={{ ...editorInputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }} />
                </div>
              </>
            ) : (
              <>
                <div style={editorPanelSectionStyle}>
                  <div style={editorSectionTitleStyle}>结构</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {MODES.map(m => (
                      <button key={m.id} onClick={() => setMode(m.id)} style={{ ...editorPanelButtonStyle, background: mode === m.id ? '#eff6ff' : editorButtonBg, color: mode === m.id ? '#1d4ed8' : '#475569', borderColor: mode === m.id ? '#bfdbfe' : editorBorder }}>{m.label}</button>
                    ))}
                  </div>
                </div>

                <div style={editorPanelSectionStyle}>
                  <div style={editorSectionTitleStyle}>主题色</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {([{ id: 'ocean', label: '蓝调' }, { id: 'mint', label: '青绿' }, { id: 'sunset', label: '橙调' }] as { id: ThemeId; label: string }[]).map(item => (
                      <button key={item.id} onClick={() => setTheme(item.id)} style={{ ...editorPanelButtonStyle, background: theme === item.id ? '#eff6ff' : editorButtonBg, color: theme === item.id ? '#1d4ed8' : '#475569', borderColor: theme === item.id ? '#bfdbfe' : editorBorder }}>{item.label}</button>
                    ))}
                  </div>
                </div>

                <div style={editorPanelSectionStyle}>
                  <div style={editorSectionTitleStyle}>展开层级</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: '全部展开', action: () => setCollapsed(new Set()) },
                      { label: '折叠全部', action: () => setCollapsed(collapseFromLevel(root, 1)) },
                      { label: '展开至 L2', action: () => setCollapsed(collapseFromLevel(root, 2)) },
                      { label: '展开至 L3', action: () => setCollapsed(collapseFromLevel(root, 3)) },
                      { label: '展开至 L4', action: () => setCollapsed(collapseFromLevel(root, 4)) },
                    ].map(item => (
                      <button key={item.label} onClick={item.action} style={editorPanelButtonStyle}>{item.label}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {showViewerSidebar && (
        <div style={{ width: 296, flexShrink: 0, background: 'rgba(15,23,42,0.78)', borderLeft: `1px solid ${activeTheme.border}`, display: 'flex', flexDirection: 'column', color: '#e2e8f0', backdropFilter: 'blur(18px)' }}>
          <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid ${activeTheme.border}` }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>预览工作台</div>
            <div style={{ fontSize: 12, color: 'rgba(226,232,240,0.62)', marginTop: 4 }}>更适合查阅结构、切换布局和控制展开层级，需要修改内容时可直接进入画布编辑。</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={viewerPanelSectionStyle}>
              <div style={viewerSectionTitleStyle}>导图概览</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>{root.label}</div>
              <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'rgba(226,232,240,0.7)', marginTop: 8 }}>
                <span>一级主题 {root.children.length}</span>
                <span>当前布局 {MODES.find(item => item.id === mode)?.label}</span>
              </div>
              {onRequestEdit && <button onClick={onRequestEdit} style={viewerPrimaryButtonStyle}>进入画布编辑</button>}
            </div>

            <div style={viewerPanelSectionStyle}>
              <div style={viewerSectionTitleStyle}>布局</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {MODES.map(item => (
                  <button key={item.id} onClick={() => setMode(item.id)} style={{ ...viewerPanelButtonStyle, background: mode === item.id ? 'rgba(59,130,246,0.26)' : 'rgba(255,255,255,0.05)', borderColor: mode === item.id ? 'rgba(96,165,250,0.9)' : 'rgba(255,255,255,0.08)', color: mode === item.id ? '#fff' : 'rgba(226,232,240,0.75)' }}>{item.label}</button>
                ))}
              </div>
            </div>

            <div style={viewerPanelSectionStyle}>
              <div style={viewerSectionTitleStyle}>主题色</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {([{ id: 'ocean', label: '蓝调' }, { id: 'mint', label: '青绿' }, { id: 'sunset', label: '橙调' }] as { id: ThemeId; label: string }[]).map(item => (
                  <button key={item.id} onClick={() => setTheme(item.id)} style={{ ...viewerPanelButtonStyle, background: theme === item.id ? 'rgba(59,130,246,0.26)' : 'rgba(255,255,255,0.05)', borderColor: theme === item.id ? 'rgba(96,165,250,0.9)' : 'rgba(255,255,255,0.08)', color: theme === item.id ? '#fff' : 'rgba(226,232,240,0.75)' }}>{item.label}</button>
                ))}
              </div>
            </div>

            <div style={viewerPanelSectionStyle}>
              <div style={viewerSectionTitleStyle}>展开层级</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: '全部展开', action: () => setCollapsed(new Set()) },
                  { label: '折叠全部', action: () => setCollapsed(collapseFromLevel(root, 1)) },
                  { label: '展开到 L2', action: () => setCollapsed(collapseFromLevel(root, 2)) },
                  { label: '展开到 L3', action: () => setCollapsed(collapseFromLevel(root, 3)) },
                  { label: '展开到 L4', action: () => setCollapsed(collapseFromLevel(root, 4)) },
                ].map(item => (
                  <button key={item.label} onClick={item.action} style={viewerPanelButtonStyle}>{item.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      {/* Inline hint */}
      {!fullscreen && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, background: 'linear-gradient(to top,rgba(250,251,252,0.96),transparent)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4, pointerEvents: 'none' }}>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>滚轮缩放 · 拖拽平移 · 点击蓝色节点折叠</span>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 5, border: 'none',
  background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1,
};

const editorTopButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
};

const editorIconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 30,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
};

const editorSaveButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  border: 'none',
  background: '#22c55e',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
};

const editorPanelSectionStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  borderRadius: 10,
  padding: 12,
};

const editorSectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 10,
  color: '#0f172a',
};

const editorInputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: '#ffffff',
  color: '#0f172a',
  padding: '8px 10px',
  fontSize: 12,
  boxSizing: 'border-box',
  resize: 'vertical',
};

const editorPanelButtonStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  color: '#475569',
  cursor: 'pointer',
  fontSize: 12,
};

const editorDangerButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#b91c1c',
  cursor: 'pointer',
  fontSize: 12,
};

const viewerPanelSectionStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 12,
  padding: 12,
};

const viewerSectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 10,
  color: 'rgba(226,232,240,0.8)',
};

const viewerPanelButtonStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(226,232,240,0.75)',
  cursor: 'pointer',
  fontSize: 12,
};

const viewerPrimaryButtonStyle: React.CSSProperties = {
  marginTop: 12,
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
};

// ── Exported Component ────────────────────────────────────────────────────
export default function MindMapView({ content, previewCollapseLevel = 0, onRequestEdit, inlineHeight }: MindMapViewProps) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <div style={{ position: 'relative', width: '100%' }}>
        <Canvas content={content} fullscreen={false} editable={false} variant="viewer" previewCollapseLevel={previewCollapseLevel} inlineHeight={inlineHeight} />
        <button onClick={() => setFullscreen(true)} style={{
          position: 'absolute', top: 8, right: 8,
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 6, fontSize: 11,
          border: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.92)',
          color: '#374151', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
          全屏
        </button>
      </div>
      {fullscreen && <Canvas content={content} fullscreen={true} editable={false} variant="viewer" onRequestEdit={onRequestEdit} onClose={() => setFullscreen(false)} />}
    </>
  );
}

export function MindMapEditor({ content, editable = true, onChange }: MindMapViewProps) {
  const [internalContent, setInternalContent] = useState(content || '');

  useEffect(() => {
    setInternalContent(content || '');
  }, [content]);

  const handleChange = (next: string) => {
    setInternalContent(next);
    onChange?.(next);
  };

  return <Canvas content={internalContent} fullscreen={false} editable={editable} onChange={handleChange} variant="editor" />;
}
