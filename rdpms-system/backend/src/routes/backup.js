import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware, adminMiddleware } from './auth.js';

const backup = new Hono();

// 所有备份路由需要登录且必须是管理员
backup.use('*', authMiddleware);
backup.use('*', adminMiddleware);

// ─── 模块定义 ────────────────────────────────────────────────────────────────

const MODULE_FETCHERS = {
  users: async () => ({
    users: await prisma.user.findMany(),
  }),
  projects: async () => ({
    projects:          await prisma.project.findMany(),
    projectMembers:    await prisma.projectMember.findMany(),
    tasks:             await prisma.task.findMany(),
    taskDependencies:  await prisma.taskDependency.findMany(),
    milestones:        await prisma.milestone.findMany(),
    phaseTransitions:  await prisma.phaseTransition.findMany(),
  }),
  reports: async () => ({
    reports:          await prisma.report.findMany(),
    reportVersions:   await prisma.reportVersion.findMany(),
    monthlyProgress:  await prisma.monthlyProgress.findMany(),
  }),
  docs: async () => ({
    docCategories:  await prisma.docCategory.findMany(),
    docDocuments:   await prisma.docDocument.findMany(),
    docVersions:    await prisma.docVersion.findMany(),
  }),
  projectTemplates: async () => ({
    projectTemplates: await prisma.projectTemplate.findMany(),
  }),
  taskTemplates: async () => ({
    taskTemplates:      await prisma.taskTemplate.findMany(),
    taskTemplateSteps:  await prisma.taskTemplateStep.findMany(),
  }),
  reagents: async () => ({
    reagents:          await prisma.reagent.findMany(),
    reagentMaterials:  await prisma.reagentMaterial.findMany(),
    reagentFormulas:   await prisma.reagentFormula.findMany(),
    formulaComponents: await prisma.formulaComponent.findMany(),
    prepRecords:       await prisma.prepRecord.findMany(),
  }),
  primers: async () => ({
    primers: await prisma.primer.findMany(),
  }),
  systemLogs: async () => ({
    systemLogs: await prisma.systemLog.findMany(),
  }),
};

const ALL_MODULE_IDS = Object.keys(MODULE_FETCHERS);

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 将 ISO 字符串日期字段还原为 Date 对象（Prisma createMany 需要） */
function parseDates(record) {
  const DATE_FIELDS = [
    'createdAt', 'updatedAt', 'startDate', 'endDate', 'completedAt',
    'submittedAt', 'approvedAt', 'date', 'joinedAt',
    'plannedSubmissionDate', 'expectedApprovalDate', 'expiryDate', 'collectionDate',
  ];
  const result = { ...record };
  for (const field of DATE_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = new Date(result[field]);
    }
  }
  return result;
}

// ─── GET /api/backup/export ──────────────────────────────────────────────────
// 支持 ?modules=users,projects,... 选择性导出；不传则导出全量
backup.get('/export', async (c) => {
  try {
    const modulesParam = c.req.query('modules');
    const requestedIds = modulesParam
      ? modulesParam.split(',').map(s => s.trim()).filter(s => ALL_MODULE_IDS.includes(s))
      : ALL_MODULE_IDS;

    if (requestedIds.length === 0) {
      return c.json({ error: '未指定有效的备份模块' }, 400);
    }

    // 并行获取各模块数据
    const results = await Promise.all(requestedIds.map(id => MODULE_FETCHERS[id]()));
    const data = Object.assign({}, ...results);

    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      modules: requestedIds,
      data,
    };

    const suffix = requestedIds.length === ALL_MODULE_IDS.length
      ? 'full'
      : `partial-${requestedIds.length}mod`;
    const filename = `rdpms-backup-${new Date().toISOString().slice(0, 10)}-${suffix}.json`;
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Content-Type', 'application/json; charset=utf-8');
    return c.body(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[Backup] export failed:', err);
    return c.json({ error: '备份导出失败: ' + (err.message || String(err)) }, 500);
  }
});

