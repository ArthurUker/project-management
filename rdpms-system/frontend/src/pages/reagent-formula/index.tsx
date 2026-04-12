import React, { useEffect, useState } from 'react';
import { formulaAPI, reagentAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';

export default function FormulaList() {
  const [list, setList] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await formulaAPI.list({ type: typeFilter, keyword: search });
      setList(res.list || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, [typeFilter]);

  return (
    <div className="flex">
      <aside className="w-48 pr-4">
        <ul>
          <li className={`p-2 ${typeFilter===''?'bg-gray-100':''}`} onClick={() => setTypeFilter('')}>全部配方</li>
          <li className={`p-2 ${typeFilter==='CLY'?'bg-gray-100':''}`} onClick={() => setTypeFilter('CLY')}>🧪 处理液 CLY</li>
          <li className={`p-2 ${typeFilter==='LJY'?'bg-gray-100':''}`} onClick={() => setTypeFilter('LJY')}>🔬 裂解液 LJY</li>
          <li className={`p-2 ${typeFilter==='XDY'?'bg-gray-100':''}`} onClick={() => setTypeFilter('XDY')}>🧹 洗涤液 XDY</li>
        </ul>
      </aside>

      <main className="flex-1">
        <div className="flex justify-between items-center mb-4">
          <div>
            <input placeholder="搜索编号或名称" className="border p-2" value={search} onChange={e => setSearch(e.target.value)} />
            <button className="ml-2" onClick={load}>搜索</button>
          </div>
          <div>
            <button className="btn btn-primary" onClick={() => navigate('/reagent-formula/new')}>新建配方</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {list.map(f => (
            <div key={f.id} className="border p-3 rounded">
              <div className="flex justify-between">
                <strong>{f.code}</strong>
                <span className="text-sm">{f.type}</span>
              </div>
              <div className="text-sm text-gray-600">pH: {f.pH ?? '-'}</div>
              <div className="mt-2">{f.name}</div>
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => navigate(`/reagent-formula/${f.id}/edit`)}>编辑</button>
                <button onClick={async () => { await formulaAPI.duplicate(f.id); load(); }}>复制</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}