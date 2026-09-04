import { del, get, patch, post, put, requestPaged } from '../request';
import type { Paged } from '../types';
import type { CreateReportDto, Report, ReportVersion, UpdateReportDto } from '../../types/report';

export interface ReportQuery {
  page?: number;
  pageSize?: number;
  month?: string;
  projectId?: string;
  userId?: string;
  status?: string;
}

export const reportAPI = {
  list: (params?: ReportQuery) => requestPaged<Report>({ method: 'GET', url: '/reports', params }),

  get: (id: string) => get<Report>(`/reports/${id}`),

  save: (data: CreateReportDto) => post<Report>('/reports', data),

  update: (id: string, data: UpdateReportDto) => put<Report>(`/reports/${id}`, data),

  submit: (id: string) => post<Report>(`/reports/${id}/submit`),

  approve: (id: string, note?: string) => post<Report>(`/reports/${id}/approve`, { note }),

  reject: (id: string, note: string) => post<Report>(`/reports/${id}/reject`, { note }),

  recall: (id: string) => patch<Report>(`/reports/${id}/recall`),

  versions: (id: string) => get<ReportVersion[]>(`/reports/${id}/versions`),

  export: (month: string, params?: Record<string, unknown>) =>
    get<Report[]>(`/reports/export/month/${month}`, { params }),

  remove: (id: string) => del<{ id: string }>(`/reports/${id}`),
};

export const progressAPI = {
  get: (projectId: string, months?: number) =>
    get<unknown>(`/progress/project/${projectId}`, { params: { months } }),

  save: (projectId: string, data: unknown) =>
    post<unknown>(`/progress/project/${projectId}`, data),

  export: (month: string) => get<unknown>(`/progress/export/${month}`),
};

export type { Paged };
