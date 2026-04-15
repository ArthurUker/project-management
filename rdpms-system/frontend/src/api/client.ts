import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  list?: T[];
  flat?: T[];
  [key: string]: any;
}

// 简单的请求包装器，确保返回的是 response.data 的类型
const get = <T = any>(url: string, config?: any): Promise<T> => api.get(url, config) as Promise<T>;
const post = <T = any>(url: string, data?: any, config?: any): Promise<T> => api.post(url, data, config) as Promise<T>;
const put = <T = any>(url: string, data?: any, config?: any): Promise<T> => api.put(url, data, config) as Promise<T>;
const del = <T = any>(url: string, config?: any): Promise<T> => api.delete(url, config) as Promise<T>;
const patch = <T = any>(url: string, data?: any, config?: any): Promise<T> => api.patch(url, data, config) as Promise<T>;

// 请求拦截器：添加Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('rdpms_token');
    if (token) {
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：处理错误
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('rdpms_token');
      localStorage.removeItem('rdpms_user');
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || error);
  }
);

// API方法（使用包装器以获得正确的返回类型）
export const authAPI = {
  login: (username: string, password: string) =>
    post<ApiResponse<any>>('/auth/login', { username, password }),
  verify: () => post<ApiResponse<any>>('/auth/verify'),
  logout: () => post<ApiResponse<any>>('/auth/logout'),
  profile: () => get<ApiResponse<any>>('/auth/profile'),
  changePassword: (oldPassword: string, newPassword: string) =>
    put<ApiResponse<any>>('/auth/password', { oldPassword, newPassword }),
};

