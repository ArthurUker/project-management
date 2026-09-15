import { del, get, patch, post, put, requestPaged } from '../request';
import type { Paged } from '../types';
import { toReport, toReportList } from '../adapters/report';
import type {
  CreateReportDto, RawReport, Report, ReportVersion, UpdateReportDto,
} from '../../types/report';

export interface ReportQuery {
  page?: number;
  pageSize?: number;
  /** 周期键（DAILY=YYYY-MM-DD、WEEKLY=YYYY-Www、MONTHLY=YYYY-MM）；旧参数 month 仍被后端接受 */
  periodKey?: string;
  projectId?: string;
  userId?: string;
  reportType?: string;
  status?: string;
}

export const reportAPI = {
  list: async (params?: ReportQuery): Promise<Paged<Report>> => {
    const paged = await requestPaged<RawReport>({ method: 'GET', url: '/reports', params });
    return { ...paged, items: toReportList(paged.items ?? []) };
  },

  get: async (id: string) => toReport(await get<RawReport>(`/reports/${id}`)),

  /** 保存草稿（新建或按 项目+作者+类型+周期 覆盖草稿） */
  save: async (data: CreateReportDto) => toReport(await post<RawReport>('/reports', data)),

  /** 保存草稿（已有汇报） */
  update: async (id: string, data: UpdateReportDto) => toReport(await put<RawReport>(`/reports/${id}`, data)),

  /** 提交（服务端权威写版本与状态） */
  submit: (id: string, clientMutationId?: string) =>
    post<{ success: boolean }>(`/reports/${id}/submit`, clientMutationId ? { clientMutationId } : {}),

  approve: (id: string, note?: string) => post<Report>(`/reports/${id}/approve`, { note }),

  reject: (id: string, note: string) => post<Report>(`/reports/${id}/reject`, { note }),

  recall: (id: string) => patch<Report>(`/reports/${id}/recall`),

  versions: (id: string) => get<ReportVersion[]>(`/reports/${id}/versions`),

  export: (periodKey: string, params?: Record<string, unknown>) =>
    get<RawReport[]>(`/reports/export/month/${periodKey}`, { params }),

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
