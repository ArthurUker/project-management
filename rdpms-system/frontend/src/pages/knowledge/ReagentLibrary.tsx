import React, { useEffect, useState } from 'react';
import { reagentAPI } from '../../api/client';

export default function ReagentLibrary() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await reagentAPI.list({ keyword, category });
      setList(res.list || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setShowDrawer(true); };

  const save = async (e: any) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const data: any = Object.fromEntries(form as any);
    try {
      if (editing) await reagentAPI.update(editing.id, data);
      else await reagentAPI.create(data);
      setShowDrawer(false);
      load();
    } catch (err) { console.error(err); alert('保存失败'); }
  };

  const remove = async (id: string) => {
    if (!confirm('确认删除？')) return;
    try {
      await reagentAPI.delete(id);
      load();
    } catch (err: any) {
      alert(err?.error || err?.message || '删除失败');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <input className="border p-2 rounded" placeholder="搜索试剂" value={keyword} onChange={e => setKeyword(e.target.value)} />
          <button className="btn" onClick={load}>搜索</button>
        </div>
        <div>
          <button className="btn btn-primary" onClick={openNew}>新建试剂</button>
        </div>
      </div>

      <table className="w-full table-auto border-collapse border">
        <thead>
          <tr className="bg-gray-100"><th className="p-2">名称</th><th>全称</th><th>CAS</th><th>类别</th><th>分子量</th><th>纯度</th><th>操作</th></tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={7}>加载中...</td></tr> : (
            list.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.name}</td>
                <td>{r.fullName}</td>
                <td>{r.casNumber}</td>
                <td>{r.category}</td>
                <td>{r.molecularWeight ?? '-'}</td>
                <td>{r.purity ?? '-'}</td>
                <td>
                  <button className="mr-2" onClick={() => { setEditing(r); setShowDrawer(true); }}>编辑</button>
                  <button onClick={() => remove(r.id)}>删除</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showDrawer && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-lg p-4">
          <h3 className="text-lg mb-2">{editing ? '编辑试剂' : '新建试剂'}</h3>
          <form onSubmit={save}>
            <input name="name" defaultValue={editing?.name} placeholder="简称" className="w-full mb-2 p-2 border" />
            <input name="fullName" defaultValue={editing?.fullName} placeholder="全称" className="w-full mb-2 p-2 border" />
            <input name="casNumber" defaultValue={editing?.casNumber} placeholder="CAS" className="w-full mb-2 p-2 border" />
            <input name="category" defaultValue={editing?.category} placeholder="类别" className="w-full mb-2 p-2 border" />
            <input name="molecularWeight" defaultValue={editing?.molecularWeight} placeholder="分子量" className="w-full mb-2 p-2 border" />
            <input name="purity" defaultValue={editing?.purity} placeholder="纯度" className="w-full mb-2 p-2 border" />
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