export const userAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/users', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/users/${id}`),
  create: (data: any) => post<ApiResponse<any>>('/users', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/users/${id}`, data),
  delete: (id: string) => del<ApiResponse<any>>(`/users/${id}`),
  resetPassword: (id: string, newPassword: string) =>
    put<ApiResponse<any>>(`/users/${id}/reset-password`, { newPassword }),
  batchCreate: (users: any[]) => post<ApiResponse<any>>('/users/batch', { users }),
};

export const projectAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/projects', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/projects/${id}`),
  create: (data: any) => post<ApiResponse<any>>('/projects', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/projects/${id}`, data),
  delete: (id: string) => del<ApiResponse<any>>(`/projects/${id}`),
  batchDelete: (ids: string[]) => post<ApiResponse<any>>('/projects/batch-delete', { ids }),
  batchUpdateStatus: (ids: string[], status: string) => post<ApiResponse<any>>('/projects/batch-update-status', { ids, status }),
  members: (id: string) => get<ApiResponse<any>>(`/projects/${id}/members`),
  addMember: (id: string, userId: string, role?: string) =>
    post<ApiResponse<any>>(`/projects/${id}/members`, { userId, role }),
  removeMember: (id: string, userId: string) =>
    del<ApiResponse<any>>(`/projects/${id}/members/${userId}`),
  applyTemplate: (id: string, data: { templateId: string; startDate?: string }) =>
    post<ApiResponse<any>>(`/projects/${id}/apply-template`, data),
};

export const reportAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/reports', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/reports/${id}`),
  save: (data: any) => post<ApiResponse<any>>('/reports', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/reports/${id}`, data),
  submit: (id: string) => post<ApiResponse<any>>(`/reports/${id}/submit`),
  approve: (id: string, note?: string) => post<ApiResponse<any>>(`/reports/${id}/approve`, { note }),
  reject: (id: string, note: string) => post<ApiResponse<any>>(`/reports/${id}/reject`, { note }),
  recall: (id: string) => patch<ApiResponse<any>>(`/reports/${id}/recall`),
  versions: (id: string) => get<ApiResponse<any>>(`/reports/${id}/versions`),
  export: (month: string, params?: Record<string, any>) =>
    get<ApiResponse<any>>(`/reports/export/month/${month}`, { params }),
  delete: (id: string) => del<ApiResponse<any>>(`/reports/${id}`),
};

export const progressAPI = {
  get: (projectId: string, months?: number) =>
    get<ApiResponse<any>>(`/progress/project/${projectId}`, { params: { months } }),
  save: (projectId: string, data: any) => post<ApiResponse<any>>(`/progress/project/${projectId}`, data),
  export: (month: string) => get<ApiResponse<any>>(`/progress/export/${month}`),
};

export const taskAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/tasks', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/tasks/${id}`),
  create: (data: any) => post<ApiResponse<any>>('/tasks', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/tasks/${id}`, data),
  updateStatus: (id: string, status: string) => patch<ApiResponse<any>>(`/tasks/${id}/status`, { status }),
  delete: (id: string) => del<ApiResponse<any>>(`/tasks/${id}`),
  board: (projectId: string) => get<ApiResponse<any>>(`/tasks/board/${projectId}`),
};

export const syncAPI = {
  init: (lastSync?: string) => get<ApiResponse<any>>('/sync/init', { params: { lastSync } }),
  push: (data: { reports?: any[]; tasks?: any[] }) => post<ApiResponse<any>>('/sync/push', data),
};

export const statsAPI = {
  dashboard: () => get<ApiResponse<any>>('/stats/dashboard'),
  projects: (params?: Record<string, any>) => get<ApiResponse<any>>('/stats/projects', { params }),
  workload: (userId: string) => get<ApiResponse<any>>(`/stats/users/${userId}/workload`),
  reports: (params?: Record<string, any>) => get<ApiResponse<any>>('/stats/reports', { params }),
};

export const projectTemplatesAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/project-templates', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/project-templates/${id}`),
  create: (data: any) => post<ApiResponse<any>>('/project-templates', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/project-templates/${id}`, data),
  patch: (id: string, data: any) => patch<ApiResponse<any>>(`/project-templates/${id}`, data),
  delete: (id: string) => del<ApiResponse<any>>(`/project-templates/${id}`),
  copy: (id: string) => post<ApiResponse<any>>(`/project-templates/${id}/copy`),
  preview: (id: string) => get<ApiResponse<any>>(`/project-templates/${id}/preview`),
  apply: (id: string, data?: any) => post<ApiResponse<any>>(`/project-templates/${id}/apply`, data),
};

export const taskTemplatesAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/task-templates', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/task-templates/${id}`),
  create: (data: any) => post<ApiResponse<any>>('/task-templates', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/task-templates/${id}`, data),
  delete: (id: string) => del<ApiResponse<any>>(`/task-templates/${id}`),
  bulkDelete: (ids: string[], force?: boolean) => post<ApiResponse<any>>('/task-templates/bulk-delete', { ids, force }),
};

export const docsAPI = {
  // 分类管理
  categories: {
    list: () => get<ApiResponse<any>>('/docs/categories'),
    create: (data: any) => post<ApiResponse<any>>('/docs/categories', data),
    update: (id: string, data: any) => put<ApiResponse<any>>(`/docs/categories/${id}`, data),
    delete: (id: string) => del<ApiResponse<any>>(`/docs/categories/${id}`),
  },
  // 文档管理
  documents: {
    list: (params?: Record<string, any>) => get<ApiResponse<any>>('/docs/documents', { params }),
    get: (id: string) => get<ApiResponse<any>>(`/docs/documents/${id}`),
    create: (data: any) => post<ApiResponse<any>>('/docs/documents', data),
    update: (id: string, data: any) => put<ApiResponse<any>>(`/docs/documents/${id}`, data),
    delete: (id: string) => del<ApiResponse<any>>(`/docs/documents/${id}`),
    versions: (id: string) => get<ApiResponse<any>>(`/docs/documents/${id}/versions`),
    search: (keyword: string, docType?: string) => 
      get<ApiResponse<any>>('/docs/search', { params: { keyword, docType } }),
  },
};

export default api;

// 旧的试剂配方API兼容层（保留）
export const reagentsAPI = {
  categories: {
    list: (): Promise<ApiResponse<any>> => get<ApiResponse<any>>('/reagents/categories'),
    create: (data: any): Promise<ApiResponse> => post<ApiResponse<any>>('/reagents/categories', data),
    update: (id: string, data: any): Promise<ApiResponse> => put<ApiResponse<any>>(`/reagents/categories/${id}`, data),
    delete: (id: string): Promise<ApiResponse> => del<ApiResponse<any>>(`/reagents/categories/${id}`),
  },
  recipes: {
    list: (params?: any): Promise<ApiResponse<any>> => get<ApiResponse<any>>('/reagents/recipes', { params }),
    get: (id: string) => get<ApiResponse<any>>(`/reagents/recipes/${id}`),
    create: (data: any): Promise<ApiResponse> => post<ApiResponse<any>>('/reagents/recipes', data),
    update: (id: string, data: any): Promise<ApiResponse> => put<ApiResponse<any>>(`/reagents/recipes/${id}`, data),
    delete: (id: string): Promise<ApiResponse> => del<ApiResponse<any>>(`/reagents/recipes/${id}`),
  },
};

// 新的试剂/配方/配制API
export const reagentAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/reagents', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/reagents/${id}`),
  create: (data: any) => post<ApiResponse<any>>('/reagents', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/reagents/${id}`, data),
  delete: (id: string) => del<ApiResponse<any>>(`/reagents/${id}`),
  formulas: (id: string) => get<ApiResponse<any>>(`/reagents/${id}/formulas`),
};

export const reagentMaterialsAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/reagent-materials', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/reagent-materials/${id}`),
  create: (data: any) => post<ApiResponse<any>>('/reagent-materials', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/reagent-materials/${id}`, data),
  delete: (id: string) => del<ApiResponse<any>>(`/reagent-materials/${id}`),
  bulkDelete: (ids: string[], force?: boolean) => post<ApiResponse<any>>('/reagent-materials/bulk-delete', { ids, force }),
};

export const formulaAPI = {
  list: (params?: Record<string, any>) => get<ApiResponse<any>>('/formulas', { params }),
  get: (id: string) => get<ApiResponse<any>>(`/formulas/${id}`),
  create: (data: any) => post<ApiResponse<any>>('/formulas', data),
  update: (id: string, data: any) => put<ApiResponse<any>>(`/formulas/${id}`, data),
  delete: (id: string) => del<ApiResponse<any>>(`/formulas/${id}`),
  duplicate: (id: string) => post<ApiResponse<any>>(`/formulas/${id}/duplicate`),
};

export const prepAPI = {
  calculate: (data: any) => post<ApiResponse<any>>('/prep/calculate', data),
  saveRecord: (data: any) => post<ApiResponse<any>>('/prep/records', data),
  listRecords: (params?: Record<string, any>) => get<ApiResponse<any>>('/prep/records', { params }),
  getRecord: (id: string) => get<ApiResponse<any>>(`/prep/records/${id}`),
};