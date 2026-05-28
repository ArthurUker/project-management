/**
 * errors.js — 业务异常类
 *
 * 在路由中 throw 这些错误，由顶层错误处理器统一转换为 HTTP 响应。
 */

export class ConflictError extends Error {
  constructor(payload = {}) {
    super(payload.message ?? '冲突');
    this.name        = 'ConflictError';
    this.status      = 409;
    this.payload     = payload;
  }
}

export class NotFoundError extends Error {
  constructor(message = '资源不存在') {
    super(message);
    this.name   = 'NotFoundError';
    this.status = 404;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = '未授权') {
    super(message);
    this.name   = 'UnauthorizedError';
    this.status = 401;
  }
}
