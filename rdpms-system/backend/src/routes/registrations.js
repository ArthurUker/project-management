import { Hono } from 'hono';
import { prisma } from '../index.js';
import { authMiddleware } from './auth.js';

const registrations = new Hono();
const REGISTRATION_PROJECT_TYPE = '项目注册管理';
const REGISTRATION_STAGES = ['资料准备', '送检受理', '技术审评', '行政审批', '取证归档'];
const STAGE_TRANSITIONS = {
  '资料准备': ['送检受理'],
  '送检受理': ['资料准备', '技术审评'],
  '技术审评': ['送检受理', '行政审批'],
  '行政审批': ['技术审评', '取证归档'],
  '取证归档': [],
};

registrations.use('*', authMiddleware);

const ROLE_PERMISSIONS = {
  admin: ['registrations.view', 'registrations.edit', 'registrations.approve'],
  manager: ['registrations.view', 'registrations.edit'],
  member: ['registrations.view'],
};

function hasPerm(role, perm) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(perm);
}

function parseTemplateContent(content) {
  if (!content) return { phases: [], milestones: [] };
  try {
    return typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return { phases: [], milestones: [] };
  }
}

function getAllowedStageTransitions(stage) {
  return STAGE_TRANSITIONS[stage] || [];
}

function calcDaysLeft(dateValue) {
  if (!dateValue) return null;
  const target = new Date(dateValue).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (24 * 3600 * 1000));
}

