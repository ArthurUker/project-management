import React, { useEffect, useRef, useState } from 'react';
import { samplesAPI, projectAPI } from '@/api';

// v1.5（2026-10-12）：类型改为后端枚举值（此前传中文给 Prisma 枚举会导致保存失败）
const SAMPLE_TYPES = ['REFERENCE_STANDARD', 'CLINICAL_SAMPLE', 'CONTROL', 'BLANK_MATRIX', 'SIMULATED', 'OTHER', 'PLASMID', 'PSEUDOVIRUS', 'STRAIN', 'VACCINE', 'BIOLOGICAL_SAMPLE'];
const STATUS_OPTIONS = ['可用', '已用完', '过期', '封存'];
const STORAGE_OPTIONS = ['-80°C', '-20°C', '4°C', '室温', '液氮'];

// v1.2：后端枚举 → 中文展示（迁入的质粒/菌株/样本数据 sampleType/status 为英文枚举）
const SAMPLE_TYPE_LABELS: Record<string, string> = {
  REFERENCE_STANDARD: '标准品', CLINICAL_SAMPLE: '临床样本', CONTROL: '对照品',
  BLANK_MATRIX: '空白基质', SIMULATED: '模拟样本', OTHER: '其他',
  // v1.5
  PLASMID: '质粒', PSEUDOVIRUS: '假病毒', STRAIN: '菌株', VACCINE: '疫苗', BIOLOGICAL_SAMPLE: '生物样本',
};
const SAMPLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '可用', RESERVED: '已预留', USED: '已使用', DEPLETED: '已用完',
  EXPIRED: '已过期', QUARANTINED: '隔离中', SEALED: '封存', DISPOSED: '已销毁',
};

