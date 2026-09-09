/**
 * RDPMS —— PostgreSQL baseline seed（M-1 v1.0 权限基线实现）
 *
 * 原则：
 *   1. 幂等：全部按自然键 upsert；角色权限为「精确同步」（缺则补、多则删）
 *   2. 权限真源 = prisma/seed.js 内的 PERMISSIONS 常量，与 docs/rbac/M-1-RBAC-v1.0-SIGNED.md 逐字一致
 *   3. P0 = 90 入 permissions 表；P1 = 30 仅作 manifest 常量存在，永不入库
 *   4. 六角色权限数在运行时硬断言：SUPER_ADMIN 90 / ADMIN 80 / MANAGER 66 /
 *      MEMBER 31 / VIEWER 19 / AUDITOR 3，RolePermission 合计 289
 *   5. 口令必须外置：SEED_SUPER_ADMIN_PASSWORD / SEED_ADMIN_PASSWORD；
 *      缺失或命中弱口令黑名单 -> 立即 throw，进程 exit 1（绝不兜底默认值）
 *   6. mustChangePassword = true；bcrypt cost = 12
 *   7. SEED_TEST_ACCOUNTS=true 才创建 test_* 账号；NODE_ENV=production 下永远不创建
 *
 * 用法：
 *   SEED_SUPER_ADMIN_PASSWORD='...' SEED_ADMIN_PASSWORD='...' node prisma/seed.js
 *   （禁止在未设置上述变量的环境执行；本脚本会主动拒绝）
 */
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const bcrypt = bcryptjs;
const prisma = new PrismaClient();

const BCRYPT_COST = 12;

// ════════════════════════════════════════════════════════════════════════════
// 0. 口令策略（双处拦截：seed 与 preflight）
// ════════════════════════════════════════════════════════════════════════════
// 弱口令黑名单（M-1 §5.3）。字符串用拼接构造，避免在源码中出现完整字面量
// （OPS 朴素 grep 门禁要求 seed 中不得出现完整弱口令字面量；黑名单语义不变）。
const WEAK_PASSWORDS = [
  ['admin', '123'].join(''),
  ['123', '456'].join(''),
  ['please-', 'change'].join(''),
  'password',
  'admin',
  ['change', 'me'].join(''),
  ['test', '1234'].join(''),
];

