import { del, get, post, put, requestPaged } from '../request';

/* ── 知识库文档 ───────────────────────────────────────────────────────────── */

export interface DocCategory {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sortOrder: number;
  _count?: { documents: number };
}

export interface DocDocument {
  id: string;
  categoryId: string;
  title: string;
  content?: string | null;
  docType?: string | null;
  status?: string;
  createdById?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** 允许后端扩展字段（如 createdBy / updatedBy 等展示用嵌套对象） */
  [key: string]: unknown;
}

export interface DocVersion {
  id: string;
  documentId: string;
  content: string;
  createdById: string;
  createdAt: string;
}

export const docsAPI = {
  categories: {
    list: () => get<DocCategory[]>('/docs/categories'),
    create: (data: Partial<DocCategory>) => post<DocCategory>('/docs/categories', data),
    update: (id: string, data: Partial<DocCategory>) => put<DocCategory>(`/docs/categories/${id}`, data),
    remove: (id: string) => del<{ id: string }>(`/docs/categories/${id}`),
  },
  documents: {
    list: (params?: Record<string, unknown>) =>
      requestPaged<DocDocument>({ method: 'GET', url: '/docs/documents', params }),
    get: (id: string) => get<DocDocument>(`/docs/documents/${id}`),
    create: (data: Partial<DocDocument>) => post<DocDocument>('/docs/documents', data),
    update: (id: string, data: Partial<DocDocument>) => put<DocDocument>(`/docs/documents/${id}`, data),
    remove: (id: string) => del<{ id: string }>(`/docs/documents/${id}`),
    versions: (id: string) => get<DocVersion[]>(`/docs/documents/${id}/versions`),
    search: (keyword: string, docType?: string) =>
      get<DocDocument[]>('/docs/search', { params: { keyword, docType } }),
  },
};

/* ── 引物库 ───────────────────────────────────────────────────────────────── */

export interface Primer {
  id: string;
  code?: string;
  name: string;
  sequence?: string | null;
  targetGene?: string | null;
  detectionTarget?: string | null;
  projectName?: string | null;
  speciesChineseName?: string | null;
  speciesLatinName?: string | null;
  /** Tencent 承接（D-3）：验证菌株，引物级字段 */
  validatedStrain?: string | null;
  /** v1.2（2026-10-12）：库存批次（盘点数据） */
  lots?: PrimerLot[];
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 引物/探针库存批次（v1.2） */
export interface PrimerLot {
  id: string;
  primerId?: string;
  lotNo: string;
  quantity?: string | number | null;
  unit?: string;
  spec?: string | null;
  containerCount?: string | number | null;
  openedStatus?: 'SEALED' | 'OPENED' | null;
  form?: string | null;
  location?: string | null;
  locationId?: string | null;
  supplier?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  status?: string;
  storage?: { id: string; code: string; name: string; path: string } | null;
  [key: string]: unknown;
}

export interface PrimerQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  projectName?: string;
  targetGene?: string;
  detectionTarget?: string;
  status?: string;
}

export const primerAPI = {
  list: (params?: PrimerQuery) =>
    requestPaged<Primer>({ method: 'GET', url: '/primers', params }),
  get: (id: string) => get<Primer>(`/primers/${id}`),
  create: (data: Partial<Primer>) => post<Primer>('/primers', data),
  update: (id: string, data: Partial<Primer>) => put<Primer>(`/primers/${id}`, data),
  remove: (id: string) => del<{ id: string }>(`/primers/${id}`),
  batchImport: (rows: Partial<Primer>[]) =>
    post<{
      success: Array<{ id: string; code: string; name: string }>;
      failed: Array<{ index: number; name: string | null; reason: string }>;
    }>('/primers/batch-import', { rows }),
};

/* ── 样本库 ───────────────────────────────────────────────────────────────── */

export interface SampleMaterial {
  id: string;
  name: string;
  commonName?: string | null;
  category?: string | null;
  /** v1.2：存放位置（复用库位树） */
  location?: string | null;
  locationId?: string | null;
  storage?: { id: string; code: string; name: string; path: string } | null;
  [key: string]: unknown;
}

export const samplesAPI = {
  // v1.6：列表附带 projectNames（拆分去重后的业务项目名，供「归属项目」下拉）。
  // 注意：不走 requestPaged/normalizePaged——该函数只保留 items/total/page/pageSize，会丢弃额外字段。
  list: async (params?: Record<string, unknown>) => {
    const raw = await get<Record<string, any>>('/samples', { params });
    const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.list) ? raw.list : [];
    return {
      items,
      total: typeof raw?.total === 'number' ? raw.total : items.length,
      page: typeof raw?.page === 'number' ? raw.page : 1,
      pageSize: typeof raw?.pageSize === 'number' ? raw.pageSize : 20,
      projectNames: Array.isArray(raw?.projectNames) ? raw.projectNames : undefined,
    };
  },
  get: (id: string) => get<SampleMaterial>(`/samples/${id}`),
  create: (data: Partial<SampleMaterial>) => post<SampleMaterial>('/samples', data),
  update: (id: string, data: Partial<SampleMaterial>) => put<SampleMaterial>(`/samples/${id}`, data),
  remove: (id: string) => del<{ id: string }>(`/samples/${id}`),
};
