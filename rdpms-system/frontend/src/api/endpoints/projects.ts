import { del, get, post, put, requestPaged } from '../request';
import type { Paged } from '../types';
import type {
  CreateProjectDto,
  Project,
  ProjectMember,
  ProjectQuery,
  UpdateProjectDto,
} from '../../types/project';

export const projectAPI = {
  list: (params?: ProjectQuery) =>
    requestPaged<Project>({ method: 'GET', url: '/projects', params }),

  get: (id: string) => get<Project>(`/projects/${id}`),

  create: (data: CreateProjectDto) => post<Project>('/projects', data),

  update: (id: string, data: UpdateProjectDto) => put<Project>(`/projects/${id}`, data),

  remove: (id: string) => del<{ id: string }>(`/projects/${id}`),

  batchDelete: (ids: string[]) => post<{ count: number }>('/projects/batch-delete', { ids }),

  batchUpdateStatus: (ids: string[], status: string) =>
    post<{ count: number }>('/projects/batch-update-status', { ids, status }),

  members: (id: string) => get<ProjectMember[]>(`/projects/${id}/members`),

  addMember: (id: string, userId: string, role?: string) =>
    post<ProjectMember>(`/projects/${id}/members`, { userId, role }),

  removeMember: (id: string, userId: string) =>
    del<{ id: string }>(`/projects/${id}/members/${userId}`),

  applyTemplate: (id: string, data: { templateId: string; startDate?: string }) =>
    post<Project>(`/projects/${id}/apply-template`, data),

  phases: (id: string) => get<unknown[]>(`/projects/${id}/phases`),

  milestones: (id: string) => get<unknown[]>(`/projects/${id}/milestones`),
};

export type { Paged };
