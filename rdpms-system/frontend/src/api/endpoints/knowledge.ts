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
  name: string;
  sequence?: string | null;
  targetGene?: string | null;
  detectionTarget?: string | null;
  projectName?: string | null;
  speciesChineseName?: string | null;
  speciesLatinName?: string | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
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
  batchImport: (rows: Partial<Primer>[]) => post<{ count: number }>('/primers/batch-import', { rows }),
};

/* ── 样本库 ───────────────────────────────────────────────────────────────── */

export interface SampleMaterial {
  id: string;
  name: string;
  commonName?: string | null;
  category?: string | null;
  [key: string]: unknown;
}

export const samplesAPI = {
  list: (params?: Record<string, unknown>) =>
    requestPaged<SampleMaterial>({ method: 'GET', url: '/samples', params }),
  get: (id: string) => get<SampleMaterial>(`/samples/${id}`),
  create: (data: Partial<SampleMaterial>) => post<SampleMaterial>('/samples', data),
  update: (id: string, data: Partial<SampleMaterial>) => put<SampleMaterial>(`/samples/${id}`, data),
  remove: (id: string) => del<{ id: string }>(`/samples/${id}`),
};