const TASK_REGULATORY_MAP = {
  '明确产品预期用途、适用人群、样本类型和检测场景': ['第 1/ISAF/2026 号', '第 7/ISAF/2026 号'],
  '明确10项病原体检测靶标及临床意义': ['第 1/ISAF/2026 号', '第 2/ISAF/2026 号'],
  '确认产品是否属于体外诊断医疗器械': ['第 1/ISAF/2026 号'],
  '逐条适用 IVD 分类规则并形成记录': ['第 1/ISAF/2026 号'],
  '编制澳门医疗器械分类判定报告': ['第 1/ISAF/2026 号'],
  '判断注册路径或备案路径': ['第 1/ISAF/2026 号', '第 12/ISAF/2026 号'],
  '判断是否可申请优先审批': ['第 8/ISAF/2026 号'],
  '判断是否可申请附条件批准': ['第 9/ISAF/2026 号'],
  '建立 ISAF 2026 法规适用性矩阵': ['第 1/ISAF/2026 号', '第 2/ISAF/2026 号', '第 6/ISAF/2026 号', '第 7/ISAF/2026 号', '第 16/ISAF/2026 号', '第 20/ISAF/2026 号', '第 21/ISAF/2026 号'],
  '确定总体注册申报策略与时间表': ['第 7/ISAF/2026 号'],
  '按第7号批示建立注册卷宗目录': ['第 7/ISAF/2026 号'],
  '编制资料位置索引表': ['第 7/ISAF/2026 号'],
  '编制符合性声明': ['第 7/ISAF/2026 号'],
  '编制产品基本信息表': ['第 7/ISAF/2026 号'],
  '编制产品组成、型号规格、工作原理说明': ['第 7/ISAF/2026 号'],
  '编制产品技术要求': ['第 7/ISAF/2026 号'],
  '编制检验方法与验收标准': ['第 7/ISAF/2026 号'],
  '编制主要原材料清单及质量标准': ['第 7/ISAF/2026 号', '第 20/ISAF/2026 号'],
  '编制生产工艺流程图': ['第 7/ISAF/2026 号', '第 20/ISAF/2026 号'],
  '编制风险管理计划与报告': ['第 7/ISAF/2026 号', '第 16/ISAF/2026 号'],
  '编制设计开发文件': ['第 7/ISAF/2026 号', '第 16/ISAF/2026 号'],
  '编制稳定性研究方案': ['第 7/ISAF/2026 号', '第 20/ISAF/2026 号'],
  '编制通用名称合规性审核表': ['第 6/ISAF/2026 号'],
  '编制标签、说明书、包装标识': ['第 6/ISAF/2026 号', '第 7/ISAF/2026 号'],
  '完成中文/葡文资料一致性核对': ['第 6/ISAF/2026 号', '第 7/ISAF/2026 号'],
  '制定分析性能验证总体方案': ['第 7/ISAF/2026 号'],
  '完成10项病原体 LOD 验证': ['第 7/ISAF/2026 号'],
  '完成包容性研究': ['第 7/ISAF/2026 号'],
  '完成交叉反应/特异性研究': ['第 7/ISAF/2026 号'],
  '完成干扰物质研究': ['第 7/ISAF/2026 号'],
  '完成精密度、重复性、再现性研究': ['第 7/ISAF/2026 号'],
  '完成阳性/阴性符合率研究': ['第 2/ISAF/2026 号', '第 7/ISAF/2026 号'],
  '完成稳定性研究报告': ['第 7/ISAF/2026 号', '第 20/ISAF/2026 号'],
  '检索临床评价豁免目录': ['第 5/ISAF/2026 号'],
  '编制临床评价路径判断报告': ['第 2/ISAF/2026 号'],
  '收集同品种器械和临床数据': ['第 2/ISAF/2026 号'],
  '编制等同性论证报告': ['第 2/ISAF/2026 号'],
  '编制临床评价报告 CER': ['第 2/ISAF/2026 号'],
  '判断是否需要澳门本地临床试验': ['第 2/ISAF/2026 号', '第 3/ISAF/2026 号'],
  '如需，准备临床试验预先许可资料': ['第 4/ISAF/2026 号'],
  '编制软件适用性与安全性级别判定': ['第 21/ISAF/2026 号'],
  '编制软件需求、设计、V&V 和追溯性文件': ['第 21/ISAF/2026 号'],
  '编制网络安全与现成软件评估资料': ['第 21/ISAF/2026 号'],
  '建立 QMS 适用性矩阵': ['第 16/ISAF/2026 号', '第 20/ISAF/2026 号', '第 22/ISAF/2026 号'],
  '准备 ISO 13485 证书及范围说明': ['第 16/ISAF/2026 号', '第 22/ISAF/2026 号'],
  '准备组织架构、关键人员资质、培训资料': ['第 16/ISAF/2026 号', '第 20/ISAF/2026 号', '第 22/ISAF/2026 号'],
  '准备厂房设施、洁净区布局及环境控制资料': ['第 20/ISAF/2026 号', '第 22/ISAF/2026 号'],
  '准备洁净区监测、压差、温湿度记录': ['第 20/ISAF/2026 号'],
  '准备工艺用水、设备确认、校准资料': ['第 20/ISAF/2026 号', '第 22/ISAF/2026 号'],
  '准备供应商管理和原材料控制资料': ['第 16/ISAF/2026 号', '第 20/ISAF/2026 号'],
  '准备生产过程控制与批记录模板': ['第 16/ISAF/2026 号', '第 20/ISAF/2026 号'],
  '准备质量控制、放行、不合格品控制资料': ['第 16/ISAF/2026 号', '第 20/ISAF/2026 号'],
  '准备生物安全与污染控制资料': ['第 20/ISAF/2026 号'],
  '如适用，准备 PCR/核酸扩增污染控制资料': ['第 20/ISAF/2026 号'],
  '如适用，准备无菌组件生产/采购控制资料': ['第 18/ISAF/2026 号'],
  '如适用，准备委托制造控制资料': ['第 23/ISAF/2026 号'],
  '完成注册卷宗终审': ['第 7/ISAF/2026 号'],
  '完成申请表、目录、索引和电子文件归档': ['第 7/ISAF/2026 号'],
  '正式提交澳门注册申请': ['第 7/ISAF/2026 号'],
  '建立审评问题台账': ['第 7/ISAF/2026 号'],
  '准备补充资料答复模板': ['第 7/ISAF/2026 号'],
  '评估第三方技术审评机构资料采信可能性': ['第 15/ISAF/2026 号'],
  '注册证领取与归档': ['第 7/ISAF/2026 号'],
  '建立注册续期提醒与资料包': ['第 10/ISAF/2026 号'],
  '建立注册资料变更管理机制': ['第 11/ISAF/2026 号'],
  '建立上市后质量反馈、不良事件、召回和 CAPA 管理机制': ['第 16/ISAF/2026 号', '第 20/ISAF/2026 号'],
};

