import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const reagents = new Hono();

// 所有路由需要认证
reagents.use('*', authMiddleware);

// GET /api/reagents - 列表，支持 ?category=&keyword=
reagents.get('/', async (c) => {
  try {
    const category = c.req.query('category');
    const keyword = c.req.query('keyword');

    const where = {};
    if (category) where.category = category;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { fullName: { contains: keyword } },
        { casNumber: { contains: keyword } },
      ];
    }

    const list = await prisma.reagent.findMany({ where, orderBy: { name: 'asc' } });
    return c.json({ success: true, list });
  } catch (err) {
    console.error('获取试剂列表失败', err);
    return c.json({ error: '获取试剂列表失败' }, 500);
  }
});

// GET /api/reagents/:id 详情（含被哪些配方使用）
reagents.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const reagent = await prisma.reagent.findUnique({ where: { id } });
    if (!reagent) return c.json({ error: '试剂不存在' }, 404);

    const usedIn = await prisma.formulaComponent.findMany({
      where: { reagentId: id },
      include: { formula: { select: { id: true, code: true, name: true, type: true } } }
    });

    return c.json({ success: true, reagent, usedIn });
  } catch (err) {
    console.error('获取试剂详情失败', err);
    return c.json({ error: '获取试剂详情失败' }, 500);
  }
});

// POST /api/reagents 新建
reagents.post('/', async (c) => {
  try {
    const data = await c.req.json();
    const created = await prisma.reagent.create({ data });
    return c.json({ success: true, reagent: created });
  } catch (err) {
    console.error('创建试剂失败', err);
    return c.json({ error: '创建试剂失败' }, 500);
  }
});

// PUT /api/reagents/:id 更新
reagents.put('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const data = await c.req.json();
    const updated = await prisma.reagent.update({ where: { id }, data });
    return c.json({ success: true, reagent: updated });
  } catch (err) {
    console.error('更新试剂失败', err);
    return c.json({ error: '更新试剂失败' }, 500);
  }
});

// DELETE /api/reagents/:id 删除（检查 FormulaComponent 引用）
reagents.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const refCount = await prisma.formulaComponent.count({ where: { reagentId: id } });
    if (refCount > 0) {
      return c.json({ error: '该试剂被配方引用，无法删除' }, 400);
    }
    await prisma.reagent.delete({ where: { id } });
    return c.json({ success: true });
  } catch (err) {
    console.error('删除试剂失败', err);
    return c.json({ error: '删除试剂失败' }, 500);
  }
});

// GET /api/reagents/:id/formulas - 该试剂被引用的配方列表
reagents.get('/:id/formulas', async (c) => {
  const id = c.req.param('id');
  try {
    const comps = await prisma.formulaComponent.findMany({
      where: { reagentId: id },
      include: { formula: true }
    });
    const formulas = comps.map((c) => c.formula);
    return c.json({ success: true, list: formulas });
  } catch (err) {
    console.error('获取引用配方失败', err);
    return c.json({ error: '获取引用配方失败' }, 500);
  }
});

export default reagents;
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const reagents = new Hono();

// 所有路由都需要认证
reagents.use('*', authMiddleware);

// 获取所有分类(包含层级结构)
reagents.get('/categories', async (c) => {
  try {
    // 首先获取所有分类
    const allCategories = await prisma.reagentCategory.findMany({
      include: {
        _count: {
          select: { recipes: true }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });
    
    // 构建层级结构
    const topLevelCategories = allCategories.filter(cat => !cat.parentId);
    
    // 递归函数添加子分类
    const addChildren = (category) => {
      const children = allCategories.filter(c => c.parentId === category.id);
      return {
        ...category,
        children: children.map(addChildren)
      };
    };
    
    // 为顶级分类添加子分类
    const hierarchicalCategories = topLevelCategories.map(addChildren);
    
    return c.json({ 
      success: true, 
      list: hierarchicalCategories,
      flat: allCategories  // 同时提供扁平结构,便于某些操作
    });
  } catch (error) {
    console.error('获取分类失败:', error);
    return c.json({ error: '获取分类失败' }, 500);
  }
});

// 创建分类
reagents.post('/categories', async (c) => {
  try {
    const data = await c.req.json();
    
    // 检查是否存在同名分类
    const existing = await prisma.reagentCategory.findFirst({
      where: { name: data.name }
    });
    
    if (existing) {
      return c.json({ error: '分类名称已存在' }, 400);
    }
    
    const category = await prisma.reagentCategory.create({
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon || '🧪',
        parentId: data.parentId || null,
        sortOrder: data.sortOrder || 0
      }
    });
    
    return c.json({ 
      success: true, 
      category 
    });
  } catch (error) {
    console.error('创建分类失败:', error);
    return c.json({ error: '创建分类失败' }, 500);
  }
});

// 更新分类
reagents.put('/categories/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  
  try {
    // 检查父子关系循环引用
    if (data.parentId) {
      let parentId = data.parentId;
      const visited = new Set([id]);
      
      while (parentId) {
        if (visited.has(parentId)) {
          return c.json({ error: '不能创建循环的分类层级' }, 400);
        }
        
        visited.add(parentId);
        const parent = await prisma.reagentCategory.findUnique({
          where: { id: parentId },
          select: { parentId: true }
        });
        
        if (!parent) break;
        parentId = parent.parentId;
      }
    }
    
    const category = await prisma.reagentCategory.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
        parentId: data.parentId,
        sortOrder: data.sortOrder
      }
    });
    
    return c.json({ success: true, category });
  } catch (error) {
    console.error('更新分类失败:', error);
    return c.json({ error: '更新分类失败' }, 500);
  }
});

