import React, { useEffect, useMemo, useState } from 'react';
import { formulaAPI, reagentAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, FlaskConical } from 'lucide-react';

export default function FormulaMatrix(): JSX.Element {
  // Data
  const [allFormulas, setAllFormulas] = useState<any[]>([]);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [reagents, setReagents] = useState<any[]>([]);

  // UI state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [showCalcModal, setShowCalcModal] = useState<boolean>(false);

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
    const filtered = selectedCategory === 'all' ? formulas : formulas.filter(f => (f.type || f.category) === selectedCategory);
    const activeIds = new Set<string>();
    filtered.forEach(formula => {
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

  const filteredFormulas = useMemo(() => formulas
    .filter(f => selectedCategory === 'all' || (f.type || f.category) === selectedCategory)
    .filter(f => !searchText || (f.code || '').toLowerCase().includes(searchText.toLowerCase()) || (f.name || '').toLowerCase().includes(searchText.toLowerCase()))
  , [formulas, selectedCategory, searchText]);

  const groupedFormulas = useMemo(() => {
    const cats = categories.filter(c => c.key !== 'all');
    const groups = cats.map(c => ({ category: c.label, items: filteredFormulas.filter(f => (f.type || f.category) === c.key) })).filter(g => g.items.length > 0);
    if (selectedCategory !== 'all') return groups.filter(g => g.category === selectedCategory);
    return groups;
  }, [categories, filteredFormulas, selectedCategory]);

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
          <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 10px', borderRadius: '20px', fontWeight: 500 }}>{filteredFormulas.length} 条配方</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowCalcModal(true)}
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
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {categories.map(c => (
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
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>共 {filteredFormulas.length} 条</span>
        </div>
      </div>

      {/*
       * ══ 矩阵表格区（flex:1 撑满剩余高度，内部 overflow:auto 产生滚动）══
       *
       * 关键：试剂信息栏（分组行 + 试剂名称行）位于 <thead> 内，
       * 使用 position:sticky，仅在此滚动容器内固定。
       * 无论下方配方行多少，顶部试剂信息栏始终可见，不会被遮盖。
       */}
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
                    <div style={{ fontSize: 20, marginBottom: 8 }}>暂无配方数据</div>
                    <a onClick={() => navigate('/reagent-formula/new')} style={{ color: '#3b82f6', cursor: 'pointer', fontSize: 14 }}>+ 创建第一个配方</a>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ 配制计算弹窗 ══ */}
      {showCalcModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)', zIndex: 999 }} onClick={() => setShowCalcModal(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.15)', width: 520, maxWidth: '90vw', zIndex: 1000, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FlaskConical size={18} color="#764ba2" /> 配制计算
              </div>
              <button onClick={() => setShowCalcModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>选择配方</label>
                <select style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, color: '#374151', background: '#f9fafb', outline: 'none' }}>
                  <option value="">-- 选择配方 --</option>
                  {formulas.map(f => <option key={f.id} value={f.id}>{f.code} - {f.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>目标体积</label>
                  <input defaultValue={100} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ paddingTop: 24 }}>
                  <select defaultValue="mL" style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#f9fafb', outline: 'none' }}>
                    <option>mL</option><option>L</option>
                  </select>
                </div>
                <div style={{ paddingTop: 24 }}>
                  <button style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>计算</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
