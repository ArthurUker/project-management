import type { EnumValue, ID, Timestamps, Versioned } from './common';

export interface ReportRef {
  id: ID;
  name: string;
  code: string;
}

export interface Report extends Timestamps, Versioned {
  id: ID;
  userId: ID;
  projectId: ID;
  month: string;
  content: string;
  status: EnumValue;
  submittedAt?: string | null;
  approvedBy?: ID | null;
  approvedAt?: string | null;
  user?: { id: ID; name: string; position: string };
  project?: ReportRef;
  /** 允许后端扩展字段（reportType / approveNote 等） */
  [key: string]: unknown;
}

export interface ReportVersion extends Timestamps {
  id: ID;
  reportId: ID;
  content: string;
  createdBy: ID;
}

export interface CreateReportDto {
  projectId: ID;
  month: string;
  content?: string;
}

export type UpdateReportDto = Partial<CreateReportDto> & { version?: number };
