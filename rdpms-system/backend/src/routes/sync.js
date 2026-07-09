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

// 同步变更到服务器（Local-First 上行）
// 安全约束（CODE_REVIEW #7/#11/#13）：
//  - 仅允许写入「当前用户可访问的项目」（负责人或成员）
//  - 汇报归属必须为本用户；服务端审批状态保持权威，上行不回退审批
sync.post('/push', async (c) => {
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const body = await c.req.json().catch(() => ({}));
  const { reports, tasks, milestones, monthlyProgress, projectMembers } = body || {};

  const results = { reports: [], tasks: [], milestones: [], monthlyProgress: [], projectMembers: [] };

  // 预取当前用户可访问的项目集合（负责人或成员）
  const accessible = await prisma.project.findMany({
    where: { OR: [{ managerId: userId }, { members: { some: { userId } } }] },
    select: { id: true }
  });
  const accessibleProjectIds = new Set(accessible.map((p) => p.id));

  // ── 汇报 ──
  if (Array.isArray(reports)) {
    for (const report of reports) {
      try {
        const exists = await prisma.report.findUnique({ where: { id: report.id } });
        if (exists) {
          if (exists.userId !== userId) {
            results.reports.push({ id: report.id, action: 'skipped', error: '无权修改他人汇报' });
            continue;
          }
          // 服务端审批状态权威：上行仅同步内容，不回退审批（CODE_REVIEW #13）
          const updated = await prisma.report.update({
            where: { id: report.id },
            data: { content: report.content }
          });
          results.reports.push({ id: updated.id, action: 'updated' });
        } else {
          if (!report.projectId || !accessibleProjectIds.has(report.projectId)) {
            results.reports.push({ id: report.id, action: 'skipped', error: '无权为该项目的汇报' });
            continue;
          }
          const created = await prisma.report.create({
            data: {
              id: report.id,
              userId,
              projectId: report.projectId,
              month: report.month,
              reportType: report.reportType || '日报',
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

  // ── 任务 ──
  if (Array.isArray(tasks)) {
    for (const task of tasks) {
      try {
        if (!task.projectId || !accessibleProjectIds.has(task.projectId)) {
          results.tasks.push({ id: task.id, action: 'skipped', error: '无权修改该项目任务' });
          continue;
        }
        const exists = await prisma.task.findUnique({ where: { id: task.id } });
        if (exists) {
          const data = {
            status: task.status,
            title: task.title,
            description: task.description,
            assigneeId: task.assigneeId,
            priority: task.priority || '中'
          };
          if (task.status === '已完成') data.completedAt = new Date();
          const updated = await prisma.task.update({ where: { id: task.id }, data });
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

  // ── 里程碑 ──
  if (Array.isArray(milestones)) {
    for (const m of milestones) {
      try {
        if (!m.projectId || !accessibleProjectIds.has(m.projectId)) {
          results.milestones.push({ id: m.id, action: 'skipped', error: '无权修改该项目里程碑' });
          continue;
        }
        const data = {
          projectId: m.projectId,
          name: m.name,
          phaseId: m.phaseId ?? null,
          phaseName: m.phaseName ?? null,
          date: m.date ? new Date(m.date) : new Date(),
          status: m.status || '待完成'
        };
        const exists = await prisma.milestone.findUnique({ where: { id: m.id } });
        if (exists) {
          const updated = await prisma.milestone.update({ where: { id: m.id }, data });
          results.milestones.push({ id: updated.id, action: 'updated' });
        } else {
          const created = await prisma.milestone.create({ data: { id: m.id, ...data } });
          results.milestones.push({ id: created.id, action: 'created' });
        }
      } catch (err) {
        results.milestones.push({ id: m.id, action: 'failed', error: err.message });
      }
    }
  }

  // ── 月度进展 ──
  if (Array.isArray(monthlyProgress)) {
    for (const mp of monthlyProgress) {
      try {
        if (!mp.projectId || !accessibleProjectIds.has(mp.projectId)) {
          results.monthlyProgress.push({ id: mp.id, action: 'skipped', error: '无权修改该项目月度进展' });
          continue;
        }
        const data = {
          projectId: mp.projectId,
          month: mp.month,
          actualWork: mp.actualWork ?? null,
          completion: Number.isFinite(mp.completion) ? mp.completion : 0,
          nextPlan: mp.nextPlan ?? null,
          risks: mp.risks ?? null,
          projectStatus: mp.projectStatus ?? null,
          submittedBy: userId
        };
        const exists = await prisma.monthlyProgress.findUnique({ where: { id: mp.id } });
        if (exists) {
          const updated = await prisma.monthlyProgress.update({ where: { id: mp.id }, data });
          results.monthlyProgress.push({ id: updated.id, action: 'updated' });
        } else {
          const created = await prisma.monthlyProgress.create({ data: { id: mp.id, ...data } });
          results.monthlyProgress.push({ id: created.id, action: 'created' });
        }
      } catch (err) {
        results.monthlyProgress.push({ id: mp.id, action: 'failed', error: err.message });
      }
    }
  }

  // ── 项目成员关系（仅负责人/经理可调整，CODE_REVIEW #11）──
  if (Array.isArray(projectMembers)) {
    const isManager = userRole === 'admin' || userRole === 'manager';
    for (const pm of projectMembers) {
      try {
        if (!pm.projectId || !accessibleProjectIds.has(pm.projectId)) {
          results.projectMembers.push({ id: pm.id, action: 'skipped', error: '无权修改该项目成员' });
          continue;
        }
        if (!isManager) {
          results.projectMembers.push({ id: pm.id, action: 'skipped', error: '仅负责人可调整成员' });
          continue;
        }
        if (pm.deleted) {
          await prisma.projectMember.delete({
            where: { projectId_userId: { projectId: pm.projectId, userId: pm.userId } }
          }).catch(() => {});
          results.projectMembers.push({ id: pm.id, action: 'deleted' });
        } else {
          const exists = await prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: pm.projectId, userId: pm.userId } }
          });
          if (exists) {
            const updated = await prisma.projectMember.update({
              where: { projectId_userId: { projectId: pm.projectId, userId: pm.userId } },
              data: { role: pm.role || 'member' }
            });
            results.projectMembers.push({ id: updated.id, action: 'updated' });
          } else {
            const created = await prisma.projectMember.create({
              data: { id: pm.id, projectId: pm.projectId, userId: pm.userId, role: pm.role || 'member' }
            });
            results.projectMembers.push({ id: created.id, action: 'created' });
          }
        }
      } catch (err) {
        results.projectMembers.push({ id: pm.id, action: 'failed', error: err.message });
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
