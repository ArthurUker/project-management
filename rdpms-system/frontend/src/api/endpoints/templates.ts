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

/** 模板任务（规范投影，P0-01：含领域字段与模板身份） */
export interface TemplateInstantiationTask {
  templateTaskId?: string | null;
  templatePhaseId?: string | null;
  title: string;
  code?: string | null;
  description?: string | null;
  taskType?: string | null;
  applicability?: string | null;
  regulatoryPriority?: string | null;
  expectedDeliverable?: string | null;
  regulatoryNotes?: string | null;
  estimatedHours?: number | null;
  estimatedDays?: number;
  assigneeRoleCode?: string | null;
  priority?: string;
  status?: string;
  enabled?: boolean;
  dueDate?: string;
}

/** 模板阶段（规范投影；name 为真实阶段名，非 key/UUID） */
export interface TemplateInstantiationPhase {
  templatePhaseId: string;
  key?: string;
  name: string;
  order: number;
  totalDays?: number;
  isMilestone?: boolean;
  enabled?: boolean;
  type?: string;
  phaseInfo?: string | null;
  completionTip?: string | null;
  allowSkip?: boolean;
  nextPhaseIds?: string[];
  taskCount?: number;
  tasks: TemplateInstantiationTask[];
}

/** POST /:id/apply 响应载荷（P0-02/P0-03：与项目实例化共用同一规范来源） */
export interface TemplateApplyPayload {
  tasks: TemplateInstantiationTask[];
  phases: TemplateInstantiationPhase[];
  milestones: unknown[];
  templateId: string;
  defaults?: Record<string, unknown>;
  counts?: {
    phaseCount: number;
    taskCount: number;
    emptyPhaseCount: number;
    conditionalCount: number;
    requiredCount: number;
    disabledTaskCount: number;
  };
  emptyPhases?: Array<{ templatePhaseId: string; key?: string; name: string }>;
  /** 模板可保留、但当前项目模型不能表达的字段（不得伪称生效） */
  runtimeUnsupported?: Record<string, string>;
  source?: 'config' | 'structured';
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

  apply: (id: string, data?: unknown) =>
    post<{ payload: TemplateApplyPayload }>(`/project-templates/${id}/apply`, data),

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
