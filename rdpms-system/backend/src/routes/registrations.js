import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authenticate as authMiddleware, requirePermission, getAuth } from '../kernel/rbac.js';
import { AUDIT_ACTIONS } from '../kernel/constants.js';
import { writeAudit } from '../kernel/audit.js';
import { nextCode } from '../kernel/sequence.js';
import { badRequest, notFound } from '../kernel/http.js';

/**
 * /api/registrations —— 注册项目管理（W10 PG baseline 迁移）。
 *
 * 关键口径变更（旧 SQLite → 新 PostgreSQL baseline）：
 *   项目标识   type='项目注册管理'（中文，已废弃） → subtype='registration'（ProjectType 枚举无对应值）
 *   阶段       中文阶段名 → RegistrationStage 枚举
 *              资料准备→DOSSIER_PREPARATION / 送检受理→SUBMISSION_ACCEPTED / 技术审评→TECHNICAL_REVIEW
 *              行政审批→ADMIN_APPROVAL / 取证归档→CERTIFIED（新增 ARCHIVED）
 *   档案模型   projectRegistrationProfile → registrationProfile
 *   项目字段   position → positioning；status 中文 → ProjectStatus 枚举
 *   风险       riskLevel '中' → MEDIUM（RiskLevel 枚举）
 *   任务       phase/phaseOrder 字段删除 → phaseId/sortOrder；中文状态/优先级 → 枚举
 *   关联       relationType 'basis' → BASIS（TaskRegulatoryRelationType 枚举，Q-a2）
 *   Milestone  date → dueDate；status '待完成' → NOT_STARTED
 *   模板       template.content JSON → TemplatePhase/TemplateTask 结构化行
 */
const registrations = new Hono();
const REGISTRATION_SUBTYPE = 'registration';

const STAGE_TRANSITIONS = {
  DOSSIER_PREPARATION: ['SUBMISSION_ACCEPTED'],
  SUBMISSION_ACCEPTED: ['DOSSIER_PREPARATION', 'TECHNICAL_REVIEW'],
  TECHNICAL_REVIEW: ['SUBMISSION_ACCEPTED', 'ADMIN_APPROVAL'],
  ADMIN_APPROVAL: ['TECHNICAL_REVIEW', 'CERTIFIED'],
  CERTIFIED: ['ARCHIVED'],
  ARCHIVED: [],
};
const REGISTRATION_STAGES = Object.keys(STAGE_TRANSITIONS);

registrations.use('*', authMiddleware);

function getAllowedStageTransitions(stage) {
  return STAGE_TRANSITIONS[stage] || [];
}

function calcDaysLeft(dateValue) {
  if (!dateValue) return null;
  return Math.ceil((new Date(dateValue).getTime() - Date.now()) / (24 * 3600 * 1000));
}

/** 注册项目过滤条件（新口径：subtype='registration'） */
function registrationProjectWhere(extra = {}) {
  return { subtype: REGISTRATION_SUBTYPE, deletedAt: null, ...extra };
}

/**
 * 从模板结构化行（TemplatePhase/TemplateTask）生成项目阶段、任务与法规关联。
 * 旧 createTasksAndMilestonesFromTemplate（template.content JSON 解析）已废弃。
 */
async function scaffoldFromTemplate(projectId, templateId, managerId) {
  if (!templateId) return { phaseCount: 0, taskCount: 0 };
  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: { phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!template) return { phaseCount: 0, taskCount: 0 };

  let taskCount = 0;
  const taskTitles = [];
  for (const [pIdx, phase] of template.phases.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const phaseRow = await prisma.projectPhase.create({
      data: {
        projectId,
        templatePhaseId: phase.id,
        code: `${template.code}-P${pIdx + 1}`,
        name: phase.name,
        sortOrder: pIdx,
      },
    });
    const taskRows = [];
    for (const [tIdx, t] of phase.tasks.entries()) {
      taskRows.push({
        projectId,
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
        assigneeId: managerId,
      });
      taskTitles.push(t.title);
    }
    if (taskRows.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.task.createMany({ data: taskRows });
      taskCount += taskRows.length;
    }
  }

  // 任务-法规文档关联（Q-a2：relationType 使用枚举 BASIS）
  if (taskCount > 0) {
    const dispatchNos = [...new Set(taskTitles.flatMap((t) => TASK_REGULATORY_MAP[t] || []))];
    if (dispatchNos.length > 0) {
      const docs = await prisma.regulatoryDocument.findMany({
        where: { dispatchNo: { in: dispatchNos } },
        select: { id: true, dispatchNo: true },
      });
      const docMap = Object.fromEntries(docs.map((d) => [d.dispatchNo, d.id]));
      const tasks = await prisma.task.findMany({ where: { projectId }, select: { id: true, title: true } });
      const relations = [];
      for (const t of tasks) {
        for (const dispatchNo of TASK_REGULATORY_MAP[t.title] || []) {
          const regulatoryDocumentId = docMap[dispatchNo];
          if (regulatoryDocumentId) {
            relations.push({ taskId: t.id, regulatoryDocumentId, relationType: 'BASIS', note: 'ISAF 2026 法规依据' });
          }
        }
      }
      if (relations.length > 0) {
        await prisma.taskRegulatoryDocument.createMany({ data: relations });
      }
    }
  }
  return { phaseCount: template.phases.length, taskCount };
}

