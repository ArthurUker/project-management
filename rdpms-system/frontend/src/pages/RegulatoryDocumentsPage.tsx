import { useMemo, useRef, useState } from 'react';
import { BookOpen, Filter } from 'lucide-react';
import { useRegulatoryDocuments } from '../hooks/useRegulatoryDocuments';
import { regulatoryDocumentsAPI } from '../api/client';
import type { RegulatoryApplicability, RegulatoryPriority } from '../types/regulatory';

const applicabilityLabels: Record<RegulatoryApplicability, string> = {
  core: '核心适用',
  conditional: '条件适用',
  post_market: '上市后适用',
  low_relevance: '低相关',
  not_applicable: '不适用',
};

const priorityClassName: Record<RegulatoryPriority, string> = {
  P0: 'text-red-700 bg-red-50 border-red-100',
  P1: 'text-orange-700 bg-orange-50 border-orange-100',
  P2: 'text-amber-700 bg-amber-50 border-amber-100',
  P3: 'text-sky-700 bg-sky-50 border-sky-100',
  P4: 'text-gray-600 bg-gray-50 border-gray-100',
};

interface RegulatoryDocumentsPageProps {
  embedded?: boolean;
}

interface RegulatoryFormState {
  dispatchNo: string;
  title: string;
  fullTitle: string;
  category: string;
  applicability: RegulatoryApplicability;
  applicableToIvd: boolean;
  priorityLevel: RegulatoryPriority;
  summary: string;
  applicabilityNote: string;
}

