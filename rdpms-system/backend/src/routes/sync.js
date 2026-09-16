import { Hono } from 'hono';
import crypto from 'node:crypto';
import { prisma } from '../platform/db/client.js';
import { authenticate as authMiddleware, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS, PROJECT_CAPABILITIES } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, HttpError } from '../kernel/http.js';
import { projectVisibilityFilter, assertProjectCapability } from '../kernel/projectAccess.js';
import {
  assertActionPermission,
  assertTaskStatusChange,
  assertTaskAssign,
  assertPhaseStatusChange,
  assertPhaseBelongsToProject,
  assertReportWritable,
} from '../modules/access/writeGuards.js';
import { buildReportDraftPatch, saveReportDraft } from '../modules/reports/reportCommands.js';
import { updateTaskFields, changeTaskStatus, assignTask } from '../modules/tasks/taskCommands.js';

/**
 * /api/sync —— 离线同步 v2（批次四）
 *
 * 协议：
 *   GET  /api/sync/init?since=&deviceId=   增量拉取（业务表 updatedAt/deletedAt 派生，无影子表）
 *   POST /api/sync/push                     上行变更（clientMutationId 幂等、baseUpdatedAt 冲突检测）
 *   GET  /api/sync/status                   本用户设备与最近同步状态
 *   POST /api/sync/device                   设备登记/更新
 *
 * 安全与正确性约束（对齐规划要求）：
 *   1. 数据范围 = 用户可见项目（成员/负责人；SUPER_ADMIN 全量），并返回 acl.projectIds 供客户端清除越权本地数据；
 *   2. 服务端权威字段（审阅字段、编号、归属）一律忽略客户端上行值；
 *   3. 删除一律软删（tombstone），projectMembers 用 leftAt 语义；
 *   4. 每条变更以 clientMutationId 幂等：重复上行返回首次结果，不重复写库。
 */

const sync = new Hono();

sync.use('*', authMiddleware);