// 删除分类
reagents.delete('/categories/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    // 检查该分类是否有配方
    const recipeCount = await prisma.reagentRecipe.count({
      where: { categoryId: id }
    });
    
    if (recipeCount > 0) {
      return c.json({ 
        error: '该分类下有配方,不能删除。请先将配方移至其他分类或删除配方。'
      }, 400);
    }
    
    // 检查是否有子分类
    const childCount = await prisma.reagentCategory.count({
      where: { parentId: id }
    });
    
    if (childCount > 0) {
      return c.json({ 
        error: '该分类有子分类,不能删除。请先删除子分类。'
      }, 400);
    }
    
    await prisma.reagentCategory.delete({
      where: { id }
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除分类失败:', error);
    return c.json({ error: '删除分类失败' }, 500);
  }
});

// 获取配方列表
reagents.get('/recipes', async (c) => {
  const categoryId = c.req.query('categoryId');
  const keyword = c.req.query('keyword');
  
  try {
    const where = {};
    
    if (categoryId) {
      where.categoryId = categoryId;
    }
    
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
        { description: { contains: keyword } },
        { tags: { contains: keyword } }
      ];
    }
    
    const recipes = await prisma.reagentRecipe.findMany({
      where,
      include: {
        category: true,
        creator: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    
    return c.json({ success: true, list: recipes });
  } catch (error) {
    console.error('获取配方失败:', error);
    return c.json({ error: '获取配方失败' }, 500);
  }
});

// 创建配方
reagents.post('/recipes', async (c) => {
  try {
    const data = await c.req.json();
    const userId = c.get('userId');
    
    // 检查编号是否已存在
    const existing = await prisma.reagentRecipe.findUnique({
      where: { code: data.code }
    });
    
    if (existing) {
      return c.json({ error: '配方编号已存在' }, 400);
    }
    
    const recipe = await prisma.reagentRecipe.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        ingredients: data.ingredients,
        procedure: data.procedure,
        notes: data.notes,
        categoryId: data.categoryId,
        createdBy: userId,
        tags: data.tags
      }
    });
    
    return c.json({ success: true, recipe });
  } catch (error) {
    console.error('创建配方失败:', error);
    return c.json({ error: '创建配方失败' }, 500);
  }
});

// 获取单个配方详情
reagents.get('/recipes/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const recipe = await prisma.reagentRecipe.findUnique({
      where: { id },
      include: {
        category: true,
        creator: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    if (!recipe) {
      return c.json({ error: '配方不存在' }, 404);
    }
    
    return c.json({ success: true, recipe });
  } catch (error) {
    console.error('获取配方详情失败:', error);
    return c.json({ error: '获取配方详情失败' }, 500);
  }
});

// 更新配方
reagents.put('/recipes/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  
  try {
    const recipe = await prisma.reagentRecipe.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        ingredients: data.ingredients,
        procedure: data.procedure,
        notes: data.notes,
        categoryId: data.categoryId,
        tags: data.tags,
        status: data.status
      }
    });
    
    return c.json({ success: true, recipe });
  } catch (error) {
    console.error('更新配方失败:', error);
    return c.json({ error: '更新配方失败' }, 500);
  }
});

// 删除配方
reagents.delete('/recipes/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    await prisma.reagentRecipe.delete({
      where: { id }
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除配方失败:', error);
    return c.json({ error: '删除配方失败' }, 500);
  }
});

export default reagents;