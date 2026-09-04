/**
 * kernel/http.js —— 统一错误与响应工具
 */

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.extra = extra ?? null;
  }

  payload() {
    return { error: this.message, code: this.code, ...(this.extra ?? {}) };
  }
}

export const badRequest = (code, message, extra) => new HttpError(400, code, message, extra);
export const unauthorized = (code = 'UNAUTHORIZED', message = '未认证') => new HttpError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message = '权限不足') => new HttpError(403, code, message);
export const notFound = (code = 'NOT_FOUND', message = '资源不存在') => new HttpError(404, code, message);

/** 方法不被允许（用于 /api/reagents 的写方法固定 405） */
export const methodNotAllowed = (message = '该资源为聚合读取路由，不支持写操作') =>
  new HttpError(405, 'METHOD_NOT_ALLOWED', message);

/** 统一分页解析 */
export function parsePaging(query, defaultPageSize = 20, maxPageSize = 200) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const rawSize = Number.parseInt(query.pageSize ?? String(defaultPageSize), 10) || defaultPageSize;
  const pageSize = Math.min(maxPageSize, Math.max(1, rawSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paged(list, total, { page, pageSize }) {
  return { items: list, total, page, pageSize };
}
