import { applyProjectChildren } from '../modules/projects/projectChildren.js';
import { registrationActor as currentProjectActor } from '../modules/projects/registrationAccess.js';
import { Hono } from 'hono';
import { prisma } from '../platform/db/client.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed, pickForCreate } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
import { assertActionPermission } from '../modules/access/writeGuards.js';
import { assertProjectStatusTransition, PROJECT_STATUS_TRANSITIONS, transferProjectManager, managerTransferId } from '../modules/projects/projectCommands.js';
import { withIdempotency, resolveIdempotencyKey } from '../platform/idempotency/receipts.js';
import { writeAuditStrict } from '../platform/audit/strictAudit.js';
import {
  resolveProjectAccess,
  assertProjectCapability,
  auditElevatedIfNeeded,
  projectVisibilityFilter,
} from '../kernel/projectAccess.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/projects —— PostgreSQL baseline 口径（W10 路由层迁移）+ 项目权限 ∩ 模型全量接入。
 *
 * 枚举口径（schema.prisma 为唯一真源）：
 *   ProjectStatus   PLANNING/IN_PROGRESS/PENDING_PROCESSING/PENDING_VERIFICATION/ON_HOLD/COMPLETED/ARCHIVED/CANCELLED
 *   ProjectMemberRole OWNER/MANAGER/MEMBER/VIEWER（旧 'manager'/'member' 小写值已废弃）
 *   TaskStatus      NOT_STARTED/IN_PROGRESS/COMPLETED/BLOCKED/CANCELLED（旧 '待开始' 等中文值已废弃）
 *   TaskPriority    LOW/MEDIUM/HIGH/URGENT（旧 '中' 等中文值已废弃）
 *   Milestone.date  → dueDate；Milestone.phaseName 字段已删除（阶段归属走 phaseId）
 *   User.name       → displayName；User.avatar → avatarFileId
 *   Project.type    仅接受 ProjectType 枚举值；注册类项目以 subtype='registration' 标识（旧 type='项目注册管理' 已废弃）
 */
const projects = new Hono();

projects.use('*', authMiddleware);

/** Ordinary project list/statistics combine visibility with the live-row scope. */
function activeProjectVisibilityWhere(auth) {
  return {
    AND: [
      projectVisibilityFilter(auth) ?? {},
      { deletedAt: null },
    ],
  };
}

/** Business fields are loaded separately from the narrow authorization projection. */
async function loadProjectBusinessSnapshot(id, select) {
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select,
  });
  if (!project) throw notFound('PROJECT_NOT_FOUND', '项目不存在');
  return project;
}

// 旧中文状态 → 新枚举（仅用于入参归一化，数据库中禁止出现中文状态值）
const LEGACY_STATUS_MAP = {
  '草稿': 'PLANNING',
  '规划中': 'PLANNING',
  '进行中': 'IN_PROGRESS',
  '待加工': 'PENDING_PROCESSING',
  '待验证': 'PENDING_VERIFICATION',
  '暂停': 'ON_HOLD',
  '已完成': 'COMPLETED',
  '已归档': 'ARCHIVED',
  '已取消': 'CANCELLED',
};
const normalizeStatus = (v) => LEGACY_STATUS_MAP[v] ?? v;

const LEGACY_PRIORITY_MAP = { '低': 'LOW', '中': 'MEDIUM', '高': 'HIGH', '紧急': 'URGENT' };
const normalizePriority = (v) => LEGACY_PRIORITY_MAP[v] ?? v;

// ProjectType 枚举规范化：前端「创建项目」下拉历史上提交的是中文标签（platform/定制/合作/测试/应用），
// 直接透传会触发 Prisma enum 校验失败 → 500（线上实机发现：type='定制' 建项目必 500）。
// 注：'科技项目' 无对应枚举值，暂归 CUSTOMIZATION（待业务确认）。
const LEGACY_PROJECT_TYPE_MAP = {
  platform: 'PLATFORM', '平台': 'PLATFORM',
  '定制': 'CUSTOMIZATION', '科技项目': 'CUSTOMIZATION',
  '合作': 'COLLABORATION',
  '测试': 'TESTING',
  '应用': 'APPLICATION',
};
const PROJECT_TYPE_VALUES = new Set(['PLATFORM', 'CUSTOMIZATION', 'COLLABORATION', 'TESTING', 'APPLICATION']);
function normalizeProjectType(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (PROJECT_TYPE_VALUES.has(upper)) return upper;
  return LEGACY_PROJECT_TYPE_MAP[raw] ?? LEGACY_PROJECT_TYPE_MAP[raw.toLowerCase()] ?? null;
}

// 用户请求体共享的 select/include 片段
const MANAGER_SELECT = { select: { id: true, displayName: true, position: true, avatarFileId: true } };
const MEMBER_INCLUDE = {
  include: {
    user: { select: { id: true, displayName: true, position: true, department: true, avatarFileId: true } },
  },
};

