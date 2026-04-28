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
    await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;

    // ── 按备份中实际包含的数据决定删除范围 ──────────────────────────────────

    // 依赖最深的子表先删
    if (d.prepRecords)        await prisma.prepRecord.deleteMany();
    if (d.formulaComponents)  await prisma.formulaComponent.deleteMany();
    if (d.reagentFormulas)    await prisma.reagentFormula.deleteMany();
    if (d.taskDependencies)   await prisma.taskDependency.deleteMany();
    if (d.reportVersions)     await prisma.reportVersion.deleteMany();
    if (d.docVersions)        await prisma.docVersion.deleteMany();
    if (d.monthlyProgress)    await prisma.monthlyProgress.deleteMany();
    if (d.milestones)         await prisma.milestone.deleteMany();
    if (d.systemLogs)         await prisma.systemLog.deleteMany();
    if (d.tasks)              await prisma.task.deleteMany();
    if (d.reports)            await prisma.report.deleteMany();
    if (d.docDocuments)       await prisma.docDocument.deleteMany();
    if (d.projectMembers)     await prisma.projectMember.deleteMany();
    if (d.projects)           await prisma.project.deleteMany();
    if (d.docCategories)      await prisma.docCategory.deleteMany();
    if (d.projectTemplates)   await prisma.projectTemplate.deleteMany();
    if (d.taskTemplateSteps)  await prisma.taskTemplateStep.deleteMany();
    if (d.taskTemplates)      await prisma.taskTemplate.deleteMany();
    if (d.primers)            await prisma.primer.deleteMany();
    if (d.reagentMaterials)   await prisma.reagentMaterial.deleteMany();
    if (d.reagents)           await prisma.reagent.deleteMany();
    if (d.phaseTransitions)   await prisma.phaseTransition.deleteMany();
    if (d.users)              await prisma.user.deleteMany();

    // ── 按依赖顺序插入（父表先，子表后）────────────────────────────────────

    if (d.users?.length)
      await prisma.user.createMany({ data: d.users.map(parseDates), skipDuplicates: true });

    if (d.docCategories?.length)
      await prisma.docCategory.createMany({ data: d.docCategories.map(parseDates), skipDuplicates: true });

    if (d.taskTemplates?.length)
      await prisma.taskTemplate.createMany({ data: d.taskTemplates.map(parseDates), skipDuplicates: true });

    if (d.taskTemplateSteps?.length)
      await prisma.taskTemplateStep.createMany({ data: d.taskTemplateSteps.map(parseDates), skipDuplicates: true });

    if (d.reagents?.length)
      await prisma.reagent.createMany({ data: d.reagents.map(parseDates), skipDuplicates: true });

    if (d.reagentMaterials?.length)
      await prisma.reagentMaterial.createMany({ data: d.reagentMaterials.map(parseDates), skipDuplicates: true });

    if (d.projectTemplates?.length)
      await prisma.projectTemplate.createMany({ data: d.projectTemplates.map(parseDates), skipDuplicates: true });

    if (d.projects?.length)
      await prisma.project.createMany({ data: d.projects.map(parseDates), skipDuplicates: true });

    if (d.projectMembers?.length)
      await prisma.projectMember.createMany({ data: d.projectMembers.map(parseDates), skipDuplicates: true });

    if (d.tasks?.length)
      await prisma.task.createMany({ data: d.tasks.map(parseDates), skipDuplicates: true });

    if (d.taskDependencies?.length)
      await prisma.taskDependency.createMany({ data: d.taskDependencies.map(parseDates), skipDuplicates: true });

    if (d.milestones?.length)
      await prisma.milestone.createMany({ data: d.milestones.map(parseDates), skipDuplicates: true });

    if (d.reports?.length)
      await prisma.report.createMany({ data: d.reports.map(parseDates), skipDuplicates: true });

    if (d.reportVersions?.length)
      await prisma.reportVersion.createMany({ data: d.reportVersions.map(parseDates), skipDuplicates: true });

    if (d.monthlyProgress?.length)
      await prisma.monthlyProgress.createMany({ data: d.monthlyProgress.map(parseDates), skipDuplicates: true });

    if (d.docDocuments?.length)
      await prisma.docDocument.createMany({ data: d.docDocuments.map(parseDates), skipDuplicates: true });

    if (d.docVersions?.length)
      await prisma.docVersion.createMany({ data: d.docVersions.map(parseDates), skipDuplicates: true });

    if (d.reagentFormulas?.length)
      await prisma.reagentFormula.createMany({ data: d.reagentFormulas.map(parseDates), skipDuplicates: true });

    if (d.formulaComponents?.length)
      await prisma.formulaComponent.createMany({ data: d.formulaComponents.map(parseDates), skipDuplicates: true });

    if (d.prepRecords?.length)
      await prisma.prepRecord.createMany({ data: d.prepRecords.map(parseDates), skipDuplicates: true });

    if (d.systemLogs?.length)
      await prisma.systemLog.createMany({ data: d.systemLogs.map(parseDates), skipDuplicates: true });

    if (d.primers?.length)
      await prisma.primer.createMany({ data: d.primers.map(parseDates), skipDuplicates: true });

    if (d.phaseTransitions?.length)
      await prisma.phaseTransition.createMany({ data: d.phaseTransitions.map(parseDates), skipDuplicates: true });

    await prisma.$executeRaw`PRAGMA foreign_keys = ON`;

    return c.json({ success: true, message: '数据恢复成功，请重新登录' });
  } catch (err) {
    try { await prisma.$executeRaw`PRAGMA foreign_keys = ON`; } catch {}
    console.error('[Backup] restore failed:', err);
    return c.json({ error: '数据恢复失败: ' + (err.message || String(err)) }, 500);
  }
});

