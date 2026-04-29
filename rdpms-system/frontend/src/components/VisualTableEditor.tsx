/**
 * VisualTableEditor — 可视化表格编辑器
 * 支持在"可视化表格"和"Markdown 源码"两种模式之间切换
 * 对外通过 value/onChange 双向绑定 Markdown 字符串
 */
import React, { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';

interface VisualTableEditorProps {
  /** Markdown 文本内容（整篇文档，不只是表格） */
  value: string;
  onChange: (v: string) => void;
  /** 是否只渲染表格编辑器（不显示正文 textarea） */
  tableOnly?: boolean;
  /** 要编辑的表格序号（从 0 开始） */
  tableIndex?: number;
}

export interface VisualTableEditorRef {
  /** 返回当前编辑状态的完整 Markdown（把可视化网格写回文档） */
  getMarkdown: () => string;
}

// ── 数据结构 ───────────────────────────────────────
interface GridTable {
  /** 列头 */
  headers: string[];
  /** 数据行 */
  rows: string[][];
}

interface MergeRegion {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

interface CellSelection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

const MERGE_META_PREFIX = '<!-- VTABLE_MERGE ';

function normalizeMergeRegions(regions: MergeRegion[], rowCount: number, colCount: number): MergeRegion[] {
  return regions
    .map((r) => ({
      row: Math.max(0, Math.min(rowCount - 1, Number(r.row) || 0)),
      col: Math.max(0, Math.min(colCount - 1, Number(r.col) || 0)),
      rowspan: Math.max(1, Number(r.rowspan) || 1),
      colspan: Math.max(1, Number(r.colspan) || 1),
    }))
    .map((r) => ({
      ...r,
      rowspan: Math.min(r.rowspan, rowCount - r.row),
      colspan: Math.min(r.colspan, colCount - r.col),
    }))
    .filter((r) => r.rowspan * r.colspan > 1);
}

function normalizeSelection(sel: CellSelection): CellSelection {
  return {
    startRow: Math.min(sel.startRow, sel.endRow),
    endRow: Math.max(sel.startRow, sel.endRow),
    startCol: Math.min(sel.startCol, sel.endCol),
    endCol: Math.max(sel.startCol, sel.endCol),
  };
}

function intersectsRegion(sel: CellSelection, region: MergeRegion): boolean {
  const a = normalizeSelection(sel);
  const regionBottom = region.row + region.rowspan - 1;
  const regionRight = region.col + region.colspan - 1;
  return !(a.endRow < region.row || a.startRow > regionBottom || a.endCol < region.col || a.startCol > regionRight);
}

function findRegionContainingCell(regions: MergeRegion[], row: number, col: number): MergeRegion | null {
  for (const region of regions) {
    if (
      row >= region.row &&
      row < region.row + region.rowspan &&
      col >= region.col &&
      col < region.col + region.colspan
    ) {
      return region;
    }
  }
  return null;
}

function parseMergeMeta(before: string) {
  const lines = before.split('\n');
  const kept: string[] = [];
  let regions: MergeRegion[] = [];
  const metaRe = /^\s*<!--\s*VTABLE_MERGE\s+(\{.*\})\s*-->\s*$/;

  for (const line of lines) {
    const m = line.match(metaRe);
    if (!m) {
      kept.push(line);
      continue;
    }
    try {
      const obj = JSON.parse(m[1]);
      if (Array.isArray(obj?.regions)) {
        regions = obj.regions;
      }
    } catch {
      // ignore malformed metadata and keep parsing table normally
    }
  }

  return {
    cleanBefore: kept.join('\n'),
    regions,
  };
}

function stringifyMergeMeta(regions: MergeRegion[]): string {
  if (!regions.length) return '';
  return `${MERGE_META_PREFIX}${JSON.stringify({ regions })} -->\n`;
}

// ── Markdown ↔ Grid 互转 ────────────────────────────

/** 解析指定序号的 Markdown 表格，返回 { headers, rows, before, after } */
function parseTableAtIndex(md: string, tableIndex = 0) {
  const lines = md.split('\n');
  const tableRanges: Array<{ start: number; headerStart: number; end: number }> = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i].trim();
    const next = lines[i + 1].trim();
    if (!current.startsWith('|') || !/^\|[\s\-:|]+\|/.test(next)) continue;

    const headerStart = i;
    let start = i;
    if (i > 0 && /^\s*<!--\s*VTABLE_MERGE\s+(\{.*\})\s*-->\s*$/.test(lines[i - 1])) {
      start = i - 1;
    }

    let end = i + 2;
    while (end < lines.length && lines[end].trim().startsWith('|')) end += 1;

    tableRanges.push({ start, headerStart, end });
    i = end - 1;
  }

  const target = tableRanges[tableIndex];
  if (!target) return null;

  const { start: tableStart, headerStart, end: tableEnd } = target;

  const tableLines = lines.slice(headerStart, tableEnd).filter(l => l.trim().startsWith('|'));
  const parseRow = (line: string) =>
    line.split('|').slice(1, -1).map(c => c.trim());
  const isSep = (line: string) => /^\|[\s\-:|]+\|/.test(line.trim());

  const headers = parseRow(tableLines[0] || '');
  const rows = tableLines.slice(2).filter(l => !isSep(l)).map(parseRow);
  // normalise row widths
  const normalized = rows.map(r => {
    const out = [...r];
    while (out.length < headers.length) out.push('');
    return out;
  });
  const beforeRaw = lines.slice(0, tableStart).join('\n');
  const mergeMetaRaw = lines.slice(tableStart, headerStart).join('\n');
  const { cleanBefore: cleanedPrefix, regions } = parseMergeMeta(mergeMetaRaw);
  const cleanBefore = [beforeRaw, cleanedPrefix].filter(Boolean).join('\n');
  const mergeRegions = normalizeMergeRegions(regions, normalized.length, headers.length);

  return {
    headers,
    rows: normalized,
    mergeRegions,
    before: cleanBefore,
    after: lines.slice(tableEnd).join('\n'),
  };
}