/** 将任务入参（可能为旧中文口径）归一为新枚举 */
function normalizeTaskInput(t, idx) {
  return {
    title: t.title || `Task ${idx + 1}`,
    description: t.description || null,
    status: normalizeStatus(t.status) || 'NOT_STARTED',
    priority: normalizePriority(t.priority) || 'MEDIUM',
    taskType: t.taskType || null,
    applicability: (t.applicability || t.applicabilityStatus || 'required').toUpperCase(),
    regulatoryPriority: t.regulatoryPriority || null,
    expectedDeliverable: t.expectedDeliverable || null,
    regulatoryNotes: t.regulatoryNotes || null,
    dueDate: t.dueDate ? new Date(t.dueDate) : null,
    assigneeId: t.assigneeId || null,
    phaseKey: t.phaseId || t.phaseKey || null, // 模板阶段引用键，落库前映射为 ProjectPhase.id
    sortOrder: t.sortOrder ?? t.phaseOrder ?? idx,
  };
}

const TASK_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED']);
const TASK_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const TASK_TYPES = new Set([
  'CLASSIFICATION', 'STRATEGY', 'REGISTRATION_DOSSIER', 'LABELING', 'QMS',
  'CLINICAL_EVALUATION', 'CLINICAL_EVALUATION_EXEMPTION', 'CLINICAL_TRIAL',
  'ANALYTICAL_VALIDATION', 'PERFORMANCE_VALIDATION', 'SOFTWARE', 'SUBMISSION',
  'POST_MARKET', 'DESIGN_INPUT', 'DESIGN_OUTPUT', 'PRODUCTION', 'STABILITY', 'OTHER',
]);
const TASK_APPLICABILITIES = new Set(['REQUIRED', 'CONDITIONAL', 'NOT_APPLICABLE', 'TO_BE_CONFIRMED']);
const REGULATORY_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3', 'P4']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseOptionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest('VALIDATION_ERROR', `${field} 日期无效`);
  return date;
}

/**
 * RP04-T02 / B18（LR2-02）：顶层标量在 normalize 与 ORM **之前**受控检查。
 *
 * 目的：subtype 对象、type 数组、boolean 日期等非法输入必须明确 400，
 * 既不能进 Prisma 后 500，也不能被 String()/new Date() 静默强制成合法值
 * （`String(['TESTING']) === 'TESTING'`、`new Date(false) === 1970-01-01`）。
 *
 * 边界按当前客户端与 DTO 的实际调用登记：日期为 ISO 字符串或 null/''；
 * 数字 epoch 不在当前契约内（若需支持须另行批准）。metadata 维持 JSON 合同，不加新约束。
 */
const TOP_LEVEL_STRING_FIELDS = ['name', 'type', 'subtype', 'positioning', 'managerId', 'templateId'];

function assertTopLevelScalar(value, field) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `${field} 必须是字符串`, { field });
}

function parseTopLevelDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw badRequest('VALIDATION_ERROR', `${field} 必须是字符串日期`, { field });
  }
  return parseOptionalDate(value, field);
}

function assertTopLevelProjectScalars(raw) {
  for (const field of TOP_LEVEL_STRING_FIELDS) assertTopLevelScalar(raw[field], field);
  if (raw.isDraft !== undefined && typeof raw.isDraft !== 'boolean') {
    throw badRequest('VALIDATION_ERROR', 'isDraft 必须是布尔值', { field: 'isDraft' });
  }
  if (raw.startDate !== undefined) parseTopLevelDate(raw.startDate, 'startDate');
  if (raw.endDate !== undefined) parseTopLevelDate(raw.endDate, 'endDate');
}

