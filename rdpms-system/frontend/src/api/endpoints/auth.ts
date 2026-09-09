import { del, get, patch, post, put, requestPaged } from '../request';
import type { Paged } from '../types';
import type { CreateUserDto, CurrentUser, LoginResult, RefreshResult, UpdateUserDto } from '../../types/user';

export interface LoginPayload {
  username: string;
  password: string;
}

export const authAPI = {
  login: (payload: LoginPayload) => post<LoginResult>('/auth/login', payload),

  refresh: (refreshToken: string) => post<RefreshResult>('/auth/refresh', { refreshToken }),

  logout: (refreshToken?: string | null) => post<{ success: true }>('/auth/logout', { refreshToken }),

  /** 权限唯一来源：每次刷新页面引导会话时调用 */
  me: () => get<CurrentUser>('/auth/me'),

  /** 兼容旧端点：后端提供 /me 后可删除 */
  verify: () => post<{ valid: boolean; user: CurrentUser }>('/auth/verify'),

  profile: () => get<CurrentUser>('/auth/profile'),

  changePassword: (oldPassword: string, newPassword: string) =>
    put<{ success: true }>('/auth/password', { oldPassword, newPassword }),

  /** 首登强制改密：无需旧密码 */
  forceChangePassword: (newPassword: string) =>
    put<{ success: true }>('/auth/password/force', { newPassword }),
};

export interface UserQuery {
  page?: number;
  pageSize?: number;
  department?: string;
  systemRole?: string;
  status?: string;
  keyword?: string;
}

export const userAPI = {
  /** 分页列表 —— 统一 Paged<T>。权限 users.view */
  list: (params?: UserQuery) => requestPaged<CurrentUser>({ method: 'GET', url: '/users', params }),

  get: (id: string) => get<CurrentUser>(`/users/${id}`),

  /** M-1 §7.3：创建不提交 systemRole（BE 固定 MEMBER） */
  create: (data: CreateUserDto) => post<CurrentUser>('/users', data),

  /** 批量导入（users.create；逐条校验，返回成功/失败明细。A-1 Tencent 复刻） */
  batchCreate: (
    users: Array<{
      username: string;
      password: string;
      displayName?: string;
      name?: string;
      position?: string;
      department?: string;
      phone?: string;
      email?: string;
    }>,
  ) =>
    post<{
      success: Array<{ id: string; username: string; displayName: string }>;
      failed: Array<{ index: number; username: string | null; reason: string }>;
    }>('/users/batch', { users }),

  /** M-1 §6.3：仅白名单字段（displayName/position/department/phone/email） */
  update: (id: string, data: UpdateUserDto) => put<CurrentUser>(`/users/${id}`, data),

  /** 启停唯一入口：users.enable / users.disable */
  setStatus: (id: string, status: 'ACTIVE' | 'DISABLED') =>
    patch<{ id: string; status: string }>(`/users/${id}/status`, { status }),

  /** 角色绑定唯一入口：roles.assign_user */
  assignRoles: (id: string, roleCodes: string[]) =>
    put<{ id: string; roleCodes: string[] }>(`/users/${id}/roles`, { roleCodes }),

  remove: (id: string) => del<{ id: string }>(`/users/${id}`),

  /** 权限 users.reset_password */
  resetPassword: (id: string, newPassword: string) =>
    put<{ success: true }>(`/users/${id}/reset-password`, { newPassword }),
};

export type { Paged };
