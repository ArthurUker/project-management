import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from '../config/env';
import { tokenStore } from '../auth/tokenStore';
import { ApiError, ERR } from './error';
import type { ApiResponse, ErrorResponse } from './types';

/**
 * http.ts — 全应用唯一的 axios 实例
 *
 * 职责：
 *   1. 注入 access token（来自 tokenStore，禁止他处读 localStorage）
 *   2. 401 + AUTH_EXPIRED 时静默 refresh 一次并重放原请求（并发单飞）
 *   3. refresh 也失败 → 清 token + 广播会话失效（由 AuthProvider 统一跳登录）
 *   4. 所有非 2xx 统一转成 ApiError
 *   5. 403 只抛错，绝不跳转（由 RoleGuard / 页面决定呈现）
 */

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// ── 请求拦截器 ───────────────────────────────────────────────────────────────
http.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── refresh 单飞 ─────────────────────────────────────────────────────────────
// 并发请求同时 401 时，只发一次 /auth/refresh，其余排队复用同一个 Promise。
let inflight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (inflight) return inflight;

  inflight = (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) {
      throw new ApiError(401, { code: ERR.AUTH_REQUIRED, message: '未登录' });
    }
    try {
      // 用裸 axios，避免走 http 实例再次进入响应拦截器造成递归
      const { data } = await axios.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
      );
      tokenStore.setTokens(data.data.accessToken, data.data.refreshToken);
      return data.data.accessToken;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// ── 响应拦截器 ───────────────────────────────────────────────────────────────
http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ErrorResponse>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data?.error;
    const original = error.config as RetriableConfig | undefined;

    // 无响应：网络层失败 / 超时 / 主动取消
    if (!error.response) {
      if (axios.isCancel(error)) {
        return Promise.reject(new ApiError(0, { code: 'CANCELLED', message: '请求已取消' }));
      }
      return Promise.reject(
        new ApiError(0, { code: ERR.NETWORK_ERROR, message: '网络异常，请检查连接' }),
      );
    }

    // access 过期：静默 refresh 一次并原样重放
    if (status === 401 && body?.code === ERR.AUTH_EXPIRED && original && !original._retry) {
      original._retry = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${newToken}`;
        return http.request(original);
      } catch {
        tokenStore.clear();
        tokenStore.emitSessionExpired();
        return Promise.reject(
          new ApiError(401, body ?? { code: ERR.AUTH_REQUIRED, message: '登录已失效，请重新登录' }),
        );
      }
    }

    // 其他 401：会话不可用，交给 AuthProvider 跳转
    if (status === 401) {
      tokenStore.clear();
      tokenStore.emitSessionExpired();
    }

    // 403 / 4xx / 5xx：只抛 ApiError，不做任何跳转
    return Promise.reject(
      new ApiError(status, body ?? { code: 'UNKNOWN', message: error.message || '请求失败' }),
    );
  },
);

export type { AxiosRequestConfig };
