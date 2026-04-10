import { useState, useEffect, useRef } from 'react';
import { docsAPI } from '../api/client';

interface DocRef {
  id: string;
  code: string;
  title: string;
  docType: string;
  version: string;
  category?: { name: string };
}

interface DocReferenceProps {
  value: DocRef[];
  onChange: (refs: DocRef[]) => void;
  placeholder?: string;
  maxItems?: number;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: 'SOP',
  template: '模板',
  guide: '指南',
  reference: '参考',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  sop: 'bg-blue-100 text-blue-700',
  template: 'bg-green-100 text-green-700',
  guide: 'bg-purple-100 text-purple-700',
  reference: 'bg-orange-100 text-orange-700',
};

export default function DocReference({ 
  value = [], 
  onChange, 
  placeholder = '搜索文档引用...',
  maxItems = 10 
}: DocReferenceProps) {
  const [searching, setSearching] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<DocRef[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const searchDocs = async () => {
      if (!keyword.trim()) {
        setResults([]);
        return;
      }
      
      setSearching(true);
      try {
        const res = await docsAPI.documents.search(keyword);
        // 过滤掉已选中的文档
        const selectedIds = new Set(value.map(v => v.id));
        setResults((res.list || []).filter((doc: DocRef) => !selectedIds.has(doc.id)));
      } catch (error) {
        console.error('搜索文档失败:', error);
        setResults([]);
      } finally {
        setSearching(false);
      }
    };

    const debounce = setTimeout(searchDocs, 300);
    return () => clearTimeout(debounce);
  }, [keyword, value]);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (doc: DocRef) => {
    if (value.length >= maxItems) {
      alert(`最多只能引用 ${maxItems} 个文档`);
      return;
    }
    onChange([...value, doc]);
    setKeyword('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleRemove = (id: string) => {
    onChange(value.filter(ref => ref.id !== id));
  };

  return (
    <div className="space-y-2">
      {/* 已选文档列表 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((doc) => (
            <div
              key={doc.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm"
            >
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${DOC_TYPE_COLORS[doc.docType] || 'bg-gray-100 text-gray-600'}`}>
                {DOC_TYPE_LABELS[doc.docType] || doc.docType}
              </span>
              <span className="font-mono text-blue-700">{doc.code}</span>
              <span className="text-gray-600 max-w-[150px] truncate">{doc.title}</span>
              <button
                type="button"
                onClick={() => handleRemove(doc.id)}
                className="text-gray-400 hover:text-red-500 ml-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 搜索输入框 */}
      {value.length < maxItems && (
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              className="input pl-10 w-full text-sm"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>

          {/* 搜索结果下拉框 */}
          {showDropdown && results.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {results.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => handleSelect(doc)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${DOC_TYPE_COLORS[doc.docType] || 'bg-gray-100 text-gray-600'}`}>
                          {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                        </span>
                        <span className="font-mono text-sm text-gray-500">{doc.code}</span>
                        <span className="text-gray-800 font-medium truncate">{doc.title}</span>
                      </div>
                      {doc.category && (
                        <div className="text-xs text-gray-400 mt-1">
                          分类：{doc.category.name}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs text-gray-400">v{doc.version}</span>
                      <svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 无结果提示 */}
          {showDropdown && keyword.trim() && !searching && results.length === 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500 text-sm">
              未找到匹配的文档
            </div>
          )}
        </div>
      )}

      {/* 提示信息 */}
      <div className="text-xs text-gray-400">
        已引用 {value.length}/{maxItems} 个文档
      </div>
    </div>
  );
}