async function linkTaskRegulatoryDocuments(projectId) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true, title: true },
  });

  const dispatchNos = [...new Set(tasks.flatMap((t) => TASK_REGULATORY_MAP[t.title] || []))];
  if (dispatchNos.length === 0) return;

  const docs = await prisma.regulatoryDocument.findMany({
    where: { dispatchNo: { in: dispatchNos } },
    select: { id: true, dispatchNo: true },
  });

  const docMap = Object.fromEntries(docs.map((d) => [d.dispatchNo, d.id]));
  const relations = [];
  for (const t of tasks) {
    const refs = TASK_REGULATORY_MAP[t.title] || [];
    for (const dispatchNo of refs) {
      const regulatoryDocumentId = docMap[dispatchNo];
      if (!regulatoryDocumentId) continue;
      relations.push({
        taskId: t.id,
        regulatoryDocumentId,
        relationType: 'basis',
        note: 'ISAF 2026 法规依据',
      });
    }
  }

  if (relations.length > 0) {
    await prisma.taskRegulatoryDocument.createMany({
      data: relations,
    });
  }
}

async function createTasksAndMilestonesFromTemplate(projectId, templateId, managerId) {
  if (!templateId) return;

  const template = await prisma.projectTemplate.findUnique({ where: { id: templateId } });
  if (!template) return;

  const content = parseTemplateContent(template.content);

  const tasks = [];
  let phaseOrder = 1;

  // Support both 2-tier (phases) and 3-tier (majorPhases -> subPhases) structures
  const majorPhases = content.majorPhases || content.phases || [];

  for (const majorPhase of majorPhases) {
    if (majorPhase.disabled === true) continue;

    const subPhases = majorPhase.subPhases || [];
    
    if (subPhases.length > 0) {
      // 3-tier structure: majorPhase has subPhases
      for (const subPhase of subPhases) {
        if (subPhase.disabled === true) continue;

        const subPhaseTasks = (subPhase.tasks || []).filter(
          (t) => t.enabled !== false && t.disabled !== true
        );

        for (const taskData of subPhaseTasks) {
          const [title, taskType, regulatoryPriority, applicabilityStatus] = Array.isArray(taskData)
            ? taskData
            : [taskData.title, taskData.taskType, taskData.regulatoryPriority, taskData.applicabilityStatus];

          tasks.push({
            projectId,
            title: title || '未命名任务',
            description: subPhase.name ? `子阶段：${subPhase.name}` : '',
            status: '待开始',
            priority: regulatoryPriority === 'P0' || regulatoryPriority === 'P1' ? '高' : regulatoryPriority === 'P2' ? '中' : '低',
            phase: `${majorPhase.name} > ${subPhase.name}` || null,
            phaseId: subPhase.id || majorPhase.id || null,
            phaseOrder,
            taskType: taskType || null,
            applicabilityStatus: applicabilityStatus || 'required',
            regulatoryPriority: regulatoryPriority || 'P2',
            expectedDeliverable: title || null,
            regulatoryNotes: '依据 ISAF 2026 系列医疗器械技术性指示',
            assigneeId: managerId || null,
          });
        }
        phaseOrder++;
      }
    } else {
      // 2-tier structure: majorPhase directly has tasks (for backward compatibility)
      const majorPhaseTasks = (majorPhase.tasks || []).filter(
        (t) => t.enabled !== false && t.disabled !== true
      );

      for (const taskData of majorPhaseTasks) {
        const [title, taskType, regulatoryPriority, applicabilityStatus] = Array.isArray(taskData)
          ? taskData
          : [taskData.title, taskData.taskType, taskData.regulatoryPriority, taskData.applicabilityStatus];

        tasks.push({
          projectId,
          title: title || '未命名任务',
          description: taskData.description || '',
          status: '待开始',
          priority: regulatoryPriority === 'P0' || regulatoryPriority === 'P1' ? '高' : regulatoryPriority === 'P2' ? '中' : '低',
          phase: majorPhase.name || null,
          phaseId: majorPhase.id || majorPhase.key || null,
          phaseOrder,
          taskType: taskType || null,
          applicabilityStatus: applicabilityStatus || 'required',
          regulatoryPriority: regulatoryPriority || 'P2',
          expectedDeliverable: title || null,
          regulatoryNotes: taskData.regulatoryNotes || '依据 ISAF 2026 系列医疗器械技术性指示',
          assigneeId: managerId || null,
        });
      }
      phaseOrder++;
    }
  }

  if (tasks.length > 0) {
    await prisma.task.createMany({ data: tasks });
    await linkTaskRegulatoryDocuments(projectId);
  }

  const milestones = (content.milestones || []).map((m) => ({
    projectId,
    name: m.name || '未命名里程碑',
    date: m.offsetDays ? new Date(Date.now() + m.offsetDays * 24 * 3600 * 1000) : new Date(),
    status: '待完成',
  }));

  if (milestones.length > 0) {
    await prisma.milestone.createMany({ data: milestones });
  }
}

