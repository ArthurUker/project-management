import { get, post, put } from '../request';

/**
 * 角色与角色权限 API（M-1 §6 权限真源：permissions 表）。
 *   GET    /roles                    roles.view
 *   GET    /roles/permission-catalog roles.view
 *   POST   /roles/:id/permissions    roles.assign_permissions（仅 SUPER_ADMIN）
 *   PUT    /users/:id/roles          roles.assign_user（仅 SUPER_ADMIN）
 */
export interface RoleItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  sortOrder: number;
  userCount: number;
  permissionCodes: string[];
}

export interface PermissionCatalogItem {
  id: string;
  code: string;
  name: string;
  module: string | null;
  isHighRisk: boolean;
  sortOrder: number;
}

export const rolesAPI = {
  list: () => get<{ items: RoleItem[]; list: RoleItem[] }>('/roles'),
  permissionCatalog: () =>
    get<{ items: PermissionCatalogItem[]; list: PermissionCatalogItem[] }>('/roles/permission-catalog'),
  /** 权限分配唯一入口：POST /roles/:id/permissions（全量覆盖） */
  assignPermissions: (roleId: string, permissionCodes: string[]) =>
    post<{ id: string; permissionCodes: string[] }>(`/roles/${roleId}/permissions`, { permissionCodes }),
  /** 用户角色绑定唯一入口：PUT /users/:id/roles（全量覆盖） */
  assignUserRoles: (userId: string, roleCodes: string[]) =>
    put<{ id: string; roleCodes: string[] }>(`/users/${userId}/roles`, { roleCodes }),
};
