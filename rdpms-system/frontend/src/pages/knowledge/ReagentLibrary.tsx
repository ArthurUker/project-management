import React, { useEffect, useRef, useState } from 'react';
import { reagentMaterialsAPI } from '../../api/client';

type ColumnKey =
  | 'commonName'
  | 'chineseName'
  | 'englishName'
  | 'category'
  | 'casNumber'
  | 'molecularFormula'
  | 'mw'
  | 'state'
  | 'defaultStockConc'
  | 'supplier';

type TableColumn = {
  key: ColumnKey;
  label: string;
  sortField: string;
  thClassName?: string;
  tdClassName?: string;
  renderCell: (row: any) => React.ReactNode;
};

type DefaultMaterial = {
  commonName: string;
  chineseName: string;
  englishName: string;
  category?: string;
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
  { commonName:'Tris', chineseName:'三羟甲基氨基甲烷', englishName:'Tris base', category:'缓冲体系', mw:121.14 },
  { commonName:'NaCl', chineseName:'氯化钠', englishName:'Sodium Chloride', category:'盐类', mw:58.44 },
  { commonName:'KCl', chineseName:'氯化钾', englishName:'Potassium Chloride', category:'盐类', mw:74.55 },
  { commonName:'EDTA', chineseName:'乙二胺四乙酸二钠', englishName:'Ethylenediaminetetraacetic acid disodium salt', category:'螯合剂', mw:372.24 },
  { commonName:'MgCl2', chineseName:'氯化镁', englishName:'Magnesium Chloride', category:'盐类', mw:203.30 },
  { commonName:'CaCl2', chineseName:'氯化钙', englishName:'Calcium Chloride', category:'盐类', mw:110.98 },
  { commonName:'HEPES', chineseName:'羟乙基哌嗪乙硫磺酸', englishName:'4-(2-hydroxyethyl)-1-piperazineethanesulfonic acid', category:'缓冲体系', mw:238.30 },
  { commonName:'SDS', chineseName:'十二烷基硫酸钠', englishName:'Sodium Dodecyl Sulfate', category:'去污剂', mw:288.38 },
  { commonName:'DTT', chineseName:'二硫苏糖醇', englishName:'Dithiothreitol', category:'稳定剂', mw:154.25 },
  { commonName:'β-ME', chineseName:'β-巯基乙醇', englishName:'Beta-Mercaptoethanol', category:'稳定剂', mw:78.13 },
  { commonName:'GITC', chineseName:'异硫氰酸胍', englishName:'Guanidinium isothiocyanate', category:'变性剂', mw:118.16 },
  { commonName:'尿素', chineseName:'尿素', englishName:'Urea', category:'变性剂', mw:60.06 },
  { commonName:'蔗糖', chineseName:'蔗糖', englishName:'Sucrose', category:'稳定剂', mw:342.30 },
  { commonName:'甘油', chineseName:'甘油', englishName:'Glycerol', category:'稳定剂', mw:92.09, state:'liquid', density:1.261 },
  { commonName:'BSA', chineseName:'牛血清白蛋白', englishName:'Bovine Serum Albumin', category:'酶/蛋白', mw:66430 },
  { commonName:'Tween-20', chineseName:'吐温-20', englishName:'Polyoxyethylene sorbitan monolaurate', category:'去污剂', mw:1228.0, state:'liquid' },
  { commonName:'Triton X-100', chineseName:'曲拉通X-100', englishName:'Polyethylene glycol tert-octylphenyl ether', category:'去污剂', mw:625.0, state:'liquid' },
  { commonName:'NaOH', chineseName:'氢氧化钠', englishName:'Sodium Hydroxide', category:'pH调节剂', mw:40.00 },
  { commonName:'HCl', chineseName:'盐酸', englishName:'Hydrochloric acid', category:'pH调节剂', mw:36.46, state:'liquid', density:1.19 },
  { commonName:'KH2PO4', chineseName:'磷酸二氢钾', englishName:'Potassium dihydrogen phosphate', category:'盐类', mw:136.09 },
  { commonName:'Na2HPO4', chineseName:'磷酸氢二钠', englishName:'Disodium hydrogen phosphate', category:'盐类', mw:141.96 },
];

const STOCK_UNIT_OPTIONS = [
  { value: 'M', label: 'M' },
  { value: 'mM', label: 'mM' },
  { value: '%', label: '% (m/v)' },
  { value: 'mg/mL', label: 'mg/mL' },
];

