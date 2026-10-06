import { readAclSnapshot } from '../modules/sync/syncReadPolicy.js';
import { getActorResolver } from '../platform/identity/actorResolver.js';
import { Hono } from 'hono';
import crypto from 'node:crypto';
import { prisma } from '../platform/db/client.js';
import { authenticate as authMiddleware, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS, PROJECT_CAPABILITIES } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { badRequest, HttpError } from '../kernel/http.js';
import { projectVisibilityFilter, assertProjectCapability } from '../kernel/projectAccess.js';
import { assertProjectStatusTransition, normalizeProjectStatus } from '../modules/projects/projectCommands.js';
import {
  assertActionPermission,
  assertTaskStatusChange,
  assertTaskAssign,
  assertPhaseStatusChange,
  assertPhaseBelongsToProject,
  assertReportWritable,
  assertReportAuthority,
} from '../modules/access/writeGuards.js';
import { buildReportDraftPatch, saveReportDraft } from '../modules/reports/reportCommands.js';
import { updateTaskFields, changeTaskStatus, assignTask } from '../modules/tasks/taskCommands.js';
import { createSyncMutationCommands, parseSyncCommand, parseSyncEnvelope } from '../modules/sync/syncMutationCommands.js';

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
    fields: ['name', 'description', 'type', 'position', 'startDate', 'endDate', 'actualEndDate'],
    serverOwned: ['code', 'templateId', 'metadata', 'managerId'],
    // RF04 补齐：项目属性编辑需 projects.update（离线不支持新建，编号由服务端发号）
    readPermission: 'projects.view',
    readFields: ['id', 'code', 'name', 'type', 'subtype', 'status', 'isDraft', 'positioning', 'managerId', 'templateId', 'startDate', 'endDate', 'actualEndDate', 'createdAt', 'updatedAt', 'manager'],
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
    readPermission: 'project_phases.view',
    readFields: ['id', 'projectId', 'templatePhaseId', 'code', 'name', 'sortOrder', 'status', 'plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'progressPercent', 'isMilestone', 'notes', 'createdAt', 'updatedAt'],
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
    readPermission: 'tasks.view',
    readFields: ['id', 'projectId', 'phaseId', 'parentId', 'templateTaskId', 'code', 'title', 'description', 'assigneeId', 'status', 'priority', 'taskType', 'applicability', 'regulatoryPriority', 'expectedDeliverable', 'regulatoryNotes', 'sortOrder', 'estimatedHours', 'actualHours', 'progressPercent', 'startDate', 'dueDate', 'startedAt', 'completedAt', 'createdAt', 'updatedAt'],
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
    readPermission: 'milestones.view',
    readFields: ['id', 'projectId', 'phaseId', 'name', 'description', 'dueDate', 'status', 'completedAt', 'createdAt', 'updatedAt'],
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
    readPermission: 'progress.view',
    readFields: ['id', 'projectId', 'periodKey', 'actualWork', 'completionPercent', 'nextPlan', 'risks', 'projectStatus', 'submittedById', 'submittedAt', 'createdAt', 'updatedAt'],
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
    readPermission: 'reports.view',
    readFields: ['id', 'projectId', 'authorId', 'reportType', 'periodKey', 'periodStart', 'periodEnd', 'content', 'status', 'currentVersion', 'submittedAt', 'reviewedAt', 'reviewNote', 'createdAt', 'updatedAt'],
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
    readPermission: 'projects.view',
    readFields: ['id', 'projectId', 'userId', 'role', 'joinedAt'],
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

async function upsertSyncDevice(auth, deviceId, label, platform, db = prisma) {
  try {
    return await db.syncDevice.upsert({
      where: { id: deviceId, userId: auth.userId },
      update: { label: label ?? undefined, platform: platform ?? undefined },
      create: { id: deviceId, userId: auth.userId, label: label ?? null, platform: platform ?? null },
    });
  } catch (error) {
    // Unique-key collision with a foreign owner is not permission to relabel it.
    if (['P2002', 'P2025'].includes(error?.code)) throw new HttpError(404, 'DEVICE_NOT_FOUND', '设备不可用');
    throw error;
  }
}

/**
 * 解析同步写入所需的项目访问上下文（与普通 API 的 resolveProjectAccess 同源判定）。
 * 返回 null 表示非有效成员。
 */
async function loadSyncAccess(auth, projectId, db = prisma) {
  if (auth.systemRole === 'SUPER_ADMIN') {
    return {
      capabilities: ['read', 'write', 'delete', 'transition', 'assign', 'manage_members'],
      memberRole: null,
      isMember: true,
      elevated: true,
    };
  }
  const membership = await db.projectMember.findUnique({
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
async function assertSyncEntityActions({ entity, def, existing, data, auth, access, projectId, op, rawData, db = prisma }) {
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

  if (entity === 'projects') {
    if (op !== 'delete' && Object.prototype.hasOwnProperty.call(rawData, 'managerId')) {
      throw badRequest('DECISION_REQUIRED', '项目负责人变更需按批准的负责人转移命令执行');
    }
    if (op !== 'delete' && Object.prototype.hasOwnProperty.call(rawData, 'status')) {
      if (!existing) throw badRequest('INVALID_REFERENCE', '离线项目状态命令需要已存在的项目');
      data.status = assertProjectStatusTransition({
        actor: auth,
        access,
        currentStatus: existing.status,
        nextStatus: rawData.status,
      });
    }
    return;
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
      await assertPhaseBelongsToProject(db, data.phaseId, projectId);
    }
    if (op !== 'delete' && data.parentId !== undefined && data.parentId !== null) {
      if (typeof data.parentId !== 'string' || !data.parentId.trim() || data.parentId === existing?.id) {
        throw badRequest('INVALID_REFERENCE', 'parentId 无效', { field: 'parentId', projectId });
      }
      const parent = await db.task.findUnique({ where: { id: data.parentId }, select: { id: true, projectId: true } });
      if (!parent || parent.projectId !== projectId) {
        throw badRequest('INVALID_REFERENCE', 'parentId 不属于该项目', { field: 'parentId', projectId });
      }
    }
    return;
  }

  if (entity === 'milestones' && data.phaseId !== undefined && data.phaseId !== null) {
    await assertPhaseBelongsToProject(db, data.phaseId, projectId);
    return;
  }

  if (entity === 'projectPhases' && existing
    && data.status !== undefined && data.status !== existing.status) {
    assertPhaseStatusChange(auth, access);
  }
}

const SYNC_UPSERT_PAGE_SIZE = 3000;
const SYNC_TOMBSTONE_PAGE_SIZE = 5000;
// Production binds page tokens to the configured auth secret. The process-local
// fallback is only useful in development; a restart invalidates in-flight pages
// safely because the client has not advanced its durable cursor yet.
const SYNC_PAGE_TOKEN_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function signPageState(state) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = crypto.createHmac('sha256', SYNC_PAGE_TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readPageState(token, auth, deviceId) {
  if (token.length > 8192) throw badRequest('SYNC_PAGE_TOKEN_INVALID', '分页令牌无效');
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) throw badRequest('SYNC_PAGE_TOKEN_INVALID', '分页令牌无效');
  const expected = crypto.createHmac('sha256', SYNC_PAGE_TOKEN_SECRET).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { actual = Buffer.alloc(0); }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw badRequest('SYNC_PAGE_TOKEN_INVALID', '分页令牌无效');
  }
  let state;
  try { state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch {
    throw badRequest('SYNC_PAGE_TOKEN_INVALID', '分页令牌无效');
  }
  if (state?.version !== 1 || state.actorId !== auth.userId || state.deviceId !== deviceId
    || !Array.isArray(state.cursors ? Object.keys(state.cursors) : null)) {
    throw badRequest('SYNC_PAGE_TOKEN_INVALID', '分页令牌与当前用户或设备不匹配');
  }
  const since = new Date(state.since);
  const upperBound = new Date(state.upperBound);
  if (Number.isNaN(since.getTime()) || Number.isNaN(upperBound.getTime()) || upperBound < since) {
    throw badRequest('SYNC_PAGE_TOKEN_INVALID', '分页令牌时间范围无效');
  }
  return { ...state, since, upperBound };
}

function streamPageWhere(scopeWhere, aliveFilter, timestampField, since, upperBound, last) {
  const and = [
    scopeWhere,
    aliveFilter,
    { [timestampField]: { gt: since, lte: upperBound } },
  ];
  if (last) {
    const timestamp = new Date(last.timestamp);
    if (!last.id || Number.isNaN(timestamp.getTime()) || timestamp < since || timestamp > upperBound) {
      throw badRequest('SYNC_PAGE_TOKEN_INVALID', '分页位置无效');
    }
    and.push({ OR: [
      { [timestampField]: { gt: timestamp } },
      { [timestampField]: timestamp, id: { gt: last.id } },
    ] });
  }
  return { AND: and };
}

// ── 增量拉取 ─────────────────────────────────────────────────────────────────
sync.get('/init', async (c) => {
  return prisma.$transaction(async (db) => {
  const { auth, acl } = await readAclSnapshot(db, getAuth(c), Boolean(getActorResolver()));
  const sinceRaw = c.req.query('since');
  const deviceId = String(c.req.query('deviceId') || '').slice(0, 64);
  const pageToken = c.req.query('pageToken');
  let pageState;
  if (pageToken) {
    pageState = readPageState(pageToken, auth, deviceId);
    if (sinceRaw) {
      const requestedSince = new Date(sinceRaw);
      if (Number.isNaN(requestedSince.getTime()) || requestedSince.toISOString() !== pageState.since.toISOString()) {
        throw badRequest('SYNC_PAGE_TOKEN_INVALID', '分页令牌与 since 不匹配');
      }
    }
  } else {
    let since = new Date(0);
    if (sinceRaw) {
      since = new Date(sinceRaw);
      if (Number.isNaN(since.getTime())) throw badRequest('VALIDATION_ERROR', 'since 非法（需 ISO 时间）');
    }
    const upperBound = new Date();
    pageState = {
      version: 1,
      actorId: auth.userId,
      deviceId,
      since: since.toISOString(),
      checkpoint: since.toISOString(),
      upperBound: upperBound.toISOString(),
      full: !sinceRaw,
      cursors: {},
    };
    pageState.since = since;
    pageState.upperBound = upperBound;
  }
  if (pageToken && pageState.aclVersion !== acl.aclVersion) {
    throw new HttpError(409, 'SYNC_ACL_CHANGED', '当前授权已变化，请保全待提交原文并重新获取快照');
  }
  if (!pageToken && sinceRaw && c.req.query('aclVersion') !== acl.aclVersion) {
    pageState.since = new Date(0); pageState.full = true;
  }
  acl.writePolicy = Object.fromEntries(ENTITY_KEYS.map((entity) => {
    const def = SYNC_ENTITIES[entity];
    return [entity, { read: def.readPermission, update: def.permission, create: def.createPermission ?? null,
      delete: def.deletePermission, status: def.statusPermission ?? (entity === 'projects' ? 'projects.change_status' : null),
      assign: def.assignPermission ?? null, capability: def.requireCapability ?? (entity === 'monthlyProgress' ? 'manage_members' : 'write') }];
  }));
  pageState.aclVersion = acl.aclVersion;
  const { since, upperBound } = pageState;
  const projectIds = acl.projectIds;
  const projectIdSet = new Set(projectIds);

  const changes = {};
  const nextCursors = { ...(pageState.cursors ?? {}) };
  let hasMore = false;
  for (const [entity, def] of Object.entries(SYNC_ENTITIES)) {
    if (!auth.permissions.includes(def.readPermission)) {
      changes[entity] = { upserts: [], tombstones: [] };
      continue;
    }
    const scopeWhere = {};
    if (def.scope === 'byProject') scopeWhere.projectId = { in: projectIds };
    if (def.scope === 'projectSelf') scopeWhere.id = { in: projectIds };
    if (def.ownOnly) scopeWhere.authorId = auth.userId;

    const aliveFilter = def.tombstoneField === 'leftAt'
      ? { leftAt: null }
      : { deletedAt: null };
    const tsField = def.timestampField ?? 'updatedAt';

    // eslint-disable-next-line no-await-in-loop
    const entityCursors = nextCursors[entity] ?? {};
    const upsertRows = await db[def.model].findMany({
      where: streamPageWhere(scopeWhere, aliveFilter, tsField, since, upperBound, entityCursors.upsert),
      ...(def.include ? { include: def.include } : {}),
      orderBy: [{ [tsField]: 'asc' }, { id: 'asc' }],
      take: SYNC_UPSERT_PAGE_SIZE + 1,
    });
    const upsertHasMore = upsertRows.length > SYNC_UPSERT_PAGE_SIZE;
    const upserts = upsertRows.slice(0, SYNC_UPSERT_PAGE_SIZE).map((row) => pickFields(row, def.readFields));
    if (upserts.length > 0) {
      const last = upserts.at(-1);
      entityCursors.upsert = { timestamp: last[tsField].toISOString(), id: last.id };
    }
    if (upsertHasMore) {
      hasMore = true;
    }

    // eslint-disable-next-line no-await-in-loop
    const removedRows = await db[def.model].findMany({
      where: streamPageWhere(scopeWhere, { [def.tombstoneField]: { not: null } }, def.tombstoneField, since, upperBound, entityCursors.tombstone),
      select: { id: true, [def.tombstoneField]: true },
      orderBy: [{ [def.tombstoneField]: 'asc' }, { id: 'asc' }],
      take: SYNC_TOMBSTONE_PAGE_SIZE + 1,
    });
    const tombstoneHasMore = removedRows.length > SYNC_TOMBSTONE_PAGE_SIZE;
    const removed = removedRows.slice(0, SYNC_TOMBSTONE_PAGE_SIZE);
    if (removed.length > 0) {
      const last = removed.at(-1);
      entityCursors.tombstone = { timestamp: last[def.tombstoneField].toISOString(), id: last.id };
    }
    if (tombstoneHasMore) {
      hasMore = true;
    }
    nextCursors[entity] = entityCursors;

    changes[entity] = { upserts, tombstones: removed.map((r) => r.id) };
  }

  const serverTime = upperBound.toISOString();
  if (deviceId && !hasMore) {
    await upsertSyncDevice(auth, deviceId, c.req.query('deviceLabel'), c.req.query('platform'), db);
    await db.syncDevice.update({ where: { id: deviceId, userId: auth.userId }, data: { lastSyncAt: new Date() } });
  }

  const nextPageToken = hasMore ? signPageState({ ...pageState, cursors: nextCursors }) : null;
  if (hasMore && !pageToken && c.req.query('paginationVersion') !== '1') {
    throw new HttpError(409, 'SYNC_PAGINATION_REQUIRED', '同步结果超过单页上限，请升级支持 keyset pagination 的客户端后重试');
  }

  return c.json({
    serverTime,
    // Before the last page, old clients retain their prior checkpoint and safely replay page one.
    cursor: hasMore ? (pageState.checkpoint ?? since.toISOString()) : upperBound.toISOString(),
    full: pageState.full,
    pagination: { hasMore, nextPageToken },
    acl,
    entities: ENTITY_KEYS,
    changes,
  });
  }, { isolationLevel: 'RepeatableRead' });
});

// ── 预约回执协议 v1（旧无预约写入安全拒绝；不修改拉取协议） ──
async function authorizeSyncCommand(tx, actor, command) {
  const def = SYNC_ENTITIES[command.entity];
  const existing = await tx[def.model].findUnique({ where: { id: command.id } });
  const projectId = def.scope === 'projectSelf' ? command.id : existing?.projectId ?? command.projectId;
  if (projectId !== command.projectId) throw new HttpError(404, 'RECEIPT_UNAVAILABLE', '回执不可用');
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, deletedAt: true } });
  if (!project || project.deletedAt) throw new HttpError(404, 'RECEIPT_UNAVAILABLE', '回执不可用');
  const access = await loadSyncAccess(actor, projectId, tx);
  if (!access) throw new HttpError(404, 'RECEIPT_UNAVAILABLE', '回执不可用');
  assertProjectCapability(access, def.requireCapability ?? 'write', def.permission ?? 'sync.write');
  if (def.ownOnly && existing) assertReportAuthority(existing, actor, access, def.permission);
  if (def.ownOnly && !existing && command.op === 'delete') throw new HttpError(404, 'RECEIPT_UNAVAILABLE', '回执不可用');
  const data = pickFields(command.data, def.fields);
  const requiredPermissions = [];
  const requiredCapabilities = [def.requireCapability ?? 'write'];
  if (command.op === 'delete') {
    if (!def.deletePermission) throw new HttpError(403, 'SYNC_DELETE_NOT_SUPPORTED', '不支持此实体离线删除');
    assertActionPermission(actor, def.deletePermission);
    requiredPermissions.push(def.deletePermission);
  } else {
    // Before scoped lookup require some current write authority. After lookup,
    // the stored original action's exact permissions/capabilities are checked.
    const alternatives = [def.permission, def.createPermission].filter(Boolean);
    if (!alternatives.some((p) => actor.permissions.includes(p))) throw new HttpError(403, 'PERMISSION_DENIED', '缺少实体写权限');
    requiredPermissions.push(existing ? def.permission : def.createPermission ?? def.permission);
    if (command.entity === 'tasks') {
      if (existing && data.status !== undefined && data.status !== existing.status) {
        requiredPermissions.push('tasks.change_status'); requiredCapabilities.push('transition');
      }
      if (existing && data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
        requiredPermissions.push('tasks.assign'); requiredCapabilities.push('assign');
      }
    }
    if (command.entity === 'projectPhases' && existing && data.status !== undefined && data.status !== existing.status) {
      requiredPermissions.push('project_phases.change_status'); requiredCapabilities.push('transition');
    }
    if (command.entity === 'projects' && Object.hasOwn(command.data, 'status') && normalizeProjectStatus(command.data.status) !== existing?.status) {
      requiredCapabilities.push('transition');
      if (normalizeProjectStatus(command.data.status) === 'ARCHIVED') requiredPermissions.push('projects.archive');
    }
  }
  return { existing, data, access, requiredPermissions, requiredCapabilities };
}

