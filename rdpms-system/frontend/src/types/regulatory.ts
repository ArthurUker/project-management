export type RegulatoryApplicability =
  | 'core'
  | 'conditional'
  | 'post_market'
  | 'low_relevance'
  | 'not_applicable';

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
