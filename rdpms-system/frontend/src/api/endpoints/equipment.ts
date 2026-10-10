import { del, get, post, put, requestPaged } from '../request';

/* ── 设备/仪器台账（v1.1，2026-10-10）──────────────────────────────────────── */

export interface Equipment {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  quantity: number;
  unit?: string | null;
  location?: string | null;
  custodian?: string | null;
  startUseDate?: string | null;
  nature?: string | null;
  adminCode?: string | null;
  origCode?: string | null;
  barcode?: string | null;
  status?: 'IN_USE' | 'IDLE' | 'REPAIRING' | 'SCRAPPED' | 'DISPOSED' | string;
  scrapped?: boolean;
  inventoryResult?: string | null;
  inventoryNote?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface EquipmentQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
  status?: string;
  location?: string;
  [key: string]: unknown;
}

export type EquipmentInput = Partial<Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>> & {
  /** 资产编码（入库映射到 code；接口层字段名为 assetCode） */
  assetCode?: string;
};

export const equipmentAPI = {
  list: (params?: EquipmentQuery) =>
    requestPaged<Equipment>({ method: 'GET', url: '/equipment', params }),
  get: (id: string) => get<{ success: boolean; equipment: Equipment }>(`/equipment/${id}`),
  create: (data: EquipmentInput) => post<{ success: boolean; equipment: Equipment }>('/equipment', data),
  update: (id: string, data: EquipmentInput) =>
    put<{ success: boolean; equipment: Equipment }>(`/equipment/${id}`, data),
  remove: (id: string) => del<{ success: boolean; id: string }>(`/equipment/${id}`),
  batchImport: (rows: EquipmentInput[]) =>
    post<{
      success: Array<{ id: string; code: string; name: string }>;
      failed: Array<{ index: number; code: string | null; reason: string }>;
    }>('/equipment/batch-import', { rows }),
};

/* ── 库位树（v1.1）────────────────────────────────────────────────────────── */

export interface StorageLocation {
  id: string;
  code: string;
  name: string;
  type: 'ROOM' | 'CABINET' | 'FRIDGE' | 'FREEZER' | 'SHELF' | 'DRAWER' | 'BOX' | 'BAG' | 'OTHER' | string;
  parentId?: string | null;
  path: string;
  depth: number;
  sortOrder: number;
  notes?: string | null;
  status?: string;
  children?: StorageLocation[];
  [key: string]: unknown;
}

export const storageLocationsAPI = {
  list: (params?: Record<string, unknown>) =>
    get<{ success: boolean; list: StorageLocation[]; total: number }>('/storage-locations', { params }),
  tree: () =>
    get<{ success: boolean; tree: StorageLocation[]; total: number }>('/storage-locations', {
      params: { format: 'tree' },
    }),
  get: (id: string) =>
    get<{ success: boolean; location: StorageLocation; children: StorageLocation[]; lotCount: number }>(
      `/storage-locations/${id}`,
    ),
  create: (data: Partial<StorageLocation>) =>
    post<{ success: boolean; location: StorageLocation }>('/storage-locations', data),
  update: (id: string, data: Partial<StorageLocation>) =>
    put<{ success: boolean; location: StorageLocation }>(`/storage-locations/${id}`, data),
  remove: (id: string) => del<{ success: boolean; id: string }>(`/storage-locations/${id}`),
};

/* ── 检测靶标（v1.1；权限复用 primers 域）────────────────────────────────── */

export interface DetectionTarget {
  id: string;
  code: string;
  name: string;
  geneSymbol?: string | null;
  organismLatin?: string | null;
  organismChinese?: string | null;
  taxid?: string | null;
  atccStrain?: string | null;
  notes?: string | null;
  status?: string;
  _count?: { primers: number };
  [key: string]: unknown;
}

export const detectionTargetsAPI = {
  list: (params?: Record<string, unknown>) =>
    requestPaged<DetectionTarget>({ method: 'GET', url: '/detection-targets', params }),
  get: (id: string) => get<{ success: boolean; target: DetectionTarget }>(`/detection-targets/${id}`),
  create: (data: Partial<DetectionTarget>) =>
    post<{ success: boolean; target: DetectionTarget }>('/detection-targets', data),
  update: (id: string, data: Partial<DetectionTarget>) =>
    put<{ success: boolean; target: DetectionTarget }>(`/detection-targets/${id}`, data),
  remove: (id: string) => del<{ success: boolean; id: string }>(`/detection-targets/${id}`),
};
