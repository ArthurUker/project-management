import { del, get, patch, post, put, requestPaged } from '../request';

export interface RegistrationProject {
  id: string;
  code?: string;
  name: string;
  status?: string;
  currentStage?: string | null;
  managerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  profile?: RegistrationProfile | null;
  /** 允许后端扩展字段 */
  [key: string]: unknown;
}

export interface RegistrationProfile {
  id: string;
  projectId: string;
  registrationType?: string;
  region?: string | null;
  authority?: string | null;
  submissionNo?: string | null;
  certificateNo?: string | null;
  currentStage?: string | null;
  plannedSubmissionDate?: string | null;
  expectedApprovalDate?: string | null;
  complianceOwnerId?: string | null;
  riskLevel?: string | null;
  notes?: string | null;
}

export interface RegistrationQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  stage?: string;
  currentStage?: string;
  status?: string;
  [key: string]: unknown;
}

export const registrationsAPI = {
  list: (params?: RegistrationQuery) =>
    requestPaged<RegistrationProject>({ method: 'GET', url: '/registrations', params }),

  stats: () => get<unknown>('/registrations/stats'),

  templates: () => get<unknown[]>('/registrations/templates'),

  get: (id: string) => get<RegistrationProject>(`/registrations/${id}`),

  create: (data: Partial<RegistrationProject>) => post<RegistrationProject>('/registrations', data),

  update: (id: string, data: Partial<RegistrationProject>) =>
    put<RegistrationProject>(`/registrations/${id}`, data),

  updateProfile: (id: string, data: Partial<RegistrationProfile>) =>
    patch<RegistrationProfile>(`/registrations/${id}/profile`, data),

  updateStage: (id: string, toStage: string) =>
    patch<RegistrationProject>(`/registrations/${id}/stage`, { toStage }),

  remove: (id: string) => del<{ id: string }>(`/registrations/${id}`),
};
