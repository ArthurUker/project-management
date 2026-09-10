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
 *   4. 不做外键开关切换（PostgreSQL 由约束 + 依赖序保证）；顺序即依赖序，约束由数据库兜底。
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
  // 复合主键表（无 id 列）：必须显式声明 pk，否则校验/写入都会失败
  { key: 'rolePermissions', model: 'rolePermission', pk: ['roleId', 'permissionId'], unique: [], appendOnly: false, refs: { roleId: { target: 'table', table: 'roles', nullable: false }, permissionId: { target: 'table', table: 'permissions', nullable: false } } },
  { key: 'systemLogs', model: 'systemLog', unique: [], appendOnly: true, refs: { userId: { target: 'table', table: 'users', nullable: true } } },
];

const TABLE_BY_KEY = new Map(RESTORE_TABLES.map((t) => [t.key, t]));
const CHUNK = 500;
const DEFAULT_PK = ['id'];

/** 表主键字段：复合主键表在注册表显式声明 pk，其余默认 ['id'] */
function pkFieldsOf(table) {
  return table.pk ?? DEFAULT_PK;
}
/** 行主键签名（去重 / 命中判定统一用它；id 表即 id 本身） */
function pkSignature(table, row) {
  return pkFieldsOf(table).map((f) => String(row?.[f] ?? '')).join('\u0001');
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
      hit.forEach((r) => found.add(String(r[field])));
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

  // replace 前置检查（演练环境发现）：审计日志等"未纳入恢复范围"的表引用被清空的父表，
  // 且 audit_logs 为 append-only（触发器禁止 UPDATE/DELETE）→ 生产库上清空 users 必被拒，
  // 事务虽会整体回滚（不会半恢复），但应当在预校验阶段就明确告知，而不是抛 Prisma 原始错误。
  if (mode === 'replace') {
    const [auditRows, syncDevices] = await Promise.all([
      prisma.auditLog.count().catch(() => 0),
      prisma.syncDevice.count().catch(() => 0),
    ]);
    if (auditRows > 0 || syncDevices > 0) {
      errors.push(
        `replace 不可用于当前库：存在未纳入恢复范围且引用被清空表的数据`
        + `（审计日志 ${auditRows} 行、同步设备 ${syncDevices} 行）；`
        + '清空会被外键与 append-only 触发器阻止。请在空库上执行 replace，或改用 merge 模式。',
      );
    } else {
      warnings.push('replace 会按逆依赖序清空备份覆盖的表；请在确认无外部引用后执行');
    }
  }

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
    const table = TABLE_BY_KEY.get(key);
    const rows = data[key];
    const seen = new Set();
    let dupCount = 0;
    let missingId = 0;
    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        errors.push(`${key} 存在非对象行`);
        break;
      }
      // 主键字段按表声明（复合主键表无 id 列，如 rolePermissions）
      if (pkFieldsOf(table).some((f) => row[f] === undefined || row[f] === null || row[f] === '')) {
        missingId += 1;
        continue;
      }
      const sig = pkSignature(table, row);
      if (seen.has(sig)) dupCount += 1;
      seen.add(sig);
    }
    if (missingId) errors.push(`${key} 有 ${missingId} 行缺少主键（${pkFieldsOf(table).join('+')}）`);
    if (dupCount) errors.push(`${key} 主键在备份文件内重复 ${dupCount} 处`);
    payloadIdSets.set(key, seen);
  }

  for (const key of includedKeys) {
    const table = TABLE_BY_KEY.get(key);
    const rows = data[key];
    const sigs = rows.filter((r) => r && typeof r === 'object').map((r) => pkSignature(table, r));
    // eslint-disable-next-line no-await-in-loop
    const existing = rows.length ? await existingKeys(prisma, table, rows) : new Set();

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

    const updateCount = sigs.filter((s) => existing.has(s)).length;
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
