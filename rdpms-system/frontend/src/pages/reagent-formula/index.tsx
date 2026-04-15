import React, { useEffect, useMemo, useState } from 'react';
import { formulaAPI, reagentAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';

export default function FormulaMatrix(): JSX.Element {
  // Data
  const [allFormulas, setAllFormulas] = useState<any[]>([]);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [reagents, setReagents] = useState<any[]>([]);

  // UI state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [showCalcModal, setShowCalcModal] = useState<boolean>(false);

  const navigate = useNavigate();

  // Reagent type mapping (constant, adjust keys to match DB)
  const REAGENT_TYPE_MAP: Record<string, { label: string; color: string; bgColor: string; keys: string[] }> = {
    denaturant: { label: '变性剂', color: '#d97706', bgColor: 'rgba(254,243,199,0.75)', keys: ['GITC', 'urea', 'guanidine'] },
    detergent: { label: '去污剂', color: '#059669', bgColor: 'rgba(209,250,229,0.75)', keys: ['SDS', 'Tween20', 'TritonX100', 'NP40', 'CHAPS'] },
    buffer: { label: '缓冲体系', color: '#2563eb', bgColor: 'rgba(219,234,254,0.75)', keys: ['Tris', 'HEPES', 'PBS', 'MOPS', 'citrate'] },
    salt: { label: '盐类', color: '#7c3aed', bgColor: 'rgba(237,233,254,0.75)', keys: ['NaCl', 'KCl', 'MgCl2', 'CaCl2', 'NH4Cl', 'KH2PO4', 'Na2HPO4'] },
    chelator: { label: '螯合剂', color: '#ea580c', bgColor: 'rgba(255,237,213,0.75)', keys: ['EDTA', 'EGTA'] },
    stabilizer: { label: '稳定剂', color: '#0891b2', bgColor: 'rgba(207,250,254,0.75)', keys: ['glycerol', 'BSA', 'DTT', 'betaME', 'sucrose', 'trehalose'] },
    other: { label: '其他', color: '#64748b', bgColor: 'rgba(241,245,249,0.75)', keys: [] },
  };

  // Load data
  const load = async () => {
    try {
      const res = await formulaAPI.list({ type: selectedCategory === 'all' ? '' : selectedCategory, keyword: searchText });
      const base = res.list || [];
      // fetch details for each formula (to ensure components present)
      const detailed = await Promise.all(
        base.map(async (f: any) => {
          try {
            const det = await formulaAPI.get(f.id || f.code);
            // API returns { formula: { ... } } on get
            if (det?.formula) return { ...f, ...det.formula };
            return { ...f, components: det.formula?.components || det.components || [] };
          } catch (e) {
            return { ...f, components: f.components || [] };
          }
        })
      );
      // BUG FIX: keep a full copy of fetched formulas for categories
      setAllFormulas(detailed);
      setFormulas(detailed);

      const rres = await reagentAPI.list();
      setReagents(rres.list || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, [selectedCategory]);
  useEffect(() => { const t = setTimeout(() => load(), 300); return () => clearTimeout(t); }, [searchText]);

  // categories derived from the full allFormulas list (fixes disappearing tags)
  const categories = useMemo(() => {
    const cats = Array.from(new Set(allFormulas.map(f => (f.type || f.category || '').toString()))).filter(Boolean);
    return [{ key: 'all', label: '全部配方' }, ...cats.map(cat => ({ key: cat, label: cat }))];
  }, [allFormulas]);

  // get active reagents per spec — robustly match by reagentId or reagent name in components
  const getActiveReagents = (): any[] => {
    const filtered = selectedCategory === 'all' ? formulas : formulas.filter(f => (f.type || f.category) === selectedCategory);
    const activeIds = new Set<string>();

    filtered.forEach(formula => {
      (formula.components || []).forEach((c: any) => {
        // possible shapes: { reagentId }, { reagent: { id, name } }, { name, value }
        const rid = c.reagentId || c.reagent?.id || c.reagentKey || c.reagent?.key;
        if (rid) activeIds.add(String(rid));
        else {
          const rname = (c.reagent?.name || c.reagentName || c.name || '').toString();
          if (rname) {
            // find reagent by name (case-insensitive)
            const found = reagents.find(r => (r.name || '').toString().toLowerCase() === rname.toLowerCase() || (r.fullName || '').toString().toLowerCase() === rname.toLowerCase());
            if (found) activeIds.add(String(found.id));
          }
        }
      });
    });

    // return reagents that are active (keep original order)
    return reagents.filter(r => activeIds.has(String(r.id)));
  };

  const activeReagents = useMemo(() => getActiveReagents(), [formulas, reagents, selectedCategory]);

  // grouping active reagents by REAGENT_TYPE_MAP (match by reagent.name)
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
      if (matched.length > 0) {
        groups.push({ typeKey, label: typeDef.label, color: typeDef.color, bgColor: typeDef.bgColor, reagents: matched, colSpan: matched.length });
      }
    });
    return groups;
  };

  const groupedReagents = useMemo(() => getGroupedReagents(), [activeReagents]);

  // Filtered formulas for tbody (use f.type)
  const filteredFormulas = useMemo(() => formulas
    .filter(f => selectedCategory === 'all' || (f.type || f.category) === selectedCategory)
    .filter(f => !searchText || (f.code || '').toLowerCase().includes(searchText.toLowerCase()) || (f.name || '').toLowerCase().includes(searchText.toLowerCase()))
  , [formulas, selectedCategory, searchText]);

  // grouped formulas for rendering by category
  const groupedFormulas = useMemo(() => {
    const cats = categories.filter(c => c.key !== 'all');
    const groups = cats.map(c => ({ category: c.label, items: filteredFormulas.filter(f => (f.type || f.category) === c.key) })).filter(g => g.items.length > 0);
    if (selectedCategory !== 'all') return groups.filter(g => g.category === selectedCategory);
    return groups;
  }, [categories, filteredFormulas, selectedCategory]);

  // matrix lookup for component concentrations (index by reagent id or name)
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

  // Styles (kept inline per spec)
  const outerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', overflow: 'hidden', boxSizing: 'border-box', padding: '16px 24px', gap: 0 };

  const topBarStyle: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 30, width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', borderRadius: '12px 12px 0 0', border: '1px solid rgba(0,0,0,0.08)', borderBottom: 'none', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', overflow: 'hidden'
  };

  const opRowStyle: React.CSSProperties = { padding: '10px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };

  const tableWrapStyle: React.CSSProperties = { flex: 1, overflowX: 'auto', overflowY: 'auto', width: '100%', boxSizing: 'border-box', borderRadius: '0 0 12px 12px', border: '1px solid rgba(0,0,0,0.08)', borderTop: 'none' };

  // compute header heights for sticky offsets (approx)
  const headerRowHeight = 36; // 第3行高度约 36px

  // Table hover CSS injected locally
  const tableStyle = `
    .formula-row:hover td {
      background-color: #eff6ff !important;
      transition: background-color 0.12s ease;
    }
    .formula-row-odd td {
      background-color: #ffffff;
    }
    .formula-row-even td {
      background-color: #f8fafc;
    }
    .formula-row-odd .col-sticky {
      background-color: #ffffff !important;
    }
    .formula-row-even .col-sticky {
      background-color: #f8fafc !important;
    }
    .formula-row:hover .col-sticky {
      background-color: #eff6ff !important;
    }
  `;

  console.log('formulas:', formulas);
  console.log('reagents:', reagents);
  console.log('activeReagents:', activeReagents);

  return (
    <div style={outerStyle}>
      <style>{tableStyle}</style>

      {/* A. Top operation bar (row1 + row2) */}
      <div style={topBarStyle}>
        {/* Row1: categories and collapse */}
        <div style={opRowStyle}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
            {categories.map(c => (
              <div key={c.key} onClick={() => setSelectedCategory(c.key)} style={{ fontSize: 13, color: selectedCategory === c.key ? '#3b82f6' : '#64748b', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', background: selectedCategory === c.key ? '#eff6ff' : 'transparent', border: selectedCategory === c.key ? '1px solid #bfdbfe' : '1px solid transparent', whiteSpace: 'nowrap', transition: 'all 0.15s ease' }}>
                {c.label}
              </div>
            ))}
          </div>
          <div onClick={() => setIsCollapsed(s => !s)} style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isCollapsed ? <><ChevronDown size={14} /> 展开</> : <><ChevronUp size={14} /> 收起</>}
          </div>
        </div>

        {/* Row2: search + buttons (collapsible) */}
        <div style={{ overflow: 'hidden', maxHeight: isCollapsed ? '0px' : '52px', opacity: isCollapsed ? 0 : 1, transition: 'max-height 0.25s ease, opacity 0.2s ease' }}>
          <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', width: 260 }}>
                <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}><Search size={14} /></div>
                <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="搜索编号或名称..." style={{ width: '100%', padding: '6px 10px 6px 36px', borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCalcModal(true)} style={{ background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FlaskConical size={14} /> 配制计算
              </button>
              <button onClick={() => navigate('/reagent-formula/new')} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> 新建配方
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* B. Table scroll container (thead rows 3+4 inside real thead) */}
      <div style={tableWrapStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {/* first column header (rowSpan=2) */}
              <th rowSpan={2} style={{ position: 'sticky', top: 0, left: 0, zIndex: 25, width: 140, minWidth: 140, background: 'rgba(248,250,252,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRight: '2px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', boxShadow: '2px 0 6px rgba(0,0,0,0.04)', fontSize: 12, fontWeight: 600, color: '#475569', padding: '8px 12px', textAlign: 'left', verticalAlign: 'middle' }}>
                编号 / 名称
              </th>

              {/* group headers (第3行) */}
              {groupedReagents.map(g => (
                <th key={g.typeKey} colSpan={g.colSpan} style={{ position: 'sticky', top: 0, zIndex: 20, background: g.bgColor, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.06)', borderRight: '1px solid rgba(0,0,0,0.06)', fontSize: 12, fontWeight: 600, color: g.color, padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, display: 'inline-block' }} />
                    <span>{g.label}</span>
                  </span>
                </th>
              ))}
            </tr>

            {/* 第4行：具体试剂列 */}
            <tr>
              {groupedReagents.flatMap((g: any) => g.reagents).map((r: any) => (
                <th key={r.id} style={{ position: 'sticky', top: `${headerRowHeight}px`, zIndex: 20, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid rgba(0,0,0,0.06)', fontSize: 11, fontWeight: 600, color: '#374151', padding: '5px 8px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', minWidth: 60 }}>
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* grouped formula rows */}
            {groupedFormulas.map(g => (
              <React.Fragment key={g.category}>
                <tr style={{ background: 'linear-gradient(90deg,#eff6ff 0%,#f8fafc 100%)', borderTop: '2px solid #bfdbfe', borderBottom: '1px solid #e2e8f0' }}>
                  <td colSpan={1 + activeReagents.length} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#1e40af' }}>▼ {g.category} <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', background: '#e2e8f0', borderRadius: 10, padding: '1px 7px' }}>{g.items.length} 条</span></td>
                </tr>

                {g.items.map((f: any, idx: number) => (
                  <tr
                    key={f.id}
                    className={`formula-row ${idx % 2 === 0 ? 'formula-row-odd' : 'formula-row-even'}`}
                    style={{ height: 36, transition: 'background 0.12s' }}
                  >
                    <td className="col-sticky" style={{ position: 'sticky', left: 0, zIndex: 5, borderRight: '2px solid #e2e8f0', boxShadow: '2px 0 6px rgba(0,0,0,0.03)', padding: '4px 12px', verticalAlign: 'middle' }}>
                      <div style={{ color: '#3b82f6', fontWeight: 500, fontSize: 12 }}>{f.code}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.name}</div>
                    </td>

                    {groupedReagents.flatMap((g2: any) => g2.reagents).map((col: any) => {
                      // lookup by reagent id first, then fallback to name
                      const comp = matrix[f.id] && (matrix[f.id][String(col.id)] || matrix[f.id][String(col.name)]);
                      const grp = groupedReagents.find((gr: any) => gr.reagents.some((rr: any) => rr.id === col.id));
                      // NOTE: per design, data rows should not carry header band backgrounds; remove td background here
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

            {/* empty state */}
            {groupedFormulas.length === 0 && (
              <tr>
                <td colSpan={1 + activeReagents.length} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: 24 }}>暂无文档</div>
                  <div style={{ marginTop: 8 }}><a onClick={() => navigate('/reagent-formula/new')} style={{ color: '#3b82f6', cursor: 'pointer' }}>创建第一个配方</a></div>
                </td>
              </tr>
            )}

          </tbody>
        </table>
      </div>

      {/* 配制计算弹窗 (简化) */}
      {showCalcModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', zIndex: 999 }} onClick={() => setShowCalcModal(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '28px 32px', width: 520, maxWidth: '90vw', zIndex: 1000 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>⚗️ 配制计算</div>
              <button onClick={() => setShowCalcModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>关闭</button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <label>选择配方</label>
                <select style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <option value="">-- 选择配方 --</option>
                  {formulas.map(f => <option key={f.id} value={f.id}>{f.code} - {f.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input defaultValue={100} style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', width: 120 }} />
                <select defaultValue="mL" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <option>mL</option>
                  <option>L</option>
                </select>
                <button style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px' }}>计算</button>
              </div>

            </div>

          </div>
        </>
      )}

    </div>
  );
}
