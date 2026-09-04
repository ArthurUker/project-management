import { del, get, post, put, requestPaged } from '../request';

export interface ProjectTemplate {
  id: string;
  name: string;
  type?: string | null;
  parentId?: string | null;
  isMaster?: boolean;
  preview?: string | null;
  status?: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** 允许后端扩展字段（phases / nodes / config 等模板结构） */
  [key: string]: unknown;
}

export interface TaskTemplate {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  steps?: TaskTemplateStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskTemplateStep {
  id: string;
  taskTemplateId: string;
  title: string;
  description?: string | null;
  order: number;
}

export const projectTemplatesAPI = {
  list: (params?: Record<string, unknown>) =>
    requestPaged<ProjectTemplate>({ method: 'GET', url: '/project-templates', params }),

  get: (id: string) => get<ProjectTemplate>(`/project-templates/${id}`),

  create: (data: Partial<ProjectTemplate>) => post<ProjectTemplate>('/project-templates', data),

  update: (id: string, data: Partial<ProjectTemplate>) =>
    put<ProjectTemplate>(`/project-templates/${id}`, data),

  patch: (id: string, data: Partial<ProjectTemplate>) =>
    put<ProjectTemplate>(`/project-templates/${id}`, data),

  remove: (id: string) => del<{ id: string }>(`/project-templates/${id}`),

  copy: (id: string) => post<ProjectTemplate>(`/project-templates/${id}/copy`),

  preview: (id: string) => get<unknown>(`/project-templates/${id}/preview`),

  apply: (id: string, data?: unknown) => post<unknown>(`/project-templates/${id}/apply`, data),

  roles: {
    list: (templateId: string) => get<unknown[]>(`/project-templates/${templateId}/roles`),
    create: (templateId: string, data: unknown) =>
      post<unknown>(`/project-templates/${templateId}/roles`, data),
    update: (templateId: string, roleId: string, data: unknown) =>
      put<unknown>(`/project-templates/${templateId}/roles/${roleId}`, data),
    remove: (templateId: string, roleId: string) =>
      del<{ id: string }>(`/project-templates/${templateId}/roles/${roleId}`),
    batch: (templateId: string, roles: unknown[]) =>
      post<unknown[]>(`/project-templates/${templateId}/roles/batch`, { roles }),
  },
};

export const taskTemplatesAPI = {
  list: (params?: Record<string, unknown>) =>
    requestPaged<TaskTemplate>({ method: 'GET', url: '/task-templates', params }),

  get: (id: string) => get<TaskTemplate>(`/task-templates/${id}`),

  create: (data: Partial<TaskTemplate>) => post<TaskTemplate>('/task-templates', data),

  update: (id: string, data: Partial<TaskTemplate>) =>
    put<TaskTemplate>(`/task-templates/${id}`, data),

  remove: (id: string) => del<{ id: string }>(`/task-templates/${id}`),

  bulkDelete: (ids: string[], force?: boolean) =>
    post<{ count: number }>('/task-templates/bulk-delete', { ids, force }),

  seed: () => post<{ count: number }>('/task-templates/seed', {}),
};
