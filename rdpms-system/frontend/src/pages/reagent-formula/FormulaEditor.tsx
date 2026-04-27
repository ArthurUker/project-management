import { useEffect, useState } from 'react';
import { formulaAPI, reagentMaterialsAPI } from '../../api/client';
import { useNavigate, useParams } from 'react-router-dom';

const PCR_TYPES = ['PCR', 'qPCR', 'RT-PCR', 'RT-qPCR'];

// 标准25μL PCR反应体系模板
const PCR_DEFAULT_COMPONENTS = [
  { componentName: '10× PCR Buffer', concentration: 2.5, unit: 'μL', notes: '1×', sortOrder: 0 },
  { componentName: 'dNTP Mix（10mM each）', concentration: 0.5, unit: 'μL', notes: '200μM each', sortOrder: 1 },
  { componentName: 'Forward Primer（10μM）', concentration: 1.0, unit: 'μL', notes: '0.4μM', sortOrder: 2 },
  { componentName: 'Reverse Primer（10μM）', concentration: 1.0, unit: 'μL', notes: '0.4μM', sortOrder: 3 },
  { componentName: 'DNA Template', concentration: 1.0, unit: 'μL', notes: '10–50 ng', sortOrder: 4 },
  { componentName: 'Taq DNA Polymerase（5U/μL）', concentration: 0.2, unit: 'μL', notes: '1U/反应', sortOrder: 5 },
  { componentName: 'ddH₂O', concentration: 18.8, unit: 'μL', notes: '补至总体积', sortOrder: 6 },
];

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#475569', borderBottom: '2px solid #e2e8f0',
};
const tdStyle: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', border: '1.5px solid #e2e8f0',
  borderRadius: 7, fontSize: 13, boxSizing: 'border-box', outline: 'none',
};

