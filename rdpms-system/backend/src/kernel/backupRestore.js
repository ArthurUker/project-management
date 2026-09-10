import { prisma } from '../index.js';

/**
 * kernel/backupRestore.js —— 应用层备份恢复 v2（批次三，替换 Tencent 逐表覆盖方案）
 *
 * 设计要点（禁止沿用旧方案）：
 *   1. 先校验后写库：validatePayload() 全程只读，产出逐表差异与错误清单；
 *   2. 应用阶段整体包在单事务中，任一步失败自动回滚（不会出现"半恢复"库）；
 *   3. 两种模式：
 *      - merge（默认）：按主键 upsert，不触碰备份未涉及的既有行；
 *      - replace：对备份覆盖的表先按逆依赖序清空再写入（append-only 表跳过删除）；
 *   4. 不做外键关闭（PG 无 PRAGMA）；顺序即依赖序，约束由数据库兜底。
 *
 * 已知边界：
 *   - 导出未覆盖的表（projectPhases / detectionTargets / files 等）中的外键只能校验 DB 现存行；
 *   - auditLogs / systemLogs 为 append-only（数据库触发器禁止 UPDATE/DELETE），replace 模式跳过删除。
 */

/** 依赖序：父表在前。replace 模式按此逆序删除。 */
export const RESTORE_TABLES = [
  { key: 'users', model: 'user', unique: ['username'], appendOnly: false, refs: {} },
  { key: 'roles', model: 'role', unique: ['code'], appendOnly: false, refs: {} },
  { key: 'permissions', model: 'permission', unique: ['code'], appendOnly: false, refs: {} },
  { key: 'docCategories', model: 'docCategory', unique: ['code'], appendOnly: false, refs: { parentId: { target: 'table', table: 'docCategories', nullable: true } } },
  { key: 'taskTemplates', model: 'taskTemplate', unique: ['code'], appendOnly: false, refs: {} },
  { key: 'taskTemplateSteps', model: 'taskTemplateStep', unique: [], appendOnly: false, refs: { templateId: { target: 'table', table: 'taskTemplates', nullable: false } } },
  { key: 'reagentMaterials', model: 'reagentMaterial', unique: ['code'], appendOnly: false, refs: {} },
  { key: 'reagentLots', model: 'reagentLot', unique: [], appendOnly: false, refs: { materialId: { target: 'table', table: 'reagentMaterials', nullable: false } } },
  { key: 'reagentFormulas', model: 'reagentFormula', unique: ['code'], appendOnly: false, refs: { projectId: { target: 'db', model: 'project', nullable: true } } },
  { key: 'formulaComponents', model: 'formulaComponent', unique: [], appendOnly: false, refs: { formulaId: { target: 'table', table: 'reagentFormulas', nullable: false }, materialId: { target: 'table', table: 'reagentMaterials', nullable: true } } },
  { key: 'prepRecords', model: 'prepRecord', unique: [], appendOnly: false, refs: { formulaId: { target: 'table', table: 'reagentFormulas', nullable: false }, createdById: { target: 'table', table: 'users', nullable: false } } },
  { key: 'projectTemplates', model: 'projectTemplate', unique: ['code'], appendOnly: false, refs: { createdById: { target: 'table', table: 'users', nullable: false }, parentId: { target: 'table', table: 'projectTemplates', nullable: true } } },
  { key: 'projects', model: 'project', unique: [], appendOnly: false, refs: { managerId: { target: 'table', table: 'users', nullable: false }, templateId: { target: 'table', table: 'projectTemplates', nullable: true } } },
  { key: 'projectMembers', model: 'projectMember', unique: [], appendOnly: false, refs: { projectId: { target: 'table', table: 'projects', nullable: false }, userId: { target: 'table', table: 'users', nullable: false } } },
  { key: 'tasks', model: 'task', unique: [], appendOnly: false, refs: { projectId: { target: 'table', table: 'projects', nullable: false }, phaseId: { target: 'db', model: 'projectPhase', nullable: true }, assigneeId: { target: 'table', table: 'users', nullable: true }, parentId: { target: 'table', table: 'tasks', nullable: true } } },
  { key: 'taskDependencies', model: 'taskDependency', unique: [], appendOnly: false, refs: { taskId: { target: 'table', table: 'tasks', nullable: false }, prerequisiteId: { target: 'table', table: 'tasks', nullable: false } } },
  { key: 'milestones', model: 'milestone', unique: [], appendOnly: false, refs: { projectId: { target: 'table', table: 'projects', nullable: false }, phaseId: { target: 'db', model: 'projectPhase', nullable: true } } },
  { key: 'phaseTransitions', model: 'phaseTransition', unique: [], appendOnly: false, refs: { fromPhaseId: { target: 'db', model: 'projectPhase', nullable: false }, toPhaseId: { target: 'db', model: 'projectPhase', nullable: false } } },
  { key: 'reports', model: 'report', unique: [], appendOnly: false, refs: { authorId: { target: 'table', table: 'users', nullable: false } } },
  { key: 'reportVersions', model: 'reportVersion', unique: [], appendOnly: false, refs: { reportId: { target: 'table', table: 'reports', nullable: false } } },
  { key: 'monthlyProgress', model: 'monthlyProgress', unique: [], appendOnly: false, refs: { projectId: { target: 'table', table: 'projects', nullable: false } } },
  { key: 'docDocuments', model: 'docDocument', unique: ['code'], appendOnly: false, refs: { categoryId: { target: 'table', table: 'docCategories', nullable: false }, ownerId: { target: 'table', table: 'users', nullable: false }, reviewerId: { target: 'table', table: 'users', nullable: true } } },
  { key: 'docVersions', model: 'docVersion', unique: [], appendOnly: false, refs: { documentId: { target: 'table', table: 'docDocuments', nullable: false }, createdById: { target: 'table', table: 'users', nullable: false } } },
  { key: 'primers', model: 'primer', unique: ['code'], appendOnly: false, refs: { projectId: { target: 'table', table: 'projects', nullable: true }, targetId: { target: 'db', model: 'detectionTarget', nullable: true }, createdById: { target: 'table', table: 'users', nullable: false } } },
  { key: 'sampleMaterials', model: 'sampleMaterial', unique: ['sampleCode'], appendOnly: false, refs: { projectId: { target: 'table', table: 'projects', nullable: true }, createdById: { target: 'table', table: 'users', nullable: true } } },
  { key: 'rolePermissions', model: 'rolePermission', unique: [], appendOnly: false, refs: { roleId: { target: 'table', table: 'roles', nullable: false }, permissionId: { target: 'table', table: 'permissions', nullable: false } } },
  { key: 'systemLogs', model: 'systemLog', unique: [], appendOnly: true, refs: { userId: { target: 'table', table: 'users', nullable: true } } },
];

