import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const stats = new Hono();

stats.use('*', authMiddleware);

// 仪表盘统计
stats.get('/dashboard', async (c) => {
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  
  // 获取当前月份的月份字符串，如 "2026-04"
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  
  // 基础条件：获取用户参与的项目ID列表
  let projectIds = [];
  if (userRole === 'admin') {
    const allProjects = await prisma.project.findMany({ select: { id: true } });
    projectIds = allProjects.map(p => p.id);
  } else {
    const memberProjects = await prisma.project.findMany({
      where: {
        OR: [
          { managerId: userId },
          { members: { some: { userId } } }
        ]
      },
      select: { id: true }
    });
    projectIds = memberProjects.map(p => p.id);
  }
  
  const [
    // 项目统计
    totalProjects,
    activeProjects,
    projectByStatus,
    projectByType,
    
    // 任务统计
    totalTasks,
    myTasks,
    taskByStatus,
    
    // 汇报统计
    totalReports,
    submittedReports,
    pendingReports,
    
    // 月度进展
    monthlyProgress
  ] = await Promise.all([
    // 项目总数
    prisma.project.count({ 
      where: userRole === 'admin' ? {} : {
        OR: [{ managerId: userId }, { members: { some: { userId } } }]
      }
    }),
    
    // 进行中项目
    prisma.project.count({ 
      where: { 
        status: '进行中',
        ...(userRole !== 'admin' ? { OR: [{ managerId: userId }, { members: { some: { userId } } }] } : {})
      } 
    }),
    
    // 按状态分组
    prisma.project.groupBy({
      by: ['status'],
      where: userRole === 'admin' ? {} : { OR: [{ managerId: userId }, { members: { some: { userId } } }] },
      _count: { id: true }
    }),
    
    // 按类型分组
    prisma.project.groupBy({
      by: ['type'],
      where: userRole === 'admin' ? {} : { OR: [{ managerId: userId }, { members: { some: { userId } } }] },
      _count: { id: true }
    }),
    
    // 任务总数
    prisma.task.count({ 
      where: { projectId: { in: projectIds.length > 0 ? projectIds : ['__none__'] } }
    }),
    
    // 我的任务
    prisma.task.count({ 
      where: { assigneeId: userId } 
    }),
    
    // 任务按状态
    prisma.task.groupBy({
      by: ['status'],
      where: { projectId: { in: projectIds.length > 0 ? projectIds : ['__none__'] } },
      _count: { id: true }
    }),
    
    // 汇报总数
    prisma.report.count({ 
      where: { projectId: { in: projectIds.length > 0 ? projectIds : ['__none__'] } }
    }),
    
    // 已提交汇报
    prisma.report.count({ 
      where: { 
        status: { in: ['已提交', '已通过'] },
        projectId: { in: projectIds.length > 0 ? projectIds : ['__none__'] }
      } 
    }),
    
    // 待审批汇报
    prisma.report.count({ 
      where: { 
        status: '已提交',
        projectId: { in: projectIds.length > 0 ? projectIds : ['__none__'] }
      } 
    }),
    
    // 本月进展
    prisma.monthlyProgress.findMany({
      where: { 
        month: currentMonth,
        projectId: { in: projectIds.length > 0 ? projectIds : ['__none__'] }
      },
      include: {
        project: { select: { id: true, name: true } }
      }
    })
  ]);
  
  return c.json({
    projects: {
      total: totalProjects,
      active: activeProjects,
      byStatus: projectByStatus.map(s => ({ status: s.status, count: s._count.id })),
      byType: projectByType.map(t => ({ type: t.type, count: t._count.id }))
    },
    tasks: {
      total: totalTasks,
      myCount: myTasks,
      byStatus: taskByStatus.map(s => ({ status: s.status, count: s._count.id }))
    },
    reports: {
      total: totalReports,
      submitted: submittedReports,
      pending: pendingReports
    },
    monthlyProgress,
    currentMonth,
    lastMonth: lastMonthStr
  });
});

// 项目统计
stats.get('/projects', async (c) => {
  const { type, status } = c.req.query();
  
  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  
  const projects = await prisma.project.findMany({
    where,
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { tasks: true, members: true } }
    },
    orderBy: { updatedAt: 'desc' }
  });
  
  // 添加完成率
  const projectsWithStats = await Promise.all(
    projects.map(async (p) => {
      const total = await prisma.task.count({ where: { projectId: p.id } });
      const completed = await prisma.task.count({ 
        where: { projectId: p.id, status: '已完成' } 
      });
      return {
        ...p,
        taskCompletion: total > 0 ? Math.round((completed / total) * 100) : 0
      };
    })
  );
  
  return c.json(projectsWithStats);
});

// 个人工作量统计
stats.get('/users/:userId/workload', async (c) => {
  const userId = c.req.param('userId');
  
  // 获取该用户参与的项目
  const projects = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          tasks: {
            where: { assigneeId: userId }
          },
          reports: {
            where: { userId }
          }
        }
      }
    }
  });
  
  const workload = projects.map(pm => ({
    project: {
      id: pm.project.id,
      name: pm.project.name,
      code: pm.project.code,
      role: pm.role
    },
    tasks: {
      total: pm.project.tasks.length,
      completed: pm.project.tasks.filter(t => t.status === '已完成').length,
      inProgress: pm.project.tasks.filter(t => t.status === '进行中').length
    },
    reports: {
      total: pm.project.reports.length,
      submitted: pm.project.reports.filter(r => r.status !== '草稿').length
    }
  }));
  
  return c.json({
    userId,
    projects: workload,
    summary: {
      totalTasks: workload.reduce((sum, w) => sum + w.tasks.total, 0),
      completedTasks: workload.reduce((sum, w) => sum + w.tasks.completed, 0),
      totalReports: workload.reduce((sum, w) => sum + w.reports.total, 0)
    }
  });
});

// 汇报统计
stats.get('/reports', async (c) => {
  const { month, projectId } = c.req.query();
  
  const where = {};
  if (month) where.month = month;
  if (projectId) where.projectId = projectId;
  
  const [byStatus, byMonth] = await Promise.all([
    prisma.report.groupBy({
      by: ['status'],
      where,
      _count: { id: true }
    }),
    prisma.report.groupBy({
      by: ['month'],
      where,
      _count: { id: true }
    })
  ]);
  
  return c.json({
    byStatus: byStatus.map(s => ({ status: s.status, count: s._count.id })),
    byMonth: byMonth.map(m => ({ month: m.month, count: m._count.id }))
  });
});

export default stats;
