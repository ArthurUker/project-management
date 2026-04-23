import React, { useEffect, useState } from 'react';
import { reagentMaterialsAPI } from '../../api/client';

type DefaultMaterial = {
  commonName: string;
  chineseName: string;
  englishName: string;
  mw: number;
  state?: string;
  density?: number;
  casNumber?: string;
  molecularFormula?: string;
  purity?: number;
  defaultStockConc?: number;
  defaultStockUnit?: string;
  supplier?: string;
  notes?: string;
};

const DEFAULT_MATERIALS: DefaultMaterial[] = [
  { commonName:'Tris', chineseName:'三羟甲基氨基甲烷', englishName:'Tris base', mw:121.14 },
  { commonName:'NaCl', chineseName:'氯化钠', englishName:'Sodium Chloride', mw:58.44 },
  { commonName:'KCl', chineseName:'氯化钾', englishName:'Potassium Chloride', mw:74.55 },
  { commonName:'EDTA', chineseName:'乙二胺四乙酸二钠', englishName:'Ethylenediaminetetraacetic acid disodium salt', mw:372.24 },
  { commonName:'MgCl2', chineseName:'氯化镁', englishName:'Magnesium Chloride', mw:203.30 },
  { commonName:'CaCl2', chineseName:'氯化钙', englishName:'Calcium Chloride', mw:110.98 },
  { commonName:'HEPES', chineseName:'羟乙基哌嗪乙硫磺酸', englishName:'4-(2-hydroxyethyl)-1-piperazineethanesulfonic acid', mw:238.30 },
  { commonName:'SDS', chineseName:'十二烷基硫酸钠', englishName:'Sodium Dodecyl Sulfate', mw:288.38 },
  { commonName:'DTT', chineseName:'二硫苏糖醇', englishName:'Dithiothreitol', mw:154.25 },
  { commonName:'β-ME', chineseName:'β-巯基乙醇', englishName:'Beta-Mercaptoethanol', mw:78.13 },
  { commonName:'GITC', chineseName:'异硫氰酸胍', englishName:'Guanidinium isothiocyanate', mw:118.16 },
  { commonName:'尿素', chineseName:'尿素', englishName:'Urea', mw:60.06 },
  { commonName:'蔗糖', chineseName:'蔗糖', englishName:'Sucrose', mw:342.30 },
  { commonName:'甘油', chineseName:'甘油', englishName:'Glycerol', mw:92.09, state:'liquid', density:1.261 },
  { commonName:'BSA', chineseName:'牛血清白蛋白', englishName:'Bovine Serum Albumin', mw:66430 },
  { commonName:'Tween-20', chineseName:'吐温-20', englishName:'Polyoxyethylene sorbitan monolaurate', mw:1228.0, state:'liquid' },
  { commonName:'Triton X-100', chineseName:'曲拉通X-100', englishName:'Polyethylene glycol tert-octylphenyl ether', mw:625.0, state:'liquid' },
  { commonName:'NaOH', chineseName:'氢氧化钠', englishName:'Sodium Hydroxide', mw:40.00 },
  { commonName:'HCl', chineseName:'盐酸', englishName:'Hydrochloric acid', mw:36.46, state:'liquid', density:1.19 },
  { commonName:'KH2PO4', chineseName:'磷酸二氢钾', englishName:'Potassium dihydrogen phosphate', mw:136.09 },
  { commonName:'Na2HPO4', chineseName:'磷酸氢二钠', englishName:'Disodium hydrogen phosphate', mw:141.96 },
];

