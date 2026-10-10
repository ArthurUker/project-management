import { del, get, patch, post, put, requestPaged } from '../request';

/**
 * M-1 §7.7 /api/reagents 前端适配：
 *   - reagentsAPI 只保留聚合读取（list/get）与导出（export，权限 reagents.export）
 *   - 不提供 create/update/remove（BE 对写方法固定 405）
 *   - 批次/库存写入走 reagentLotsAPI（reagents.create / reagents.update）
 */

export interface ReagentMaterial {
  id: string;
  code?: string;
  name?: string;
  commonName?: string | null;
  chineseName?: string | null;
  englishName?: string | null;
  category?: string | null;
  casNumber?: string | null;
  /** v1.1：业务侧编码（如 RM10011306 体系） */
  externalCode?: string | null;
  /** v1.1：所属项目标签（盘点表"所属项目"列） */
  projectLabel?: string | null;
  status?: string | null;
  inventory?: { totalQuantity: number; lotCount: number; expiringSoonCount: number };
  materialDetail?: Record<string, unknown> | null;
  usedInFormulas?: unknown[] | null;
  [key: string]: unknown;
}

export interface ReagentLot {
  id: string;
  materialId: string;
  lotNo: string;
  quantity: string | number;
  unit: string;
  status?: string;
  receivedAt?: string | null;
  expiryDate?: string | null;
  location?: string | null;
  /** v1.1：结构化库位 */
  locationId?: string | null;
  /** v1.1：包装规格（如 "2OD,100µM"） */
  spec?: string | null;
  /** v1.1：管数/瓶数 */
  containerCount?: string | number | null;
  /** v1.1：开封状态 */
  openedStatus?: 'SEALED' | 'OPENED' | null;
  /** v1.1：物理形态（干粉/复溶液体…） */
  form?: string | null;
  notes?: string | null;
  supplier?: string | null;
  certificateUrl?: string | null;
  material?: { id: string; code?: string; commonName?: string | null; chineseName?: string | null };
  storage?: { id: string; code: string; name: string; path: string } | null;
  [key: string]: unknown;
}

export interface ReagentFormula {
  id: string;
  name: string;
  components?: FormulaComponent[];
  [key: string]: unknown;
}

export interface FormulaComponent {
  id?: string;
  formulaId?: string;
  materialId?: string | null;
  customName?: string | null;
  concentration?: number | string | null;
  unit?: string | null;
  [key: string]: unknown;
}

export interface PrepRecord {
  id: string;
  formulaId: string;
  [key: string]: unknown;
}

export const reagentMaterialsAPI = {
  list: (params?: Record<string, unknown>) =>
    requestPaged<ReagentMaterial>({ method: 'GET', url: '/reagent-materials', params }),
  get: (id: string) => get<ReagentMaterial>(`/reagent-materials/${id}`),
  create: (data: Partial<ReagentMaterial>) => post<ReagentMaterial>('/reagent-materials', data),
  /** 修正（2026-10-10）：后端为 PUT /:id，此前误用 POST 会导致编辑保存 405 */
  update: (id: string, data: Partial<ReagentMaterial>) =>
    put<ReagentMaterial>(`/reagent-materials/${id}`, data),
  /** P1 批次二解冻：reagent_materials.delete（软删除） */
  remove: (id: string) => del<{ id: string }>(`/reagent-materials/${id}`),
  bulkDelete: (ids: string[]) => post<{ deleted: number }>('/reagent-materials/bulk-delete', { ids }),
  /** 2026-10-10 解冻：reagent_materials.import */
  batchImport: (rows: Partial<ReagentMaterial>[]) =>
    post<{
      success: Array<{ id: string; code: string; name: string }>;
      failed: Array<{ index: number; name: string | null; reason: string }>;
    }>('/reagent-materials/batch-import', { rows }),
};

export const formulaAPI = {
  list: (params?: Record<string, unknown>) =>
    requestPaged<ReagentFormula>({ method: 'GET', url: '/formulas', params }),
  get: (id: string) => get<ReagentFormula>(`/formulas/${id}`),
  create: (data: Partial<ReagentFormula>) => post<ReagentFormula>('/formulas', data),
  update: (id: string, data: Partial<ReagentFormula>) => post<ReagentFormula>(`/formulas/${id}`, data),
  duplicate: (id: string) => post<ReagentFormula>(`/formulas/${id}/duplicate`),
};

export const prepAPI = {
  calculate: (data: unknown) => post<unknown>('/prep/calculate', data),
  saveRecord: (data: unknown) => post<PrepRecord>('/prep/records', data),
  listRecords: (params?: Record<string, unknown>) =>
    requestPaged<PrepRecord>({ method: 'GET', url: '/prep/records', params }),
  getRecord: (id: string) => get<PrepRecord>(`/prep/records/${id}`),
};

/** 聚合读取/导出路由（写方法 405） */
export const reagentsAPI = {
  list: (params?: Record<string, unknown>) =>
    requestPaged<ReagentMaterial>({ method: 'GET', url: '/reagents', params }),
  get: (id: string) => get<ReagentMaterial>(`/reagents/${id}`),
  /** P0 唯一试剂导出出口：reagents.export */
  export: () => post<{ exportedAt: string; count: number; items: unknown[] }>('/reagents/export', {}),
};

/** 批次/库存写入唯一入口（不新增 reagent_lots.* 权限码） */
export const reagentLotsAPI = {
  list: (params?: Record<string, unknown>) =>
    requestPaged<ReagentLot>({ method: 'GET', url: '/reagent-lots', params }),
  create: (data: Partial<ReagentLot>) => post<ReagentLot>('/reagent-lots', data),
  /** 修正（2026-10-10）：后端为 PATCH /:id，此前误用 POST 会导致保存 405 */
  update: (id: string, data: Partial<ReagentLot>) =>
    patch<ReagentLot>(`/reagent-lots/${id}`, data),
};

/** 兼容旧命名：仅暴露聚合读取能力 */
export const reagentAPI = reagentsAPI;
