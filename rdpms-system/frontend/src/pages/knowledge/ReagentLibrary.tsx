import React, { useEffect, useState } from 'react';
import { reagentMaterialsAPI } from '../../api/client';

const DEFAULT_MATERIALS = [
  { name:'Tris', mw:121.14, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
  { name:'NaCl', mw:58.44, state:'solid', purity:99.5, defaultStockConc:5, defaultStockUnit:'M' },
  { name:'KCl', mw:74.55, state:'solid', purity:99, defaultStockConc:3, defaultStockUnit:'M' },
  { name:'EDTA', alias:['Na2-EDTA'], mw:372.24, state:'solid', purity:99, defaultStockConc:0.5, defaultStockUnit:'M' },
  { name:'MgCl2', alias:['氯化镁'], mw:203.30, state:'solid', purity:98, defaultStockConc:1, defaultStockUnit:'M' },
  { name:'CaCl2', alias:['氯化钙'], mw:110.98, state:'solid', purity:96, defaultStockConc:1, defaultStockUnit:'M' },
  { name:'HEPES', mw:238.30, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
  { name:'SDS', alias:['十二烷基硫酸钠'], mw:288.38, state:'solid', purity:99, defaultStockConc:10, defaultStockUnit:'%' },
  { name:'DTT', alias:['二硫苏糖醇'], mw:154.25, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
  { name:'β-巯基乙醇', mw:78.13, state:'liquid', density:1.114, purity:99, defaultStockConc:14, defaultStockUnit:'M' },
  { name:'GITC', alias:['异硫氰酸胍'], mw:118.16, state:'solid', purity:98, defaultStockConc:8, defaultStockUnit:'M' },
  { name:'尿素', mw:60.06, state:'solid', purity:99, defaultStockConc:8, defaultStockUnit:'M' },
  { name:'蔗糖', mw:342.30, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
  { name:'甘油', mw:92.09, state:'liquid', density:1.261, purity:99, defaultStockConc:50, defaultStockUnit:'%' },
  { name:'BSA', alias:['牛血清白蛋白'], mw:66430, state:'solid', purity:98, defaultStockConc:10, defaultStockUnit:'mg·mL⁻¹' },
  { name:'Tween-20', mw:1228.0, state:'liquid', density:1.1, purity:100, defaultStockConc:10, defaultStockUnit:'%' },
  { name:'Triton X-100', mw:625.0, state:'liquid', density:1.065, purity:100, defaultStockConc:10, defaultStockUnit:'%' },
  { name:'NaOH', alias:['氢氧化钠'], mw:40.00, state:'solid', purity:97, defaultStockConc:10, defaultStockUnit:'M' },
  { name:'HCl', alias:['盐酸'], mw:36.46, state:'liquid', density:1.19, purity:37, defaultStockConc:12, defaultStockUnit:'M' },
  { name:'KH2PO4', mw:136.09, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
  { name:'Na2HPO4', mw:141.96, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
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
              name: m.name,
              alias: m.alias ? (Array.isArray(m.alias) ? m.alias.join(',') : m.alias) : null,
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

    // alias 保持逗号分隔字符串
    if (data.alias === '') data.alias = null;

    try {
      if (editing) await reagentMaterialsAPI.update(editing.id, data);
      else await reagentMaterialsAPI.create(data);
      setShowDrawer(false);
      load();
    } catch (err) { console.error(err); alert('保存失败'); }
  };

  const remove = async (id: string) => {
    if (!confirm('确认删除？')) return;
    try {
      await reagentMaterialsAPI.delete(id);
      load();
    } catch (err: any) {
      alert(err?.error || err?.message || '删除失败');
    }
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
            <input className="border p-2 rounded" placeholder="搜索名称/CAS号/别名" value={keyword} onChange={e => setKeyword(e.target.value)} />
            <button className="btn" onClick={load}>搜索</button>
          </div>
          <div>
            <button className="btn btn-primary" onClick={openNew}>+ 新增试剂原料</button>
          </div>
        </div>
      )}

      <table className="w-full table-auto border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">名称</th>
            <th className="p-2 text-left">别名</th>
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
          {loading ? <tr><td colSpan={9}>加载中...</td></tr> : (
            list.map((r:any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.alias || ''}</td>
                <td className="p-2">{r.casNumber || ''}</td>
                <td className="p-2">{r.molecularFormula || ''}</td>
                <td className="p-2">{r.mw ?? '-'}</td>
                <td className="p-2"><span className={`px-2 py-1 rounded-full text-xs ${stateBadge(r.state)}`}>{r.state}</span></td>
                <td className="p-2">{r.defaultStockConc != null ? `${r.defaultStockConc}${r.defaultStockUnit ? ' ' + r.defaultStockUnit : ''}` : '-'}</td>
                <td className="p-2">{r.supplier || ''}</td>
                <td className="p-2">
                  <button className="mr-2 text-primary-600" onClick={() => { setEditing(r); setShowDrawer(true); }}>编辑</button>
                  <button className="text-red-500" onClick={() => remove(r.id)}>删除</button>
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
            <label className="text-sm">名称（必填）</label>
            <input name="name" defaultValue={editing?.name || ''} placeholder="名称" className="w-full mb-2 p-2 border" />

            <label className="text-sm">别名（用逗号分隔）</label>
            <input name="alias" defaultValue={editing?.alias || ''} placeholder="别名1,别名2" className="w-full mb-2 p-2 border" />

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
    </div>
  );
}