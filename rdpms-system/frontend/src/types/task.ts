import type { EnumValue, ID, Timestamps, Versioned } from './common';

export interface AssigneeRef {
  id: ID;
  name: string;
  avatar?: string | null;
}

export interface Task extends Timestamps, Versioned {
  id: ID;
  projectId: ID;
  parentId?: ID | null;
  title: string;
  description?: string | null;
  assigneeId?: ID | null;
  assignee?: AssigneeRef | null;
  status: EnumValue;
  priority: EnumValue;
  taskType?: EnumValue | null;
  startDate?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  progress?: number;
  order?: number;
  project?: { id: ID; name: string; code: string };
}

export interface CreateTaskDto {
  projectId: ID;
  title: string;
  parentId?: ID | null;
  description?: string;
  assigneeId?: ID | null;
  status?: EnumValue;
  priority?: EnumValue;
  taskType?: EnumValue;
  startDate?: string;
  dueDate?: string;
}

export type UpdateTaskDto = Partial<CreateTaskDto> & { version?: number };

export interface TaskQuery {
  page?: number;
  pageSize?: number;
  projectId?: ID;
  assigneeId?: ID;
  status?: string;
  priority?: string;
  keyword?: string;
}

export interface TaskDependency {
  id: ID;
  taskId: ID;
  prerequisiteId: ID;
}
