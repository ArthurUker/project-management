import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { pickAllowed, pickForCreate } from '../kernel/massAssign.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
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

// ── 状态机：允许的迁移路径（英文枚举；与前端 statusColors.ts 同步更新）────────
const STATUS_TRANSITIONS = {
  PLANNING: ['IN_PROGRESS', 'ARCHIVED', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_PROCESSING', 'PENDING_VERIFICATION', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'],
  PENDING_PROCESSING: ['IN_PROGRESS', 'PENDING_VERIFICATION', 'ARCHIVED'],
  PENDING_VERIFICATION: ['IN_PROGRESS', 'COMPLETED', 'ARCHIVED'],
  ON_HOLD: ['IN_PROGRESS', 'ARCHIVED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: ['PLANNING'],
  CANCELLED: [],
};

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

// ── 列表（projects.view；非 SUPER_ADMIN 按成员/负责人过滤）──────────────────
projects.get('/', requirePermission('projects.view'), async (c) => {
  const auth = getAuth(c);
  const {
    page = 1, pageSize = 50, type, status, managerId, subtype, keyword, includeRegistration,
  } = c.req.query();

  const where = projectVisibilityFilter(auth) ?? {};

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
    allowedTransitions: STATUS_TRANSITIONS[project.status] ?? [],
  });
});

