import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { docsAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

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
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocDocument | null>(null);
  
  // 新建文档表单
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
      
      // 获取已存在的分类名称
      const existingNames = new Set(cats.map((c: DocCategory) => c.name));
      
      // 只创建不存在的默认分类
      if (cats.length === 0 || existingNames.size < DEFAULT_CATEGORIES.length) {
        for (const cat of DEFAULT_CATEGORIES) {
          if (!existingNames.has(cat.name)) {
            try {
              await docsAPI.categories.create(cat);
            } catch (e: any) {
              // 忽略已存在的错误
              if (!e.message?.includes('已存在')) {
                console.error('创建分类失败:', e);
              }
            }
          }
        }
        // 重新获取最新列表
        const res2 = await docsAPI.categories.list();
        cats = res2.list || [];
      }
      
      // 按名称去重
      const seen = new Set();
      cats = cats.filter((cat: DocCategory) => {
        if (seen.has(cat.name)) return false;
        seen.add(cat.name);
        return true;
      });
      
      setCategories(cats);
      if (cats.length > 0 && !selectedCategory) {
        setSelectedCategory(cats[0].id);
      }
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (selectedCategory) params.categoryId = selectedCategory;
      if (filterType) params.docType = filterType;
      if (searchKeyword) params.keyword = searchKeyword;
      
      const res = await docsAPI.documents.list(params);
      setDocuments(res.list || []);
    } catch (error) {
      console.error('加载文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadDocuments();
  };

  const handleCreateDoc = async () => {
    if (!docForm.categoryId || !docForm.title || !docForm.code) {
      alert('请填写必填项');
      return;
    }
    
    try {
      await docsAPI.documents.create({
        ...docForm,
        createdBy: user?.id,
      });
      setShowCreateModal(false);
      resetForm();
      loadDocuments();
    } catch (error: any) {
      alert(error.message || '创建失败');
    }
  };

  const handleUpdateDoc = async () => {
    if (!editingDoc || !docForm.title) return;
    
    try {
      await docsAPI.documents.update(editingDoc.id, {
        ...docForm,
        updatedBy: user?.id,
      });
      setEditingDoc(null);
      resetForm();
      loadDocuments();
    } catch (error: any) {
      alert(error.message || '更新失败');
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;
    
    try {
      await docsAPI.documents.delete(id);
      loadDocuments();
    } catch (error) {
      alert('删除失败');
    }
  };

  const resetForm = () => {
    setDocForm({
      categoryId: selectedCategory || '',
      code: '',
      title: '',
      description: '',
      docType: 'sop',
      content: '',
      tags: '',
      version: 'V1.0',
    });
  };

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

  const getTypeColor = (type: string) => {
    const typeInfo = DOC_TYPES.find(t => t.id === type);
    const colors: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-700',
      green: 'bg-green-100 text-green-700',
      purple: 'bg-purple-100 text-purple-700',
      orange: 'bg-orange-100 text-orange-700',
    };
    return colors[typeInfo?.color || 'blue'];
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      archived: 'bg-gray-100 text-gray-700',
      deprecated: 'bg-red-100 text-red-700',
    };
    return badges[status] || badges.active;
  };

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">知识库管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理 SOP 文件、操作模板和技术文档</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreateModal(true); }}
          className="btn btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建文档
        </button>
      </div>

      <div className="flex gap-6">
        {/* 左侧分类列表 */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-6">
            <h3 className="font-semibold text-gray-900 mb-3">文档分类</h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedCategory === null
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                全部文档
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between group ${
                    selectedCategory === cat.id
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{cat.name}</span>
                  {cat._count && (
                    <span className="text-xs text-gray-400 group-hover:text-gray-600">
                      {cat._count.documents}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧文档列表 */}
        <div className="flex-1">
          {/* 筛选栏 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="flex items-center gap-4">
              {/* 搜索 */}
              <div className="relative min-w-[240px]">
                <input
                  type="text"
                  placeholder="搜索文档编号、标题..."
                  className="input pl-10"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              
              {/* 类型筛选 */}
              <div className="flex items-center gap-2">
                {DOC_TYPES.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setFilterType(filterType === type.id ? null : type.id)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      filterType === type.id
                        ? getTypeColor(type.color)
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
              
              <button onClick={handleSearch} className="btn btn-primary">
                搜索
              </button>
            </div>
          </div>

          {/* 文档列表 */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-200">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">暂无文档</p>
              <button
                onClick={() => { resetForm(); setShowCreateModal(true); }}
                className="mt-4 text-primary-600 hover:text-primary-700"
              >
                创建第一个文档
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map(doc => (
                <div
                  key={doc.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/docs/${doc.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(doc.docType)}`}>
                        {DOC_TYPES.find(t => t.id === doc.docType)?.label || doc.docType}
                      </span>
                      <h3 className="font-semibold text-gray-900 mt-2 line-clamp-2">{doc.title}</h3>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(doc.status)}`}>
                      {doc.status === 'active' ? '有效' : doc.status === 'archived' ? '归档' : '废弃'}
                    </span>
                  </div>
                  
                  {doc.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{doc.description}</p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="font-mono">{doc.code}</span>
                    <span>{doc.version}</span>
                  </div>
                  
                  {doc.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {doc.tags.split(',').slice(0, 3).map((tag, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{doc.category?.name}</span>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEditModal(doc)}
                        className="text-gray-400 hover:text-primary-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 新建/编辑文档弹窗 */}
      {(showCreateModal || editingDoc) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingDoc ? '编辑文档' : '新建文档'}
              </h2>
              <button
                onClick={() => { setShowCreateModal(false); setEditingDoc(null); resetForm(); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label required">文档分类</label>
                  <select
                    className="input"
                    value={docForm.categoryId}
                    onChange={(e) => setDocForm({ ...docForm, categoryId: e.target.value })}
                  >
                    <option value="">选择分类</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label required">文档编号</label>
                  <input
                    type="text"
                    className="input font-mono"
                    placeholder="如 SOP-RG-LAMP-001"
                    value={docForm.code}
                    onChange={(e) => setDocForm({ ...docForm, code: e.target.value })}
                  />
                </div>
              </div>
              
              <div>
                <label className="label required">文档标题</label>
                <input
                  type="text"
                  className="input"
                  placeholder="输入文档标题"
                  value={docForm.title}
                  onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label">文档描述</label>
                <textarea
                  className="input h-20"
                  placeholder="简要描述文档内容"
                  value={docForm.description}
                  onChange={(e) => setDocForm({ ...docForm, description: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">文档类型</label>
                  <select
                    className="input"
                    value={docForm.docType}
                    onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })}
                  >
                    {DOC_TYPES.map(type => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">版本号</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="如 V1.0"
                    value={docForm.version}
                    onChange={(e) => setDocForm({ ...docForm, version: e.target.value })}
                  />
                </div>
              </div>
              
              <div>
                <label className="label">标签</label>
                <input
                  type="text"
                  className="input"
                  placeholder="多个标签用逗号分隔"
                  value={docForm.tags}
                  onChange={(e) => setDocForm({ ...docForm, tags: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label">文档内容</label>
                <textarea
                  className="input h-40 font-mono text-sm"
                  placeholder="输入文档正文内容..."
                  value={docForm.content}
                  onChange={(e) => setDocForm({ ...docForm, content: e.target.value })}
                />
              </div>
            </div>
            
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
              <button
                onClick={() => { setShowCreateModal(false); setEditingDoc(null); resetForm(); }}
                className="btn btn-secondary"
              >
                取消
              </button>
              <button
                onClick={editingDoc ? handleUpdateDoc : handleCreateDoc}
                className="btn btn-primary"
              >
                {editingDoc ? '保存修改' : '创建文档'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
