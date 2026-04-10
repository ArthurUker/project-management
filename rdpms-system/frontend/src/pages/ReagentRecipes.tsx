import { useState, useEffect } from 'react';
import { reagentsAPI } from '../api/client';


interface ReagentCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  parentId?: string;
  children?: ReagentCategory[];
  _count?: { recipes: number };
}

interface ReagentRecipe {
  id: string;
  code: string;
  name: string;
  description?: string;
  ingredients: string;
  procedure: string;
  notes?: string;
  category: ReagentCategory;
  creator: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  tags?: string;
  status: string;
}

// 默认主分类
const DEFAULT_CATEGORIES = [
  { name: '核酸提取试剂', description: '用于样本中核酸提取的试剂配方', icon: '🧬' },
  { name: '扩增试剂', description: '用于核酸扩增的试剂配方', icon: '🔬' },
  { name: '常用缓冲液', description: '实验中常用的各类缓冲液', icon: '🧪' },
];

export default function ReagentRecipes() {
  // 状态管理
  const [categories, setCategories] = useState<ReagentCategory[]>([]); // 所有分类
  const [flatCategories, setFlatCategories] = useState<ReagentCategory[]>([]); // 扁平化的分类列表(用于选择框)
  const [recipes, setRecipes] = useState<ReagentRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  
  // 模态框状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<ReagentRecipe | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ReagentCategory | null>(null);
  
  // 表单状态
  const [recipeForm, setRecipeForm] = useState({
    code: '',
    name: '',
    description: '',
    ingredients: '',
    procedure: '',
    notes: '',
    categoryId: '',
    tags: ''
  });
  
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    icon: '🧪',
    parentId: '',
    sortOrder: 0
  });

  // 初始化数据
  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (categories.length > 0) {
      loadRecipes();
    }
  }, [selectedCategoryId, categories]);

  // 加载分类
  const loadCategories = async () => {
    try {
      const res = await reagentsAPI.categories.list();
      
      if (!res.success) {
        console.error('加载分类失败');
        return;
      }
      
      let cats = res.list || [];
      setFlatCategories(res.flat || []);
      
      // 如果没有分类，创建默认分类
      if (cats.length === 0) {
        await createDefaultCategories();
        const newRes = await reagentsAPI.categories.list();
        cats = newRes.list || [];
        setFlatCategories(newRes.flat || []);
      }
      
      setCategories(cats);
      if (cats.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(cats[0].id);
      }
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  };

  // 创建默认分类
  const createDefaultCategories = async () => {
    for (const cat of DEFAULT_CATEGORIES) {
      try {
        await reagentsAPI.categories.create(cat);
      } catch (e) {
        console.error('创建默认分类失败:', e);
      }
    }
  };

  // 加载配方
  const loadRecipes = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (selectedCategoryId) params.categoryId = selectedCategoryId;
      if (searchKeyword) params.keyword = searchKeyword;
      
      const res = await reagentsAPI.recipes.list(params);
      if (res.success) {
        setRecipes(res.list || []);
      }
    } catch (error) {
      console.error('加载配方失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 搜索
  const handleSearch = () => {
    loadRecipes();
  };

  // 递归渲染分类树
  const renderCategoryTree = (category: ReagentCategory, level = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    
    return (
      <div key={category.id} className="category-item">
        <button
          onClick={() => setSelectedCategoryId(category.id)}
          className={`category-button ${selectedCategoryId === category.id ? 'active' : ''}`}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
        >
          <span className="category-icon">{category.icon}</span>
          <span className="category-name">{category.name}</span>
          {category._count && (
            <span className="category-count">{category._count.recipes}</span>
          )}
        </button>
        
        {/* 子分类 */}
        {hasChildren && (
          <div className="subcategories">
            {category.children!.map(child => renderCategoryTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // 创建/更新配方
  const handleSaveRecipe = async () => {
    if (!recipeForm.name || !recipeForm.code || !recipeForm.categoryId) {
      alert('请填写必填项');
      return;
    }
    
    try {
      if (editingRecipe) {
        await reagentsAPI.recipes.update(editingRecipe.id, recipeForm);
      } else {
        await reagentsAPI.recipes.create(recipeForm);
      }
      
      setShowCreateModal(false);
      setEditingRecipe(null);
      resetRecipeForm();
      loadRecipes();
    } catch (error: any) {
      alert(error.message || '保存失败');
    }
  };

  // 创建/更新分类
  const handleSaveCategory = async () => {
    if (!categoryForm.name) {
      alert('请填写分类名称');
      return;
    }
    
    try {
      if (editingCategory) {
        await reagentsAPI.categories.update(editingCategory.id, categoryForm);
      } else {
        await reagentsAPI.categories.create(categoryForm);
      }
      
      setShowCategoryModal(false);
      setEditingCategory(null);
      resetCategoryForm();
      loadCategories();
    } catch (error: any) {
      alert(error.message || '保存分类失败');
    }
  };

  // 删除配方
  const handleDeleteRecipe = async (id: string) => {
    if (!confirm('确定要删除这个配方吗？')) return;
    
    try {
      await reagentsAPI.recipes.delete(id);
      loadRecipes();
    } catch (error) {
      alert('删除失败');
    }
  };

  // 删除分类
  const handleDeleteCategory = async (id: string) => {
    if (!confirm('确定要删除这个分类吗？删除前需确保分类下没有配方和子分类。')) return;
    
    try {
      await reagentsAPI.categories.delete(id);
      loadCategories();
    } catch (error: any) {
      alert(error.message || '删除分类失败');
    }
  };

  // 重置表单
  const resetRecipeForm = () => {
    setRecipeForm({
      code: '',
      name: '',
      description: '',
      ingredients: '',
      procedure: '',
      notes: '',
      categoryId: selectedCategoryId || '',
      tags: ''
    });
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: '',
      description: '',
      icon: '🧪',
      parentId: '',
      sortOrder: 0
    });
  };

  // 打开编辑配方模态框
  const openEditRecipeModal = (recipe: ReagentRecipe) => {
    setEditingRecipe(recipe);
    setRecipeForm({
      code: recipe.code,
      name: recipe.name,
      description: recipe.description || '',
      ingredients: recipe.ingredients,
      procedure: recipe.procedure,
      notes: recipe.notes || '',
      categoryId: recipe.category.id,
      tags: recipe.tags || ''
    });
    setShowCreateModal(true);
  };

  // 打开编辑分类模态框
  const openEditCategoryModal = (category: ReagentCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '🧪',
      parentId: category.parentId || '',
      sortOrder: 0
    });
    setShowCategoryModal(true);
  };

  // 获取状态样式
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
          <h1 className="text-2xl font-bold text-gray-900">试剂配方管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理实验室常用试剂的配方和制备方法</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }}
            className="btn btn-secondary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            新建分类
          </button>
          <button
            onClick={() => { resetRecipeForm(); setShowCreateModal(true); }}
            className="btn btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            新建配方
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* 左侧分类导航 */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">配方分类</h3>
              <button
                onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }}
                className="text-gray-400 hover:text-primary-600"
                title="管理分类"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 6h12M10.5 12h12m-12 6h12M1.5 6h.01M1.5 12h.01M1.5 18h.01" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-1 categories-tree">
              <div className="flex items-center group">
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className={`category-button flex-1 ${
                    selectedCategoryId === null ? 'active' : ''
                  }`}
                >
                  <span className="category-icon">📑</span>
                  <span className="category-name">全部配方</span>
                </button>
              </div>
              
              {categories.map(category => (
                <div key={category.id} className="group">
                  {renderCategoryTree(category)}
                  <button
                    onClick={() => openEditCategoryModal(category)}
                    className="ml-auto opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary-600 p-1 text-xs"
                    title="编辑分类"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧配方列表 */}
        <div className="flex-1">
          {/* 搜索栏 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="relative min-w-[240px]">
                <input
                  type="text"
                  placeholder="搜索配方名称、编号..."
                  className="input pl-10"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              
              <button onClick={handleSearch} className="btn btn-primary">
                搜索
              </button>
            </div>
          </div>

          {/* 配方列表 */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : recipes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-200">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <p className="text-gray-500">暂无配方</p>
              <button
                onClick={() => { resetRecipeForm(); setShowCreateModal(true); }}
                className="mt-4 text-primary-600 hover:text-primary-700"
              >
                创建第一个配方
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recipes.map(recipe => (
                <div
                  key={recipe.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{recipe.name}</h3>
                      <p className="text-xs text-gray-500 font-mono mt-1">{recipe.code}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(recipe.status)}`}>
                      {recipe.status === 'active' ? '有效' : recipe.status === 'archived' ? '归档' : '废弃'}
                    </span>
                  </div>
                  
                  {recipe.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{recipe.description}</p>
                  )}
                  
                  <div className="my-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 overflow-hidden line-clamp-3 font-mono">
                    {recipe.ingredients.substring(0, 150)}
                    {recipe.ingredients.length > 150 ? '...' : ''}
                  </div>
                  
                  {recipe.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {recipe.tags.split(',').slice(0, 3).map((tag, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <span>{recipe.category?.icon}</span>
                      <span>{recipe.category?.name}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditRecipeModal(recipe)}
                        className="text-gray-400 hover:text-primary-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteRecipe(recipe.id)}
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

      {/* 创建/编辑配方弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingRecipe ? '编辑配方' : '新建配方'}
              </h2>
              <button
                onClick={() => { setShowCreateModal(false); setEditingRecipe(null); }}
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
                  <label className="label required">配方分类</label>
                  <select
                    className="input"
                    value={recipeForm.categoryId}
                    onChange={(e) => setRecipeForm({ ...recipeForm, categoryId: e.target.value })}
                  >
                    <option value="">选择分类</option>
                    {flatCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label required">配方编号</label>
                  <input
                    type="text"
                    className="input font-mono"
                    placeholder="如 REA-NA-001"
                    value={recipeForm.code}
                    onChange={(e) => setRecipeForm({ ...recipeForm, code: e.target.value })}
                    disabled={!!editingRecipe} // 编辑时不允许修改编号
                  />
                </div>
              </div>
              
              <div>
                <label className="label required">配方名称</label>
                <input
                  type="text"
                  className="input"
                  placeholder="输入配方名称"
                  value={recipeForm.name}
                  onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label">配方描述</label>
                <textarea
                  className="input h-20"
                  placeholder="简要描述配方用途"
                  value={recipeForm.description}
                  onChange={(e) => setRecipeForm({ ...recipeForm, description: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label required">成分与用量</label>
                <textarea
                  className="input h-32 font-mono text-sm"
                  placeholder="列出所有成分和用量，每行一个..."
                  value={recipeForm.ingredients}
                  onChange={(e) => setRecipeForm({ ...recipeForm, ingredients: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label required">制备步骤</label>
                <textarea
                  className="input h-32"
                  placeholder="详细描述制备步骤..."
                  value={recipeForm.procedure}
                  onChange={(e) => setRecipeForm({ ...recipeForm, procedure: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label">注意事项</label>
                <textarea
                  className="input h-20"
                  placeholder="使用或制备时的注意事项..."
                  value={recipeForm.notes}
                  onChange={(e) => setRecipeForm({ ...recipeForm, notes: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label">标签</label>
                <input
                  type="text"
                  className="input"
                  placeholder="多个标签用逗号分隔"
                  value={recipeForm.tags}
                  onChange={(e) => setRecipeForm({ ...recipeForm, tags: e.target.value })}
                />
              </div>
            </div>
            
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
              <button
                onClick={() => { setShowCreateModal(false); setEditingRecipe(null); }}
                className="btn btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleSaveRecipe}
                className="btn btn-primary"
              >
                {editingRecipe ? '保存修改' : '创建配方'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建/编辑分类弹窗 */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingCategory ? '编辑分类' : '新建分类'}
              </h2>
              <button
                onClick={() => { setShowCategoryModal(false); setEditingCategory(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="label required">分类名称</label>
                <input
                  type="text"
                  className="input"
                  placeholder="输入分类名称"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label">分类描述</label>
                <textarea
                  className="input h-20"
                  placeholder="简要描述分类用途"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                />
              </div>
              
              <div>
                <label className="label">图标</label>
                <input
                  type="text"
                  className="input"
                  placeholder="输入emoji图标"
                  value={categoryForm.icon}
                  onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {['🧪', '🧬', '🔬', '🧫', '🦠', '📊', '📝', '🔍', '⚗️', '🧰'].map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setCategoryForm({ ...categoryForm, icon })}
                      className={`w-8 h-8 flex items-center justify-center rounded ${
                        categoryForm.icon === icon ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="label">父级分类</label>
                <select
                  className="input"
                  value={categoryForm.parentId}
                  onChange={(e) => setCategoryForm({ ...categoryForm, parentId: e.target.value })}
                >
                  <option value="">顶级分类</option>
                  {flatCategories
                    .filter(cat => !editingCategory || cat.id !== editingCategory.id)
                    .map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex items-center justify-between gap-3 border-t border-gray-200">
              {editingCategory && (
                <button
                  onClick={() => handleDeleteCategory(editingCategory.id)}
                  className="btn btn-danger"
                >
                  删除
                </button>
              )}
              <div className="flex items-center gap-3 ml-auto">
                <button
                  onClick={() => { setShowCategoryModal(false); setEditingCategory(null); }}
                  className="btn btn-secondary"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveCategory}
                  className="btn btn-primary"
                >
                  {editingCategory ? '保存修改' : '创建分类'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}