export default function FormulaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({
    code: '', name: '', type: 'XDY', pH: 7, procedure: '', notes: '', components: []
  });
  const [materials, setMaterials] = useState<any[]>([]);
  const [matSearch, setMatSearch] = useState<Record<number, string>>({});

  const isPCR = PCR_TYPES.includes(form.type);
  const totalVolume = isPCR
    ? (form.components || []).reduce((s: number, c: any) => s + (Number(c.concentration) || 0), 0)
    : null;

  useEffect(() => { loadMaterials(); if (id) loadFormula(); }, [id]);

  const loadMaterials = async () => {
    try { const res = await reagentMaterialsAPI.list(); setMaterials(res.list || []); }
    catch (e) { console.error(e); }
  };
  const loadFormula = async () => {
    const res = await formulaAPI.get(id as string);
    if (res?.formula) setForm(res.formula);
  };

  const onTypeChange = (newType: string) => {
    const switchToPCR = PCR_TYPES.includes(newType) && !PCR_TYPES.includes(form.type);
    if (switchToPCR && (form.components || []).length === 0) {
      setForm((s: any) => ({ ...s, type: newType, components: PCR_DEFAULT_COMPONENTS.map(c => ({ ...c })) }));
    } else {
      setForm((s: any) => ({ ...s, type: newType }));
    }
  };

  const addRow = () => {
    if (isPCR) {
      setForm((s: any) => ({
        ...s, components: [...(s.components || []),
        { componentName: '', concentration: 0, unit: 'μL', notes: '', sortOrder: s.components?.length || 0 }]
      }));
    } else {
      setForm((s: any) => ({
        ...s, components: [...(s.components || []),
        { reagentId: '', reagentMaterialId: null, componentName: null, concentration: 0, unit: 'mM', sortOrder: s.components?.length || 0 }]
      }));
    }
  };

  const removeRow = (idx: number) =>
    setForm((s: any) => ({ ...s, components: s.components.filter((_: any, i: number) => i !== idx) }));

  const save = async () => {
    try {
      if (id) await formulaAPI.update(id, form);
      else await formulaAPI.create(form);
      navigate('/reagent-formula');
    } catch (e) { console.error(e); alert('保存失败'); }
  };

  return (
    <div style={{ padding: '20px 28px', maxWidth: 900, margin: '0 auto', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>{id ? '编辑配方' : '新建配方'}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/reagent-formula')} style={{ padding: '7px 16px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#374151', fontSize: 13 }}>返回</button>
          <button onClick={save} style={{ padding: '7px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 500 }}>保存</button>
        </div>
      </div>

      {/* 基本信息 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 14, marginTop: 0 }}>基本信息</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>配方编号</label>
            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
              placeholder="如 XDY-01" style={{ ...inputStyle }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>配方名称</label>
            <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="如 洗涤液1号" style={{ ...inputStyle }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>配方类型</label>
            <select value={form.type} onChange={e => onTypeChange(e.target.value)}
              style={{ ...inputStyle, background: '#fff' }}>
              <optgroup label="── 化学试剂配方 ──">
                <option value="XDY">XDY（洗涤液）</option>
                <option value="LJY">LJY（离解液）</option>
                <option value="CLY">CLY（裂解液）</option>
                <option value="HCY">HCY（缓冲液）</option>
                <option value="JHY">JHY（结合液）</option>
              </optgroup>
              <optgroup label="── 扩增反应体系 ──">
                <option value="PCR">PCR（普通PCR扩增）</option>
                <option value="qPCR">qPCR（实时荧光定量PCR）</option>
                <option value="RT-PCR">RT-PCR（逆转录PCR）</option>
                <option value="RT-qPCR">RT-qPCR（逆转录定量PCR）</option>
              </optgroup>
            </select>
          </div>
          {!isPCR ? (
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>pH</label>
              <input type="number" value={form.pH || ''} onChange={e => setForm({ ...form, pH: Number(e.target.value) })}
                style={{ ...inputStyle }} />
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>反应体积描述</label>
              <input value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="如：25μL体系" style={{ ...inputStyle }} />
            </div>
          )}
          {!isPCR && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>备注</label>
              <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' } as React.CSSProperties} />
            </div>
          )}
        </div>
      </div>

      {/* 组分表格 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>
              {isPCR ? '反应体系组分' : '化学组分'}
            </h3>
            {isPCR && totalVolume !== null && (
              <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                总加样量：{totalVolume.toFixed(1)} μL
              </span>
            )}
          </div>
          <button onClick={addRow} style={{ padding: '6px 12px', border: '1px solid #bfdbfe', borderRadius: 7, cursor: 'pointer', background: '#eff6ff', color: '#2563eb', fontSize: 12 }}>
            + 添加组分
          </button>
        </div>

        {isPCR ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thStyle}>组分名称（可从知识库选择）</th>
                <th style={{ ...thStyle, width: 160 }}>终浓度</th>
                <th style={{ ...thStyle, width: 130 }}>加样量(μL)</th>
                <th style={{ ...thStyle, width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {(form.components || []).map((c: any, idx: number) => {
                const curSearch = matSearch[idx] ?? c.componentName ?? '';
                const filtered = curSearch
                  ? materials.filter(m =>
                    (m.commonName || '').toLowerCase().includes(curSearch.toLowerCase()) ||
                    (m.name || '').toLowerCase().includes(curSearch.toLowerCase()) ||
                    (m.chineseName || '').toLowerCase().includes(curSearch.toLowerCase())
                  ).slice(0, 20)
                  : materials.slice(0, 20);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ ...tdStyle }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input
                          value={curSearch}
                          onChange={e => {
                            const v = e.target.value;
                            setMatSearch(p => ({ ...p, [idx]: v }));
                            const comps = [...form.components];
                            comps[idx] = { ...comps[idx], componentName: v };
                            setForm({ ...form, components: comps });
                          }}
                          placeholder="输入或选择组分..."
                          style={{ ...inputStyle, flex: '0 0 180px' }}
                        />
                        <select
                          value=""
                          onChange={e => {
                            const val = e.target.value;
                            if (!val) return;
                            const mat = materials.find(m => m.id === val);
                            const name = mat?.commonName || mat?.name || '';
                            const comps = [...form.components];
                            comps[idx] = { ...comps[idx], componentName: name };
                            setMatSearch(p => ({ ...p, [idx]: name }));
                            setForm({ ...form, components: comps });
                          }}
                          style={{ ...inputStyle, flex: 1, background: '#fff', color: filtered.length ? '#374151' : '#94a3b8' }}
                        >
                          <option value="">— 从知识库选择 —</option>
                          {filtered.map(m => (
                            <option key={m.id} value={m.id}>
                              {(m.commonName || m.name) + (m.chineseName ? ` (${m.chineseName})` : '')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <input value={c.notes || ''} onChange={e => {
                        const comps = [...form.components]; comps[idx] = { ...comps[idx], notes: e.target.value };
                        setForm({ ...form, components: comps });
                      }} placeholder="如：1×、0.2μM" style={inputStyle} />
                    </td>
                    <td style={tdStyle}>
                      <input type="number" value={c.concentration ?? ''} onChange={e => {
                        const comps = [...form.components]; comps[idx] = { ...comps[idx], concentration: Number(e.target.value), unit: 'μL' };
                        setForm({ ...form, components: comps });
                      }} style={{ ...inputStyle, textAlign: 'right' } as React.CSSProperties} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => removeRow(idx)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thStyle}>试剂（从库中选择）</th>
                <th style={{ ...thStyle, width: 120 }}>浓度</th>
                <th style={{ ...thStyle, width: 100 }}>单位</th>
                <th style={{ ...thStyle, width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {(form.components || []).map((c: any, idx: number) => {
                const curSearch = matSearch[idx] ?? (c.reagentMaterial?.commonName || c.reagentMaterial?.name || c.reagentName || '');
                const filtered = curSearch
                  ? materials.filter(m =>
                    (m.commonName || '').toLowerCase().includes(curSearch.toLowerCase()) ||
                    (m.name || '').toLowerCase().includes(curSearch.toLowerCase()) ||
                    (m.chineseName || '').toLowerCase().includes(curSearch.toLowerCase())
                  ).slice(0, 20)
                  : materials.slice(0, 20);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ ...tdStyle, display: 'flex', gap: 6 }}>
                      <input
                        value={curSearch}
                        onChange={e => { setMatSearch(p => ({ ...p, [idx]: e.target.value })); }}
                        placeholder="搜索试剂..."
                        style={{ ...inputStyle, flex: '0 0 160px' }}
                      />
                      <select
                        value={c.reagentMaterialId || ''}
                        onChange={e => {
                          const val = e.target.value;
                          const mat = materials.find(m => m.id === val);
                          const comps = [...form.components];
                          comps[idx] = { ...comps[idx], reagentMaterialId: val || null, reagentId: null };
                          setMatSearch(p => ({ ...p, [idx]: mat?.commonName || mat?.name || '' }));
                          setForm({ ...form, components: comps });
                        }}
                        style={{ ...inputStyle, flex: 1, background: '#fff' }}
                      >
                        <option value="">— 从库中选择 —</option>
                        {filtered.map(m => (
                          <option key={m.id} value={m.id}>
                            {(m.commonName || m.name) + (m.chineseName ? ` (${m.chineseName})` : '')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input type="number" value={c.concentration ?? ''} onChange={e => {
                        const comps = [...form.components]; comps[idx] = { ...comps[idx], concentration: Number(e.target.value) };
                        setForm({ ...form, components: comps });
                      }} style={{ ...inputStyle, textAlign: 'right' } as React.CSSProperties} />
                    </td>
                    <td style={tdStyle}>
                      <select value={c.unit || 'mM'} onChange={e => {
                        const comps = [...form.components]; comps[idx] = { ...comps[idx], unit: e.target.value };
                        setForm({ ...form, components: comps });
                      }} style={{ ...inputStyle, background: '#fff' }}>
                        <option value="M">M</option>
                        <option value="mM">mM</option>
                        <option value="μM">μM</option>
                        <option value="%">%</option>
                        <option value="g/L">g/L</option>
                        <option value="μg/mL">μg/mL</option>
                        <option value="U/mL">U/mL</option>
                      </select>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => removeRow(idx)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {(form.components || []).length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
            暂无组分，点击「+ 添加组分」开始录入
            {isPCR && (
              <button
                onClick={() => setForm((s: any) => ({ ...s, components: PCR_DEFAULT_COMPONENTS.map(c => ({ ...c })) }))}
                style={{ marginLeft: 8, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
              >（加载标准25μL PCR模板）</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}