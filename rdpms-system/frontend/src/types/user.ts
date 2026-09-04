import type { EnumValue, ID, Timestamps } from './common';

/** 系统级角色：M-1 v1.0 六角色固定集合 */
export type SystemRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'MEMBER'
  | 'VIEWER'
  | 'AUDITOR'
  | EnumValue;

/** 角色展示名（仅用于 UI 文本，不参与任何权限判定） */
export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  MANAGER: '项目经理',
  MEMBER: '普通成员',
  VIEWER: '只读',
  AUDITOR: '审计员',
};

export function roleLabel(role?: string): string {
  if (!role) return '—';
  return ROLE_LABEL[role] ?? role;
}

export interface User extends Timestamps {
  id: ID;
  username: string;
  /** 显示名（M-1：BE 白名单字段） */
  displayName: string;
  /** 兼容字段：后端 /me 同时返回 name */
  name: string;
  position?: string;
  department?: string;
  phone?: string;
  email?: string;
  /** 系统角色（六角色，UI 只做展示，不做权限判定） */
  systemRole: SystemRole;
  /** 兼容字段：后端若仍返回 role，前端不依赖它做判定 */
  role?: string;
  status: string;
  avatar?: string | null;
  avatarFileId?: string | null;
  mustChangePassword?: boolean;
}

/** 登录 / me 接口返回的当前用户信息 —— permissions 是权限唯一来源 */
export interface CurrentUser extends User {
  permissions: string[];
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: CurrentUser;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** 创建用户（M-1 §7.3：不提交 systemRole，默认 MEMBER 由 BE 决定） */
export interface CreateUserDto {
  username: string;
  password: string;
  displayName: string;
  position?: string;
  department?: string;
  phone?: string;
  email?: string;
}

/** 更新用户：M-1 §6.3 BE 白名单（displayName/position/department/phone/email/avatarFileId） */
export type UpdateUserDto = Partial<
  Pick<User, 'displayName' | 'position' | 'department' | 'phone' | 'email' | 'avatar'>
>;