// ISAF 2026 任务标题 → 法规文件号映射（数据外置于 src/data/reg66TaskRegulatoryMap.js）
import { TASK_REGULATORY_MAP } from '../data/reg66TaskRegulatoryMap.js';

// ── 注册项目列表（registrations.view）───────────────────────────────────────
registrations.get('/', requirePermission('registrations.view'), async (c) => {
  const {
    page = 1, pageSize = 50, keyword, currentStage, registrationType, riskLevel, managerId,
  } = c.req.query();

  const where = registrationProjectWhere();
  if (managerId) where.managerId = managerId;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
      { positioning: { contains: keyword } },
    ];
  }
  const profileWhere = {};
  if (currentStage) profileWhere.currentStage = currentStage;
  if (registrationType) profileWhere.registrationType = registrationType;
  if (riskLevel) profileWhere.riskLevel = riskLevel;
  if (Object.keys(profileWhere).length > 0) {
    where.registrationProfile = { is: profileWhere };
  }

  const [total, list] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      skip: (Number.parseInt(page, 10) - 1) * Number.parseInt(pageSize, 10),
      take: Number.parseInt(pageSize, 10),
      orderBy: { createdAt: 'desc' },
      include: {
        manager: { select: { id: true, displayName: true, position: true } },
        registrationProfile: {
          include: { complianceOwner: { select: { id: true, displayName: true, position: true } } },
        },
        _count: { select: { tasks: { where: { deletedAt: null } }, members: { where: { leftAt: null } } } },
      },
    }),
  ]);

  const enhanced = list.map((item) => {
    const daysLeft = calcDaysLeft(item.registrationProfile?.expectedApprovalDate);
    const alertLevel = daysLeft == null ? 'none'
      : daysLeft < 0 ? 'overdue'
        : daysLeft <= 7 ? 'critical'
          : daysLeft <= 30 ? 'warning' : 'normal';
    return { ...item, due: { daysLeft, alertLevel } };
  });

  return c.json({ list: enhanced, total, page: Number.parseInt(page, 10), pageSize: Number.parseInt(pageSize, 10) });
});

// 统计
registrations.get('/stats', requirePermission('registrations.view'), async (c) => {
  const projects = await prisma.project.findMany({
    where: registrationProjectWhere(),
    include: { registrationProfile: true },
  });

  const byStage = {};
  const byRisk = {};
  let overdueCount = 0;
  let dueSoonCount = 0;
  for (const p of projects) {
    const stage = p.registrationProfile?.currentStage || 'DOSSIER_PREPARATION';
    const risk = p.registrationProfile?.riskLevel || 'MEDIUM';
    byStage[stage] = (byStage[stage] || 0) + 1;
    byRisk[risk] = (byRisk[risk] || 0) + 1;
    const daysLeft = calcDaysLeft(p.registrationProfile?.expectedApprovalDate);
    if (daysLeft != null && daysLeft < 0) overdueCount += 1;
    if (daysLeft != null && daysLeft >= 0 && daysLeft <= 30) dueSoonCount += 1;
  }
  return c.json({ total: projects.length, byStage, byRisk, overdueCount, dueSoonCount });
});

// 可用模板（project_templates.view 亦可，保持 registrations.view 以兼容原页面）
registrations.get('/templates', requirePermission('registrations.view'), async (c) => {
  const list = await prisma.projectTemplate.findMany({
    where: { status: 'ACTIVE', OR: [{ category: 'registration' }, { code: { startsWith: 'TPL-REG' } }], deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, code: true, name: true, description: true, category: true, typeLabel: true },
  });
  return c.json({ list });
});

