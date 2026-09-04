import { del, get, patch, post, put, requestPaged } from '../request';
import type { CreateTaskDto, Task, TaskQuery, UpdateTaskDto } from '../../types/task';

export const taskAPI = {
  list: (params?: TaskQuery) => requestPaged<Task>({ method: 'GET', url: '/tasks', params }),

  get: (id: string) => get<Task>(`/tasks/${id}`),

  create: (data: CreateTaskDto) => post<Task>('/tasks', data),

  update: (id: string, data: UpdateTaskDto) => put<Task>(`/tasks/${id}`, data),

  updateStatus: (id: string, status: string) => patch<Task>(`/tasks/${id}/status`, { status }),

  remove: (id: string) => del<{ id: string }>(`/tasks/${id}`),

  board: (projectId: string) => get<Task[]>(`/tasks/board/${projectId}`),

  dependencies: (id: string) => get<unknown[]>(`/tasks/${id}/dependencies`),
};