const CATEGORY_OPTIONS = [
  '未分类',
  '缓冲体系',
  '盐类',
  '去污剂',
  '变性剂',
  '螯合剂',
  '稳定剂',
  '酶/蛋白',
  'pH调节剂',
  '酸碱试剂',
  '培养基成分',
  '核酸沉淀剂',
  '还原剂',
  '材料',
  '电泳',
  '染料/指示剂',
  '其他',
];
const COLUMN_ORDER_STORAGE_KEY = 'reagentLibrary:columnOrder';
const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  'commonName',
  'chineseName',
  'englishName',
  'category',
  'casNumber',
  'molecularFormula',
  'mw',
  'state',
  'defaultStockConc',
  'supplier',
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('commonName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editing, setEditing] = useState<any | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTargets, setConfirmTargets] = useState<any[]>([]);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [forceDetails, setForceDetails] = useState<any[]>([]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);

  // 滚动位置保持：编辑保存后恢复原位
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

  const closeEditor = () => {
    setShowDrawer(false);
    setEditing(null);
  };

  const categoryOptions = React.useMemo(() => {
    const merged = new Set(CATEGORY_OPTIONS);
    list.forEach((item) => merged.add(item.category || '未分类'));
    return Array.from(merged);
  }, [list]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const incoming = parsed.filter((item): item is ColumnKey => DEFAULT_COLUMN_ORDER.includes(item));
      const missing = DEFAULT_COLUMN_ORDER.filter((item) => !incoming.includes(item));
      const nextOrder = [...incoming, ...missing];

      if (nextOrder.length === DEFAULT_COLUMN_ORDER.length) {
        setColumnOrder(nextOrder);
      }
    } catch (err) {
      // ignore invalid local storage data
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch (err) {
      // ignore write failure
    }
  }, [columnOrder]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await reagentMaterialsAPI.list({
        keyword,
        category: categoryFilter,
        state: stateFilter,
        sortBy,
        sortOrder,
      });
      const items = res.list || [];

      // 如果数据库为空，按需初始化默认数据
      if (items.length === 0) {
        for (const m of DEFAULT_MATERIALS) {
          try {
            await reagentMaterialsAPI.create({
              commonName: m.commonName,
              chineseName: m.chineseName || null,
              englishName: m.englishName || null,
              category: m.category || '未分类',
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
        const res2 = await reagentMaterialsAPI.list({
          keyword,
          category: categoryFilter,
          state: stateFilter,
          sortBy,
          sortOrder,
        });
        const nextList = res2.list || [];
        setList(nextList);
        setSelectedIds(prev => prev.filter(id => nextList.some((item: any) => item.id === id)));
      } else {
        setList(items);
        setSelectedIds(prev => prev.filter(id => items.some((item: any) => item.id === id)));
      }
      // 恢复保存前的滚动位置
      if (savedScrollRef.current !== null) {
        const pos = savedScrollRef.current;
        savedScrollRef.current = null;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const parent = findScrollParent(containerRef.current);
          if (parent) parent.scrollTop = pos;
        }));
      }
    } catch (e) {
      console.error('加载试剂原料失败', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [categoryFilter, stateFilter, sortBy, sortOrder]);

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
      // 保存当前滚动位置，load() 完成后恢复
      savedScrollRef.current = findScrollParent(containerRef.current)?.scrollTop ?? null;
      closeEditor();
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

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(field);
    setSortOrder('asc');
  };

  const renderSortHeader = (field: string, label: string) => {
    const isActive = sortBy === field;
    return (
      <button
        type="button"
        className={`flex items-center gap-1 font-semibold ${isActive ? 'text-primary-700' : 'text-gray-900'}`}
        onClick={() => handleSort(field)}
      >
        <span>{label}</span>
        <span className={`text-xs ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>{isActive ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    );
  };

  const moveColumn = (key: ColumnKey, direction: 'left' | 'right') => {
    setColumnOrder((prev) => {
      const index = prev.indexOf(key);
      if (index === -1) return prev;

      if (direction === 'left' && index === 0) return prev;
      if (direction === 'right' && index === prev.length - 1) return prev;

      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const resetColumnOrder = () => {
    setColumnOrder(DEFAULT_COLUMN_ORDER);
  };

  const columnsByKey = React.useMemo<Record<ColumnKey, TableColumn>>(() => ({
    commonName: {
      key: 'commonName',
      label: '常用名',
      sortField: 'commonName',
      tdClassName: 'p-2 whitespace-nowrap',
      renderCell: (row) => row.commonName || row.name,
    },
    chineseName: {
      key: 'chineseName',
      label: '中文名称',
      sortField: 'chineseName',
      tdClassName: 'p-2 whitespace-nowrap',
      renderCell: (row) => row.chineseName || '',
    },
    englishName: {
      key: 'englishName',
      label: '英文名称',
      sortField: 'englishName',
      tdClassName: 'p-2',
      renderCell: (row) => row.englishName || '',
    },
    category: {
      key: 'category',
      label: '试剂分类',
      sortField: 'category',
      tdClassName: 'p-2 whitespace-nowrap',
      renderCell: (row) => row.category || '未分类',
    },
    casNumber: {
      key: 'casNumber',
      label: 'CAS号',
      sortField: 'casNumber',
      tdClassName: 'p-2 whitespace-nowrap',
      renderCell: (row) => row.casNumber || '',
    },
    molecularFormula: {
      key: 'molecularFormula',
      label: '分子式',
      sortField: 'molecularFormula',
      tdClassName: 'p-2 whitespace-nowrap',
      renderCell: (row) => row.molecularFormula || '',
    },
    mw: {
      key: 'mw',
      label: 'MW (g/mol)',
      sortField: 'mw',
      tdClassName: 'p-2 whitespace-nowrap',
      renderCell: (row) => row.mw ?? '-',
    },
    state: {
      key: 'state',
      label: '物态',
      sortField: 'state',
      tdClassName: 'p-2 whitespace-nowrap',
      renderCell: (row) => (
        <span className={`px-2 py-1 rounded-full text-xs ${stateBadge(row.state)}`}>{row.state}</span>
      ),
    },
    defaultStockConc: {
      key: 'defaultStockConc',
      label: '默认储液浓度',
      sortField: 'defaultStockConc',
      tdClassName: 'p-2 whitespace-nowrap',
      renderCell: (row) => (row.defaultStockConc != null ? `${row.defaultStockConc}${row.defaultStockUnit ? ' ' + row.defaultStockUnit : ''}` : '-'),
    },
    supplier: {
      key: 'supplier',
      label: '供应商',
      sortField: 'supplier',
      tdClassName: 'p-2',
      renderCell: (row) => row.supplier || '',
    },
  }), []);

  const orderedColumns = React.useMemo(
    () => columnOrder.map((key) => columnsByKey[key]).filter(Boolean),
    [columnOrder, columnsByKey]
  );

  return (
    <div ref={containerRef}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="border p-2 rounded"
            placeholder="搜索常用名/中文名/英文名/CAS号"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
          <select className="border p-2 rounded bg-white" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">全部分类</option>
            {categoryOptions.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select className="border p-2 rounded bg-white" value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="all">全部物态</option>
            <option value="solid">固体</option>
            <option value="liquid">液体</option>
            <option value="solution">溶液</option>
          </select>
          <button className="btn" onClick={load}>搜索</button>
          <button
            type="button"
            className="px-3 py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            onClick={() => {
              setCategoryFilter('all');
              setStateFilter('all');
              setSortBy('commonName');
              setSortOrder('asc');
            }}
          >
            重置筛选
          </button>
        </div>
        {!hideTopButton && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              onClick={() => setShowColumnSettings(true)}
            >
              列设置
            </button>
            <button className="btn btn-primary" onClick={openNew}>+ 新增试剂原料</button>
          </div>
        )}
        {hideTopButton && (
          <div>
            <button
              type="button"
              className="px-3 py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              onClick={() => setShowColumnSettings(true)}
            >
              列设置
            </button>
          </div>
        )}
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

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-[1320px] w-full table-auto border-collapse">
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr className="bg-gray-100">
              <th className="p-2 text-left"> </th>
              {orderedColumns.map((column) => (
                <th key={column.key} className={`p-2 text-left ${column.thClassName || ''}`}>
                  {renderSortHeader(column.sortField, column.label)}
                </th>
              ))}
              <th className="p-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={orderedColumns.length + 2} className="p-4 text-center text-gray-500">加载中...</td></tr> : (
              list.map((r:any) => (
                <tr key={r.id} className="border-t border-gray-100 bg-white">
                  <td className="p-2"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                  {orderedColumns.map((column) => (
                    <td key={column.key} className={column.tdClassName || 'p-2'}>{column.renderCell(r)}</td>
                  ))}
                  <td className="p-2 whitespace-nowrap">
                    <button className="mr-2 text-primary-600" onClick={() => { setEditing(r); setShowDrawer(true); }}>编辑</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between border-b border-gray-100 bg-gradient-to-r from-slate-50 via-blue-50 to-white px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{editing ? '编辑试剂原料' : '新增试剂原料'}</h3>
                <p className="mt-1 text-sm text-gray-500">在不中断当前列表浏览的情况下维护试剂基础信息、储液属性和采购备注。</p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
                aria-label="关闭编辑弹窗"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={save} className="max-h-[82vh] overflow-y-auto">
              <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
                <div className="space-y-6">
                  <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">基础标识</h4>
                        <p className="mt-1 text-xs text-gray-500">常用名称、双语名称和化学标识用于列表检索与配方引用。</p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">必填项优先</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">常用名（必填）</label>
                        <input name="commonName" defaultValue={editing?.commonName || editing?.name || ''} placeholder="如 Tris、BSA、Tween-20" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">中文名称</label>
                        <input name="chineseName" defaultValue={editing?.chineseName || ''} placeholder="填写中文名称" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">英文名称</label>
                        <input name="englishName" defaultValue={editing?.englishName || ''} placeholder="填写英文名称" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">试剂分类</label>
                        <select name="category" defaultValue={editing?.category || '未分类'} className="input bg-white">
                          {categoryOptions.map(category => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">CAS号</label>
                        <input name="casNumber" defaultValue={editing?.casNumber || ''} placeholder="如 50-99-7" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">分子式</label>
                        <input name="molecularFormula" defaultValue={editing?.molecularFormula || ''} placeholder="如 C6H12O6" className="input" />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-900">理化属性</h4>
                      <p className="mt-1 text-xs text-gray-500">这些字段会影响配制计算、储液建议和下游配方使用体验。</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">MW (g/mol)（必填）</label>
                        <input name="mw" type="number" step="any" defaultValue={editing?.mw ?? ''} placeholder="例如 121.14" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">物态</label>
                        <select name="state" defaultValue={editing?.state || 'solid'} className="input bg-white">
                          <option value="solid">固体</option>
                          <option value="liquid">液体</option>
                          <option value="solution">溶液</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">密度 (g/mL)</label>
                        <input name="density" type="number" step="any" defaultValue={editing?.density ?? ''} placeholder="液体/溶液建议填写" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">纯度 (%)</label>
                        <input name="purity" type="number" step="any" defaultValue={editing?.purity ?? ''} placeholder="如 98、99.5" className="input" />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-900">储液与采购信息</h4>
                      <p className="mt-1 text-xs text-gray-500">用于指导标准储液准备、供应商信息记录和实验室内部备注。</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">默认储液浓度</label>
                        <input name="defaultStockConc" type="number" step="any" defaultValue={editing?.defaultStockConc ?? ''} placeholder="如 1、10、50" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">储液单位</label>
                        <select name="defaultStockUnit" defaultValue={editing?.defaultStockUnit ?? ''} className="input bg-white">
                          <option value="">请选择储液单位</option>
                          {STOCK_UNIT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">供应商</label>
                        <input name="supplier" defaultValue={editing?.supplier ?? ''} placeholder="记录供应商、货号或采购来源" className="input" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
                        <textarea name="notes" rows={5} defaultValue={editing?.notes ?? ''} placeholder="填写储存条件、配制注意事项、品牌偏好或替代建议" className="input min-h-[120px] resize-y" />
                      </div>
                    </div>
                  </section>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
                    <h4 className="text-sm font-semibold text-gray-900">编辑摘要</h4>
                    <div className="mt-4 space-y-3 text-sm text-gray-600">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">当前条目</div>
                        <div className="mt-1 font-medium text-gray-900">{editing?.commonName || editing?.name || '新建试剂原料'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">双语名称</div>
                        <div className="mt-1 leading-6">{editing?.chineseName || '未填写'} / {editing?.englishName || '未填写'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">试剂分类</div>
                        <div className="mt-1 leading-6">{editing?.category || '未分类'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">当前理化属性</div>
                        <div className="mt-1 leading-6">MW: {editing?.mw ?? '未填写'}，物态: {editing?.state || 'solid'}，纯度: {editing?.purity ?? '未填写'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-slate-50 p-5">
                    <h4 className="text-sm font-semibold text-gray-900">填写建议</h4>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
                      <li>优先补齐常用名、MW 和物态，这三项最影响后续配制计算。</li>
                      <li>液体或溶液建议填写密度，便于在质量和体积之间换算。</li>
                      <li>默认储液浓度建议与实验室常用 SOP 保持一致，减少重复确认。</li>
                      <li>备注里可写储存温度、避光要求、常见替代品和品牌要求。</li>
                    </ul>
                  </div>
                </aside>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4">
                <button type="button" className="btn btn-secondary" onClick={closeEditor}>取消</button>
                <button type="submit" className="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showColumnSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">列顺序设置</h3>
                <p className="mt-1 text-sm text-gray-500">把高频信息左移，低频信息右移。设置会自动保存到当前浏览器。</p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                onClick={() => setShowColumnSettings(false)}
                aria-label="关闭列设置"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="space-y-2">
                {columnOrder.map((key, index) => {
                  const column = columnsByKey[key];
                  return (
                    <div key={key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-gray-500">{index + 1}</span>
                        <span>{column.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={index === 0}
                          onClick={() => moveColumn(key, 'left')}
                        >
                          左移
                        </button>
                        <button
                          type="button"
                          className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={index === columnOrder.length - 1}
                          onClick={() => moveColumn(key, 'right')}
                        >
                          右移
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                className="rounded border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                onClick={resetColumnOrder}
              >
                恢复默认顺序
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowColumnSettings(false)}
              >
                完成
              </button>
            </div>
          </div>
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