import { PrismaClient } from '@prisma/client';
import pkg from 'bcryptjs';
const bcrypt = pkg;

const prisma = new PrismaClient();

const ISAF_REGULATORY_DOCUMENTS = [
  { dispatchNo: '第 1/ISAF/2026 号', title: '医疗器械分类规则及技术要求', category: 'classification', applicability: 'core', applicableToIvd: true, priorityLevel: 'P0' },
  { dispatchNo: '第 2/ISAF/2026 号', title: '医疗器械临床评价的具体要求', category: 'clinical_evaluation', applicability: 'core', applicableToIvd: true, priorityLevel: 'P0' },
  { dispatchNo: '第 3/ISAF/2026 号', title: '医疗器械临床试验质量管理规范', category: 'clinical_trial', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P1' },
  { dispatchNo: '第 4/ISAF/2026 号', title: '临床试验预先许可资料编制及技术要求', category: 'clinical_trial_permission', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P1' },
  { dispatchNo: '第 5/ISAF/2026 号', title: '豁免进行临床评价目录', category: 'clinical_evaluation_exemption', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P1' },
  { dispatchNo: '第 6/ISAF/2026 号', title: '通用名称、标签及说明书技术要求', category: 'labeling', applicability: 'core', applicableToIvd: true, priorityLevel: 'P0' },
  { dispatchNo: '第 7/ISAF/2026 号', title: '注册资料编制及技术要求', category: 'registration_dossier', applicability: 'core', applicableToIvd: true, priorityLevel: 'P0' },
  { dispatchNo: '第 8/ISAF/2026 号', title: '优先审批具体要求', category: 'priority_review', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P2' },
  { dispatchNo: '第 9/ISAF/2026 号', title: '附条件批准注册具体要求', category: 'conditional_approval', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P2' },
  { dispatchNo: '第 10/ISAF/2026 号', title: '注册续期资料编制及技术要求', category: 'renewal', applicability: 'post_market', applicableToIvd: true, priorityLevel: 'P2' },
  { dispatchNo: '第 11/ISAF/2026 号', title: '注册资料变更资料编制及技术要求', category: 'registration_change', applicability: 'post_market', applicableToIvd: true, priorityLevel: 'P2' },
  { dispatchNo: '第 12/ISAF/2026 号', title: '备案资料编制及技术要求', category: 'filing', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P3' },
  { dispatchNo: '第 13/ISAF/2026 号', title: '备案资料变更资料要求', category: 'filing_change', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P3' },
  { dispatchNo: '第 14/ISAF/2026 号', title: '不适用注册及备案制度产品批准资料要求', category: 'special_approval', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P3' },
  { dispatchNo: '第 15/ISAF/2026 号', title: '第三方技术审评机构名单', category: 'third_party_review', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P1' },
  { dispatchNo: '第 16/ISAF/2026 号', title: '医疗器械生产质量管理规范', category: 'qms', applicability: 'core', applicableToIvd: true, priorityLevel: 'P0' },
  { dispatchNo: '第 17/ISAF/2026 号', title: '定制式义齿生产质量管理规范', category: 'qms_special', applicability: 'not_applicable', applicableToIvd: false, priorityLevel: 'P4' },
  { dispatchNo: '第 18/ISAF/2026 号', title: '无菌医疗器械生产质量管理规范', category: 'qms_sterile', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P3' },
  { dispatchNo: '第 19/ISAF/2026 号', title: '植入式医疗器械生产质量管理规范', category: 'qms_implantable', applicability: 'not_applicable', applicableToIvd: false, priorityLevel: 'P4' },
  { dispatchNo: '第 20/ISAF/2026 号', title: '体外诊断试剂生产质量管理规范', category: 'qms_ivd', applicability: 'core', applicableToIvd: true, priorityLevel: 'P0' },
  { dispatchNo: '第 21/ISAF/2026 号', title: '医疗器械独立软件生产质量管理规范', category: 'software_qms', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P1' },
  { dispatchNo: '第 22/ISAF/2026 号', title: '制造活动 QMS 文件编制及技术要求', category: 'manufacturing_qms_documentation', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P1' },
  { dispatchNo: '第 23/ISAF/2026 号', title: '委托制造许可技术要求', category: 'contract_manufacturing', applicability: 'conditional', applicableToIvd: true, priorityLevel: 'P3' },
  { dispatchNo: '第 24/ISAF/2026 号', title: '医疗器械制造厂命名规则', category: 'manufacturer_naming', applicability: 'low_relevance', applicableToIvd: false, priorityLevel: 'P4' },
  { dispatchNo: '第 25/ISAF/2026 号', title: '制造厂可制造其他卫生健康产品类型', category: 'manufacturer_other_products', applicability: 'low_relevance', applicableToIvd: false, priorityLevel: 'P4' },
  { dispatchNo: '第 26/ISAF/2026 号', title: '可取得第 III 类医疗器械的其他特定场所', category: 'distribution_access', applicability: 'low_relevance', applicableToIvd: false, priorityLevel: 'P4' },
];

const REG_66_PHASES = [
  {
    id: 'reg_phase_1',
    order: 1,
    name: '产品分类与注册策略制定',
    tasks: [
      ['明确产品预期用途、适用人群、样本类型和检测场景', 'classification', 'P0', 'required'],
      ['明确10项病原体检测靶标及临床意义', 'classification', 'P0', 'required'],
      ['确认产品是否属于体外诊断医疗器械', 'classification', 'P0', 'required'],
      ['逐条适用 IVD 分类规则并形成记录', 'classification', 'P0', 'required'],
      ['编制澳门医疗器械分类判定报告', 'classification', 'P0', 'required'],
      ['判断注册路径或备案路径', 'strategy', 'P0', 'required'],
      ['判断是否可申请优先审批', 'strategy', 'P2', 'conditional'],
      ['判断是否可申请附条件批准', 'strategy', 'P2', 'conditional'],
      ['建立 ISAF 2026 法规适用性矩阵', 'strategy', 'P0', 'required'],
      ['确定总体注册申报策略与时间表', 'strategy', 'P0', 'required'],
    ],
  },
  {
    id: 'reg_phase_2',
    order: 2,
    name: '注册技术文件与产品资料准备',
    tasks: [
      ['按第7号批示建立注册卷宗目录', 'registration_dossier', 'P0', 'required'],
      ['编制资料位置索引表', 'registration_dossier', 'P0', 'required'],
      ['编制符合性声明', 'registration_dossier', 'P0', 'required'],
      ['编制产品基本信息表', 'registration_dossier', 'P0', 'required'],
      ['编制产品组成、型号规格、工作原理说明', 'registration_dossier', 'P0', 'required'],
      ['编制产品技术要求', 'registration_dossier', 'P0', 'required'],
      ['编制检验方法与验收标准', 'registration_dossier', 'P0', 'required'],
      ['编制主要原材料清单及质量标准', 'qms', 'P0', 'required'],
      ['编制生产工艺流程图', 'qms', 'P0', 'required'],
      ['编制风险管理计划与报告', 'registration_dossier', 'P0', 'required'],
      ['编制设计开发文件', 'registration_dossier', 'P0', 'required'],
      ['编制稳定性研究方案', 'performance_validation', 'P1', 'required'],
      ['编制通用名称合规性审核表', 'labeling', 'P0', 'required'],
      ['编制标签、说明书、包装标识', 'labeling', 'P0', 'required'],
      ['完成中文/葡文资料一致性核对', 'labeling', 'P0', 'required'],
    ],
  },
  {
    id: 'reg_phase_3',
    order: 3,
    name: '性能验证、临床评价与软件确认',
    tasks: [
      ['制定分析性能验证总体方案', 'performance_validation', 'P0', 'required'],
      ['完成10项病原体 LOD 验证', 'performance_validation', 'P0', 'required'],
      ['完成包容性研究', 'performance_validation', 'P1', 'required'],
      ['完成交叉反应/特异性研究', 'performance_validation', 'P0', 'required'],
      ['完成干扰物质研究', 'performance_validation', 'P1', 'required'],
      ['完成精密度、重复性、再现性研究', 'performance_validation', 'P0', 'required'],
      ['完成阳性/阴性符合率研究', 'performance_validation', 'P0', 'required'],
      ['完成稳定性研究报告', 'performance_validation', 'P0', 'required'],
      ['检索临床评价豁免目录', 'clinical_evaluation', 'P1', 'required'],
      ['编制临床评价路径判断报告', 'clinical_evaluation', 'P0', 'required'],
      ['收集同品种器械和临床数据', 'clinical_evaluation', 'P1', 'conditional'],
      ['编制等同性论证报告', 'clinical_evaluation', 'P1', 'conditional'],
      ['编制临床评价报告 CER', 'clinical_evaluation', 'P0', 'required'],
      ['判断是否需要澳门本地临床试验', 'clinical_evaluation', 'P1', 'required'],
      ['如需，准备临床试验预先许可资料', 'clinical_evaluation', 'P1', 'conditional'],
      ['编制软件适用性与安全性级别判定', 'software', 'P1', 'conditional'],
      ['编制软件需求、设计、V&V 和追溯性文件', 'software', 'P1', 'conditional'],
      ['编制网络安全与现成软件评估资料', 'software', 'P1', 'conditional'],
    ],
  },
  {
    id: 'reg_phase_4',
    order: 4,
    name: 'QMS、生产质量与注册提交',
    tasks: [
      ['建立 QMS 适用性矩阵', 'qms', 'P0', 'required'],
      ['准备 ISO 13485 证书及范围说明', 'qms', 'P1', 'required'],
      ['准备组织架构、关键人员资质、培训资料', 'qms', 'P0', 'required'],
      ['准备厂房设施、洁净区布局及环境控制资料', 'qms', 'P0', 'required'],
      ['准备洁净区监测、压差、温湿度记录', 'qms', 'P0', 'required'],
      ['准备工艺用水、设备确认、校准资料', 'qms', 'P1', 'required'],
      ['准备供应商管理和原材料控制资料', 'qms', 'P0', 'required'],
      ['准备生产过程控制与批记录模板', 'qms', 'P0', 'required'],
      ['准备质量控制、放行、不合格品控制资料', 'qms', 'P0', 'required'],
      ['准备生物安全与污染控制资料', 'qms', 'P0', 'required'],
      ['如适用，准备 PCR/核酸扩增污染控制资料', 'qms', 'P1', 'conditional'],
      ['如适用，准备无菌组件生产/采购控制资料', 'qms', 'P3', 'conditional'],
      ['如适用，准备委托制造控制资料', 'qms', 'P3', 'conditional'],
      ['完成注册卷宗终审', 'submission', 'P0', 'required'],
      ['完成申请表、目录、索引和电子文件归档', 'submission', 'P0', 'required'],
      ['正式提交澳门注册申请', 'submission', 'P0', 'required'],
    ],
  },
  {
    id: 'reg_phase_5',
    order: 5,
    name: '审评、批准与上市后管理',
    tasks: [
      ['建立审评问题台账', 'submission', 'P1', 'required'],
      ['准备补充资料答复模板', 'submission', 'P1', 'required'],
      ['评估第三方技术审评机构资料采信可能性', 'strategy', 'P2', 'conditional'],
      ['注册证领取与归档', 'post_market', 'P1', 'required'],
      ['建立注册续期提醒与资料包', 'post_market', 'P2', 'required'],
      ['建立注册资料变更管理机制', 'post_market', 'P2', 'required'],
      ['建立上市后质量反馈、不良事件、召回和 CAPA 管理机制', 'post_market', 'P2', 'required'],
    ],
  },
];

function buildRegistration66TemplateContent() {
  // 3-tier structure: majorPhase -> subPhase -> tasks
  const majorPhases = [
    {
      id: 'major_phase_1',
      order: 1,
      name: '产品分类与注册策略制定',
      color: '#3B82F6',
      subPhases: [
        {
          id: 'sub_phase_1_1',
          order: 1,
          name: '产品定义与分类',
          tasks: [
            ['明确产品预期用途、适用人群、样本类型和检测场景', 'classification', 'P0', 'required'],
            ['明确10项病原体检测靶标及临床意义', 'classification', 'P0', 'required'],
            ['确认产品是否属于体外诊断医疗器械', 'classification', 'P0', 'required'],
            ['逐条适用 IVD 分类规则并形成记录', 'classification', 'P0', 'required'],
            ['编制澳门医疗器械分类判定报告', 'classification', 'P0', 'required'],
          ],
        },
        {
          id: 'sub_phase_1_2',
          order: 2,
          name: '注册策略',
          tasks: [
            ['判断注册路径或备案路径', 'strategy', 'P0', 'required'],
            ['判断是否可申请优先审批', 'strategy', 'P2', 'conditional'],
            ['判断是否可申请附条件批准', 'strategy', 'P2', 'conditional'],
            ['确定总体注册申报策略与时间表', 'strategy', 'P0', 'required'],
          ],
        },
        {
          id: 'sub_phase_1_3',
          order: 3,
          name: '法规适用性',
          tasks: [
            ['建立 ISAF 2026 法规适用性矩阵', 'strategy', 'P0', 'required'],
          ],
        },
      ],
    },
    {
      id: 'major_phase_2',
      order: 2,
      name: '注册技术文件与产品资料准备',
      color: '#8B5CF6',
      subPhases: [
        {
          id: 'sub_phase_2_1',
          order: 1,
          name: '注册卷宗',
          tasks: [
            ['按第7号批示建立注册卷宗目录', 'registration_dossier', 'P0', 'required'],
            ['编制资料位置索引表', 'registration_dossier', 'P0', 'required'],
            ['编制符合性声明', 'registration_dossier', 'P0', 'required'],
            ['编制产品基本信息表', 'registration_dossier', 'P0', 'required'],
          ],
        },
        {
          id: 'sub_phase_2_2',
          order: 2,
          name: '产品技术资料',
          tasks: [
            ['编制产品组成、型号规格、工作原理说明', 'registration_dossier', 'P0', 'required'],
            ['编制产品技术要求', 'registration_dossier', 'P0', 'required'],
            ['编制检验方法与验收标准', 'registration_dossier', 'P0', 'required'],
            ['编制主要原材料清单及质量标准', 'qms', 'P0', 'required'],
            ['编制生产工艺流程图', 'qms', 'P0', 'required'],
            ['编制风险管理计划与报告', 'registration_dossier', 'P0', 'required'],
            ['编制设计开发文件', 'registration_dossier', 'P0', 'required'],
            ['编制稳定性研究方案', 'performance_validation', 'P1', 'required'],
          ],
        },
        {
          id: 'sub_phase_2_3',
          order: 3,
          name: '标签说明书',
          tasks: [
            ['编制通用名称合规性审核表', 'labeling', 'P0', 'required'],
            ['编制标签、说明书、包装标识', 'labeling', 'P0', 'required'],
            ['完成中文/葡文资料一致性核对', 'labeling', 'P0', 'required'],
          ],
        },
      ],
    },
    {
      id: 'major_phase_3',
      order: 3,
      name: '性能验证、临床评价与软件确认',
      color: '#EC4899',
      subPhases: [
        {
          id: 'sub_phase_3_1',
          order: 1,
          name: '分析性能验证',
          tasks: [
            ['制定分析性能验证总体方案', 'performance_validation', 'P0', 'required'],
            ['完成10项病原体 LOD 验证', 'performance_validation', 'P0', 'required'],
            ['完成包容性研究', 'performance_validation', 'P1', 'required'],
            ['完成交叉反应/特异性研究', 'performance_validation', 'P0', 'required'],
            ['完成干扰物质研究', 'performance_validation', 'P1', 'required'],
            ['完成精密度、重复性、再现性研究', 'performance_validation', 'P0', 'required'],
            ['完成阳性/阴性符合率研究', 'performance_validation', 'P0', 'required'],
            ['完成稳定性研究报告', 'performance_validation', 'P0', 'required'],
          ],
        },
        {
          id: 'sub_phase_3_2',
          order: 2,
          name: '临床评价',
          tasks: [
            ['检索临床评价豁免目录', 'clinical_evaluation', 'P1', 'required'],
            ['编制临床评价路径判断报告', 'clinical_evaluation', 'P0', 'required'],
            ['收集同品种器械和临床数据', 'clinical_evaluation', 'P1', 'conditional'],
            ['编制等同性论证报告', 'clinical_evaluation', 'P1', 'conditional'],
            ['编制临床评价报告 CER', 'clinical_evaluation', 'P0', 'required'],
            ['判断是否需要澳门本地临床试验', 'clinical_evaluation', 'P1', 'required'],
            ['如需，准备临床试验预先许可资料', 'clinical_evaluation', 'P1', 'conditional'],
          ],
        },
        {
          id: 'sub_phase_3_3',
          order: 3,
          name: '软件确认',
          tasks: [
            ['编制软件适用性与安全性级别判定', 'software', 'P1', 'conditional'],
            ['编制软件需求、设计、V&V 和追溯性文件', 'software', 'P1', 'conditional'],
            ['编制网络安全与现成软件评估资料', 'software', 'P1', 'conditional'],
          ],
        },
      ],
    },
    {
      id: 'major_phase_4',
      order: 4,
      name: 'QMS、生产质量与注册提交',
      color: '#F59E0B',
      subPhases: [
        {
          id: 'sub_phase_4_1',
          order: 1,
          name: '质量管理体系',
          tasks: [
            ['建立 QMS 适用性矩阵', 'qms', 'P0', 'required'],
            ['准备 ISO 13485 证书及范围说明', 'qms', 'P1', 'required'],
            ['准备组织架构、关键人员资质、培训资料', 'qms', 'P0', 'required'],
            ['准备厂房设施、洁净区布局及环境控制资料', 'qms', 'P0', 'required'],
            ['准备洁净区监测、压差、温湿度记录', 'qms', 'P0', 'required'],
            ['准备工艺用水、设备确认、校准资料', 'qms', 'P1', 'required'],
          ],
        },
        {
          id: 'sub_phase_4_2',
          order: 2,
          name: '生产与污染控制',
          tasks: [
            ['准备供应商管理和原材料控制资料', 'qms', 'P0', 'required'],
            ['准备生产过程控制与批记录模板', 'qms', 'P0', 'required'],
            ['准备质量控制、放行、不合格品控制资料', 'qms', 'P0', 'required'],
            ['准备生物安全与污染控制资料', 'qms', 'P0', 'required'],
            ['如适用，准备 PCR/核酸扩增污染控制资料', 'qms', 'P1', 'conditional'],
            ['如适用，准备无菌组件生产/采购控制资料', 'qms', 'P3', 'conditional'],
            ['如适用，准备委托制造控制资料', 'qms', 'P3', 'conditional'],
          ],
        },
        {
          id: 'sub_phase_4_3',
          order: 3,
          name: '注册提交',
          tasks: [
            ['完成注册卷宗终审', 'submission', 'P0', 'required'],
            ['完成申请表、目录、索引和电子文件归档', 'submission', 'P0', 'required'],
            ['正式提交澳门注册申请', 'submission', 'P0', 'required'],
          ],
        },
      ],
    },
    {
      id: 'major_phase_5',
      order: 5,
      name: '审评、批准与上市后管理',
      color: '#10B981',
      subPhases: [
        {
          id: 'sub_phase_5_1',
          order: 1,
          name: '审评管理',
          tasks: [
            ['建立审评问题台账', 'submission', 'P1', 'required'],
            ['准备补充资料答复模板', 'submission', 'P1', 'required'],
            ['评估第三方技术审评机构资料采信可能性', 'strategy', 'P2', 'conditional'],
          ],
        },
        {
          id: 'sub_phase_5_2',
          order: 2,
          name: '批准归档',
          tasks: [
            ['注册证领取与归档', 'post_market', 'P1', 'required'],
          ],
        },
        {
          id: 'sub_phase_5_3',
          order: 3,
          name: '上市后管理',
          tasks: [
            ['建立注册续期提醒与资料包', 'post_market', 'P2', 'required'],
            ['建立注册资料变更管理机制', 'post_market', 'P2', 'required'],
            ['建立上市后质量反馈、不良事件、召回和 CAPA 管理机制', 'post_market', 'P2', 'required'],
          ],
        },
      ],
    },
  ];

  const phases = majorPhases.map((phase, index) => {
    const subPhases = phase.subPhases.map((subPhase, subIndex) => ({
      id: subPhase.id,
      order: subPhase.order,
      name: subPhase.name,
      enabled: true,
      tasks: subPhase.tasks.map((task, taskIndex) => ({
        id: `${subPhase.id}_task_${taskIndex + 1}`,
        title: task[0],
        category: task[1],
        priority: task[2],
        estimatedDays: task[2] === 'P0' ? 3 : task[2] === 'P1' ? 2 : 1,
        role: task[3] || 'required',
        source: 'self',
        enabled: true,
      })),
    }));

    return {
      id: phase.id,
      order: phase.order,
      name: phase.name,
      color: phase.color,
      enabled: true,
      type: 'normal',
      source: 'self',
      allowSkip: false,
      completionTip: '',
      nextPhaseIds: majorPhases[index + 1] ? [majorPhases[index + 1].id] : [],
      subPhases,
      tasks: subPhases.flatMap((subPhase) => subPhase.tasks),
      events: [],
    };
  });

  return JSON.stringify({
    phases,
    milestones: [
      { name: '完成分类与策略', offsetDays: 14 },
      { name: '完成卷宗与技术资料', offsetDays: 45 },
      { name: '完成验证与临床评价', offsetDays: 90 },
      { name: '完成提交', offsetDays: 120 },
      { name: '完成取证归档', offsetDays: 180 },
    ],
    defaults: { priority: '中' },
  });
}

async function main() {
  console.log('🌱 开始初始化数据...');

  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      name: '管理员',
      role: 'admin',
      status: 'active'
    }
  });
  console.log('✅ 管理员创建成功:', admin.username);

  const memberPassword = await bcrypt.hash('123456', 10);
  const users = [
    { username: 'gll', name: '谷磊磊', position: '研发工程师' },
    { username: 'lyq', name: '李应钦', position: '硬件工程师' },
    { username: 'zyx', name: '章烨鑫', position: '软件工程师' }
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { username: userData.username },
      update: {},
      create: {
        username: userData.username,
        password: memberPassword,
        name: userData.name,
        position: userData.position,
        role: 'member',
        status: 'active'
      }
    });
    console.log('✅ 用户创建成功:', user.name);
  }

  // 项目注册管理模板（升级到法规驱动66任务）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REGISTRATION-IVD' },
    update: {
      name: '项目注册管理（IVD｜法规驱动66任务）',
      description: '基于 ISAF 2026 的澳门 IVD 注册任务模板（5阶段66任务）',
      category: 'registration',
      type: 'IVD',
      content: buildRegistration66TemplateContent(),
    },
    create: {
      code: 'TPL-REGISTRATION-IVD',
      name: '项目注册管理（IVD｜法规驱动66任务）',
      description: '基于 ISAF 2026 的澳门 IVD 注册任务模板（5阶段66任务）',
      category: 'registration',
      type: 'IVD',
      content: buildRegistration66TemplateContent(),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 项目注册管理（IVD｜法规驱动66任务）');

  for (const doc of ISAF_REGULATORY_DOCUMENTS) {
    await prisma.regulatoryDocument.upsert({
      where: { dispatchNo: doc.dispatchNo },
      update: {
        title: doc.title,
        fullTitle: `${doc.dispatchNo}：${doc.title}`,
        category: doc.category,
        applicability: doc.applicability,
        applicableToIvd: doc.applicableToIvd,
        priorityLevel: doc.priorityLevel,
      },
      create: {
        dispatchNo: doc.dispatchNo,
        title: doc.title,
        fullTitle: `${doc.dispatchNo}：${doc.title}`,
        category: doc.category,
        applicability: doc.applicability,
        applicableToIvd: doc.applicableToIvd,
        priorityLevel: doc.priorityLevel,
      },
    });
  }
  console.log(`✅ 法规文件种子创建成功: ${ISAF_REGULATORY_DOCUMENTS.length} 项`);

  // 试剂/芯片母版：9阶段完整设计
  const reagentMaster = await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-MASTER' },
    update: {},
    create: {
      code: 'TPL-REAGENT-MASTER',
      name: '🧪 试剂/芯片开发 全流程模版（母版）',
      description: '包含9个阶段的完整研发流程，可作为派生模版的基础',
      category: '试剂/芯片',
      isMaster: true,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', desc: '立项申请、可行性分析、评审', source: 'inherit', tasks: [{ title: '立项申请' }, { title: '可行性分析' }, { title: '评审' }] },
          { key: 'phase2', order: 2, name: '方案设计', desc: '引物探针设计 / 外购 / 合作 / 国标引用', source: 'inherit', tasks: [{ title: '引物/探针设计' }, { title: '外购方案' }, { title: '合作评估' }, { title: '国标对照' }] },
          { key: 'phase3', order: 3, name: '样本收集', desc: '样本来源、接收记录', source: 'inherit', tasks: [{ title: '样本来源确认' }, { title: '接收记录' }] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', desc: '提取试剂筛选、程序验证', source: 'inherit', tasks: [{ title: '提取试剂筛选' }, { title: '程序验证' }, { title: '效果评估' }] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', desc: '扩增体系、参数调试', source: 'inherit', tasks: [{ title: '扩增体系优化' }, { title: '参数调试' }, { title: '敏感性/特异性测试' }] },
          { key: 'phase6', order: 6, name: '芯片试产验证', desc: '试产、实验验证、性能测试', source: 'inherit', tasks: [{ title: '样片试产' }, { title: '实验验证' }, { title: '性能测试' }, { title: '问题记录' }] },
          { key: 'phase7', order: 7, name: '量产加工', desc: '芯片量产、生产加工', source: 'inherit', tasks: [{ title: '生产工艺确认' }, { title: '量产准备' }, { title: '生产加工' }, { title: '质量检验' }] },
          { key: 'phase8', order: 8, name: '客户验证', desc: '送样、客户反馈、验证报告', source: 'inherit', tasks: [{ title: '样品送样' }, { title: '收集客户反馈' }, { title: '生成验证报告' }] },
          { key: 'phase9', order: 9, name: '归档', desc: '文档整理、知识库归档、项目总结', source: 'inherit', tasks: [{ title: '文档整理' }, { title: '知识库归档' }, { title: '项目总结' }, { title: '经验教训记录' }] }
        ],
        milestones: [{ name: '立项通过' }, { name: '样品可用' }, { name: '试产通过' }, { name: '客户验证通过' }, { name: '项目关闭' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功:', reagentMaster.name);

  // 试剂/芯片子模版：标准型（完整流程）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-STD' },
    update: {},
    create: {
      code: 'TPL-REAGENT-STD',
      name: '标准型（完整流程）',
      description: '试剂/芯片 开发-标准型，包含完整9阶段',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: reagentMaster.content,
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 标准型');

  // 试剂/芯片子模版：快速验证型（禁用阶段3、4）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-FAST' },
    update: {},
    create: {
      code: 'TPL-REAGENT-FAST',
      name: '快速验证型',
      description: '适用场景：已有提取方案，直接做扩增验证（禁用阶段3、4）',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', source: 'inherit', tasks: [{ title: '立项' }] },
          { key: 'phase2', order: 2, name: '方案设计', source: 'inherit', tasks: [{ title: '方案' }] },
          { key: 'phase3', order: 3, name: '样本收集', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', source: 'inherit', tasks: [{ title: '快速扩增验证' }] },
          { key: 'phase6', order: 6, name: '芯片试产验证', source: 'inherit', tasks: [{ title: '快速试产' }] },
          { key: 'phase7', order: 7, name: '量产加工', source: 'inherit', tasks: [{ title: '量产' }] },
          { key: 'phase8', order: 8, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase9', order: 9, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '验证通过' }],
        defaults: { priority: '高' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 快速验证型');

  // 试剂/芯片子模版：合作开发型（禁用阶段3、4、5）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-COOP' },
    update: {},
    create: {
      code: 'TPL-REAGENT-COOP',
      name: '合作开发型',
      description: '适用场景：合作方提供试剂，我方做芯片（禁用阶段3、4、5）',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', source: 'inherit', tasks: [{ title: '合作申请' }] },
          { key: 'phase2', order: 2, name: '方案设计', source: 'inherit', tasks: [{ title: '合作设计' }] },
          { key: 'phase3', order: 3, name: '样本收集', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '芯片试产验证', source: 'inherit', tasks: [{ title: '试产验证' }] },
          { key: 'phase7', order: 7, name: '量产加工', source: 'inherit', tasks: [{ title: '量产' }] },
          { key: 'phase8', order: 8, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase9', order: 9, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '合作完成' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 合作开发型');

  // 试剂/芯片子模版：性能测试型（禁用阶段2、3、4、5、7）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-PERF' },
    update: {},
    create: {
      code: 'TPL-REAGENT-PERF',
      name: '性能测试型',
      description: '适用场景：已有产品，只做性能测试（禁用阶段2、3、4、5、7）',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', source: 'inherit', tasks: [{ title: '测试计划' }] },
          { key: 'phase2', order: 2, name: '方案设计', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase3', order: 3, name: '样本收集', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '芯片试产验证', source: 'inherit', tasks: [{ title: '性能测试' }, { title: '数据分析' }] },
          { key: 'phase7', order: 7, name: '量产加工', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase8', order: 8, name: '客户验证', source: 'inherit', tasks: [{ title: '提交报告' }] },
          { key: 'phase9', order: 9, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '测试完成' }],
        defaults: { priority: '高' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 性能测试型');

  // 试剂/芯片子模版：国标引用型（禁用阶段4、5）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-STAND' },
    update: {},
    create: {
      code: 'TPL-REAGENT-STAND',
      name: '国标引用型',
      description: '适用场景：基于国标体系，跳过优化（禁用阶段4、5）',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', source: 'inherit', tasks: [{ title: '立项' }] },
          { key: 'phase2', order: 2, name: '方案设计', source: 'inherit', tasks: [{ title: '国标设计' }] },
          { key: 'phase3', order: 3, name: '样本收集', source: 'inherit', tasks: [{ title: '样本准备' }] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '芯片试产验证', source: 'inherit', tasks: [{ title: '国标验证' }] },
          { key: 'phase7', order: 7, name: '量产加工', source: 'inherit', tasks: [{ title: '量产' }] },
          { key: 'phase8', order: 8, name: '客户验证', source: 'inherit', tasks: [{ title: '检测' }] },
          { key: 'phase9', order: 9, name: '归档', source: 'inherit', tasks: [{ title: '报告' }] }
        ],
        milestones: [{ name: '国标符合' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 国标引用型');

  // 设备开发母版：11阶段完整设计
  const equipMaster = await prisma.projectTemplate.upsert({
    where: { code: 'TPL-EQUIP-MASTER' },
    update: {},
    create: {
      code: 'TPL-EQUIP-MASTER',
      name: '⚙️ 设备开发 全流程模版（母版）',
      description: '包含11个阶段的完整设备研发流程',
      category: '设备',
      isMaster: true,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '项目调研', desc: '市场调研、需求收集、竞品分析', source: 'inherit', tasks: [{ title: '市场调研' }, { title: '需求收集' }, { title: '竞品分析' }] },
          { key: 'phase2', order: 2, name: '立项审批', desc: '立项申请、审批流程', source: 'inherit', tasks: [{ title: '立项申请' }, { title: '审批流程' }] },
          { key: 'phase3', order: 3, name: '方案设计', desc: '设备结构、硬件设计、芯片设计', source: 'inherit', tasks: [{ title: '结构设计' }, { title: '硬件设计' }, { title: '芯片集成' }] },
          { key: 'phase4', order: 4, name: '设计方案评审', desc: '评审会议、评审意见', source: 'inherit', tasks: [{ title: '评审会议' }, { title: '意见处理' }] },
          { key: 'phase5', order: 5, name: '设计迭代再评审', desc: '方案修改、二次评审', source: 'inherit', tasks: [{ title: '方案修改' }, { title: '二次评审' }] },
          { key: 'phase6', order: 6, name: '采购', desc: 'BOM清单、供应商、采购跟进', source: 'inherit', tasks: [{ title: 'BOM清单' }, { title: '供应商选择' }, { title: '采购跟进' }] },
          { key: 'phase7', order: 7, name: '样机组装联调', desc: '组装、软硬件联调、问题记录', source: 'inherit', tasks: [{ title: '样机组装' }, { title: '软硬件联调' }, { title: '问题记录' }] },
          { key: 'phase8', order: 8, name: '结合芯片性能测试', desc: '整机性能测试、指标验证', source: 'inherit', tasks: [{ title: '性能测试' }, { title: '指标验证' }] },
          { key: 'phase9', order: 9, name: '加工生产', desc: '量产 / 定制版样机', source: 'inherit', tasks: [{ title: '生产工艺' }, { title: '量产准备' }, { title: '生产加工' }] },
          { key: 'phase10', order: 10, name: '客户验证', desc: '送样、客户反馈、验证报告', source: 'inherit', tasks: [{ title: '样机送样' }, { title: '客户反馈' }, { title: '验证报告' }] },
          { key: 'phase11', order: 11, name: '归档', desc: '文档整理、知识库归档', source: 'inherit', tasks: [{ title: '文档整理' }, { title: '知识库归档' }] }
        ],
        milestones: [{ name: '立项通过' }, { name: '样机完成' }, { name: '量产准备' }, { name: '客户验证通过' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功:', equipMaster.name);

  // 设备子模版：定制开发型（禁用阶段1、4、5）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-EQUIP-CUSTOM' },
    update: {},
    create: {
      code: 'TPL-EQUIP-CUSTOM',
      name: '定制开发型',
      description: '适用场景：客户需求明确，跳过调研和多轮评审（禁用阶段1、4、5）',
      category: '设备',
      parentId: equipMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '项目调研', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase2', order: 2, name: '立项审批', source: 'inherit', tasks: [{ title: '快速审批' }] },
          { key: 'phase3', order: 3, name: '方案设计', source: 'inherit', tasks: [{ title: '定制设计' }] },
          { key: 'phase4', order: 4, name: '设计方案评审', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '设计迭代再评审', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '采购', source: 'inherit', tasks: [{ title: '采购' }] },
          { key: 'phase7', order: 7, name: '样机组装联调', source: 'inherit', tasks: [{ title: '组装联调' }] },
          { key: 'phase8', order: 8, name: '结合芯片性能测试', source: 'inherit', tasks: [{ title: '性能测试' }] },
          { key: 'phase9', order: 9, name: '加工生产', source: 'inherit', tasks: [{ title: '生产' }] },
          { key: 'phase10', order: 10, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase11', order: 11, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '样机交付' }],
        defaults: { priority: '高' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 定制开发型');

  // 设备子模版：性能测试型（禁用阶段1～6）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-EQUIP-PERF' },
    update: {},
    create: {
      code: 'TPL-EQUIP-PERF',
      name: '性能测试型',
      description: '适用场景：已有样机，只做测试验证（禁用阶段1～6）',
      category: '设备',
      parentId: equipMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '项目调研', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase2', order: 2, name: '立项审批', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase3', order: 3, name: '方案设计', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase4', order: 4, name: '设计方案评审', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '设计迭代再评审', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '采购', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase7', order: 7, name: '样机组装联调', source: 'inherit', tasks: [{ title: '样机调试' }] },
          { key: 'phase8', order: 8, name: '结合芯片性能测试', source: 'inherit', tasks: [{ title: '性能测试' }, { title: '数据分析' }] },
          { key: 'phase9', order: 9, name: '加工生产', source: 'inherit', tasks: [{ title: '生产' }] },
          { key: 'phase10', order: 10, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase11', order: 11, name: '归档', source: 'inherit', tasks: [{ title: '报告' }] }
        ],
        milestones: [{ name: '测试完成' }],
        defaults: { priority: '高' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 性能测试型');

  // 设备子模版：快速迭代型（禁用阶段1、2）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-EQUIP-FAST' },
    update: {},
    create: {
      code: 'TPL-EQUIP-FAST',
      name: '快速迭代型',
      description: '适用场景：已立项，直接进入设计（禁用阶段1、2）',
      category: '设备',
      parentId: equipMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '项目调研', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase2', order: 2, name: '立项审批', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase3', order: 3, name: '方案设计', source: 'inherit', tasks: [{ title: '快速设计' }] },
          { key: 'phase4', order: 4, name: '设计方案评审', source: 'inherit', tasks: [{ title: '评审' }] },
          { key: 'phase5', order: 5, name: '设计迭代再评审', source: 'inherit', tasks: [{ title: '迭代' }] },
          { key: 'phase6', order: 6, name: '采购', source: 'inherit', tasks: [{ title: '采购' }] },
          { key: 'phase7', order: 7, name: '样机组装联调', source: 'inherit', tasks: [{ title: '快速组装' }] },
          { key: 'phase8', order: 8, name: '结合芯片性能测试', source: 'inherit', tasks: [{ title: '测试' }] },
          { key: 'phase9', order: 9, name: '加工生产', source: 'inherit', tasks: [{ title: '生产' }] },
          { key: 'phase10', order: 10, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase11', order: 11, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '样机完成' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 快速迭代型');

  // 预置：任务模板示例（首次加载时写入）
  const existingTemplates = await prisma.taskTemplate.findMany();
  if (existingTemplates.length === 0) {
    console.log('🌱 初始化任务模板示例数据...');
    const templatesToCreate = [
      {
        name: '微流控芯片制备流程',
        category: '芯片制备',
        description: '标准微流控芯片从设计到封装的完整制备流程',
        estimatedDays: 5,
        priority: 'high',
        tags: ['PDMS','光刻','键合'],
        steps: [
          { order:1, title:'掩模版设计与制作', estimatedHours:8, assigneeRole:'负责人', checklist:['确认芯片尺寸','完成CAD设计','送厂制版'] },
          { order:2, title:'PDMS浇注', estimatedHours:4, assigneeRole:'实验员', checklist:['配制PDMS（10:1）','真空脱气30min','60℃固化2h'] },
          { order:3, title:'等离子体键合', estimatedHours:2, assigneeRole:'实验员', checklist:['表面活化处理','对准键合','80℃后烘1h'] },
          { order:4, title:'功能测试', estimatedHours:3, assigneeRole:'实验员', checklist:['注水检漏','流速测试','显微镜检查'] },
        ]
      },
      {
        name: '核酸检测实验流程',
        category: '检测实验',
        description: '基于微流控平台的核酸提取与扩增检测标准流程',
        estimatedDays: 3,
        priority: 'high',
        tags: ['PCR','核酸','检测'],
        steps: [
          { order:1, title:'样本前处理', estimatedHours:2, assigneeRole:'实验员', checklist:['样本登记','裂解液配制','样本裂解'] },
          { order:2, title:'核酸提取', estimatedHours:3, assigneeRole:'实验员', checklist:['磁珠法提取','洗涤3次','洗脱'] },
          { order:3, title:'PCR扩增', estimatedHours:2, assigneeRole:'实验员', checklist:['配制反应体系','上机扩增','结果采集'] },
          { order:4, title:'数据分析与报告', estimatedHours:2, assigneeRole:'负责人', checklist:['Ct值分析','阴阳性判断','出具报告'] },
        ]
      },
      {
        name: '试剂配制与质检',
        category: '通用',
        description: '实验室常用缓冲液及试剂的配制与质量检验流程',
        estimatedDays: 1,
        priority: 'medium',
        tags: ['配制','质检','缓冲液'],
        steps: [
          { order:1, title:'原料称量', estimatedHours:1, assigneeRole:'实验员', checklist:['核对试剂名称','检查有效期','精确称量'] },
          { order:2, title:'溶液配制', estimatedHours:1, assigneeRole:'实验员', checklist:['加入80%体积超纯水','调节pH','定容至目标体积'] },
          { order:3, title:'质量检验', estimatedHours:1, assigneeRole:'负责人', checklist:['pH复测','浓度验证','外观检查'] },
          { order:4, title:'分装与标记', estimatedHours:0.5, assigneeRole:'实验员', checklist:['无菌分装','贴标签（名称/浓度/日期）','低温保存'] },
        ]
      }
    ];

    for (const t of templatesToCreate) {
      try {
        await prisma.taskTemplate.create({
          data: {
            name: t.name,
            category: t.category,
            description: t.description,
            estimatedDays: t.estimatedDays,
            priority: t.priority,
            tags: t.tags.join(','),
            steps: { create: t.steps.map(s => ({ order: s.order, title: s.title, description: s.description || null, estimatedHours: s.estimatedHours, assigneeRole: s.assigneeRole, checklist: s.checklist.join('|') })) }
          }
        });
        console.log('✅ 模板创建:', t.name);
      } catch (e) { console.error('创建模板失败', e); }
    }
  }

  // 创建示例项目
  const projects = [
    {
      code: 'PLATFORM-2.0C',
      name: '2.0C平台项目',
      type: 'platform',
      subtype: '2.0C',
      status: '进行中',
      position: '核心产品平台升级项目',
      managerId: admin.id
    },
    {
      code: 'PLATFORM-3.0',
      name: '3.0平台项目',
      type: 'platform',
      subtype: '3.0',
      status: '进行中',
      position: '新一代平台研发',
      managerId: admin.id
    },
    {
      code: 'COOP-BS',
      name: '贝索合作项目',
      type: '定制',
      subtype: '贝索',
      status: '待验证',
      position: '与贝索公司的合作项目',
      managerId: admin.id
    },
    {
      code: 'COOP-HNDX',
      name: '海南大学项目',
      type: '合作',
      subtype: '海南大学',
      status: '待加工',
      position: '海南大学联合研发项目',
      managerId: admin.id
    },
    {
      code: 'COOP-HM',
      name: '黑马合作项目',
      type: '合作',
      subtype: '黑马',
      status: '进行中',
      position: '黑马培训合作项目',
      managerId: admin.id
    },
    {
      code: 'TEST-MDX131',
      name: 'MDX131性能测试',
      type: '测试',
      subtype: 'MDX131',
      status: '进行中',
      position: 'MDX131型号设备性能测试验证',
      managerId: admin.id
    },
    {
      code: 'APP-AQUA',
      name: '水产项目',
      type: '应用',
      subtype: '水产',
      status: '进行中',
      position: '水产养殖应用场景落地',
      managerId: admin.id
    },
    {
      code: 'APP-FOOD',
      name: '食品安全检测项目',
      type: '应用',
      subtype: '食品安全',
      status: '规划中',
      position: '食品安全快速检测应用',
      managerId: admin.id
    }
  ];

  for (const projectData of projects) {
    await prisma.project.upsert({
      where: { code: projectData.code },
      update: {},
      create: projectData
    });
  }
  console.log('✅ 8个示例项目创建成功');

  // 预置试剂原料库数据（如不存在则创建）
  const materials = [
    { commonName:'Tris', chineseName:'三羟甲基氨基甲烷', englishName:'Tris base', mw:121.14 },
    { commonName:'NaCl', chineseName:'氯化钠', englishName:'Sodium Chloride', mw:58.44 },
    { commonName:'KCl', chineseName:'氯化钾', englishName:'Potassium Chloride', mw:74.55 },
    { commonName:'EDTA', chineseName:'乙二胺四乙酸二钠', englishName:'Ethylenediaminetetraacetic acid disodium salt', mw:372.24 },
    { commonName:'MgCl2', chineseName:'氯化镁', englishName:'Magnesium Chloride', mw:203.30 },
    { commonName:'CaCl2', chineseName:'氯化钙', englishName:'Calcium Chloride', mw:110.98 },
    { commonName:'HEPES', chineseName:'羟乙基哌嗪乙硫磺酸', englishName:'4-(2-hydroxyethyl)-1-piperazineethanesulfonic acid', mw:238.30 },
    { commonName:'SDS', chineseName:'十二烷基硫酸钠', englishName:'Sodium Dodecyl Sulfate', mw:288.38 },
    { commonName:'DTT', chineseName:'二硫苏糖醇', englishName:'Dithiothreitol', mw:154.25 },
    { commonName:'β-ME', chineseName:'β-巯基乙醇', englishName:'Beta-Mercaptoethanol', mw:78.13 },
    { commonName:'GITC', chineseName:'异硫氰酸胍', englishName:'Guanidinium isothiocyanate', mw:118.16 },
    { commonName:'尿素', chineseName:'尿素', englishName:'Urea', mw:60.06 },
    { commonName:'蔗糖', chineseName:'蔗糖', englishName:'Sucrose', mw:342.30 },
    { commonName:'甘油', chineseName:'甘油', englishName:'Glycerol', mw:92.09, state:'liquid', density:1.261 },
    { commonName:'BSA', chineseName:'牛血清白蛋白', englishName:'Bovine Serum Albumin', mw:66430 },
    { commonName:'Tween-20', chineseName:'吐温-20', englishName:'Polyoxyethylene sorbitan monolaurate', mw:1228.0, state:'liquid' },
    { commonName:'Triton X-100', chineseName:'曲拉通X-100', englishName:'Polyethylene glycol tert-octylphenyl ether', mw:625.0, state:'liquid' },
    { commonName:'NaOH', chineseName:'氢氧化钠', englishName:'Sodium Hydroxide', mw:40.00 },
    { commonName:'HCl', chineseName:'盐酸', englishName:'Hydrochloric acid', mw:36.46, state:'liquid', density:1.19 },
    { commonName:'KH2PO4', chineseName:'磷酸二氢钾', englishName:'Potassium dihydrogen phosphate', mw:136.09 },
    { commonName:'Na2HPO4', chineseName:'磷酸氢二钠', englishName:'Disodium hydrogen phosphate', mw:141.96 },
  ];

  for (const m of materials) {
    await prisma.reagentMaterial.upsert({
      where: { commonName: m.commonName },
      update: {},
      create: {
        commonName: m.commonName,
        chineseName: m.chineseName || null,
        englishName: m.englishName || null,
        casNumber: m.casNumber || null,
        molecularFormula: m.molecularFormula || null,
        mw: m.mw,
        purity: m.purity || 98,
        density: m.density || null,
        state: m.state || 'solid',
        defaultStockConc: m.defaultStockConc || null,
        defaultStockUnit: m.defaultStockUnit || null,
        supplier: m.supplier || null,
        notes: m.notes || null,
      }
    });
  }

  console.log('🎉 数据初始化完成！');
}

main()
  .catch((e) => {
    console.error('❌ 初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