// 注册项目列表
registrations.get('/', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const {
    page = 1,
    pageSize = 50,
    keyword,
    currentStage,
    registrationType,
    riskLevel,
    managerId,
  } = c.req.query();

  const where = {
    type: REGISTRATION_PROJECT_TYPE,
  };

  if (managerId) where.managerId = managerId;
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { code: { contains: keyword } },
      { subtype: { contains: keyword } },
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
      skip: (parseInt(page) - 1) * parseInt(pageSize),
      take: parseInt(pageSize),
      orderBy: { createdAt: 'desc' },
      include: {
        manager: { select: { id: true, name: true, position: true } },
        registrationProfile: {
          include: {
            complianceOwner: { select: { id: true, name: true, position: true } },
          },
        },
        _count: { select: { tasks: true, members: true } },
      },
    }),
  ]);

  const enhanced = list.map((item) => {
    const daysLeft = calcDaysLeft(item.registrationProfile?.expectedApprovalDate);
    const alertLevel =
      daysLeft == null
        ? 'none'
        : daysLeft < 0
          ? 'overdue'
          : daysLeft <= 7
            ? 'critical'
            : daysLeft <= 30
              ? 'warning'
              : 'normal';

    return {
      ...item,
      due: {
        daysLeft,
        alertLevel,
      },
    };
  });

  return c.json({ list: enhanced, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 统计
registrations.get('/stats', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const projects = await prisma.project.findMany({
    where: { type: REGISTRATION_PROJECT_TYPE },
    include: { registrationProfile: true },
  });

  const byStage = {};
  const byRisk = {};
  let overdueCount = 0;
  let dueSoonCount = 0;

  for (const p of projects) {
    const stage = p.registrationProfile?.currentStage || '未设置';
    const risk = p.registrationProfile?.riskLevel || '中';
    byStage[stage] = (byStage[stage] || 0) + 1;
    byRisk[risk] = (byRisk[risk] || 0) + 1;

    const daysLeft = calcDaysLeft(p.registrationProfile?.expectedApprovalDate);
    if (daysLeft != null && daysLeft < 0) overdueCount += 1;
    if (daysLeft != null && daysLeft >= 0 && daysLeft <= 30) dueSoonCount += 1;
  }

  return c.json({
    total: projects.length,
    byStage,
    byRisk,
    overdueCount,
    dueSoonCount,
  });
});

// 可用模板
registrations.get('/templates', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const list = await prisma.projectTemplate.findMany({
    where: {
      status: 'active',
      OR: [{ category: 'registration' }, { code: { startsWith: 'TPL-REGISTRATION' } }],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, code: true, name: true, description: true, category: true, type: true },
  });

  return c.json({ list });
});

// 获取注册项目详情
registrations.get('/:id', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.view')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const item = await prisma.project.findFirst({
    where: { id, type: REGISTRATION_PROJECT_TYPE },
    include: {
      manager: { select: { id: true, name: true, position: true, avatar: true } },
      template: { select: { id: true, name: true, code: true, category: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, position: true, avatar: true } },
        },
      },
      tasks: {
        orderBy: [{ phaseOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          regulatoryDocuments: {
            include: {
              regulatoryDocument: {
                select: {
                  dispatchNo: true,
                  title: true,
                  priorityLevel: true,
                },
              },
            },
          },
        },
      },
      milestones: { orderBy: { date: 'asc' } },
      registrationProfile: {
        include: {
          complianceOwner: { select: { id: true, name: true, position: true } },
        },
      },
    },
  });

  if (!item) {
    return c.json({ error: '注册项目不存在' }, 404);
  }

  const currentStage = item.registrationProfile?.currentStage || '资料准备';
  return c.json({
    ...item,
    stageOptions: REGISTRATION_STAGES,
    allowedStageTransitions: getAllowedStageTransitions(currentStage),
    due: {
      daysLeft: calcDaysLeft(item.registrationProfile?.expectedApprovalDate),
    },
  });
});