// ── 详情（registrations.view）───────────────────────────────────────────────
registrations.get('/:id', requirePermission('registrations.view'), async (c) => {
  const id = c.req.param('id');
  const item = await prisma.project.findFirst({
    where: registrationProjectWhere({ id }),
    include: {
      manager: { select: { id: true, displayName: true, position: true, avatarFileId: true } },
      template: { select: { id: true, name: true, code: true, category: true } },
      members: {
        include: { user: { select: { id: true, displayName: true, position: true, avatarFileId: true } } },
      },
      tasks: {
        where: { deletedAt: null },
        orderBy: [{ phase: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          assignee: { select: { id: true, displayName: true } },
          regulatoryDocuments: {
            include: {
              regulatoryDocument: { select: { id: true, dispatchNo: true, title: true, priorityLevel: true } },
            },
          },
        },
      },
      milestones: { where: { deletedAt: null }, orderBy: { dueDate: 'asc' } },
      phases: { orderBy: { sortOrder: 'asc' } },
      registrationProfile: {
        include: { complianceOwner: { select: { id: true, displayName: true, position: true } } },
      },
    },
  });
  if (!item) throw notFound('REGISTRATION_NOT_FOUND', '注册项目不存在');

  const currentStage = item.registrationProfile?.currentStage || 'DOSSIER_PREPARATION';
  return c.json({
    ...item,
    stageOptions: REGISTRATION_STAGES,
    allowedStageTransitions: getAllowedStageTransitions(currentStage),
    due: { daysLeft: calcDaysLeft(item.registrationProfile?.expectedApprovalDate) },
  });
});

// ── 创建（registrations.create；编号走 CodeSequence）────────────────────────
registrations.post('/', requirePermission('registrations.create'), async (c) => {
  const auth = getAuth(c);
  const body = await c.req.json().catch(() => null);
  if (!body?.name) throw badRequest('VALIDATION_ERROR', '项目名称不能为空');

  const managerId = body.managerId || auth.userId;
  const year = new Date().getFullYear();
  const code = await nextCode(prisma, 'PROJECT', { periodKey: String(year), fallbackPrefix: `PRJ-${year}-`, padding: 3 });

  const created = await prisma.project.create({
    data: {
      code,
      name: body.name,
      type: 'CUSTOMIZATION',
      subtype: REGISTRATION_SUBTYPE,
      status: 'PLANNING',
      positioning: body.positioning || body.notes || null,
      managerId,
      templateId: body.templateId || null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      createdById: auth.userId,
      members: { create: { userId: managerId, role: 'MANAGER', createdById: auth.userId } },
      registrationProfile: {
        create: {
          registrationType: body.registrationType || 'IVD',
          region: body.region || 'MACAO_ISAF',
          authority: body.authority || null,
          submissionNo: body.submissionNo || null,
          certificateNo: body.certificateNo || null,
          currentStage: body.currentStage || 'DOSSIER_PREPARATION',
          plannedSubmissionDate: body.plannedSubmissionDate ? new Date(body.plannedSubmissionDate) : null,
          expectedApprovalDate: body.expectedApprovalDate ? new Date(body.expectedApprovalDate) : null,
          complianceOwnerId: body.complianceOwnerId || null,
          riskLevel: body.riskLevel || 'MEDIUM',
          notes: body.notes || null,
        },
      },
    },
    include: {
      manager: { select: { id: true, displayName: true, position: true } },
      registrationProfile: true,
    },
  });

  await scaffoldFromTemplate(created.id, body.templateId, managerId);

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'PROJECT',
    entityId: created.id,
    entityLabel: created.name,
    metadata: { permissionCode: 'registrations.create', subtype: REGISTRATION_SUBTYPE },
  });
  return c.json(created, 201);
});

// ── 更新（registrations.update）─────────────────────────────────────────────
registrations.put('/:id', requirePermission('registrations.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existing = await prisma.project.findFirst({
    where: registrationProjectWhere({ id }),
    select: { id: true },
  });
  if (!existing) throw notFound('REGISTRATION_NOT_FOUND', '注册项目不存在');

  const projectData = {};
  if (body.name !== undefined) projectData.name = body.name;
  if (body.positioning !== undefined || body.position !== undefined) {
    projectData.positioning = body.positioning ?? body.position;
  }
  if (body.subtype !== undefined && body.subtype !== REGISTRATION_SUBTYPE) projectData.subtype = REGISTRATION_SUBTYPE;
  if (body.managerId !== undefined) projectData.managerId = body.managerId;
  if (body.startDate !== undefined) projectData.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) projectData.endDate = body.endDate ? new Date(body.endDate) : null;
  if (Object.keys(projectData).length > 0) {
    projectData.updatedById = auth.userId;
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(projectData).length > 0) {
      await tx.project.update({ where: { id }, data: projectData });
    }

    const profilePayload = {};
    for (const k of ['registrationType', 'region', 'authority', 'submissionNo', 'certificateNo', 'currentStage', 'complianceOwnerId', 'riskLevel', 'notes']) {
      if (body[k] !== undefined) profilePayload[k] = body[k];
    }
    for (const k of ['plannedSubmissionDate', 'expectedApprovalDate', 'actualSubmissionDate', 'approvalDate']) {
      if (body[k] !== undefined) profilePayload[k] = body[k] ? new Date(body[k]) : null;
    }
    if (Object.keys(profilePayload).length > 0) {
      // 阶段流转必须走 PATCH /:id/stage；此处拒绝直接改 currentStage
      if (profilePayload.currentStage !== undefined) {
        throw badRequest('VALIDATION_ERROR', '阶段变更必须使用 PATCH /api/registrations/:id/stage');
      }
      const current = await tx.registrationProfile.findUnique({ where: { projectId: id } });
      if (current) {
        await tx.registrationProfile.update({ where: { projectId: id }, data: profilePayload });
      } else {
        await tx.registrationProfile.create({
          data: {
            projectId: id,
            registrationType: profilePayload.registrationType || 'IVD',
            region: profilePayload.region || 'MACAO_ISAF',
            riskLevel: profilePayload.riskLevel || 'MEDIUM',
            currentStage: 'DOSSIER_PREPARATION',
            ...profilePayload,
          },
        });
      }
    }
  });

  const updated = await prisma.project.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, displayName: true, position: true } },
      registrationProfile: {
        include: { complianceOwner: { select: { id: true, displayName: true, position: true } } },
      },
    },
  });
  return c.json(updated);
});

