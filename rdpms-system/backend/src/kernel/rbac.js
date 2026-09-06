/**
 * kernel/rbac.js —— 权限内核（M-1 §6.1）
 *
 * 权限真源：
 *   1. Permission 表（permissions.code）
 *   2. 普通角色：UserRole -> RolePermission -> Permission.code
 *   3. SUPER_ADMIN 短路持有全部 P0 90 条
 *   4. JWT 只携带 userId + systemRole（不携带权限数组，防篡改）
 */
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';
import { P0_PERMISSIONS } from './constants.js';
import { unauthorized, forbidden } from './http.js';

// W12：不再提供任何回退值——JWT_SECRET 必须显式配置（.env / systemd EnvironmentFile）。
// 生产缺失时由 index.js 启动守卫拦截；开发缺失时 jwt.sign 将直接报错（fail-fast）。
export const JWT_SECRET = process.env.JWT_SECRET;

/**
 * TTL 解析（W12 安全审计修复）：支持 "15m"/"1h"/"2d"/"30s" 或纯秒数。
 * 非法配置直接 throw（fail-fast），绝不静默回退——避免 access token 以意外时长签发。
 */
export function parseTtlToSec(raw, label) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([smhd])$/i);
  if (!m) throw new Error(`[config] ${label} 格式非法: "${raw}"（支持 900 / 15m / 1h / 2d）`);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2].toLowerCase()];
  return Math.round(Number.parseFloat(m[1]) * mult);
}

// access TTL 优先级：JWT_ACCESS_TTL（带单位，M-1 口径）> JWT_ACCESS_TTL_SEC（显式秒数）> 900（M-1 15 分钟）
const ACCESS_TTL_SEC =
  parseTtlToSec(process.env.JWT_ACCESS_TTL, 'JWT_ACCESS_TTL')
  ?? parseTtlToSec(process.env.JWT_ACCESS_TTL_SEC, 'JWT_ACCESS_TTL_SEC')
  ?? 900;

export function signAccessToken(user) {
  return jwt.sign({ userId: user.id, systemRole: user.systemRole }, JWT_SECRET, {
    expiresIn: ACCESS_TTL_SEC,
  });
}

/**
 * 认证 + 权限装载。c.set('auth', {...})。
 */
export async function authenticate(c, next) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw unauthorized('UNAUTHORIZED', '未认证');
  }
  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    throw unauthorized('INVALID_TOKEN', '会话无效或已过期');
  }
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      position: true,
      department: true,
      phone: true,
      systemRole: true,
      status: true,
      mustChangePassword: true,
      avatarFileId: true,
    },
  });
  if (!user || user.status !== 'ACTIVE') {
    throw unauthorized('SESSION_INVALID', '账号不存在或已停用');
  }

  let permissions;
  if (user.systemRole === 'SUPER_ADMIN') {
    permissions = [...P0_PERMISSIONS]; // 短路：持有全部 P0
  } else {
    const bindings = await prisma.userRole.findMany({
      where: { userId: user.id },
      select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } },
    });
    permissions = [...new Set(bindings.flatMap((b) => b.role.permissions.map((p) => p.permission.code)))];
  }

  c.set('auth', {
    userId: user.id,
    user,
    systemRole: user.systemRole,
    permissions,
  });
  await next();
}

export function getAuth(c) {
  const auth = c.get('auth');
  if (!auth) throw unauthorized();
  return auth;
}

/**
 * 权限守卫工厂：requirePermission('audit.view')
 */
export function requirePermission(code) {
  return async (c, next) => {
    const auth = getAuth(c);
    if (!auth.permissions.includes(code)) {
      throw forbidden('PERMISSION_DENIED', `缺少权限 ${code}`);
    }
    await next();
  };
}

/** 便捷判定（路由内联使用） */
export function hasPermission(auth, code) {
  return Boolean(auth?.permissions?.includes(code));
}