// 创建注册项目
registrations.post('/', async (c) => {
  const role = c.get('userRole');
  const userId = c.get('userId');
  if (!hasPerm(role, 'registrations.edit')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const body = await c.req.json();
  if (!body?.name) {
    return c.json({ error: '项目名称不能为空' }, 400);
  }

  const managerId = body.managerId || userId;
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const endDate = body.endDate ? new Date(body.endDate) : null;

  const created = await prisma.project.create({
    data: {
      code: body.code || `REG-${Date.now()}`,
      name: body.name,
      type: REGISTRATION_PROJECT_TYPE,
      subtype: body.subtype || body.registrationType || 'IVD',
      status: body.status || '规划中',
      position: body.position || body.notes || null,
      managerId,
      templateId: body.templateId || null,
      startDate,
      endDate,
      registrationProfile: {
        create: {
          registrationType: body.registrationType || body.subtype || 'IVD',
          region: body.region || null,
          authority: body.authority || null,
          submissionNo: body.submissionNo || null,
          certificateNo: body.certificateNo || null,
          currentStage: body.currentStage || '资料准备',
          plannedSubmissionDate: body.plannedSubmissionDate ? new Date(body.plannedSubmissionDate) : null,
          expectedApprovalDate: body.expectedApprovalDate ? new Date(body.expectedApprovalDate) : null,
          complianceOwnerId: body.complianceOwnerId || null,
          riskLevel: body.riskLevel || '中',
          notes: body.notes || null,
        },
      },
    },
    include: {
      manager: { select: { id: true, name: true, position: true } },
      registrationProfile: true,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: created.id,
        userId: managerId,
      },
    },
    create: {
      projectId: created.id,
      userId: managerId,
      role: 'manager',
    },
    update: {
      role: 'manager',
    },
  });

  await createTasksAndMilestonesFromTemplate(created.id, body.templateId, managerId);

  return c.json(created, 201);
});

// 更新注册项目
registrations.put('/:id', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.edit')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await prisma.project.findFirst({
    where: { id, type: REGISTRATION_PROJECT_TYPE },
    select: { id: true },
  });
  if (!existing) {
    return c.json({ error: '注册项目不存在' }, 404);
  }

  const projectData = {};
  if (body.name !== undefined) projectData.name = body.name;
  if (body.status !== undefined) projectData.status = body.status;
  if (body.position !== undefined) projectData.position = body.position;
  if (body.subtype !== undefined) projectData.subtype = body.subtype;
  if (body.managerId !== undefined) projectData.managerId = body.managerId;
  if (body.startDate !== undefined) projectData.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) projectData.endDate = body.endDate ? new Date(body.endDate) : null;

  await prisma.project.update({
    where: { id },
    data: projectData,
  });

  const profilePayload = {
    registrationType: body.registrationType,
    region: body.region,
    authority: body.authority,
    submissionNo: body.submissionNo,
    certificateNo: body.certificateNo,
    currentStage: body.currentStage,
    plannedSubmissionDate: body.plannedSubmissionDate,
    expectedApprovalDate: body.expectedApprovalDate,
    complianceOwnerId: body.complianceOwnerId,
    riskLevel: body.riskLevel,
    notes: body.notes,
  };

  const hasProfileFields = Object.values(profilePayload).some((v) => v !== undefined);
  if (hasProfileFields) {
    if (body.currentStage !== undefined) {
      const currentProfile = await prisma.projectRegistrationProfile.findUnique({
        where: { projectId: id },
        select: { currentStage: true },
      });
      const fromStage = currentProfile?.currentStage || '资料准备';
      const toStage = body.currentStage;
      if (fromStage !== toStage && !getAllowedStageTransitions(fromStage).includes(toStage)) {
        return c.json({
          error: '非法阶段流转',
          code: 'INVALID_STAGE_TRANSITION',
          fromStage,
          toStage,
          allowedTransitions: getAllowedStageTransitions(fromStage),
        }, 422);
      }
    }

    await prisma.projectRegistrationProfile.upsert({
      where: { projectId: id },
      update: {
        registrationType: body.registrationType,
        region: body.region,
        authority: body.authority,
        submissionNo: body.submissionNo,
        certificateNo: body.certificateNo,
        currentStage: body.currentStage,
        plannedSubmissionDate: body.plannedSubmissionDate ? new Date(body.plannedSubmissionDate) : null,
        expectedApprovalDate: body.expectedApprovalDate ? new Date(body.expectedApprovalDate) : null,
        complianceOwnerId: body.complianceOwnerId,
        riskLevel: body.riskLevel,
        notes: body.notes,
      },
      create: {
        projectId: id,
        registrationType: body.registrationType || 'IVD',
        region: body.region || null,
        authority: body.authority || null,
        submissionNo: body.submissionNo || null,
        certificateNo: body.certificateNo || null,
        currentStage: body.currentStage || '资料准备',
        plannedSubmissionDate: body.plannedSubmissionDate ? new Date(body.plannedSubmissionDate) : null,
        expectedApprovalDate: body.expectedApprovalDate ? new Date(body.expectedApprovalDate) : null,
        complianceOwnerId: body.complianceOwnerId || null,
        riskLevel: body.riskLevel || '中',
        notes: body.notes || null,
      },
    });
  }

  const updated = await prisma.project.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true, position: true } },
      registrationProfile: {
        include: {
          complianceOwner: { select: { id: true, name: true, position: true } },
        },
      },
    },
  });

  return c.json(updated);
});

