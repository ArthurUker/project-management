import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { forbidden, badRequest } from '../kernel/http.js';
import { validatePayload, applyRestore, RESTORE_TABLES } from '../kernel/backupRestore.js';

/**
 * /api/backup —— 数据导出 + 应用层恢复 v2（批次三）。
 *
 * 变更说明：
 *   1. 旧 restore（SQLite 逐表 deleteMany+createMany、PRAGMA foreign_keys OFF）已废弃；
 *   2. v2 恢复流程：POST /restore/preview（只读校验 + 逐表差异）→ POST /restore（单事务应用，
 *      失败整体回滚），仅 SUPER_ADMIN，全程审计；
 *   3. 运维级整库恢复仍以 pg_dump / pg_restore 为准，本功能面向"模块级数据回灌"。
 */
const backup = new Hono();

backup.use('*', authMiddleware);

/** 数据恢复为高危操作：仅 SUPER_ADMIN（等价于 8 项高危的门槛） */
function assertSuperAdmin(c) {
  const auth = getAuth(c);
  if (auth.systemRole !== 'SUPER_ADMIN') {
    throw forbidden('PERMISSION_DENIED', '数据恢复仅限 SUPER_ADMIN');
  }
  return auth;
}

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

// ─── 可恢复表清单（供前端展示模块与表映射）──────────────────────────────────
backup.get('/restore/tables', async (c) => {
  assertSuperAdmin(c);
  return c.json({ tables: RESTORE_TABLES.map((t) => ({ key: t.key, appendOnly: t.appendOnly })) });
});

// ─── POST /api/backup/restore/preview —— 只读校验 + 差异统计 ─────────────────
backup.post('/restore/preview', async (c) => {
  const auth = assertSuperAdmin(c);
  const body = await c.req.json().catch(() => null);
  if (!body?.backup) throw badRequest('VALIDATION_ERROR', '缺少 backup 字段（备份文件内容）');
  const mode = body.mode === 'replace' ? 'replace' : 'merge';

  const validation = await validatePayload(body.backup, { mode });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.READ_SENSITIVE,
    entityType: 'BACKUP',
    entityLabel: '恢复预检（只读）',
    metadata: {
      operation: 'backup.restore.preview',
      mode,
      ok: validation.ok,
      tables: validation.tables.map((t) => ({ key: t.key, rows: t.rows, existing: t.existing, new: t.new })),
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
    },
  });

  return c.json(validation);
});

// ─── POST /api/backup/restore —— 单事务应用（失败整体回滚）───────────────────
backup.post('/restore', async (c) => {
  const auth = assertSuperAdmin(c);
  const body = await c.req.json().catch(() => null);
  if (!body?.backup) throw badRequest('VALIDATION_ERROR', '缺少 backup 字段（备份文件内容）');
  const mode = body.mode === 'replace' ? 'replace' : 'merge';
  if (mode === 'replace' && body.confirmReplace !== true) {
    throw badRequest('VALIDATION_ERROR', 'replace 模式为破坏性操作，需显式确认（confirmReplace=true）');
  }

  let summary;
  try {
    summary = await applyRestore(body.backup, { mode });
  } catch (err) {
    if (err?.validation) {
      await writeAudit(prisma, {
        c,
        actorId: auth.userId,
        actorName: auth.user.displayName,
        actorRole: auth.systemRole,
        action: AUDIT_ACTIONS.RESTORE,
        entityType: 'BACKUP',
        entityLabel: '恢复被校验拦截',
        metadata: {
          operation: 'backup.restore',
          mode,
          rejected: true,
          errorCount: err.validation.errors.length,
          errors: err.validation.errors.slice(0, 20),
        },
      });
      return c.json({ error: '备份校验未通过，未写入任何数据', validation: err.validation }, 400);
    }
    console.error('[BackupRestore] apply failed:', err);
    await writeAudit(prisma, {
      c,
      actorId: auth.userId,
      actorName: auth.user.displayName,
      actorRole: auth.systemRole,
      action: AUDIT_ACTIONS.RESTORE,
      entityType: 'BACKUP',
      entityLabel: '恢复失败（已回滚）',
      metadata: { operation: 'backup.restore', mode, failed: true, reason: err?.message || String(err) },
    });
    return c.json({ error: `恢复失败，事务已回滚：${err?.message || String(err)}`, rolledBack: true }, 500);
  }

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.RESTORE,
    entityType: 'BACKUP',
    entityLabel: `数据恢复（${mode}）`,
    after: {
      mode: summary.mode,
      created: summary.created,
      updated: summary.updated,
      deleted: summary.deleted,
      durationMs: summary.durationMs,
      tables: summary.tables,
    },
    metadata: { operation: 'backup.restore', mode },
  });

  return c.json({ success: true, summary });
});

export default backup;
