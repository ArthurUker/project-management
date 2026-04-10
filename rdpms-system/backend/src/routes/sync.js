import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const sync = new Hono();

sync.use('*', authMiddleware);

// 增量同步（Local-First核心API）
sync.get('/init', async (c) => {
  const userId = c.get('userId');
  const lastSync = c.req.query('lastSync');
  const since = lastSync ? new Date(lastSync) : new Date(0);
  
  // 并行查询所有变更数据
  const [
    user,
    projects,
    projectMembers,
    reports,
    tasks,
    milestones,
    monthlyProgress
  ] = await Promise.all([
    // 当前用户完整信息
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, name: true,
        position: true, department: true, role: true,
        avatar: true, status: true
      }
    }),
    // 用户参与的项目
    prisma.project.findMany({
      where: {
        OR: [
          { managerId: userId },
          { members: { some: { userId } } }
        ],
        updatedAt: { gt: since }
      },
      include: {
        manager: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true } } }
        }
      }
    }),
    // 项目成员关系
    prisma.projectMember.findMany({
      where: {
        OR: [
          { userId },
          { project: { managerId: userId } }
        ]
      }
    }),
    // 用户的汇报
    prisma.report.findMany({
      where: { 
        userId,
        updatedAt: { gt: since }
      },
      include: {
        project: { select: { id: true, name: true, code: true } }
      }
    }),
    // 分配给用户的任务
    prisma.task.findMany({
      where: { 
        project: {
          OR: [
            { managerId: userId },
            { members: { some: { userId } } }
          ]
        },
        updatedAt: { gt: since }
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true, avatar: true } }
      }
    }),
    // 里程碑
    prisma.milestone.findMany({
      where: {
        project: {
          OR: [
            { managerId: userId },
            { members: { some: { userId } } }
          ]
        },
        updatedAt: { gt: since }
      }
    }),
    // 月度进展
    prisma.monthlyProgress.findMany({
      where: {
        project: {
          OR: [
            { managerId: userId },
            { members: { some: { userId } } }
          ]
        },
        updatedAt: { gt: since }
      },
      include: {
        project: { select: { id: true, name: true, code: true } }
      }
    })
  ]);
  
  return c.json({
    data: {
      user,
      projects,
      projectMembers,
      reports,
      tasks,
      milestones,
      monthlyProgress
    },
    syncTime: new Date().toISOString(),
    serverTime: Date.now()
  });
});

// 同步变更到服务器
sync.post('/push', async (c) => {
  const userId = c.get('userId');
  const { reports, tasks } = await c.req.json();
  
  const results = { reports: [], tasks: [] };
  
  // 处理汇报
  if (reports && Array.isArray(reports)) {
    for (const report of reports) {
      try {
        const exists = await prisma.report.findUnique({
          where: { id: report.id }
        });
        
        if (exists) {
          // 已有则更新
          const updated = await prisma.report.update({
            where: { id: report.id },
            data: {
              content: report.content,
              status: report.status
            }
          });
          results.reports.push({ id: updated.id, action: 'updated' });
        } else {
          // 新建
          const created = await prisma.report.create({
            data: {
              id: report.id,
              userId,
              projectId: report.projectId,
              month: report.month,
              content: report.content,
              status: report.status || '草稿'
            }
          });
          results.reports.push({ id: created.id, action: 'created' });
        }
      } catch (err) {
        results.reports.push({ id: report.id, action: 'failed', error: err.message });
      }
    }
  }
  
  // 处理任务
  if (tasks && Array.isArray(tasks)) {
    for (const task of tasks) {
      try {
        const exists = await prisma.task.findUnique({
          where: { id: task.id }
        });
        
        if (exists) {
          const data = { 
            status: task.status,
            title: task.title,
            description: task.description,
            assigneeId: task.assigneeId
          };
          if (task.status === '已完成') data.completedAt = new Date();
          
          const updated = await prisma.task.update({
            where: { id: task.id },
            data
          });
          results.tasks.push({ id: updated.id, action: 'updated' });
        } else {
          const created = await prisma.task.create({
            data: {
              id: task.id,
              projectId: task.projectId,
              title: task.title,
              description: task.description,
              assigneeId: task.assigneeId,
              status: task.status || '待开始',
              priority: task.priority || '中'
            }
          });
          results.tasks.push({ id: created.id, action: 'created' });
        }
      } catch (err) {
        results.tasks.push({ id: task.id, action: 'failed', error: err.message });
      }
    }
  }
  
  return c.json({
    success: true,
    results,
    serverTime: Date.now()
  });
});

export default sync;