/** Validate the whole aggregate command before allocating a sequence or writing rows. */
function validateProjectCreateCommand(raw, auth) {
  if (!isRecord(raw)) throw badRequest('VALIDATION_ERROR', '创建项目: 请求体必须是 JSON 对象');
  assertTopLevelProjectScalars(raw);
  if (Object.prototype.hasOwnProperty.call(raw, 'code')) {
    throw badRequest('VALIDATION_ERROR', 'code 由服务端统一发号，禁止客户端提交');
  }
  const data = pickForCreate(raw, [
    'name', 'type', 'subtype', 'positioning', 'managerId', 'startDate', 'endDate',
    'templateId', 'isDraft', 'metadata',
  ], raw.isDraft === true ? [] : ['name'], { entityLabel: '创建项目' });
  const tasks = raw.tasks ?? [];
  const milestones = raw.milestones ?? [];
  const participantIds = raw.participantIds ?? [];
  if (!Array.isArray(tasks) || !tasks.every(isRecord)) throw badRequest('VALIDATION_ERROR', 'tasks 必须是对象数组');
  if (!Array.isArray(milestones) || !milestones.every(isRecord)) throw badRequest('VALIDATION_ERROR', 'milestones 必须是对象数组');
  if (!Array.isArray(participantIds) || !participantIds.every((id) => typeof id === 'string' && id.trim())) {
    throw badRequest('VALIDATION_ERROR', 'participantIds 必须是非空字符串数组');
  }
  if (data.type !== undefined && !normalizeProjectType(data.type)) throw badRequest('VALIDATION_ERROR', '项目类型无效');
  if (data.name !== undefined && (typeof data.name !== 'string' || !data.name.trim())) throw badRequest('VALIDATION_ERROR', '项目名称无效');
  for (const field of ['managerId', 'templateId']) {
    if (data[field] !== undefined && data[field] !== null && typeof data[field] !== 'string') {
      throw badRequest('VALIDATION_ERROR', `${field} 无效`);
    }
  }
  if (data.isDraft !== undefined && typeof data.isDraft !== 'boolean') throw badRequest('VALIDATION_ERROR', 'isDraft 必须是布尔值');
  data.startDate = parseOptionalDate(data.startDate, 'startDate');
  data.endDate = parseOptionalDate(data.endDate, 'endDate');
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    throw badRequest('VALIDATION_ERROR', 'endDate 不能早于 startDate');
  }
  const managerId = data.managerId || auth.userId;
  const normalizedTasks = tasks.map((task, idx) => {
    const taskStringFields = [
      'title', 'description', 'status', 'priority', 'taskType', 'applicability',
      'applicabilityStatus', 'regulatoryPriority', 'expectedDeliverable', 'regulatoryNotes',
      'assigneeId', 'phaseId', 'phaseKey',
    ];
    for (const field of taskStringFields) {
      if (task[field] !== undefined && task[field] !== null && typeof task[field] !== 'string') {
        throw badRequest('VALIDATION_ERROR', `tasks[${idx}].${field} 必须是字符串`);
      }
    }
    for (const field of ['sortOrder', 'phaseOrder']) {
      if (task[field] !== undefined && task[field] !== null
        && (!Number.isInteger(task[field]) || task[field] < 0)) {
        throw badRequest('VALIDATION_ERROR', `tasks[${idx}].${field} 无效`);
      }
    }
    if (task.dueDate !== undefined && task.dueDate !== null && task.dueDate !== ''
      && typeof task.dueDate !== 'string' && typeof task.dueDate !== 'number') {
      throw badRequest('VALIDATION_ERROR', `tasks[${idx}].dueDate 无效`);
    }
    const item = normalizeTaskInput(task, idx);
    if (typeof item.title !== 'string' || !item.title.trim()) throw badRequest('VALIDATION_ERROR', `tasks[${idx}].title 无效`);
    if (!TASK_STATUSES.has(item.status)) throw badRequest('VALIDATION_ERROR', `tasks[${idx}].status 无效`);
    if (!TASK_PRIORITIES.has(item.priority)) throw badRequest('VALIDATION_ERROR', `tasks[${idx}].priority 无效`);
    if (item.taskType !== null && !TASK_TYPES.has(item.taskType)) throw badRequest('VALIDATION_ERROR', `tasks[${idx}].taskType 无效`);
    if (!TASK_APPLICABILITIES.has(item.applicability)) throw badRequest('VALIDATION_ERROR', `tasks[${idx}].applicability 无效`);
    if (item.regulatoryPriority !== null && !REGULATORY_PRIORITIES.has(item.regulatoryPriority)) throw badRequest('VALIDATION_ERROR', `tasks[${idx}].regulatoryPriority 无效`);
    for (const [field, value] of Object.entries({ description: item.description, expectedDeliverable: item.expectedDeliverable, regulatoryNotes: item.regulatoryNotes })) {
      if (value !== null && typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `tasks[${idx}].${field} 无效`);
    }
    if (item.phaseKey !== null && (typeof item.phaseKey !== 'string' || !item.phaseKey.trim())) throw badRequest('VALIDATION_ERROR', `tasks[${idx}].phaseId 无效`);
    if (item.assigneeId !== null && typeof item.assigneeId !== 'string') throw badRequest('VALIDATION_ERROR', `tasks[${idx}].assigneeId 无效`);
    if (!Number.isInteger(item.sortOrder) || item.sortOrder < 0) throw badRequest('VALIDATION_ERROR', `tasks[${idx}].sortOrder 无效`);
    item.dueDate = parseOptionalDate(task.dueDate, `tasks[${idx}].dueDate`);
    item.assigneeId ||= managerId;
    return item;
  });
  const normalizedMilestones = milestones.map((milestone, idx) => {
    if (typeof milestone.name !== 'undefined' && typeof milestone.name !== 'string') {
      throw badRequest('VALIDATION_ERROR', `milestones[${idx}].name 无效`);
    }
    const status = normalizeStatus(milestone.status) || 'NOT_STARTED';
    if (!TASK_STATUSES.has(status)) throw badRequest('VALIDATION_ERROR', `milestones[${idx}].status 无效`);
    const phaseKey = milestone.phaseId || milestone.phaseKey || null;
    if (phaseKey !== null && (typeof phaseKey !== 'string' || !phaseKey.trim())) throw badRequest('VALIDATION_ERROR', `milestones[${idx}].phaseId 无效`);
    return { name: milestone.name?.trim() || '未命名里程碑', dueDate: parseOptionalDate(milestone.date ?? milestone.dueDate, `milestones[${idx}].date`), status, phaseKey };
  });
  const phaseKeys = [...new Set([...normalizedTasks.map((t) => t.phaseKey), ...normalizedMilestones.map((m) => m.phaseKey)].filter(Boolean))];
  const userIds = [...new Set([auth.userId, managerId, ...participantIds, ...normalizedTasks.map((t) => t.assigneeId).filter(Boolean)])];
  return {
    data,
    isDraft: data.isDraft === true,
    managerId,
    tasks: normalizedTasks,
    milestones: normalizedMilestones,
    participantIds: [...new Set(participantIds)],
    phaseKeys,
    userIds,
  };
}