export default function ReagentLibrary({ openKey, hideTopButton }: { openKey?: number; hideTopButton?: boolean }) {
  // openKey: 当父组件需要触发打开新建抽屉时，传入一个不断递增的数值即可触发打开
  // hideTopButton: 当父级页面有全局新建按钮时，可隐藏组件内部的顶部新建按钮以避免重复
  React.useEffect(() => {
    if (openKey) {
      setShowDrawer(true);
    }
    // 支持通过 query 打开新增面板：?openNew=1
    try{
      const params = new URLSearchParams(window.location.search);
      if (params.get('openNew')) setShowDrawer(true);
    }catch(e){}
  }, [openKey]);

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTargets, setConfirmTargets] = useState<any[]>([]);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [forceDetails, setForceDetails] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await reagentMaterialsAPI.list({ keyword });
      const items = res.list || [];

      // 如果数据库为空，按需初始化默认数据
      if (items.length === 0) {
        for (const m of DEFAULT_MATERIALS) {
          try {
            await reagentMaterialsAPI.create({
              commonName: m.commonName,
              chineseName: m.chineseName || null,
              englishName: m.englishName || null,
              casNumber: m.casNumber || null,
              molecularFormula: m.molecularFormula || null,
              mw: m.mw,
              purity: m.purity || 98,
              density: m.density || null,
              state: m.state || 'solid',
              defaultStockConc: m.defaultStockConc || null,
              defaultStockUnit: m.defaultStockUnit || null,
              supplier: m.supplier || null,
              notes: m.notes || null,
            });
          } catch (e) {
            // ignore
          }
        }
        const res2 = await reagentMaterialsAPI.list({ keyword });
        setList(res2.list || []);
      } else {
        setList(items);
      }
    } catch (e) {
      console.error('加载试剂原料失败', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setShowDrawer(true); };

  const save = async (e: any) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const data: any = Object.fromEntries(form as any);

    // 校验 MW 必填
    if (!data.mw) { alert('请填写 MW (g/mol)'); return; }
    if (!data.commonName) { alert('请填写 常用名 (commonName)'); return; }

    try {
      if (editing) await reagentMaterialsAPI.update(editing.id, data);
      else await reagentMaterialsAPI.create(data);
      setShowDrawer(false);
      load();
    } catch (err) { console.error(err); alert('保存失败'); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === list.length) setSelectedIds([]);
    else setSelectedIds(list.map((r:any) => r.id));
  };

  const initiateDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const targets = list.filter((r:any) => selectedIds.includes(r.id)).map((r:any) => ({ id: r.id, commonName: r.commonName, chineseName: r.chineseName }));
    setConfirmTargets(targets);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    setShowConfirm(false);
    try {
      await reagentMaterialsAPI.bulkDelete(selectedIds);
      // success
      setSelectedIds([]);
      load();
    } catch (err: any) {
      if (err?.error === 'has_references' && err?.details) {
        setForceDetails(err.details);
        setShowForceConfirm(true);
      } else {
        alert(err?.error || err?.message || '删除失败');
      }
    }
  };

  const forceDelete = async () => {
    try {
      await reagentMaterialsAPI.bulkDelete(selectedIds, true);
      setShowForceConfirm(false);
      setSelectedIds([]);
      load();
    } catch (err:any) { alert(err?.error || err?.message || '强制删除失败'); }
  };

  const stateBadge = (state: string) => {
    if (state === 'liquid') return 'bg-blue-100 text-blue-700';
    if (state === 'solution') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div>
      {!hideTopButton && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <input className="border p-2 rounded" placeholder="搜索常用名/中文名/英文名/CAS号" value={keyword} onChange={e => setKeyword(e.target.value)} />
            <button className="btn" onClick={load}>搜索</button>
          </div>
          <div>
            <button className="btn btn-primary" onClick={openNew}>+ 新增试剂原料</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <input type="checkbox" checked={selectedIds.length === list.length && list.length>0} onChange={toggleSelectAll} />
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span>已选 {selectedIds.length} 条</span>
              <button className="px-3 py-1 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded" onClick={initiateDeleteSelected}>🗑️ 删除所选</button>
            </div>
          )}
        </div>
        <div></div>
      </div>

      <table className="w-full table-auto border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left"> </th>
            <th className="p-2 text-left">常用名</th>
            <th className="p-2 text-left">中文名称</th>
            <th className="p-2 text-left">英文名称</th>
            <th className="p-2 text-left">CAS号</th>
            <th className="p-2 text-left">分子式</th>
            <th className="p-2 text-left">MW (g/mol)</th>
            <th className="p-2 text-left">物态</th>
            <th className="p-2 text-left">默认储液浓度</th>
            <th className="p-2 text-left">供应商</th>
            <th className="p-2 text-left">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={11}>加载中...</td></tr> : (
            list.map((r:any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                <td className="p-2">{r.commonName || r.name}</td>
                <td className="p-2">{r.chineseName || ''}</td>
                <td className="p-2">{r.englishName || ''}</td>
                <td className="p-2">{r.casNumber || ''}</td>
                <td className="p-2">{r.molecularFormula || ''}</td>
                <td className="p-2">{r.mw ?? '-'}</td>
                <td className="p-2"><span className={`px-2 py-1 rounded-full text-xs ${stateBadge(r.state)}`}>{r.state}</span></td>
                <td className="p-2">{r.defaultStockConc != null ? `${r.defaultStockConc}${r.defaultStockUnit ? ' ' + r.defaultStockUnit : ''}` : '-'}</td>
                <td className="p-2">{r.supplier || ''}</td>
                <td className="p-2">
                  <button className="mr-2 text-primary-600" onClick={() => { setEditing(r); setShowDrawer(true); }}>编辑</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showDrawer && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg p-4">
          <h3 className="text-lg mb-2">{editing ? '编辑试剂原料' : '新增试剂原料'}</h3>
          <form onSubmit={save}>
            <label className="text-sm">常用名（必填）</label>
            <input name="commonName" defaultValue={editing?.commonName || editing?.name || ''} placeholder="常用名" className="w-full mb-2 p-2 border" />

            <label className="text-sm">中文名称</label>
            <input name="chineseName" defaultValue={editing?.chineseName || ''} placeholder="中文名称" className="w-full mb-2 p-2 border" />

            <label className="text-sm">英文名称</label>
            <input name="englishName" defaultValue={editing?.englishName || ''} placeholder="英文名称" className="w-full mb-2 p-2 border" />

            <label className="text-sm">CAS号</label>
            <input name="casNumber" defaultValue={editing?.casNumber || ''} placeholder="CAS" className="w-full mb-2 p-2 border" />

            <label className="text-sm">分子式</label>
            <input name="molecularFormula" defaultValue={editing?.molecularFormula || ''} placeholder="分子式" className="w-full mb-2 p-2 border" />

            <label className="text-sm">MW (g/mol)（必填）</label>
            <input name="mw" defaultValue={editing?.mw ?? ''} placeholder="例如 121.14" className="w-full mb-2 p-2 border" />

            <label className="text-sm">物态</label>
            <select name="state" defaultValue={editing?.state || 'solid'} className="w-full mb-2 p-2 border">
              <option value="solid">固体</option>
              <option value="liquid">液体</option>
              <option value="solution">溶液</option>
            </select>

            <label className="text-sm">默认储液浓度</label>
            <div className="flex gap-2 mb-2">
              <input name="defaultStockConc" defaultValue={editing?.defaultStockConc ?? ''} placeholder="浓度" className="flex-1 p-2 border" />
              <input name="defaultStockUnit" defaultValue={editing?.defaultStockUnit ?? ''} placeholder="单位 (M/%/mg·mL⁻¹)" className="w-28 p-2 border" />
            </div>

            <label className="text-sm">密度 (g/mL)</label>
            <input name="density" defaultValue={editing?.density ?? ''} placeholder="密度" className="w-full mb-2 p-2 border" />

            <label className="text-sm">纯度 (%)</label>
            <input name="purity" defaultValue={editing?.purity ?? ''} placeholder="纯度" className="w-full mb-2 p-2 border" />

            <label className="text-sm">供应商</label>
            <input name="supplier" defaultValue={editing?.supplier ?? ''} placeholder="供应商" className="w-full mb-2 p-2 border" />

            <label className="text-sm">备注</label>
            <textarea name="notes" defaultValue={editing?.notes ?? ''} placeholder="备注" className="w-full mb-2 p-2 border" />

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowDrawer(false)}>取消</button>
              <button type="submit" className="btn btn-primary">保存</button>
            </div>
          </form>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-1/2">
            <h3 className="text-lg mb-2">确认删除</h3>
            <div className="mb-4 text-sm">
              即将删除以下 {confirmTargets.length} 条试剂原料，删除后不可恢复：
              <ul className="list-disc pl-5 mt-2">
                {confirmTargets.slice(0,5).map(t => <li key={t.id}>{t.commonName}（{t.chineseName || ''}）</li>)}
                {confirmTargets.length > 5 && <li>...等{confirmTargets.length}条</li>}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1 border rounded" onClick={() => setShowConfirm(false)}>取消</button>
              <button className="px-3 py-1 bg-red-500 text-white rounded" onClick={confirmDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {showForceConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-1/2">
            <h3 className="text-lg mb-2">检测到被引用</h3>
            <div className="mb-4 text-sm">
              以下试剂已被配方引用，删除后相关配方组分将失去关联：
              <ul className="list-disc pl-5 mt-2">
                {forceDetails.map(d => <li key={d.id}>{d.id} 被 {d.count} 个配方使用</li>)}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1 border rounded" onClick={() => setShowForceConfirm(false)}>取消</button>
              <button className="px-3 py-1 bg-red-500 text-white rounded" onClick={forceDelete}>强制删除</button>
            </div>
          </div>
        </div>
      )}    </div>
  );
}