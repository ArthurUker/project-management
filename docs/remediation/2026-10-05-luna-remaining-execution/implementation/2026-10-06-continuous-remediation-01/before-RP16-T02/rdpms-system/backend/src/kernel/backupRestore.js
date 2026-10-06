import { createRestoreRegistry, validateRestorePayload } from './restoreSchemaRegistry.js';
import { prisma } from '../platform/db/client.js';

/**
 * kernel/backupRestore.js —— 应用层备份恢复 v2（批次三，替换 Tencent 逐表覆盖方案）
 *
 * 设计要点（禁止沿用旧方案）：
 *   1. 先校验后写库：validatePayload() 全程只读，产出逐表差异与错误清单；
 *   2. 应用阶段整体包在单事务中，任一步失败自动回滚（不会出现"半恢复"库）；
 *   3. 两种模式：
 *      - merge（默认）：按主键 upsert，不触碰备份未涉及的既有行；
 *      - replace：对备份覆盖的表先按逆依赖序清空再写入（append-only 表跳过删除）；
 *   4. 不做外键开关切换（PostgreSQL 由约束 + 依赖序保证）；顺序即依赖序，约束由数据库兜底。
 *
 * 已知边界：
 *   - 导出未覆盖的表（projectPhases / detectionTargets / files 等）中的外键只能校验 DB 现存行；
 *   - auditLogs / systemLogs 为 append-only（数据库触发器禁止 UPDATE/DELETE），replace 模式跳过删除。
 */

/** 依赖序：父表在前。replace 模式按此逆序删除。 */
export const RESTORE_TABLES = createRestoreRegistry([
  { key: 'users', model: 'user', appendOnly: false },
  { key: 'roles', model: 'role', appendOnly: false },
  { key: 'permissions', model: 'permission', appendOnly: false },
  { key: 'docCategories', model: 'docCategory', appendOnly: false },
  { key: 'taskTemplates', model: 'taskTemplate', appendOnly: false },
  { key: 'taskTemplateSteps', model: 'taskTemplateStep', appendOnly: false },
  { key: 'reagentMaterials', model: 'reagentMaterial', appendOnly: false },
  { key: 'reagentLots', model: 'reagentLot', appendOnly: false },
  { key: 'reagentFormulas', model: 'reagentFormula', appendOnly: false },
  { key: 'formulaComponents', model: 'formulaComponent', appendOnly: false },
  { key: 'prepRecords', model: 'prepRecord', appendOnly: false },
  { key: 'projectTemplates', model: 'projectTemplate', appendOnly: false },
  { key: 'projects', model: 'project', appendOnly: false },
  { key: 'projectMembers', model: 'projectMember', appendOnly: false },
  { key: 'tasks', model: 'task', appendOnly: false },
  { key: 'taskDependencies', model: 'taskDependency', appendOnly: false },
  { key: 'milestones', model: 'milestone', appendOnly: false },
  { key: 'phaseTransitions', model: 'phaseTransition', appendOnly: false },
  { key: 'reports', model: 'report', appendOnly: false },
  { key: 'reportVersions', model: 'reportVersion', appendOnly: false },
  { key: 'monthlyProgress', model: 'monthlyProgress', appendOnly: false },
  { key: 'docDocuments', model: 'docDocument', appendOnly: false },
  { key: 'docVersions', model: 'docVersion', appendOnly: false },
  { key: 'primers', model: 'primer', appendOnly: false },
  { key: 'sampleMaterials', model: 'sampleMaterial', appendOnly: false },
  { key: 'rolePermissions', model: 'rolePermission', appendOnly: false },
  { key: 'systemLogs', model: 'systemLog', appendOnly: true },
]);

const TABLE_BY_KEY = new Map(RESTORE_TABLES.map((t) => [t.key, t]));
const CHUNK = 500;
const DEFAULT_PK = ['id'];

/** 表主键字段：复合主键表在注册表显式声明 pk，其余默认 ['id'] */
function pkFieldsOf(table) {
  return table.pk ?? DEFAULT_PK;
}
/** 行主键签名（去重 / 命中判定统一用它；id 表即 id 本身） */
function pkSignature(table, row) {
  return JSON.stringify(pkFieldsOf(table).map((f) => row?.[f] ?? null));
}