// ── 列表（projects.view；非 SUPER_ADMIN 按成员/负责人过滤）──────────────────
projects.get('/', requirePermission('projects.view'), async (c) => {
  const auth = getAuth(c);
  const {
    page = 1, pageSize = 50, type, status, managerId, subtype, keyword, includeRegistration,
  } = c.req.query();

  const where = activeProjectVisibilityWhere(auth);

  // 旧口径 NOT type='项目注册管理' → 新口径：注册类项目以 subtype='registration' 标识
  // ⚠️ SQL NULL 语义：`subtype <> 'registration'` 会排除 subtype IS NULL 的行，
  //    导致普通项目（subtype 为 NULL）在列表中不可见。必须显式包含 NULL。
  if (includeRegistration !== 'true') {
    where.AND = [
      ...(where.AND ?? []),
      { OR: [{ subtype: null }, { subtype: { not: 'registration' } }] },
    ];
  } else if (subtype) {
    where.subtype = subtype;
  }
  if (type) {
    // 筛选参数同样可能来自历史客户端（中文标签），规范化后再进 Prisma，避免枚举校验 500
    const normalizedType = normalizeProjectType(type);
    if (normalizedType) where.type = normalizedType;
  }
  if (status) where.status = normalizeStatus(status);
  if (managerId) where.managerId = managerId;
  if (keyword) {
    where.AND = [
      ...(where.AND ?? []),
      {
        OR: [
          { name: { contains: keyword } },
          { code: { contains: keyword } },
          { subtype: { contains: keyword } },
        ],
      },
    ];
  }

  const [total, list] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      skip: (Number.parseInt(page, 10) - 1) * Number.parseInt(pageSize, 10),
      take: Number.parseInt(pageSize, 10),
      orderBy: { createdAt: 'desc' },
      include: {
        manager: MANAGER_SELECT,
        _count: { select: { tasks: { where: { deletedAt: null } }, members: { where: { leftAt: null } } } },
      },
    }),
  ]);

  return c.json({ list, total, page: Number.parseInt(page, 10), pageSize: Number.parseInt(pageSize, 10) });
});

// ── 详情（projects.view + ∩：非成员 404；SA 非成员访问写 elevated 审计）──────
projects.get('/:id', requirePermission('projects.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');

  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'projects.view');

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      manager: MANAGER_SELECT,
      template: { select: { id: true, name: true, code: true, category: true } },
      members: MEMBER_INCLUDE,
      phases: { orderBy: { sortOrder: 'asc' } },
      tasks: {
        where: { deletedAt: null },
        orderBy: [{ phase: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { assignee: { select: { id: true, displayName: true, avatarFileId: true } } },
      },
      milestones: { where: { deletedAt: null }, orderBy: { dueDate: 'asc' } },
      monthlyProgress: { orderBy: { periodKey: 'desc' }, take: 6 },
    },
  });

  return c.json({
    ...project,
    myRole: access.memberRole,
    myCapabilities: access.capabilities,
    allowedTransitions: PROJECT_STATUS_TRANSITIONS[project.status] ?? [],
  });
});

