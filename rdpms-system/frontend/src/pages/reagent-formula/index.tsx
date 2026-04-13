import React, { useEffect, useMemo, useState, useRef } from 'react';
import { formulaAPI, reagentAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';

export default function FormulaMatrix() {
  const [formulas, setFormulas] = useState<any[]>([]);
  const [reagents, setReagents] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  // hovered position: track by group and index for row/col
  const [hoveredRow, setHoveredRow] = useState<{ group?: string; rowIdx?: number } | null>(null);
  const [hoveredCol, setHoveredCol] = useState<{ group?: string; colIdx?: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // expanded rows state (key: `${group}_${rowIdx}`)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await formulaAPI.list({ type: typeFilter, keyword: search });
      const base = res.list || [];
      // fetch details for each formula to get components (if list doesn't include them)
      const detailed = await Promise.all(base.map(async (f: any) => {
        try {
          const det = await formulaAPI.get(f.id);
          return { ...f, components: det.formula?.components || [], procedure: det.formula?.procedure, notes: det.formula?.notes };
        } catch (e) { return { ...f, components: [] }; }
      }));

      setFormulas(detailed);

      // load reagents
      const rres = await reagentAPI.list();
      const allReagents = rres.list || [];
      setReagents(allReagents);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, [typeFilter]);

  // group formulas by type and sort codes
  const grouped = useMemo(() => {
    const kw = (search || '').trim().toLowerCase();
    const filtered = formulas.filter(f => {
      if (!kw) return true;
      return (f.code || '').toLowerCase().includes(kw) || (f.name || '').toLowerCase().includes(kw);
    });
    const map: Record<string, any[]> = {};
    filtered.forEach(f => {
      const t = f.type || 'OTHER';
      if (!map[t]) map[t] = [];
      map[t].push(f);
    });
    const order = ['CLY', 'LJY', 'XDY'];
    const remaining: string[] = [];
    Object.keys(map).forEach(k => { if (!order.includes(k)) remaining.push(k); });
    const keys = [...order.filter(k => map[k]), ...remaining.filter(k => map[k])];
    const groups: { type: string; items: any[] }[] = [];
    keys.forEach(k => {
      const items = map[k].sort((a: any, b: any) => (a.code || '').localeCompare(b.code || ''));
      groups.push({ type: k, items });
    });
    return groups;
  }, [formulas, search]);

  // frequency map for all-tab ordering
  const freqMap = useMemo(() => {
    const m = new Map<string, number>();
    formulas.forEach(f => { (f.components || []).forEach((c: any) => { const id = c.reagent?.id || c.reagentId; if (id) m.set(id, (m.get(id) || 0) + 1); }); });
    return m;
  }, [formulas]);

  const columnsForAll = useMemo(() => {
    const used = new Set<string>();
    formulas.forEach(f => { (f.components || []).forEach((c: any) => { const id = c.reagent?.id || c.reagentId; if (id) used.add(id); }); });
    let cols = reagents.filter(r => used.size === 0 ? true : used.has(r.id));
    cols.sort((a, b) => {
      const fa = freqMap.get(a.id) || 0;
      const fb = freqMap.get(b.id) || 0;
      if (fa !== fb) return fb - fa;
      return (a.name || '').localeCompare(b.name || '');
    });
    return cols;
  }, [reagents, formulas, freqMap]);

  const columnsForGroup = (groupItems: any[]) => {
    const used = new Set<string>();
    groupItems.forEach(f => { (f.components || []).forEach((c: any) => { const id = c.reagent?.id || c.reagentId; if (id) used.add(id); }); });
    let cols = reagents.filter(r => used.has(r.id));
    cols.sort((a, b) => {
      if ((a.category || '') === (b.category || '')) return (a.name || '').localeCompare(b.name || '');
      return (a.category || '').localeCompare(b.category || '');
    });
    return cols;
  };

  const matrix = useMemo(() => {
    const map: Record<string, Record<string, any>> = {};
    formulas.forEach(f => {
      map[f.id] = {};
      (f.components || []).forEach((c: any) => {
        const rid = c.reagent?.id || c.reagentId;
        if (rid) map[f.id][rid] = c;
      });
    });
    return map;
  }, [formulas]);

  const formatNumber = (v: any) => {
    if (v == null) return '';
    const n = Number(v);
    if (Number.isNaN(n)) return '';
    return Number.isInteger(n) ? String(n) : String(n);
  };

  const typeBg = (type: string) => {
    if (type === 'CLY') return 'bg-blue-50 text-blue-800';
    if (type === 'LJY') return 'bg-green-50 text-green-800';
    if (type === 'XDY') return 'bg-orange-50 text-orange-800';
    return 'bg-gray-100 text-gray-800';
  };

  // reagent classification for double-header grouping
  const reagentCategories = [
    { key: 'denaturant', label: '变性剂', color: '#fef3c7', aliases: ['GITC', 'GuHCl', 'GuHCl', 'Urea', '尿素'] },
    { key: 'detergent', label: '去污剂', color: '#ede9fe', aliases: ['SDS', 'SLS', 'Triton X-100', 'TritonX-100', 'Tween-20', 'CHAPS', 'NP-40', 'CTAB'] },
    { key: 'buffer', label: '缓冲体系', color: '#dbeafe', aliases: ['Tris', 'HEPES', 'PBS', 'NaAc', 'H3BO3'] },
    { key: 'salts', label: '盐类', color: '#dcfce7', aliases: ['NaCl', 'KCl', 'MgCl2', 'CaCl2', 'Na2SO4', 'NH4SO4', '(NH4)2SO4'] },
    { key: 'chelating', label: '螯合剂', color: '#fee2e2', aliases: ['EDTA'] },
    { key: 'reducing', label: '还原剂', color: '#ffedd5', aliases: ['β-巯基乙醇', 'beta-mercaptoethanol', 'DTT', 'TCEP'] },
    { key: 'stabilizer', label: '稳定剂/其他', color: '#f3f4f6', aliases: ['PVP', 'PEG8000', 'BSA', '甘油', 'glycerol', '蔗糖', 'sucrose'] },
  ];

  const normalizeName = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedFormula, setSelectedFormula] = useState<any | null>(null);
  const [drawerTab, setDrawerTab] = useState<number>(0);
  const [stockConcs, setStockConcs] = useState<Record<string, number>>({});
  const [calcResults, setCalcResults] = useState<any[]>([]);
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{left:number, top:number} | null>(null);
  const popoverOpenRef = useRef<any>({showTimer: null, hideTimer: null});

  const getDefaultStock = (name: string) => {
    const n = (name || '').toLowerCase();
    if (n.includes('tris')) return 1;
    if (n.includes('nacl')) return 5;
    if (n.includes('kcl')) return 3;
    if (n.includes('edta')) return 0.5;
    if (n.includes('mgcl2')) return 1;
    if (n.includes('cacl2')) return 1;
    if (n.includes('gitc')) return 8;
    if (n.includes('sds')) return 10; // percent
    return 1;
  };

  const doCalculate = () => {
    if (!selectedFormula) return;
    const targetRaw = Number((document.getElementById('calc_target') as HTMLInputElement)?.value || 100);
    const unit = ((document.getElementById('calc_unit') as HTMLSelectElement)?.value) || 'mL';
    const count = Number((document.getElementById('calc_count') as HTMLInputElement)?.value || 1);
    let target_mL = targetRaw;
    if (unit === 'L') target_mL = targetRaw * 1000;
    if (unit === 'μL') target_mL = targetRaw * 0.001;

    const comps = selectedFormula.components || [];
    const results = comps.map((c: any) => {
      const reagentName = c.reagent?.name || c.reagentName || c.name || '';
      const stockKey = c.reagent?.id || reagentName;
      const stock = stockConcs[stockKey] ?? getDefaultStock(reagentName);
      const compConc = Number(c.concentration) || 0;
      const isPercent = reagentName.toLowerCase().includes('sds') || String(stock).toString().endsWith('%');
      const needed_mL = stock ? (compConc / stock) * target_mL * count : 0;
      return { reagentId: stockKey, reagentName, stock, stockUnit: isPercent ? '%' : 'M', needed_mL };
    });
    setCalcResults(results);
  };

  const copyResults = async () => {
    if (!calcResults.length) return;
    let text = `配方 ${selectedFormula?.code || ''} - ${selectedFormula?.name || ''}\n`;
    const unit = (document.getElementById('calc_unit') as HTMLSelectElement)?.value || 'mL';
    calcResults.forEach(r => {
      text += `${r.reagentName}\t${r.needed_mL.toFixed(2)} mL\n`;
    });
    text += `加超纯水至 ${ (Number((document.getElementById('calc_target') as HTMLInputElement)?.value || 100)).toFixed(2) } ${ (document.getElementById('calc_unit') as HTMLSelectElement)?.value || 'mL' }`;
    try { await navigator.clipboard.writeText(text); alert('已复制到剪贴板'); } catch (e) { console.error(e); alert('复制失败'); }
  };

  return (
    <div className="w-full">
      <div className="flex">
        <aside className="w-48 pr-4">
          <ul>
            <li className={`p-2 cursor-pointer ${typeFilter===''?'bg-gray-100':''}`} onClick={() => setTypeFilter('')}>全部配方</li>
            <li className={`p-2 cursor-pointer ${typeFilter==='CLY'?'bg-gray-100':''}`} onClick={() => setTypeFilter('CLY')}>🧪 处理液 CLY</li>
            <li className={`p-2 cursor-pointer ${typeFilter==='LJY'?'bg-gray-100':''}`} onClick={() => setTypeFilter('LJY')}>🔬 裂解液 LJY</li>
            <li className={`p-2 cursor-pointer ${typeFilter==='XDY'?'bg-gray-100':''}`} onClick={() => setTypeFilter('XDY')}>🧹 洗涤液 XDY</li>
          </ul>
        </aside>

        <main className="flex-1">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <input placeholder="搜索编号或名称" className="border p-2" style={{ fontSize: 13 }} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
              <button className="ml-2 border px-3 py-1" onClick={load}>搜索</button>
            </div>
            <div>
              <button className="btn btn-primary" onClick={() => navigate('/reagent-formula/new')}>新建配方</button>
            </div>
          </div>

          <div className="w-full overflow-x-auto border rounded" style={{ position: 'relative' }}>
            <div className="w-full">
              {/* Render separate table per group to allow hiding columns per group */}
              {grouped.map(group => {
                const globalCols = columnsForAll; // global ordering
                const baseCols = typeFilter === '' ? globalCols : columnsForGroup(group.items);
                const visibleCols = baseCols.filter(col => group.items.some((f: any) => !!(matrix[f.id] && matrix[f.id][col.id])));
                const isCollapsed = !!collapsed[group.type];

                const headerBg = group.type === 'CLY' ? '#dbeafe' : group.type === 'LJY' ? '#dcfce7' : group.type === 'XDY' ? '#ffedd5' : '#f3f4f6';

                // categorize visibleCols into reagentCategories order
                const norm = normalizeName;
                const catGroups = reagentCategories.map(cat => ({ ...cat, items: visibleCols.filter(r => cat.aliases.some(a => norm(r.name).includes(norm(a)))) })).filter(c => c.items.length > 0);
                // any leftover reagents not matched
                const matchedIds = new Set(catGroups.flatMap(c => c.items.map((i: any) => i.id)));
                const others = visibleCols.filter(r => !matchedIds.has(r.id));
                if (others.length > 0) {
                  catGroups.push({ key: 'others', label: '其他', color: '#f3f4f6', aliases: [], items: others });
                }
                const orderedCols = catGroups.flatMap(c => c.items);

                return (
                  <div key={group.type} className="mb-6">
                    {/* group header */}
                    <div onClick={() => setCollapsed(s => ({ ...s, [group.type]: !s[group.type] }))} className="pl-3 h-8 font-bold text-sm cursor-pointer" style={{ background: headerBg, display: 'flex', alignItems: 'center' }}>
                      <span className="mr-2">{isCollapsed ? '▶' : '▼'}</span>
                      <span className="truncate">{group.type}（{group.items.length} 条）</span>
                    </div>

                    {!isCollapsed && (
                      <div className="w-full overflow-x-auto">
                        <table className="table-auto border-collapse" style={{ tableLayout: 'auto', minWidth: '100%' }}>
                          <thead>
                            {/* category header (first row) */}
                            <tr>
                              <th rowSpan={2} className="sticky left-0 z-40 bg-white border-r px-3 py-2" style={{ width: 160, top: 0 }}>
                                <div className="font-semibold text-left">编号 / 名称</div>
                              </th>

                              {catGroups.map((cat, catIdx) => (
                                <th key={cat.key} colSpan={cat.items.length} className="sticky z-30 text-center text-xs font-bold transition-colors duration-100" style={{ position: 'sticky', top: 0, background: cat.color, height: 28, borderRight: '2px solid #D1D5DB' }}>
                                  <div className="flex items-center justify-center">{cat.label}</div>
                                </th>
                              ))}
                            </tr>

                            {/* reagent name header (second row) */}
                            <tr>
                              {orderedCols.map((r, colIdx) => {
                                const isColHovered = hoveredCol?.group === group.type && hoveredCol?.colIdx === colIdx;
                                const cat = catGroups.find(c => c.items.some((it: any) => it.id === r.id));
                                const bg = cat?.color || '#f3f4f6';
                                return (
                                  <th
                                    key={r.id}
                                    title={r.name + ' (' + (r.defaultUnit || '') + ')'}
                                    onMouseEnter={() => setHoveredCol({ group: group.type, colIdx })}
                                    onMouseLeave={() => setHoveredCol(null)}
                                    className={`z-30 w-[80px] text-center text-xs font-semibold text-gray-600 transition-colors duration-100 ${isColHovered ? 'bg-[#dbeafe]' : ''}`}
                                    style={{ position: 'sticky', top: 28, width: 80, background: bg }}
                                  >
                                    <div className="px-3 py-2 truncate">{r.name}</div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>

                          <tbody>
                            {group.items.map((f: any, rowIdx: number) => {
                              const isRowHovered = hoveredRow?.group === group.type && hoveredRow?.rowIdx === rowIdx;
                              const key = `${group.type}_${rowIdx}`;
                              const comps = f.components || [];
                              return (
                                <React.Fragment key={f.id}>
                                  <tr
                                    onMouseEnter={() => setHoveredRow({ group: group.type, rowIdx })}
                                    onMouseLeave={() => setHoveredRow(null)}
                                    className={`transition-colors duration-100 ${isRowHovered ? 'bg-[#dbeafe]' : 'hover:bg-[#eff6ff]'}`}
                                    style={{ height: 38 }}
                                  >
                                    <td
                                      className={`sticky left-0 z-10 border-r px-3 py-2 transition-colors duration-100 ${isRowHovered ? 'bg-[#dbeafe]' : 'bg-white'}`}
                                      style={{ width: 160 }}
                                    >
                                      <div>
                                        <a href="#" onClick={(e) => { e.preventDefault(); setSelectedFormula(f); setDrawerTab(0); setDrawerOpen(true); }} className="text-blue-600 font-medium text-sm">{f.code}</a>
                                        <div className="text-xs text-gray-500">
                                          <span
                                            onMouseEnter={(e) => {
                                              if (popoverOpenRef.current.hideTimer) { clearTimeout(popoverOpenRef.current.hideTimer); popoverOpenRef.current.hideTimer = null; }
                                              popoverOpenRef.current.showTimer = setTimeout(() => {
                                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                                setPopoverId(f.id);
                                                setPopoverPos({ left: rect.right + 8, top: rect.top });
                                                // quick compute default preview
                                                const t = 100;
                                                const compsPreview = (f.components || []).slice(0, 5).map((c:any) => {
                                                  const name = c.reagent?.name || c.reagentName || c.name || '';
                                                  const stock = stockConcs[c.reagent?.id || name] ?? getDefaultStock(name);
                                                  const needed = stock ? ((Number(c.concentration)||0) / stock) * t : 0;
                                                  return { name, needed };
                                                });
                                                setCalcResults(compsPreview.map((c:any)=>({ reagentName: c.name, needed_mL: c.needed })));
                                              }, 500);
                                            }}
                                            onMouseLeave={() => {
                                              if (popoverOpenRef.current.showTimer) { clearTimeout(popoverOpenRef.current.showTimer); popoverOpenRef.current.showTimer = null; }
                                              popoverOpenRef.current.hideTimer = setTimeout(() => { setPopoverId(null); setPopoverPos(null); }, 300);
                                            }}
                                            className="cursor-default"
                                          >{f.name}</span>
                                        </div>
                                      </div>
                                    </td>

                                    {orderedCols.map((r, colIdx) => {
                                      const comp = matrix[f.id] && matrix[f.id][r.id];
                                      const has = !!comp;
                                      const isColHovered = hoveredCol?.group === group.type && hoveredCol?.colIdx === colIdx;
                                      const isRowHoveredLocal = hoveredRow?.group === group.type && hoveredRow?.rowIdx === rowIdx;
                                      const isCellHovered = isRowHoveredLocal && isColHovered;
                                      const cellBgClass = isCellHovered ? 'bg-[#93c5fd] font-semibold' : isRowHoveredLocal || isColHovered ? 'bg-[#dbeafe]' : has ? 'bg-white' : 'bg-[#f9fafb]';

                                      return (
                                        <td
                                          key={r.id}
                                          onMouseEnter={() => { setHoveredRow({ group: group.type, rowIdx }); setHoveredCol({ group: group.type, colIdx }); }}
                                          onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); }}
                                          className={`w-[80px] text-center text-sm px-3 py-2 transition-colors duration-100 ${cellBgClass}`}
                                          style={{ width: 80 }}
                                        >
                                          {has ? formatNumber(comp.concentration) : ''}
                                        </td>
                                      );
                                    })}
                                  </tr>

                                  {expandedRows[key] && (
                                    <tr key={`${f.id}_exp`} className="transition-all duration-200" style={{ background: '#f8fafc' }}>
                                      <td colSpan={1 + orderedCols.length} style={{ borderLeft: '4px solid #3b82f6', padding: 12 }}>
                                        <div className="mb-2">
                                          <strong>组分</strong>
                                          <table className="w-full mt-2 border-collapse">
                                            <thead>
                                              <tr className="text-xs text-gray-600">
                                                <th className="text-left">序号</th>
                                                <th className="text-left">试剂名称</th>
                                                <th className="text-left">浓度</th>
                                                <th className="text-left">单位</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {comps.map((c: any, idx: number) => (
                                                <tr key={c.id || idx} className="text-sm">
                                                  <td className="py-1">{idx + 1}</td>
                                                  <td className="py-1">{c.reagent?.name || c.reagentName || c.name}</td>
                                                  <td className="py-1">{formatNumber(c.concentration)}</td>
                                                  <td className="py-1">{c.unit || (c.reagent?.defaultUnit) || ''}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                        {(f.procedure || f.notes) && (
                                          <div className="text-sm text-gray-700">
                                            {f.procedure && (
                                              <div className="mb-2"><strong>操作步骤:</strong><div>{f.procedure}</div></div>
                                            )}
                                            {f.notes && (
                                              <div><strong>备注:</strong><div>{f.notes}</div></div>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Popover quick calculator */}
          {popoverId && popoverPos && (
            <div style={{ position: 'fixed', left: popoverPos.left, top: popoverPos.top, width: 320, maxHeight: 400, overflow: 'auto', zIndex: 60 }}>
              <div className="bg-white border shadow p-3 text-sm" style={{ width: 320 }} onMouseEnter={() => { if (popoverOpenRef.current.hideTimer) { clearTimeout(popoverOpenRef.current.hideTimer); popoverOpenRef.current.hideTimer = null; } }} onMouseLeave={() => { popoverOpenRef.current.hideTimer = setTimeout(() => { setPopoverId(null); setPopoverPos(null); }, 300); }}>
                <div className="font-semibold mb-2">⚗️ 快捷配制计算</div>
                <div className="mb-2 flex items-center gap-2">
                  <input defaultValue={100} id="pop_target" className="border p-1 w-20" />
                  <span>mL</span>
                  <button className="ml-2 btn btn-primary" onClick={() => { const t = Number((document.getElementById('pop_target') as HTMLInputElement)?.value || 100); const formula = formulas.find(ff => ff.id === popoverId); if (!formula) return; const comps = (formula.components||[]).slice(0,10).map((c:any)=>{ const name = c.reagent?.name||c.reagentName||c.name||''; const stock = stockConcs[c.reagent?.id||name] ?? getDefaultStock(name); const needed = stock ? ((Number(c.concentration)||0)/stock)*t : 0; return { name, needed }; }); setCalcResults(comps.map((c:any)=>({ reagentName: c.name, needed_mL: c.needed }))); }}>
                    计算
                  </button>
                </div>

                <div className="border-t pt-2">
                  <div className="grid grid-cols-3 text-xs font-semibold mb-1"> <div>试剂名</div><div className="text-center">需要量</div><div className="text-right">单位</div> </div>
                  {calcResults.slice(0, 10).map((r:any, idx:number) => (
                    <div key={idx} className="grid grid-cols-3 text-sm py-1 border-b">
                      <div className="truncate">{r.reagentName}</div>
                      <div className="text-center">{r.needed_mL.toFixed(2)}</div>
                      <div className="text-right">mL</div>
                    </div>
                  ))}

                </div>
                <div className="mt-2 flex justify-end">
                  <button className="btn btn-link" onClick={() => { const f = formulas.find(ff => ff.id === popoverId); if (f) { setSelectedFormula(f); setDrawerTab(3); setDrawerOpen(true); setPopoverId(null); setPopoverPos(null); } }}>查看详情</button>
                </div>
              </div>
            </div>
          )}

          {/* Drawer */}
          {drawerOpen && selectedFormula && (
            <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-lg z-40">
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">{selectedFormula.code} - {selectedFormula.name}</h3>
                  <div className="text-sm text-gray-500">{selectedFormula.type}</div>
                </div>
                <div>
                  <button className="mr-2" onClick={() => setDrawerOpen(false)}>关闭</button>
                </div>
              </div>

              <div className="p-4 overflow-auto h-full">
                <div className="flex space-x-2 mb-4">
                  <button className={`px-3 py-1 rounded ${drawerTab===0? 'bg-primary-500 text-white':'bg-gray-100'}`} onClick={() => setDrawerTab(0)}>基本信息</button>
                  <button className={`px-3 py-1 rounded ${drawerTab===1? 'bg-primary-500 text-white':'bg-gray-100'}`} onClick={() => setDrawerTab(1)}>组分列表</button>
                  <button className={`px-3 py-1 rounded ${drawerTab===2? 'bg-primary-500 text-white':'bg-gray-100'}`} onClick={() => setDrawerTab(2)}>操作步骤</button>
                  <button className={`px-3 py-1 rounded ${drawerTab===3? 'bg-primary-500 text-white':'bg-gray-100'}`} onClick={() => setDrawerTab(3)}>⚗️ 配制计算</button>
                </div>

                {drawerTab===0 && (
                  <div>
                    <div className="text-sm"><strong>编号：</strong>{selectedFormula.code}</div>
                    <div className="text-sm"><strong>名称：</strong>{selectedFormula.name}</div>
                    <div className="text-sm"><strong>类型：</strong>{selectedFormula.type}</div>
                  </div>
                )}

                {drawerTab===1 && (
                  <div>
                    <table className="w-full table-auto border-collapse text-sm">
                      <thead className="bg-gray-100"><tr><th className="p-2">序号</th><th>试剂</th><th>浓度</th><th>单位</th></tr></thead>
                      <tbody>
                        {(selectedFormula.components||[]).map((c:any, i:number)=> (
                          <tr key={i}><td className="p-1">{i+1}</td><td className="p-1">{c.reagent?.name||c.reagentName||c.name}</td><td className="p-1">{formatNumber(c.concentration)}</td><td className="p-1">{c.unit||c.reagent?.defaultUnit||''}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {drawerTab===2 && (
                  <div className="text-sm whitespace-pre-wrap">{selectedFormula.procedure || '无'}</div>
                )}

                {drawerTab===3 && (
                  <div>
                    {/* calculation UI */}
                    <div className="bg-gray-50 p-3 rounded mb-3">
                      <div className="flex items-center space-x-2">
                        <label className="text-sm">目标体积</label>
                        <input type="number" defaultValue={100} id="calc_target" className="border p-1 w-24" />
                        <select defaultValue="mL" id="calc_unit" className="border p-1">
                          <option>mL</option>
                          <option>μL</option>
                          <option>L</option>
                        </select>
                        <label className="text-sm">配制份数</label>
                        <input type="number" defaultValue={1} id="calc_count" className="border p-1 w-20" />
                        <button className="ml-2 btn btn-primary" onClick={() => doCalculate()}>计算</button>
                      </div>
                    </div>

                    <div>
                      {/* results area */}
                      {calcResults.length > 0 ? (
                        <table className="w-full text-sm border-collapse">
                          <thead className="bg-gray-100"><tr><th className="p-2 text-left">试剂名称</th><th className="p-2">储液浓度</th><th className="p-2">储液单位</th><th className="p-2">需要体积</th><th className="p-2">单位</th></tr></thead>
                          <tbody>
                            {calcResults.map((r:any, idx:number) => (
                              <tr key={idx} className={idx%2===0? 'bg-white':'bg-gray-50'}>
                                <td className="p-2">{r.reagentName}</td>
                                <td className="p-2"><input className="border p-1 w-24 text-sm" defaultValue={r.stock} onChange={(e)=>{ const v = Number(e.target.value); setStockConcs(s=> ({...s, [r.reagentId]: v})); }} /></td>
                                <td className="p-2">{r.stockUnit}</td>
                                <td className="p-2 text-center">{r.needed_mL.toFixed(2)}</td>
                                <td className="p-2 text-center">mL</td>
                              </tr>
                            ))}
                            <tr className="font-semibold"><td colSpan={3} className="p-2 text-right">加超纯水至</td><td className="p-2">{ (Number((document.getElementById('calc_target') as HTMLInputElement)?.value || 100)).toFixed(2) }</td><td className="p-2">{ (document.getElementById('calc_unit') as HTMLSelectElement)?.value || 'mL' }</td></tr>
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-sm text-gray-500">点击计算查看结果</div>
                      )}

                      <div className="flex justify-end space-x-2 mt-4">
                        <button onClick={() => copyResults()} className="btn">复制结果</button>
                        <button onClick={() => window.print()} className="btn btn-primary">导出 PDF</button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
