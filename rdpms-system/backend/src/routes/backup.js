import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';

/**
 * /api/backup —— 数据导出（P0 data.export，仅 SUPER_ADMIN 持有）。
 *
 * M-1 变更说明：
 *   1. 旧 restore 端点依赖 SQLite PRAGMA，且属破坏性写库，已移除；
 *      PostgreSQL 环境的备份/恢复统一走 pg_dump / pg_restore（OPS 职责）。
 *   2. Reagent model 已删除，试剂域改为 reagentMaterials / reagentLots / reagentFormulas。
 */
const backup = new Hono();

backup.use('*', authMiddleware);
// 权限门禁收窄到 export 路由：restore 端点已移除（总控裁定），对所有人应为 404

// ─── 模块定义 ────────────────────────────────────────────────────────────────
const MODULE_FETCHERS = {
  users: async () => ({
    users: await prisma.user.findMany(),
  }),
  projects: async () => ({
    projects: await prisma.project.findMany(),
    projectMembers: await prisma.projectMember.findMany(),
    tasks: await prisma.task.findMany(),
    taskDependencies: await prisma.taskDependency.findMany(),
    milestones: await prisma.milestone.findMany(),
    phaseTransitions: await prisma.phaseTransition.findMany(),
  }),
  reports: async () => ({
    reports: await prisma.report.findMany(),
    reportVersions: await prisma.reportVersion.findMany(),
    monthlyProgress: await prisma.monthlyProgress.findMany(),
  }),
  docs: async () => ({
    docCategories: await prisma.docCategory.findMany(),
    docDocuments: await prisma.docDocument.findMany(),
    docVersions: await prisma.docVersion.findMany(),
  }),
  projectTemplates: async () => ({
    projectTemplates: await prisma.projectTemplate.findMany(),
  }),
  taskTemplates: async () => ({
    taskTemplates: await prisma.taskTemplate.findMany(),
    taskTemplateSteps: await prisma.taskTemplateStep.findMany(),
  }),
  reagents: async () => ({
    reagentMaterials: await prisma.reagentMaterial.findMany(),
    reagentLots: await prisma.reagentLot.findMany(),
    reagentFormulas: await prisma.reagentFormula.findMany(),
    formulaComponents: await prisma.formulaComponent.findMany(),
    prepRecords: await prisma.prepRecord.findMany(),
  }),
  primers: async () => ({
    primers: await prisma.primer.findMany(),
  }),
  samples: async () => ({
    sampleMaterials: await prisma.sampleMaterial.findMany(),
  }),
  rbac: async () => ({
    roles: await prisma.role.findMany(),
    permissions: await prisma.permission.findMany(),
    rolePermissions: await prisma.rolePermission.findMany(),
  }),
  systemLogs: async () => ({
    systemLogs: await prisma.systemLog.findMany(),
  }),
};

const ALL_MODULE_IDS = Object.keys(MODULE_FETCHERS);

// ─── GET /api/backup/export（data.export）───────────────────────────────────
backup.get('/export', requirePermission('data.export'), async (c) => {
  const auth = getAuth(c);
  const modulesParam = c.req.query('modules');
  const requestedIds = modulesParam
    ? modulesParam.split(',').map((s) => s.trim()).filter((s) => ALL_MODULE_IDS.includes(s))
    : ALL_MODULE_IDS;

  if (requestedIds.length === 0) {
    return c.json({ error: '未指定有效的备份模块' }, 400);
  }

  const results = await Promise.all(requestedIds.map((id) => MODULE_FETCHERS[id]()));
  const data = Object.assign({}, ...results);

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.EXPORT,
    entityType: 'BACKUP',
    metadata: { permissionCode: 'data.export', modules: requestedIds },
  });

  const payload = {
    version: '2.0',
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
});

export default backup;