function gridToMarkdown(g: GridTable, mergeRegions: MergeRegion[] = []): string {
  const colWidths = g.headers.map((h, ci) =>
    Math.max(h.length, ...g.rows.map(r => (r[ci] || '').length), 3)
  );
  const pad = (s: string, w: number) => s.padEnd(w);
  const headerRow = '| ' + g.headers.map((h, i) => pad(h, colWidths[i])).join(' | ') + ' |';
  const sepRow   = '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |';
  const dataRows  = g.rows.map(
    r => '| ' + g.headers.map((_, i) => pad(r[i] || '', colWidths[i])).join(' | ') + ' |'
  );
  const tableMd = [headerRow, sepRow, ...dataRows].join('\n');
  const meta = stringifyMergeMeta(mergeRegions);
  return meta ? `${meta}${tableMd}` : tableMd;
}

// ── 主组件 ─────────────────────────────────────────
const VisualTableEditor = forwardRef<VisualTableEditorRef, VisualTableEditorProps>(
  ({ value, onChange, tableOnly, tableIndex = 0 }, ref) => {
  const [mode, setMode] = useState<'visual' | 'markdown'>(tableOnly ? 'visual' : 'markdown');
  const [grid, setGrid] = useState<GridTable>({ headers: ['列1', '列2', '列3'], rows: [['', '', '']] });
  const [mergeRegions, setMergeRegions] = useState<MergeRegion[]>([]);
  const [selection, setSelection] = useState<CellSelection | null>(null);
  // 标记当前是否处于新建（追加）模式，而非编辑文档中已有的第一个表格
  const [isNewTable, setIsNewTable] = useState(false);

  // 暴露给父组件的 getMarkdown 方法
  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      const tableMd = gridToMarkdown(grid, mergeRegions);
      if (isNewTable) {
        // 追加到文档末尾
        return value ? value + '\n\n' + tableMd : tableMd;
      }
      const parsed = parseTableAtIndex(value, tableIndex);
      if (parsed) {
        return [parsed.before, tableMd, parsed.after].filter(s => s !== '').join('\n');
      }
      // 文档中没有表格则追加
      return value ? value + '\n\n' + tableMd : tableMd;
    },
  }), [grid, mergeRegions, value, isNewTable, tableIndex]);

  // 当切换到 visual 模式时，从 markdown 解析表格
  const switchToVisual = useCallback(() => {
    const parsed = parseTableAtIndex(value, tableIndex);
    if (parsed && parsed.headers.length > 0) {
      setGrid({ headers: parsed.headers, rows: parsed.rows.length ? parsed.rows : [parsed.headers.map(() => '')] });
      setMergeRegions(parsed.mergeRegions || []);
    } else {
      setGrid({ headers: ['列1', '列2', '列3'], rows: [['', '', '']] });
      setMergeRegions([]);
    }
    setSelection(null);
    setMode('visual');
  }, [value, tableIndex]);

  useEffect(() => {
    if (tableOnly && mode === 'visual') switchToVisual();
  }, [mode, switchToVisual, tableOnly]);

  // 当切换回 markdown 时，把 grid 合并回 value
  const switchToMarkdown = useCallback(() => {
    const parsed = parseTableAtIndex(value, tableIndex);
    const tableMd = gridToMarkdown(grid, mergeRegions);
    if (parsed) {
      const newMd = [parsed.before, tableMd, parsed.after].filter(s => s !== '').join('\n');
      onChange(newMd);
    } else {
      onChange(value ? value + '\n' + tableMd : tableMd);
    }
    setMode('markdown');
  }, [grid, mergeRegions, value, onChange, tableIndex]);

  // 网格操作
  const updateCell = (ri: number, ci: number, v: string) => {
    setGrid(g => {
      const rows = g.rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? v : c) : r);
      return { ...g, rows };
    });
  };
  const updateHeader = (ci: number, v: string) => {
    setGrid(g => ({ ...g, headers: g.headers.map((h, i) => i === ci ? v : h) }));
  };
  const addRow = () => setGrid(g => ({ ...g, rows: [...g.rows, g.headers.map(() => '')] }));
  const removeRow = (ri: number) => {
    setGrid(g => ({ ...g, rows: g.rows.filter((_, i) => i !== ri) }));
    setMergeRegions((regions) =>
      regions
        .map((r) => {
          if (ri < r.row) return { ...r, row: r.row - 1 };
          if (ri >= r.row + r.rowspan) return r;
          if (r.rowspan === 1) return null;
          if (ri === r.row) return { ...r, rowspan: r.rowspan - 1 };
          return { ...r, rowspan: r.rowspan - 1 };
        })
        .filter((r): r is MergeRegion => Boolean(r))
        .filter((r) => r.rowspan * r.colspan > 1)
    );
    setSelection(null);
  };
  const addCol = () => setGrid(g => ({
    headers: [...g.headers, `列${g.headers.length + 1}`],
    rows: g.rows.map(r => [...r, '']),
  }));
  const removeCol = (ci: number) => {
    setGrid(g => ({
      headers: g.headers.filter((_, i) => i !== ci),
      rows: g.rows.map(r => r.filter((_, i) => i !== ci)),
    }));
    setMergeRegions((regions) =>
      regions
        .map((r) => {
          if (ci < r.col) return { ...r, col: r.col - 1 };
          if (ci >= r.col + r.colspan) return r;
          if (r.colspan === 1) return null;
          if (ci === r.col) return { ...r, colspan: r.colspan - 1 };
          return { ...r, colspan: r.colspan - 1 };
        })
        .filter((r): r is MergeRegion => Boolean(r))
        .filter((r) => r.rowspan * r.colspan > 1)
    );
    setSelection(null);
  };

  const mergeSelection = () => {
    if (!selection) {
      alert('请先选择要合并的单元格区域');
      return;
    }
    const rect = normalizeSelection(selection);
    const rowspan = rect.endRow - rect.startRow + 1;
    const colspan = rect.endCol - rect.startCol + 1;
    if (rowspan * colspan <= 1) {
      alert('请至少选择 2 个单元格进行合并');
      return;
    }
    const hasConflict = mergeRegions.some((r) => intersectsRegion(rect, r));
    if (hasConflict) {
      alert('选区内包含已合并区域，请先取消合并后再操作');
      return;
    }

    setGrid((g) => {
      const rows = g.rows.map((row, ri) =>
        row.map((cell, ci) => {
          if (ri === rect.startRow && ci === rect.startCol) return cell;
          if (ri >= rect.startRow && ri <= rect.endRow && ci >= rect.startCol && ci <= rect.endCol) return '';
          return cell;
        })
      );
      return { ...g, rows };
    });

    setMergeRegions((prev) => [
      ...prev,
      { row: rect.startRow, col: rect.startCol, rowspan, colspan },
    ]);
    setSelection({
      startRow: rect.startRow,
      startCol: rect.startCol,
      endRow: rect.startRow,
      endCol: rect.startCol,
    });
  };

  const unmergeSelection = () => {
    if (!selection) {
      alert('请先选中一个已合并的单元格');
      return;
    }
    const target = findRegionContainingCell(mergeRegions, selection.startRow, selection.startCol);
    if (!target) {
      alert('当前选中的单元格不在合并区域内');
      return;
    }
    setMergeRegions((prev) => prev.filter((r) => !(r.row === target.row && r.col === target.col && r.rowspan === target.rowspan && r.colspan === target.colspan)));
    setSelection({
      startRow: target.row,
      startCol: target.col,
      endRow: target.row,
      endCol: target.col,
    });
  };

  // 插入新空表格（visual 模式下）
  const insertNewTable = () => {
    const newGrid = { headers: ['列1', '列2', '列3'], rows: [['', '', ''], ['', '', '']] };
    setGrid(newGrid);
    setMergeRegions([]);
    setSelection(null);
    if (tableOnly) {
      // tableOnly 模式：标记为"新建"，写入时将追加到文档末尾
      setIsNewTable(true);
    } else if (mode === 'markdown') {
      const tableMd = gridToMarkdown(newGrid, []);
      onChange(value ? value + '\n\n' + tableMd : tableMd);
    }
  };

  const cellStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0',
    padding: '5px 8px',
    minWidth: 80,
    background: '#fff',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── 工具栏 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        {/* 模式切换（tableOnly 时隐藏，专注于可视化编辑） */}
        {!tableOnly && (
        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => { if (mode !== 'visual') switchToVisual(); }}
            style={{
              padding: '4px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
              background: mode === 'visual' ? '#3b82f6' : '#f8fafc',
              color: mode === 'visual' ? '#fff' : '#475569',
              fontWeight: mode === 'visual' ? 600 : 400,
            }}
          >
            📊 可视化表格
          </button>
          <button
            type="button"
            onClick={() => { if (mode !== 'markdown') switchToMarkdown(); }}
            style={{
              padding: '4px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
              background: mode === 'markdown' ? '#3b82f6' : '#f8fafc',
              color: mode === 'markdown' ? '#fff' : '#475569',
              fontWeight: mode === 'markdown' ? 600 : 400,
              borderLeft: '1px solid #e2e8f0',
            }}
          >
            📝 Markdown
          </button>
        </div>
        )}

        {mode === 'visual' && (
          <>
            <button type="button" onClick={addRow} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#374151' }}>
              ＋ 添加行
            </button>
            <button type="button" onClick={addCol} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#374151' }}>
              ＋ 添加列
            </button>
            <button type="button" onClick={mergeSelection} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontSize: 12, color: '#1d4ed8' }}>
              合并选区
            </button>
            <button type="button" onClick={unmergeSelection} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#ffffff', cursor: 'pointer', fontSize: 12, color: '#374151' }}>
              取消合并
            </button>
            <button type="button" onClick={insertNewTable} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fde68a', background: '#fffbeb', cursor: 'pointer', fontSize: 12, color: '#92400e' }}>
              {tableOnly ? '新增另一个表格' : '重置表格'}
            </button>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              单击选中，按住 Shift 再点另一个单元格可框选矩形
            </span>
          </>
        )}

        {mode === 'markdown' && (
          <span style={{ fontSize: 11, color: '#9ca3af', alignSelf: 'center' }}>
            支持 Markdown 语法：# 标题 ｜ 表格 |---| 内容 ｜ 普通文本
          </span>
        )}
      </div>

      {/* ── Markdown 模式 ── */}
      {mode === 'markdown' && !tableOnly && (
        <textarea
          style={{
            width: '100%', minHeight: 160, padding: '10px 12px',
            border: '1px solid #e2e8f0', borderRadius: 8,
            fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6,
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
          placeholder="输入文档正文内容，可使用 Markdown 语法..."
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}

      {/* ── 可视化表格模式 ── */}
      {mode === 'visual' && (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {grid.headers.map((h, ci) => (
                  <th key={ci} style={{ border: '1px solid #e2e8f0', padding: 0, position: 'relative' }}>
                    <input
                      value={h}
                      onChange={e => updateHeader(ci, e.target.value)}
                      style={{ ...cellStyle, background: '#f1f5f9', fontWeight: 600, color: '#1e40af' }}
                      placeholder={`列${ci + 1}`}
                    />
                    {grid.headers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCol(ci)}
                        title="删除此列"
                        style={{
                          position: 'absolute', top: 2, right: 2,
                          width: 14, height: 14, borderRadius: '50%',
                          background: '#fee2e2', color: '#ef4444',
                          border: 'none', cursor: 'pointer', fontSize: 10, lineHeight: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >×</button>
                    )}
                  </th>
                ))}
                <th style={{ width: 32, border: '1px solid #e2e8f0', background: '#f8fafc' }} />
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {row.map((cell, ci) => {
                    const region = findRegionContainingCell(mergeRegions, ri, ci);
                    if (region && (region.row !== ri || region.col !== ci)) {
                      return null;
                    }

                    const sel = selection ? normalizeSelection(selection) : null;
                    const inSelection = !!sel && ri >= sel.startRow && ri <= sel.endRow && ci >= sel.startCol && ci <= sel.endCol;
                    const rowspan = region ? region.rowspan : 1;
                    const colspan = region ? region.colspan : 1;

                    return (
                      <td
                        key={ci}
                        rowSpan={rowspan}
                        colSpan={colspan}
                        style={{ border: inSelection ? '2px solid #3b82f6' : '1px solid #e2e8f0', padding: 0, position: 'relative' }}
                      >
                        <input
                          value={cell}
                          onChange={e => updateCell(ri, ci, e.target.value)}
                          onFocus={() => {
                            setSelection({ startRow: ri, startCol: ci, endRow: ri, endCol: ci });
                          }}
                          onMouseDown={e => {
                            if (e.shiftKey && selection) {
                              setSelection({ ...selection, endRow: ri, endCol: ci });
                            }
                          }}
                          style={{
                            ...cellStyle,
                            background: inSelection ? '#eff6ff' : '#fff',
                            minHeight: rowspan > 1 ? 30 * rowspan : undefined,
                          }}
                          placeholder="输入内容..."
                        />
                        {region && (
                          <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, color: '#64748b' }}>
                            {region.rowspan}x{region.colspan}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ border: '1px solid #e2e8f0', textAlign: 'center', padding: 4, background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    {grid.rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(ri)}
                        title="删除此行"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, lineHeight: 1 }}
                      >×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === 'visual' && !tableOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={switchToMarkdown}
            style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            ✓ 确认并转为 Markdown
          </button>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            切换回 Markdown 模式时将自动更新文档内容
          </span>
        </div>
      )}
    </div>
  );
});

export default VisualTableEditor;
