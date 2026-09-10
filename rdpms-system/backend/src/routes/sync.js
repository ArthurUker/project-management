import { Hono } from 'hono';
import crypto from 'node:crypto';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS, PROJECT_CAPABILITIES } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest } from '../kernel/http.js';
import { projectVisibilityFilter } from '../kernel/projectAccess.js';

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
  },
  tasks: {
    model: 'task',
    scope: 'byProject',
    createAllowed: true,
    tombstoneField: 'deletedAt',
    touchUpdatedBy: true,
    fields: ['title', 'description', 'status', 'priority', 'assigneeId', 'phaseId', 'parentId', 'taskType', 'applicability', 'regulatoryPriority', 'expectedDeliverable', 'regulatoryNotes', 'sortOrder', 'estimatedHours', 'actualHours', 'progressPercent', 'startDate', 'dueDate'],
    serverOwned: ['code', 'completedAt', 'startedAt'],
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
  },
  projectMembers: {
    model: 'projectMember',
    scope: 'byProject',
    createAllowed: true,
    tombstoneField: 'leftAt', // 软退出：leftAt 非空即视为已移除
    touchUpdatedBy: false,
    fields: ['role'],
    serverOwned: [],
    requireCapability: 'manage_members', // 成员调整需要管理成员能力
  },
};

const ENTITY_KEYS = Object.keys(SYNC_ENTITIES);

function pickFields(raw, allowed) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of allowed) if (raw[key] !== undefined) out[key] = raw[key];
  return out;
}

async function ensureDevice(auth, deviceId, label, platform) {
  return prisma.syncDevice.upsert({
    where: { id: deviceId },
    update: { label: label ?? undefined, platform: platform ?? undefined },
    create: { id: deviceId, userId: auth.userId, label: label ?? null, platform: platform ?? null },
  });
}

/** 项目写入能力判定：SUPER_ADMIN 直通；其余需为有效成员且具备 write（或指定能力） */
async function assertProjectWrite(auth, projectId, capability = 'write') {
  if (auth.systemRole === 'SUPER_ADMIN') return;
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: auth.userId } },
    select: { role: true, leftAt: true },
  });
  const ok = membership && membership.leftAt === null
    && (PROJECT_CAPABILITIES[membership.role] ?? []).includes(capability);
  if (!ok) {
    const err = new Error(`当前项目角色不具备 ${capability} 能力`);
    err.syncRejected = true;
    throw err;
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

    // eslint-disable-next-line no-await-in-loop
    const upserts = await prisma[def.model].findMany({
      where: { ...scopeWhere, ...aliveFilter, updatedAt: { gt: since } },
      ...(def.include ? { include: def.include } : {}),
      orderBy: { updatedAt: 'asc' },
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
    await ensureDevice(auth, deviceId, c.req.query('deviceLabel'), c.req.query('platform'));
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

  await ensureDevice(auth, deviceId, body?.deviceLabel, body?.platform);

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

      const projectId = def.scope === 'projectSelf'
        ? (existing?.id ?? entityId)
        : (existing?.projectId ?? data.projectId);

      if (!projectId || !accessible.has(projectId)) {
        outcome = { status: 'rejected', reason: '无权访问该数据所属项目' };
      } else if (def.ownOnly && existing && existing.authorId !== auth.userId) {
        outcome = { status: 'rejected', reason: '无权修改他人汇报' };
      } else {
        // eslint-disable-next-line no-await-in-loop
        await assertProjectWrite(auth, projectId, def.requireCapability ?? 'write');

        // 冲突检测：客户端基线早于服务端 updatedAt
        if (op !== 'delete' && existing && raw?.baseUpdatedAt
          && new Date(existing.updatedAt) > new Date(raw.baseUpdatedAt)) {
          outcome = {
            status: 'conflict',
            reason: '服务端已有更新',
            server: { id: existing.id, updatedAt: existing.updatedAt, ...pickFields(existing, def.fields) },
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
            outcome = { status: 'applied', action: 'deleted', serverUpdatedAt: updated.updatedAt };
          }
        } else if (!existing && !def.createAllowed) {
          outcome = { status: 'rejected', reason: `${entity} 不支持离线新建` };
        } else {
          // 服务端权威字段一律剔除；补充归属
          for (const owned of def.serverOwned) delete data[owned];
          if (def.derive) def.derive(data);

          if (existing) {
            // eslint-disable-next-line no-await-in-loop
            const updated = await prisma[def.model].update({
              where: { id: entityId },
              data: { ...data, ...(def.touchUpdatedBy ? { updatedById: auth.userId } : {}) },
            });
            outcome = { status: 'applied', action: 'updated', serverUpdatedAt: updated.updatedAt };
          } else {
            const createData = { ...data, id: entityId };
            if (entity === 'reports') createData.authorId = auth.userId;
            if (entity === 'monthlyProgress') createData.submittedById = auth.userId;
            if (def.touchUpdatedBy) createData.createdById = auth.userId;
            if (def.scope === 'byProject' && !createData.projectId) createData.projectId = projectId;
            // eslint-disable-next-line no-await-in-loop
            const created = await prisma[def.model].create({ data: createData });
            outcome = { status: 'applied', action: 'created', serverUpdatedAt: created.updatedAt };
          }
        }
      }
    } catch (err) {
      outcome = { status: 'rejected', reason: err?.message || '写入失败' };
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
  const device = await ensureDevice(auth, deviceId, body?.label, body?.platform);
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
