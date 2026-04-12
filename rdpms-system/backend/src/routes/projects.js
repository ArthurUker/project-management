import { Hono } from 'hono';
import { prisma } from '../index.js';
import { nanoid } from 'nanoid';
import { authMiddleware, adminMiddleware } from './auth.js';

const projects = new Hono();

projects.use('*', authMiddleware);

// 生成项目编号
async function generateProjectCode() {
  const year = new Date().getFullYear();
  const count = await prisma.project.count({
    where: {
      code: { startsWith: `PRJ-${year}` }
    }
  });
  return `PRJ-${year}-${String(count + 1).padStart(3, '0')}`;
}

// 获取项目列表
projects.get('/', async (c) => {
  const { 
    page = 1, 
    pageSize = 50, 
    type, 
    status, 
    managerId,
    keyword 
  } = c.req.query();
  
  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (managerId) where.managerId = managerId;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
      { subtype: { contains: keyword } }
    ];
  }
  
  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize),
      orderBy: { createdAt: 'desc' },
      include: {
        manager: {
          select: { id: true, name: true, position: true }
        },
        _count: {
          select: { tasks: true, members: true }
        }
      }
    })
  ]);
  
  return c.json({
    list: projects,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

// 获取单个项目
projects.get('/:id', async (c) => {
  const { id } = c.params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      manager: {
        select: { id: true, name: true, position: true, avatar: true }
      },
      template: {
        select: { id: true, name: true, code: true, category: true, content: true }
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true, position: true, avatar: true }
          }
        }
      },
      tasks: {
        orderBy: [{ phaseOrder: 'asc' }, { createdAt: 'asc' }],
      },
      milestones: {
        orderBy: { date: 'asc' }
      },
      monthlyProgress: {
        orderBy: { month: 'desc' },
        take: 6
      }
    }
  });

  if (!project) {
    return c.json({ error: '项目不存在' }, 404);
  }

  return c.json(project);
});

// 创建项目
projects.post('/', async (c) => {
  const body = await c.req.json();
  console.log('[CREATE PROJECT] req.body:', JSON.stringify(body, null, 2));
  const userId = c.get('userId');
  const userRole = c.get('userRole');

  // 验证
  if (!body.name) {
    return c.json({ error: '项目名称不能为空' }, 400);
  }

  // 非管理员必须指定负责人
  const managerId = body.managerId || (userRole === 'admin' ? undefined : userId);
  if (!managerId) {
    return c.json({ error: '必须指定项目负责人' }, 400);
  }

  // 生成编号
  const code = body.code || await generateProjectCode();

  const { tasks = [], milestones = [], managerId: _, templateId, ...projectData } = body;

  // 清理不属于 Project 模型的字段
  delete projectData.manager;
  delete projectData.members;
  delete projectData._count;
  delete projectData.createdAt;
  delete projectData.updatedAt;

  // 规范化日期字段
  if (projectData.startDate) {
    projectData.startDate = new Date(projectData.startDate);
  }
  if (projectData.endDate) {
    projectData.endDate = new Date(projectData.endDate);
  }

  const project = await prisma.project.create({
    data: {
      ...projectData,
      code,
      templateId: templateId || null,
      manager: { connect: { id: managerId } },
    },
    include: {
      manager: { select: { id: true, name: true } }
    }
  });

  // 自动添加负责人为项目成员
  await prisma.projectMember.create({
    data: {
      projectId: project.id,
      userId: managerId,
      role: 'manager'
    }
  });

  // 批量创建任务（支持 phase 信息）
  if (tasks.length > 0) {
    const tasksToCreate = tasks.map((t, idx) => ({
      projectId: project.id,
      title: t.title || `Task ${idx + 1}`,
      description: t.description || '',
      status: t.status || '待开始',
      priority: t.priority || '中',
      phase: t.phase || null,
      phaseId: t.phaseId || null,
      phaseOrder: t.phaseOrder != null ? t.phaseOrder : null,
      dueDate: t.dueDate ? new Date(t.dueDate) : null,
      assigneeId: t.assigneeId || managerId
    }));
    await prisma.task.createMany({ data: tasksToCreate });
  }

  // 批量创建里程碑
  if (milestones.length > 0) {
    const milestonesToCreate = milestones.map((m) => ({
      projectId: project.id,
      name: m.name || '未命名里程碑',
      date: m.date ? new Date(m.date) : new Date(),
      status: m.status || '待完成'
    }));
    await prisma.milestone.createMany({ data: milestonesToCreate });
  }

  return c.json(project, 201);
});