async function executeSyncCommand(tx, actor, command, context) {
  const { entity, id, op, projectId } = command;
  const def = SYNC_ENTITIES[entity];
  const { existing, data, access } = context;
  await assertSyncEntityActions({ entity, def, existing, data, auth: actor, access, projectId, op, rawData: command.data, db: tx });
  const tsField = def.timestampField ?? 'updatedAt';
  const casFilter = existing ? { [tsField]: existing[tsField] } : undefined;
  if (op !== 'delete' && existing && command.baseUpdatedAt && new Date(existing[tsField]) > new Date(command.baseUpdatedAt)) {
    return { status: 'conflict', reason: '服务端已有更新', server: { id, updatedAt: existing[tsField], ...pickFields(existing, def.fields) } };
  }
  if (op === 'delete') {
    if (!existing || existing[def.tombstoneField]) return { status: 'applied', action: 'noop', serverUpdatedAt: existing?.[tsField] ?? null };
    const deleted = await tx[def.model].updateMany({ where: { id, [def.tombstoneField]: null },
      data: { [def.tombstoneField]: new Date(), ...(def.touchUpdatedBy ? { updatedById: actor.userId } : {}) } });
    if (deleted.count !== 1) throw new HttpError(409, 'CONFLICT', '删除状态已变化');
    const row = await tx[def.model].findUnique({ where: { id } });
    return { status: 'applied', action: 'deleted', serverUpdatedAt: row[tsField] };
  }
  if (!existing && !def.createAllowed) throw badRequest('VALIDATION_ERROR', '不支持离线新建');
  for (const owned of def.serverOwned) delete data[owned];
  if (def.derive) def.derive(data);
  let row;
  if (existing && entity === 'reports') {
    row = await saveReportDraft(tx, { actor, reportId: id, patch: data, cas: casFilter });
  } else if (existing && entity === 'tasks') {
    const nextStatus = data.status; const statusChanging = nextStatus !== undefined && nextStatus !== existing.status;
    const assigneeChanging = data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId;
    const nextAssignee = data.assigneeId ?? null;
    delete data.status; delete data.assigneeId;
    let casConsumed = false;
    const nextCas = () => { if (casConsumed) return undefined; casConsumed = true; return casFilter; };
    if (Object.keys(data).length) await updateTaskFields(tx, { actor, access, task: existing, fields: data, cas: nextCas() });
    if (statusChanging) await changeTaskStatus(tx, { actor, access, task: existing, status: nextStatus, cas: nextCas() });
    if (assigneeChanging) await assignTask(tx, { actor, access, task: existing, assigneeId: nextAssignee, cas: nextCas() });
    row = await tx.task.findUnique({ where: { id } });
  } else if (existing) {
    const changed = await tx[def.model].updateMany({ where: { id, ...casFilter }, data: { ...data, ...(def.touchUpdatedBy ? { updatedById: actor.userId } : {}) } });
    if (changed.count !== 1) throw new HttpError(409, 'CONFLICT', '并发基线已变化');
    row = await tx[def.model].findUnique({ where: { id } });
  } else {
    const createData = { ...data, id, ...(def.scope === 'byProject' ? { projectId } : {}) };
    if (entity === 'reports') createData.authorId = actor.userId;
    if (entity === 'monthlyProgress') createData.submittedById = actor.userId;
    if (def.touchUpdatedBy) createData.createdById = actor.userId;
    row = await tx[def.model].create({ data: createData });
  }
  return { status: 'applied', action: existing ? 'updated' : 'created', serverUpdatedAt: row?.[tsField] };
}

