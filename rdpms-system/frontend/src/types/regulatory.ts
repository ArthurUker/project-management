// 与后端 Prisma `Applicability` 枚举严格对齐（提交/筛选都必须用这些大写值；
// 历史小写值由 constants/regulatoryEnums.normalizeApplicability 兼容）
export type RegulatoryApplicability =
  | 'CORE'
  | 'CONDITIONAL'
  | 'POST_MARKET'
  | 'LOW_RELEVANCE'
  | 'NOT_APPLICABLE';

export type RegulatoryPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface RegulatoryDocument {
  id: string;
  dispatchNo: string;
  title: string;
  fullTitle?: string | null;
  category?: string | null;
  applicability: RegulatoryApplicability;
  applicableToIvd: boolean;
  priorityLevel: RegulatoryPriority;
  summary?: string | null;
  applicabilityNote?: string | null;
  content?: string | null;
  fileName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskType =
  | 'classification'
  | 'registration_dossier'
  | 'performance_validation'
  | 'clinical_evaluation'
  | 'labeling'
  | 'software'
  | 'qms'
  | 'submission'
  | 'post_market'
  | 'strategy'
  | 'other';

export type TaskApplicabilityStatus =
  | 'required'
  | 'conditional'
  | 'not_applicable'
  | 'to_be_confirmed';