const TABLE_BY_KEY = new Map(RESTORE_TABLES.map((t) => [t.key, t]));
const CHUNK = 500;

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
export async function validatePayload(payload, { mode = 'merge' } = {}) {
  const errors = [];
  const warnings = [];
  const tables = [];

  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['备份文件不是有效 JSON 对象'], warnings, tables: [], includedKeys: [] };
  }
  if (!payload.version) errors.push('缺少 version 字段（期望 2.0）');
  if (!payload.data || typeof payload.data !== 'object') errors.push('缺少 data 字段');
  if (errors.length) return { ok: false, errors, warnings, tables: [], includedKeys: [] };

  const data = payload.data;
  const includedKeys = [];
  for (const key of Object.keys(data)) {
    if (!TABLE_BY_KEY.has(key)) {
      warnings.push(`忽略未知数据表 ${key}`);
      continue;
    }
    if (!Array.isArray(data[key])) {
      errors.push(`${key} 不是数组`);
      continue;
    }
    includedKeys.push(key);
  }
  if (includedKeys.length === 0) errors.push('备份文件不含任何可恢复的数据表');

  // replace 模式：父表被清空但子表未纳入时，外键会阻止删除（事务整体回滚）——提前提示
  if (mode === 'replace' && errors.length === 0) {
    const keySet = new Set(includedKeys);
    const DEPENDENTS = [
      ['users', ['projects', 'projectMembers', 'tasks', 'reports', 'docDocuments', 'docVersions', 'primers', 'sampleMaterials', 'prepRecords', 'projectTemplates']],
      ['roles', ['rolePermissions']],
      ['permissions', ['rolePermissions']],
      ['projects', ['tasks', 'milestones', 'reports', 'monthlyProgress', 'projectMembers']],
      ['docCategories', ['docDocuments']],
      ['taskTemplates', ['taskTemplateSteps']],
      ['reagentMaterials', ['reagentLots', 'formulaComponents']],
      ['reagentFormulas', ['formulaComponents', 'prepRecords']],
    ];
    for (const [parent, children] of DEPENDENTS) {
      if (!keySet.has(parent)) continue;
      const missing = children.filter((child) => !keySet.has(child));
      if (missing.length) {
        warnings.push(`replace 包含 ${parent} 但未包含 ${missing.join('/')}；若这些表仍有引用行，清空会被外键阻止（事务将整体回滚）`);
      }
    }
  }

  // 各表主键集合（供跨表外键校验）
  const payloadIdSets = new Map();
  for (const key of includedKeys) {
    const rows = data[key];
    const seen = new Set();
    let dupCount = 0;
    let missingId = 0;
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        errors.push(`${key} 存在非对象行`);
        break;
      }
      if (typeof row.id !== 'string' || !row.id) {
        missingId += 1;
        continue;
      }
      if (seen.has(row.id)) dupCount += 1;
      seen.add(row.id);
    }
    if (missingId) errors.push(`${key} 有 ${missingId} 行缺少 id`);
    if (dupCount) errors.push(`${key} 主键在备份文件内重复 ${dupCount} 处`);
    payloadIdSets.set(key, seen);
  }

  for (const key of includedKeys) {
    const table = TABLE_BY_KEY.get(key);
    const rows = data[key];
    const ids = rows.map((r) => r?.id).filter((v) => typeof v === 'string');
    // eslint-disable-next-line no-await-in-loop
    const existing = ids.length ? await existingIds(prisma, table.model, ids) : new Set();

    const tableErrors = [];
    const tableWarnings = [];

    // 唯一键冲突（同值不同主键时无法 create，merge 会报错）
    for (const field of table.unique) {
      const values = rows.map((r) => r?.[field]).filter((v) => v != null);
      if (!values.length) continue;
      const uniq = [...new Set(values)];
      // eslint-disable-next-line no-await-in-loop
      const clash = await prisma[table.model].findMany({
        where: { [field]: { in: uniq.slice(0, CHUNK) } },
        select: { id: true, [field]: true },
      });
      for (const c of clash) {
        const ownerId = c.id;
        const row = rows.find((r) => r?.[field] === c[field]);
        if (row && row.id !== ownerId) {
          tableErrors.push(`${field}="${c[field]}" 已被既有记录占用（id=${ownerId}），无法写入 id=${row.id}`);
        }
      }
    }

    // 外键可解析性
    for (const [field, ref] of Object.entries(table.refs)) {
      const values = [...new Set(rows.map((r) => r?.[field]).filter((v) => typeof v === 'string' && v))];
      if (!values.length) continue;
      let resolvable = new Set();
      if (ref.target === 'table') {
        const targetSet = payloadIdSets.get(ref.table);
        if (targetSet) {
          values.forEach((v) => { if (targetSet.has(v)) resolvable.add(v); });
        }
        const remaining = values.filter((v) => !resolvable.has(v));
        if (remaining.length === 0) continue;
        // eslint-disable-next-line no-await-in-loop
        const inDb = await existingIds(prisma, TABLE_BY_KEY.get(ref.table).model, remaining);
        resolvable = new Set([...resolvable, ...inDb]);
      } else {
        // eslint-disable-next-line no-await-in-loop
        resolvable = await existingIds(prisma, ref.model, values);
      }
      const unresolved = values.filter((v) => !resolvable.has(v));
      if (unresolved.length) {
        const sample = unresolved.slice(0, 3).join(', ');
        const msg = `${field} 有 ${unresolved.length} 个引用无法解析（如 ${sample}）`;
        if (ref.nullable) tableWarnings.push(msg);
        else tableErrors.push(msg);
      }
    }

    if (mode === 'replace' && table.appendOnly) {
      tableWarnings.push('append-only 表：replace 模式跳过清空，仅做补写');
    }

    const updateCount = ids.filter((id) => existing.has(id)).length;
    errors.push(...tableErrors.map((e) => `[${key}] ${e}`));
    warnings.push(...tableWarnings.map((w) => `[${key}] ${w}`));
    tables.push({
      key,
      rows: rows.length,
      existing: updateCount,
      new: rows.length - updateCount,
      willDelete: mode === 'replace' && !table.appendOnly ? null : 0, // replace 时由 DB 侧统计
      errors: tableErrors,
      warnings: tableWarnings,
    });
  }

  return { ok: errors.length === 0, errors, warnings, tables, includedKeys };
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
        const ids = rows.map((r) => r.id);
        // eslint-disable-next-line no-await-in-loop
        const existing = await existingIds(tx, table.model, ids);
        const newRows = rows.filter((r) => !existing.has(r.id));
        const updRows = rows.filter((r) => existing.has(r.id));

        if (newRows.length) {
          // eslint-disable-next-line no-await-in-loop
          await tx[table.model].createMany({ data: newRows, skipDuplicates: true });
          summary.created += newRows.length;
        }
        if (mode === 'merge' && updRows.length) {
          for (const row of updRows) {
            const { id, ...rest } = row;
            // eslint-disable-next-line no-await-in-loop
            await tx[table.model].update({ where: { id }, data: rest });
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