// ── 阶段推进（registrations.change_stage；严格状态机）────────────────────────
registrations.patch('/:id/stage', requirePermission('registrations.change_stage'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const toStage = body?.toStage;
  if (!toStage) throw badRequest('VALIDATION_ERROR', '目标阶段不能为空');
  if (!REGISTRATION_STAGES.includes(toStage)) {
    throw badRequest('VALIDATION_ERROR', `目标阶段非法，允许值：${REGISTRATION_STAGES.join('/')}`);
  }

  const existing = await prisma.project.findFirst({
    where: registrationProjectWhere({ id }),
    include: { registrationProfile: true },
  });
  if (!existing) throw notFound('REGISTRATION_NOT_FOUND', '注册项目不存在');

  const fromStage = existing.registrationProfile?.currentStage || 'DOSSIER_PREPARATION';
  if (!getAllowedStageTransitions(fromStage).includes(toStage)) {
    throw badRequest('INVALID_STAGE_TRANSITION', '非法阶段流转', {
      fromStage, toStage, allowedTransitions: getAllowedStageTransitions(fromStage),
    });
  }

  const profile = await prisma.registrationProfile.upsert({
    where: { projectId: id },
    update: { currentStage: toStage },
    create: {
      projectId: id,
      registrationType: 'IVD',
      region: 'MACAO_ISAF',
      currentStage: toStage,
      riskLevel: 'MEDIUM',
    },
  });

  await writeAudit(prisma, {
    c,
    actorId: auth.userId,
    actorName: auth.user.displayName,
    actorRole: auth.systemRole,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    entityType: 'REGISTRATION',
    entityId: id,
    entityLabel: existing.name,
    before: { stage: fromStage },
    after: { stage: toStage },
    metadata: { permissionCode: 'registrations.change_stage' },
  });
  return c.json({ success: true, fromStage, toStage, profile });
});

// 单独更新档案（不含阶段）
registrations.patch('/:id/profile', requirePermission('registrations.update'), async (c) => {
  const auth = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existing = await prisma.project.findFirst({
    where: registrationProjectWhere({ id }),
    select: { id: true },
  });
  if (!existing) throw notFound('REGISTRATION_NOT_FOUND', '注册项目不存在');
  if (body.currentStage !== undefined && body.currentStage !== null) {
    throw badRequest('VALIDATION_ERROR', '阶段变更必须使用 PATCH /api/registrations/:id/stage');
  }

  const payload = {};
  for (const k of ['registrationType', 'region', 'authority', 'submissionNo', 'certificateNo', 'complianceOwnerId', 'riskLevel', 'notes']) {
    if (body[k] !== undefined) payload[k] = body[k];
  }
  for (const k of ['plannedSubmissionDate', 'expectedApprovalDate', 'actualSubmissionDate', 'approvalDate']) {
    if (body[k] !== undefined) payload[k] = body[k] ? new Date(body[k]) : null;
  }

  const profile = await prisma.registrationProfile.upsert({
    where: { projectId: id },
    update: payload,
    create: {
      projectId: id,
      registrationType: payload.registrationType || 'IVD',
      region: payload.region || 'MACAO_ISAF',
      currentStage: 'DOSSIER_PREPARATION',
      riskLevel: payload.riskLevel || 'MEDIUM',
      ...payload,
    },
    include: { complianceOwner: { select: { id: true, displayName: true, position: true } } },
  });
  return c.json(profile);
});

export default registrations;