// ── 可同步实体注册表 ─────────────────────────────────────────────────────────
const SYNC_ENTITIES = {
  projects: {
    model: 'project',
    scope: 'projectSelf',
    createAllowed: false, // Project.code 由 CodeSequence 服务端发号，不做离线新建
    tombstoneField: 'deletedAt',
    touchUpdatedBy: true,
    fields: ['name', 'description', 'status', 'type', 'position', 'managerId', 'startDate', 'endDate', 'actualEndDate'],
    serverOwned: ['code', 'templateId', 'metadata'],
    // RF04 补齐：项目属性编辑需 projects.update（离线不支持新建，编号由服务端发号）
    permission: 'projects.update',
    deletePermission: 'projects.delete',
    include: { manager: { select: { id: true, displayName: true } } },
  },
  projectPhases: {
    model: 'projectPhase',
    scope: 'byProject',
    createAllowed: true,
    tombstoneField: 'deletedAt',
    touchUpdatedBy: true,
    fields: ['code', 'name', 'sortOrder', 'status', 'plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'progressPercent', 'isMilestone', 'notes'],
    serverOwned: [],
    // RF04：阶段编辑/新建与状态流转分别校验动作权限
    permission: 'project_phases.update',
    deletePermission: 'project_phases.delete',
    createPermission: 'project_phases.create',
    statusPermission: 'project_phases.change_status',
  },
  tasks: {
    model: 'task',
    scope: 'byProject',
    createAllowed: true,
    tombstoneField: 'deletedAt',
    touchUpdatedBy: true,
    fields: ['title', 'description', 'status', 'priority', 'assigneeId', 'phaseId', 'parentId', 'taskType', 'applicability', 'regulatoryPriority', 'expectedDeliverable', 'regulatoryNotes', 'sortOrder', 'estimatedHours', 'actualHours', 'progressPercent', 'startDate', 'dueDate'],
    serverOwned: ['code', 'completedAt', 'startedAt'],
    // RF04/F07：同步不是后门——动作权限与普通 API 同源
    permission: 'tasks.update',
    deletePermission: 'tasks.delete',
    createPermission: 'tasks.create',
    statusPermission: 'tasks.change_status',
    assignPermission: 'tasks.assign',
    derive: (data) => {
      // 状态派生：完成/开始时间由服务端统一写入（客户端不可伪造）
      if (data.status === 'COMPLETED') data.completedAt = new Date();
      if (data.status === 'IN_PROGRESS') data.startedAt = new Date();
    },
  },
  milestones: {
    model: 'milestone',
    scope: 'byProject',
    createAllowed: true,
    tombstoneField: 'deletedAt',
    touchUpdatedBy: true,
    fields: ['name', 'description', 'phaseId', 'dueDate', 'status'],
    serverOwned: ['completedAt'],
    // RF04 补齐：里程碑编辑/新建需 milestones.update / milestones.create
    permission: 'milestones.update',
    deletePermission: 'milestones.delete',
    createPermission: 'milestones.create',
    derive: (data) => {
      if (data.status === 'COMPLETED') data.completedAt = new Date();
    },
  },
  monthlyProgress: {
    model: 'monthlyProgress',
    scope: 'byProject',
    createAllowed: true,
    tombstoneField: 'deletedAt',
    touchUpdatedBy: true,
    fields: ['periodKey', 'actualWork', 'completionPercent', 'nextPlan', 'risks', 'projectStatus'],
    serverOwned: ['submittedById', 'submittedAt'],
    // RF04 补齐：月度进展编辑/新建需 progress.update / progress.create（写出需项目 manage_members）
    permission: 'progress.update',
    deletePermission: 'progress.delete',
    createPermission: 'progress.create',
  },
  reports: {
    model: 'report',
    scope: 'byProject',
    ownOnly: true, // 归属必须为本用户
    createAllowed: true,
    tombstoneField: 'deletedAt',
    touchUpdatedBy: true,
    fields: ['reportType', 'periodKey', 'periodStart', 'periodEnd', 'content'],
    // 服务端权威：审批/版本/归属——客户端上行一律忽略（审阅字段不可被覆盖）
    serverOwned: ['authorId', 'reviewerId', 'status', 'currentVersion', 'submittedAt', 'reviewedAt', 'reviewNote'],
    // RF04/F07：汇报的锁定与动作权限与普通 API 同源
    permission: 'reports.update',
    deletePermission: 'reports.delete',
    createPermission: 'reports.create',
    lockRule: 'report',
  },
  projectMembers: {
    model: 'projectMember',
    scope: 'byProject',
    createAllowed: true,
    tombstoneField: 'leftAt', // 软退出：leftAt 非空即视为已移除
    timestampField: 'joinedAt', // 该表无 updatedAt（实机部署发现）
    touchUpdatedBy: false,
    fields: ['role', 'userId'], // userId 为离线新增成员所需（权限由 manage_members 约束）
    serverOwned: [],
    requireCapability: 'manage_members', // 成员调整需要管理成员能力
    permission: 'projects.manage_members', // RF04 补齐：与普通 API 的成员管理权限同源
    // 成员移除不是删除行，而是「退出」动作（写 leftAt 墓碑），因此沿用成员管理权限；
    // 这是**显式策略**：该实体没有、也不会用 projects.update 之类的权限代替。
    deletePermission: 'projects.manage_members',
  },
};

const ENTITY_KEYS = Object.keys(SYNC_ENTITIES);

function pickFields(raw, allowed) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of allowed) if (raw[key] !== undefined) out[key] = raw[key];
  return out;
}

async function upsertSyncDevice(auth, deviceId, label, platform) {
  return prisma.syncDevice.upsert({
    where: { id: deviceId },
    update: { label: label ?? undefined, platform: platform ?? undefined },
    create: { id: deviceId, userId: auth.userId, label: label ?? null, platform: platform ?? null },
  });
}

/**
 * 解析同步写入所需的项目访问上下文（与普通 API 的 resolveProjectAccess 同源判定）。
 * 返回 null 表示非有效成员。
 */
async function loadSyncAccess(auth, projectId) {
  if (auth.systemRole === 'SUPER_ADMIN') {
    return {
      capabilities: ['read', 'write', 'delete', 'transition', 'assign', 'manage_members'],
      memberRole: null,
      isMember: true,
      elevated: true,
    };
  }
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth.userId } },
    select: { role: true, leftAt: true },
  });
  if (!membership || membership.leftAt !== null) return null;
  return {
    capabilities: PROJECT_CAPABILITIES[membership.role] ?? [],
    memberRole: membership.role,
    isMember: true,
    elevated: false,
  };
}

