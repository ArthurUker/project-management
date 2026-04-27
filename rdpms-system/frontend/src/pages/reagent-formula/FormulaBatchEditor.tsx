/**
 * FormulaBatchEditor — 配方批量新增 / 编辑（Excel 电子表格模式）
 *
 * 行 = 配方，列 = 试剂原料，单元格 = 浓度值
 * 可通过"添加列"从知识库选择试剂；通过"添加行"新增配方
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formulaAPI, reagentMaterialsAPI } from '../../api/client';

const FORMULA_TYPES = ['XDY', 'LJY', 'CLY', 'HCY', 'JHY'];
const PCR_TYPES = ['PCR', 'qPCR', 'RT-PCR', 'RT-qPCR'];

interface BRow {
  id?: string;           // 已有配方 id，新行为 undefined
  code: string;
  name: string;
  type: string;
  pH: string;
  notes: string;
  cells: Record<string, string>; // colKey -> concentration 字符串
  isDirty: boolean;
}

interface BCol {
  key: string;           // reagentMaterialId（或 "name:xxx"）
  label: string;         // 显示名称
  unit: string;          // 浓度单位
}

const emptyRow = (): BRow => ({
  code: '', name: '', type: 'XDY', pH: '7', notes: '', cells: {}, isDirty: true,
});

interface Props {
  /** 如传入则仅加载这些 id 对应的配方；否则从一个空行开始 */
  initialFormulaIds?: string[];
  /** 如传入则直接使用已加载的详细配方数据，跳过再次请求 */
  initialFormulas?: any[];
  onClose: () => void;
  onSaved: () => void;
}

