import React, { useEffect, useState } from 'react';
import { formulaAPI, reagentAPI } from '../../api/client';
import { useNavigate, useParams } from 'react-router-dom';

export default function FormulaEditor(){
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({ code: '', name:'', type:'CLY', pH:7, procedure:'', notes:'', components: [] });
  const [reagents, setReagents] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);

  useEffect(()=>{ loadReagents(); loadMaterials(); if (id) loadFormula(); }, [id]);

  const loadReagents = async ()=>{
    const res = await reagentAPI.list(); setReagents(res.list || []);
  };
  const loadMaterials = async ()=>{
    const res = await (await import('../../api/client')).reagentMaterialsAPI.list(); setMaterials(res.list || []);
  };
  const loadFormula = async ()=>{
    const res = await formulaAPI.get(id as string);
    if (res?.formula) setForm(res.formula);
  };

  const addRow = ()=> setForm((s:any)=> ({...s, components:[...(s.components||[]), { reagentId: '', concentration: 0, unit: 'M' }]}));
  const removeRow = (idx:number)=> setForm((s:any)=> ({...s, components: s.components.filter((_:any,i:number)=>i!==idx)}));
  const save = async ()=>{
    try{
      if (id) await formulaAPI.update(id, form);
      else await formulaAPI.create(form);
      navigate('/reagent-formula');
    }catch(e){console.error(e); alert('保存失败')}
  };

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h2>{id ? '编辑配方' : '新建配方'}</h2>
        <div>
          <button onClick={() => navigate('/reagent-formula')}>返回</button>
          <button className="ml-2 btn btn-primary" onClick={save}>保存</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>编号</label>
          <input value={form.code} onChange={e=>setForm({...form, code: e.target.value})} className="w-full p-2 border mb-2" />
          <label>名称</label>
          <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full p-2 border mb-2" />
          <label>类型</label>
          <select value={form.type} onChange={e=>setForm({...form, type:e.target.value})} className="w-full p-2 border mb-2">
            <option value="CLY">CLY</option>
            <option value="LJY">LJY</option>
            <option value="XDY">XDY</option>
          </select>
        </div>
        <div>
          <label>pH</label>
          <input type="number" value={form.pH} onChange={e=>setForm({...form, pH: Number(e.target.value)})} className="w-full p-2 border mb-2" />
          <label>备注</label>
          <textarea value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} className="w-full p-2 border mb-2" />
        </div>
      </div>

      <div className="mt-4">
        <h3>组分</h3>
        <table className="w-full">
          <thead><tr><th>试剂</th><th>浓度</th><th>单位</th><th></th></tr></thead>
          <tbody>
            {(form.components||[]).map((c:any, idx:number)=> (
              <tr key={idx}>
                <td>
                  <div className="flex">
                    <input className="p-1 border" placeholder="搜索试剂（常用名/中文/英文）" value={c._search || (c.reagentName||'')} onChange={e=>{
                      const comps=[...form.components]; comps[idx]._search=e.target.value; setForm({...form, components: comps});
                    }} />
                    <select value={c.reagentMaterialId || c.reagentId || ''} onChange={e=>{ const comps=[...form.components]; const val=e.target.value; comps[idx].reagentMaterialId=val || null; comps[idx].reagentId=null; comps[idx].reagentName = materials.find(m=>m.id===val)?.commonName || materials.find(m=>m.id===val)?.name || comps[idx].reagentName; setForm({...form, components: comps})}}>
                      <option value="">请选择（或输入自定义名称）</option>
                      {materials.map(m=> <option key={m.id} value={m.id}>{(m.commonName || m.name) + (m.chineseName ? ` (${m.chineseName})` : '')}</option>)}
                    </select>
                    {/* 当未找到匹配时提示并跳转 */}
                    <button className="ml-2 text-amber-600 bg-amber-50 text-xs p-1 rounded" onClick={()=>{ window.location.href = '/knowledge?openNew=1'; }}>前往新增</button>
                  </div>
                </td>
                <td><input value={c.concentration} onChange={e=>{ const comps=[...form.components]; comps[idx].concentration=Number(e.target.value); setForm({...form, components: comps})}} /></td>
                <td>
                  <select value={c.unit} onChange={e=>{ const comps=[...form.components]; comps[idx].unit=e.target.value; setForm({...form, components: comps})}}>
                    <option value="M">M</option>
                    <option value="%">%</option>
                  </select>
                </td>
                <td><button onClick={()=>removeRow(idx)}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2">
          <button onClick={addRow}>+ 添加组分</button>
        </div>
      </div>
    </div>
  );
}