export default function SampleLibrary({ openKey, hideTopButton }: { openKey?: number; hideTopButton?: boolean }) {
  React.useEffect(() => {
    if (openKey) setShowDrawer(true);
  }, [openKey]);

  const [list, setList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  // v1.6（2026-10-12）：归属项目筛选改按「业务项目名」文本（盘点数据项目名在此字段），
  // 与「全部项目」共用同一数据源，保证两种模式数据范围/排序一致。
  const [filterProjectName, setFilterProjectName] = useState('');
  const [projectNames, setProjectNames] = useState<string[]>([]);
  // v1.2（2026-10-12）：服务端分页（质粒/菌株/样本迁入后总量数百条）
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<number | null>(null);
  const findScrollParent = (el: HTMLElement | null): HTMLElement | null => {
    while (el) {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  };

  const closeEditor = () => { setShowDrawer(false); setEditing(null); };

  const [form, setForm] = useState<Record<string, string>>({
    sampleCode: '', sampleName: '', sampleType: 'BIOLOGICAL_SAMPLE', species: '', tissue: '',
    concentration: '', volume: '', storageCondition: '-80°C', collectionDate: '',
    expiryDate: '', supplier: '', status: '可用', projectId: '', projectName: '', targetGene: '', notes: '',
  });

  const loadProjects = async () => {
    try {
      const res = await projectAPI.list({ pageSize: 200 });
      setProjects(res.items || []);
    } catch (e) { console.error(e); }
  };

  const load = async (targetPage?: number, projectNameOverride?: string) => {
    setLoading(true);
    try {
      const params: any = { page: targetPage ?? page, pageSize };
      if (keyword) params.keyword = keyword;
      // 修正（2026-10-12）：onChange 中 setState 与 load 同一 tick 执行，闭包里 filterProjectName 仍是旧值，
      // 因此允许调用方显式传入最新的项目名（否则「选具体项目」不过滤）。
      const projectName = projectNameOverride ?? filterProjectName;
      if (projectName) params.projectName = projectName;
      const res = await samplesAPI.list(params);
      setList(res.items || []);
      setTotal(typeof res.total === 'number' ? res.total : (res.items || []).length);
      if (Array.isArray(res.projectNames)) setProjectNames(res.projectNames);
      if (savedScrollRef.current !== null) {
        const pos = savedScrollRef.current;
        savedScrollRef.current = null;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const parent = findScrollParent(containerRef.current);
          if (parent) parent.scrollTop = pos;
        }));
      }
    } catch (e) { console.error('加载样本失败', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadProjects(); load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ sampleCode: '', sampleName: '', sampleType: 'BIOLOGICAL_SAMPLE', species: '', tissue: '', concentration: '', volume: '', storageCondition: '-80°C', collectionDate: '', expiryDate: '', supplier: '', status: '可用', projectId: '', projectName: '', targetGene: '', notes: '' });
    setShowDrawer(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      sampleCode: item.sampleCode || '',
      sampleName: item.sampleName || '',
      sampleType: item.sampleType || 'BIOLOGICAL_SAMPLE',
      species: item.species || '',
      tissue: item.tissue || '',
      concentration: item.concentration || '',
      volume: item.volume || '',
      storageCondition: item.storageCondition || '-80°C',
      collectionDate: item.collectionDate || '',
      expiryDate: item.expiryDate || '',
      supplier: item.supplier || '',
      status: item.status || '可用',
      projectId: item.projectId || '',
      projectName: item.projectName || '',
      targetGene: item.targetGene || '',
      notes: item.notes || '',
    });
    setShowDrawer(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sampleName.trim()) { alert('请填写样本名称'); return; }
    const parent = findScrollParent(containerRef.current);
    if (parent) savedScrollRef.current = parent.scrollTop;
    try {
      const payload = { ...form };
      if (editing) {
        await samplesAPI.update(editing.id, payload);
      } else {
        await samplesAPI.create(payload);
      }
      closeEditor();
      load();
    } catch (err: any) {
      alert(err.message || '保存失败');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除样本「${name}」吗？`)) return;
    try { await samplesAPI.remove(id); load(); } catch (err: any) { alert(err.message || '删除失败'); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 个样本吗？`)) return;
    try {
      for (const id of selectedIds) await samplesAPI.remove(id);
      setSelectedIds([]);
      load();
    } catch (e) { alert('批量删除失败'); }
  };

  const statusColor: Record<string, string> = {
    '可用': 'bg-green-100 text-green-700',
    '已用完': 'bg-gray-100 text-gray-600',
    '过期': 'bg-red-100 text-red-700',
    '封存': 'bg-yellow-100 text-yellow-700',
  };

  const f = (k: string) => form[k] ?? '';
  const setF = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div ref={containerRef} className="relative">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text" placeholder="搜索编号/名称/物种..." className="input w-52 text-sm"
          value={keyword} onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(1); } }}
        />
        <select className="input w-44 text-sm" value={filterProjectName} onChange={e => { const v = e.target.value; setFilterProjectName(v); setPage(1); load(1, v); }}>
          <option value="">全部项目</option>
          {projectNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => { setPage(1); load(1); }} className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">搜索</button>
        {selectedIds.length > 0 && (
          <button onClick={handleBulkDelete} className="px-3 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600">
            删除选中({selectedIds.length})
          </button>
        )}
        {!hideTopButton && (
          <button onClick={openNew} className="ml-auto px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            新建样本
          </button>
        )}
      </div>

      {/* 表格 */}
      <div className="glass-panel overflow-x-auto">
        <table className="glass-table">
          <thead>
            <tr>
              <th className="px-3 py-2 w-8">
                <input type="checkbox"
                  checked={selectedIds.length === list.length && list.length > 0}
                  onChange={e => setSelectedIds(e.target.checked ? list.map(i => i.id) : [])}
                />
              </th>
              <th className="px-3 py-2 text-left">样本编号</th>
              <th className="px-3 py-2 text-left">样本名称</th>
              <th className="px-3 py-2 text-left">类型</th>
              <th className="px-3 py-2 text-left">归属项目</th>
              <th className="px-3 py-2 text-left">检测靶标</th>
              <th className="px-3 py-2 text-left">物种</th>
              <th className="px-3 py-2 text-left">组织/来源</th>
              <th className="px-3 py-2 text-left">浓度</th>
              <th className="px-3 py-2 text-left">保存条件</th>
              <th className="px-3 py-2 text-left">存放位置</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} className="text-center py-8 text-gray-400">加载中...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-10 text-gray-400">
                暂无样本，点击「新建样本」添加
              </td></tr>
            ) : list.map(item => (
              <tr key={item.id} className="hover:bg-blue-50 transition-colors">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selectedIds.includes(item.id)}
                    onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, item.id] : selectedIds.filter(i => i !== item.id))}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-blue-700">{item.sampleCode}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{item.sampleName}</td>
                <td className="px-3 py-2 text-gray-600">{SAMPLE_TYPE_LABELS[item.sampleType] || item.sampleType}</td>
                <td className="px-3 py-2 text-gray-600 text-xs" title={item.projectName || item.project?.name || ''}>{item.projectName || item.project?.name || '—'}</td>
                <td className="px-3 py-2 text-gray-700 text-xs">
                  {item.targetGene
                    ? <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700" title={item.targetGene}>{item.targetGene}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs italic">{item.species || '—'}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{item.tissue || '—'}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{item.concentration || '—'}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{item.storageCondition}</td>
                <td className="px-3 py-2 text-gray-500 text-xs max-w-[220px] truncate" title={item.storage?.path || item.location || ''}>
                  {item.storage?.path || item.location || '—'}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[SAMPLE_STATUS_LABELS[item.status] || item.status] || 'bg-gray-100 text-gray-600'}`}>
                    {SAMPLE_STATUS_LABELS[item.status] || item.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(item)} className="text-gray-400 hover:text-blue-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDelete(item.id, item.sampleName)} className="text-gray-400 hover:text-red-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页条（v1.2） */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>共 {total} 条 · 第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            disabled={page <= 1 || loading}
            onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p); }}
          >上一页</button>
          <button
            type="button"
            className="px-3 py-1 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            disabled={page >= Math.max(1, Math.ceil(total / pageSize)) || loading}
            onClick={() => { const p = page + 1; setPage(p); load(p); }}
          >下一页</button>
        </div>
      </div>

      {/* 侧边抽屉：新建/编辑 */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeEditor} />
          <div className="w-[480px] bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
              <div>
                <h3 className="font-semibold text-gray-900 text-base">{editing ? '编辑样本' : '新建样本'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">填写样本基本信息</p>
              </div>
              <button onClick={closeEditor} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={save} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">样本编号</label>
                  <input className="input text-sm" placeholder="自动生成或手动填写" value={f('sampleCode')} onChange={e => setF('sampleCode', e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">样本名称 <span className="text-red-500">*</span></label>
                  <input className="input text-sm" required placeholder="如：阳性对照样品A" value={f('sampleName')} onChange={e => setF('sampleName', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">样本类型</label>
                  <select className="input text-sm" value={f('sampleType')} onChange={e => setF('sampleType', e.target.value)}>
                    {SAMPLE_TYPES.map((t) => (
                      <option key={t} value={t}>{SAMPLE_TYPE_LABELS[t] || t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs">归属项目（已登记）</label>
                  <select className="input text-sm" value={f('projectId')} onChange={e => setF('projectId', e.target.value)}>
                    <option value="">无（通用样本）</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label text-xs">所属项目（业务名，可多项目逗号分隔）</label>
                <input
                  className="input text-sm"
                  placeholder="如 08-消化道_食源性（盘点表原始项目名）"
                  value={f('projectName')}
                  onChange={e => setF('projectName', e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">检测靶标（多靶标逗号分隔）</label>
                <input
                  className="input text-sm"
                  placeholder="如 MCP、toxR、N基因"
                  value={f('targetGene')}
                  onChange={e => setF('targetGene', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">物种/来源生物</label>
                  <input className="input text-sm" placeholder="如：Homo sapiens" value={f('species')} onChange={e => setF('species', e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">组织/基质/部位</label>
                  <input className="input text-sm" placeholder="如：血清、血浆、全血" value={f('tissue')} onChange={e => setF('tissue', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">浓度/含量</label>
                  <input className="input text-sm" placeholder="如：1×10^6 copies/mL" value={f('concentration')} onChange={e => setF('concentration', e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">体积/数量</label>
                  <input className="input text-sm" placeholder="如：500μL × 10管" value={f('volume')} onChange={e => setF('volume', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">保存条件</label>
                  <select className="input text-sm" value={f('storageCondition')} onChange={e => setF('storageCondition', e.target.value)}>
                    {STORAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">状态</label>
                  <select className="input text-sm" value={f('status')} onChange={e => setF('status', e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">采集/接收日期</label>
                  <input type="date" className="input text-sm" value={f('collectionDate')} onChange={e => setF('collectionDate', e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">有效期</label>
                  <input type="date" className="input text-sm" value={f('expiryDate')} onChange={e => setF('expiryDate', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label text-xs">来源/供应商</label>
                <input className="input text-sm" placeholder="如：ATCC、临床送样、自制" value={f('supplier')} onChange={e => setF('supplier', e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">备注</label>
                <textarea className="input text-sm h-16 resize-none" placeholder="其他说明..." value={f('notes')} onChange={e => setF('notes', e.target.value)} />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end bg-gray-50">
              <button type="button" onClick={closeEditor} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100">取消</button>
              <button
                type="submit"
                form="sample-form"
                onClick={save as any}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"
              >
                {editing ? '保存修改' : '创建样本'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