// ── 创建（projects.create；编号走 CodeSequence 原子发号）────────────────────
projects.post('/', requirePermission('projects.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  // Auth and permission middleware run before receipt lookup; malformed commands
  // are rejected before code allocation or any aggregate write.
  const command = validateProjectCreateCommand(raw, auth);
  const { key } = resolveIdempotencyKey(c, raw);
  if (key && key.length > 200) throw badRequest('VALIDATION_ERROR', '幂等键长度不能超过 200 个字符');
  const payload = {
    ...command.data,
    startDate: command.data.startDate?.toISOString() ?? null,
    endDate: command.data.endDate?.toISOString() ?? null,
    managerId: command.managerId,
    tasks: command.tasks.map((task) => ({ ...task, dueDate: task.dueDate?.toISOString() ?? null })),
    milestones: command.milestones.map((milestone) => ({ ...milestone, dueDate: milestone.dueDate?.toISOString() ?? null })),
    participantIds: command.participantIds,
  };
  const result = await withIdempotency({
    db: prisma,
    actor: { userId: auth.userId },
    command: 'POST /api/projects',
    resourceScope: 'projects:create',
    idempotencyKey: key,
    payload,
    validate: async (tx) => {
      const users = await tx.user.findMany({ where: { id: { in: command.userIds } }, select: { id: true } });
      const found = new Set(users.map((user) => user.id));
      const missingUsers = command.userIds.filter((id) => !found.has(id));
      if (missingUsers.length) throw badRequest('VALIDATION_ERROR', '负责人、参与者或任务负责人不存在');
      if (command.data.templateId) {
        const template = await tx.projectTemplate.findFirst({ where: { id: command.data.templateId, deletedAt: null }, select: { id: true } });
        if (!template) throw badRequest('VALIDATION_ERROR', '项目模板不存在');
      }
      return true;
    },
    execute: async (tx) => {
      const year = new Date().getFullYear();
      const code = await nextCode(tx, 'PROJECT', { periodKey: String(year), fallbackPrefix: `PRJ-${year}-`, padding: 3 });
      const members = [
        { userId: auth.userId, role: 'OWNER', createdById: auth.userId },
        ...(command.managerId !== auth.userId ? [{ userId: command.managerId, role: 'MANAGER', createdById: auth.userId }] : []),
        ...command.participantIds
          .filter((uid) => uid !== auth.userId && uid !== command.managerId)
          .map((uid) => ({ userId: uid, role: 'MEMBER', createdById: auth.userId })),
      ];
      const project = await tx.project.create({
        data: {
          ...command.data,
          name: command.data.name || `未命名草稿-${new Date().toISOString().slice(0, 10)}`,
          type: normalizeProjectType(command.data.type) || 'CUSTOMIZATION',
          status: 'PLANNING',
          isDraft: command.isDraft,
          code,
          managerId: command.managerId,
          createdById: auth.userId,
          members: { create: members },
        },
        include: { manager: MANAGER_SELECT },
      });

      const phaseIdByKey = new Map();
      for (const [idx, key] of command.phaseKeys.entries()) {
        const phase = await tx.projectPhase.create({
          data: { projectId: project.id, code: `PH-${code}-${idx + 1}`, name: key, sortOrder: idx, createdById: auth.userId },
          select: { id: true },
        });
        phaseIdByKey.set(key, phase.id);
      }
      if (command.tasks.length) {
        await tx.task.createMany({
          data: command.tasks.map((task) => ({
            projectId: project.id,
            title: task.title.trim(),
            description: task.description,
            status: task.status,
            priority: task.priority,
            taskType: task.taskType,
            applicability: task.applicability,
            regulatoryPriority: task.regulatoryPriority,
            expectedDeliverable: task.expectedDeliverable,
            regulatoryNotes: task.regulatoryNotes,
            dueDate: task.dueDate,
            assigneeId: task.assigneeId,
            phaseId: phaseIdByKey.get(task.phaseKey) ?? null,
            sortOrder: task.sortOrder,
            createdById: auth.userId,
          })),
        });
      }
      if (command.milestones.length) {
        await tx.milestone.createMany({
          data: command.milestones.map((milestone) => ({
            projectId: project.id,
            name: milestone.name,
            phaseId: milestone.phaseKey ? phaseIdByKey.get(milestone.phaseKey) : null,
            dueDate: milestone.dueDate || new Date(),
            status: milestone.status,
            createdById: auth.userId,
          })),
        });
      }
      await writeAuditStrict(tx, {
        c,
        actorId: auth.userId,
        actorName: auth.user.displayName,
        actorRole: auth.systemRole,
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'PROJECT',
        entityId: project.id,
        entityLabel: project.name,
        after: { code: project.code, name: project.name },
        metadata: { permissionCode: 'projects.create' },
      });
      return { status: 201, body: project };
    },
  });
  if (result.replayed) c.header('Idempotency-Replayed', 'true');
  return c.json(result.body, result.status);
});

