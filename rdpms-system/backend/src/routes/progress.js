import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const progress = new Hono();

progress.use('*', authMiddleware);

// 获取项目月度进展
progress.get('/project/:projectId', async (c) => {
  const { projectId } = c.params;
  const { months = 6 } = c.req.query();
  
  const progresses = await prisma.monthlyProgress.findMany({
    where: { projectId },
    orderBy: { month: 'desc' },
    take: parseInt(months),
    include: {
      submitter: { select: { id: true, name: true } }
    }
  });
  
  return c.json(progresses);
});

// 填写/更新月度进展
progress.post('/project/:projectId', async (c) => {
  const { projectId } = c.params;
  const userId = c.get('userId');
  const { month, actualWork, completion, nextPlan, risks, projectStatus } = await c.req.json();
  
  if (!month) return c.json({ error: '月份不能为空' }, 400);
  
  const exists = await prisma.monthlyProgress.findUnique({
    where: { projectId_month: { projectId, month } }
  });
  
  if (exists) {
    const progress = await prisma.monthlyProgress.update({
      where: { id: exists.id },
      data: {
        actualWork,
        completion: completion ?? exists.completion,
        nextPlan,
        risks,
        projectStatus,
        submittedBy: userId,
        submittedAt: new Date()
      }
    });
    return c.json(progress);
  } else {
    const progress = await prisma.monthlyProgress.create({
      data: {
        projectId,
        month,
        actualWork,
        completion: completion ?? 0,
        nextPlan,
        risks,
        projectStatus,
        submittedBy: userId
      }
    });
    return c.json(progress, 201);
  }
});

// 获取所有项目月度进展（用于报告）
progress.get('/all/:month', async (c) => {
  const { month } = c.params;
  
  const progresses = await prisma.monthlyProgress.findMany({
    where: { month },
    include: {
      project: {
        select: { id: true, name: true, code: true, type: true, status: true }
      }
    },
    orderBy: { project: { name: 'asc' } }
  });
  
  return c.json(progresses);
});

// 导出月度进展报告
progress.get('/export/:month', async (c) => {
  const { month } = c.params;
  
  const progresses = await prisma.monthlyProgress.findMany({
    where: { month },
    include: {
      project: {
        include: {
          manager: { select: { id: true, name: true, position: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, position: true } }
            }
          }
        }
      },
      submitter: { select: { id: true, name: true } }
    },
    orderBy: { project: { name: 'asc' } }
  });
  
  return c.json({
    month,
    progresses,
    exportedAt: new Date().toISOString()
  });
});

export default progress;
