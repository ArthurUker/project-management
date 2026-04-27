/**
 * AmplificationReagentLibrary — 扩增反应体系试剂库
 * 存储 PCR/qPCR/LAMP 等扩增反应中使用的特殊试剂
 * (酶、Buffer、dNTP 等，有别于化学小分子试剂原料)
 * 复用 reagentMaterialsAPI，通过 notes 字段标记 category=amplification
 */
import React, { useState, useEffect } from 'react';
import { reagentMaterialsAPI } from '../../api/client';

const AMP_TAG = '[AMP]'; // 用于在 notes 中区分扩增体系试剂

const DEFAULT_AMP_REAGENTS = [
  { commonName: 'Taq DNA Polymerase', chineseName: 'Taq DNA 聚合酶', englishName: 'Taq DNA Polymerase', mw: 94000, state: 'solution', notes: AMP_TAG + ' 常规PCR扩增酶，5U/μL' },
  { commonName: 'Hot Start Taq', chineseName: '热启动Taq聚合酶', englishName: 'Hot Start Taq Polymerase', mw: 94000, state: 'solution', notes: AMP_TAG + ' 热启动Taq' },
  { commonName: '10× PCR Buffer', chineseName: '10× PCR缓冲液', englishName: '10× PCR Buffer', mw: 0, state: 'solution', notes: AMP_TAG + ' 不含MgCl2' },
  { commonName: '10× PCR Buffer (Mg2+)', chineseName: '10× PCR缓冲液(含Mg2+)', englishName: '10× PCR Buffer with MgCl2', mw: 0, state: 'solution', notes: AMP_TAG + ' 含MgCl2 15mM' },
  { commonName: 'dNTP Mix (10mM each)', chineseName: 'dNTP混合液(各10mM)', englishName: 'dNTP Mix', mw: 0, state: 'solution', notes: AMP_TAG + ' 各dNTP 10mM，等体积混合' },
  { commonName: 'dNTP Mix (2.5mM each)', chineseName: 'dNTP混合液(各2.5mM)', englishName: 'dNTP Mix 2.5mM', mw: 0, state: 'solution', notes: AMP_TAG + ' 各dNTP 2.5mM' },
  { commonName: 'Reverse Transcriptase', chineseName: '逆转录酶', englishName: 'Reverse Transcriptase (M-MLV/AMV)', mw: 71000, state: 'solution', notes: AMP_TAG + ' RT-PCR逆转录' },
  { commonName: 'SYBR Green I', chineseName: 'SYBR Green I 染料', englishName: 'SYBR Green I', mw: 0, state: 'solution', notes: AMP_TAG + ' qPCR荧光嵌入染料' },
  { commonName: 'ROX Reference Dye', chineseName: 'ROX参比染料', englishName: 'ROX Reference Dye', mw: 0, state: 'solution', notes: AMP_TAG + ' qPCR内参染料' },
  { commonName: 'Bst DNA Polymerase', chineseName: 'Bst DNA聚合酶', englishName: 'Bst DNA Polymerase', mw: 67000, state: 'solution', notes: AMP_TAG + ' LAMP扩增专用，链置换活性' },
  { commonName: 'Betaine (5M)', chineseName: '甜菜碱(5M)', englishName: 'Betaine', mw: 117.15, state: 'solution', notes: AMP_TAG + ' LAMP反应添加剂，提高特异性' },
  { commonName: 'MgSO4 (100mM)', chineseName: '硫酸镁(100mM)', englishName: 'Magnesium Sulfate 100mM', mw: 120.37, state: 'solution', notes: AMP_TAG + ' LAMP反应镁离子来源' },
];

interface AmpReagent {
  id: string;
  commonName: string;
  chineseName?: string;
  englishName?: string;
  mw: number;
  state?: string;
  supplier?: string;
  defaultStockConc?: number;
  defaultStockUnit?: string;
  notes?: string;
}

const EMPTY_FORM = (): Record<string, any> => ({
  commonName: '', chineseName: '', englishName: '',
  mw: '', state: 'solution', supplier: '',
  defaultStockConc: '', defaultStockUnit: 'U/μL', notes: '',
});

const STOCK_UNITS = ['U/μL', 'U/mL', 'mg/mL', 'μg/mL', 'ng/μL', 'nmol/μL', 'M', 'mM', '%', 'x'];