// 阶段推进（严格按状态机）
registrations.patch('/:id/stage', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.edit')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const toStage = body?.toStage;

  if (!toStage) {
    return c.json({ error: '目标阶段不能为空' }, 400);
  }

  if (!REGISTRATION_STAGES.includes(toStage)) {
    return c.json({ error: '目标阶段非法' }, 400);
  }

  const existing = await prisma.project.findFirst({
    where: { id, type: REGISTRATION_PROJECT_TYPE },
    include: { registrationProfile: true },
  });
  if (!existing) {
    return c.json({ error: '注册项目不存在' }, 404);
  }

  const fromStage = existing.registrationProfile?.currentStage || '资料准备';
  const canApprove = hasPerm(role, 'registrations.approve');
  const canTransition = getAllowedStageTransitions(fromStage).includes(toStage);

  if (!canTransition && !canApprove) {
    return c.json({
      error: '非法阶段流转',
      code: 'INVALID_STAGE_TRANSITION',
      fromStage,
      toStage,
      allowedTransitions: getAllowedStageTransitions(fromStage),
    }, 422);
  }

  const profile = await prisma.projectRegistrationProfile.upsert({
    where: { projectId: id },
    update: { currentStage: toStage },
    create: {
      projectId: id,
      registrationType: existing.subtype || 'IVD',
      currentStage: toStage,
      riskLevel: '中',
    },
  });

  return c.json({
    success: true,
    fromStage,
    toStage,
    profile,
  });
});

// 单独更新档案
registrations.patch('/:id/profile', async (c) => {
  const role = c.get('userRole');
  if (!hasPerm(role, 'registrations.edit')) {
    return c.json({ error: 'Forbidden', code: 403 }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await prisma.project.findFirst({
    where: { id, type: REGISTRATION_PROJECT_TYPE },
    select: { id: true },
  });
  if (!existing) {
    return c.json({ error: '注册项目不存在' }, 404);
  }

  const profile = await prisma.projectRegistrationProfile.upsert({
    where: { projectId: id },
    update: {
      registrationType: body.registrationType,
      region: body.region,
      authority: body.authority,
      submissionNo: body.submissionNo,
      certificateNo: body.certificateNo,
      currentStage: body.currentStage,
      plannedSubmissionDate: body.plannedSubmissionDate ? new Date(body.plannedSubmissionDate) : null,
      expectedApprovalDate: body.expectedApprovalDate ? new Date(body.expectedApprovalDate) : null,
      complianceOwnerId: body.complianceOwnerId,
      riskLevel: body.riskLevel,
      notes: body.notes,
    },
    create: {
      projectId: id,
      registrationType: body.registrationType || 'IVD',
      region: body.region || null,
      authority: body.authority || null,
      submissionNo: body.submissionNo || null,
      certificateNo: body.certificateNo || null,
      currentStage: body.currentStage || '资料准备',
      plannedSubmissionDate: body.plannedSubmissionDate ? new Date(body.plannedSubmissionDate) : null,
      expectedApprovalDate: body.expectedApprovalDate ? new Date(body.expectedApprovalDate) : null,
      complianceOwnerId: body.complianceOwnerId || null,
      riskLevel: body.riskLevel || '中',
      notes: body.notes || null,
    },
    include: {
      complianceOwner: {
        select: { id: true, name: true, position: true },
      },
    },
  });

  return c.json(profile);
});

export default registrations;
