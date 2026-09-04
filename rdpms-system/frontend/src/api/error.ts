import type { ErrorBody } from './types';

/**
 * 后端错误码常量。
 * 注意：前端只依据 code 做「呈现」，绝不依据 code 做「放行」——安全判定全在后端。
 */
export const ERR = {
  // 鉴权
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_DISABLED: 'AUTH_DISABLED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  // 授权
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
  // 通用
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  FOREIGN_KEY_CONSTRAINT: 'FOREIGN_KEY_CONSTRAINT',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
  // 本地
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export type ErrorCode = (typeof ERR)[keyof typeof ERR];

/** 统一 API 错误对象：所有接口失败都抛它，页面不需要再碰 axios error */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(status: number, body: ErrorBody) {
    super(body?.message || '请求失败');
    this.name = 'ApiError';
    this.code = body?.code || 'UNKNOWN';
    this.status = status;
    this.details = body?.details;
    this.requestId = body?.requestId;
  }

  get isAuth(): boolean {
    return this.status === 401;
  }
  get isExpired(): boolean {
    return this.status === 401 && this.code === ERR.AUTH_EXPIRED;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get isRateLimited(): boolean {
    return this.status === 429;
  }
  /** 表单字段级错误（后端 VALIDATION_ERROR 的 details.fields） */
  get fieldErrors(): Record<string, string> {
    const fields = this.details?.fields;
    return fields && typeof fields === 'object' ? (fields as Record<string, string>) : {};
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** 把任意 catch 到的东西转成可展示文案 */
export function toMessage(e: unknown, fallback = '操作失败，请稍后重试'): string {
  if (isApiError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}
