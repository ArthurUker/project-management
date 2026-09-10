import { useEffect, useRef, useState } from 'react';
import { formulaAPI, prepAPI } from '@/api';

export default function PrepCalculator(){
  const [formulas, setFormulas] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [targetVolume, setTargetVolume] = useState<number>(100);
  const [result, setResult] = useState<any | null>(null);

  // A-7②（Tencent 审查修复意图，enh 重实现）：卸载后丢弃过期响应
  useEffect(()=>{
    let active = true;
    const load = async ()=>{
      try {
        const res = await formulaAPI.list();
        if (active) setFormulas(res.items || []);
      } catch (e) { if (active) console.error(e); }
    };
    load();
    return () => { active = false; };
  },[]);

  // 切换配方或修改体积后，上一份计算结果必须作废——
  // 否则表格仍显示旧配方的称量值，可能被误保存成配制记录
  useEffect(()=>{ setResult(null); }, [selected, targetVolume]);

  const calcSeqRef = useRef(0);
  const calculate = async ()=>{
    if (!selected) return alert('请选择配方');
    const seq = ++calcSeqRef.current;
    try {
      const res = await prepAPI.calculate({ formulaId: selected, targetVolume });
      if (seq !== calcSeqRef.current) return; // 连点/快速切换时的过期结果丢弃
      if ((res as any)?.success) setResult(res as any);
    } catch (e: any) {
      if (seq === calcSeqRef.current) alert(e?.error || e?.message || '计算失败');
    }
  }; // 后端已支持 reagentMaterial 关联，前端无需额外处理 here

  const saveRecord = async ()=>{
    if (!result || !selected) return;
    await prepAPI.saveRecord({ formulaId: selected, targetVolume, calcResult: result, prepDate: new Date().toISOString().slice(0,10) });
    alert('已保存');
  };

  return (
    <div>
      <h2>配制计算器</h2>
      <div className="flex gap-2 items-center mb-4">
        <select onChange={e=>setSelected(e.target.value)} className="p-2 border">
          <option value="">请选择配方</option>
          {formulas.map(f=> <option key={f.id} value={f.id}>{f.code} {f.name}</option>)}
        </select>
        <input type="number" className="p-2 border" value={targetVolume} onChange={e=>setTargetVolume(Number(e.target.value))} /> mL
        <button className="btn btn-primary" onClick={calculate}>开始计算</button>
      </div>

      {result && (
        <div>
          {result.missingMW && result.missingMW.length>0 && (
            <div className="p-2 bg-yellow-100">缺少分子量: {result.missingMW.join(', ')}</div>
          )}

          <table className="w-full mt-2 border">
            <thead><tr><th>试剂</th><th>浓度</th><th>分子量</th><th>纯度</th><th>需称量/量取</th></tr></thead>
            <tbody>
              {result.components.map((c:any, idx:number)=> (
                <tr key={idx}><td>{c.reagentName}</td><td>{c.concentration}{c.concUnit}</td><td>{c.molecularWeight ?? '-'}</td><td>{c.purity ?? '-'}</td><td>{c.displayAmount}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4">
            <button className="btn btn-primary" onClick={saveRecord}>💾 保存配制记录</button>
            <button className="ml-2" onClick={() => window.print()}>🖨️ 打印</button>
          </div>
        </div>
      )}
    </div>
  );
}