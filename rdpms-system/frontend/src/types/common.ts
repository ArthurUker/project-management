/** 通用基础类型 */

export type ID = string;

export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeletable {
  deletedAt: string | null;
}

/**
 * 状态字段暂以 string 承载。
 * 原因：后端 enum 取值清单（决策 A）尚未定稿。
 * 定稿后应收敛为联合类型，例如：
 *   export type ProjectStatus = 'DRAFT' | 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
 * 约束：页面禁止直接比较状态字面量，一律走 constants/statusColors.ts 或 dict。
 */
export type EnumValue = string;

/** 乐观锁字段（后端 version 列） */
export interface Versioned {
  version: number;
}
