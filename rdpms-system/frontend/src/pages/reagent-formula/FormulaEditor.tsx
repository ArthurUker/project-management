import React, { useEffect, useState } from 'react';
import { formulaAPI, reagentAPI } from '../../api/client';
import { useNavigate, useParams } from 'react-router-dom';

export default function FormulaEditor(){
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({ code: '', name:'', type:'CLY', pH:7, procedure:'', notes:'', components: [] });
  const [reagents, setReagents] = useState<any[]>([]);

  useEffect(()=>{ loadReagents(); if (id) loadFormula(); }, [id]);

  const loadReagents = async ()=>{
    const res = await reagentAPI.list(); setReagents(res.list || []);
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
                  <select value={c.reagentId} onChange={e=>{ const comps=[...form.components]; comps[idx].reagentId=e.target.value; setForm({...form, components: comps})}}>
                    <option value="">请选择</option>
                    {reagents.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
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