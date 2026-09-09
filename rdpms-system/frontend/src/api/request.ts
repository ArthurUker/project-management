import type { AxiosRequestConfig } from 'axios';
import { http } from './http';
import { ApiError } from './error';
import type { ApiResponse, ErrorResponse, Paged } from './types';

/**
 * request.ts — 薄封装：把响应解包为业务数据
 *
 * 兼容两种后端响应：
 *   1. 统一信封：{ success: true, data: T, meta } / { success: false, error: {...} }
 *   2. 扁平结构（后端现状）：业务字段直接在顶层，如 { accessToken, user, ... }
 *
 * 约定：endpoints 层永远返回「已解包的 T」，页面不再写 `res.data ? res.data : res` 这类二义代码。
 */

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await http.request<ApiResponse<T> | ErrorResponse | T>(config);
  const body = res.data;

  if (body && typeof body === 'object') {
    // 失败信封（后端用 2xx 包业务错误的兜底路径，正常不应触发）
    if ((body as ErrorResponse).success === false) {
      throw new ApiError(res.status, (body as ErrorResponse).error);
    }
    // 成功信封
    if ((body as ApiResponse<T>).success === true && 'data' in (body as Record<string, unknown>)) {
      return (body as ApiResponse<T>).data;
    }
  }

  // 扁平响应：原样返回
  return body as T;
}

export const get = <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
  request<T>({ ...config, method: 'GET', url });

export const post = <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  request<T>({ ...config, method: 'POST', url, data });

export const put = <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  request<T>({ ...config, method: 'PUT', url, data });

export const patch = <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  request<T>({ ...config, method: 'PATCH', url, data });

export const del = <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
  request<T>({ ...config, method: 'DELETE', url });

/* ────────────────────────────────────────────────────────────────────────────
 * 分页归一化（过渡期适配器）
 *
 * 目标契约：{ items, total, page, pageSize }
 * 现状：后端部分接口仍返回 { list, total } 或直接返回数组。
 * 本函数让页面只依赖 Paged<T>；后端全部统一为 items 后，
 * 只需删除下面的 fallback 分支，页面零改动。
 * ────────────────────────────────────────────────────────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizePaged<T>(raw: any, fallbackPage = 1, fallbackPageSize = 20): Paged<T> {
  if (Array.isArray(raw)) {
    return { items: raw as T[], total: raw.length, page: fallbackPage, pageSize: fallbackPageSize };
  }
  const items: T[] = raw?.items ?? raw?.list ?? raw?.flat ?? [];
  return {
    items,
    total: Number(raw?.total ?? items.length) || 0,
    page: Number(raw?.page ?? fallbackPage) || fallbackPage,
    pageSize: Number(raw?.pageSize ?? fallbackPageSize) || fallbackPageSize,
  };
}

export async function requestPaged<T>(config: AxiosRequestConfig): Promise<Paged<T>> {
  const params = (config?.params ?? {}) as Record<string, unknown>;
  const page = Number(params.page ?? 1) || 1;
  const pageSize = Number(params.pageSize ?? 20) || 20;
  const raw = await request<unknown>(config);
  return normalizePaged<T>(raw, page, pageSize);
}

export const getPaged = <T>(url: string, config?: AxiosRequestConfig): Promise<Paged<T>> =>
  requestPaged<T>({ ...config, method: 'GET', url });
