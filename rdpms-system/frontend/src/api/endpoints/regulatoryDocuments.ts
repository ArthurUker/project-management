import { del, get, post, put, requestPaged } from '../request';

export interface RegulatoryDocument {
  id: string;
  dispatchNo: string;
  title: string;
  fullTitle?: string | null;
  category?: string | null;
  applicability?: string;
  applicableToIvd?: boolean;
  priorityLevel?: string;
  summary?: string | null;
  applicabilityNote?: string | null;
  fileName?: string | null;
  /** 原文文件（统一走 /api/files 上传后写入） */
  originalFileId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegulatoryDocumentQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
  applicability?: string;
  priorityLevel?: string;
  applicableToIvd?: boolean;
}

export const regulatoryDocumentsAPI = {
  list: (params?: RegulatoryDocumentQuery) =>
    requestPaged<RegulatoryDocument>({ method: 'GET', url: '/regulatory-documents', params }),

  get: (id: string) => get<RegulatoryDocument>(`/regulatory-documents/${id}`),

  create: (data: Partial<RegulatoryDocument>) =>
    post<RegulatoryDocument>('/regulatory-documents', data),

  update: (id: string, data: Partial<RegulatoryDocument>) =>
    put<RegulatoryDocument>(`/regulatory-documents/${id}`, data),

  remove: (id: string) => del<{ id: string }>(`/regulatory-documents/${id}`),

  seed: () => post<{ count: number }>('/regulatory-documents/seed', {}),

  /** 关联任务 */
  linkTask: (id: string, taskId: string, relationType?: string) =>
    post<unknown>(`/regulatory-documents/${id}/tasks`, { taskId, relationType }),

  unlinkTask: (id: string, taskId: string) =>
    del<{ id: string }>(`/regulatory-documents/${id}/tasks/${taskId}`),

  tasks: (id: string) => get<unknown[]>(`/regulatory-documents/${id}/tasks`),
};