// ── 创建（projects.create；编号走 CodeSequence 原子发号）────────────────────
projects.post('/', requirePermission('projects.create'), async (c) => {
  const auth = getAuth(c);
  const raw = await c.req.json().catch(() => null);
  if (raw && typeof raw === 'object' && 'code' in raw) {
    throw badRequest('VALIDATION_ERROR', 'code 由服务端统一发号，禁止客户端提交');
  }
  const data = pickForCreate(raw, [
    'name', 'type', 'subtype', 'positioning', 'managerId', 'startDate', 'endDate',
    'templateId', 'isDraft', 'metadata',
  ], raw?.isDraft === true ? [] : ['name'], { entityLabel: '创建项目' });

  const isDraft = data.isDraft === true;
  const managerId = data.managerId || auth.userId;
  const year = new Date().getFullYear();
  const code = await nextCode(prisma, 'PROJECT', { periodKey: String(year), fallbackPrefix: `PRJ-${year}-`, padding: 3 });

  const { tasks = [], milestones = [], participantIds = [], ...projectData } = raw ?? {};
  const project = await prisma.project.create({
    data: {
      ...data,
      name: data.name || `未命名草稿-${new Date().toISOString().slice(0, 10)}`,
      type: normalizeProjectType(data.type) || 'CUSTOMIZATION',
      status: 'PLANNING',
      isDraft,
      code,
      managerId,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      createdById: auth.userId,
      // 创建者固定为 OWNER 成员；负责人若非创建者，追加 MANAGER 成员
      members: {
        create: [
          { userId: auth.userId, role: 'OWNER', createdById: auth.userId },
          ...(managerId !== auth.userId ? [{ userId: managerId, role: 'MANAGER', createdById: auth.userId }] : []),
          ...(Array.isArray(participantIds)
            ? participantIds
              .filter((uid) => typeof uid === 'string' && uid && uid !== auth.userId && uid !== managerId)
              .map((uid) => ({ userId: uid, role: 'MEMBER', createdById: auth.userId }))
            : []),
        ],
      },
    },
    include: { manager: MANAGER_SELECT },
  });

  // 批量创建任务 / 里程碑（旧中文枚举归一化）
  if (Array.isArray(tasks) && tasks.length > 0) {
    const phaseKeySet = [...new Set(tasks.map((t) => t.phaseId || t.phaseKey).filter(Boolean))];
    const phaseIdByKey = new Map();
    if (phaseKeySet.length > 0) {
      const phaseRows = await prisma.projectPhase.createManyAndReturn?.({
        data: phaseKeySet.map((key, idx) => ({
          projectId: project.id, code: `PH-${code}-${idx + 1}`, name: key, sortOrder: idx,
        })),
      });
      for (const row of phaseRows ?? []) phaseIdByKey.set(row.name, row.id);
    }
    await prisma.task.createMany({
      data: tasks.map((t, idx) => {
        const nt = normalizeTaskInput(t, idx);
        return {
          projectId: project.id,
          title: nt.title,
          description: nt.description,
          status: nt.status,
          priority: nt.priority,
          taskType: nt.taskType,
          applicability: nt.applicability,
          regulatoryPriority: nt.regulatoryPriority,
          expectedDeliverable: nt.expectedDeliverable,
          regulatoryNotes: nt.regulatoryNotes,
          dueDate: nt.dueDate,
          assigneeId: nt.assigneeId || managerId,
          phaseId: phaseIdByKey.get(nt.phaseKey) ?? null,
          sortOrder: nt.sortOrder,
          createdById: auth.userId,
        };
      }),
    });
  }
  if (Array.isArray(milestones) && milestones.length > 0) {
    await prisma.milestone.createMany({
      data: milestones.map((m) => ({
        projectId: project.id,
        name: m.name || '未命名里程碑',
        phaseId: m.phaseId || null,
        dueDate: m.date ? new Date(m.date) : new Date(),
        status: normalizeStatus(m.status) || 'NOT_STARTED',
        createdById: auth.userId,
      })),
    });
  }

  await writeAudit(prisma, {
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
  return c.json(project, 201);
});

// ── 更新（projects.update + ∩ write；状态流转走 transition；归档需 projects.archive）─
projects.put('/:id', requirePermission('projects.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const raw = await c.req.json().catch(() => null);

  const access = await resolveProjectAccess(prisma, auth, id);
  await auditElevatedIfNeeded(prisma, c, access, 'projects.update');

  const participantIds = Array.isArray(raw?.participantIds) ? raw.participantIds : null;
  const tasksInput = Array.isArray(raw?.tasks) ? raw.tasks : null;
  const milestonesInput = Array.isArray(raw?.milestones) ? raw.milestones : null;

  const data = pickAllowed(raw, [
    'name', 'positioning', 'status', 'managerId', 'startDate', 'endDate',
    'type', 'subtype', 'isDraft', 'metadata',
  ], { entityLabel: '更新项目' });

  // 类型规范化（同创建）：中文别名→枚举；非法值丢弃而非报错，避免覆盖既有类型
  if ('type' in data) {
    const normalizedType = normalizeProjectType(data.type);
    if (normalizedType) data.type = normalizedType;
    else delete data.type;
  }

  if (data.status) {
    const toStatus = normalizeStatus(data.status);
    if (toStatus !== access.project.status) {
      // 归档为独立 P0 权限
      if (toStatus === 'ARCHIVED' && !auth.permissions.includes('projects.archive')) {
        throw badRequest('PERMISSION_DENIED', '归档项目需要 projects.archive 权限');
      }
      const allowed = STATUS_TRANSITIONS[access.project.status] ?? [];
      if (!allowed.includes(toStatus)) {
        throw badRequest('INVALID_STATUS_TRANSITION',
          `状态不可从 ${access.project.status} 变更为 ${toStatus}`,
          { current: access.project.status, allowedTransitions: allowed });
      }
      data.status = toStatus;
    } else {
      delete data.status;
    }
  }
  if (data.startDate !== undefined) data.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate !== undefined) data.endDate = data.endDate ? new Date(data.endDate) : null;
  if (Object.keys(data).length === 0 && !participantIds && !tasksInput && !milestonesInput) {
    throw badRequest('NO_VALID_FIELDS', '更新项目: 没有可写入的有效字段');
  }

  await prisma.$transaction(async (tx) => {
    // write 能力不足时仅允许不动核心字段的场景——统一按 write 断言
    assertProjectCapability(access, 'write', 'projects.update');

    await tx.project.update({ where: { id }, data: { ...data, updatedById: auth.userId } });

    const effectiveManagerId = data.managerId || access.project.managerId;
    if (data.managerId && data.managerId !== access.project.managerId) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: id, userId: data.managerId } },
        update: { role: 'MANAGER', leftAt: null },
        create: { projectId: id, userId: data.managerId, role: 'MANAGER', createdById: auth.userId },
      });
      await tx.projectMember.updateMany({
        where: { projectId: id, userId: access.project.managerId, role: 'MANAGER' },
        data: { role: 'MEMBER' },
      });
    } else if (effectiveManagerId) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: id, userId: effectiveManagerId } },
        update: { leftAt: null },
        create: { projectId: id, userId: effectiveManagerId, role: 'MANAGER', createdById: auth.userId },
      });
    }

    // 同步参与人（前端传 participantIds 时生效）
    if (participantIds) {
      assertProjectCapability(access, 'manage_members', 'projects.manage_members');
      const normalized = [...new Set(participantIds.filter((uid) => typeof uid === 'string' && uid && uid !== effectiveManagerId))];
      const desired = new Set([effectiveManagerId, ...normalized].filter(Boolean));
      const existing = await tx.projectMember.findMany({ where: { projectId: id }, select: { userId: true } });
      const existingIds = existing.map((m) => m.userId);
      const toRemove = existingIds.filter((uid) => !desired.has(uid));
      const toAdd = [...desired].filter((uid) => !existingIds.includes(uid));
      if (toRemove.length > 0) {
        await tx.projectMember.updateMany({ where: { projectId: id, userId: { in: toRemove } }, data: { leftAt: new Date() } });
      }
      if (toAdd.length > 0) {
        await tx.projectMember.createMany({
          data: toAdd.map((uid) => ({ projectId: id, userId: uid, role: uid === effectiveManagerId ? 'MANAGER' : 'MEMBER', createdById: auth.userId })),
        });
      }
      if (normalized.length > 0) {
        await tx.projectMember.updateMany({ where: { projectId: id, userId: { in: normalized }, role: 'MANAGER' }, data: { role: 'MEMBER' } });
      }
    }

    // 任务数组重建（旧中文枚举归一化；phase 字符串 → ProjectPhase 行）
    if (tasksInput) {
      assertProjectCapability(access, 'write', 'tasks.update');
      await tx.task.deleteMany({ where: { projectId: id } });
      if (tasksInput.length > 0) {
        const phaseKeySet = [...new Set(tasksInput.map((t) => t.phaseId || t.phaseKey || t.phase).filter(Boolean))];
        const phaseIdByKey = new Map();
        for (const [idx, key] of phaseKeySet.entries()) {
          const row = await tx.projectPhase.create({
            data: { projectId: id, code: `PH-${id.slice(0, 8)}-${idx + 1}`, name: key, sortOrder: idx },
          });
          phaseIdByKey.set(key, row.id);
        }
        await tx.task.createMany({
          data: tasksInput.map((t, idx) => {
            const nt = normalizeTaskInput(t, idx);
            return {
              projectId: id,
              title: nt.title,
              description: nt.description,
              status: nt.status,
              priority: nt.priority,
              taskType: nt.taskType,
              applicability: nt.applicability,
              regulatoryPriority: nt.regulatoryPriority,
              expectedDeliverable: nt.expectedDeliverable,
              regulatoryNotes: nt.regulatoryNotes,
              dueDate: nt.dueDate,
              assigneeId: nt.assigneeId || effectiveManagerId || null,
              phaseId: phaseIdByKey.get(nt.phaseKey) ?? null,
              sortOrder: nt.sortOrder,
              createdById: auth.userId,
            };
          }),
        });
      }
    }

    // 里程碑数组重建
    if (milestonesInput) {
      await tx.milestone.deleteMany({ where: { projectId: id } });
      if (milestonesInput.length > 0) {
        await tx.milestone.createMany({
          data: milestonesInput.map((m) => ({
            projectId: id,
            name: m.name || '未命名里程碑',
            phaseId: m.phaseId || null,
            dueDate: m.date ? new Date(m.date) : new Date(),
            status: normalizeStatus(m.status) || 'NOT_STARTED',
            createdById: auth.userId,
          })),
        });
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
  const visible = projectVisibilityFilter(auth);
  const stats = await prisma.project.groupBy({
    by: ['type'],
    where: visible ?? {},
    _count: { id: true },
  });
  return c.json(stats.map((s) => ({ type: s.type, count: s._count.id })));
});

projects.get('/stats/status', requirePermission('projects.view'), async (c) => {
  const auth = getAuth(c);
  const visible = projectVisibilityFilter(auth);
  const stats = await prisma.project.groupBy({
    by: ['status'],
    where: visible ?? {},
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

  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: { phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!template) throw notFound('TEMPLATE_NOT_FOUND', '模板不存在');

  const base = startDate ? new Date(startDate) : (access.project.startDate || new Date());
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
projects.post('/batch-update-status', async (c) => {
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
    assertProjectCapability(access, 'transition', 'projects.update');
    const allowed = STATUS_TRANSITIONS[access.project.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw badRequest('INVALID_STATUS_TRANSITION', `项目 ${access.project.code} 不可从 ${access.project.status} 变更为 ${toStatus}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await prisma.project.update({ where: { id }, data: { status: toStatus, updatedById: auth.userId } });
    updated += 1;
  }
  return c.json({ message: `成功更新 ${updated} 个项目` });
});

export default projects;
