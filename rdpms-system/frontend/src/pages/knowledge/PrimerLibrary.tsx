/**
 * PrimerLibrary — 引物探针设计库
 * 支持 CRUD、CSV 导入/导出、列设置、批量编辑
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { primerAPI, projectAPI } from '../../api/client';

const COLUMNS = [
  { key: 'projectName',        label: '所属项目',              mono: false, italic: false },
  { key: 'name',               label: '引物名称',              mono: false, italic: false, required: true },
  { key: 'sequence',           label: "5'-3'序列",             mono: true,  italic: false, required: true },
  { key: 'targetGene',         label: '目标基因',              mono: false, italic: false },
  { key: 'modification5',      label: "5'标记",                mono: false, italic: false },
  { key: 'modification3',      label: "3'标记",                mono: false, italic: false },
  { key: 'ampliconLength',     label: 'PCR长度(bp)',           mono: false, italic: false, type: 'number' },
  { key: 'speciesLatinName',   label: '物种拉丁名',            mono: false, italic: true },
  { key: 'speciesChineseName', label: '物种中文名',            mono: false, italic: false },
  { key: 'speciesTaxid',       label: '物种taxid',             mono: false, italic: false },
  { key: 'atccStrain',         label: 'ATCC标准菌株',          mono: false, italic: false },
  { key: 'validatedStrain',    label: '验证菌株',              mono: false, italic: false },
  { key: 'synthesisAmount',    label: '合成量',                mono: false, italic: false },
  { key: 'synthesisCompany',   label: '合成公司',              mono: false, italic: false },
  { key: 'tubeCount',          label: '管数',                  mono: false, italic: false, type: 'number' },
  { key: 'notes',              label: '备注',                  mono: false, italic: false },
];

// 默认显示的列（可通过列设置调整）
const DEFAULT_VISIBLE_COLS = ['projectName', 'name', 'sequence', 'targetGene', 'modification5', 'modification3', 'ampliconLength', 'synthesisCompany'];

// 支持批量编辑的字段
const BATCH_FIELDS = [
  { key: 'projectName',        label: '所属项目',   type: 'project' },
  { key: 'targetGene',         label: '目标基因',   type: 'text' },
  { key: 'synthesisCompany',   label: '合成公司',   type: 'text' },
  { key: 'synthesisAmount',    label: '合成量',     type: 'text' },
  { key: 'speciesLatinName',   label: '物种拉丁名', type: 'text' },
  { key: 'speciesChineseName', label: '物种中文名', type: 'text' },
  { key: 'speciesTaxid',       label: '物种taxid',  type: 'text' },
  { key: 'validatedStrain',    label: '验证菌株',   type: 'text' },
  { key: 'atccStrain',         label: 'ATCC标准菌株', type: 'text' },
];

const EMPTY_FORM = () => ({
  name: '', sequence: '', targetGene: '',
  modification5: '', modification3: '', ampliconLength: '',
  speciesLatinName: '', speciesChineseName: '', speciesTaxid: '',
  atccStrain: '', validatedStrain: '',
  synthesisAmount: '', synthesisCompany: '', tubeCount: '', notes: '',
});

export default function PrimerLibrary() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>(EMPTY_FORM());
  // 项目多选（保存时合并为逗号分隔字符串）
  const [selectedProjectNames, setSelectedProjectNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // 项目下拉
  const [projects, setProjects] = useState<any[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropRef = useRef<HTMLDivElement>(null);

  // ── 筛选 ──
  const [filterProject, setFilterProject] = useState('');
  const [showProjectFilter, setShowProjectFilter] = useState(false);
  const projectFilterRef = useRef<HTMLDivElement>(null);

  // ── 列设置 ──
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('primerLibCols') || 'null') || DEFAULT_VISIBLE_COLS; }
    catch { return DEFAULT_VISIBLE_COLS; }
  });
  const [showColSettings, setShowColSettings] = useState(false);
  const colSettingsRef = useRef<HTMLDivElement>(null);

  // ── 批量编辑 ──
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchEditField, setBatchEditField] = useState('');
  const [batchEditValue, setBatchEditValue] = useState('');
  const [batchProjectNames, setBatchProjectNames] = useState<string[]>([]);
  const [batchProjectSearch, setBatchProjectSearch] = useState('');
  const [batchProjectDropOpen, setBatchProjectDropOpen] = useState(false);
  const batchProjectDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
    loadProjects();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectDropRef.current && !projectDropRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (projectFilterRef.current && !projectFilterRef.current.contains(e.target as Node)) {
        setShowProjectFilter(false);
      }
      if (colSettingsRef.current && !colSettingsRef.current.contains(e.target as Node)) {
        setShowColSettings(false);
      }
      if (batchProjectDropRef.current && !batchProjectDropRef.current.contains(e.target as Node)) {
        setBatchProjectDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadProjects = async () => {
    try {
      const res = await projectAPI.list({ pageSize: 200 }) as any;
      setProjects(res.list || res.projects || []);
    } catch { setProjects([]); }
  };

  const load = async (kw?: string) => {
    setLoading(true);
    try {
      const res = await primerAPI.list({ keyword: kw ?? keyword }) as any;
      setList(res.list || []);
    } catch { setList([]); }
    setLoading(false);
  };

  const handleSearch = () => load(keyword);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM());
    setSelectedProjectNames([]);
    setProjectSearch('');
    setShowModal(true);
  };
  const openEdit = (row: any) => {
    setEditing(row);
    setForm({ ...EMPTY_FORM(), ...row, ampliconLength: row.ampliconLength ?? '', tubeCount: row.tubeCount ?? '' });
    const names = row.projectName
      ? row.projectName.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    setSelectedProjectNames(names);
    setProjectSearch('');
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditing(null); setShowProjectDropdown(false); };

  const handleSave = async () => {
    if (!form.name || !form.sequence) { alert('引物名称和序列为必填项'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        projectName: selectedProjectNames.join(', '),
        ampliconLength: form.ampliconLength ? parseInt(form.ampliconLength) : null,
        tubeCount: form.tubeCount ? parseInt(form.tubeCount) : null,
      };
      if (editing) {
        await primerAPI.update(editing.id, payload);
      } else {
        await primerAPI.create(payload);
      }
      closeModal();
      load();
    } catch (e: any) { alert(e.message || '保存失败'); }
    setSaving(false);
  };

  const toggleProject = (name: string) => {
    setSelectedProjectNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该引物记录？')) return;
    await primerAPI.delete(id);
    load();
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.length} 条记录？`)) return;
    await Promise.all(selectedIds.map(id => primerAPI.delete(id)));
    setSelectedIds([]);
    load();
  };

  const handleBatchEdit = async () => {
    if (selectedIds.length === 0 || !batchEditField) return;
    const value = batchEditField === 'projectName'
      ? batchProjectNames.join(', ')
      : batchEditValue;
    try {
      await Promise.all(selectedIds.map(id => primerAPI.update(id, { [batchEditField]: value })));
      setShowBatchEdit(false);
      setBatchEditField('');
      setBatchEditValue('');
      setBatchProjectNames([]);
      load();
    } catch (e: any) { alert(e.message || '批量编辑失败'); }
  };

  // 列设置：持久化到 localStorage
  const saveVisibleCols = useCallback((cols: string[]) => {
    setVisibleCols(cols);
    localStorage.setItem('primerLibCols', JSON.stringify(cols));
  }, []);
  const toggleColVisible = (key: string) => {
    saveVisibleCols(visibleCols.includes(key) ? visibleCols.filter(k => k !== key) : [...visibleCols, key]);
  };
  const moveCol = (key: string, dir: -1 | 1) => {
    const arr = [...visibleCols];
    const i = arr.indexOf(key);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    saveVisibleCols(arr);
  };

  // 当前显示的列（按 visibleCols 顺序）
  const activeColumns = COLUMNS.filter(c => visibleCols.includes(c.key))
    .sort((a, b) => visibleCols.indexOf(a.key) - visibleCols.indexOf(b.key));

  // 从已加载列表中提取所有项目名（用于筛选下拉）
  const projectOptions = Array.from(new Set(
    list.flatMap(r => (r.projectName || '').split(',').map((s: string) => s.trim()).filter(Boolean))
  )).sort();

  // 按项目筛选
  const displayList = filterProject
    ? list.filter(r => (r.projectName || '').split(',').map((s: string) => s.trim()).includes(filterProject))
    : list;

  // CSV 导出
  const handleExport = () => {
    const headers = COLUMNS.map(c => c.label);
    const rows = list.map(r => COLUMNS.map(c => r[c.key] ?? ''));
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `引物探针库_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.csv`;
    a.click();
  };

  // CSV 导入
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        // 去除 BOM，统一换行为 \n（兼容 Windows \r\n 和旧 Mac \r）
        const text = (ev.target?.result as string)
          .replace(/^\uFEFF/, '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { alert('CSV 文件无数据行'); return; }
        const keys = COLUMNS.map(c => c.key);

        // 更健壮的 CSV 逐字段解析（支持引号内含逗号/换行）
        const parseRow = (line: string): string[] => {
          const result: string[] = [];
          let cur = '';
          let inQuote = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuote) {
              if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }  // "" → 转义引号
                else { inQuote = false; }
              } else {
                cur += ch;
              }
            } else {
              if (ch === '"') { inQuote = true; }
              else if (ch === ',') { result.push(cur); cur = ''; }
              else { cur += ch; }
            }
          }
          result.push(cur);
          return result;
        };

        const rows = lines.slice(1).map(line => {
          const vals = parseRow(line);
          const obj: Record<string, any> = {};
          keys.forEach((k, i) => { obj[k] = (vals[i] ?? '').trim(); });
          return obj;
        }).filter(r => r.name && r.sequence);
        if (rows.length === 0) { alert('没有有效数据行（名称和序列不能为空）'); return; }
        await primerAPI.batchImport(rows);
        alert(`成功导入 ${rows.length} 条记录`);
        load();
      } catch (e: any) { alert('导入失败: ' + e.message); }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const toggleSelect = (id: string) =>
    setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () =>
    setSelectedIds(selectedIds.length === displayList.length && displayList.length > 0 ? [] : displayList.map(r => r.id));

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const filteredProjects = projects.filter(p =>
    !projectSearch || (p.name || '').toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── 工具栏 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* 搜索框 */}
        <div style={{ position: 'relative', flex: '0 0 220px' }}>
          <input
            value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜索引物名称、序列、目标基因..."
            style={{ width: '100%', padding: '7px 12px 7px 34px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        {/* 所属项目筛选 */}
        <div ref={projectFilterRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowProjectFilter(v => !v)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: filterProject ? '#eff6ff' : '#f8fafc', color: filterProject ? '#1d4ed8' : '#64748b', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            {filterProject || '所属项目'}
            {filterProject && (
              <span onClick={e => { e.stopPropagation(); setFilterProject(''); }} style={{ marginLeft: 2, fontSize: 14, color: '#3b82f6', lineHeight: 1 }}>×</span>
            )}
          </button>
          {showProjectFilter && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 200, minWidth: 180, maxHeight: 280, overflowY: 'auto' }}>
              <div
                onClick={() => { setFilterProject(''); setShowProjectFilter(false); }}
                style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: !filterProject ? '#1d4ed8' : '#374151', fontWeight: !filterProject ? 600 : 400, borderBottom: '1px solid #f3f4f6' }}
              >全部项目</div>
              {projectOptions.length === 0
                ? <div style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 12 }}>暂无项目数据</div>
                : projectOptions.map(name => (
                  <div
                    key={name}
                    onClick={() => { setFilterProject(name); setShowProjectFilter(false); }}
                    style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: filterProject === name ? '#1d4ed8' : '#374151', fontWeight: filterProject === name ? 600 : 400, background: filterProject === name ? '#eff6ff' : 'transparent' }}
                  >{name}</div>
                ))
              }
            </div>
          )}
        </div>
        <button onClick={handleSearch} style={{ padding: '7px 14px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>搜索</button>
        <button onClick={openNew} style={{ padding: '7px 14px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>＋ 新建引物</button>
        <button onClick={handleExport} style={{ padding: '7px 14px', borderRadius: 8, background: '#0ea5e9', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>导出CSV</button>
        <button onClick={() => fileRef.current?.click()} style={{ padding: '7px 14px', borderRadius: 8, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>导入CSV</button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportFile} />

        {/* 列设置按钮 */}
        <div ref={colSettingsRef} style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onClick={() => setShowColSettings(v => !v)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: showColSettings ? '#eff6ff' : '#f8fafc', color: showColSettings ? '#1d4ed8' : '#64748b', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
            列设置
          </button>
          {/* 列设置面板 */}
          {showColSettings && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 300, width: 260, padding: '12px 0' }}>
              <div style={{ padding: '4px 14px 10px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>列显示设置</span>
                <button onClick={() => saveVisibleCols(DEFAULT_VISIBLE_COLS)} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>重置默认</button>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {COLUMNS.map((col) => {
                  const isVisible = visibleCols.includes(col.key);
                  const vIdx = visibleCols.indexOf(col.key);
                  return (
                    <div key={col.key} style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', gap: 6 }}>
                      <input type="checkbox" checked={isVisible} onChange={() => toggleColVisible(col.key)} style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: isVisible ? '#374151' : '#94a3b8' }}>{col.label}</span>
                      {isVisible && (
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button onClick={() => moveCol(col.key, -1)} disabled={vIdx === 0} style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: vIdx === 0 ? 'not-allowed' : 'pointer', fontSize: 12, color: vIdx === 0 ? '#cbd5e1' : '#374151', lineHeight: 1 }}>↑</button>
                          <button onClick={() => moveCol(col.key, 1)} disabled={vIdx === visibleCols.length - 1} style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: vIdx === visibleCols.length - 1 ? 'not-allowed' : 'pointer', fontSize: 12, color: vIdx === visibleCols.length - 1 ? '#cbd5e1' : '#374151', lineHeight: 1 }}>↓</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: '8px 14px 0', borderTop: '1px solid #f3f4f6', fontSize: 11, color: '#94a3b8' }}>
                已显示 {visibleCols.length} / {COLUMNS.length} 列 · 设置自动保存
              </div>
            </div>
          )}
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>共 {displayList.length} 条记录</span>
      </div>

      {/* ── 批量操作栏（选中时出现） ── */}
      {selectedIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff', padding: '8px 14px', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>已选 {selectedIds.length} 条</span>
          <button
            onClick={() => { setShowBatchEdit(true); setBatchEditField(''); setBatchEditValue(''); setBatchProjectNames([]); }}
            style={{ padding: '5px 12px', borderRadius: 6, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >批量编辑</button>
          <button
            onClick={handleBatchDelete}
            style={{ padding: '5px 12px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
          >删除选中</button>
          <button
            onClick={() => setSelectedIds([])}
            style={{ padding: '5px 10px', borderRadius: 6, background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', cursor: 'pointer', fontSize: 12 }}
          >取消选中</button>
        </div>
      )}

      {/* ── 表格 ── */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
              <th style={{ padding: '10px 8px', borderBottom: '2px solid #e2e8f0', width: 36, textAlign: 'center' }}>
                <input type="checkbox" checked={displayList.length > 0 && selectedIds.length === displayList.length} onChange={toggleAll} />
              </th>
              {activeColumns.map(col => (
                <th key={col.key} style={{ padding: '10px 10px', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', textAlign: 'left', color: '#374151', fontWeight: 600, fontSize: 12 }}>
                  {col.label}
                </th>
              ))}
              <th style={{ padding: '10px 8px', borderBottom: '2px solid #e2e8f0', width: 80, textAlign: 'center', color: '#374151' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={activeColumns.length + 2} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>加载中...</td></tr>
            ) : displayList.length === 0 ? (
              <tr><td colSpan={activeColumns.length + 2} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 16, marginBottom: 8 }}>暂无引物记录</div>
                <button onClick={openNew} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>+ 添加第一条记录</button>
              </td></tr>
            ) : (
              displayList.map((row, ri) => (
                <tr key={row.id} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : '#f8fafc')}
                >
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelect(row.id)} />
                  </td>
                  {activeColumns.map(col => (
                    <td key={col.key} style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: col.key === 'sequence' ? 'nowrap' : 'normal', maxWidth: col.key === 'sequence' ? 300 : col.key === 'notes' ? 200 : 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {col.key === 'projectName' && row[col.key] ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {String(row[col.key]).split(',').map((n: string, i: number) => (
                            <span key={i} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 8, background: '#dbeafe', color: '#1d4ed8', whiteSpace: 'nowrap' }}>{n.trim()}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontFamily: col.mono ? 'monospace' : undefined, fontStyle: col.italic ? 'italic' : undefined, color: col.key === 'name' ? '#1e40af' : '#374151', fontWeight: col.key === 'name' ? 600 : 400 }}>
                          {row[col.key] != null && row[col.key] !== '' ? row[col.key] : <span style={{ color: '#cbd5e1' }}>-</span>}
                        </span>
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(row)} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, marginRight: 4 }}>编辑</button>
                    <button onClick={() => handleDelete(row.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>删除</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── 批量编辑弹窗 ── */}
      {showBatchEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 'min(96vw, 480px)', background: '#fff', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>批量编辑</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>将对已选 {selectedIds.length} 条记录统一修改</div>
              </div>
              <button onClick={() => setShowBatchEdit(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 选择字段 */}
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6, fontWeight: 600 }}>选择要编辑的字段</label>
                <select
                  value={batchEditField}
                  onChange={e => { setBatchEditField(e.target.value); setBatchEditValue(''); setBatchProjectNames([]); }}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff' }}
                >
                  <option value="">-- 请选择要修改的字段 --</option>
                  {BATCH_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
              {/* 输入新值 */}
              {batchEditField && (() => {
                const fieldDef = BATCH_FIELDS.find(f => f.key === batchEditField)!;
                if (fieldDef.type === 'project') {
                  const filteredProjs = projects.filter(p => !batchProjectSearch || (p.name || '').toLowerCase().includes(batchProjectSearch.toLowerCase()));
                  return (
                    <div>
                      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                        新的所属项目
                        <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 400, marginLeft: 6 }}>（将覆盖原有项目）</span>
                      </label>
                      {batchProjectNames.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                          {batchProjectNames.map(name => (
                            <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: '#dbeafe', color: '#1d4ed8', fontSize: 12 }}>
                              {name}
                              <button onClick={() => setBatchProjectNames(p => p.filter(n => n !== name))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 0, fontSize: 14 }}>×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div ref={batchProjectDropRef} style={{ position: 'relative' }}>
                        <div onClick={() => setBatchProjectDropOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', background: '#f8fafc', fontSize: 13, color: '#64748b' }}>
                          <span>{batchProjectNames.length === 0 ? '点击选择项目...' : `已选 ${batchProjectNames.length} 个`}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </div>
                        {batchProjectDropOpen && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 100, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff' }}>
                              <input value={batchProjectSearch} onChange={e => setBatchProjectSearch(e.target.value)} placeholder="搜索项目..." style={{ width: '100%', padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()} />
                            </div>
                            {filteredProjs.map((proj: any) => {
                              const checked = batchProjectNames.includes(proj.name);
                              return (
                                <label key={proj.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, background: checked ? '#eff6ff' : 'transparent' }}>
                                  <input type="checkbox" checked={checked} onChange={() => setBatchProjectNames(p => checked ? p.filter(n => n !== proj.name) : [...p, proj.name])} style={{ width: 14, height: 14 }} />
                                  <span style={{ color: checked ? '#1d4ed8' : '#374151', fontWeight: checked ? 600 : 400 }}>{proj.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6, fontWeight: 600 }}>新的{fieldDef.label}</label>
                    <input
                      value={batchEditValue}
                      onChange={e => setBatchEditValue(e.target.value)}
                      placeholder={`输入新的${fieldDef.label}...`}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>⚠ 将覆盖所选 {selectedIds.length} 条记录的原有值</div>
                  </div>
                );
              })()}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, background: '#fafafa', borderRadius: '0 0 14px 14px' }}>
              <button onClick={() => setShowBatchEdit(false)} style={{ padding: '8px 22px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>取消</button>
              <button
                onClick={handleBatchEdit}
                disabled={!batchEditField || (batchEditField === 'projectName' ? batchProjectNames.length === 0 : !batchEditValue.trim())}
                style={{ padding: '8px 24px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (!batchEditField || (batchEditField === 'projectName' ? batchProjectNames.length === 0 : !batchEditValue.trim())) ? 0.5 : 1 }}
              >确认批量修改</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 新建/编辑弹窗 ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: 'min(96vw, 780px)', maxHeight: '90vh', background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
            {/* 头部 */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{editing ? '编辑引物记录' : '新建引物记录'}</span>
              <button onClick={closeModal} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>

            {/* 内容（可滚动） */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* 所属项目（多选） */}
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  所属项目
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>（可关联多个项目）</span>
                </label>
                {selectedProjectNames.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {selectedProjectNames.map(name => (
                      <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: '#dbeafe', color: '#1d4ed8', fontSize: 12, fontWeight: 500 }}>
                        {name}
                        <button onClick={() => toggleProject(name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 0, fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div ref={projectDropRef} style={{ position: 'relative' }}>
                  <div
                    onClick={() => setShowProjectDropdown(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', background: '#f8fafc', fontSize: 13, color: '#64748b', userSelect: 'none' }}
                  >
                    <span>{selectedProjectNames.length === 0 ? '点击选择关联项目...' : `已选 ${selectedProjectNames.length} 个项目`}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showProjectDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  {showProjectDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 100, maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
                      <div style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff' }}>
                        <input
                          value={projectSearch}
                          onChange={e => setProjectSearch(e.target.value)}
                          placeholder="搜索项目名称..."
                          style={{ width: '100%', padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      {filteredProjects.length === 0 ? (
                        <div style={{ padding: '12px 14px', color: '#94a3b8', fontSize: 13 }}>没有匹配的项目</div>
                      ) : (
                        filteredProjects.map((proj: any) => {
                          const checked = selectedProjectNames.includes(proj.name);
                          return (
                            <label key={proj.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13, color: '#374151', background: checked ? '#eff6ff' : 'transparent' }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleProject(proj.name)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
                              <div>
                                <div style={{ fontWeight: checked ? 600 : 400, color: checked ? '#1d4ed8' : '#374151' }}>{proj.name}</div>
                                {proj.code && <div style={{ fontSize: 11, color: '#94a3b8' }}>{proj.code}</div>}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 基本信息 */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>基本信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="引物名称 *" value={form.name} onChange={v => f('name', v)} placeholder="如 O157_F3" />
                  <Field label="目标基因" value={form.targetGene} onChange={v => f('targetGene', v)} placeholder="如 rfbE" />
                </div>
                <Field label="5'-3' 核酸序列 *" value={form.sequence} onChange={v => f('sequence', v)} placeholder="输入核苷酸序列（5'→3' 方向）" mono />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="5' 标记" value={form.modification5} onChange={v => f('modification5', v)} placeholder="如 FAM" />
                  <Field label="3' 标记" value={form.modification3} onChange={v => f('modification3', v)} placeholder="如 BHQ1" />
                  <Field label="PCR 长度 (bp)" value={form.ampliconLength} onChange={v => f('ampliconLength', v)} type="number" placeholder="扩增子长度" />
                </div>
              </div>

              {/* 合成信息 */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>合成信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="合成公司" value={form.synthesisCompany} onChange={v => f('synthesisCompany', v)} placeholder="如 生工生物" />
                  <Field label="合成量" value={form.synthesisAmount} onChange={v => f('synthesisAmount', v)} placeholder="如 200nmol" />
                  <Field label="管数" value={form.tubeCount} onChange={v => f('tubeCount', v)} type="number" placeholder="管数" />
                </div>
              </div>

              {/* 物种信息 */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>物种信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="物种拉丁名" value={form.speciesLatinName} onChange={v => f('speciesLatinName', v)} placeholder="如 E. coli O157:H7/NM" italic />
                  <Field label="物种中文名" value={form.speciesChineseName} onChange={v => f('speciesChineseName', v)} placeholder="如 大肠杆菌O157:H7/NM" />
                </div>
                <Field label="物种 taxid" value={form.speciesTaxid} onChange={v => f('speciesTaxid', v)} placeholder="如 83334" />
              </div>

              {/* 验证信息 */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>验证信息</div>
                <Field label="ATCC 标准菌株 / 参考菌株" value={form.atccStrain} onChange={v => f('atccStrain', v)} placeholder="如 ATCC 25922；rfbE (+), stx1 (+)..." />
                <Field label="验证菌株" value={form.validatedStrain} onChange={v => f('validatedStrain', v)} placeholder="验证时使用的菌株信息" />
              </div>

              <Field label="备注" value={form.notes} onChange={v => f('notes', v)} placeholder="其他说明" textarea />
            </div>

            {/* 底部操作 */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, background: '#fafafa', borderRadius: '0 0 14px 14px' }}>
              <button onClick={closeModal} style={{ padding: '8px 22px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>取消</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 28px', borderRadius: 8, background: '#3b82f6', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                {saving ? '保存中...' : editing ? '保存修改' : '创建记录'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 简单表单字段组件
function Field({ label, value, onChange, placeholder, type = 'text', mono, italic, textarea }: {
  label: string; value: any; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean; italic?: boolean; textarea?: boolean;
}) {
  const style: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none',
    fontFamily: mono ? 'monospace' : undefined,
    fontStyle: italic ? 'italic' : undefined,
    boxSizing: 'border-box',
  };
  return (
    <div>
      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4, fontWeight: 500 }}>{label}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...style, minHeight: 72, resize: 'vertical' }} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />
      )}
    </div>
  );
}
