import type { EnumValue, ID, Timestamps, Versioned } from './common';

export interface ManagerRef {
  id: ID;
  name: string;
}

export interface ProjectMember {
  id: ID;
  projectId: ID;
  userId: ID;
  role: EnumValue;
  user?: { id: ID; name: string; avatar?: string | null };
}

export interface Project extends Timestamps, Versioned {
  id: ID;
  code: string;
  name: string;
  type: EnumValue;
  subtype?: string | null;
  status: EnumValue;
  position?: string | null;
  managerId: ID;
  manager?: ManagerRef;
  members?: ProjectMember[];
  isDraft?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
}

export interface CreateProjectDto {
  code?: string;
  name: string;
  type?: EnumValue;
  subtype?: string;
  status?: EnumValue;
  managerId: ID;
  startDate?: string;
  endDate?: string;
  description?: string;
  isDraft?: boolean;
}

export type UpdateProjectDto = Partial<CreateProjectDto> & { version?: number };

export interface ProjectQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  type?: string;
  status?: string;
  managerId?: string;
  isDraft?: boolean;
}
