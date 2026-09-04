import { get, post, requestPaged } from '../request';

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
  supplier?: string | null;
  certificateUrl?: string | null;
  material?: { id: string; code?: string; commonName?: string | null; chineseName?: string | null };
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
  update: (id: string, data: Partial<ReagentMaterial>) =>
    post<ReagentMaterial>(`/reagent-materials/${id}`, data),
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
  update: (id: string, data: Partial<ReagentLot>) =>
    post<ReagentLot>(`/reagent-lots/${id}`, data),
};

/** 兼容旧命名：仅暴露聚合读取能力 */
export const reagentAPI = reagentsAPI;