/** 批量查询既有行主键签名（单列 id 与复合主键统一处理） */
async function existingKeys(tx, table, rows) {
  const found = new Set();
  const pk = pkFieldsOf(table);
  if (pk.length === 1) {
    const field = pk[0];
    const values = [...new Set(rows.map((r) => r?.[field]).filter((v) => typeof v === 'string' && v))];
    for (let i = 0; i < values.length; i += CHUNK) {
      const slice = values.slice(i, i + CHUNK);
      if (!slice.length) continue;
      // eslint-disable-next-line no-await-in-loop
      const hit = await tx[table.model].findMany({ where: { [field]: { in: slice } }, select: { [field]: true } });
      hit.forEach((r) => found.add(pkSignature(table, r)));
    }
    return found;
  }
  // 复合主键：分片 OR 查询（如 role_permission 为 (roleId, permissionId)）
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    // eslint-disable-next-line no-await-in-loop
    const hit = await tx[table.model].findMany({
      where: { OR: slice.map((r) => Object.fromEntries(pk.map((f) => [f, r?.[f]]))) },
      select: Object.fromEntries(pk.map((f) => [f, true])),
    });
    hit.forEach((r) => found.add(pkSignature(table, r)));
  }
  return found;
}

async function existingIds(tx, model, ids) {
  const found = new Set();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    if (slice.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const rows = await tx[model].findMany({ where: { id: { in: slice } }, select: { id: true } });
    rows.forEach((r) => found.add(r.id));
  }
  return found;
}

/**
 * 只读校验：结构、主键、外键可解析性、唯一键冲突、差异统计。绝不写库。
 */
export async function validatePayload(payload, { mode = 'merge', db = prisma } = {}) {
  return validateRestorePayload(db, RESTORE_TABLES, payload, { mode });
}

/**
 * 应用恢复：单事务；任一步失败整体回滚。
 */
export async function applyRestore(payload, { mode = 'merge' } = {}) {
  const validation = await validatePayload(payload, { mode });
  if (!validation.ok) {
    const err = new Error('备份校验未通过，未写入任何数据');
    err.validation = validation;
    throw err;
  }

  const data = payload.data;
  const included = RESTORE_TABLES.filter((t) => validation.includedKeys.includes(t.key));
  const startedAt = Date.now();
  const summary = { mode, tables: [], deleted: 0, created: 0, updated: 0 };

  await prisma.$transaction(
    async (tx) => {
      // ① replace：逆依赖序清空（append-only 跳过）
      if (mode === 'replace') {
        for (const table of [...included].reverse()) {
          if (table.appendOnly) {
            summary.tables.push({ key: table.key, deleted: 0, skipped: 'append-only' });
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          const res = await tx[table.model].deleteMany();
          summary.deleted += res.count;
          summary.tables.push({ key: table.key, deleted: res.count });
        }
      }

      // ② 依赖序写入：新行 createMany，既有行 merge 模式下 update
      for (const table of included) {
        const rows = data[table.key];
        const pk = pkFieldsOf(table);
        // eslint-disable-next-line no-await-in-loop
        const existing = await existingKeys(tx, table, rows);
        const newRows = rows.filter((r) => !existing.has(pkSignature(table, r)));
        const updRows = rows.filter((r) => existing.has(pkSignature(table, r)));

        if (newRows.length) {
          // eslint-disable-next-line no-await-in-loop
          await tx[table.model].createMany({ data: newRows, skipDuplicates: true });
          summary.created += newRows.length;
        }
        if (mode === 'merge' && updRows.length) {
          for (const row of updRows) {
            const rest = { ...row };
            pk.forEach((f) => delete rest[f]);
            // 纯关联表（如 role_permissions 只有 roleId+permissionId）：行已存在即无需更新
            if (Object.keys(rest).length === 0) continue;
            const where = pk.length === 1
              ? { [pk[0]]: row[pk[0]] }
              : { [pk.join('_')]: Object.fromEntries(pk.map((f) => [f, row[f]])) };
            // eslint-disable-next-line no-await-in-loop
            await tx[table.model].update({ where, data: rest });
          }
          summary.updated += updRows.length;
        } else if (mode === 'replace') {
          summary.created += updRows.length; // replace 模式下清空后重新写入的行
        }
        const entry = summary.tables.find((t) => t.key === table.key);
        if (entry) {
          entry.created = newRows.length;
          entry.updated = mode === 'merge' ? updRows.length : 0;
        } else {
          summary.tables.push({ key: table.key, created: newRows.length, updated: mode === 'merge' ? updRows.length : 0 });
        }
      }
    },
    { timeout: 180000, maxWait: 15000 },
  );

  summary.durationMs = Date.now() - startedAt;
  return summary;
}