/**
 * 实体动作级校验（RF04/F07）：同步与普通 API 调用同一组守卫，
 * 保证「有项目 write 但无对应动作权限」的请求同样被拒绝。
 */
async function assertSyncEntityActions({ entity, def, existing, data, auth, access, projectId, op }) {
  // 通用动作权限（所有实体统一执行）：
  //   删除 → deletePermission（**独立权限码，绝不复用 update**）；未定义 = 不支持离线删除
  //   更新 → permission；新建 → createPermission
  if (op === 'delete') {
    if (!def.deletePermission) {
      throw new HttpError(
        403,
        'SYNC_DELETE_NOT_SUPPORTED',
        `${entity} 不支持离线删除（未定义独立删除权限），请在在线接口按对应权限操作`,
      );
    }
    assertActionPermission(auth, def.deletePermission);
  } else if (existing) {
    if (def.permission) assertActionPermission(auth, def.permission);
  } else if (def.createPermission) {
    assertActionPermission(auth, def.createPermission);
  }

  if (entity === 'reports') {
    if (op === 'delete') {
      assertReportWritable(existing, auth, access, 'reports.delete');
      return;
    }
    // 周期键/内容形状走与普通 API 相同的构造与校验
    const validated = buildReportDraftPatch(data, { currentType: existing?.reportType ?? 'MONTHLY' });
    if (validated.reportType !== undefined) data.reportType = validated.reportType;
    if (validated.periodKey !== undefined) data.periodKey = validated.periodKey;
    if (validated.content !== undefined) data.content = validated.content;

    if (existing) {
      assertReportWritable(existing, auth, access, 'reports.update');
    } else {
      assertActionPermission(auth, def.createPermission ?? 'reports.create');
    }
    return;
  }

  if (entity === 'tasks') {
    if (existing && data.status !== undefined && data.status !== existing.status) {
      assertTaskStatusChange(auth, access);
    }
    if (existing && data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
      assertTaskAssign(auth, access);
    }
    if (existing) assertActionPermission(auth, def.permission ?? 'tasks.update');
    else assertActionPermission(auth, def.createPermission ?? 'tasks.create');
    if (data.phaseId !== undefined && data.phaseId !== null) {
      await assertPhaseBelongsToProject(prisma, data.phaseId, projectId);
    }
    return;
  }

  if (entity === 'milestones' && data.phaseId !== undefined && data.phaseId !== null) {
    await assertPhaseBelongsToProject(prisma, data.phaseId, projectId);
    return;
  }

  if (entity === 'projectPhases' && existing
    && data.status !== undefined && data.status !== existing.status) {
    assertPhaseStatusChange(auth, access);
  }
}

function aclVersionOf(projectIds, permissions) {
  return crypto
    .createHash('sha1')
    .update(`${[...projectIds].sort().join(',')}|${[...permissions].sort().join(',')}`)
    .digest('hex')
    .slice(0, 16);
}

// ── 增量拉取 ─────────────────────────────────────────────────────────────────
sync.get('/init', async (c) => {
  const auth = getAuth(c);
  const sinceRaw = c.req.query('since');
  let since = new Date(0);
  if (sinceRaw) {
    since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) throw badRequest('VALIDATION_ERROR', 'since 非法（需 ISO 时间）');
  }
  const deviceId = String(c.req.query('deviceId') || '').slice(0, 64);

  const aclFilter = projectVisibilityFilter(auth);
  const visibleProjects = await prisma.project.findMany({
    where: { ...(aclFilter ?? {}), deletedAt: null },
    select: { id: true },
  });
  const projectIds = visibleProjects.map((p) => p.id);
  const projectIdSet = new Set(projectIds);

  const changes = {};
  for (const [entity, def] of Object.entries(SYNC_ENTITIES)) {
    const scopeWhere = {};
    if (def.scope === 'byProject') scopeWhere.projectId = { in: projectIds };
    if (def.scope === 'projectSelf') scopeWhere.id = { in: projectIds };
    if (def.ownOnly) scopeWhere.authorId = auth.userId;

    const aliveFilter = def.tombstoneField === 'leftAt'
      ? { leftAt: null }
      : { deletedAt: null };
    const tsField = def.timestampField ?? 'updatedAt';

    // eslint-disable-next-line no-await-in-loop
    const upserts = await prisma[def.model].findMany({
      where: { ...scopeWhere, ...aliveFilter, [tsField]: { gt: since } },
      ...(def.include ? { include: def.include } : {}),
      orderBy: { [tsField]: 'asc' },
      take: 3000,
    });

    // eslint-disable-next-line no-await-in-loop
    const removed = await prisma[def.model].findMany({
      where: { ...scopeWhere, [def.tombstoneField]: { gt: since } },
      select: { id: true },
      take: 5000,
    });

    changes[entity] = { upserts, tombstones: removed.map((r) => r.id) };
  }

  const serverTime = new Date().toISOString();
  if (deviceId) {
    await upsertSyncDevice(auth, deviceId, c.req.query('deviceLabel'), c.req.query('platform'));
    await prisma.syncDevice.update({ where: { id: deviceId }, data: { lastSyncAt: new Date() } });
  }

  return c.json({
    serverTime,
    cursor: serverTime, // 客户端下次带 since=cursor
    full: !sinceRaw,
    acl: {
      projectIds, // 客户端据此清除不再可见项目的本地数据
      permissions: auth.permissions,
      aclVersion: aclVersionOf(projectIds, auth.permissions),
    },
    entities: ENTITY_KEYS,
    changes,
  });
});

