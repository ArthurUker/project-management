import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const tasks = new Hono();

tasks.use('*', authMiddleware);

// 获取任务列表
tasks.get('/', async (c) => {
  const { 
    page = 1, 
    pageSize = 50, 
    projectId, 
    assigneeId, 
    status,
    priority 
  } = c.req.query();
  
  const where = {};
  if (projectId) where.projectId = projectId;
  if (assigneeId) where.assigneeId = assigneeId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  
  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize),
      orderBy: [
        { priority: 'asc' }, // 高优先级在前
        { dueDate: 'asc' }
      ],
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true, avatar: true } }
      }
    })
  ]);
  
  // 解析所有任务的 docRefs
  const tasksWithDocRefs = tasks.map(task => ({
    ...task,
    docRefs: task.docRefs ? JSON.parse(task.docRefs) : null
  }));
  
  return c.json({
    list: tasksWithDocRefs,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

// 获取单个任务
tasks.get('/:id', async (c) => {
  const { id } = c.params;
  
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: true,
      assignee: { select: { id: true, name: true, avatar: true } }
    }
  });
  
  if (!task) return c.json({ error: '任务不存在' }, 404);
  
  // 解析 docRefs
  return c.json({
    ...task,
    docRefs: task.docRefs ? JSON.parse(task.docRefs) : null
  });
});

// 创建任务
tasks.post('/', async (c) => {
  const userId = c.get('userId');
  const { projectId, title, description, assigneeId, priority, dueDate, docRefs } = await c.req.json();
  
  if (!projectId || !title) return c.json({ error: '项目和标题不能为空' }, 400);
  
  const task = await prisma.task.create({
    data: {
      projectId,
      title,
      description,
      assigneeId,
      priority: priority || '中',
      dueDate: dueDate ? new Date(dueDate) : null,
      docRefs: docRefs ? JSON.stringify(docRefs) : null
    },
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } }
    }
  });
  
  // 返回时解析 docRefs
  return c.json({
    ...task,
    docRefs: task.docRefs ? JSON.parse(task.docRefs) : null
  }, 201);
});

// 更新任务
tasks.put('/:id', async (c) => {
  const { id } = c.params;
  const body = await c.req.json();
  
  // 处理日期字段
  if (body.dueDate) body.dueDate = new Date(body.dueDate);
  
  // 处理 docRefs 字段
  if (body.docRefs !== undefined) {
    body.docRefs = body.docRefs ? JSON.stringify(body.docRefs) : null;
  }
  
  const task = await prisma.task.update({
    where: { id },
    data: body,
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } }
    }
  });
  
  // 返回时解析 docRefs
  return c.json({
    ...task,
    docRefs: task.docRefs ? JSON.parse(task.docRefs) : null
  });
});

// 更新任务状态（Kanban拖拽）
tasks.patch('/:id/status', async (c) => {
  const { id } = c.params;
  const { status } = await c.req.json();
  
  const data = { status };
  if (status === '已完成') {
    data.completedAt = new Date();
  }
  
  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } }
    }
  });
  
  return c.json(task);
});

// 删除任务
tasks.delete('/:id', async (c) => {
  const { id } = c.params;
  await prisma.task.delete({ where: { id } });
  return c.json({ success: true });
});

// 获取看板数据
tasks.get('/board/:projectId', async (c) => {
  const { projectId } = c.params;
  
  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } }
    }
  });
  
  // 解析所有任务的 docRefs
  const tasksWithDocRefs = tasks.map(task => ({
    ...task,
    docRefs: task.docRefs ? JSON.parse(task.docRefs) : null
  }));
  
  // 按状态分组
  const board = {
    '待开始': tasksWithDocRefs.filter(t => t.status === '待开始'),
    '进行中': tasksWithDocRefs.filter(t => t.status === '进行中'),
    '已完成': tasksWithDocRefs.filter(t => t.status === '已完成'),
    '已阻塞': tasksWithDocRefs.filter(t => t.status === '已阻塞')
  };
  
  return c.json(board);
});

// 批量更新任务状态
tasks.post('/batch/status', async (c) => {
  const { updates } = await c.req.json();
  
  if (!Array.isArray(updates)) return c.json({ error: '更新数据格式错误' }, 400);
  
  const results = await Promise.all(
    updates.map(({ id, status }) => {
      const data = { status };
      if (status === '已完成') data.completedAt = new Date();
      return prisma.task.update({ where: { id }, data });
    })
  );
  
  return c.json({ success: true, updated: results.length });
});

export default tasks;
