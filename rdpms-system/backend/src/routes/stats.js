import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { projectVisibilityFilter } from '../kernel/projectAccess.js';

/**
 * /api/stats —— 仪表盘统计（W10 PG baseline 迁移）。
 *
 * 迁移要点：
 *   旧角色判定（userRole === 'admin'）→ projectVisibilityFilter（∩ 模型：成员/负责人可见）；
 *   中文状态 → ProjectStatus/TaskStatus/ReportStatus 枚举；
 *   Report.month → periodKey；MonthlyProgress.month → periodKey；
 *   User.name → displayName。
 */
const stats = new Hono();

stats.use('*', authMiddleware);

const NO_PROJECT = ['__none__'];

function projectFilterFor(auth) {
  return projectVisibilityFilter(auth);
}

// 仪表盘统计
stats.get('/dashboard', requirePermission('dashboard.view'), async (c) => {
  const auth = getAuth(c);
  const userId = auth.userId;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const visible = projectFilterFor(auth);

  // 可见项目 ID 集合（SUPER_ADMIN 为 null → 全量）
  let projectIds = null;
  if (visible) {
    const memberProjects = await prisma.project.findMany({
      where: { ...visible, deletedAt: null },
      select: { id: true },
    });
    projectIds = memberProjects.map((p) => p.id);
  }
  const projectScope = projectIds ? { projectId: { in: projectIds.length > 0 ? projectIds : NO_PROJECT } } : {};

  const [
    totalProjects,
    activeProjects,
    projectByStatus,
    projectByType,
    totalTasks,
    myTasks,
    taskByStatus,
    totalReports,
    submittedReports,
    pendingReports,
    monthlyProgress,
  ] = await Promise.all([
    prisma.project.count({ where: visible ? { ...visible, deletedAt: null } : { deletedAt: null } }),
    prisma.project.count({
      where: { status: 'IN_PROGRESS', deletedAt: null, ...(visible ?? {}) },
    }),
    prisma.project.groupBy({
      by: ['status'],
      where: visible ? { ...visible, deletedAt: null } : { deletedAt: null },
      _count: { id: true },
    }),
    prisma.project.groupBy({
      by: ['type'],
      where: visible ? { ...visible, deletedAt: null } : { deletedAt: null },
      _count: { id: true },
    }),
    prisma.task.count({ where: { deletedAt: null, ...projectScope } }),
    prisma.task.count({ where: { assigneeId: userId, deletedAt: null } }),
    prisma.task.groupBy({
      by: ['status'],
      where: { deletedAt: null, ...projectScope },
      _count: { id: true },
    }),
    prisma.report.count({ where: { deletedAt: null, ...projectScope } }),
    prisma.report.count({ where: { status: 'SUBMITTED', deletedAt: null, ...projectScope } }),
    prisma.report.count({ where: { status: 'SUBMITTED', deletedAt: null, ...projectScope } }),
    prisma.monthlyProgress.findMany({
      where: { periodKey: currentMonth, deletedAt: null, ...projectScope },
      include: { project: { select: { id: true, name: true } } },
    }),
  ]);

  return c.json({
    projects: {
      total: totalProjects,
      active: activeProjects,
      byStatus: projectByStatus.map((s) => ({ status: s.status, count: s._count.id })),
      byType: projectByType.map((t) => ({ type: t.type, count: t._count.id })),
    },
    tasks: {
      total: totalTasks,
      myCount: myTasks,
      byStatus: taskByStatus.map((s) => ({ status: s.status, count: s._count.id })),
    },
    reports: {
      total: totalReports,
      submitted: submittedReports,
      pending: pendingReports,
    },
    monthlyProgress,
    currentMonth,
    lastMonth,
  });
});

// 项目统计（dashboard.view 即可访问；完成率改单查询聚合）
stats.get('/projects', requirePermission('dashboard.view'), async (c) => {
  const auth = getAuth(c);
  const { type, status } = c.req.query();

  const where = { deletedAt: null, ...(projectFilterFor(auth) ?? {}) };
  if (type) where.type = type;
  if (status) where.status = status;

  const projects = await prisma.project.findMany({
    where,
    include: {
      manager: { select: { id: true, displayName: true } },
      _count: { select: { tasks: { where: { deletedAt: null } }, members: { where: { leftAt: null } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const withStats = await Promise.all(projects.map(async (p) => {
    const [total, completed] = await Promise.all([
      prisma.task.count({ where: { projectId: p.id, deletedAt: null } }),
      prisma.task.count({ where: { projectId: p.id, status: 'COMPLETED', deletedAt: null } }),
    ]);
    return { ...p, taskCompletion: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }));

  return c.json(withStats);
});

// 个人工作量统计
stats.get('/users/:userId/workload', requirePermission('dashboard.view'), async (c) => {
  const userId = c.req.param('userId');

  const memberships = await prisma.projectMember.findMany({
    where: { userId, leftAt: null },
    include: {
      project: {
        include: {
          tasks: { where: { assigneeId: userId, deletedAt: null } },
          reports: { where: { authorId: userId, deletedAt: null } },
        },
      },
    },
  });

  const workload = memberships.map((pm) => ({
    project: {
      id: pm.project.id,
      name: pm.project.name,
      code: pm.project.code,
      role: pm.role,
    },
    tasks: {
      total: pm.project.tasks.length,
      completed: pm.project.tasks.filter((t) => t.status === 'COMPLETED').length,
      inProgress: pm.project.tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    },
    reports: {
      total: pm.project.reports.length,
      submitted: pm.project.reports.filter((r) => r.status !== 'DRAFT').length,
    },
  }));

  return c.json({
    userId,
    projects: workload,
    summary: {
      totalTasks: workload.reduce((sum, w) => sum + w.tasks.total, 0),
      completedTasks: workload.reduce((sum, w) => sum + w.tasks.completed, 0),
      totalReports: workload.reduce((sum, w) => sum + w.reports.total, 0),
    },
  });
});

// 汇报统计
stats.get('/reports', requirePermission('dashboard.view'), async (c) => {
  const { periodKey, month, projectId } = c.req.query();

  const where = { deletedAt: null };
  if (periodKey || month) where.periodKey = periodKey || month;
  if (projectId) where.projectId = projectId;

  const [byStatus, byPeriod] = await Promise.all([
    prisma.report.groupBy({ by: ['status'], where, _count: { id: true } }),
    prisma.report.groupBy({ by: ['periodKey'], where, _count: { id: true } }),
  ]);

  return c.json({
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
    byMonth: byPeriod.map((m) => ({ month: m.periodKey, count: m._count.id })),
  });
});

export default stats;