// ─── POST /api/backup/restore ─────────────────────────────────────────────────
// 从 JSON 备份恢复数据（按备份中包含的模块清空并重写；未包含的模块数据保持不变）
backup.post('/restore', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '无效的 JSON 格式' }, 400);
  }

  if (!body?.version || !body?.data) {
    return c.json({ error: '无效的备份文件结构（缺少 version 或 data 字段）' }, 400);
  }

  const d = body.data;

  try {
    // 整体包在事务中，任意一步失败自动回滚，避免"半恢复"残损库（CODE_REVIEW #8）
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`PRAGMA foreign_keys = OFF`;

      // ── 按备份中实际包含的数据决定删除范围 ──────────────────────────────

      // 依赖最深的子表先删
      if (d.prepRecords)        await tx.prepRecord.deleteMany();
      if (d.formulaComponents)  await tx.formulaComponent.deleteMany();
      if (d.reagentFormulas)    await tx.reagentFormula.deleteMany();
      if (d.taskDependencies)   await tx.taskDependency.deleteMany();
      if (d.reportVersions)     await tx.reportVersion.deleteMany();
      if (d.docVersions)        await tx.docVersion.deleteMany();
      if (d.monthlyProgress)    await tx.monthlyProgress.deleteMany();
      if (d.milestones)         await tx.milestone.deleteMany();
      if (d.systemLogs)         await tx.systemLog.deleteMany();
      if (d.tasks)              await tx.task.deleteMany();
      if (d.reports)            await tx.report.deleteMany();
      if (d.docDocuments)       await tx.docDocument.deleteMany();
      if (d.projectMembers)     await tx.projectMember.deleteMany();
      if (d.projects)           await tx.project.deleteMany();
      if (d.docCategories)      await tx.docCategory.deleteMany();
      if (d.projectTemplates)   await tx.projectTemplate.deleteMany();
      if (d.taskTemplateSteps)  await tx.taskTemplateStep.deleteMany();
      if (d.taskTemplates)      await tx.taskTemplate.deleteMany();
      if (d.primers)            await tx.primer.deleteMany();
      if (d.reagentMaterials)   await tx.reagentMaterial.deleteMany();
      if (d.reagents)           await tx.reagent.deleteMany();
      if (d.phaseTransitions)   await tx.phaseTransition.deleteMany();
      if (d.users)              await tx.user.deleteMany();

      // ── 按依赖顺序插入（父表先，子表后）────────────────────────────────────

      if (d.users?.length)
        await tx.user.createMany({ data: d.users.map(parseDates), skipDuplicates: true });

      if (d.docCategories?.length)
        await tx.docCategory.createMany({ data: d.docCategories.map(parseDates), skipDuplicates: true });

      if (d.taskTemplates?.length)
        await tx.taskTemplate.createMany({ data: d.taskTemplates.map(parseDates), skipDuplicates: true });

      if (d.taskTemplateSteps?.length)
        await tx.taskTemplateStep.createMany({ data: d.taskTemplateSteps.map(parseDates), skipDuplicates: true });

      if (d.reagents?.length)
        await tx.reagent.createMany({ data: d.reagents.map(parseDates), skipDuplicates: true });

      if (d.reagentMaterials?.length)
        await tx.reagentMaterial.createMany({ data: d.reagentMaterials.map(parseDates), skipDuplicates: true });

      if (d.projectTemplates?.length)
        await tx.projectTemplate.createMany({ data: d.projectTemplates.map(parseDates), skipDuplicates: true });

      if (d.projects?.length)
        await tx.project.createMany({ data: d.projects.map(parseDates), skipDuplicates: true });

      if (d.projectMembers?.length)
        await tx.projectMember.createMany({ data: d.projectMembers.map(parseDates), skipDuplicates: true });

      if (d.tasks?.length)
        await tx.task.createMany({ data: d.tasks.map(parseDates), skipDuplicates: true });

      if (d.taskDependencies?.length)
        await tx.taskDependency.createMany({ data: d.taskDependencies.map(parseDates), skipDuplicates: true });

      if (d.milestones?.length)
        await tx.milestone.createMany({ data: d.milestones.map(parseDates), skipDuplicates: true });

      if (d.reports?.length)
        await tx.report.createMany({ data: d.reports.map(parseDates), skipDuplicates: true });

      if (d.reportVersions?.length)
        await tx.reportVersion.createMany({ data: d.reportVersions.map(parseDates), skipDuplicates: true });

      if (d.monthlyProgress?.length)
        await tx.monthlyProgress.createMany({ data: d.monthlyProgress.map(parseDates), skipDuplicates: true });

      if (d.docDocuments?.length)
        await tx.docDocument.createMany({ data: d.docDocuments.map(parseDates), skipDuplicates: true });

      if (d.docVersions?.length)
        await tx.docVersion.createMany({ data: d.docVersions.map(parseDates), skipDuplicates: true });

      if (d.reagentFormulas?.length)
        await tx.reagentFormula.createMany({ data: d.reagentFormulas.map(parseDates), skipDuplicates: true });

      if (d.formulaComponents?.length)
        await tx.formulaComponent.createMany({ data: d.formulaComponents.map(parseDates), skipDuplicates: true });

      if (d.prepRecords?.length)
        await tx.prepRecord.createMany({ data: d.prepRecords.map(parseDates), skipDuplicates: true });

      if (d.systemLogs?.length)
        await tx.systemLog.createMany({ data: d.systemLogs.map(parseDates), skipDuplicates: true });

      if (d.primers?.length)
        await tx.primer.createMany({ data: d.primers.map(parseDates), skipDuplicates: true });

      if (d.phaseTransitions?.length)
        await tx.phaseTransition.createMany({ data: d.phaseTransitions.map(parseDates), skipDuplicates: true });

      await tx.$executeRaw`PRAGMA foreign_keys = ON`;
    });

    return c.json({ success: true, message: '数据恢复成功，请重新登录' });
  } catch (err) {
    console.error('[Backup] restore failed:', err);
    return c.json({ error: '数据恢复失败: ' + (err.message || String(err)) }, 500);
  }
});

export default backup;
