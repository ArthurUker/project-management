import React, { useEffect, useMemo, useState } from 'react';
import { formulaAPI, prepAPI, reagentAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, FlaskConical } from 'lucide-react';

// PCR类配方类型（这些配方使用独立的垂直表格，不合并到化学试剂矩阵）
const PCR_TYPES = ['PCR', 'qPCR', 'RT-PCR', 'RT-qPCR'];

export default function FormulaMatrix(): JSX.Element {
  // Data
  const [allFormulas, setAllFormulas] = useState<any[]>([]);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [reagents, setReagents] = useState<any[]>([]);

  // UI state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [showCalcModal, setShowCalcModal] = useState<boolean>(false);
  const [calcFormulaIds, setCalcFormulaIds] = useState<string[]>([]);
  const [calcModalCategory, setCalcModalCategory] = useState<string>('all');
  const [calcModalSearch, setCalcModalSearch] = useState<string>('');
  const [calcTargetVolume, setCalcTargetVolume] = useState<number>(100);
  const [calcUnit, setCalcUnit] = useState<'mL' | 'L'>('mL');
  const [calcPrepMethods, setCalcPrepMethods] = useState<Array<'powder' | 'stock'>>(['powder']);
  const [calcLoading, setCalcLoading] = useState<boolean>(false);
  const [calcResults, setCalcResults] = useState<any[]>([]);
  const [calcError, setCalcError] = useState<string>('');

  const navigate = useNavigate();

  // Reagent type mapping
  const REAGENT_TYPE_MAP: Record<string, { label: string; color: string; bgColor: string; keys: string[] }> = {
    denaturant: { label: '变性剂',   color: '#d97706', bgColor: '#fef3c7', keys: ['GITC', 'urea', 'guanidine'] },
    detergent:  { label: '去污剂',   color: '#059669', bgColor: '#d1fae5', keys: ['SDS', 'Tween20', 'TritonX100', 'NP40', 'CHAPS'] },
    buffer:     { label: '缓冲体系', color: '#2563eb', bgColor: '#dbeafe', keys: ['Tris', 'HEPES', 'PBS', 'MOPS', 'citrate'] },
    salt:       { label: '盐类',     color: '#7c3aed', bgColor: '#ede9fe', keys: ['NaCl', 'KCl', 'MgCl2', 'CaCl2', 'NH4Cl', 'KH2PO4', 'Na2HPO4'] },
    chelator:   { label: '螯合剂',   color: '#ea580c', bgColor: '#ffedd5', keys: ['EDTA', 'EGTA'] },
    stabilizer: { label: '稳定剂',   color: '#0891b2', bgColor: '#cffafe', keys: ['glycerol', 'BSA', 'DTT', 'betaME', 'sucrose', 'trehalose'] },
    other:      { label: '其他',     color: '#64748b', bgColor: '#f1f5f9', keys: [] },
  };

  // Load data
  const load = async () => {
    try {
      const res = await formulaAPI.list({ type: selectedCategory === 'all' ? '' : selectedCategory, keyword: searchText });
      const base = res.list || [];
      const detailed = await Promise.all(
        base.map(async (f: any) => {
          try {
            const det = await formulaAPI.get(f.id || f.code);
            if (det?.formula) return { ...f, ...det.formula };
            return { ...f, components: det.formula?.components || det.components || [] };
          } catch { return { ...f, components: f.components || [] }; }
        })
      );
      setAllFormulas(detailed);
      setFormulas(detailed);
      const rres = await reagentAPI.list();
      setReagents(rres.list || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, [selectedCategory]);
  useEffect(() => { const t = setTimeout(() => load(), 300); return () => clearTimeout(t); }, [searchText]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(allFormulas.map(f => (f.type || f.category || '').toString()))).filter(Boolean);
    return [{ key: 'all', label: '全部配方' }, ...cats.map(cat => ({ key: cat, label: cat }))];
  }, [allFormulas]);

  const getActiveReagents = (): any[] => {
    // 只取化学试剂配方（排除PCR）来计算矩阵列
    const chemicalForms = (selectedCategory === 'all' ? formulas : formulas.filter(f => (f.type || f.category) === selectedCategory))
      .filter(f => !PCR_TYPES.includes(f.type || f.category));
    const activeIds = new Set<string>();
    chemicalForms.forEach(formula => {
      (formula.components || []).forEach((c: any) => {
        const rid = c.reagentId || c.reagent?.id || c.reagentKey || c.reagent?.key;
        if (rid) activeIds.add(String(rid));
        else {
          const rname = (c.reagent?.name || c.reagentName || c.name || '').toString();
          if (rname) {
            const found = reagents.find(r => (r.name || '').toString().toLowerCase() === rname.toLowerCase() || (r.fullName || '').toString().toLowerCase() === rname.toLowerCase());
            if (found) activeIds.add(String(found.id));
          }
        }
      });
    });
    return reagents.filter(r => activeIds.has(String(r.id)));
  };

  const activeReagents = useMemo(() => getActiveReagents(), [formulas, reagents, selectedCategory]);

  const getGroupedReagents = () => {
    const groups: Array<any> = [];
    const typeOrder = Object.keys(REAGENT_TYPE_MAP);
    const allDefinedKeys = typeOrder.filter(k => k !== 'other').flatMap(k => REAGENT_TYPE_MAP[k].keys.map(s => s.toLowerCase()));
    typeOrder.forEach(typeKey => {
      const typeDef = REAGENT_TYPE_MAP[typeKey];
      let matched: any[] = [];
      if (typeKey === 'other') {
        matched = activeReagents.filter(r => !allDefinedKeys.includes((r.name || '').toLowerCase()));
      } else {
        matched = activeReagents.filter(r => typeDef.keys.map(k => k.toLowerCase()).includes((r.name || '').toLowerCase()));
      }
      if (matched.length > 0) groups.push({ typeKey, label: typeDef.label, color: typeDef.color, bgColor: typeDef.bgColor, reagents: matched, colSpan: matched.length });
    });
    return groups;
  };

  const groupedReagents = useMemo(() => getGroupedReagents(), [activeReagents]);

  // 是否当前选中的是PCR分类
  const isPCRSelected = PCR_TYPES.includes(selectedCategory);

  // 化学试剂配方（排除PCR类型，用于矩阵表格）
  const filteredFormulas = useMemo(() => formulas
    .filter(f => !PCR_TYPES.includes(f.type || f.category))  // 化学配方不含PCR
    .filter(f => selectedCategory === 'all' || (f.type || f.category) === selectedCategory)
    .filter(f => !searchText || (f.code || '').toLowerCase().includes(searchText.toLowerCase()) || (f.name || '').toLowerCase().includes(searchText.toLowerCase()))
  , [formulas, selectedCategory, searchText]);

  // PCR类配方（单独展示）
  const filteredPCRFormulas = useMemo(() => formulas
    .filter(f => PCR_TYPES.includes(f.type || f.category))
    .filter(f => selectedCategory === 'all' || (f.type || f.category) === selectedCategory)
    .filter(f => !searchText || (f.code || '').toLowerCase().includes(searchText.toLowerCase()) || (f.name || '').toLowerCase().includes(searchText.toLowerCase()))
  , [formulas, selectedCategory, searchText]);

  const groupedFormulas = useMemo(() => {
    const cats = categories.filter(c => c.key !== 'all' && !PCR_TYPES.includes(c.key));
    const groups = cats.map(c => ({ category: c.label, items: filteredFormulas.filter(f => (f.type || f.category) === c.key) })).filter(g => g.items.length > 0);
    if (selectedCategory !== 'all' && !isPCRSelected) return groups.filter(g => g.category === selectedCategory);
    return groups;
  }, [categories, filteredFormulas, selectedCategory, isPCRSelected]);

  // PCR配方按类分组
  const groupedPCRFormulas = useMemo(() => {
    const pcrCats = Array.from(new Set(filteredPCRFormulas.map(f => f.type || f.category))).filter(Boolean);
    return pcrCats.map(cat => ({
      category: cat,
      items: filteredPCRFormulas.filter(f => (f.type || f.category) === cat),
    }));
  }, [filteredPCRFormulas]);

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, any>> = {};
    formulas.forEach((f: any) => {
      m[f.id] = {};
      (f.components || []).forEach((c: any) => {
        const key = c.reagentId || c.reagent?.id || c.reagentKey || c.reagent?.key || c.name || c.reagentName;
        if (key) m[f.id][String(key)] = c;
      });
    });
    return m;
  }, [formulas]);

  const formatNumber = (v: any) => {
    if (v == null) return '';
    const n = Number(v);
    if (Number.isNaN(n)) return '';
    return Number.isInteger(n) ? String(n) : String(n);
  };

  const handleOpenCalcModal = () => {
    setShowCalcModal(true);
    setCalcFormulaIds([]);
    setCalcModalCategory('all');
    setCalcModalSearch('');
    setCalcTargetVolume(100);
    setCalcUnit('mL');
    setCalcPrepMethods(['powder']);
    setCalcResults([]);
    setCalcError('');
  };

  const handleCalculate = async () => {
    if (calcFormulaIds.length === 0) {
      setCalcError('请至少选择一个配方');
      return;
    }

    if (!calcTargetVolume || calcTargetVolume <= 0) {
      setCalcError('请输入有效的目标体积');
      return;
    }

    if (calcPrepMethods.length === 0) {
      setCalcError('请至少选择一种配制方法');
      return;
    }

    setCalcLoading(true);
    setCalcError('');
    try {
      const normalizedTargetVolume = calcUnit === 'L' ? calcTargetVolume * 1000 : calcTargetVolume;
      const results = await Promise.all(
        calcFormulaIds.map(fid => prepAPI.calculate({ formulaId: fid, targetVolume: normalizedTargetVolume }))
      );
      const successResults = results.filter(r => r.success);
      if (successResults.length === 0) {
        setCalcError(results[0]?.error || '计算失败，请重试');
      } else {
        setCalcResults(successResults);
      }
    } catch (error: any) {
      setCalcResults([]);
      setCalcError(error?.message ?? error?.error ?? '计算失败，请重试');
    } finally {
      setCalcLoading(false);
    }
  };

  const toggleFormulaSelect = (formulaId: string) => {
    setCalcFormulaIds(prev => 
      prev.includes(formulaId) 
        ? prev.filter(id => id !== formulaId)
        : [...prev, formulaId]
    );
  };

  const togglePrepMethod = (method: 'powder' | 'stock') => {
    setCalcPrepMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  const getPrepMethodLabel = (method: 'powder' | 'stock') => {
    return method === 'powder' ? '干粉/原液' : '母液';
  };

  const getModalFormulas = useMemo(() => {
    return formulas.filter(f => 
      (calcModalCategory === 'all' || (f.type || f.category) === calcModalCategory) &&
      (!calcModalSearch || 
        (f.code || '').toLowerCase().includes(calcModalSearch.toLowerCase()) ||
        (f.name || '').toLowerCase().includes(calcModalSearch.toLowerCase()))
    );
  }, [formulas, calcModalCategory, calcModalSearch]);

  const getAllReagentsFromResults = useMemo(() => {
    const reagentMap = new Map<string, any>();
    calcResults.forEach(result => {
      result.components?.forEach((comp: any) => {
        const key = comp.reagentName;
        if (!reagentMap.has(key)) {
          reagentMap.set(key, comp);
        }
      });
    });
    return Array.from(reagentMap.values());
  }, [calcResults]);

  const calcDisplayRows = useMemo(() => {
    return calcResults.flatMap((result: any) =>
      calcPrepMethods.map((method) => ({ result, method }))
    );
  }, [calcResults, calcPrepMethods]);

  const handleExportExcel = () => {
    if (calcDisplayRows.length === 0) return;

    const headers = ['配方', '配制方法', ...getAllReagentsFromResults.map((r: any) => r.reagentName)];
    const rows = calcDisplayRows.map(({ result, method }: any) => {
      const row: string[] = [
        `${result.formulaCode} ${result.formulaName || ''}`.trim(),
        getPrepMethodLabel(method),
      ];

      getAllReagentsFromResults.forEach((allComp: any) => {
        const comp = result.components?.find((c: any) => c.reagentName === allComp.reagentName);
        if (!comp) {
          row.push('—');
          return;
        }

        if (method === 'powder') {
          const extra = comp.molecularWeight ? `, MW:${formatNumber(comp.molecularWeight)}` : '';
          row.push(`${comp.powderDisplay || 'N/A'}${extra}`);
        } else {
          const conc = comp.stockConc != null && comp.stockUnit ? `, 浓度:${formatNumber(comp.stockConc)} ${comp.stockUnit}` : '';
          const warn = comp.stockWarning ? `, 警告:${comp.stockWarning}` : '';
          row.push(`${comp.stockDisplay || 'N/A'}${conc}${warn}`);
        }
      });

      return row;
    });

    const escapeCsv = (value: string) => {
      const safe = String(value ?? '');
      if (safe.includes('"') || safe.includes(',') || safe.includes('\n')) {
        return `"${safe.replace(/"/g, '""')}"`;
      }
      return safe;
    };

    const csv = [headers, ...rows].map((line) => line.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.href = url;
    link.download = `配制计算-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Row heights for sticky offset calculation
  const GROUP_ROW_H = 38; // px — first thead row (type group labels)

  return (
    /*
     * PAGE ROOT: flex column, overflow hidden
     * — do NOT use overflowY:auto here; the table has its own scroll container.
     * — Title row + filter card are fixed-height; table section fills remaining space.
     */
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ══ 标题行 ══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="text-2xl font-display font-bold text-gray-900">试剂配方</h1>
          <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 10px', borderRadius: '20px', fontWeight: 500 }}>{filteredFormulas.length + filteredPCRFormulas.length} 条配方</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleOpenCalcModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
          ><FlaskConical size={14} /> 配制计算</button>
          <button
            onClick={() => navigate('/reagent-formula/new')}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          ><Plus size={14} /> 新建配方</button>
        </div>
      </div>

      {/* ══ 筛选区（固定高度，不随表格滚动） ══ */}
      <div className="card p-3 mb-4" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 全部 */}
            <button
              key="all"
              onClick={() => setSelectedCategory('all')}
              style={{
                padding: '5px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 500,
                cursor: 'pointer', border: 'none', transition: 'all .15s',
                background: selectedCategory === 'all' ? '#eff6ff' : '#f3f4f6',
                color: selectedCategory === 'all' ? '#2563eb' : '#6b7280',
                outline: selectedCategory === 'all' ? '1.5px solid #bfdbfe' : 'none',
              }}
            >全部配方</button>
            {/* 化学试剂分类 */}
            {categories.filter(c => c.key !== 'all' && !PCR_TYPES.includes(c.key)).map(c => (
              <button
                key={c.key}
                onClick={() => setSelectedCategory(c.key)}
                style={{
                  padding: '5px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', border: 'none', transition: 'all .15s',
                  background: selectedCategory === c.key ? '#eff6ff' : '#f3f4f6',
                  color: selectedCategory === c.key ? '#2563eb' : '#6b7280',
                  outline: selectedCategory === c.key ? '1.5px solid #bfdbfe' : 'none',
                }}
              >{c.label}</button>
            ))}
            {/* 分隔线 + PCR分类 */}
            {categories.some(c => PCR_TYPES.includes(c.key)) && (
              <>
                <div style={{ width: 1, height: 22, background: '#d1d5db', margin: '0 4px' }} />
                <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 2 }}>扩增体系</span>
                {categories.filter(c => PCR_TYPES.includes(c.key)).map(c => (
                  <button
                    key={c.key}
                    onClick={() => setSelectedCategory(c.key)}
                    style={{
                      padding: '5px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 500,
                      cursor: 'pointer', border: 'none', transition: 'all .15s',
                      background: selectedCategory === c.key ? '#fef3c7' : '#f3f4f6',
                      color: selectedCategory === c.key ? '#d97706' : '#6b7280',
                      outline: selectedCategory === c.key ? '1.5px solid #fcd34d' : 'none',
                    }}
                  >{c.label}</button>
                ))}
              </>
            )}
          </div>
          <div style={{ width: '1px', height: '26px', background: '#e5e7eb', flexShrink: 0 }} />
          {/* Search */}
          <div style={{ position: 'relative', minWidth: '220px' }}>
            <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} size={14} />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="搜索编号或名称..."
              style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>共 {filteredFormulas.length + filteredPCRFormulas.length} 条</span>
        </div>
      </div>

      {/* ══ PCR扩增体系专用视图 ══ */}
      {isPCRSelected && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 16 }}>
          {groupedPCRFormulas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
              <div style={{ fontSize: 18, marginBottom: 8 }}>暂无{selectedCategory}配方数据</div>
              <a onClick={() => navigate('/reagent-formula/new')} style={{ color: '#3b82f6', cursor: 'pointer', fontSize: 14 }}>+ 创建第一个配方</a>
            </div>
          ) : (
            groupedPCRFormulas.flatMap(g => g.items).map(f => {
              const comps: any[] = f.components || [];
              const totalVol = comps.reduce((s: number, c: any) => s + (Number(c.concentration) || 0), 0);
              return (
                <div key={f.id} className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', fontFamily: 'monospace' }}>{f.code}</span>
                      <span style={{ fontSize: 14, color: '#374151', marginLeft: 10 }}>{f.name}</span>
                      {f.notes && <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>{f.notes}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => navigate(`/reagent-formula/${f.id}/edit`)} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', background: '#fff', color: '#374151', fontSize: 12 }}>编辑</button>
                    </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#fef3c7' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#92400e', border: '1px solid #fde68a', width: 40 }}>#</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#92400e', border: '1px solid #fde68a' }}>组分</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#92400e', border: '1px solid #fde68a', width: 160 }}>终浓度</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#92400e', border: '1px solid #fde68a', width: 130 }}>加样量 (μL)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#92400e', border: '1px solid #fde68a', width: 150 }}>备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comps.map((c: any, idx: number) => {
                        const name = c.componentName || c.reagentMaterial?.commonName || c.reagentMaterial?.name || c.reagent?.name || c.reagentName || '';
                        const finalConc = c.notes || '';
                        return (
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                            <td style={{ padding: '7px 12px', color: '#94a3b8', fontSize: 12, borderRight: '1px solid #fde68a', textAlign: 'center' }}>{idx + 1}</td>
                            <td style={{ padding: '7px 12px', color: '#1e293b', fontWeight: 500, borderRight: '1px solid #fde68a' }}>{name}</td>
                            <td style={{ padding: '7px 12px', color: '#374151', textAlign: 'center', borderRight: '1px solid #fde68a' }}>{finalConc}</td>
                            <td style={{ padding: '7px 12px', color: '#1e40af', fontWeight: 600, textAlign: 'center', borderRight: '1px solid #fde68a' }}>{c.concentration != null ? c.concentration : ''}</td>
                            <td style={{ padding: '7px 12px', color: '#64748b', fontSize: 12 }}></td>
                          </tr>
                        );
                      })}
                      {/* 合计行 */}
                      <tr style={{ background: '#fef9c3', borderTop: '2px solid #f59e0b' }}>
                        <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#92400e', fontSize: 13 }}>合计</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#dc2626', fontSize: 13 }}>{totalVol.toFixed(1)}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 12 }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ══ 矩阵表格区（化学试剂配方，flex:1 撑满剩余高度） ══ */}
      {!isPCRSelected && (
      <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
          <style>{`
            .frow:hover td { background-color: #eff6ff !important; transition: background-color .12s; }
            .frow:hover .fcol-sticky { background-color: #eff6ff !important; }
            .frow-odd td { background-color: #ffffff; }
            .frow-even td { background-color: #f8fafc; }
            .frow-odd .fcol-sticky { background-color: #ffffff !important; }
            .frow-even .fcol-sticky { background-color: #f8fafc !important; }
          `}</style>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              {/*
               * ── 第1行：试剂分组标题（粘性固定 top:0）──
               * 这一行是"试剂信息栏"的顶层，滚动时始终冻结在表格顶部
               */}
              <tr>
                <th rowSpan={2} style={{
                  position: 'sticky', top: 0, left: 0, zIndex: 25,
                  width: 150, minWidth: 150,
                  background: '#f8fafc', borderRight: '2px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
                  boxShadow: '2px 0 6px rgba(0,0,0,.04)',
                  fontSize: 12, fontWeight: 700, color: '#475569', padding: '10px 14px',
                  textAlign: 'left', verticalAlign: 'middle',
                }}>
                  编号 / 名称
                </th>
                {groupedReagents.map(g => (
                  <th key={g.typeKey} colSpan={g.colSpan} style={{
                    position: 'sticky', top: 0, zIndex: 20,
                    background: g.bgColor,
                    borderBottom: '1px solid rgba(0,0,0,.06)', borderRight: '1px solid rgba(0,0,0,.06)',
                    fontSize: 12, fontWeight: 700, color: g.color,
                    padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
                      {g.label}
                    </span>
                  </th>
                ))}
              </tr>
              {/*
               * ── 第2行：具体试剂名称（粘性固定 top: GROUP_ROW_H）──
               * 紧贴第1行下方固定，两行合为完整的"试剂信息栏"
               */}
              <tr>
                {groupedReagents.flatMap((g: any) => g.reagents).map((r: any) => (
                  <th key={r.id} style={{
                    position: 'sticky', top: GROUP_ROW_H, zIndex: 20,
                    background: '#fff',
                    borderBottom: '2px solid #e2e8f0', borderRight: '1px solid rgba(0,0,0,.06)',
                    fontSize: 11, fontWeight: 600, color: '#374151',
                    padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle',
                    whiteSpace: 'nowrap', minWidth: 64,
                  }}>
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {groupedFormulas.map(g => (
                <React.Fragment key={g.category}>
                  {/* Category separator row */}
                  <tr style={{ background: 'linear-gradient(90deg,#eff6ff 0%,#f8fafc 100%)', borderTop: '2px solid #bfdbfe', borderBottom: '1px solid #e2e8f0' }}>
                    <td colSpan={1 + activeReagents.length} style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
                      ▼ {g.category}
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', background: '#e2e8f0', borderRadius: 10, padding: '1px 7px' }}>{g.items.length} 条</span>
                    </td>
                  </tr>
                  {g.items.map((f: any, idx: number) => (
                    <tr key={f.id} className={`frow ${idx % 2 === 0 ? 'frow-odd' : 'frow-even'}`} style={{ height: 36 }}>
                      <td className="fcol-sticky" style={{
                        position: 'sticky', left: 0, zIndex: 5,
                        borderRight: '2px solid #e2e8f0', boxShadow: '2px 0 6px rgba(0,0,0,.03)',
                        padding: '4px 14px', verticalAlign: 'middle',
                      }}>
                        <div style={{ color: '#3b82f6', fontWeight: 600, fontSize: 12, lineHeight: 1.3 }}>{f.code}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>{f.name}</div>
                      </td>
                      {groupedReagents.flatMap((g2: any) => g2.reagents).map((col: any) => {
                        const comp = matrix[f.id] && (matrix[f.id][String(col.id)] || matrix[f.id][String(col.name)]);
                        return (
                          <td key={col.id} style={{ fontSize: 12, color: '#374151', textAlign: 'center', padding: '4px 8px', verticalAlign: 'middle', borderRight: '1px solid #f1f5f9' }}>
                            {comp ? formatNumber(comp.concentration ?? comp.value ?? comp.amount ?? comp.rawValue) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}

              {groupedFormulas.length === 0 && (
                <tr>
                  <td colSpan={1 + activeReagents.length} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: 20, marginBottom: 8 }}>暂无化学试剂配方数据</div>
                    <a onClick={() => navigate('/reagent-formula/new')} style={{ color: '#3b82f6', cursor: 'pointer', fontSize: 14 }}>+ 创建第一个配方</a>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 全部配方视图下，化学矩阵下方追加PCR配方摘要 */}
      {!isPCRSelected && selectedCategory === 'all' && filteredPCRFormulas.length > 0 && (
        <div style={{ flexShrink: 0, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            扩增反应体系（{filteredPCRFormulas.length} 条，点击分类标签查看详情）
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {filteredPCRFormulas.map(f => (
              <div key={f.id}
                onClick={() => { setSelectedCategory(f.type || f.category); }}
                style={{ padding: '8px 14px', border: '1px solid #fde68a', borderRadius: 8, background: '#fffbeb', cursor: 'pointer', fontSize: 13 }}
              >
                <span style={{ fontWeight: 600, color: '#1e40af', fontFamily: 'monospace' }}>{f.code}</span>
                <span style={{ marginLeft: 6, color: '#374151' }}>{f.name}</span>
                <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706', background: '#fef3c7', padding: '1px 6px', borderRadius: 8 }}>{f.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ 配制计算弹窗 ══ */}
      {showCalcModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)', zIndex: 999 }} onClick={() => setShowCalcModal(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.15)', width: 'min(95vw, 1400px)', height: 'min(90vh, 800px)', zIndex: 1000, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FlaskConical size={18} color="#764ba2" /> 配制计算
              </div>
              <button onClick={() => setShowCalcModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 18 }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* ── 配方选择区 ── */}
              <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>选择配方（可多选）</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {categories.map(cat => (
                      <button
                        key={cat.key}
                        onClick={() => setCalcModalCategory(cat.key)}
                        style={{
                          padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                          cursor: 'pointer', border: 'none', transition: 'all .15s',
                          background: calcModalCategory === cat.key ? '#3b82f6' : '#e5e7eb',
                          color: calcModalCategory === cat.key ? '#fff' : '#374151',
                        }}
                      >{cat.label}</button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="搜索配方编号或名称..."
                    value={calcModalSearch}
                    onChange={(e) => setCalcModalSearch(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 180, overflowY: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 0 }}>
                    {getModalFormulas.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', gridColumn: '1/-1' }}>暂无配方</div>
                    ) : (
                      getModalFormulas.map(f => (
                        <label key={f.id} style={{ padding: '10px 12px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: calcFormulaIds.includes(f.id) ? '#eff6ff' : '#fff' }}>
                          <input
                            type="checkbox"
                            checked={calcFormulaIds.includes(f.id)}
                            onChange={() => toggleFormulaSelect(f.id)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 12, color: '#374151' }}>
                            <div style={{ fontWeight: 600, color: '#1e40af' }}>{f.code}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{f.name}</div>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* ── 计算参数 ── */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>目标体积</label>
                  <input
                    type="number"
                    min={0}
                    value={calcTargetVolume}
                    onChange={(e) => setCalcTargetVolume(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ width: 100 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>单位</label>
                  <select
                    value={calcUnit}
                    onChange={(e) => setCalcUnit(e.target.value as 'mL' | 'L')}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#f9fafb', outline: 'none' }}
                  >
                    <option>mL</option><option>L</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>配制方法</label>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, background: calcPrepMethods.includes('powder') ? '#dbeafe' : '#f3f4f6' }}>
                    <input
                      type="checkbox"
                      value="powder"
                      checked={calcPrepMethods.includes('powder')}
                      onChange={() => togglePrepMethod('powder')}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>干粉/原液</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, background: calcPrepMethods.includes('stock') ? '#dbeafe' : '#f3f4f6' }}>
                    <input
                      type="checkbox"
                      value="stock"
                      checked={calcPrepMethods.includes('stock')}
                      onChange={() => togglePrepMethod('stock')}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>母液</span>
                  </label>
                </div>
                <button
                  onClick={handleCalculate}
                  disabled={calcLoading || calcFormulaIds.length === 0}
                  style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: calcLoading ? 'wait' : 'pointer', opacity: calcLoading || calcFormulaIds.length === 0 ? 0.7 : 1, whiteSpace: 'nowrap' }}
                >
                  {calcLoading ? '计算中...' : '开始计算'}
                </button>
              </div>

              {/* ── 错误提示 ── */}
              {calcError && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
                  {calcError}
                </div>
              )}

              {/* ── 结果表格（配方行 × 试剂列） ── */}
              {calcResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={handleExportExcel}
                      style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      导出Excel
                    </button>
                  </div>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto', minHeight: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '100%' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569', fontSize: 12, fontWeight: 600, position: 'sticky', top: 0, zIndex: 10 }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', borderRight: '1px solid #e5e7eb', minWidth: 150, maxWidth: 150 }}>配方</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', borderRight: '1px solid #e5e7eb', minWidth: 100 }}>配制方法</th>
                          {getAllReagentsFromResults.map((comp: any) => (
                            <th key={`${comp.reagentName}`} style={{ padding: '10px 12px', textAlign: 'center', borderRight: '1px solid #e5e7eb', minWidth: 180 }}>
                              <div style={{ fontWeight: 600, color: '#1e40af' }}>{comp.reagentName}</div>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{formatNumber(comp.concentration)} {comp.concUnit}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {calcDisplayRows.map(({ result, method }: any, idx: number) => (
                          <tr key={`${result.formulaCode}-${method}`} style={{ borderTop: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ padding: '10px 12px', borderRight: '1px solid #e5e7eb', position: 'sticky', left: 0, zIndex: 5, background: idx % 2 === 0 ? '#fff' : '#f8fafc', minWidth: 150, maxWidth: 150 }}>
                              <div style={{ fontWeight: 600, color: '#1e40af', fontSize: 12 }}>{result.formulaCode}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{result.formulaName}</div>
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>({result.targetVolume} mL)</div>
                            </td>
                            <td style={{ padding: '10px 12px', borderRight: '1px solid #e5e7eb', textAlign: 'center', fontSize: 12, fontWeight: 500, color: '#1e40af', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              {getPrepMethodLabel(method)}
                            </td>
                            {getAllReagentsFromResults.map((allComp: any) => {
                              const comp = result.components?.find((c: any) => c.reagentName === allComp.reagentName);
                              const displayValue = method === 'powder' ? comp?.powderDisplay : comp?.stockDisplay;
                              return (
                                <td key={`${result.formulaCode}-${allComp.reagentName}`} style={{ padding: '10px 12px', borderRight: '1px solid #e5e7eb', textAlign: 'center', fontSize: 12, color: '#334155' }}>
                                  {comp ? (
                                    <>
                                      <div style={{ marginBottom: 4 }}>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{displayValue || 'N/A'}</div>
                                        {method === 'powder' && comp.molecularWeight && (
                                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>MW: {formatNumber(comp.molecularWeight)}</div>
                                        )}
                                        {method === 'stock' && comp.stockConc != null && comp.stockUnit && (
                                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>浓度: {formatNumber(comp.stockConc)} {comp.stockUnit}</div>
                                        )}
                                      </div>
                                      {method === 'stock' && comp.stockWarning && (
                                        <div style={{ fontSize: 10, color: '#b45309', marginTop: 3, fontStyle: 'italic' }}>⚠️ {comp.stockWarning}</div>
                                      )}
                                    </>
                                  ) : (
                                    <div style={{ fontSize: 11, color: '#d1d5db' }}>—</div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {calcResults.some((r: any) => r.missingMW?.length > 0) && (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fffbeb', color: '#92400e', fontSize: 12 }}>
                      ⚠️ 部分试剂缺少分子量数据: {Array.from(new Set(calcResults.flatMap((r: any) => r.missingMW || []))).join('、')}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                    <strong>说明：</strong><br/>
                    • 干粉/原液：当终浓度为 M/mM 时，按分子量与纯度计算干粉克数；当为 % 时，按质量体积比计算。<br/>
                    • 母液：若试剂维护了母液浓度且单位兼容，按稀释比例计算所需母液体积。若不可稀释会显示警告。
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

