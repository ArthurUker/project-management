/**
 * VisualTableEditor — 可视化表格编辑器
 * 支持在"可视化表格"和"Markdown 源码"两种模式之间切换
 * 对外通过 value/onChange 双向绑定 Markdown 字符串
 */
import React, { useState, useCallback } from 'react';

interface VisualTableEditorProps {
  /** Markdown 文本内容（整篇文档，不只是表格） */
  value: string;
  onChange: (v: string) => void;
  /** 是否只渲染表格编辑器（不显示正文 textarea） */
  tableOnly?: boolean;
}

// ── 数据结构 ───────────────────────────────────────
interface GridTable {
  /** 列头 */
  headers: string[];
  /** 数据行 */
  rows: string[][];
}

// ── Markdown ↔ Grid 互转 ────────────────────────────

/** 解析第一个 Markdown 表格，返回 { headers, rows, before, after } */
function parseFirstTable(md: string) {
  const lines = md.split('\n');
  let tableStart = -1;
  let tableEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('|') && tableStart === -1) tableStart = i;
    if (tableStart !== -1 && !lines[i].trim().startsWith('|') && lines[i].trim() !== '') {
      tableEnd = i;
      break;
    }
  }
  if (tableStart === -1) return null;
  if (tableEnd === -1) tableEnd = lines.length;

  const tableLines = lines.slice(tableStart, tableEnd).filter(l => l.trim().startsWith('|'));
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
  return {
    headers,
    rows: normalized,
    before: lines.slice(0, tableStart).join('\n'),
    after: lines.slice(tableEnd).join('\n'),
  };
}

function gridToMarkdown(g: GridTable): string {
  const colWidths = g.headers.map((h, ci) =>
    Math.max(h.length, ...g.rows.map(r => (r[ci] || '').length), 3)
  );
  const pad = (s: string, w: number) => s.padEnd(w);
  const headerRow = '| ' + g.headers.map((h, i) => pad(h, colWidths[i])).join(' | ') + ' |';
  const sepRow   = '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |';
  const dataRows  = g.rows.map(
    r => '| ' + g.headers.map((_, i) => pad(r[i] || '', colWidths[i])).join(' | ') + ' |'
  );
  return [headerRow, sepRow, ...dataRows].join('\n');
}

// ── 主组件 ─────────────────────────────────────────
export default function VisualTableEditor({ value, onChange, tableOnly }: VisualTableEditorProps) {
  const [mode, setMode] = useState<'visual' | 'markdown'>('markdown');
  const [grid, setGrid] = useState<GridTable>({ headers: ['列1', '列2', '列3'], rows: [['', '', '']] });

  // 当切换到 visual 模式时，从 markdown 解析表格
  const switchToVisual = useCallback(() => {
    const parsed = parseFirstTable(value);
    if (parsed && parsed.headers.length > 0) {
      setGrid({ headers: parsed.headers, rows: parsed.rows.length ? parsed.rows : [parsed.headers.map(() => '')] });
    } else {
      setGrid({ headers: ['列1', '列2', '列3'], rows: [['', '', '']] });
    }
    setMode('visual');
  }, [value]);

  // 当切换回 markdown 时，把 grid 合并回 value
  const switchToMarkdown = useCallback(() => {
    const parsed = parseFirstTable(value);
    const tableMd = gridToMarkdown(grid);
    if (parsed) {
      const newMd = [parsed.before, tableMd, parsed.after].filter(s => s !== '').join('\n');
      onChange(newMd);
    } else {
      onChange(value ? value + '\n' + tableMd : tableMd);
    }
    setMode('markdown');
  }, [grid, value, onChange]);

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
  const removeRow = (ri: number) => setGrid(g => ({ ...g, rows: g.rows.filter((_, i) => i !== ri) }));
  const addCol = () => setGrid(g => ({
    headers: [...g.headers, `列${g.headers.length + 1}`],
    rows: g.rows.map(r => [...r, '']),
  }));
  const removeCol = (ci: number) => setGrid(g => ({
    headers: g.headers.filter((_, i) => i !== ci),
    rows: g.rows.map(r => r.filter((_, i) => i !== ci)),
  }));

  // 插入新空表格（visual 模式下）
  const insertNewTable = () => {
    const newGrid = { headers: ['列1', '列2', '列3'], rows: [['', '', ''], ['', '', '']] };
    setGrid(newGrid);
    if (mode === 'markdown') {
      const tableMd = gridToMarkdown(newGrid);
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
        {/* 模式切换 */}
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

        {mode === 'visual' && (
          <>
            <button type="button" onClick={addRow} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#374151' }}>
              ＋ 添加行
            </button>
            <button type="button" onClick={addCol} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#374151' }}>
              ＋ 添加列
            </button>
            <button type="button" onClick={insertNewTable} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fde68a', background: '#fffbeb', cursor: 'pointer', fontSize: 12, color: '#92400e' }}>
              重置表格
            </button>
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
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ border: '1px solid #e2e8f0', padding: 0 }}>
                      <input
                        value={cell}
                        onChange={e => updateCell(ri, ci, e.target.value)}
                        style={cellStyle}
                        placeholder="输入内容..."
                      />
                    </td>
                  ))}
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

      {mode === 'visual' && (
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
}