export default function FormulaBatchEditor({ initialFormulaIds, initialFormulas, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<BRow[]>([]);
  const [cols, setCols] = useState<BCol[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddCol, setShowAddCol] = useState(false);
  const [colSearch, setColSearch] = useState('');
  const addColRef = useRef<HTMLDivElement>(null);

  useEffect(() => { init(); }, []);

  // 关闭添加列下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addColRef.current && !addColRef.current.contains(e.target as Node)) setShowAddCol(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const init = async () => {
    setLoading(true);
    try {
      // 1. 加载试剂原料知识库
      const matRes = await reagentMaterialsAPI.list() as any;
      const mats: any[] = matRes.list || [];
      setMaterials(mats);

      // 2. 获取需要编辑的配方详细数据
      let detailed: any[] = [];
      if (initialFormulas && initialFormulas.length > 0) {
        // 父组件已提供详细数据（含 components）
        detailed = initialFormulas.filter(f => !PCR_TYPES.includes(f.type));
      } else if (initialFormulaIds && initialFormulaIds.length > 0) {
        // 按 id 加载详细数据
        detailed = await Promise.all(
          initialFormulaIds.map(async id => {
            try { const r = await formulaAPI.get(id) as any; return r?.formula || null; }
            catch { return null; }
          })
        ).then(arr => arr.filter(Boolean).filter(f => !PCR_TYPES.includes(f.type)));
      }
      // 否则从空行开始

      // 3. 从所有配方组分中收集列（试剂）
      const colMap = new Map<string, BCol>();
      detailed.forEach((f: any) => {
        (f.components || []).forEach((c: any) => {
          const mid = c.reagentMaterialId;
          if (mid) {
            const mat = mats.find((m: any) => m.id === mid);
            if (mat && !colMap.has(mid)) {
              colMap.set(mid, { key: mid, label: mat.commonName, unit: mat.defaultStockUnit || 'mM' });
            }
          } else if (c.componentName) {
            const key = `name:${c.componentName}`;
            if (!colMap.has(key)) {
              colMap.set(key, { key, label: c.componentName, unit: c.unit || 'mM' });
            }
          }
        });
      });
      setCols(Array.from(colMap.values()));

      // 4. 构建行数据
      const bRows: BRow[] = detailed.map((f: any) => {
        const cells: Record<string, string> = {};
        (f.components || []).forEach((c: any) => {
          const key = c.reagentMaterialId
            ? c.reagentMaterialId
            : `name:${c.componentName || ''}`;
          if (c.concentration != null) cells[key] = String(c.concentration);
        });
        return {
          id: f.id,
          code: f.code || '',
          name: f.name || '',
          type: f.type || 'XDY',
          pH: f.pH != null ? String(f.pH) : '',
          notes: f.notes || '',
          cells,
          isDirty: false,
        };
      });

      setRows(bRows.length > 0 ? bRows : [emptyRow()]);
    } catch (e) {
      console.error('批量编辑器初始化失败', e);
      setRows([emptyRow()]);
    }
    setLoading(false);
  };

  const addRow = () => setRows(r => [...r, emptyRow()]);
  const removeRow = (idx: number) => setRows(r => r.filter((_, i) => i !== idx));

  const addCol = (mat: any) => {
    if (cols.find(c => c.key === mat.id)) { setShowAddCol(false); return; }
    setCols(c => [...c, { key: mat.id, label: mat.commonName, unit: mat.defaultStockUnit || 'mM' }]);
    setShowAddCol(false);
    setColSearch('');
  };
  const removeCol = (key: string) => setCols(c => c.filter(col => col.key !== key));

  const setCell = useCallback((rowIdx: number, colKey: string, val: string) => {
    setRows(r => r.map((row, i) =>
      i === rowIdx ? { ...row, cells: { ...row.cells, [colKey]: val }, isDirty: true } : row
    ));
  }, []);

  const setField = useCallback((rowIdx: number, field: keyof BRow, val: string) => {
    setRows(r => r.map((row, i) =>
      i === rowIdx ? { ...row, [field]: val, isDirty: true } : row
    ));
  }, []);

  const handleSave = async () => {
    const dirtyRows = rows.filter(r => r.isDirty && r.code.trim());
    if (dirtyRows.length === 0) { alert('没有需要保存的修改'); return; }
    setSaving(true);
    try {
      await Promise.all(dirtyRows.map(async row => {
        const components = cols
          .filter(col => row.cells[col.key] != null && row.cells[col.key] !== '')
          .map(col => ({
            reagentMaterialId: col.key.startsWith('name:') ? null : col.key,
            componentName: col.key.startsWith('name:') ? col.label : null,
            concentration: parseFloat(row.cells[col.key]) || 0,
            unit: col.unit,
          }));

        const payload = {
          code: row.code.trim(),
          name: row.name.trim(),
          type: row.type,
          pH: row.pH !== '' ? parseFloat(row.pH) : null,
          notes: row.notes,
          components,
        };

        if (row.id) {
          await formulaAPI.update(row.id, payload);
        } else {
          await formulaAPI.create(payload);
        }
      }));
      onSaved();
    } catch (e: any) {
      alert(e?.message || e?.error || '保存失败，请检查配方编号是否重复');
    }
    setSaving(false);
  };

  const filteredMats = materials.filter(m =>
    !colSearch ||
    (m.commonName || '').toLowerCase().includes(colSearch.toLowerCase()) ||
    (m.chineseName || '').toLowerCase().includes(colSearch.toLowerCase())
  ).slice(0, 40);

  const dirtyCount = rows.filter(r => r.isDirty && r.code.trim()).length;

  // ── 表头固定列宽常量 ──
  const COL_ROW_IDX = 36;
  const COL_CODE    = 100;
  const COL_NAME    = 120;
  const COL_TYPE    = 80;
  const COL_PH      = 56;

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '32px 48px', color: '#64748b', fontSize: 15 }}>加载中...</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 300, display: 'flex', flexDirection: 'column', padding: '16px' }}>
      <div style={{ flex: 1, background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 96px rgba(0,0,0,0.22)', overflow: 'hidden', minHeight: 0 }}>

        {/* ── 顶部标题栏 ── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#f8fafc' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#1e293b' }}>配方批量编辑（电子表格模式）</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              行 = 配方 · 列 = 试剂原料 · 单元格 = 浓度值
              {dirtyCount > 0 && <span style={{ color: '#f59e0b', marginLeft: 10 }}>● {dirtyCount} 行有未保存修改</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addRow} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>＋ 新增行</button>
            <button
              onClick={handleSave}
              disabled={saving || dirtyCount === 0}
              style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: dirtyCount > 0 ? '#3b82f6' : '#e2e8f0', color: dirtyCount > 0 ? '#fff' : '#94a3b8', cursor: (saving || dirtyCount === 0) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
            >{saving ? '保存中...' : `保存（${dirtyCount} 行）`}</button>
            <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13 }}>关闭</button>
          </div>
        </div>

        {/* ── 表格区 ── */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, tableLayout: 'auto', minWidth: '100%' }}>
            <colgroup>
              <col style={{ minWidth: COL_ROW_IDX }} />
              <col style={{ minWidth: COL_CODE }} />
              <col style={{ minWidth: COL_NAME }} />
              <col style={{ minWidth: COL_TYPE }} />
              <col style={{ minWidth: COL_PH }} />
              {cols.map(col => <col key={col.key} style={{ minWidth: 80 }} />)}
              <col style={{ minWidth: 80 }} />
              <col style={{ minWidth: 40 }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 20 }}>
                {/* 行号 */}
                <th style={{ ...thSt, position: 'sticky', left: 0, zIndex: 25, width: COL_ROW_IDX, textAlign: 'center' }}>#</th>
                {/* 配方编号（双重 sticky）*/}
                <th style={{ ...thSt, position: 'sticky', left: COL_ROW_IDX, zIndex: 25, width: COL_CODE, borderRight: '2px solid #cbd5e1' }}>编号</th>
                <th style={{ ...thSt, minWidth: COL_NAME }}>名称</th>
                <th style={{ ...thSt, minWidth: COL_TYPE }}>类型</th>
                <th style={{ ...thSt, minWidth: COL_PH }}>pH</th>
                {/* 试剂列 */}
                {cols.map(col => (
                  <th key={col.key} style={{ ...thSt, textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <span style={{ fontWeight: 700 }}>{col.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>({col.unit})</span>
                        <button onClick={() => removeCol(col.key)} title="移除此列" style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                    </div>
                  </th>
                ))}
                {/* 添加列 */}
                <th style={{ ...thSt }}>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowAddCol(v => !v)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1.5px dashed #93c5fd', background: showAddCol ? '#eff6ff' : '#f8fafc', color: '#3b82f6', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}
                    >＋ 添加列</button>
                    {showAddCol && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', zIndex: 100, width: 230, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ padding: '8px' }}>
                          <input
                            value={colSearch} onChange={e => setColSearch(e.target.value)}
                            placeholder="搜索试剂原料..." autoFocus
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {filteredMats.length === 0
                            ? <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 12 }}>无匹配试剂</div>
                            : filteredMats.map((mat: any) => {
                              const alreadyAdded = !!cols.find(c => c.key === mat.id);
                              return (
                                <div
                                  key={mat.id}
                                  onClick={() => !alreadyAdded && addCol(mat)}
                                  style={{ padding: '8px 12px', cursor: alreadyAdded ? 'default' : 'pointer', opacity: alreadyAdded ? 0.4 : 1, borderBottom: '1px solid #f8fafc' }}
                                  onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = '#f1f5f9'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                                >
                                  <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b' }}>{mat.commonName}</div>
                                  {mat.chineseName && <div style={{ fontSize: 11, color: '#94a3b8' }}>{mat.chineseName}</div>}
                                  {alreadyAdded && <div style={{ fontSize: 10, color: '#3b82f6' }}>已添加</div>}
                                </div>
                              );
                            })
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </th>
                {/* 删除按钮列 */}
                <th style={{ ...thSt, width: 40 }}></th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, ri) => {
                const isNew = row.isDirty && !row.id;
                const isModified = row.isDirty && !!row.id;
                const rowBg = ri % 2 === 0 ? '#fff' : '#f8fafc';
                const dirtyBg = isNew ? '#f0fdf4' : isModified ? '#fffbeb' : rowBg;
                return (
                  <tr key={ri}>
                    {/* 行号（sticky） */}
                    <td style={{ ...tdSt, background: dirtyBg, position: 'sticky', left: 0, zIndex: 5, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>
                      {isNew ? <span style={{ color: '#10b981', fontWeight: 700 }}>新</span>
                        : isModified ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>改</span>
                          : ri + 1}
                    </td>
                    {/* 编号（双重 sticky）*/}
                    <td style={{ ...tdSt, background: dirtyBg, position: 'sticky', left: COL_ROW_IDX, zIndex: 5, borderRight: '2px solid #cbd5e1', padding: '2px 4px' }}>
                      <input
                        value={row.code}
                        onChange={e => setField(ri, 'code', e.target.value)}
                        placeholder="如 XDY-11"
                        style={{ width: '100%', padding: '4px 6px', border: 'none', background: 'transparent', fontSize: 12, outline: 'none', color: '#1e40af', fontWeight: 700, boxSizing: 'border-box' }}
                      />
                    </td>
                    {/* 名称 */}
                    <td style={{ ...tdSt, background: dirtyBg, padding: '2px 4px' }}>
                      <input
                        value={row.name}
                        onChange={e => setField(ri, 'name', e.target.value)}
                        placeholder="配方名称"
                        style={{ width: '100%', padding: '4px 6px', border: 'none', background: 'transparent', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </td>
                    {/* 类型 */}
                    <td style={{ ...tdSt, background: dirtyBg, padding: '2px 4px' }}>
                      <select
                        value={row.type}
                        onChange={e => setField(ri, 'type', e.target.value)}
                        style={{ width: '100%', padding: '4px 6px', border: 'none', background: 'transparent', fontSize: 12, outline: 'none' }}
                      >
                        {FORMULA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    {/* pH */}
                    <td style={{ ...tdSt, background: dirtyBg, padding: '2px 4px' }}>
                      <input
                        type="number"
                        value={row.pH}
                        onChange={e => setField(ri, 'pH', e.target.value)}
                        placeholder="pH"
                        style={{ width: '100%', padding: '4px 4px', border: 'none', background: 'transparent', fontSize: 12, outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                      />
                    </td>
                    {/* 试剂浓度单元格 */}
                    {cols.map(col => {
                      const val = row.cells[col.key] ?? '';
                      const hasVal = val !== '';
                      return (
                        <td key={col.key} style={{ ...tdSt, background: hasVal ? (ri % 2 === 0 ? '#f0fdf4' : '#ecfdf5') : dirtyBg, padding: '2px 4px', textAlign: 'center' }}>
                          <input
                            type="number"
                            value={val}
                            onChange={e => setCell(ri, col.key, e.target.value)}
                            placeholder="—"
                            style={{ width: '100%', padding: '4px 4px', border: 'none', background: 'transparent', fontSize: 12, outline: 'none', textAlign: 'center', boxSizing: 'border-box', minWidth: 56 }}
                            onFocus={e => { e.currentTarget.parentElement!.style.outline = '2px solid #bfdbfe'; }}
                            onBlur={e => { e.currentTarget.parentElement!.style.outline = ''; }}
                          />
                        </td>
                      );
                    })}
                    {/* 空占位（添加列那列）*/}
                    <td style={{ ...tdSt, background: dirtyBg }}></td>
                    {/* 删除行 */}
                    <td style={{ ...tdSt, background: dirtyBg, textAlign: 'center', padding: '2px' }}>
                      <button
                        onClick={() => removeRow(ri)}
                        title="删除此行"
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                      >×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── 底部说明栏 ── */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={addRow} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 12 }}>＋ 新增配方行</button>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{rows.length} 行 · {cols.length} 列试剂</span>
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>
            <span style={{ color: '#10b981', fontWeight: 700 }}>绿底</span> = 新行 ·
            <span style={{ color: '#f59e0b', fontWeight: 700, marginLeft: 4 }}>黄底</span> = 已修改 ·
            <span style={{ color: '#10b981', marginLeft: 4 }}>绿色单元格</span> = 有浓度值
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>Tab 键可快速在单元格间跳转</span>
        </div>
      </div>
    </div>
  );
}

const thSt: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #e2e8f0',
  whiteSpace: 'nowrap', textAlign: 'left',
  color: '#374151', fontWeight: 600, background: '#f1f5f9',
};

const tdSt: React.CSSProperties = {
  border: '1px solid #f1f5f9',
  verticalAlign: 'middle',
};
