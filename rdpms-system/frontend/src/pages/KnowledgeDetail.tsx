import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { docsAPI, formulaAPI } from '../api/client';
import { useAppStore } from '../store/appStore';
import { ArrowLeft, Edit2, Trash2, Clock, User, Tag, FileText, Save, X, Maximize2, Minimize2 } from 'lucide-react';
import MindMapView, { MindMapEditor } from '../components/MindMapView';
import VisualTableEditor from '../components/VisualTableEditor';
import { extractMindmapBlock, hasMarkdownTable, replaceMindmapBlock } from '../utils/markdownBlocks';

interface DocDocument {
  id: string;
  code: string;
  title: string;
  description?: string;
  docType: string;
  version: string;
  status: string;
  tags?: string;
  content?: string;
  category: { id: string; name: string };
  creator: { id: string; name: string };
  approver?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  versions?: any[];
}

const DOC_TYPES = [
  { id: 'sop', label: 'SOP标准操作规程', color: 'blue' },
  { id: 'template', label: '模板文件', color: 'green' },
  { id: 'guide', label: '操作指南', color: 'purple' },
  { id: 'reference', label: '技术参考', color: 'orange' },
];

interface RenderContentOptions {
  onEditMindmap?: (index: number, blockContent: string) => void;
}

interface MergeRegion {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

function normalizeMergeRegions(regions: MergeRegion[], rowCount: number, colCount: number): MergeRegion[] {
  return regions
    .map((r) => ({
      row: Math.max(0, Math.min(rowCount - 1, Number(r.row) || 0)),
      col: Math.max(0, Math.min(colCount - 1, Number(r.col) || 0)),
      rowspan: Math.max(1, Number(r.rowspan) || 1),
      colspan: Math.max(1, Number(r.colspan) || 1),
    }))
    .map((r) => ({
      ...r,
      rowspan: Math.min(r.rowspan, rowCount - r.row),
      colspan: Math.min(r.colspan, colCount - r.col),
    }))
    .filter((r) => r.rowspan * r.colspan > 1);
}

function parseMergeMetaLine(line: string): MergeRegion[] | null {
  const m = line.match(/^\s*<!--\s*VTABLE_MERGE\s+(\{.*\})\s*-->\s*$/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    if (Array.isArray(obj?.regions)) return obj.regions;
  } catch {
    return null;
  }
  return null;
}

function findRegionContainingCell(regions: MergeRegion[], row: number, col: number): MergeRegion | null {
  for (const region of regions) {
    if (
      row >= region.row &&
      row < region.row + region.rowspan &&
      col >= region.col &&
      col < region.col + region.colspan
    ) {
      return region;
    }
  }
  return null;
}

/** 将 markdown 文本渲染为 React 节点（支持表格、:::mindmap 块） */
function renderContent(content: string, options: RenderContentOptions = {}): JSX.Element {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let i = 0;
  let key = 0;
  let mindmapIndex = 0;
  let pendingTableMergeRegions: MergeRegion[] | null = null;

  while (i < lines.length) {
    const line = lines[i];

    const mergeMeta = parseMergeMetaLine(line);
    if (mergeMeta) {
      pendingTableMergeRegions = mergeMeta;
      i++;
      continue;
    }

    // :::mindmap 块
    if (line.trim() === ':::mindmap') {
      const mapLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') {
        mapLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing :::
      const blockContent = mapLines.join('\n').trim();
      const currentMindmapIndex = mindmapIndex++;
      elements.push(
        <div key={key++} style={{ margin: '16px 0', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21"/></svg>
              <span style={{ fontWeight: 600, color: '#475569' }}>思维导图预览</span>
              <span>默认折叠深层节点，混排时更清晰</span>
            </div>
            {options.onEditMindmap && (
              <button
                onClick={() => options.onEditMindmap?.(currentMindmapIndex, blockContent)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
              >
                画布编辑
              </button>
            )}
          </div>
          <MindMapView content={blockContent} previewCollapseLevel={3} inlineHeight={320} onRequestEdit={() => options.onEditMindmap?.(currentMindmapIndex, blockContent)} />
        </div>
      );
      continue;
    }

    // 标题 h1-h3
    const h3 = line.match(/^###\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) { elements.push(<h1 key={key++} style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '16px 0 8px' }}>{h1[1]}</h1>); i++; continue; }
    if (h2) { elements.push(<h2 key={key++} style={{ fontSize: 17, fontWeight: 700, color: '#334155', margin: '14px 0 6px' }}>{h2[1]}</h2>); i++; continue; }
    if (h3) { elements.push(<h3 key={key++} style={{ fontSize: 15, fontWeight: 600, color: '#475569', margin: '12px 0 4px' }}>{h3[1]}</h3>); i++; continue; }

    // Markdown table: 当前行以 | 开头，下一行是分隔符
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().match(/^\|[\s\-:|]+\|/)
    ) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const parseRow = (r: string) =>
        r.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const headers = parseRow(tableLines[0]);
      const dataRows = tableLines.slice(2).map(parseRow);
      const mergeRegions = normalizeMergeRegions(pendingTableMergeRegions || [], dataRows.length, headers.length);
      pendingTableMergeRegions = null;
      elements.push(
        <div key={key++} style={{ overflowX: 'auto', margin: '12px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#eff6ff' }}>
                {headers.map((h, j) => (
                  <th key={j} style={{ border: '1px solid #cbd5e1', padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#1e40af' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {headers.map((_, ci) => {
                    const region = findRegionContainingCell(mergeRegions, ri, ci);
                    if (region && (region.row !== ri || region.col !== ci)) return null;
                    return (
                      <td
                        key={ci}
                        rowSpan={region ? region.rowspan : 1}
                        colSpan={region ? region.colspan : 1}
                        style={{ border: '1px solid #e2e8f0', padding: '7px 12px', color: '#374151', fontWeight: ci === 0 && row[ci]?.includes('合计') ? 700 : 400 }}
                      >
                        {row[ci] || ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 空行
    if (line.trim() === '') { elements.push(<div key={key++} style={{ height: 8 }} />); i++; continue; }

    // 普通文本
    elements.push(
      <p key={key++} style={{ color: '#374151', lineHeight: 1.8, margin: '2px 0', fontSize: 14 }}>{line}</p>
    );
    i++;
  }

  return <>{elements}</>;
}

export default function KnowledgeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAppStore();

  const [doc, setDoc] = useState<DocDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  // 引用配方弹窗
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [formulaList, setFormulaList] = useState<any[]>([]);
  const [formulaSearch, setFormulaSearch] = useState('');
  const [showMindmapEditor, setShowMindmapEditor] = useState(false);
  const [mindmapDraft, setMindmapDraft] = useState('# 根节点\n## 分支1\n## 分支2');
  const [activeMindmapIndex, setActiveMindmapIndex] = useState(0);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [tableDraft, setTableDraft] = useState('');
  const [isViewFullscreen, setIsViewFullscreen] = useState(false);
  const detailCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (id) loadDoc();
  }, [id]);

  useEffect(() => {
    const onFsChange = () => {
      setIsViewFullscreen(document.fullscreenElement === detailCardRef.current);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const loadDoc = async () => {
    setLoading(true);
    try {
      const res = await docsAPI.documents.get(id!) as any;
      setDoc(res);
      setEditForm({
        title: res.title,
        description: res.description || '',
        docType: res.docType,
        version: res.version,
        tags: res.tags || '',
        content: res.content || '',
        status: res.status,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      await docsAPI.documents.update(doc.id, { ...editForm, updatedBy: user?.id });
      await loadDoc();
      setEditing(false);
    } catch (e: any) {
      alert(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!doc || !confirm('确定要删除这个文档吗？')) return;
    try {
      await docsAPI.documents.delete(doc.id);
      navigate('/knowledge');
    } catch (e) {
      alert('删除失败');
    }
  };

  const loadFormulas = async () => {
    try {
      const res = await formulaAPI.list();
      setFormulaList(res.list || []);
    } catch (e) {
      console.error(e);
    }
  };

  const openFormulaModal = async () => {
    setShowFormulaModal(true);
    await loadFormulas();
  };

  const insertFormulaTable = async (formula: any) => {
    try {
      const det = await formulaAPI.get(formula.id || formula.code);
      const f = det?.formula || formula;
      const PCR_TYPES = ['PCR', 'qPCR', 'RT-PCR', 'RT-qPCR', 'PCR扩增体系'];
      const isPCR = PCR_TYPES.includes(f.type || '');
      const components: any[] = f.components || [];

      let tableText = '';
      if (isPCR) {
        tableText = `\n#### 配方：${f.code} ${f.name || ''} （${f.notes || '扩增体系'}）\n\n`;
        tableText += '| 组分 | 终浓度 | 加样量(μL) | 备注 |\n';
        tableText += '|------|--------|----------|------|\n';
        components.forEach((c: any) => {
          const name = c.componentName || c.reagentMaterial?.commonName || c.reagentMaterial?.name || c.reagent?.name || c.reagentName || '';
          const finalConc = c.notes || '';
          const vol = c.concentration != null ? String(c.concentration) : '';
          tableText += `| ${name} | ${finalConc} | ${vol} |  |\n`;
        });
      } else {
        tableText = `\n#### 配方：${f.code} ${f.name || ''}\n\n`;
        tableText += '| 试剂 | 浓度 | 单位 |\n';
        tableText += '|------|------|------|\n';
        components.forEach((c: any) => {
          const name = c.componentName || c.reagentMaterial?.commonName || c.reagentMaterial?.name || c.reagent?.name || c.reagentName || '';
          tableText += `| ${name} | ${c.concentration ?? ''} | ${c.unit || ''} |\n`;
        });
      }

      setEditForm((prev: any) => ({ ...prev, content: (prev.content || '') + tableText }));
      setShowFormulaModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const getTypeColor = (type: string) => {
    const typeInfo = DOC_TYPES.find(t => t.id === type);
    const colors: Record<string, string> = { blue: '#1d4ed8', green: '#15803d', purple: '#7e22ce', orange: '#c2410c' };
    const bgs: Record<string, string> = { blue: '#dbeafe', green: '#dcfce7', purple: '#f3e8ff', orange: '#fed7aa' };
    return { color: colors[typeInfo?.color || 'blue'], background: bgs[typeInfo?.color || 'blue'] };
  };

  const openMindmapEditor = (index = 0, blockContent?: string) => {
    const sourceContent = editing ? (editForm.content || '') : (doc?.content || '');
    setActiveMindmapIndex(index);
    setMindmapDraft(blockContent || extractMindmapBlock(sourceContent, index) || '# 根节点\n## 分支1\n## 分支2');
    setShowMindmapEditor(true);
  };

  const openTableEditor = () => {
    const sourceContent = editing ? (editForm.content || '') : (doc?.content || '');
    setTableDraft(sourceContent);
    setShowTableEditor(true);
  };

  const toggleViewFullscreen = async () => {
    const el = detailCardRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
        await el.requestFullscreen();
      }
    } catch {
      // 浏览器/环境不支持时静默失败
    }
  };

  const applyCanvasContent = async (content: string) => {
    if (editing) {
      setEditForm((prev: any) => ({ ...prev, content }));
      return true;
    }
    if (!doc) return false;
    try {
      await docsAPI.documents.update(doc.id, { content, updatedBy: user?.id });
      await loadDoc();
      return true;
    } catch (e: any) {
      alert(e?.message || '写入失败，请重试');
      return false;
    }
  };

  const sourceContentForCanvas = editing ? (editForm.content || '') : (doc?.content || '');
  const hasExistingMindmap = !!extractMindmapBlock(sourceContentForCanvas || '');
  const hasExistingTable = hasMarkdownTable(sourceContentForCanvas || '');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
        <div style={{ color: '#94a3b8' }}>加载中...</div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, gap: 16 }}>
        <div style={{ color: '#94a3b8' }}>文档不存在</div>
        <button onClick={() => navigate('/knowledge')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#374151' }}>
          <ArrowLeft size={14} /> 返回知识库
        </button>
      </div>
    );
  }

  const typeStyle = getTypeColor(doc.docType);
  const statusBadge = doc.status === 'active' ? { bg: '#dcfce7', color: '#15803d', label: '有效' } :
    doc.status === 'archived' ? { bg: '#f1f5f9', color: '#64748b', label: '归档' } :
      { bg: '#fee2e2', color: '#dc2626', label: '废弃' };

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部操作栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => navigate('/knowledge')} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
          <ArrowLeft size={16} /> 返回知识库
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing ? (
            <>
              <button onClick={toggleViewFullscreen} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#374151', fontSize: 13 }}>
                {isViewFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {isViewFullscreen ? '退出全屏' : '全屏查看'}
              </button>
              <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#374151', fontSize: 13 }}>
                <Edit2 size={14} /> 编辑
              </button>
              {user?.role === 'admin' && (
                <button onClick={handleDelete} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#dc2626', fontSize: 13 }}>
                  <Trash2 size={14} /> 删除
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setEditing(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#374151', fontSize: 13 }}>
                <X size={14} /> 取消
              </button>
              <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 13 }}>
                <Save size={14} /> {saving ? '保存中...' : '保存修改'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 文档卡片 */}
      <div ref={detailCardRef} style={{ background: '#fff', borderRadius: isViewFullscreen ? 0 : 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: isViewFullscreen ? '100vw' : undefined, height: isViewFullscreen ? '100vh' : undefined }}>
        {/* 顶部信息区 */}
        <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, ...typeStyle }}>
                  {DOC_TYPES.find(t => t.id === doc.docType)?.label || doc.docType}
                </span>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, background: statusBadge.bg, color: statusBadge.color }}>
                  {statusBadge.label}
                </span>
              </div>
              {editing ? (
                <input
                  value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  style={{ width: '100%', fontSize: 22, fontWeight: 700, color: '#1e293b', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '4px 10px', background: '#fff', boxSizing: 'border-box' }}
                />
              ) : (
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>{doc.title}</h1>
              )}
              {editing ? (
                <input
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="文档描述（选填）"
                  style={{ marginTop: 8, width: '100%', fontSize: 14, color: '#64748b', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '4px 10px', background: '#fff', boxSizing: 'border-box' }}
                />
              ) : (
                doc.description && <p style={{ color: '#64748b', fontSize: 14, marginTop: 6, margin: 0 }}>{doc.description}</p>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#64748b', marginBottom: 4 }}>{doc.code}</div>
              {editing ? (
                <input
                  value={editForm.version}
                  onChange={e => setEditForm({ ...editForm, version: e.target.value })}
                  style={{ width: 80, fontSize: 12, textAlign: 'right', border: '1.5px solid #bfdbfe', borderRadius: 6, padding: '2px 6px' }}
                />
              ) : (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{doc.version}</div>
              )}
            </div>
          </div>
        </div>

        {/* 元信息行 */}
        <div style={{ padding: '12px 32px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
            <FileText size={13} />
            <span>分类：</span>
            <span style={{ color: '#374151', fontWeight: 500 }}>{doc.category?.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
            <User size={13} />
            <span>创建人：{doc.creator?.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
            <Clock size={13} />
            <span>更新：{new Date(doc.updatedAt).toLocaleDateString('zh-CN')}</span>
          </div>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Tag size={13} color="#94a3b8" />
              <input
                value={editForm.tags}
                onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                placeholder="标签，逗号分隔"
                style={{ border: '1.5px solid #bfdbfe', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}
              />
            </div>
          ) : (
            doc.tags && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={13} color="#94a3b8" />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {doc.tags.split(',').map((tag, i) => (
                    <span key={i} style={{ padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 10, fontSize: 11 }}>{tag.trim()}</span>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* 文档内容 + 版本历史（可滚动区域） */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ padding: '24px 32px' }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>文档内容</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={openFormulaModal}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', background: '#eff6ff', color: '#2563eb', fontSize: 12 }}
                  >
                    引用配方
                  </button>
                  <button
                    onClick={() => {
                      const tbl = '\n| 列1 | 列2 | 列3 |\n|------|------|------|\n| 数据1 | 数据2 | 数据3 |\n';
                      setEditForm((prev: any) => ({ ...prev, content: (prev.content || '') + tbl }));
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', background: '#f8fafc', color: '#374151', fontSize: 12 }}
                  >
                    插入表格
                  </button>
                  <button
                    onClick={openTableEditor}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: '#fff', color: '#334155', fontSize: 12 }}
                  >
                    {hasExistingTable ? '图形编辑现有表格' : '图形新建表格'}
                  </button>
                  <button
                    onClick={() => {
                      const block = '\n:::mindmap\n# 根节点\n## 分支1\n### 子节点\n## 分支2\n:::\n';
                      setEditForm((prev: any) => ({ ...prev, content: (prev.content || '') + block }));
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #d8b4fe', borderRadius: 6, cursor: 'pointer', background: '#faf5ff', color: '#7e22ce', fontSize: 12 }}
                  >
                    插入思维导图
                  </button>
                  <button
                    onClick={() => openMindmapEditor(0)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', background: '#eff6ff', color: '#1d4ed8', fontSize: 12 }}
                  >
                    {hasExistingMindmap ? '画布编辑现有思维导图' : '画布创建思维导图'}
                  </button>
                </div>
              </div>
              <textarea
                value={editForm.content}
                onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                placeholder={`输入文档正文内容，支持 Markdown 语法和 :::mindmap 思维导图块

【插入思维导图块示例】
文字描述内容...

:::mindmap
# 根节点
## 一级分支
### 二级节点
- 叶节点
## 另一个分支
:::

继续写文字内容...`}
                style={{ width: '100%', minHeight: 360, padding: '10px 14px', border: '1.5px solid #bfdbfe', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.7 }}
              />
              <p style={{ fontSize: 11, color: '#94a3b8' }}>思维导图和表格都支持先写 Markdown，再点上方按钮进入图形化编辑，完成后会自动回写到正文。</p>
            </div>
          ) : doc.content ? (
            renderContent(doc.content, { onEditMindmap: (index, blockContent) => openMindmapEditor(index, blockContent) })
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
              <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
              <p>暂无文档内容</p>
              <button onClick={() => setEditing(true)} style={{ marginTop: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                点击编辑添加内容
              </button>
            </div>
          )}
        </div>

        {/* 版本历史 */}
        {doc.versions && doc.versions.length > 0 && (
          <div style={{ padding: '16px 32px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>版本历史</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {doc.versions.map((v: any) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#64748b' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#374151', minWidth: 50 }}>{v.version}</span>
                  <span style={{ flex: 1 }}>{v.changelog}</span>
                  <span>{v.creator?.name}</span>
                  <span>{new Date(v.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* 引用配方弹窗 */}
      {showFormulaModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: 520, maxHeight: '70vh', zIndex: 1000, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>引用试剂配方</span>
              <button onClick={() => setShowFormulaModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: '12px 20px' }}>
              <input
                type="text"
                placeholder="搜索配方编号或名称..."
                value={formulaSearch}
                onChange={e => setFormulaSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
              {formulaList
                .filter(f => !formulaSearch || (f.code || '').toLowerCase().includes(formulaSearch.toLowerCase()) || (f.name || '').toLowerCase().includes(formulaSearch.toLowerCase()))
                .map(f => (
                  <div
                    key={f.id}
                    onClick={() => insertFormulaTable(f)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid #f1f5f9', marginBottom: 6, transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
                  >
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', fontFamily: 'monospace' }}>{f.code}</span>
                      <span style={{ fontSize: 13, color: '#374151', marginLeft: 8 }}>{f.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>{f.type}</span>
                  </div>
                ))}
              {formulaList.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>暂无配方数据</div>
              )}
            </div>
          </div>
        </>
      )}

      {showMindmapEditor && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.55)', zIndex: 1100 }} />
          <div style={{ position: 'fixed', inset: 24, background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', zIndex: 1101, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>思维导图画布编辑器</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>支持点击节点后新增子节点/同级节点、重命名、删除节点，保存后会回写到文档里的 :::mindmap 块。</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowMindmapEditor(false)}
                  style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 12 }}
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const source = editing ? (editForm.content || '') : (doc?.content || '');
                    const nextContent = replaceMindmapBlock(source, activeMindmapIndex, mindmapDraft);
                    applyCanvasContent(nextContent).then((ok) => {
                      if (ok) setShowMindmapEditor(false);
                    });
                  }}
                  style={{ padding: '6px 12px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12 }}
                >
                  写入文档
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: 12, background: '#f8fafc' }}>
              <MindMapEditor content={mindmapDraft} onChange={setMindmapDraft} />
            </div>
          </div>
        </>
      )}

      {showTableEditor && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100 }} />
          <div style={{ position: 'fixed', inset: '8vh 9vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', zIndex: 1101, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>表格图形化编辑</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>默认编辑正文里的第一个 Markdown 表格；如果当前还没有表格，也可以在这里直接新建。</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowTableEditor(false)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 12 }}>取消</button>
                <button onClick={() => { applyCanvasContent(tableDraft).then((ok) => { if (ok) setShowTableEditor(false); }); }} style={{ padding: '6px 12px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 12 }}>写入文档</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: 12, background: '#f8fafc' }}>
              <VisualTableEditor value={tableDraft} onChange={setTableDraft} tableOnly />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
