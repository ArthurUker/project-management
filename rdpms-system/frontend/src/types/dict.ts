import type { EnumValue } from './common';

/** 枚举展示字典项：DB 存英文 value，UI 显示中文 label */
export interface EnumMeta {
  enumName: string;
  value: string;
  label: string;
  color?: string | null;
  sortOrder: number;
}

/** GET /api/dict 响应：{ enums: { ProjectStatus: EnumMeta[], ... } } */
export type DictMap = Record<string, EnumMeta[]>;

/** 常见枚举名常量（待后端 enum 定稿后对齐） */
export const ENUM = {
  USER_ROLE: 'SystemRole',
  PROJECT_STATUS: 'ProjectStatus',
  PROJECT_TYPE: 'ProjectType',
  TASK_STATUS: 'TaskStatus',
  TASK_PRIORITY: 'TaskPriority',
  REPORT_STATUS: 'ReportStatus',
  REGISTRATION_STAGE: 'RegistrationStage',
} as const;

export type EnumName = (typeof ENUM)[keyof typeof ENUM] | EnumValue;
