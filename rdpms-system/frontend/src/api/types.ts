/**
 * types.ts — 统一 API 响应契约
 *
 * 成功：{ success: true,  data: T,       meta: { requestId } }
 * 分页：{ success: true,  data: Paged<T>, meta: { requestId } }
 * 失败：{ success: false, error: { code, message, details?, requestId? } }
 */

export interface ApiMeta {
  requestId: string;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

/** 分页数据结构：字段名固定为 items / total / page / pageSize */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorBody;
}

/** 后端尚未切换统一格式时的宽松判定（仅供过渡期使用） */
export type MaybeEnvelope<T> = ApiResponse<T> | ErrorResponse;
