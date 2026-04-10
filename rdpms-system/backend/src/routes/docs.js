import { Hono } from 'hono';
import { prisma } from '../index.js';

const docs = new Hono();

// 获取所有分类
docs.get('/categories', async (c) => {
  try {
    const categories = await prisma.docCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { documents: true }
        }
      }
    });
    return c.json({ list: categories });
  } catch (error) {
    console.error('获取分类失败:', error);
    return c.json({ error: '获取分类失败' }, 500);
  }
});

// 创建分类
docs.post('/categories', async (c) => {
  try {
    const { name, description, icon, sortOrder } = await c.req.json();
    
    // 检查名称是否重复
    const existing = await prisma.docCategory.findFirst({ where: { name } });
    if (existing) {
      return c.json({ error: '分类名称已存在' }, 400);
    }
    
    const category = await prisma.docCategory.create({
      data: { name, description, icon, sortOrder: sortOrder || 0 }
    });
    
    return c.json(category);
  } catch (error) {
    console.error('创建分类失败:', error);
    return c.json({ error: '创建分类失败' }, 500);
  }
});

// 更新分类
docs.put('/categories/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const { name, description, icon, sortOrder } = await c.req.json();
    
    const category = await prisma.docCategory.update({
      where: { id },
      data: { name, description, icon, sortOrder }
    });
    
    return c.json(category);
  } catch (error) {
    console.error('更新分类失败:', error);
    return c.json({ error: '更新分类失败' }, 500);
  }
});

// 删除分类
docs.delete('/categories/:id', async (c) => {
  try {
    const { id } = c.req.param();
    await prisma.docCategory.delete({ where: { id } });
    return c.json({ success: true });
  } catch (error) {
    console.error('删除分类失败:', error);
    return c.json({ error: '删除分类失败' }, 500);
  }
});

// 获取所有文档（支持筛选）
docs.get('/documents', async (c) => {
  try {
    const { categoryId, docType, status, keyword, page = 1, pageSize = 20 } = c.req.query();
    
    const where = {};
    if (categoryId) where.categoryId = categoryId;
    if (docType) where.docType = docType;
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { code: { contains: keyword } },
        { description: { contains: keyword } },
        { tags: { contains: keyword } }
      ];
    }
    
    const [documents, total] = await Promise.all([
      prisma.docDocument.findMany({
        where,
        include: {
          category: true,
          creator: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } }
        },
        orderBy: { updatedAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(pageSize),
        take: parseInt(pageSize)
      }),
      prisma.docDocument.count({ where })
    ]);
    
    return c.json({ list: documents, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (error) {
    console.error('获取文档失败:', error);
    return c.json({ error: '获取文档失败' }, 500);
  }
});

// 获取单个文档
docs.get('/documents/:id', async (c) => {
  try {
    const { id } = c.req.param();
    
    const document = await prisma.docDocument.findUnique({
      where: { id },
      include: {
        category: true,
        creator: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
        versions: {
          orderBy: { createdAt: 'desc' },
          include: {
            creator: { select: { id: true, name: true } }
          }
        }
      }
    });
    
    if (!document) {
      return c.json({ error: '文档不存在' }, 404);
    }
    
    return c.json(document);
  } catch (error) {
    console.error('获取文档失败:', error);
    return c.json({ error: '获取文档失败' }, 500);
  }
});

// 创建文档
docs.post('/documents', async (c) => {
  try {
    const { categoryId, code, title, description, docType, content, fileUrl, fileName, version, tags, createdBy } = await c.req.json();
    
    // 检查编号是否重复
    const existing = await prisma.docDocument.findUnique({ where: { code } });
    if (existing) {
      return c.json({ error: '文档编号已存在' }, 400);
    }
    
    const document = await prisma.docDocument.create({
      data: {
        categoryId,
        code,
        title,
        description,
        docType: docType || 'sop',
        content,
        fileUrl,
        fileName,
        version: version || 'V1.0',
        tags,
        createdBy
      },
      include: {
        category: true,
        creator: { select: { id: true, name: true } }
      }
    });
    
    // 创建第一个版本记录
    await prisma.docVersion.create({
      data: {
        documentId: document.id,
        version: version || 'V1.0',
        content: content || '',
        changelog: '初始版本',
        createdBy
      }
    });
    
    return c.json(document);
  } catch (error) {
    console.error('创建文档失败:', error);
    return c.json({ error: '创建文档失败' }, 500);
  }
});

// 更新文档
docs.put('/documents/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const { title, description, content, fileUrl, fileName, version, changelog, tags, status, approvedBy, updatedBy } = await c.req.json();
    
    const existing = await prisma.docDocument.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: '文档不存在' }, 404);
    }
    
    const updateData = { title, description, fileUrl, fileName, tags, status };
    
    // 如果版本变化，创建新版本记录
    if (version && version !== existing.version) {
      updateData.version = version;
      updateData.approvedBy = approvedBy || null;
      updateData.approvedAt = approvedBy ? new Date() : null;
      
      // 创建版本历史
      await prisma.docVersion.create({
        data: {
          documentId: id,
          version,
          content: content || existing.content,
          changelog: changelog || '版本更新',
          createdBy: updatedBy
        }
      });
    }
    
    if (content !== undefined) {
      updateData.content = content;
    }
    
    const document = await prisma.docDocument.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        creator: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } }
      }
    });
    
    return c.json(document);
  } catch (error) {
    console.error('更新文档失败:', error);
    return c.json({ error: '更新文档失败' }, 500);
  }
});

// 删除文档
docs.delete('/documents/:id', async (c) => {
  try {
    const { id } = c.req.param();
    await prisma.docDocument.delete({ where: { id } });
    return c.json({ success: true });
  } catch (error) {
    console.error('删除文档失败:', error);
    return c.json({ error: '删除文档失败' }, 500);
  }
});

// 获取文档版本历史
docs.get('/documents/:id/versions', async (c) => {
  try {
    const { id } = c.req.param();
    
    const versions = await prisma.docVersion.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true } }
      }
    });
    
    return c.json({ list: versions });
  } catch (error) {
    console.error('获取版本历史失败:', error);
    return c.json({ error: '获取版本历史失败' }, 500);
  }
});

// 根据关键词搜索文档（用于日报中快速引用）
docs.get('/search', async (c) => {
  try {
    const { keyword, docType, limit = 10 } = c.req.query();
    
    if (!keyword) {
      return c.json({ list: [] });
    }
    
    const documents = await prisma.docDocument.findMany({
      where: {
        status: 'active',
        docType: docType || undefined,
        OR: [
          { title: { contains: keyword } },
          { code: { contains: keyword } },
          { tags: { contains: keyword } }
        ]
      },
      select: {
        id: true,
        code: true,
        title: true,
        version: true,
        docType: true,
        category: { select: { name: true } }
      },
      take: parseInt(limit),
      orderBy: { updatedAt: 'desc' }
    });
    
    return c.json({ list: documents });
  } catch (error) {
    console.error('搜索文档失败:', error);
    return c.json({ error: '搜索文档失败' }, 500);
  }
});

export default docs;
