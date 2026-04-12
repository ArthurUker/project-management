import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const reports = new Hono();

reports.use('*', authMiddleware);

// 获取汇报列表
reports.get('/', async (c) => {
  const { 
    page = 1, 
    pageSize = 20, 
    userId,
    projectId,
    month,
    reportType,
    status 
  } = c.req.query();
  
  const where = {};
  if (userId) where.userId = userId;
  if (projectId) where.projectId = projectId;
  if (month) where.month = month;
  if (reportType) where.reportType = reportType;
  if (status) where.status = status;
  
  const [total, reports] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, position: true }
        },
        project: {
          select: { id: true, name: true, code: true }
        }
      }
    })
  ]);
  
  return c.json({
    list: reports,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

// 获取单个汇报
reports.get('/:id', async (c) => {
  const { id } = c.params;
  
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, position: true, department: true }
      },
      project: {
        select: { id: true, name: true, code: true, type: true }
      },
      versions: {
        orderBy: { version: 'desc' }
      }
    }
  });
  
  if (!report) {
    return c.json({ error: '汇报不存在' }, 404);
  }
  
  return c.json(report);
});

// 创建/更新汇报
reports.post('/', async (c) => {
  const userId = c.get('userId');
  const { projectId, reportType, month, content, status: inputStatus } = await c.req.json();
  
  if (!projectId || !month) {
    return c.json({ error: '项目和月份不能为空' }, 400);
  }
  
  const type = reportType || '日报';
  
  const exists = await prisma.report.findUnique({
    where: {
      userId_projectId_month_reportType: { userId, projectId, month, reportType: type }
    }
  });
  
  if (exists) {
    const report = await prisma.report.update({
      where: { id: exists.id },
      data: {
        content: content || exists.content,
        status: inputStatus || exists.status
      },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    });
    return c.json(report);
  } else {
    const report = await prisma.report.create({
      data: {
        userId,
        projectId,
        reportType: type,
        month,
        content: content || '{}',
        status: inputStatus || '草稿'
      },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    });
    return c.json(report, 201);
  }
});

// 提交汇报
reports.post('/:id/submit', async (c) => {
  const id = c.params.id;
  const userId = c.get('userId');
  
  const report = await prisma.report.findUnique({ where: { id } });
  
  if (!report) return c.json({ error: '汇报不存在' }, 404);
  if (report.userId !== userId) return c.json({ error: '只能提交自己的汇报' }, 403);
  if (report.status === '已通过') return c.json({ error: '已通过的汇报不能再次提交' }, 400);
  
  await prisma.$transaction(async (tx) => {
    const lastVersion = await tx.reportVersion.findFirst({
      where: { reportId: id },
      orderBy: { version: 'desc' }
    });
    
    await tx.reportVersion.create({
      data: {
        reportId: id,
        version: (lastVersion?.version || 0) + 1,
        content: report.content
      }
    });
    
    await tx.report.update({
      where: { id },
      data: { status: '已提交', submittedAt: new Date() }
    });
    
    await tx.systemLog.create({
      data: {
        action: 'report_submit',
        userId,
        targetId: id,
        detail: `提交${report.reportType}: ${report.month}`
      }
    });
  });
  
  return c.json({ success: true });
});

// 审批通过
reports.post('/:id/approve', async (c) => {
  const id = c.params.id;
  const userId = c.get('userId');
  const { note } = await c.req.json();
  
  const report = await prisma.report.update({
    where: { id },
    data: {
      status: '已通过',
      approvedBy: userId,
      approvedAt: new Date(),
      approveNote: note || null
    }
  });
  
  await prisma.systemLog.create({
    data: {
      action: 'report_approve',
      userId,
      targetId: id,
      detail: `审批通过`
    }
  });
  
  return c.json(report);
});

// 驳回
reports.post('/:id/reject', async (c) => {
  const id = c.params.id;
  const userId = c.get('userId');
  const { note } = await c.req.json();
  
  if (!note) return c.json({ error: '驳回原因不能为空' }, 400);
  
  const report = await prisma.report.update({
    where: { id },
    data: { status: '已驳回', approveNote: note }
  });
  
  return c.json(report);
});

// 历史版本
reports.get('/:id/versions', async (c) => {
  const { id } = c.params;
  const versions = await prisma.reportVersion.findMany({
    where: { reportId: id },
    orderBy: { version: 'desc' }
  });
  return c.json(versions);
});

// 导出月度汇报
reports.get('/export/month/:month', async (c) => {
  const { month } = c.params;
  const { userId, projectId, reportType } = c.req.query();
  
  const where = { month };
  if (userId) where.userId = userId;
  if (projectId) where.projectId = projectId;
  if (reportType) where.reportType = reportType;
  
  const reports = await prisma.report.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, position: true, department: true } },
      project: { select: { id: true, name: true, code: true, type: true } }
    },
    orderBy: [{ project: { type: 'asc' } }, { user: { name: 'asc' } }]
  });
  
  return c.json({ month, reports, exportedAt: new Date().toISOString() });
});

// DELETE 报告（仅允许删除草稿）
reports.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const userId = c.get('userId');

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) return c.json({ error: '汇报不存在' }, 404);

    // 仅允许删除草稿
    if (report.status !== '草稿' && report.status !== 'draft') {
      return c.json({ error: '只能删除草稿状态的汇报' }, 403);
    }

    if (report.userId !== userId) return c.json({ error: '无权删除他人的汇报' }, 403);

    await prisma.report.delete({ where: { id } });
    return c.json({ message: '删除成功' });
  } catch (error) {
    console.error('[DELETE REPORT]', error);
    return c.json({ error: error.message }, 500);
  }
});

export default reports;