const emptyForm: RegulatoryFormState = {
  dispatchNo: '',
  title: '',
  fullTitle: '',
  category: '',
  applicability: 'conditional',
  applicableToIvd: true,
  priorityLevel: 'P2',
  summary: '',
  applicabilityNote: '',
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function RegulatoryDocumentsPage({ embedded = false }: RegulatoryDocumentsPageProps) {
  const { documents, loading, error, refetch } = useRegulatoryDocuments();
  const [applicability, setApplicability] = useState('all');
  const [priority, setPriority] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RegulatoryFormState>(emptyForm);
  const [pendingOriginalFile, setPendingOriginalFile] = useState<File | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (applicability !== 'all' && doc.applicability !== applicability) return false;
      if (priority !== 'all' && doc.priorityLevel !== priority) return false;
      if (!keyword.trim()) return true;
      const text = `${doc.dispatchNo} ${doc.title} ${doc.summary || ''}`.toLowerCase();
      return text.includes(keyword.trim().toLowerCase());
    });
  }, [documents, applicability, priority, keyword]);

  const openCreateEditor = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPendingOriginalFile(null);
    setShowEditor(true);
  };

  const openEditEditor = (doc: any) => {
    setEditingId(doc.id);
    setForm({
      dispatchNo: doc.dispatchNo || '',
      title: doc.title || '',
      fullTitle: doc.fullTitle || '',
      category: doc.category || '',
      applicability: (doc.applicability || 'conditional') as RegulatoryApplicability,
      applicableToIvd: !!doc.applicableToIvd,
      priorityLevel: (doc.priorityLevel || 'P2') as RegulatoryPriority,
      summary: doc.summary || '',
      applicabilityNote: doc.applicabilityNote || '',
    });
    setPendingOriginalFile(null);
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!form.dispatchNo.trim() || !form.title.trim()) {
      alert('请填写批示号和标题');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        dispatchNo: form.dispatchNo.trim(),
        title: form.title.trim(),
        fullTitle: form.fullTitle.trim() || null,
        category: form.category.trim() || null,
        summary: form.summary.trim() || null,
        applicabilityNote: form.applicabilityNote.trim() || null,
      };

      let id = editingId;
      if (editingId) {
        await regulatoryDocumentsAPI.update(editingId, payload);
      } else {
        const created = await regulatoryDocumentsAPI.create(payload);
        id = (created as any)?.id || (created as any)?.data?.id || null;
      }

      if (id && pendingOriginalFile) {
        const fileDataBase64 = await fileToBase64(pendingOriginalFile);
        await regulatoryDocumentsAPI.uploadOriginalFile(id, {
          fileName: pendingOriginalFile.name,
          fileDataBase64,
        });
      }

      setShowEditor(false);
      setPendingOriginalFile(null);
      await refetch();
    } catch (e: any) {
      alert(e?.error || e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除该法规文件吗？')) return;
    try {
      await regulatoryDocumentsAPI.delete(id);
      await refetch();
    } catch (e: any) {
      alert(e?.error || e?.message || '删除失败');
    }
  };

  const handleImportNewPdf = async (file: File) => {
    setImporting(true);
    try {
      const fileDataBase64 = await fileToBase64(file);
      await regulatoryDocumentsAPI.importPdf({
        fileName: file.name,
        fileDataBase64,
        applicability: 'conditional',
        priorityLevel: 'P2',
        applicableToIvd: true,
      });
      await refetch();
      alert('PDF 导入成功，可在列表中继续补充字段');
    } catch (e: any) {
      alert(e?.error || e?.message || 'PDF 导入失败');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return <div className="text-gray-500">正在加载法规文件...</div>;
  }

  if (error) {
    return (
      <div className="card p-6">
        <p className="text-red-600">加载失败：{error}</p>
        <button className="btn btn-secondary mt-3" onClick={refetch}>重试</button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pb-2">
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary-600" />
              <h1 className="text-2xl font-display font-bold text-gray-900">法规知识库</h1>
            </div>
            <p className="text-sm text-gray-500 mt-1">澳门 ISAF 2026 医疗器械与 IVD 技术性指示（26项）</p>
          </div>
          <button className="btn btn-secondary" onClick={refetch}>刷新</button>
        </div>
      )}

      {embedded && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">法规子模块：可维护结构化法规条目，并导入政府官网 PDF 原文。</p>
          <button className="btn btn-secondary" onClick={refetch}>刷新</button>
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">筛选</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按批示号/名称搜索"
          />
          <select className="input" value={applicability} onChange={(e) => setApplicability(e.target.value)}>
            <option value="all">全部适用性</option>
            <option value="core">核心适用</option>
            <option value="conditional">条件适用</option>
            <option value="post_market">上市后适用</option>
            <option value="low_relevance">低相关</option>
            <option value="not_applicable">不适用</option>
          </select>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="all">全部优先级</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
            <option value="P4">P4</option>
          </select>
          <div className="text-sm text-gray-500 flex items-center">共 {filteredDocuments.length} 项</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            onClick={openCreateEditor}
          >
            新建法规文档
          </button>
          <button
            className="btn btn-secondary"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? '导入中...' : '导入 PDF 原文'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (file) handleImportNewPdf(file);
            }}
          />
        </div>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">暂无匹配法规文件</div>
      ) : (
        <div className="space-y-3">
          {filteredDocuments.map((doc) => (
            <div key={doc.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-primary-600 font-medium">{doc.dispatchNo}</p>
                  <h2 className="text-lg font-semibold text-gray-900 mt-1">{doc.title}</h2>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className={`text-xs border rounded-full px-2 py-1 ${priorityClassName[doc.priorityLevel]}`}>
                    {doc.priorityLevel}
                  </span>
                  <span className="text-xs border rounded-full px-2 py-1 text-gray-700 bg-gray-50 border-gray-200">
                    {applicabilityLabels[doc.applicability]}
                  </span>
                  {doc.applicableToIvd ? (
                    <span className="text-xs border rounded-full px-2 py-1 text-emerald-700 bg-emerald-50 border-emerald-100">IVD相关</span>
                  ) : null}
                </div>
              </div>
              {doc.summary ? <p className="text-sm text-gray-600 mt-2">{doc.summary}</p> : null}
              {doc.applicabilityNote ? <p className="text-sm text-gray-500 mt-1">适用说明：{doc.applicabilityNote}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="btn btn-secondary" onClick={() => openEditEditor(doc)}>编辑</button>
                <button className="btn btn-secondary" onClick={() => window.open(regulatoryDocumentsAPI.originalFileUrl(doc.id), '_blank')}>下载原文</button>
                <button className="btn btn-secondary" onClick={() => handleDelete(doc.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{editingId ? '编辑法规文档' : '新建法规文档'}</h2>
              <button className="text-gray-400 hover:text-gray-700" onClick={() => setShowEditor(false)}>关闭</button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">批示号 *</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.dispatchNo} onChange={(e) => setForm((prev) => ({ ...prev, dispatchNo: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">法规标题 *</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">完整标题</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.fullTitle} onChange={(e) => setForm((prev) => ({ ...prev, fullTitle: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">分类</label>
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="如：医疗器械/IVD" />
              </div>
              <div>
                <label className="text-xs text-gray-500">优先级</label>
                <select className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.priorityLevel} onChange={(e) => setForm((prev) => ({ ...prev, priorityLevel: e.target.value as RegulatoryPriority }))}>
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                  <option value="P4">P4</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">适用性</label>
                <select className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" value={form.applicability} onChange={(e) => setForm((prev) => ({ ...prev, applicability: e.target.value as RegulatoryApplicability }))}>
                  <option value="core">核心适用</option>
                  <option value="conditional">条件适用</option>
                  <option value="post_market">上市后适用</option>
                  <option value="low_relevance">低相关</option>
                  <option value="not_applicable">不适用</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.applicableToIvd} onChange={(e) => setForm((prev) => ({ ...prev, applicableToIvd: e.target.checked }))} />
                  IVD 相关
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">摘要</label>
                <textarea className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" rows={3} value={form.summary} onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">适用说明/正文（可编辑）</label>
                <textarea className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" rows={6} value={form.applicabilityNote} onChange={(e) => setForm((prev) => ({ ...prev, applicabilityNote: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">原文 PDF（可选，保存时上传）</label>
                <input type="file" accept="application/pdf" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg" onChange={(e) => setPendingOriginalFile(e.target.files?.[0] || null)} />
                {pendingOriginalFile ? <p className="text-xs text-gray-500 mt-1">待上传：{pendingOriginalFile.name}</p> : null}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setShowEditor(false)}>取消</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