// ── 上行变更 ─────────────────────────────────────────────────────────────────
sync.post('/push', async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const deviceId = String(body?.deviceId || '').slice(0, 64);
  if (!deviceId) throw badRequest('VALIDATION_ERROR', 'deviceId 必填');
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (changes.length > 500) throw badRequest('VALIDATION_ERROR', '单批最多 500 条变更');

  await upsertSyncDevice(auth, deviceId, body?.deviceLabel, body?.platform);

  if (changes.length === 0) {
    await prisma.syncDevice.update({ where: { id: deviceId }, data: { lastPushAt: new Date() } });
    return c.json({ serverTime: new Date().toISOString(), results: [], conflictCount: 0 });
  }

  const aclFilter = projectVisibilityFilter(auth);
  const visible = await prisma.project.findMany({
    where: { ...(aclFilter ?? {}), deletedAt: null },
    select: { id: true },
  });
  const accessible = new Set(visible.map((p) => p.id));

  // 幂等命中预取：同一 clientMutationId 重复上行直接回放首次结果
  const mutationIds = changes.map((ch) => String(ch?.clientMutationId || '')).filter(Boolean);
  const replayed = mutationIds.length
    ? await prisma.syncMutation.findMany({ where: { clientMutationId: { in: mutationIds } } })
    : [];
  const replayMap = new Map(replayed.map((m) => [m.clientMutationId, m]));

  const results = [];
  for (const raw of changes) {
    const clientMutationId = String(raw?.clientMutationId || '').slice(0, 64);
    const entity = String(raw?.entity || '');
    const entityId = String(raw?.id || '');
    const op = raw?.op === 'delete' ? 'delete' : 'upsert';
    const def = SYNC_ENTITIES[entity];

    const base = { clientMutationId, entity, id: entityId, op };

    if (!clientMutationId || !def || !entityId) {
      results.push({ ...base, status: 'rejected', reason: '缺少 clientMutationId / 未知实体 / 缺少 id' });
      continue;
    }

    const hit = replayMap.get(clientMutationId);
    if (hit) {
      results.push({ ...(hit.result ?? base), status: hit.status, replayed: true });
      continue;
    }

    let outcome;
    try {
      // eslint-disable-next-line no-await-in-loop
      const existing = await prisma[def.model].findUnique({ where: { id: entityId } });
      const data = pickFields(raw?.data, def.fields);

      // 注意：data 已被 pickFields 白名单过滤，projectId 不在 def.fields 中，
      // 必须从原始载荷读取；否则离线**新建**（phase/task/report/milestone/monthlyProgress/member）
      // 永远拿不到归属项目 → 被误判"无权访问该数据所属项目"（演练环境发现）
      const projectId = def.scope === 'projectSelf'
        ? (existing?.id ?? entityId)
        : (existing?.projectId ?? raw?.data?.projectId);

      if (!projectId || !accessible.has(projectId)) {
        outcome = { status: 'rejected', reason: '无权访问该数据所属项目' };
      } else if (def.ownOnly && existing && existing.authorId !== auth.userId) {
        outcome = { status: 'rejected', reason: '无权修改他人汇报' };
      } else {
        // RF04/F07：同步与普通 API 同源——项目访问上下文 + 实体动作级权限
        // eslint-disable-next-line no-await-in-loop
        const syncAccess = await loadSyncAccess(auth, projectId);
        if (!syncAccess) throw new Error('无权访问该数据所属项目');
        assertProjectCapability(syncAccess, def.requireCapability ?? 'write', def.permission ?? 'sync.write');
        // eslint-disable-next-line no-await-in-loop
        await assertSyncEntityActions({
          entity, def, existing, data, auth, access: syncAccess, projectId, op,
        });

        const tsField = def.timestampField ?? 'updatedAt';
        // 并发基线：既用于「先判冲突」，也作为原子 UPDATE 的 WHERE 条件（下方 casFilter），
        // 避免先读、比较、再无条件更新之间的竞态。
        const casFilter = existing ? { [tsField]: existing[tsField] } : undefined;
        // 冲突检测：客户端基线早于服务端时间戳
        if (op !== 'delete' && existing && raw?.baseUpdatedAt
          && new Date(existing[tsField]) > new Date(raw.baseUpdatedAt)) {
          outcome = {
            status: 'conflict',
            reason: '服务端已有更新',
            server: { id: existing.id, updatedAt: existing[tsField], ...pickFields(existing, def.fields) },
          };
        } else if (op === 'delete') {
          const patch = def.tombstoneField === 'leftAt'
            ? { leftAt: new Date() }
            : { deletedAt: new Date() };
          if (!existing) {
            outcome = { status: 'applied', action: 'noop', reason: '记录不存在，无需删除' };
          } else {
            // eslint-disable-next-line no-await-in-loop
            const updated = await prisma[def.model].update({
              where: { id: entityId },
              data: { ...patch, ...(def.touchUpdatedBy ? { updatedById: auth.userId } : {}) },
            });
            outcome = { status: 'applied', action: 'deleted', serverUpdatedAt: updated[tsField] };
          }
        } else if (!existing && !def.createAllowed) {
          outcome = { status: 'rejected', reason: `${entity} 不支持离线新建` };
        } else {
          // 服务端权威字段一律剔除；补充归属
          for (const owned of def.serverOwned) delete data[owned];
          if (def.derive) def.derive(data);

          if (existing) {
            // RF04：已存在记录的更新走与普通 API 相同的应用命令（不各自复制写入逻辑）
            let updated;
            if (entity === 'reports') {
              updated = await saveReportDraft(prisma, {
                actor: auth, reportId: entityId, patch: data, cas: casFilter,
              });
            } else if (entity === 'tasks') {
              const nextStatus = data.status;
              const statusChanging = nextStatus !== undefined && nextStatus !== existing.status;
              const assigneeChanging = data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId;
              const nextAssignee = data.assigneeId ?? null;
              delete data.status;
              delete data.assigneeId;
              // 并发基线只在**本事务的第一次写入**上校验：
              // 第一次写入已把行锁住并改变了 updatedAt，后续写入再用旧基线会必然落空。
              let casConsumed = false;
              const nextCas = () => {
                if (casConsumed) return undefined;
                casConsumed = true;
                return casFilter;
              };
              // 同一事务：多命令不得各自提交（全成功或全不变）
              updated = await prisma.$transaction(async (tx) => {
                if (Object.keys(data).length > 0) {
                  await updateTaskFields(tx, { actor: auth, access: syncAccess, task: existing, fields: data, cas: nextCas() });
                }
                if (statusChanging) {
                  await changeTaskStatus(tx, { actor: auth, access: syncAccess, task: existing, status: nextStatus, cas: nextCas() });
                }
                if (assigneeChanging) {
                  await assignTask(tx, { actor: auth, access: syncAccess, task: existing, assigneeId: nextAssignee, cas: nextCas() });
                }
                return tx.task.findUnique({ where: { id: entityId } });
              });
            } else {
              const writeData = { ...data, ...(def.touchUpdatedBy ? { updatedById: auth.userId } : {}) };
              if (casFilter) {
                // 原子并发基线：UPDATE ... WHERE id = ? AND <ts> = <读到的值>
                // eslint-disable-next-line no-await-in-loop
                const cas = await prisma[def.model].updateMany({
                  where: { id: entityId, ...casFilter },
                  data: writeData,
                });
                if (cas.count === 0) {
                  const conflictErr = new Error('并发更新冲突：数据已被他人修改');
                  conflictErr.syncConflict = true;
                  throw conflictErr;
                }
                // eslint-disable-next-line no-await-in-loop
                updated = await prisma[def.model].findUnique({ where: { id: entityId } });
              } else {
                updated = await prisma[def.model].update({
                  where: { id: entityId },
                  data: writeData,
                });
              }
            }
            outcome = { status: 'applied', action: 'updated', serverUpdatedAt: updated?.[tsField] };
          } else {
            const createData = { ...data, id: entityId };
            if (entity === 'reports') createData.authorId = auth.userId;
            if (entity === 'monthlyProgress') createData.submittedById = auth.userId;
            if (def.touchUpdatedBy) createData.createdById = auth.userId;
            if (def.scope === 'byProject' && !createData.projectId) createData.projectId = projectId;
            // eslint-disable-next-line no-await-in-loop
            const created = await prisma[def.model].create({ data: createData });
            outcome = { status: 'applied', action: 'created', serverUpdatedAt: created[tsField] };
          }
        }
      }
    } catch (err) {
      // Prisma 校验失败时 err.message 是多行对象 dump；只把最后一行有效信息回给客户端
      // （如 "Argument `code` is missing."），完整错误留在服务端日志便于排查
      const lines = String(err?.message || '写入失败').split('\n').map((s) => s.trim()).filter(Boolean);
      const brief = lines[lines.length - 1] || '写入失败';
      // eslint-disable-next-line no-console
      console.error(`[sync.push] ${entity}/${op} 失败:`, err?.message || err);
      // 并发基线不一致 → conflict（客户端据此拉取最新并重新基于新版本提交），而不是 rejected
      // 仅并发基线冲突映射为 conflict；其他 409（如 INVALID_STATE 锁定）仍按 rejected 处理
      const isConflict = err?.syncConflict === true || err?.code === 'CONFLICT';
      outcome = isConflict
        ? { status: 'conflict', reason: '服务端已有更新（并发基线不一致）' }
        : { status: 'rejected', reason: brief };
    }

    const record = { ...base, ...outcome };
    // eslint-disable-next-line no-await-in-loop
    await prisma.syncMutation.create({
      data: {
        clientMutationId,
        deviceId,
        userId: auth.userId,
        entity,
        entityId,
        op,
        status: outcome.status,
        result: record,
      },
    });
    results.push(record);
  }

  await prisma.syncDevice.update({ where: { id: deviceId }, data: { lastPushAt: new Date() } });

  const applied = results.filter((r) => r.status === 'applied').length;
  const conflicts = results.filter((r) => r.status === 'conflict').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: null,
    entityLabel: `离线同步上行 ${changes.length} 条`,
    metadata: { deviceId, applied, conflicts, rejected, entities: [...new Set(results.map((r) => r.entity))] },
  });

  return c.json({ serverTime: new Date().toISOString(), results, conflictCount: conflicts });
});

// ── 设备登记 ─────────────────────────────────────────────────────────────────
sync.post('/device', async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const deviceId = String(body?.deviceId || '').slice(0, 64);
  if (!deviceId) throw badRequest('VALIDATION_ERROR', 'deviceId 必填');
  const device = await upsertSyncDevice(auth, deviceId, body?.label, body?.platform);
  return c.json({ id: device.id, label: device.label, platform: device.platform });
});

// ── 同步状态 ─────────────────────────────────────────────────────────────────
sync.get('/status', async (c) => {
  const auth = getAuth(c);
  const devices = await prisma.syncDevice.findMany({
    where: { userId: auth.userId },
    orderBy: { lastSyncAt: 'desc' },
    select: { id: true, label: true, platform: true, lastSyncAt: true, lastPushAt: true, createdAt: true },
  });
  const [mutations, conflicts] = await Promise.all([
    prisma.syncMutation.count({ where: { userId: auth.userId } }),
    prisma.syncMutation.count({ where: { userId: auth.userId, status: 'conflict' } }),
  ]);
  return c.json({ devices, mutations, conflicts, serverTime: new Date().toISOString() });
});

export default sync;