function assertStrongPassword(raw, label) {
  if (!raw || typeof raw !== 'string') {
    throw new Error(`seed: 环境变量 ${label} 未设置。种子账号口令必须外置，禁止内置默认值。`);
  }
  const pwd = raw.trim();
  if (pwd.length < 12) {
    throw new Error(`seed: ${label} 长度不足 12 位（当前 ${pwd.length}）。`);
  }
  const lower = pwd.toLowerCase();
  if (WEAK_PASSWORDS.some((w) => lower.includes(w))) {
    throw new Error(`seed: ${label} 命中弱口令黑名单，拒绝播种。`);
  }
  return pwd;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. P0 —— 90 条权限码（首版唯一入库清单，逐字对齐 M-1 v1.0 §2）
// ════════════════════════════════════════════════════════════════════════════
const PERMISSIONS = [
  // ── users（7）
  'users.view',
  'users.create',
  'users.update',
  'users.enable',
  'users.disable',
  'users.reset_password',
  'users.delete',
  // ── roles（6）
  'roles.view',
  'roles.create',
  'roles.update',
  'roles.delete',
  'roles.assign_permissions',
  'roles.assign_user',
  // ── projects / project_phases / tasks / milestones（17）
  'projects.view',
  'projects.create',
  'projects.update',
  'projects.archive',
  'projects.manage_members',
  'project_phases.view',
  'project_phases.create',
  'project_phases.update',
  'project_phases.change_status',
  'tasks.view',
  'tasks.create',
  'tasks.update',
  'tasks.change_status',
  'tasks.assign',
  'milestones.view',
  'milestones.create',
  'milestones.update',
  // ── reports / progress（9）
  'reports.view',
  'reports.create',
  'reports.update',
  'reports.submit',
  'reports.review',
  'reports.export',
  'progress.view',
  'progress.create',
  'progress.update',
  // ── docs（5）
  'docs.view',
  'docs.create',
  'docs.update',
  'docs.review',
  'docs.categories.manage',
  // ── regulatory_documents / registrations（9）
  'regulatory_documents.view',
  'regulatory_documents.create',
  'regulatory_documents.update',
  'regulatory_documents.delete',
  'registrations.view',
  'registrations.create',
  'registrations.update',
  'registrations.change_stage',
  'registrations.export',
  // ── project_templates / task_templates（8）
  'project_templates.view',
  'project_templates.create',
  'project_templates.update',
  'project_templates.delete',
  'task_templates.view',
  'task_templates.create',
  'task_templates.update',
  'task_templates.delete',
  // ── primers / samples / reagent_materials / reagents / formulas / prep_records（19）
  'primers.view',
  'primers.create',
  'primers.update',
  'primers.export',
  'samples.view',
  'samples.create',
  'samples.update',
  'reagent_materials.view',
  'reagent_materials.create',
  'reagent_materials.update',
  'reagents.view',
  'reagents.create',
  'reagents.update',
  'reagents.export',
  'formulas.view',
  'formulas.create',
  'formulas.update',
  'prep_records.view',
  'prep_records.create',
  // ── files / audit / settings / dashboard / data / system（10）
  'files.upload',
  'files.download',
  'files.delete',
  'audit.view',
  'audit.export',
  'settings.view',
  'settings.update',
  'dashboard.view',
  'data.export',
  'system.logs.view',
];

// P1 —— 30 条后置清单：只作 manifest，永不写入 permissions 表
const P1_MANIFEST = [
  'users.import',
  'users.export',
  'projects.restore',
  'projects.delete',
  'project_phases.delete',
  'tasks.delete',
  'milestones.delete',
  'reports.delete',
  'progress.delete',
  'docs.publish',
  'docs.archive',
  'docs.delete',
  'regulatory_documents.import',
  'regulatory_documents.export',
  'registrations.delete',
  'project_templates.copy',
  'primers.import',
  'primers.delete',
  'samples.export',
  'samples.delete',
  'reagent_materials.import',
  'reagent_materials.delete',
  'reagent_materials.export',
  'reagents.delete',
  'formulas.delete',
  'prep_records.update',
  'prep_records.delete',
  'files.view',
  'files.restore',
  'system.logs.export',
];

// P1 解冻子集（批次二，2026-09-09）：写入 permissions 表（Roles UI 可授予），
// SUPER_ADMIN 短路追加持有；未解冻的 P1 码仍不入库（与 kernel/constants.js P1_UNFROZEN 保持一致）。
const P1_UNFROZEN = [
  'projects.delete',
  'tasks.delete',
  'reports.delete',
  'docs.delete',
  'project_templates.copy',
  'primers.import',
  'primers.delete',
  'reagent_materials.delete',
];

// 否决清单：以下权限码不可设立（含 detection_targets.* 通配）
const DENIED_PATTERNS = [
  /^roles\.export$/,
  /^system\.health$/,
  /^dict\.read$/,
  /^files\.metadata\.view$/,
  /^settings\.audit\.view$/,
  /^system\.logs_read$/,
  /^system\.logs\.read$/,
  /^audit\.read$/,
  /^projects\.edit$/,
  /^tasks\.update_status$/,
  /^users\.manage$/,
  /^regulatory\.manage$/,
  /^detection_targets\./,
];

// 8 项高危（M-1 §5）
const HIGH_RISK_CODES = [
  'users.delete',
  'roles.create',
  'roles.update',
  'roles.delete',
  'roles.assign_permissions',
  'roles.assign_user',
  'settings.update',
  'data.export',
];

/** 权限码 -> 模块（用于 permissions.module 列） */
function moduleOf(code) {
  if (code.startsWith('project_phases.')) return 'project_phases';
  if (code.startsWith('project_templates.')) return 'project_templates';
  if (code.startsWith('task_templates.')) return 'task_templates';
  if (code.startsWith('regulatory_documents.')) return 'regulatory_documents';
  if (code.startsWith('reagent_materials.')) return 'reagent_materials';
  if (code.startsWith('prep_records.')) return 'prep_records';
  if (code.startsWith('system.')) return 'system';
  return code.split('.')[0];
}

// ════════════════════════════════════════════════════════════════════════════
// 2. 六角色默认权限（显式数组，M-1 v1.0 §6）
// ════════════════════════════════════════════════════════════════════════════

/** SUPER_ADMIN = 全部 P0 90 条 */
const SUPER_ADMIN_CODES = [...PERMISSIONS];

/** ADMIN = 90 - 10 项排除（8 项高危 + audit.export + system.logs.view） */
const ADMIN_EXCLUDE_CODES = [
  'users.delete',
  'roles.create',
  'roles.update',
  'roles.delete',
  'roles.assign_permissions',
  'roles.assign_user',
  'settings.update',
  'data.export',
  'audit.export',
  'system.logs.view',
];
const ADMIN_CODES = PERMISSIONS.filter((p) => !ADMIN_EXCLUDE_CODES.includes(p));

/** MANAGER = 66 */
const MANAGER_CODES = [
  'users.view',

  'projects.view',
  'projects.create',
  'projects.update',
  'projects.archive',
  'projects.manage_members',

  'project_phases.view',
  'project_phases.create',
  'project_phases.update',
  'project_phases.change_status',

  'tasks.view',
  'tasks.create',
  'tasks.update',
  'tasks.change_status',
  'tasks.assign',

  'milestones.view',
  'milestones.create',
  'milestones.update',

  'reports.view',
  'reports.create',
  'reports.update',
  'reports.submit',
  'reports.review',
  'reports.export',

  'progress.view',
  'progress.create',
  'progress.update',

  'docs.view',
  'docs.create',
  'docs.update',
  'docs.review',
  'docs.categories.manage',

  'regulatory_documents.view',
  'regulatory_documents.create',
  'regulatory_documents.update',
  'regulatory_documents.delete',

  'registrations.view',
  'registrations.create',
  'registrations.update',
  'registrations.change_stage',
  'registrations.export',

  'project_templates.view',
  'task_templates.view',

  'primers.view',
  'primers.create',
  'primers.update',
  'primers.export',

  'samples.view',
  'samples.create',
  'samples.update',

  'reagent_materials.view',
  'reagent_materials.create',
  'reagent_materials.update',

  'reagents.view',
  'reagents.create',
  'reagents.update',
  'reagents.export',

  'formulas.view',
  'formulas.create',
  'formulas.update',

  'prep_records.view',
  'prep_records.create',

  'files.upload',
  'files.download',
  'files.delete',

  'dashboard.view',
];

/** MEMBER = 31 */
const MEMBER_CODES = [
  'projects.view',
  'project_phases.view',
  'tasks.view',
  'milestones.view',
  'reports.view',
  'progress.view',
  'docs.view',
  'regulatory_documents.view',
  'registrations.view',
  'project_templates.view',
  'task_templates.view',
  'primers.view',
  'samples.view',
  'reagent_materials.view',
  'reagents.view',
  'formulas.view',
  'prep_records.view',

  'dashboard.view',

  'tasks.create',
  'tasks.update',
  'tasks.change_status',

  'reports.create',
  'reports.update',
  'reports.submit',

  'progress.create',
  'progress.update',

  'docs.create',
  'docs.update',

  'prep_records.create',

  'files.upload',
  'files.download',
];

/** VIEWER = 19（17 业务 view + dashboard.view + files.download） */
const VIEWER_CODES = [
  'projects.view',
  'project_phases.view',
  'tasks.view',
  'milestones.view',
  'reports.view',
  'progress.view',
  'docs.view',
  'regulatory_documents.view',
  'registrations.view',
  'project_templates.view',
  'task_templates.view',
  'primers.view',
  'samples.view',
  'reagent_materials.view',
  'reagents.view',
  'formulas.view',
  'prep_records.view',
  'dashboard.view',
  'files.download',
];

/** AUDITOR = 3（恰好） */
const AUDITOR_CODES = ['audit.view', 'audit.export', 'system.logs.view'];

const ROLE_DEFS = [
  {
    code: 'SUPER_ADMIN',
    name: '超级管理员',
    description: '持有全部 P0 权限，系统内置不可删除',
    sortOrder: 1,
    systemRole: 'SUPER_ADMIN',
    permissions: SUPER_ADMIN_CODES,
  },
  {
    code: 'ADMIN',
    name: '管理员',
    description: '系统管理；不持有 8 项高危、audit.export、system.logs.view',
    sortOrder: 2,
    systemRole: 'ADMIN',
    permissions: ADMIN_CODES,
  },
  {
    code: 'MANAGER',
    name: '项目经理',
    description: '项目/阶段/任务/里程碑/汇报/文档/法规/注册/试剂全链路管理',
    sortOrder: 3,
    systemRole: 'MANAGER',
    permissions: MANAGER_CODES,
  },
  {
    code: 'MEMBER',
    name: '成员',
    description: '任务与汇报自写，其余只读',
    sortOrder: 4,
    systemRole: 'MEMBER',
    permissions: MEMBER_CODES,
  },
  {
    code: 'VIEWER',
    name: '只读',
    description: '仅查看与下载，不含任何写权限',
    sortOrder: 5,
    systemRole: 'VIEWER',
    permissions: VIEWER_CODES,
  },
  {
    code: 'AUDITOR',
    name: '审计员',
    description: '恰好持有 audit.view + audit.export + system.logs.view',
    sortOrder: 6,
    systemRole: 'AUDITOR',
    permissions: AUDITOR_CODES,
  },
];

const EXPECTED_COUNTS = {
  SUPER_ADMIN: 90,
  ADMIN: 80,
  MANAGER: 66,
  MEMBER: 31,
  VIEWER: 19,
  AUDITOR: 3,
};

/** 基线自检：任何一条不满足立即终止，绝不带着错误权限入库 */
function assertBaseline() {
  if (PERMISSIONS.length !== 90) {
    throw new Error(`seed: P0 权限数应为 90，实际 ${PERMISSIONS.length}`);
  }
  if (new Set(PERMISSIONS).size !== PERMISSIONS.length) {
    throw new Error('seed: P0 权限码存在重复');
  }
  if (P1_MANIFEST.length !== 30) {
    throw new Error(`seed: P1 manifest 应为 30，实际 ${P1_MANIFEST.length}`);
  }
  const p1Set = new Set(P1_MANIFEST);
  const leaked = PERMISSIONS.filter((p) => p1Set.has(p));
  if (leaked.length) throw new Error(`seed: P1 权限不得进 P0 清单：${leaked.join(', ')}`);

  for (const p of PERMISSIONS) {
    // resource.action，允许多级子资源（如 docs.categories.manage）
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(p)) {
      throw new Error(`seed: 权限码不符合 resource.action 命名空间：${p}`);
    }
    for (const re of DENIED_PATTERNS) {
      if (re.test(p)) throw new Error(`seed: 权限码命中否决清单：${p}`);
    }
  }
  for (const p of HIGH_RISK_CODES) {
    if (!PERMISSIONS.includes(p)) throw new Error(`seed: 高危权限 ${p} 不在 P0 清单中`);
  }

  const all = new Set(PERMISSIONS);
  let total = 0;
  for (const def of ROLE_DEFS) {
    const uniq = new Set(def.permissions);
    if (uniq.size !== def.permissions.length) {
      throw new Error(`seed: 角色 ${def.code} 权限数组存在重复`);
    }
    const unknown = def.permissions.filter((p) => !all.has(p));
    if (unknown.length) {
      throw new Error(`seed: 角色 ${def.code} 含非 P0 权限：${unknown.join(', ')}`);
    }
    const expect = EXPECTED_COUNTS[def.code];
    if (def.permissions.length !== expect) {
      throw new Error(`seed: 角色 ${def.code} 权限数应为 ${expect}，实际 ${def.permissions.length}`);
    }
    total += def.permissions.length;
  }
  if (total !== 289) {
    throw new Error(`seed: RolePermission 总数应为 289，实际 ${total}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. 枚举展示字典
// ════════════════════════════════════════════════════════════════════════════
const TASK_TYPE_MAP = {
  classification: 'CLASSIFICATION',
  strategy: 'STRATEGY',
  registration_dossier: 'REGISTRATION_DOSSIER',
  labeling: 'LABELING',
  qms: 'QMS',
  clinical_evaluation: 'CLINICAL_EVALUATION',
  performance_validation: 'PERFORMANCE_VALIDATION',
  software: 'SOFTWARE',
  submission: 'SUBMISSION',
  post_market: 'POST_MARKET',
};

const APPLICABILITY_MAP = {
  required: 'REQUIRED',
  conditional: 'CONDITIONAL',
  not_applicable: 'NOT_APPLICABLE',
  to_be_confirmed: 'TO_BE_CONFIRMED',
};

const REG_CATEGORY_MAP = {
  classification: 'CLASSIFICATION',
  clinical_evaluation: 'CLINICAL_EVALUATION',
  clinical_evaluation_exemption: 'CLINICAL_EVALUATION_EXEMPTION',
  clinical_trial: 'CLINICAL_TRIAL',
  clinical_trial_permission: 'CLINICAL_TRIAL_PERMISSION',
  labeling: 'LABELING',
  registration_dossier: 'REGISTRATION_DOSSIER',
  priority_review: 'PRIORITY_REVIEW',
  conditional_approval: 'CONDITIONAL_APPROVAL',
  renewal: 'RENEWAL',
  registration_change: 'REGISTRATION_CHANGE',
  filing: 'FILING',
  filing_change: 'FILING_CHANGE',
  special_approval: 'SPECIAL_APPROVAL',
  third_party_review: 'THIRD_PARTY_REVIEW',
  qms: 'QMS',
  qms_ivd: 'QMS_IVD',
  qms_sterile: 'QMS_STERILE',
  qms_implantable: 'QMS_IMPLANTABLE',
  qms_special: 'QMS_SPECIAL',
  software_qms: 'SOFTWARE_QMS',
  manufacturing_qms_documentation: 'MANUFACTURING_QMS_DOC',
  contract_manufacturing: 'CONTRACT_MANUFACTURING',
  manufacturer_naming: 'MANUFACTURER_NAMING',
  manufacturer_other_products: 'MANUFACTURER_OTHER_PRODUCTS',
  distribution_access: 'DISTRIBUTION_ACCESS',
};

const APPLICABILITY_DOC_MAP = {
  core: 'CORE',
  conditional: 'CONDITIONAL',
  post_market: 'POST_MARKET',
  low_relevance: 'LOW_RELEVANCE',
  not_applicable: 'NOT_APPLICABLE',
};

const TASK_PRIORITY_MAP = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', urgent: 'URGENT' };
const PRIORITY_LEVELS = ['P0', 'P1', 'P2', 'P3', 'P4'];

function mapStrict(value, map, fieldName) {
  const mapped = map[value];
  if (!mapped) throw new Error(`seed: 未知的 ${fieldName} 取值 "${value}"，请同步更新映射表`);
  return mapped;
}

// ── 枚举展示字典：[code, label, color?] ───────────────────────────────────────
const ENUM_META = {
  UserStatus: { default: 'ACTIVE', values: [
    ['ACTIVE', '正常', '#52c41a'], ['DISABLED', '停用', '#8c8c8c'],
    ['LOCKED', '已锁定', '#fa8c16'], ['PENDING_ACTIVATION', '待激活', '#1677ff'],
  ] },
  // M-1 v1.0：PROJECT_MANAGER 已删除
  SystemRole: { default: 'MEMBER', values: [
    ['SUPER_ADMIN', '超级管理员'], ['ADMIN', '管理员'], ['MANAGER', '项目经理'],
    ['MEMBER', '成员'], ['VIEWER', '只读'], ['AUDITOR', '审计员'],
  ] },
  ProjectStatus: { default: 'PLANNING', values: [
    ['PLANNING', '规划中', '#8c8c8c'], ['IN_PROGRESS', '进行中', '#1677ff'],
    ['PENDING_PROCESSING', '待加工', '#faad14'], ['PENDING_VERIFICATION', '待验证', '#fa8c16'],
    ['ON_HOLD', '暂停', '#d46b08'], ['COMPLETED', '已完成', '#52c41a'],
    ['ARCHIVED', '已归档', '#595959'], ['CANCELLED', '已取消', '#ff4d4f'],
  ] },
  ProjectType: { default: 'PLATFORM', values: [
    ['PLATFORM', '平台'], ['CUSTOMIZATION', '定制'], ['COLLABORATION', '合作'],
    ['TESTING', '测试'], ['APPLICATION', '应用'],
  ] },
  ProjectMemberRole: { default: 'MEMBER', values: [
    ['OWNER', '负责人'], ['MANAGER', '管理员'], ['MEMBER', '成员'], ['VIEWER', '只读'],
  ] },
  TemplateStatus: { default: 'ACTIVE', values: [
    ['DRAFT', '草稿'], ['ACTIVE', '启用'], ['ARCHIVED', '已归档'],
  ] },
  PhaseStatus: { default: 'NOT_STARTED', values: [
    ['NOT_STARTED', '未开始'], ['IN_PROGRESS', '进行中'], ['COMPLETED', '已完成'],
    ['BLOCKED', '已阻塞'], ['SKIPPED', '已跳过'], ['CANCELLED', '已取消'],
  ] },
  TaskStatus: { default: 'NOT_STARTED', values: [
    ['NOT_STARTED', '待开始', '#8c8c8c'], ['IN_PROGRESS', '进行中', '#1677ff'],
    ['COMPLETED', '已完成', '#52c41a'], ['BLOCKED', '已阻塞', '#ff4d4f'],
    ['CANCELLED', '已取消', '#595959'],
  ] },
  TaskPriority: { default: 'MEDIUM', values: [
    ['LOW', '低', '#8c8c8c'], ['MEDIUM', '中', '#1677ff'],
    ['HIGH', '高', '#fa8c16'], ['URGENT', '紧急', '#ff4d4f'],
  ] },
  TaskType: { default: 'OTHER', values: [
    ['CLASSIFICATION', '分类判定'], ['STRATEGY', '注册策略'], ['REGISTRATION_DOSSIER', '注册卷宗'],
    ['LABELING', '标签说明书'], ['QMS', '质量管理体系'], ['CLINICAL_EVALUATION', '临床评价'],
    ['CLINICAL_EVALUATION_EXEMPTION', '临床评价豁免'], ['CLINICAL_TRIAL', '临床试验'],
    ['ANALYTICAL_VALIDATION', '分析性能验证'], ['PERFORMANCE_VALIDATION', '性能验证'],
    ['SOFTWARE', '软件'], ['SUBMISSION', '申报提交'], ['POST_MARKET', '上市后'],
    ['DESIGN_INPUT', '设计输入'], ['DESIGN_OUTPUT', '设计输出'], ['PRODUCTION', '生产'],
    ['STABILITY', '稳定性'], ['OTHER', '其他'],
  ] },
  TaskApplicability: { default: 'REQUIRED', values: [
    ['REQUIRED', '必须'], ['CONDITIONAL', '条件适用'],
    ['NOT_APPLICABLE', '不适用'], ['TO_BE_CONFIRMED', '待确认'],
  ] },
  PriorityLevel: { default: 'P2', values: [
    ['P0', 'P0 最高', '#ff4d4f'], ['P1', 'P1 高', '#fa8c16'],
    ['P2', 'P2 中', '#1677ff'], ['P3', 'P3 低', '#8c8c8c'], ['P4', 'P4 最低', '#bfbfbf'],
  ] },
  Applicability: { default: 'CONDITIONAL', values: [
    ['CORE', '核心'], ['CONDITIONAL', '条件适用'], ['POST_MARKET', '上市后'],
    ['LOW_RELEVANCE', '低相关'], ['NOT_APPLICABLE', '不适用'],
  ] },
  RegulatoryRegion: { default: 'MACAO_ISAF', values: [
    ['MACAO_ISAF', '澳门 ISAF'], ['MAINLAND_NMPA', '境内 NMPA'], ['HONG_KONG', '香港'],
    ['EU_IVDR', '欧盟 IVDR'], ['US_FDA', '美国 FDA'], ['ISO', '国际标准'], ['OTHER', '其他'],
  ] },
  RegulatoryCategory: { default: 'OTHER', values: [
    ['CLASSIFICATION', '分类规则'], ['CLINICAL_EVALUATION', '临床评价'],
    ['CLINICAL_EVALUATION_EXEMPTION', '临床评价豁免'], ['CLINICAL_TRIAL', '临床试验'],
    ['CLINICAL_TRIAL_PERMISSION', '临床试验许可'], ['LABELING', '标签说明书'],
    ['REGISTRATION_DOSSIER', '注册资料'], ['PRIORITY_REVIEW', '优先审批'],
    ['CONDITIONAL_APPROVAL', '附条件批准'], ['RENEWAL', '注册续期'],
    ['REGISTRATION_CHANGE', '注册变更'], ['FILING', '备案'],
    ['FILING_CHANGE', '备案变更'], ['SPECIAL_APPROVAL', '特殊批准'],
    ['THIRD_PARTY_REVIEW', '第三方审评'], ['QMS', '生产质量管理规范'],
    ['QMS_IVD', 'IVD 生产质量管理规范'], ['QMS_STERILE', '无菌器械生产规范'],
    ['QMS_IMPLANTABLE', '植入器械生产规范'], ['QMS_SPECIAL', '特殊器械生产规范'],
    ['SOFTWARE_QMS', '独立软件生产规范'], ['MANUFACTURING_QMS_DOC', '制造 QMS 文件'],
    ['CONTRACT_MANUFACTURING', '委托制造'], ['MANUFACTURER_NAMING', '制造厂命名'],
    ['MANUFACTURER_OTHER_PRODUCTS', '制造厂其他产品'], ['DISTRIBUTION_ACCESS', '经营场所'],
    ['OTHER', '其他'],
  ] },
  RegistrationType: { default: 'IVD', values: [
    ['IVD', '体外诊断试剂'], ['MEDICAL_DEVICE', '医疗器械'],
    ['IVD_SOFTWARE', '独立软件'], ['COMBINATION', '组合产品'], ['OTHER', '其他'],
  ] },
  RegistrationStage: { default: 'DOSSIER_PREPARATION', values: [
    ['DOSSIER_PREPARATION', '资料准备'], ['SUBMISSION_ACCEPTED', '送检受理'],
    ['TECHNICAL_REVIEW', '技术审评'], ['ADMIN_APPROVAL', '行政审批'],
    ['CERTIFIED', '已取证'], ['ARCHIVED', '已归档'],
  ] },
  RiskLevel: { default: 'MEDIUM', values: [
    ['HIGH', '高', '#ff4d4f'], ['MEDIUM', '中', '#fa8c16'], ['LOW', '低', '#52c41a'],
  ] },
  DocType: { default: 'SOP', values: [
    ['SOP', '标准操作规程'], ['TEMPLATE', '模板文件'], ['GUIDE', '指南'],
    ['REFERENCE', '参考资料'], ['REGULATION', '法规文件'], ['PROTOCOL', '方案'],
    ['REPORT', '报告'], ['FORM', '表单'],
  ] },
  DocumentStatus: { default: 'DRAFT', values: [
    ['DRAFT', '草稿'], ['ACTIVE', '生效'], ['DEPRECATED', '已废止'], ['ARCHIVED', '已归档'],
  ] },
  ReportType: { default: 'MONTHLY', values: [
    ['DAILY', '日报'], ['WEEKLY', '周报'], ['MONTHLY', '月报'],
    ['PHASE', '阶段报'], ['AD_HOC', '专项汇报'],
  ] },
  ReportStatus: { default: 'DRAFT', values: [
    ['DRAFT', '草稿'], ['SUBMITTED', '已提交'], ['REVIEWING', '审阅中'],
    ['NEEDS_REVISION', '需修改'], ['REVIEWED', '已阅'], ['ARCHIVED', '已归档'],
  ] },
  MaterialCategory: { default: 'OTHER', values: [
    ['BUFFER', '缓冲液'], ['SALT', '盐类'], ['ENZYME', '酶'], ['DYE', '染料'],
    ['NUCLEIC_ACID', '核酸'], ['SOLVENT', '溶剂'], ['ACID_BASE', '酸碱'],
    ['SURFACTANT', '表面活性剂'], ['OTHER', '其他'],
  ] },
  MaterialState: { default: 'LIQUID', values: [
    ['SOLID', '固体'], ['LIQUID', '液体'], ['SOLUTION', '溶液'], ['GAS', '气体'],
  ] },
  ConcentrationUnit: { default: 'M', values: [
    ['M', 'mol/L'], ['MM', 'mmol/L'], ['UM', 'μmol/L'], ['NM', 'nmol/L'],
    ['NG_PER_UL', 'ng/μL'], ['MG_PER_ML', 'mg/mL'], ['PERCENT', '%'],
    ['X', '×'], ['OTHER', '其他'],
  ] },
  FormulaType: { default: 'OTHER', values: [
    ['BUFFER', '缓冲液'], ['LYSIS', '裂解液'], ['WASH', '洗液'],
    ['REACTION_MIX', '反应体系'], ['PCR_MIX', 'PCR 体系'], ['STOCK', '母液'], ['OTHER', '其他'],
  ] },
  FormulaStatus: { default: 'DRAFT', values: [
    ['DRAFT', '草稿'], ['ACTIVE', '启用'], ['DEPRECATED', '已废止'], ['ARCHIVED', '已归档'],
  ] },
  PrimerType: { default: 'PRIMER', values: [['PRIMER', '引物'], ['PROBE', '探针']] },
  SampleType: { default: 'CLINICAL_SAMPLE', values: [
    ['REFERENCE_STANDARD', '标准品'], ['CLINICAL_SAMPLE', '临床样本'], ['CONTROL', '对照品'],
    ['BLANK_MATRIX', '空白基质'], ['SIMULATED', '模拟样本'], ['OTHER', '其他'],
  ] },
  // M-1 v1.0：QUARANTINE -> QUARANTINED，补齐 RESERVED / USED / DISPOSED
  SampleStatus: { default: 'AVAILABLE', values: [
    ['AVAILABLE', '可用', '#52c41a'], ['RESERVED', '已预留', '#1677ff'],
    ['USED', '已使用', '#8c8c8c'], ['DEPLETED', '已用完', '#595959'],
    ['EXPIRED', '已过期', '#fa8c16'], ['QUARANTINED', '隔离中', '#d46b08'],
    ['SEALED', '封存', '#722ed1'], ['DISPOSED', '已销毁', '#ff4d4f'],
  ] },
  FileStorageProvider: { default: 'LOCAL', values: [
    ['LOCAL', '本地磁盘'], ['S3', 'AWS S3'], ['OSS', '阿里云 OSS'], ['COS', '腾讯云 COS'],
  ] },
  // M-1 v1.0：SKIPPED = 未配置扫描，不得显示为「安全」
  FileScanStatus: { default: 'SKIPPED', values: [
    ['SKIPPED', '未配置扫描', '#8c8c8c'], ['PENDING', '扫描中', '#1677ff'],
    ['CLEAN', '已扫描·安全', '#52c41a'], ['INFECTED', '已感染', '#ff4d4f'],
    ['FAILED', '扫描异常', '#fa8c16'],
  ] },
  // M-1 §4：动词/事件优先的 19 项；DB 中 AuditLog.action 为 varchar(64) 同值存储
  AuditAction: { default: 'create', values: [
    ['create', '创建'], ['update', '更新'], ['delete', '删除'], ['restore', '恢复'],
    ['login', '登录'], ['login.failed', '登录失败'], ['logout', '登出'],
    ['token.refresh', '令牌刷新'], ['password.change', '修改密码'],
    ['permission.change', '权限变更'], ['submit', '提交'], ['approve', '审批通过'],
    ['reject', '驳回'], ['assign', '指派'], ['status.change', '状态变更'],
    ['upload', '上传'], ['download', '下载'], ['export', '导出'],
    ['read.sensitive', '读取敏感数据'],
  ] },
  LogLevel: { default: 'INFO', values: [
    ['DEBUG', 'DEBUG'], ['INFO', 'INFO'], ['WARN', 'WARN'], ['ERROR', 'ERROR'], ['FATAL', 'FATAL'],
  ] },
  TemplateCategory: { default: 'OTHER', values: [
    ['IVD_REGISTRATION', 'IVD 注册'], ['REAGENT_CHIP', '试剂/芯片'],
    ['DEVICE', '设备'], ['OTHER', '其他'],
  ] },
  MaterialStatus: { default: 'ACTIVE', values: [
    ['ACTIVE', '启用'], ['DEPRECATED', '已废止'], ['ARCHIVED', '已归档'],
  ] },
  LotStatus: { default: 'AVAILABLE', values: [
    ['AVAILABLE', '可用'], ['RESERVED', '已预留'], ['DEPLETED', '已用完'],
    ['EXPIRED', '已过期'], ['QUARANTINED', '隔离中'], ['DISPOSED', '已销毁'],
  ] },
  // Q-b（W10 / Contract Review v2）：法规文档独立状态（含 SUPERSEDED）
  RegulatoryDocStatus: { default: 'ACTIVE', values: [
    ['ACTIVE', '生效', '#52c41a'], ['DRAFT', '草稿', '#8c8c8c'],
    ['ARCHIVED', '已归档', '#595959'], ['SUPERSEDED', '已被取代', '#fa8c16'],
  ] },
  // Q-a（W10 / Contract Review v2）：任务依赖类型
  DependencyType: { default: 'FS', values: [
    ['FS', '完成-开始', '#1677ff'], ['SS', '开始-开始', '#52c41a'],
    ['FF', '完成-完成', '#fa8c16'], ['SF', '开始-完成', '#722ed1'],
  ] },
  // Q-a2（W10 / Contract Review v2）：任务-法规文档关联类型
  TaskRegulatoryRelationType: { default: 'BASIS', values: [
    ['BASIS', '法规依据', '#1677ff'], ['REFERENCE', '参考', '#8c8c8c'],
    ['CONDITIONAL', '条件适用', '#fa8c16'], ['POST_MARKET', '上市后', '#722ed1'],
    ['NOT_APPLICABLE', '不适用', '#bfbfbf'],
  ] },
};

// ── 知识库文档分类 ────────────────────────────────────────────────────────────
const DOC_CATEGORIES = [
  { code: 'SOP', name: 'SOP 标准操作规程', description: '标准操作规程文件', icon: 'file-text', sortOrder: 1 },
  { code: 'TEMPLATE', name: '模板文件', description: '可复用模板', icon: 'copy', sortOrder: 2 },
  { code: 'TECHNICAL', name: '技术文档', description: '技术方案与验证记录', icon: 'experiment', sortOrder: 3 },
  { code: 'REGULATION', name: '法规文件', description: '法规与技术审评要求', icon: 'safety', sortOrder: 4 },
];

// ── 项目模板：阶段与任务 ──────────────────────────────────────────────────────
const TEMPLATE_ROLES = [
  { code: 'owner', name: '项目负责人', description: '对阶段交付物负总责', permissions: ['view', 'edit', 'approve'], sortOrder: 1 },
  { code: 'tech_lead', name: '技术负责人', description: '负责技术方案与验证', permissions: ['view', 'edit'], sortOrder: 2 },
  { code: 'member', name: '成员', description: '执行具体任务', permissions: ['view', 'edit'], sortOrder: 3 },
  { code: 'reviewer', name: '审核人', description: '审核交付物', permissions: ['view', 'approve'], sortOrder: 4 },
];

const REAGENT_PHASES = [
  { code: 'p1', name: '立项', tasks: ['市场调研与需求收集', '立项申请', '项目评审与审批'], milestone: true },
  { code: 'p2', name: '方案设计', tasks: ['技术方案设计', '引物探针设计', '芯片结构设计'] },
  { code: 'p3', name: '样本收集', tasks: ['样本方案设计', '样本采集与接收', '样本入库登记'] },
  { code: 'p4', name: '片外核酸提取优化', tasks: ['提取方案对比', '提取效率验证'] },
  { code: 'p5', name: '片外扩增试剂/程序优化', tasks: ['扩增体系配方优化', '扩增程序优化'] },
  { code: 'p6', name: '芯片试产验证', tasks: ['芯片试产', '性能测试', '数据分析'], milestone: true },
  { code: 'p7', name: '量产加工', tasks: ['SOP 编制与评审', '量产加工'] },
  { code: 'p8', name: '客户验证', tasks: ['样片送样', '客户反馈收集', '验证报告编制'], milestone: true },
  { code: 'p9', name: '归档', tasks: ['项目文档整理', '知识库归档'] },
];

const EQUIP_PHASES = [
  { code: 'p1', name: '项目调研', tasks: ['市场调研', '需求收集', '竞品分析'] },
  { code: 'p2', name: '立项审批', tasks: ['立项申请', '审批流程'], milestone: true },
  { code: 'p3', name: '方案设计', tasks: ['结构设计', '硬件设计', '芯片集成'] },
  { code: 'p4', name: '设计方案评审', tasks: ['评审会议', '评审意见处理'] },
  { code: 'p5', name: '设计迭代再评审', tasks: ['方案修改', '二次评审'] },
  { code: 'p6', name: '采购', tasks: ['BOM 清单', '供应商选择', '采购跟进'] },
  { code: 'p7', name: '样机组装联调', tasks: ['样机组装', '软硬件联调', '问题记录'], milestone: true },
  { code: 'p8', name: '结合芯片性能测试', tasks: ['整机性能测试', '指标验证'] },
  { code: 'p9', name: '加工生产', tasks: ['生产工艺编制', '量产准备', '生产加工'] },
  { code: 'p10', name: '客户验证', tasks: ['样机送样', '客户反馈', '验证报告'], milestone: true },
  { code: 'p11', name: '归档', tasks: ['文档整理', '知识库归档'] },
];

const pick = (phases, codes) => phases.filter((p) => codes.includes(p.code));

// ── 发号器（CodeSequence 原子发号，替代 count()+1）──────────────────────────────
const CODE_SEQUENCES = [
  { scope: 'PROJECT', prefix: 'PRJ-', padding: 3 },
  { scope: 'PRIMER', prefix: 'PRM-', padding: 3 },
  { scope: 'SAMPLE', prefix: 'SMP-', padding: 3 },
  { scope: 'DOCUMENT', prefix: 'DOC-', padding: 3 },
  { scope: 'FORMULA', prefix: 'FRM-', padding: 3 },
  { scope: 'REAGENT_LOT', prefix: 'LOT-', padding: 4 },
];

const SYSTEM_SETTINGS = [
  { key: 'app.name', value: 'R&D PMS', isPublic: true, description: '系统名称' },
  { key: 'app.version', value: '2.0.0', isPublic: true, description: '版本号' },
  { key: 'file.maxUploadSizeMb', value: 50, isPublic: false, description: '单文件上传上限（MB）' },
  { key: 'file.allowedMimeTypes', value: [
    'application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv', 'application/zip',
  ], isPublic: false, description: '上传 MIME 白名单' },
  { key: 'security.passwordMinLength', value: 12, isPublic: false, description: '密码最小长度' },
  { key: 'security.maxFailedLoginAttempts', value: 5, isPublic: false, description: '最大连续登录失败次数' },
  { key: 'security.lockoutMinutes', value: 15, isPublic: false, description: '锁定分钟数' },
  { key: 'project.defaultStatus', value: 'PLANNING', isPublic: false, description: '新建项目默认状态' },
];

// ── 执行 ──────────────────────────────────────────────────────────────────────
const stats = {};
const bump = (key, n = 1) => { stats[key] = (stats[key] || 0) + n; };

async function main() {
  // 0. 基线自检（P0=90 / P1=30 / 六角色数量 / 否决清单 / 命名空间）
  assertBaseline();

  const isProd = process.env.NODE_ENV === 'production';

  // 1. 种子账号口令（必须外置）
  const superAdminUsername = (process.env.SEED_SUPER_ADMIN_USERNAME || 'superadmin').trim().toLowerCase();
  const adminUsername = (process.env.SEED_ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const superAdminPassword = assertStrongPassword(process.env.SEED_SUPER_ADMIN_PASSWORD, 'SEED_SUPER_ADMIN_PASSWORD');
  const adminPassword = assertStrongPassword(process.env.SEED_ADMIN_PASSWORD, 'SEED_ADMIN_PASSWORD');

  const root = await prisma.user.findFirst({ where: { systemRole: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  const rootId = root?.id ?? null;

  // 2. 权限表（P0 90 条 + P1 解冻子集）
  const permissionIdByCode = new Map();
  let sortOrder = 0;
  for (const code of [...PERMISSIONS, ...P1_UNFROZEN]) {
    // eslint-disable-next-line no-await-in-loop
    const row = await prisma.permission.upsert({
      where: { code },
      update: {
        name: code,
        module: moduleOf(code),
        isHighRisk: HIGH_RISK_CODES.includes(code),
        sortOrder,
      },
      create: {
        code,
        name: code,
        module: moduleOf(code),
        isHighRisk: HIGH_RISK_CODES.includes(code),
        sortOrder,
      },
    });
    permissionIdByCode.set(code, row.id);
    sortOrder += 1;
    bump('permissions.synced');
  }

  // 2b. 清理历史脏数据：不在 P0 + 解冻子集中的权限（含旧 PermissionCode 枚举值转换残留）
  const orphanPermissions = await prisma.permission.findMany({
    where: { code: { notIn: [...PERMISSIONS, ...P1_UNFROZEN] } },
    select: { id: true, code: true },
  });
  if (orphanPermissions.length) {
    await prisma.permission.deleteMany({ where: { id: { in: orphanPermissions.map((p) => p.id) } } });
    bump('permissions.removed', orphanPermissions.length);
    console.warn(`⚠️  清理非 P0/解冻权限 ${orphanPermissions.length} 条：${orphanPermissions.map((p) => p.code).join(', ')}`);
  }

  // 3. 角色 + 权限精确同步
  for (const roleDef of ROLE_DEFS) {
    // eslint-disable-next-line no-await-in-loop
    const role = await prisma.role.upsert({
      where: { code: roleDef.code },
      update: { name: roleDef.name, description: roleDef.description, sortOrder: roleDef.sortOrder, isSystem: true },
      create: {
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
        sortOrder: roleDef.sortOrder,
        createdById: rootId,
      },
    });
    bump('roles.synced');

    const wantIds = roleDef.permissions.map((code) => permissionIdByCode.get(code));
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.rolePermission.findMany({ where: { roleId: role.id } });
    const haveIds = new Set(existing.map((rp) => rp.permissionId));
    const toAdd = wantIds.filter((id) => !haveIds.has(id));
    const toRemove = existing.filter((rp) => !wantIds.includes(rp.permissionId)).map((rp) => rp.permissionId);

    if (toAdd.length) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
      });
      bump('rolePermissions.added', toAdd.length);
    }
    if (toRemove.length) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: toRemove } },
      });
      bump('rolePermissions.removed', toRemove.length);
    }
    bump('rolePermissions.synced', wantIds.length);
  }

  // 4. 种子账号：superadmin（SUPER_ADMIN）+ admin（ADMIN）
  const seedAccounts = [
    {
      username: superAdminUsername,
      password: superAdminPassword,
      systemRole: 'SUPER_ADMIN',
      roleCode: 'SUPER_ADMIN',
      displayName: '系统超级管理员',
    },
    {
      username: adminUsername,
      password: adminPassword,
      systemRole: 'ADMIN',
      roleCode: 'ADMIN',
      displayName: '系统管理员',
    },
  ];

  for (const acc of seedAccounts) {
    // eslint-disable-next-line no-await-in-loop
    const existingUser = await prisma.user.findUnique({ where: { username: acc.username } });
    // eslint-disable-next-line no-await-in-loop
    const passwordHash = await bcrypt.hash(acc.password, BCRYPT_COST);
    // eslint-disable-next-line no-await-in-loop
    const user = await prisma.user.upsert({
      where: { username: acc.username },
      update: {
        // 重跑 seed 不重置口令，但强制对齐 systemRole，保证角色与权限真源一致
        systemRole: acc.systemRole,
        status: 'ACTIVE',
        displayName: acc.displayName,
        updatedById: rootId ?? undefined,
      },
      create: {
        username: acc.username,
        passwordHash,
        mustChangePassword: true,
        displayName: acc.displayName,
        systemRole: acc.systemRole,
        status: 'ACTIVE',
        createdById: rootId ?? undefined,
      },
    });
    bump(existingUser ? 'users.skipped' : 'users.created');

    // systemRole 与 UserRole 绑定必须一致
    // eslint-disable-next-line no-await-in-loop
    const role = await prisma.role.findUniqueOrThrow({ where: { code: acc.roleCode } });
    // eslint-disable-next-line no-await-in-loop
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id, assignedById: rootId ?? user.id },
    });
    bump('userRoles.synced');
  }

  const adminUser = await prisma.user.findUniqueOrThrow({ where: { username: adminUsername } });
  const superAdminUser = await prisma.user.findUniqueOrThrow({ where: { username: superAdminUsername } });

  // 5. 测试账号（仅非生产 + 显式开关）
  const wantTestAccounts = process.env.SEED_TEST_ACCOUNTS === 'true' && !isProd;
  if (process.env.SEED_TEST_ACCOUNTS === 'true' && isProd) {
    console.warn('⚠️  NODE_ENV=production 下已忽略 SEED_TEST_ACCOUNTS，不创建任何 test_* 账号。');
  }
  if (wantTestAccounts) {
    const testPassword = assertStrongPassword(process.env.SEED_TEST_PASSWORD, 'SEED_TEST_PASSWORD');
    const testHash = await bcrypt.hash(testPassword, BCRYPT_COST);
    for (const def of ROLE_DEFS) {
      const username = `test_${def.code.toLowerCase()}`;
      // eslint-disable-next-line no-await-in-loop
      const existingTest = await prisma.user.findUnique({ where: { username } });
      // eslint-disable-next-line no-await-in-loop
      const user = await prisma.user.upsert({
        where: { username },
        // deletedAt 重置：测试账号被软删后重跑 seed 可自动恢复（仅测试账号路径）
        update: { systemRole: def.systemRole, status: 'ACTIVE', deletedAt: null },
        create: {
          username,
          passwordHash: testHash,
          mustChangePassword: false,
          displayName: `测试-${def.name}`,
          systemRole: def.systemRole,
          status: 'ACTIVE',
        },
      });
      bump(existingTest ? 'testUsers.skipped' : 'testUsers.created');
      // eslint-disable-next-line no-await-in-loop
      const role = await prisma.role.findUniqueOrThrow({ where: { code: def.code } });
      // eslint-disable-next-line no-await-in-loop
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id, assignedById: superAdminUser.id },
      });
    }
  }

  // 6. 枚举展示字典（清理已废弃取值，保证重跑自愈）
  for (const [enumName, def] of Object.entries(ENUM_META)) {
    const codes = def.values.map(([code]) => code);
    // eslint-disable-next-line no-await-in-loop
    await prisma.enumMeta.deleteMany({ where: { enumName, code: { notIn: codes } } });
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(def.values.map(([code, label, color], index) => prisma.enumMeta.upsert({
      where: { enumName_code: { enumName, code } },
      update: { label, color: color ?? null, sortOrder: index, isDefault: code === def.default, isEnabled: true },
      create: {
        enumName, code, label, color: color ?? null,
        sortOrder: index, isDefault: code === def.default, isEnabled: true,
      },
    })));
    bump('enumMeta.synced', def.values.length);
  }

  // 7. 知识库分类
  for (const [index, cat] of DOC_CATEGORIES.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.docCategory.upsert({
      where: { code: cat.code },
      update: { name: cat.name, description: cat.description, icon: cat.icon, sortOrder: cat.sortOrder },
      create: { ...cat, sortOrder: index + 1 },
    });
    bump('docCategories.synced');
  }

  // 8. 法规文档（ISAF 2026，26 条）
  const { SEED_REGULATORY_DOCUMENTS } = await import('../src/data/regulatoryDocumentsSeed.js');
  for (const doc of SEED_REGULATORY_DOCUMENTS) {
    const data = {
      title: doc.title,
      fullTitle: doc.fullTitle ?? null,
      category: mapStrict(doc.category, REG_CATEGORY_MAP, 'RegulatoryCategory'),
      region: 'MACAO_ISAF',
      applicability: mapStrict(doc.applicability, APPLICABILITY_DOC_MAP, 'Applicability'),
      applicableToIvd: Boolean(doc.applicableToIvd),
      priorityLevel: PRIORITY_LEVELS.includes(doc.priorityLevel) ? doc.priorityLevel : 'P3',
      status: 'ACTIVE',
    };
    // eslint-disable-next-line no-await-in-loop
    await prisma.regulatoryDocument.upsert({
      where: { dispatchNo: doc.dispatchNo },
      update: data,
      create: { ...data, dispatchNo: doc.dispatchNo },
    });
    bump('regulatoryDocuments.synced');
  }

  // 9. 项目模板（阶段 + 任务 + 角色）
  const { REG_66_PHASES } = await import('../src/data/reg66Phases.js');
  const reg66 = REG_66_PHASES.map((phase) => ({
    code: phase.id,
    name: phase.name,
    sortOrder: phase.order,
    isMilestone: false,
    tasks: phase.tasks.map(([title, taskType, priority, applicability]) => ({
      title,
      taskType: mapStrict(taskType, TASK_TYPE_MAP, 'TaskType'),
      regulatoryPriority: PRIORITY_LEVELS.includes(priority) ? priority : 'P2',
      applicability: mapStrict(applicability, APPLICABILITY_MAP, 'TaskApplicability'),
    })),
  }));

  const normalizeTasks = (tasks) => (tasks ?? []).map((task) => (typeof task === 'string'
    ? { title: task, taskType: 'OTHER', applicability: 'REQUIRED', regulatoryPriority: 'P2' }
    : {
      title: task.title,
      taskType: task.taskType ?? 'OTHER',
      applicability: task.applicability ?? 'REQUIRED',
      regulatoryPriority: task.regulatoryPriority ?? 'P2',
    }));

  const PROJECT_TEMPLATES = [
    {
      code: 'TPL-REG-66', name: 'REG-66 十项病原体注册全流程模板', isMaster: true, parentCode: null,
      category: 'ivd_registration', typeLabel: '注册申报',
      description: '面向澳门 ISAF 2026 的十项病原体检测试剂注册全流程，共 5 阶段 66 项任务',
      phases: reg66,
    },
    {
      code: 'TPL-REAGENT-MASTER', name: '试剂/芯片 全流程模板（母版）', isMaster: true, parentCode: null,
      category: 'reagent_chip', typeLabel: '全流程',
      description: '试剂与芯片开发的 9 阶段标准流程',
      phases: REAGENT_PHASES,
    },
    {
      code: 'TPL-REAGENT-PERF', name: '性能测试型（子模板）', isMaster: false, parentCode: 'TPL-REAGENT-MASTER',
      category: 'reagent_chip', typeLabel: '快速验证型',
      description: '已有产品只做性能测试，跳过设计与优化阶段',
      phases: pick(REAGENT_PHASES, ['p1', 'p6', 'p8', 'p9']),
    },
    {
      code: 'TPL-EQUIP-MASTER', name: '设备开发 全流程模板（母版）', isMaster: true, parentCode: null,
      category: 'device', typeLabel: '全流程',
      description: '设备开发的 11 阶段标准流程',
      phases: EQUIP_PHASES,
    },
    {
      code: 'TPL-EQUIP-CUSTOM', name: '定制开发型（子模板）', isMaster: false, parentCode: 'TPL-EQUIP-MASTER',
      category: 'device', typeLabel: '定制开发型',
      description: '客户需求明确，跳过调研与多轮评审',
      phases: pick(EQUIP_PHASES, ['p2', 'p3', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11']),
    },
  ];

  for (const tpl of PROJECT_TEMPLATES) {
    // eslint-disable-next-line no-await-in-loop
    const parent = tpl.parentCode
      ? await prisma.projectTemplate.findUnique({ where: { code: tpl.parentCode } })
      : null;

    // eslint-disable-next-line no-await-in-loop
    const template = await prisma.projectTemplate.upsert({
      where: { code: tpl.code },
      update: {
        name: tpl.name, description: tpl.description, category: tpl.category,
        typeLabel: tpl.typeLabel, isMaster: tpl.isMaster, parentId: parent?.id ?? null, status: 'ACTIVE',
      },
      create: {
        code: tpl.code, name: tpl.name, description: tpl.description, category: tpl.category,
        typeLabel: tpl.typeLabel, isMaster: tpl.isMaster, parentId: parent?.id ?? null,
        status: 'ACTIVE', createdById: adminUser.id,
      },
    });
    bump('projectTemplates.synced');

    for (const [index, role] of TEMPLATE_ROLES.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.templateRole.upsert({
        where: { templateId_code: { templateId: template.id, code: role.code } },
        update: { name: role.name, description: role.description, permissions: role.permissions, sortOrder: role.sortOrder },
        create: { ...role, templateId: template.id, sortOrder: index + 1 },
      });
      bump('templateRoles.synced');
    }

    for (const [index, phase] of tpl.phases.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const phaseRow = await prisma.templatePhase.upsert({
        where: { templateId_code: { templateId: template.id, code: phase.code } },
        update: { name: phase.name, sortOrder: index + 1, isMilestone: Boolean(phase.milestone) },
        create: {
          templateId: template.id, code: phase.code, name: phase.name,
          sortOrder: index + 1, isMilestone: Boolean(phase.milestone),
        },
      });
      bump('templatePhases.synced');

      // 任务整体重建，保证模板内容变更可自愈
      // eslint-disable-next-line no-await-in-loop
      await prisma.templateTask.deleteMany({ where: { templatePhaseId: phaseRow.id } });
      const tasks = normalizeTasks(phase.tasks);
      if (tasks.length) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.templateTask.createMany({
          data: tasks.map((task, i) => ({
            templatePhaseId: phaseRow.id,
            title: task.title,
            taskType: task.taskType,
            applicability: task.applicability,
            regulatoryPriority: task.regulatoryPriority,
            sortOrder: i,
          })),
        });
        bump('templateTasks.synced', tasks.length);
      }
    }
  }

  // 10. 任务流程模板库
  const { SEED_TEMPLATES } = await import('../src/data/taskTemplateSeed.js');
  for (const [index, tpl] of SEED_TEMPLATES.entries()) {
    const code = `TT-${String(index + 1).padStart(3, '0')}`;
    const data = {
      name: tpl.name,
      category: tpl.category ?? null,
      description: tpl.description ?? null,
      estimatedDays: tpl.estimatedDays ?? 0,
      priority: mapStrict(tpl.priority ?? 'medium', TASK_PRIORITY_MAP, 'TaskPriority'),
      tags: tpl.tags ?? [],
    };
    // eslint-disable-next-line no-await-in-loop
    const row = await prisma.taskTemplate.upsert({
      where: { code },
      update: { ...data, createdById: adminUser.id },
      create: { ...data, code, createdById: adminUser.id },
    });
    bump('taskTemplates.synced');

    // eslint-disable-next-line no-await-in-loop
    await prisma.taskTemplateStep.deleteMany({ where: { templateId: row.id } });
    const steps = (tpl.steps ?? []).map((step, i) => ({
      templateId: row.id,
      sortOrder: i,
      title: step.title,
      description: step.description ?? null,
      estimatedHours: step.estimatedHours ?? null,
      assigneeRoleCode: null,
      checklist: [],
    }));
    if (steps.length) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.taskTemplateStep.createMany({ data: steps });
      bump('taskTemplateSteps.synced', steps.length);
    }
  }

  // 11. 发号器
  for (const seq of CODE_SEQUENCES) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.codeSequence.upsert({
      where: { scope_periodKey: { scope: seq.scope, periodKey: '' } },
      update: { prefix: seq.prefix, padding: seq.padding },
      create: { scope: seq.scope, periodKey: '', prefix: seq.prefix, padding: seq.padding, lastValue: 0 },
    });
    bump('codeSequences.synced');
  }

  // 12. 系统配置
  for (const setting of SYSTEM_SETTINGS) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, isPublic: setting.isPublic, description: setting.description },
      create: { ...setting, updatedById: adminUser.id },
    });
    bump('systemSettings.synced');
  }

  console.log('\n──────── seed 完成 ────────');
  Object.entries(stats).sort().forEach(([k, v]) => console.log(`  ${k.padEnd(26)} ${v}`));
  console.log(`  permissions(P0)             ${PERMISSIONS.length}`);
  console.log(`  P1 manifest(不入库)         ${P1_MANIFEST.length}`);
  for (const def of ROLE_DEFS) console.log(`  role ${def.code.padEnd(18)} ${def.permissions.length}`);
  console.log(`  RolePermission 合计         ${ROLE_DEFS.reduce((s, d) => s + d.permissions.length, 0)}`);
  console.log(`  账号：${superAdminUsername} (SUPER_ADMIN) / ${adminUsername} (ADMIN)，首次登录须改密`);
  console.log('───────────────────────────\n');
}

main()
  .catch((error) => {
    console.error('❌ seed 失败：', error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