export default backup;


const backup = new Hono();

// 所有备份路由需要登录且必须是管理员
backup.use('*', authMiddleware);
backup.use('*', adminMiddleware);

// ─── 工具函数 ───────────────────────────────────────────────────────────────

/** 将 ISO 字符串日期字段还原为 Date 对象（Prisma createMany 需要） */
function parseDates(record) {
  const DATE_FIELDS = [
    'createdAt', 'updatedAt', 'startDate', 'endDate', 'completedAt',
    'submittedAt', 'approvedAt', 'date', 'joinedAt',
  ];
  const result = { ...record };
  for (const field of DATE_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = new Date(result[field]);
    }
  }
  return result;
}

// ─── GET /api/backup/export ─────────────────────────────────────────────────
// 将服务器全部数据导出为 JSON（含密码哈希，方便恢复后正常登录）
backup.get('/export', async (c) => {
  try {
    const [
      users,
      docCategories,
      taskTemplates,
      taskTemplateSteps,
      reagents,
      reagentMaterials,
      projectTemplates,
      projects,
      projectMembers,
      tasks,
      taskDependencies,
      milestones,
      reports,
      reportVersions,
      monthlyProgress,
      docDocuments,
      docVersions,
      reagentFormulas,
      formulaComponents,
      prepRecords,
      systemLogs,
      primers,
      phaseTransitions,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.docCategory.findMany(),
      prisma.taskTemplate.findMany(),
      prisma.taskTemplateStep.findMany(),
      prisma.reagent.findMany(),
      prisma.reagentMaterial.findMany(),
      prisma.projectTemplate.findMany(),
      prisma.project.findMany(),
      prisma.projectMember.findMany(),
      prisma.task.findMany(),
      prisma.taskDependency.findMany(),
      prisma.milestone.findMany(),
      prisma.report.findMany(),
      prisma.reportVersion.findMany(),
      prisma.monthlyProgress.findMany(),
      prisma.docDocument.findMany(),
      prisma.docVersion.findMany(),
      prisma.reagentFormula.findMany(),
      prisma.formulaComponent.findMany(),
      prisma.prepRecord.findMany(),
      prisma.systemLog.findMany(),
      prisma.primer.findMany(),
      prisma.phaseTransition.findMany(),
    ]);

    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        users,
        docCategories,
        taskTemplates,
        taskTemplateSteps,
        reagents,
        reagentMaterials,
        projectTemplates,
        projects,
        projectMembers,
        tasks,
        taskDependencies,
        milestones,
        reports,
        reportVersions,
        monthlyProgress,
        docDocuments,
        docVersions,
        reagentFormulas,
        formulaComponents,
        prepRecords,
        systemLogs,
        primers,
        phaseTransitions,
      },
    };

    const filename = `rdpms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Content-Type', 'application/json; charset=utf-8');
    return c.body(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[Backup] export failed:', err);
    return c.json({ error: '备份导出失败: ' + (err.message || String(err)) }, 500);
  }
});

// ─── POST /api/backup/restore ────────────────────────────────────────────────
// 从 JSON 备份恢复全部数据（清空现有数据后重新写入）
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
    // SQLite 默认关闭外键约束；Prisma 会开启它。
    // 先关闭，安全地按顺序删除并插入，再重新开启。
    await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;

    // ── 删除（子表先删，父表后删）──────────────────────────────────────────
    await prisma.prepRecord.deleteMany();
    await prisma.formulaComponent.deleteMany();
    await prisma.reagentFormula.deleteMany();
    await prisma.taskDependency.deleteMany();
    await prisma.reportVersion.deleteMany();
    await prisma.docVersion.deleteMany();
    await prisma.monthlyProgress.deleteMany();
    await prisma.milestone.deleteMany();
    await prisma.systemLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.report.deleteMany();
    await prisma.docDocument.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.docCategory.deleteMany();
    await prisma.projectTemplate.deleteMany();
    await prisma.taskTemplateStep.deleteMany();
    await prisma.taskTemplate.deleteMany();
    await prisma.primer.deleteMany();
    await prisma.reagentMaterial.deleteMany();
    await prisma.reagent.deleteMany();
    await prisma.phaseTransition.deleteMany();
    await prisma.user.deleteMany();

    // ── 插入（父表先插，子表后插）──────────────────────────────────────────
    if (d.users?.length)
      await prisma.user.createMany({ data: d.users.map(parseDates), skipDuplicates: true });

    if (d.docCategories?.length)
      await prisma.docCategory.createMany({ data: d.docCategories.map(parseDates), skipDuplicates: true });

    if (d.taskTemplates?.length)
      await prisma.taskTemplate.createMany({ data: d.taskTemplates.map(parseDates), skipDuplicates: true });

    if (d.taskTemplateSteps?.length)
      await prisma.taskTemplateStep.createMany({ data: d.taskTemplateSteps.map(parseDates), skipDuplicates: true });

    if (d.reagents?.length)
      await prisma.reagent.createMany({ data: d.reagents.map(parseDates), skipDuplicates: true });

    if (d.reagentMaterials?.length)
      await prisma.reagentMaterial.createMany({ data: d.reagentMaterials.map(parseDates), skipDuplicates: true });

    if (d.projectTemplates?.length)
      await prisma.projectTemplate.createMany({ data: d.projectTemplates.map(parseDates), skipDuplicates: true });

    if (d.projects?.length)
      await prisma.project.createMany({ data: d.projects.map(parseDates), skipDuplicates: true });

    if (d.projectMembers?.length)
      await prisma.projectMember.createMany({ data: d.projectMembers.map(parseDates), skipDuplicates: true });

    if (d.tasks?.length)
      await prisma.task.createMany({ data: d.tasks.map(parseDates), skipDuplicates: true });

    if (d.taskDependencies?.length)
      await prisma.taskDependency.createMany({ data: d.taskDependencies.map(parseDates), skipDuplicates: true });

    if (d.milestones?.length)
      await prisma.milestone.createMany({ data: d.milestones.map(parseDates), skipDuplicates: true });

    if (d.reports?.length)
      await prisma.report.createMany({ data: d.reports.map(parseDates), skipDuplicates: true });

    if (d.reportVersions?.length)
      await prisma.reportVersion.createMany({ data: d.reportVersions.map(parseDates), skipDuplicates: true });

    if (d.monthlyProgress?.length)
      await prisma.monthlyProgress.createMany({ data: d.monthlyProgress.map(parseDates), skipDuplicates: true });

    if (d.docDocuments?.length)
      await prisma.docDocument.createMany({ data: d.docDocuments.map(parseDates), skipDuplicates: true });

    if (d.docVersions?.length)
      await prisma.docVersion.createMany({ data: d.docVersions.map(parseDates), skipDuplicates: true });

    if (d.reagentFormulas?.length)
      await prisma.reagentFormula.createMany({ data: d.reagentFormulas.map(parseDates), skipDuplicates: true });

    if (d.formulaComponents?.length)
      await prisma.formulaComponent.createMany({ data: d.formulaComponents.map(parseDates), skipDuplicates: true });

    if (d.prepRecords?.length)
      await prisma.prepRecord.createMany({ data: d.prepRecords.map(parseDates), skipDuplicates: true });

    if (d.systemLogs?.length)
      await prisma.systemLog.createMany({ data: d.systemLogs.map(parseDates), skipDuplicates: true });

    if (d.primers?.length)
      await prisma.primer.createMany({ data: d.primers.map(parseDates), skipDuplicates: true });

    if (d.phaseTransitions?.length)
      await prisma.phaseTransition.createMany({ data: d.phaseTransitions.map(parseDates), skipDuplicates: true });

    await prisma.$executeRaw`PRAGMA foreign_keys = ON`;

    return c.json({ success: true, message: '数据恢复成功，请重新登录' });
  } catch (err) {
    // 尝试恢复外键约束
    try { await prisma.$executeRaw`PRAGMA foreign_keys = ON`; } catch {}
    console.error('[Backup] restore failed:', err);
    return c.json({ error: '数据恢复失败: ' + (err.message || String(err)) }, 500);
  }
});

export default backup;
