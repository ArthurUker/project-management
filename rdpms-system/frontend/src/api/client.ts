import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('rdpms_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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

// API方法
export const authAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  verify: () => api.post('/auth/verify'),
  logout: () => api.post('/auth/logout'),
  profile: () => api.get('/auth/profile'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.put('/auth/password', { oldPassword, newPassword }),
};

export const userAPI = {
  list: (params?: Record<string, any>) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  resetPassword: (id: string, newPassword: string) =>
    api.put(`/users/${id}/reset-password`, { newPassword }),
  batchCreate: (users: any[]) => api.post('/users/batch', { users }),
};

export const projectAPI = {
  list: (params?: Record<string, any>) => api.get('/projects', { params }),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: string, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  members: (id: string) => api.get(`/projects/${id}/members`),
  addMember: (id: string, userId: string, role?: string) =>
    api.post(`/projects/${id}/members`, { userId, role }),
  removeMember: (id: string, userId: string) =>
    api.delete(`/projects/${id}/members/${userId}`),
};

export const reportAPI = {
  list: (params?: Record<string, any>) => api.get('/reports', { params }),
  get: (id: string) => api.get(`/reports/${id}`),
  save: (data: any) => api.post('/reports', data),
  submit: (id: string) => api.post(`/reports/${id}/submit`),
  approve: (id: string, note?: string) => api.post(`/reports/${id}/approve`, { note }),
  reject: (id: string, note: string) => api.post(`/reports/${id}/reject`, { note }),
  versions: (id: string) => api.get(`/reports/${id}/versions`),
  export: (month: string, params?: Record<string, any>) =>
    api.get(`/reports/export/month/${month}`, { params }),
};

export const progressAPI = {
  get: (projectId: string, months?: number) =>
    api.get(`/progress/project/${projectId}`, { params: { months } }),
  save: (projectId: string, data: any) =>
    api.post(`/progress/project/${projectId}`, data),
  export: (month: string) => api.get(`/progress/export/${month}`),
};

export const taskAPI = {
  list: (params?: Record<string, any>) => api.get('/tasks', { params }),
  get: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.put(`/tasks/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/tasks/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  board: (projectId: string) => api.get(`/tasks/board/${projectId}`),
};

export const syncAPI = {
  init: (lastSync?: string) =>
    api.get('/sync/init', { params: { lastSync } }),
  push: (data: { reports?: any[]; tasks?: any[] }) => api.post('/sync/push', data),
};

export const statsAPI = {
  dashboard: () => api.get('/stats/dashboard'),
  projects: (params?: Record<string, any>) => api.get('/stats/projects', { params }),
  workload: (userId: string) => api.get(`/stats/users/${userId}/workload`),
  reports: (params?: Record<string, any>) => api.get('/stats/reports', { params }),
};

export const docsAPI = {
  // 分类管理
  categories: {
    list: () => api.get('/docs/categories'),
    create: (data: any) => api.post('/docs/categories', data),
    update: (id: string, data: any) => api.put(`/docs/categories/${id}`, data),
    delete: (id: string) => api.delete(`/docs/categories/${id}`),
  },
  // 文档管理
  documents: {
    list: (params?: Record<string, any>) => api.get('/docs/documents', { params }),
    get: (id: string) => api.get(`/docs/documents/${id}`),
    create: (data: any) => api.post('/docs/documents', data),
    update: (id: string, data: any) => api.put(`/docs/documents/${id}`, data),
    delete: (id: string) => api.delete(`/docs/documents/${id}`),
    versions: (id: string) => api.get(`/docs/documents/${id}/versions`),
    search: (keyword: string, docType?: string) => 
      api.get('/docs/search', { params: { keyword, docType } }),
  },
};

export default api;

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  list?: T[];
  flat?: T[];
  // 其他可能的响应属性
}

// 试剂配方API
export const reagentsAPI = {
  categories: {
    list: (): Promise<ApiResponse<any>> => api.get('/reagents/categories'),
    create: (data: any): Promise<ApiResponse> => api.post('/reagents/categories', data),
    update: (id: string, data: any): Promise<ApiResponse> => api.put(`/reagents/categories/${id}`, data),
    delete: (id: string): Promise<ApiResponse> => api.delete(`/reagents/categories/${id}`),
  },
  recipes: {
    list: (params?: any): Promise<ApiResponse<any>> => api.get('/reagents/recipes', { params }),
    get: (id: string) => api.get(`/reagents/recipes/${id}`),
    create: (data: any): Promise<ApiResponse> => api.post('/reagents/recipes', data),
    update: (id: string, data: any): Promise<ApiResponse> => api.put(`/reagents/recipes/${id}`, data),
    delete: (id: string): Promise<ApiResponse> => api.delete(`/reagents/recipes/${id}`),
  },
};