// ── 更新（projects.update + ∩ write；状态流转走 transition；归档需 projects.archive）─
projects.put('/:id', requirePermission('projects.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);

  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'projects.update');
  const businessSnapshot = await loadProjectBusinessSnapshot(id, { status: true });

  const participantIds = Array.isArray(raw?.participantIds) ? raw.participantIds : null;
  const tasksInput = Array.isArray(raw?.tasks) ? raw.tasks : null;
  const milestonesInput = Array.isArray(raw?.milestones) ? raw.milestones : null;

  const data = pickAllowed(raw, [
    'name', 'positioning', 'status', 'managerId', 'startDate', 'endDate',
    'type', 'subtype', 'isDraft', 'metadata',
  ], { entityLabel: '更新项目', allowEmpty: ['tasks','milestones','deletedTaskIds','deletedMilestoneIds'].some(key => Object.hasOwn(raw ?? {}, key)) });

  // 类型规范化（同创建）：中文别名→枚举；非法值丢弃而非报错，避免覆盖既有类型
  if ('type' in data) {
    const normalizedType = normalizeProjectType(data.type);
    if (normalizedType) data.type = normalizedType;
    else delete data.type;
  }

  if (data.status !== undefined) {
    const toStatus = assertProjectStatusTransition({
      actor: auth,
      access,
      currentStatus: businessSnapshot.status,
      nextStatus: normalizeStatus(data.status),
    });
    if (toStatus !== businessSnapshot.status) {
      data.status = toStatus;
    } else {
      delete data.status;
    }
  }
  if (data.startDate !== undefined) data.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate !== undefined) data.endDate = data.endDate ? new Date(data.endDate) : null;
  if (Object.keys(data).length === 0 && !participantIds && !tasksInput && !milestonesInput && raw?.deletedTaskIds === undefined && raw?.deletedMilestoneIds === undefined) {
    throw badRequest('NO_VALID_FIELDS', '更新项目: 没有可写入的有效字段');
  }

  const requestedManagerId = data.managerId !== undefined ? managerTransferId(data.managerId) : undefined;
  delete data.managerId;
  await prisma.$transaction(async (tx) => {
    const childCommand = ['tasks','milestones','deletedTaskIds','deletedMilestoneIds'].some(key => Object.hasOwn(raw, key));
    let currentAuth = auth, currentAccess = access;
    if (childCommand) {
      const targetId = requestedManagerId ?? auth.userId;
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${auth.userId}, ${targetId}) ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id} FOR UPDATE`;
      currentAuth = await currentProjectActor(tx, auth);
      assertActionPermission(currentAuth, 'projects.update');
      currentAccess = await resolveProjectAccess(tx, currentAuth, id);
      assertProjectCapability(currentAccess, 'write', 'projects.update');
      if (data.status !== undefined) {
        const current = await tx.project.findUniqueOrThrow({ where: { id } });
        data.status = assertProjectStatusTransition({ actor: currentAuth, access: currentAccess, currentStatus: current.status, nextStatus: data.status });
      }
      // Child delta uses the original project base before any parent-field update.
      await applyProjectChildren(tx, { actor: currentAuth, access: currentAccess, projectId: id, body: raw, c });
    }
    assertProjectCapability(currentAccess, 'write', 'projects.update');
    const effectiveManagerId = requestedManagerId ?? currentAccess.project.managerId;
    if (requestedManagerId && requestedManagerId !== currentAccess.project.managerId) {
      await transferProjectManager(tx, { actor: currentAuth, projectId: id, managerId: requestedManagerId,
        expectedUpdatedAt: raw?.baseUpdatedAt, entryPermission: 'projects.update', fields: data, c });
    } else await tx.project.update({ where: { id }, data: { ...data, updatedById: currentAuth.userId } });

    // 同步参与人（前端传 participantIds 时生效）
    if (participantIds) {
      assertProjectCapability(currentAccess, 'manage_members', 'projects.manage_members');
      const normalized = [...new Set(participantIds.filter((uid) => typeof uid === 'string' && uid && uid !== effectiveManagerId))];
      const desired = new Set([effectiveManagerId, ...normalized].filter(Boolean));
      const existing = await tx.projectMember.findMany({ where: { projectId: id }, select: { userId: true, role: true, leftAt: true } });
      // A transfer never implicitly removes the previous manager or active owners.
      // Explicit membership-removal commands remain separate from this combined edit.
      if (requestedManagerId && requestedManagerId !== currentAccess.project.managerId) {
        for (const member of existing) {
          if (!member.leftAt && (member.role === 'OWNER' || member.userId === currentAccess.project.managerId)) desired.add(member.userId);
        }
      }
      const existingIds = existing.map((m) => m.userId);
      const toRemove = existingIds.filter((uid) => !desired.has(uid));
      const toAdd = [...desired].filter((uid) => !existingIds.includes(uid));
      if (toRemove.length > 0) {
        await tx.projectMember.updateMany({ where: { projectId: id, userId: { in: toRemove } }, data: { leftAt: new Date() } });
      }
      if (toAdd.length > 0) {
        await tx.projectMember.createMany({
          data: toAdd.map((uid) => ({ projectId: id, userId: uid, role: uid === effectiveManagerId ? 'MANAGER' : 'MEMBER', createdById: currentAuth.userId })),
        });
      }
      if (normalized.length > 0) {
        await tx.projectMember.updateMany({ where: { projectId: id, userId: { in: normalized }, role: 'MANAGER' }, data: { role: 'MEMBER' } });
      }
    }


  });

  const project = await prisma.project.findUnique({
    where: { id },
    include: { manager: MANAGER_SELECT, members: MEMBER_INCLUDE },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: 'PROJECT',
    entityId: id,
    entityLabel: project?.name ?? id,
    changedFields: Object.keys(data),
    metadata: {
      permissionCode: 'projects.update',
      ...(access.elevated ? { elevated: true, bypass: 'project_membership' } : {}),
    },
  });
  return c.json(project);
});

// ── 删除（projects.delete，P1 批次二解冻；软删+审计）─────────────────────────
projects.delete('/:id', requirePermission('projects.delete'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, code: true },
  });
  if (!project) throw notFound('PROJECT_NOT_FOUND', '项目不存在');

  await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'PROJECT',
    entityId: id,
    entityLabel: project.name,
    before: { name: project.name, code: project.code },
    metadata: { permissionCode: 'projects.delete', softDelete: true },
  });
  return c.json({ id, softDeleted: true });
});

// ── 成员管理（projects.manage_members + ∩ manage_members）───────────────────
projects.get('/:id/members', requirePermission('projects.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'projects.view');
  const members = await prisma.projectMember.findMany({
    where: { projectId: id, leftAt: null },
    include: { user: { select: { id: true, displayName: true, position: true, department: true, avatarFileId: true } } },
  });
  return c.json(members);
});

projects.post('/:id/members', requirePermission('projects.manage_members'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'projects.manage_members');
  assertProjectCapability(access, 'manage_members', 'projects.manage_members');

  const { userId, role = 'MEMBER' } = await c.req.json().catch(() => ({}));
  if (!userId) throw badRequest('VALIDATION_ERROR', 'userId 不能为空');
  const allowedRoles = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'];
  if (!allowedRoles.includes(role)) throw badRequest('VALIDATION_ERROR', `role 仅允许 ${allowedRoles.join('/')}`);

  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: id, userId } },
    update: { role, leftAt: null },
    create: { projectId: id, userId, role, createdById: auth.userId },
    include: { user: { select: { id: true, displayName: true, position: true, avatarFileId: true } } },
  });
  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.ASSIGN,
    entityType: 'PROJECT_MEMBER',
    entityId: id,
    entityLabel: member.user.displayName,
    after: { userId, role },
    metadata: { permissionCode: 'projects.manage_members' },
  });
  return c.json(member, 201);
});

projects.delete('/:id/members/:userId', requirePermission('projects.manage_members'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const userId = c.req.param('userId');
  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'projects.manage_members');
  assertProjectCapability(access, 'manage_members', 'projects.manage_members');
  if (access.project.managerId === userId) {
    throw badRequest('VALIDATION_ERROR', '不能移除项目负责人');
  }
  // 退出不删行：leftAt 标记（M-1 §8.3：leftAt IS NULL 才算有效成员）
  await prisma.projectMember.updateMany({
    where: { projectId: id, userId, leftAt: null },
    data: { leftAt: new Date() },
  });
  return c.json({ success: true });
});

// ── 项目内资源（嵌套只读；read 能力 + 对应系统权限）─────────────────────────
projects.get('/:id/tasks', requirePermission('tasks.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'tasks.view');
  assertProjectCapability(access, 'read', 'tasks.view');
  const list = await prisma.task.findMany({
    where: { projectId: id, deletedAt: null },
    orderBy: [{ phase: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      assignee: { select: { id: true, displayName: true, avatarFileId: true } },
      phase: { select: { id: true, code: true, name: true, sortOrder: true } },
      regulatoryDocuments: {
        include: { regulatoryDocument: { select: { id: true, dispatchNo: true, title: true, priorityLevel: true } } },
      },
    },
  });
  return c.json({ projectId: id, list, total: list.length });
});

projects.get('/:id/reports', requirePermission('reports.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'reports.view');
  assertProjectCapability(access, 'read', 'reports.view');
  const list = await prisma.report.findMany({
    where: { projectId: id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, displayName: true } } },
  });
  return c.json({ projectId: id, list, total: list.length });
});

projects.get('/:id/milestones', requirePermission('milestones.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'milestones.view');
  assertProjectCapability(access, 'read', 'milestones.view');
  const list = await prisma.milestone.findMany({
    where: { projectId: id, deletedAt: null },
    orderBy: { dueDate: 'asc' },
  });
  return c.json({ projectId: id, list, total: list.length });
});

projects.get('/:id/phases', requirePermission('project_phases.view'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'project_phases.view');
  assertProjectCapability(access, 'read', 'project_phases.view');
  const list = await prisma.projectPhase.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: 'asc' },
  });
  return c.json({ projectId: id, list, total: list.length });
});

// ── 统计（带可见性过滤）──────────────────────────────────────────────────────
projects.get('/stats/types', requirePermission('projects.view'), async (c) => {
  const auth = getAuth(c);
  const stats = await prisma.project.groupBy({
    by: ['type'],
    where: activeProjectVisibilityWhere(auth),
    _count: { id: true },
  });
  return c.json(stats.map((s) => ({ type: s.type, count: s._count.id })));
});

projects.get('/stats/status', requirePermission('projects.view'), async (c) => {
  const auth = getAuth(c);
  const stats = await prisma.project.groupBy({
    by: ['status'],
    where: activeProjectVisibilityWhere(auth),
    _count: { id: true },
  });
  return c.json(stats.map((s) => ({ status: s.status, count: s._count.id })));
});

// ── 套用模板（projects.update + write；模板结构来自 TemplatePhase/TemplateTask 行）─
projects.post('/:id/apply-template', requirePermission('projects.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const { templateId, startDate } = await c.req.json().catch(() => ({}));
  if (!templateId) throw badRequest('VALIDATION_ERROR', 'templateId 不能为空');

  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'projects.update');
  assertProjectCapability(access, 'write', 'projects.update');
  const businessSnapshot = await loadProjectBusinessSnapshot(id, { startDate: true });

  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: { phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!template) throw notFound('TEMPLATE_NOT_FOUND', '模板不存在');

  const base = startDate ? new Date(startDate) : (businessSnapshot.startDate || new Date());
  let dayOffset = 0;

  const project = await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { templateId, updatedById: auth.userId } });
    let taskCount = 0;
    for (const [pIdx, phase] of template.phases.entries()) {
      const phaseRow = await tx.projectPhase.create({
        data: {
          projectId: id,
          templatePhaseId: phase.id,
          code: `${template.code}-P${pIdx + 1}`,
          name: phase.name,
          sortOrder: pIdx,
          plannedStart: new Date(base.getTime() + dayOffset * 24 * 3600 * 1000),
        },
      });
      for (const [tIdx, t] of phase.tasks.entries()) {
        const dueDate = new Date(base);
        dueDate.setDate(dueDate.getDate() + dayOffset + (phase.plannedDurationDays || 3));
        await tx.task.create({
          data: {
            projectId: id,
            phaseId: phaseRow.id,
            templateTaskId: t.id,
            title: t.title,
            taskType: t.taskType,
            applicability: t.applicability,
            regulatoryPriority: t.regulatoryPriority,
            expectedDeliverable: t.expectedDeliverable,
            regulatoryNotes: t.regulatoryNotes,
            estimatedHours: t.estimatedHours,
            status: 'NOT_STARTED',
            priority: 'MEDIUM',
            sortOrder: tIdx,
            assigneeId: access.project.managerId,
            dueDate,
            createdById: auth.userId,
          },
        });
        taskCount += 1;
      }
      dayOffset += phase.plannedDurationDays || 3;
    }
    return taskCount;
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PROJECT',
    entityId: id,
    entityLabel: access.project.name,
    after: { templateId, taskCount: project },
    metadata: { permissionCode: 'projects.update', ...(access.elevated ? { elevated: true, bypass: 'project_membership' } : {}) },
  });
  return c.json({ success: true, taskCount: project, phaseCount: template.phases.length });
});

// ── 批量删除（projects.delete；软删+审计，Tencent POST /projects/batch-delete 复刻）
projects.post('/batch-delete', requirePermission('projects.delete'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string' && x) : [];
  if (ids.length === 0) throw badRequest('VALIDATION_ERROR', 'ids 不能为空');
  if (ids.length > 200) throw badRequest('VALIDATION_ERROR', '单批最多 200 条');

  const targets = await prisma.project.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, name: true },
  });
  if (targets.length === 0) throw notFound('PROJECT_NOT_FOUND', '项目不存在或已删除');

  await prisma.project.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { deletedAt: new Date() },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.DELETE,
    entityType: 'PROJECT',
    entityId: targets[0].id,
    entityLabel: `批量删除 ${targets.length} 个项目`,
    metadata: {
      permissionCode: 'projects.delete',
      softDelete: true,
      batch: true,
      ids: targets.map((t) => t.id),
      names: targets.map((t) => t.name),
    },
  });
  return c.json({ success: true, deleted: targets.length });
});

// 批量更新状态（逐项目 ∩ transition 校验）
projects.post('/batch-update-status', requirePermission('projects.update'), async (c) => {
  const auth = getAuth(c);
  const { ids, status } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(ids) || ids.length === 0 || !status) {
    throw badRequest('VALIDATION_ERROR', '参数不完整');
  }
  const toStatus = normalizeStatus(status);
  let updated = 0;
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const access = await resolveProjectAccess(prisma, auth, id);
    if (access.elevated) {
      // eslint-disable-next-line no-await-in-loop
      await auditElevatedIfNeeded(prisma, c, access, 'projects.update');
    }
    const businessSnapshot = await loadProjectBusinessSnapshot(id, { status: true });
    assertProjectStatusTransition({ actor: auth, access, currentStatus: businessSnapshot.status, nextStatus: toStatus });
    // eslint-disable-next-line no-await-in-loop
    await prisma.project.update({ where: { id }, data: { status: toStatus, updatedById: auth.userId } });
    updated += 1;
  }
  return c.json({ message: `成功更新 ${updated} 个项目` });
});

export default projects;
