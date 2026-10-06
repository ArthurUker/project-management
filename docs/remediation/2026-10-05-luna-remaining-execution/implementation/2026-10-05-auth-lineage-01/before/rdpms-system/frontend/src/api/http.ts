import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from '../config/env';
import { tokenStore } from '../auth/tokenStore';
import { ApiError, ERR } from './error';
import type { ErrorBody } from './types';

/**
 * http.ts — 全应用唯一的 axios 实例
 *
 * 职责：
 *   1. 注入 access token（来自 tokenStore，禁止他处读 localStorage）
 *   2. 401 + 会话过期时静默 refresh 一次并重放原请求（并发单飞）
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

/**
 * 兼容多种后端错误体，归一化为 ErrorBody：
 *   1. 扁平（后端现状）：{ error: '消息', code: 'CODE' }
 *   2. 嵌套信封：{ success: false, error: { code, message, details?, requestId? } }
 *   3. 仅 message：{ message, code? }
 */
function normalizeErrorBody(raw: unknown): ErrorBody {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (r.error && typeof r.error === 'object') {
      const e = r.error as Record<string, unknown>;
      return {
        code: typeof e.code === 'string' ? e.code : 'UNKNOWN',
        message: typeof e.message === 'string' ? e.message : '请求失败',
        details: (e.details as Record<string, unknown>) ?? undefined,
        requestId: typeof e.requestId === 'string' ? e.requestId : undefined,
      };
    }
    if (typeof r.error === 'string') {
      return {
        code: typeof r.code === 'string' ? r.code : 'UNKNOWN',
        message: r.error,
      };
    }
    if (typeof r.message === 'string') {
      return {
        code: typeof r.code === 'string' ? r.code : 'UNKNOWN',
        message: r.message,
      };
    }
  }
  return { code: 'UNKNOWN', message: '请求失败' };
}

/** 会话过期错误码：前端约定 AUTH_EXPIRED；后端 rbac 对无效/过期 access token 返回 INVALID_TOKEN */
function isSessionExpiredCode(code: string | undefined): boolean {
  return code === ERR.AUTH_EXPIRED || code === 'INVALID_TOKEN';
}

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
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      // 兼容信封 { data: {...} } 与扁平 { accessToken, refreshToken } 两种响应
      const payload = (data as { data?: Record<string, unknown> })?.data ?? (data as Record<string, unknown>);
      const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken : null;
      const newRefreshToken = typeof payload?.refreshToken === 'string' ? payload.refreshToken : null;
      if (!accessToken || !newRefreshToken) {
        throw new Error('refresh 响应缺少 token 字段');
      }
      tokenStore.setTokens(accessToken, newRefreshToken);
      return accessToken;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// ── 响应拦截器 ───────────────────────────────────────────────────────────────
http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status ?? 0;
    const body = normalizeErrorBody(error.response?.data);
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
    if (status === 401 && isSessionExpiredCode(body.code) && original && !original._retry) {
      original._retry = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${newToken}`;
        return http.request(original);
      } catch {
        tokenStore.clear();
        tokenStore.emitSessionExpired();
        return Promise.reject(
          new ApiError(401, {
            code: body.code || ERR.AUTH_REQUIRED,
            message: body.message || '登录已失效，请重新登录',
          }),
        );
      }
    }

    // 其他 401：会话不可用，交给 AuthProvider 跳转
    if (status === 401) {
      tokenStore.clear();
      tokenStore.emitSessionExpired();
    }

    // 403 / 4xx / 5xx：只抛 ApiError，不做任何跳转
    return Promise.reject(new ApiError(status, body));
  },
);

export type { AxiosRequestConfig };