// 更新项目
projects.put('/:id', async (c) => {
  const { id } = c.params;
  const body = await c.req.json();
  
  // 不能直接修改managerId，需要通过成员接口
  delete body.managerId;
  delete body.code;
  delete body.createdAt;
  
  const project = await prisma.project.update({
    where: { id },
    data: body,
    include: {
      manager: {
        select: { id: true, name: true }
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true }
          }
        }
      }
    }
  });
  
  return c.json(project);
});

// 删除项目
projects.delete('/:id', async (c) => {
  const { id } = c.params;
  
  await prisma.project.delete({ where: { id } });
  
  return c.json({ success: true });
});

// 获取项目成员
projects.get('/:id/members', async (c) => {
  const { id } = c.params;
  
  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    include: {
      user: {
        select: { id: true, name: true, position: true, department: true, avatar: true }
      }
    }
  });
  
  return c.json(members);
});

// 添加项目成员
projects.post('/:id/members', async (c) => {
  const { id } = c.params;
  const { userId, role = 'member' } = await c.req.json();
  
  if (!userId) {
    return c.json({ error: '用户ID不能为空' }, 400);
  }
  
  // 检查是否已是成员
  const exists = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: { projectId: id, userId }
    }
  });
  
  if (exists) {
    return c.json({ error: '该用户已是项目成员' }, 400);
  }
  
  const member = await prisma.projectMember.create({
    data: {
      projectId: id,
      userId,
      role
    },
    include: {
      user: {
        select: { id: true, name: true, position: true }
      }
    }
  });
  
  return c.json(member, 201);
});

// 移除项目成员
projects.delete('/:id/members/:userId', async (c) => {
  const { id, userId } = c.params;
  
  // 检查是否为项目负责人
  const project = await prisma.project.findUnique({
    where: { id },
    select: { managerId: true }
  });
  
  if (project?.managerId === userId) {
    return c.json({ error: '不能移除项目负责人' }, 400);
  }
  
  await prisma.projectMember.delete({
    where: {
      projectId_userId: { projectId: id, userId }
    }
  });
  
  return c.json({ success: true });
});

// 获取项目类型统计
projects.get('/stats/types', async (c) => {
  const stats = await prisma.project.groupBy({
    by: ['type'],
    _count: { id: true }
  });
  
  return c.json(stats.map(s => ({
    type: s.type,
    count: s._count.id
  })));
});

// 获取项目状态统计
projects.get('/stats/status', async (c) => {
  const stats = await prisma.project.groupBy({
    by: ['status'],
    _count: { id: true }
  });
  
  return c.json(stats.map(s => ({
    status: s.status,
    count: s._count.id
  })));
});

// 套用模版到已有项目（为项目批量生成任务和里程碑）
projects.post('/:id/apply-template', async (c) => {
  const { id } = c.params;
  const { templateId, startDate } = await c.req.json();

  if (!templateId) return c.json({ error: '模版ID不能为空' }, 400);

  const [project, template] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.projectTemplate.findUnique({ where: { id: templateId } })
  ]);
  if (!project) return c.json({ error: '项目不存在' }, 404);
  if (!template) return c.json({ error: '模版不存在' }, 404);

  let content = {};
  try { content = template.content ? JSON.parse(template.content) : {}; } catch { content = {}; }

  const base = startDate ? new Date(startDate) : (project.startDate || new Date());
  const phases = (content.phases || []).filter(p => p.enabled !== false);

  const tasksToCreate = [];
  let dayOffset = 0;
  for (const phase of phases) {
    for (const t of (phase.tasks || []).filter(t => t.enabled !== false)) {
      const dueDate = new Date(base);
      dueDate.setDate(dueDate.getDate() + dayOffset + (t.estimatedDays || 3));
      tasksToCreate.push({
        projectId: id,
        title: t.title,
        priority: t.priority || '中',
        status: '待开始',
        phase: phase.name,
        phaseId: phase.id,
        phaseOrder: phase.order,
        dueDate,
      });
      dayOffset += (t.estimatedDays || 3);
    }
  }

  const milestonesToCreate = (content.milestones || []).map(m => {
    const date = new Date(base);
    date.setDate(date.getDate() + (m.offsetDays || 0));
    return { projectId: id, name: m.name, date, status: '待完成' };
  });

  await prisma.$transaction([
    prisma.project.update({ where: { id }, data: { templateId } }),
    ...(tasksToCreate.length > 0 ? [prisma.task.createMany({ data: tasksToCreate })] : []),
    ...(milestonesToCreate.length > 0 ? [prisma.milestone.createMany({ data: milestonesToCreate })] : []),
  ]);

  return c.json({ success: true, taskCount: tasksToCreate.length, milestoneCount: milestonesToCreate.length });
});

export default projects;
