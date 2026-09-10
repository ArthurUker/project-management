/**
 * 法规文件枚举常量（与后端 Prisma 枚举严格对齐）。
 *
 * 背景（实机缺陷）：页面原先把 applicability 当小写值提交（`conditional`），
 * category 是自由文本输入框（如「医疗器械/IVD」），而 DB 是 27 值枚举 →
 * 新建/编辑法规文档必然 500；适用性筛选也因大小写不一致永不命中。
 * 规则：**提交必须发枚举值**，中文仅作展示标签；筛选同样用枚举值比较。
 */

export type RegulatoryApplicabilityValue =
  | 'CORE' | 'CONDITIONAL' | 'POST_MARKET' | 'LOW_RELEVANCE' | 'NOT_APPLICABLE';

export type RegulatoryPriorityValue = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export const APPLICABILITY_OPTIONS: Array<{ value: RegulatoryApplicabilityValue; label: string }> = [
  { value: 'CORE', label: '核心适用' },
  { value: 'CONDITIONAL', label: '条件适用' },
  { value: 'POST_MARKET', label: '上市后适用' },
  { value: 'LOW_RELEVANCE', label: '低相关' },
  { value: 'NOT_APPLICABLE', label: '不适用' },
];

export const PRIORITY_LEVEL_OPTIONS: Array<{ value: RegulatoryPriorityValue; label: string }> =
  (['P0', 'P1', 'P2', 'P3', 'P4'] as RegulatoryPriorityValue[]).map((p) => ({ value: p, label: p }));

/** RegulatoryCategory 枚举（27 值，与 schema 一致） */
export const REGULATORY_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'CLASSIFICATION', label: '分类界定' },
  { value: 'CLINICAL_EVALUATION', label: '临床评价' },
  { value: 'CLINICAL_EVALUATION_EXEMPTION', label: '临床评价豁免' },
  { value: 'CLINICAL_TRIAL', label: '临床试验' },
  { value: 'CLINICAL_TRIAL_PERMISSION', label: '临床试验审批' },
  { value: 'LABELING', label: '标签说明书' },
  { value: 'REGISTRATION_DOSSIER', label: '注册申报资料' },
  { value: 'PRIORITY_REVIEW', label: '优先审评' },
  { value: 'CONDITIONAL_APPROVAL', label: '附条件批准' },
  { value: 'RENEWAL', label: '延续注册' },
  { value: 'REGISTRATION_CHANGE', label: '变更注册' },
  { value: 'FILING', label: '备案' },
  { value: 'FILING_CHANGE', label: '备案变更' },
  { value: 'SPECIAL_APPROVAL', label: '特殊审批' },
  { value: 'THIRD_PARTY_REVIEW', label: '第三方审核' },
  { value: 'QMS', label: '质量体系' },
  { value: 'QMS_IVD', label: '质量体系（IVD）' },
  { value: 'QMS_STERILE', label: '质量体系（无菌）' },
  { value: 'QMS_IMPLANTABLE', label: '质量体系（植入）' },
  { value: 'QMS_SPECIAL', label: '质量体系（特殊）' },
  { value: 'SOFTWARE_QMS', label: '软件质量体系' },
  { value: 'MANUFACTURING_QMS_DOC', label: '生产质量体系文件' },
  { value: 'CONTRACT_MANUFACTURING', label: '委托生产' },
  { value: 'MANUFACTURER_NAMING', label: '生产企业命名' },
  { value: 'MANUFACTURER_OTHER_PRODUCTS', label: '生产企业其他产品' },
  { value: 'DISTRIBUTION_ACCESS', label: '经营流通准入' },
  { value: 'OTHER', label: '其他' },
];

const CATEGORY_LABELS: Record<string, string> = REGULATORY_CATEGORY_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<string, string>,
);
const APPLICABILITY_LABELS: Record<string, string> = APPLICABILITY_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<string, string>,
);

/** 规范化适用性：兼容历史小写（core/conditional/...） */
export function normalizeApplicability(v?: string | null): RegulatoryApplicabilityValue {
  const raw = String(v ?? '').trim().toUpperCase();
  return (APPLICABILITY_OPTIONS.some((o) => o.value === raw) ? raw : 'CONDITIONAL') as RegulatoryApplicabilityValue;
}

export const applicabilityLabel = (v?: string | null): string =>
  APPLICABILITY_LABELS[normalizeApplicability(v)] ?? normalizeApplicability(v);

export const regulatoryCategoryLabel = (v?: string | null): string => {
  const raw = String(v ?? '').trim().toUpperCase();
  return CATEGORY_LABELS[raw] ?? (raw || '-');
};
