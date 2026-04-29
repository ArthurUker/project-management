import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { docsAPI, formulaAPI } from '../api/client';
import { useAppStore } from '../store/appStore';
import ReagentLibrary from './knowledge/ReagentLibrary';
import TaskTemplateLibrary from './knowledge/TaskTemplateLibrary';
import PrimerLibrary from './knowledge/PrimerLibrary';
import AmplificationReagentLibrary from './knowledge/AmplificationReagentLibrary';
import VisualTableEditor, { type VisualTableEditorRef } from '../components/VisualTableEditor';
import { MindMapEditor } from '../components/MindMapView';
import { FlaskConical, Cpu, Dna, FileText, BookOpen, Package, ClipboardList, Dna as DnaIcon, Beaker } from 'lucide-react';
import { extractMindmapBlock, findMindmapBlocks, replaceMindmapBlock, hasMarkdownTable, upsertFirstMindmapBlock } from '../utils/markdownBlocks';

interface DocCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  _count?: { documents: number };
}

interface DocDocument {
  id: string;
  code: string;
  title: string;
  description?: string;
  docType: string;
  version: string;
  status: string;
  tags?: string;
  category: DocCategory;
  creator: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

const DOC_TYPES = [
  { id: 'sop', label: 'SOP标准操作规程', color: 'blue' },
  { id: 'template', label: '模板文件', color: 'green' },
  { id: 'guide', label: '操作指南', color: 'purple' },
  { id: 'reference', label: '技术参考', color: 'orange' },
];

const DEFAULT_CATEGORIES = [
  { name: '试剂组标准', description: '试剂组相关SOP和操作规范', icon: '🧪' },
  { name: '芯片测试', description: '芯片测试相关标准和方法', icon: '💠' },
  { name: '分子生物', description: '分子生物学实验方法', icon: '🧬' },
  { name: '通用模板', description: '通用文档模板', icon: '📋' },
  { name: '技术参考', description: '技术文档和参考资料', icon: '📚' },
  { name: '试剂原料库', description: '管理试剂原料信息（名称/分子量/CAS等）', icon: '🧴' },
  { name: '任务模板库', description: '管理可复用的任务流程模板', icon: '📋' },
  { name: '扩增反应体系试剂', description: '管理PCR/qPCR/LAMP等扩增反应专用试剂（酶、Buffer、dNTP等）', icon: '🔬' },
  { name: '引物探针库', description: '管理引物探针序列、修饰、合成信息等', icon: '🧫' },
];

export default function Docs() {
  const navigate = useNavigate();
  const { user } = useAppStore();

  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [documents, setDocuments] = useState<DocDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocDocument | null>(null);
  const [showFormulaPicker, setShowFormulaPicker] = useState(false);
  const [showMindmapEditor, setShowMindmapEditor] = useState(false);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [formulaList, setFormulaList] = useState<any[]>([]);
  const [formulaSearch, setFormulaSearch] = useState('');
  const [mindmapDraft, setMindmapDraft] = useState('# 根节点\n## 分支1\n## 分支2');
  const [tableDraft, setTableDraft] = useState('');
  const [activeMindmapIndex, setActiveMindmapIndex] = useState(0);
  const [mindmapBlockIndex, setMindmapBlockIndex] = useState(0);
  const tableEditorRef = useRef<VisualTableEditorRef>(null);
  const [reagentOpenKey, setReagentOpenKey] = useState(0);
  const [reagentCategoryId, setReagentCategoryId] = useState<string | null>(null);
  const [taskTemplateCategoryId, setTaskTemplateCategoryId] = useState<string | null>(null);
  const [ampReagentCategoryId, setAmpReagentCategoryId] = useState<string | null>(null);
  const [primerCategoryId, setPrimerCategoryId] = useState<string | null>(null);

  const [docForm, setDocForm] = useState({
    categoryId: '',
    code: '',
    title: '',
    description: '',
    docType: 'sop',
    content: '',
    tags: '',
    version: 'V1.0',
  });

  useEffect(() => {
    loadCategories();
    loadDocuments();
  }, [selectedCategory, filterType]);

  const loadCategories = async () => {
    try {
      const res = await docsAPI.categories.list();
      let cats = res.list || [];
      const existingNames = new Set(cats.map((c: DocCategory) => c.name));
      if (cats.length === 0 || existingNames.size < DEFAULT_CATEGORIES.length) {
        for (const cat of DEFAULT_CATEGORIES) {
          if (!existingNames.has(cat.name)) {
            try { await docsAPI.categories.create(cat); } catch (e: any) { if (!e.message?.includes('已存在')) console.error('创建分类失败:', e); }
          }
        }
        const res2 = await docsAPI.categories.list();
        cats = res2.list || [];
      }
      // 去重
      const seen = new Set();
      cats = cats.filter((cat: DocCategory) => { if (seen.has(cat.name)) return false; seen.add(cat.name); return true; });
      setCategories(cats);
      const reagent = cats.find((c: DocCategory) => c.name === '试剂原料库'); if (reagent) setReagentCategoryId(reagent.id);
      const tpl = cats.find((c: DocCategory) => c.name === '任务模板库'); if (tpl) setTaskTemplateCategoryId(tpl.id);
      const amp = cats.find((c: DocCategory) => c.name === '扩增反应体系试剂'); if (amp) setAmpReagentCategoryId(amp.id);
      const primer = cats.find((c: DocCategory) => c.name === '引物探针库'); if (primer) setPrimerCategoryId(primer.id);
      if (cats.length > 0 && !selectedCategory) setSelectedCategory(cats[0].id);
    } catch (error) { console.error('加载分类失败:', error); }
  };

  const loadDocuments = async () => {
    if (selectedCategory && reagentCategoryId && selectedCategory === reagentCategoryId) { setDocuments([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (selectedCategory) params.categoryId = selectedCategory;
      if (filterType) params.docType = filterType;
      if (searchKeyword) params.keyword = searchKeyword;
      const res = await docsAPI.documents.list(params);
      setDocuments(res.list || []);
    } catch (error) { console.error('加载文档失败:', error); } finally { setLoading(false); }
  };

  const insertAtCursor = (text: string) => {
    setDocForm(f => ({ ...f, content: f.content ? f.content + '\n\n' + text : text }));
  };

  const handleOpenFormulaPicker = async () => {
    try {
      const res = await formulaAPI.list({});
      setFormulaList((res as any).list || res as any || []);
    } catch (e) { setFormulaList([]); }
    setFormulaSearch('');
    setShowFormulaPicker(true);
  };

  const handleInsertFormula = (formula: any) => {
    const comps: any[] = formula.components || [];
    const PCR_TYPES = ['PCR', 'qPCR', 'RT-PCR', 'RT-qPCR'];
    const isPCR = PCR_TYPES.includes(formula.type || '');
    let table = '';
    if (isPCR) {
      const totalVol = comps.reduce((s: number, c: any) => s + (Number(c.concentration) || 0), 0);
      table = `**${formula.code} ${formula.name}（${formula.type}）**\n\n`;
      table += '| # | 组分 | 终浓度 | 加样量(μL) | 备注 |\n';
      table += '| --- | --- | --- | --- | --- |\n';
      comps.forEach((c: any, i: number) => {
        const name = c.componentName || c.reagentMaterial?.commonName || c.reagentMaterial?.name || c.reagent?.name || '';
        table += `| ${i + 1} | ${name} | ${c.notes || ''} | ${Number(c.concentration).toFixed(1)} | |\n`;
      });
      table += `| | **合计** | | **${totalVol.toFixed(1)}** | |`;
    } else {
      table = `**${formula.code} ${formula.name}**\n\n`;
      table += '| 试剂 | 浓度 | 单位 | 备注 |\n';
      table += '| --- | --- | --- | --- |\n';
      comps.forEach((c: any) => {
        const name = c.reagentMaterial?.commonName || c.reagentMaterial?.name || c.reagent?.name || c.componentName || '';
        table += `| ${name} | ${c.concentration} | ${c.unit} | ${c.notes || ''} |\n`;
      });
    }
    insertAtCursor(table);
    setShowFormulaPicker(false);
  };

  const handleSearch = () => { loadDocuments(); };
  const handleCreateDoc = async () => {
    if (!docForm.categoryId || !docForm.title || !docForm.code) { alert('请填写必填项'); return; }
    try { await docsAPI.documents.create({ ...docForm, createdBy: user?.id }); setShowCreateModal(false); resetForm(); loadDocuments(); } catch (e: any) { alert(e.message || '创建失败'); }
  };
  const handleUpdateDoc = async () => { if (!editingDoc || !docForm.title) return; try { await docsAPI.documents.update(editingDoc.id, { ...docForm, updatedBy: user?.id }); setEditingDoc(null); resetForm(); loadDocuments(); } catch (e: any) { alert(e.message || '更新失败'); } };
  const handleDeleteDoc = async (id: string) => { if (!confirm('确定要删除这个文档吗？')) return; try { await docsAPI.documents.delete(id); loadDocuments(); } catch (e) { alert('删除失败'); } };
  const resetForm = () => setDocForm({ categoryId: selectedCategory || '', code: '', title: '', description: '', docType: 'sop', content: '', tags: '', version: 'V1.0' });
  const openEditModal = (doc: DocDocument) => {
    setEditingDoc(doc);
    setDocForm({
      categoryId: doc.category?.id || '',
      code: doc.code,
      title: doc.title,
      description: doc.description || '',
      docType: doc.docType,
      content: '',
      tags: doc.tags || '',
      version: doc.version,
    });
  };

  const IconMap: Record<string, any> = {
    '试剂组标准': FlaskConical,
    '芯片测试': Cpu,
    '分子生物': Dna,
    '通用模板': FileText,
    '技术参考': BookOpen,
    '试剂原料库': Package,
    '任务模板库': ClipboardList,
    '扩增反应体系试剂': Beaker,
    '引物探针库': DnaIcon,
  };

  const cardBaseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };

  const getCardStyle = (isActive: boolean, isAll: boolean): React.CSSProperties => {
    if (isAll && isActive) return { background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '1px solid #2563eb', color: '#fff', boxShadow: '0 2px 10px rgba(59,130,246,0.30)' };
    if (isActive) return { border: '1px solid #3b82f6', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', color: '#2563eb', boxShadow: '0 2px 8px rgba(59,130,246,0.15)' };
    return {};
  };

  const getTypeColor = (type: string) => { const typeInfo = DOC_TYPES.find(t => t.id === type); const colors: Record<string, string> = { blue: 'bg-blue-100 text-blue-700', green: 'bg-green-100 text-green-700', purple: 'bg-purple-100 text-purple-700', orange: 'bg-orange-100 text-orange-700' }; return colors[typeInfo?.color || 'blue']; };
  const getStatusBadge = (status: string) => { const badges: Record<string, string> = { active: 'bg-green-100 text-green-700', archived: 'bg-gray-100 text-gray-700', deprecated: 'bg-red-100 text-red-700' }; return badges[status] || badges.active; };
  const hasExistingMindmap = !!extractMindmapBlock(docForm.content || '');
  const hasExistingTable = hasMarkdownTable(docForm.content || '');

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box', height: '100%', overflow: 'hidden' }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">知识库管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理 SOP 文件、操作模板和技术文档</p>
        </div>
        <button
          onClick={() => {
            const isSpecial = selectedCategory && (
              (reagentCategoryId && selectedCategory === reagentCategoryId) ||
              (ampReagentCategoryId && selectedCategory === ampReagentCategoryId) ||
              (primerCategoryId && selectedCategory === primerCategoryId) ||
              (taskTemplateCategoryId && selectedCategory === taskTemplateCategoryId)
            );
            if (selectedCategory && reagentCategoryId && selectedCategory === reagentCategoryId) {
              setReagentOpenKey(k => k + 1);
            } else if (!isSpecial) {
              resetForm();
              setShowCreateModal(true);
            }
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {selectedCategory && reagentCategoryId && selectedCategory === reagentCategoryId ? '新建试剂' :
           selectedCategory && primerCategoryId && selectedCategory === primerCategoryId ? '新建引物' :
           selectedCategory && ampReagentCategoryId && selectedCategory === ampReagentCategoryId ? '新增试剂' :
           '新建文档'}
        </button>
      </div>

      <div style={{ flexShrink: 0, width: '100%', background: 'rgba(255, 255, 255, 0.82)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.08)', boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            {categories.map(cat => {
              const isActive = selectedCategory === cat.id;
              const Icon = IconMap[cat.name] || FileText;
              return (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{ ...cardBaseStyle, ...getCardStyle(isActive, false), minWidth: 'fit-content' }}
                  onMouseEnter={(e) => {
                    const target = e.currentTarget;
                    target.style.border = '1px solid #bfdbfe';
                    target.style.background = '#eff6ff';
                    target.style.color = '#3b82f6';
                    target.style.transform = 'translateY(-1px)';
                    target.style.boxShadow = '0 2px 8px rgba(59,130,246,0.10)';
                    const svg = target.querySelector('svg');
                    if (svg) svg.style.color = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    const target = e.currentTarget;
                    const isActiveLocal = isActive;
                    target.style.border = isActiveLocal ? '1px solid #3b82f6' : '1px solid #e2e8f0';
                    target.style.background = isActiveLocal ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : '#f8fafc';
                    target.style.color = isActiveLocal ? '#2563eb' : '#475569';
                    target.style.transform = 'translateY(0px)';
                    target.style.boxShadow = isActiveLocal ? '0 2px 8px rgba(59,130,246,0.15)' : 'none';
                    const svg = target.querySelector('svg');
                    if (svg) svg.style.color = isActiveLocal ? '#2563eb' : '#475569';
                  }}
                >
                  <Icon size={14} color={isActive ? '#2563eb' : '#475569'} />
                  <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, color: isActive ? '#2563eb' : '#475569' }}>{cat.name}</div>
                  {cat._count?.documents ? <div style={{ fontSize: 11, color: isActive ? '#1d4ed8' : '#94a3b8', background: isActive ? '#bfdbfe' : '#f1f5f9', borderRadius: 10, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{cat._count.documents}</div> : null}
                </div>
              );
            })}
          </div>

          <div>
            <button onClick={() => setIsCollapsed(s => !s)} style={{ fontSize: '12px', color: '#94a3b8', cursor: 'pointer', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.08)', background: 'transparent', display: 'flex', alignItems: 'center', gap: '4px' }} onMouseEnter={(e) => { (e.currentTarget.style.color = '#3b82f6'); (e.currentTarget.style.border = '1px solid #3b82f6'); }} onMouseLeave={(e) => { (e.currentTarget.style.color = '#94a3b8'); (e.currentTarget.style.border = '1px solid rgba(0,0,0,0.08)'); }}>
              <svg style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              <span>{isCollapsed ? '展开' : '收起'}</span>
            </button>
          </div>
        </div>
        <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '14px', marginBottom: '14px' }} />
        <div style={{ overflow: 'hidden', maxHeight: isCollapsed ? '0px' : '60px', opacity: isCollapsed ? 0 : 1, transition: 'max-height 0.25s ease, opacity 0.2s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <input type="text" placeholder="搜索文档编号、标题..." className="input pl-10" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
              <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {DOC_TYPES.map(type => (
                <button key={type.id} onClick={() => setFilterType(filterType === type.id ? null : type.id)} style={{ padding: '6px 12px', borderRadius: '9999px', fontSize: '13px', cursor: 'pointer', border: filterType === type.id ? 'none' : '1px solid #e2e8f0', background: filterType === type.id ? '#3b82f6' : '#ffffff', color: filterType === type.id ? '#ffffff' : '#64748b' }}>{type.label}</button>
              ))}
            </div>
            <div style={{ marginLeft: 'auto' }}><button onClick={handleSearch} style={{ background: '#3b82f6', color: '#fff', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer' }}>搜索</button></div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', boxSizing: 'border-box', paddingBottom: 8 }}>
        {selectedCategory && reagentCategoryId && selectedCategory === reagentCategoryId ? (
          <div className="bg-white rounded-lg border border-gray-200 p-4"><ReagentLibrary openKey={reagentOpenKey} hideTopButton /></div>
        ) : selectedCategory && taskTemplateCategoryId && selectedCategory === taskTemplateCategoryId ? (
          <div className="bg-white rounded-lg border border-gray-200 p-4"><TaskTemplateLibrary /></div>
        ) : selectedCategory && ampReagentCategoryId && selectedCategory === ampReagentCategoryId ? (
          <div className="bg-white rounded-lg border border-gray-200 p-4"><AmplificationReagentLibrary /></div>
        ) : selectedCategory && primerCategoryId && selectedCategory === primerCategoryId ? (
          <div className="bg-white rounded-lg border border-gray-200 p-4"><PrimerLibrary /></div>
        ) : (
          loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-200"><svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><p className="text-gray-500">暂无文档</p><button onClick={() => { resetForm(); setShowCreateModal(true); }} className="mt-4 text-primary-600 hover:text-primary-700">创建第一个文档</button></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {documents.map(doc => (
                <div key={doc.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/knowledge/${doc.id}`)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1"><span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(doc.docType)}`}>{DOC_TYPES.find(t => t.id === doc.docType)?.label || doc.docType}</span><h3 className="font-semibold text-gray-900 mt-2 line-clamp-2">{doc.title}</h3></div>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(doc.status)}`}>{doc.status === 'active' ? '有效' : doc.status === 'archived' ? '归档' : '废弃'}</span>
                  </div>
                  {doc.description && (<p className="text-sm text-gray-500 line-clamp-2 mb-3">{doc.description}</p>)}
                  <div className="flex items-center justify-between text-xs text-gray-400"><span className="font-mono">{doc.code}</span><span>{doc.version}</span></div>
                  {doc.tags && (<div className="flex flex-wrap gap-1 mt-2">{doc.tags.split(',').slice(0, 3).map((tag, i) => (<span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{tag.trim()}</span>))}</div>)}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100"><span className="text-xs text-gray-400">{doc.category?.name}</span>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEditModal(doc)} className="text-gray-400 hover:text-primary-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                      <button onClick={() => handleDeleteDoc(doc.id)} className="text-gray-400 hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 引用配方选择器 */}
      {showFormulaPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(95vw, 640px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>引用试剂配方</span>
              <button onClick={() => setShowFormulaPicker(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 20 }}>×</button>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <input type="text" placeholder="搜索配方编号或名称..." style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} value={formulaSearch} onChange={e => setFormulaSearch(e.target.value)} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
              {formulaList.filter(f => !formulaSearch || f.code?.toLowerCase().includes(formulaSearch.toLowerCase()) || f.name?.toLowerCase().includes(formulaSearch.toLowerCase())).map((f: any) => (
                <div key={f.id} onClick={() => handleInsertFormula(f)} style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }} onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1e40af', minWidth: 140 }}>{f.code}</span>
                  <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{f.name}</span>
                  {f.type && <span style={{ fontSize: 11, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: 8 }}>{f.type}</span>}
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{(f.components || []).length}组分</span>
                </div>
              ))}
              {formulaList.filter(f => !formulaSearch || f.code?.toLowerCase().includes(formulaSearch.toLowerCase()) || f.name?.toLowerCase().includes(formulaSearch.toLowerCase())).length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>未找到匹配的配方</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showMindmapEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: 'min(96vw, 1280px)', height: 'min(90vh, 860px)', background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.24)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>思维导图画布编辑器</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>新建文档和编辑文档都可以直接在这里完成可视化录入，保存后自动回写到 :::mindmap 区块。</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowMindmapEditor(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 12 }}>取消</button>
                <button onClick={() => {
                  setDocForm(prev => ({
                    ...prev,
                    content: activeMindmapIndex >= 0
                      ? replaceMindmapBlock(prev.content || '', activeMindmapIndex, mindmapDraft)
                      : upsertFirstMindmapBlock(prev.content || '', mindmapDraft),
                  }));
                  setShowMindmapEditor(false);
                }} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12 }}>写入文档</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, background: '#f8fafc', padding: 12 }}>
              <MindMapEditor content={mindmapDraft} onChange={setMindmapDraft} />
            </div>
          </div>
        </div>
      )}

      {showTableEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: 'min(94vw, 1100px)', height: 'min(84vh, 760px)', background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>表格图形化编辑器</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>默认读取正文中的第一个 Markdown 表格；如果正文里还没有表格，也可以在这里直接新建一个。</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowTableEditor(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 12 }}>取消</button>
                <button onClick={() => { const md = tableEditorRef.current?.getMarkdown() ?? tableDraft; setDocForm(prev => ({ ...prev, content: md })); setShowTableEditor(false); }} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12 }}>写入文档</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, background: '#f8fafc', padding: 12 }}>
              <VisualTableEditor ref={tableEditorRef} value={tableDraft} onChange={setTableDraft} tableOnly />
            </div>
          </div>
        </div>
      )}

      {(showCreateModal || editingDoc) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{editingDoc ? '编辑文档' : '新建文档'}</h2>
              <button onClick={() => { setShowCreateModal(false); setEditingDoc(null); resetForm(); }} className="text-gray-400 hover:text-gray-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label required">文档分类</label><select className="input" value={docForm.categoryId} onChange={(e) => setDocForm({ ...docForm, categoryId: e.target.value })}><option value="">选择分类</option>{categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}</select></div>
                <div><label className="label required">文档编号</label><input type="text" className="input font-mono" placeholder="如 SOP-RG-LAMP-001" value={docForm.code} onChange={(e) => setDocForm({ ...docForm, code: e.target.value })} /></div>
              </div>
              <div><label className="label required">文档标题</label><input type="text" className="input" placeholder="输入文档标题" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} /></div>
              <div><label className="label">文档描述</label><textarea className="input h-20" placeholder="简要描述文档内容" value={docForm.description} onChange={(e) => setDocForm({ ...docForm, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="label">文档类型</label><select className="input" value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}>{DOC_TYPES.map(type => (<option key={type.id} value={type.id}>{type.label}</option>))}</select></div>
              <div><label className="label">版本号</label><input type="text" className="input" placeholder="如 V1.0" value={docForm.version} onChange={(e) => setDocForm({ ...docForm, version: e.target.value })} /></div></div>
              <div><label className="label">标签</label><input type="text" className="input" placeholder="多个标签用逗号分隔" value={docForm.tags} onChange={(e) => setDocForm({ ...docForm, tags: e.target.value })} /></div>
              <div>
                <label className="label">文档内容</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <button type="button" onClick={handleOpenFormulaPicker} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/></svg>
                    引用配方
                  </button>
                  <button type="button" onClick={() => insertAtCursor(':::mindmap\n# 根节点\n## 分支1\n## 分支2\n:::')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd6fe', background: '#f5f3ff', cursor: 'pointer', fontSize: 12, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 4 }}>
                    插入思维导图
                  </button>
                  <button type="button" onClick={() => { setTableDraft(docForm.content || ''); setShowTableEditor(true); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasExistingTable ? '图形编辑现有表格' : '图形新建表格'}
                  </button>
                  {findMindmapBlocks(docForm.content || '').length > 1 && (
                    <select
                      value={mindmapBlockIndex}
                      onChange={e => setMindmapBlockIndex(Number(e.target.value))}
                      style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #bfdbfe', fontSize: 12, color: '#1d4ed8', background: '#eff6ff', cursor: 'pointer' }}
                    >
                      {findMindmapBlocks(docForm.content || '').map((_, i) => (
                        <option key={i} value={i}>思维导图 {i + 1}</option>
                      ))}
                    </select>
                  )}
                  <button type="button" onClick={() => {
                    const blocks = findMindmapBlocks(docForm.content || '');
                    if (blocks.length === 0) {
                      setActiveMindmapIndex(-1);
                      setMindmapDraft('# 根节点\n## 分支1\n## 分支2');
                    } else {
                      const idx = blocks.length > 1 ? (mindmapBlockIndex < blocks.length ? mindmapBlockIndex : 0) : 0;
                      setActiveMindmapIndex(idx);
                      setMindmapDraft(blocks[idx].content);
                    }
                    setShowMindmapEditor(true);
                  }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontSize: 12, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasExistingMindmap ? '画布编辑思维导图' : '画布创建思维导图'}
                  </button>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>已有的表格和思维导图块都可以从这里直接进入图形化编辑</span>
                </div>
                <textarea
                  style={{
                    width: '100%', minHeight: 160, padding: '10px 12px',
                    border: '1px solid #e2e8f0', borderRadius: 8,
                    fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6,
                    resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  }}
                  placeholder="输入文档正文内容，可使用 Markdown 语法..."
                  value={docForm.content}
                  onChange={e => setDocForm({ ...docForm, content: e.target.value })}
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200"><button onClick={() => { setShowCreateModal(false); setEditingDoc(null); resetForm(); }} className="btn btn-secondary">取消</button><button onClick={editingDoc ? handleUpdateDoc : handleCreateDoc} className="btn btn-primary">{editingDoc ? '保存修改' : '创建文档'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