function syncCommands() {
  return createSyncMutationCommands(prisma, { authorize: authorizeSyncCommand, execute: executeSyncCommand });
}

sync.post('/receipts/reserve', async (c) => {
  if (process.env.RDPMS_SYNC_WRITE_DISABLED === 'true') throw new HttpError(503, 'SYNC_WRITES_DISABLED', '同步写入已安全停用；保留原副本并查询既有回执');
  const { deviceId, changes } = parseSyncEnvelope(await c.req.json().catch(() => null));
  const commands = changes.map((raw) => parseSyncCommand(raw, SYNC_ENTITIES));
  const results = [];
  for (const command of commands) results.push(await syncCommands().reserve(getAuth(c).userId, deviceId, command));
  return c.json({ protocolVersion: 1, results });
});

sync.post('/receipts/query', async (c) => {
  const { deviceId, changes } = parseSyncEnvelope(await c.req.json().catch(() => null));
  const commands = changes.map((raw) => parseSyncCommand(raw, SYNC_ENTITIES));
  const results = [];
  for (const command of commands) results.push(await syncCommands().query(getAuth(c).userId, deviceId, command));
  return c.json({ protocolVersion: 1, results });
});

sync.post('/push', async (c) => {
  if (process.env.RDPMS_SYNC_WRITE_DISABLED === 'true') throw new HttpError(503, 'SYNC_WRITES_DISABLED', '同步写入已安全停用；保留原副本并查询既有回执');
  const { deviceId, changes } = parseSyncEnvelope(await c.req.json().catch(() => null));
  const commands = changes.map((raw) => parseSyncCommand(raw, SYNC_ENTITIES));
  const results = [];
  for (const command of commands) {
    try { results.push(await syncCommands().push(getAuth(c).userId, deviceId, command, c)); }
    catch (error) {
      // Validation/authorization failures leave reservation unchanged. Unexpected
      // audit/receipt/SQL faults escape, preserving prior committed batch items.
      if (!(error instanceof HttpError)) throw error;
      results.push({ clientMutationId: command.clientMutationId, entity: command.entity, id: command.id,
        op: command.op, status: error.code === 'CONFLICT' ? 'conflict' : 'rejected', code: error.code, httpStatus: error.status });
    }
  }
  // Metadata is not part of the per-item business commit. A failure here may be
  // a 500 after committed items; exact receipt queries reconstruct those items.
  if (commands.length) await prisma.syncDevice.updateMany({ where: { id: deviceId, userId: getAuth(c).userId }, data: { lastPushAt: new Date() } });
  const status = results.length === 1 && results[0].httpStatus ? results[0].httpStatus : 200;
  return c.json({ protocolVersion: 1, serverTime: new Date().toISOString(), results,
    conflictCount: results.filter((r) => r.status === 'conflict').length }, status);
});

// ── 设备登记 ─────────────────────────────────────────────────────────────────
sync.post('/device', async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const deviceId = body?.deviceId;
  if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 64) throw badRequest('VALIDATION_ERROR', 'deviceId 必须是最多64字符的非空字符串');
  if ([body?.label, body?.platform].some((value) => value !== undefined && value !== null && typeof value !== 'string')) throw badRequest('VALIDATION_ERROR', '设备元数据必须是字符串');
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
