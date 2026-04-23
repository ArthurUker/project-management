import { useEffect, useState } from 'react';
import { taskTemplatesAPI } from '../../api/client';

export default function TaskTemplateLibrary() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTargets, setConfirmTargets] = useState<any[]>([]);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [forceDetails, setForceDetails] = useState<any[]>([]);

  const DEFAULT_CATEGORIES = ['全部分类','芯片制备','检测实验','数据分析','通用'];

  const load = async () => {
    setLoading(true);
    try {
      const res = await taskTemplatesAPI.list({ keyword, category: categoryFilter });
      setList(res.list || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [keyword, categoryFilter]);

  const openNew = () => { setEditing(null); setShowDrawer(true); };

  const save = async (data:any) => {
    try {
      if (editing) await taskTemplatesAPI.update(editing.id, data);
      else await taskTemplatesAPI.create(data);
      setShowDrawer(false);
      load();
    } catch (e:any) { alert(e?.message || '保存失败'); }
  };

  const toggleSelect = (id:string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(prev => prev.length === list.length ? [] : list.map(l=>l.id));

  const initiateDeleteSelected = () => {
    if (!selectedIds.length) return;
    const targets = list.filter(l=>selectedIds.includes(l.id)).map(t=>({ id: t.id, name: t.name }));
    setConfirmTargets(targets);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    setShowConfirm(false);
    try {
      await taskTemplatesAPI.bulkDelete(selectedIds);
      setSelectedIds([]);
      load();
    } catch (err:any) {
      if (err?.error === 'has_references' && err.details) {
        setForceDetails(err.details); setShowForceConfirm(true);
      } else alert(err?.message || '删除失败');
    }
  };

  const forceDelete = async () => {
    try {
      await taskTemplatesAPI.bulkDelete(selectedIds, true);
      setShowForceConfirm(false); setSelectedIds([]); load();
    } catch (e:any) { alert(e?.message || '强制删除失败'); }
  };

  // Drawer form simplified: build data object and call save
  const onSubmit = (e:any) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const data:any = Object.fromEntries(form as any);
    // tags from comma-separated
    data.tags = data.tags ? data.tags.split(',').map((t:string)=>t.trim()).filter(Boolean) : [];
    // steps JSON is provided in hidden input stepsJson
    try { data.steps = JSON.parse(data.stepsJson || '[]'); } catch(e){ data.steps = []; }
    save(data);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <input className="border p-2 rounded" placeholder="搜索模板名称/标签/分类" value={keyword} onChange={e=>setKeyword(e.target.value)} />
          <select className="border p-2 rounded" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
            {DEFAULT_CATEGORIES.map(c => <option key={c} value={c==='全部分类' ? '' : c}>{c}</option>)}
          </select>
          <button className="btn" onClick={load}>搜索</button>
        </div>
        <div>
          <button className="btn btn-primary" onClick={openNew}>+ 新建模板</button>
        </div>
      </div>

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

      {loading ? <div>加载中...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(t => (
            <div key={t.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition relative">
              <div className="absolute left-3 top-3"><input type="checkbox" checked={selectedIds.includes(t.id)} onChange={()=>toggleSelect(t.id)} /></div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold">📋 {t.name}</div>
                  <div className="text-sm text-gray-500 mt-1 line-clamp-2">{t.description}</div>
                </div>
                <div className="ml-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.category==='芯片制备'? 'bg-purple-100 text-purple-700' : t.category==='检测实验' ? 'bg-blue-100 text-blue-700' : t.category==='数据分析' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t.category}</span>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-600">
                <div>🔢 {t.steps ? t.steps.length : 0} 个步骤</div>
                <div>⏱️ 预计 {t.estimatedDays || 0} 天</div>
                <div className="mt-2">🏷️ {(t.tags||'').toString().split(',').slice(0,3).map((tag:any,i:number)=>(<span key={i} className="px-1 py-0.5 bg-gray-100 rounded text-xs mr-1">{tag}</span>))}</div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-400">引用 {t.usageCount || 0} 次</div>
                <div className="flex gap-2">
                  <button className="text-sm text-primary-600" onClick={()=>{ setEditing(t); setShowDrawer(true); }}>编辑</button>
                  <button className="text-sm text-white bg-blue-600 px-3 py-1 rounded" onClick={()=>alert('使用模板功能暂未实现')}>使用模板</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDrawer && (
        <div className="fixed right-0 top-0 h-full w-160 bg-white shadow-lg p-4 overflow-auto">
          <h3 className="text-lg mb-2">{editing ? '编辑模板' : '新建模板'}</h3>
          <form onSubmit={onSubmit}>
            <div className="space-y-2">
              <div>
                <label className="text-sm">模板名称（必填）</label>
                <input name="name" defaultValue={editing?.name||''} className="w-full p-2 border mb-2" />
              </div>
              <div>
                <label className="text-sm">分类</label>
                <select name="category" defaultValue={editing?.category||''} className="w-full p-2 border mb-2">
                  <option value="">请选择</option>
                  {DEFAULT_CATEGORIES.filter(c=>c!=='全部分类').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm">描述</label>
                <textarea name="description" defaultValue={editing?.description||''} className="w-full p-2 border h-20 mb-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm">预计完成天数</label>
                  <input type="number" name="estimatedDays" defaultValue={editing?.estimatedDays||0} className="w-full p-2 border mb-2" />
                </div>
                <div>
                  <label className="text-sm">默认优先级</label>
                  <select name="priority" defaultValue={editing?.priority||'medium'} className="w-full p-2 border mb-2">
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="urgent">紧急</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm">标签（逗号分隔）</label>
                <input name="tags" defaultValue={(editing?.tags||'').toString()} className="w-full p-2 border mb-2" />
              </div>

              <div>
                <h4 className="flex items-center justify-between">任务步骤 <button type="button" className="text-sm text-primary-600" onClick={()=>{
                  // add empty step
                  const steps = JSON.parse((document.getElementById('stepsJson') as HTMLInputElement).value || '[]');
                  steps.push({ id: Date.now().toString(), order: steps.length+1, title: '新步骤', description: '', estimatedHours: 1, assigneeRole: '', checklist: [] });
                  (document.getElementById('stepsJson') as HTMLInputElement).value = JSON.stringify(steps);
                  // trigger re-render by forcing reload
                  load();
                }}>+ 添加步骤</button></h4>
                <p className="text-xs text-gray-400">（步骤编辑在保存后生效）</p>
                <textarea id="stepsJson" name="stepsJson" defaultValue={JSON.stringify(editing?.steps || [])} className="hidden"></textarea>
                <div className="mt-2 text-sm text-gray-500">为简化实现，步骤编辑采用 JSON 编辑（临时）。</div>
                <textarea defaultValue={JSON.stringify(editing?.steps || [], null, 2)} onChange={(e)=>{ (document.getElementById('stepsJson') as HTMLInputElement).value = e.target.value; }} className="w-full p-2 border h-40 mt-2" />
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={()=>setShowDrawer(false)} className="px-3 py-1 border rounded">取消</button>
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded">保存模板</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-1/2">
            <h3 className="text-lg mb-2">确认删除</h3>
            <div>即将删除以下 {confirmTargets.length} 个模板：</div>
            <ul className="list-disc pl-5 mt-2">{confirmTargets.slice(0,5).map(t=><li key={t.id}>{t.name}</li>)}{confirmTargets.length>5 && <li>...等{confirmTargets.length}条</li>}</ul>
            <div className="flex justify-end gap-2 mt-4"><button onClick={()=>setShowConfirm(false)} className="px-3 py-1 border rounded">取消</button><button onClick={confirmDelete} className="px-3 py-1 bg-red-500 text-white rounded">确认删除</button></div>
          </div>
        </div>
      )}

      {showForceConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-1/2">
            <h3 className="text-lg mb-2">检测到被引用</h3>
            <div className="mb-2">以下模板被项目引用，删除后不可通过此模板创建新任务：</div>
            <ul className="list-disc pl-5 mt-2">{forceDetails.map(d=><li key={d.id}>{d.id} 被 {d.count} 个项目使用</li>)}</ul>
            <div className="flex justify-end gap-2 mt-4"><button onClick={()=>setShowForceConfirm(false)} className="px-3 py-1 border rounded">取消</button><button onClick={forceDelete} className="px-3 py-1 bg-red-500 text-white rounded">强制删除</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