export default function AmplificationReagentLibrary() {
  const [list, setList] = useState<AmpReagent[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<AmpReagent | null>(null);
  const [form, setForm] = useState<Record<string, any>>(EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async (kw?: string) => {
    setLoading(true);
    try {
      const res = await reagentMaterialsAPI.list({ keyword: kw ?? keyword }) as any;
      const all: AmpReagent[] = res.list || [];
      // 过滤出标记了 AMP_TAG 的试剂
      const amp = all.filter((r: any) => r.notes?.includes(AMP_TAG));
      setList(amp);
      if (!initialized && amp.length === 0) {
        await initDefaults(all);
        setInitialized(true);
      } else {
        setInitialized(true);
      }
    } catch { setList([]); setInitialized(true); }
    setLoading(false);
  };

  const initDefaults = async (existing: AmpReagent[]) => {
    const existingNames = new Set(existing.map((r: any) => r.commonName));
    for (const m of DEFAULT_AMP_REAGENTS) {
      if (!existingNames.has(m.commonName)) {
        try {
          await reagentMaterialsAPI.create({
            ...m,
            purity: 100,
            density: null,
          });
        } catch { /* 忽略重复 */ }
      }
    }
    // reload
    const res2 = await reagentMaterialsAPI.list({}) as any;
    const all2: AmpReagent[] = res2.list || [];
    setList(all2.filter((r: any) => r.notes?.includes(AMP_TAG)));
  };

  const handleSearch = () => load(keyword);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM()); setShowDrawer(true); };
  const openEdit = (row: AmpReagent) => {
    setEditing(row);
    setForm({ ...EMPTY_FORM(), ...row, mw: row.mw ?? '', defaultStockConc: row.defaultStockConc ?? '' });
    setShowDrawer(true);
  };
  const closeDrawer = () => { setShowDrawer(false); setEditing(null); };

  const handleSave = async () => {
    if (!form.commonName) { alert('名称为必填项'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        mw: parseFloat(form.mw) || 0,
        defaultStockConc: form.defaultStockConc ? parseFloat(form.defaultStockConc) : null,
        purity: 100,
        // 确保 notes 中含有 AMP_TAG
        notes: form.notes?.includes(AMP_TAG) ? form.notes : (AMP_TAG + (form.notes ? ' ' + form.notes : '')),
      };
      if (editing) {
        await reagentMaterialsAPI.update(editing.id, payload);
      } else {
        await reagentMaterialsAPI.create(payload);
      }
      closeDrawer();
      load();
    } catch (e: any) { alert(e.message || '保存失败'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该试剂？')) return;
    await reagentMaterialsAPI.delete(id);
    load();
  };

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── 工具栏 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <input
            value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜索试剂名称..."
            style={{ width: '100%', padding: '7px 12px 7px 34px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <button onClick={handleSearch} style={{ padding: '7px 14px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>搜索</button>
        <button onClick={openNew} style={{ padding: '7px 14px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>＋ 新增试剂</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>共 {list.length} 种试剂</span>
      </div>

      {/* ── 提示信息 ── */}
      <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
        💡 本库收录 PCR/qPCR/RT-PCR/LAMP 等扩增反应专用试剂（酶、Buffer、dNTP 等）。新建配方时可从此库选择组分。
      </div>

      {/* ── 卡片列表 ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>加载中...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {list.map(r => (
            <div key={r.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1e40af' }}>{r.commonName}</div>
                  {r.chineseName && <div style={{ fontSize: 12, color: '#64748b' }}>{r.chineseName}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(r)} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#f8fafc', cursor: 'pointer', color: '#374151' }}>编辑</button>
                  <button onClick={() => handleDelete(r.id)} style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #fecaca', borderRadius: 5, background: '#fff5f5', cursor: 'pointer', color: '#dc2626' }}>删除</button>
                </div>
              </div>
              {r.englishName && <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>{r.englishName}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {r.state && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f1f5f9', color: '#475569' }}>{r.state === 'solution' ? '溶液' : r.state}</span>}
                {r.defaultStockConc && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#dbeafe', color: '#1d4ed8' }}>{r.defaultStockConc} {r.defaultStockUnit}</span>}
                {r.supplier && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#d1fae5', color: '#065f46' }}>{r.supplier}</span>}
              </div>
              {r.notes && (
                <div style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', borderRadius: 6, padding: '4px 8px' }}>
                  {r.notes.replace(AMP_TAG, '').trim()}
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && !loading && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 16, marginBottom: 8 }}>暂无试剂记录</div>
              <button onClick={openNew} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>+ 添加第一种试剂</button>
            </div>
          )}
        </div>
      )}

      {/* ── 新建/编辑弹窗 ── */}
      {showDrawer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: 'min(96vw, 600px)', maxHeight: '90vh', background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{editing ? '编辑试剂' : '新增扩增反应试剂'}</span>
              <button onClick={closeDrawer} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>名称（常用名）*</label>
                <input style={inputStyle} value={form.commonName} onChange={e => f('commonName', e.target.value)} placeholder="如 10× PCR Buffer" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>中文名</label>
                  <input style={inputStyle} value={form.chineseName} onChange={e => f('chineseName', e.target.value)} placeholder="中文名称" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>英文名</label>
                  <input style={inputStyle} value={form.englishName} onChange={e => f('englishName', e.target.value)} placeholder="English name" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>物态</label>
                  <select style={inputStyle} value={form.state} onChange={e => f('state', e.target.value)}>
                    <option value="solution">溶液</option>
                    <option value="liquid">液体</option>
                    <option value="solid">固体/粉末</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>分子量（非酶类填写）</label>
                  <input style={inputStyle} type="number" value={form.mw} onChange={e => f('mw', e.target.value)} placeholder="0 表示未知" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>保存液浓度</label>
                  <input style={inputStyle} type="number" value={form.defaultStockConc} onChange={e => f('defaultStockConc', e.target.value)} placeholder="如 5" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>浓度单位</label>
                  <select style={inputStyle} value={form.defaultStockUnit} onChange={e => f('defaultStockUnit', e.target.value)}>
                    {STOCK_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>供应商</label>
                <input style={inputStyle} value={form.supplier} onChange={e => f('supplier', e.target.value)} placeholder="如 NEB、TaKaRa、Thermo" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>说明/备注</label>
                <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.notes?.replace(AMP_TAG, '').trim()} onChange={e => f('notes', e.target.value)} placeholder="用途说明、注意事项等" />
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, background: '#fafafa', borderRadius: '0 0 14px 14px' }}>
              <button onClick={closeDrawer} style={{ padding: '8px 22px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>取消</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 28px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                {saving ? '保存中...' : editing ? '保存修改' : '添加试剂'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
