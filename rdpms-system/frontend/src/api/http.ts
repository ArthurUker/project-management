import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from '../config/env';
import { tokenStore, type SessionSnapshot } from '../auth/tokenStore';
import { ApiError, ERR } from './error';
import type { ErrorBody } from './types';

/**
 * http.ts — 全应用唯一的 axios 实例
 *
 * 职责：
 *   1. 注入 access token（来自 tokenStore，禁止他处读 localStorage）
 *   2. 同一登录代际内，401 + 会话过期时有界 refresh 一次并重放原请求
 *   3. 明确无效的当前 refresh 条件清理；迟到/不确定结果不清后来的会话
 *   4. 所有非 2xx 统一转成 ApiError
 *   5. 403 只抛错，绝不跳转（由 RoleGuard / 页面决定呈现）
 */

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

export type AuthRequestConfig = AxiosRequestConfig & { _authPublic?: boolean };
type RetriableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _authPublic?: boolean;
  _session?: SessionSnapshot;
};

function changed(): ApiError {
  return new ApiError(0, { code: 'SESSION_CHANGED', message: '登录身份已变更，请重新发起操作' });
}

// ── 请求拦截器 ───────────────────────────────────────────────────────────────
http.interceptors.request.use((config) => {
  const request = config as RetriableConfig;
  if (request._authPublic) return config;
  if (!request._session) request._session = tokenStore.snapshot() ?? undefined;
  if (request._session && !tokenStore.sameLogin(request._session)) throw changed();
  if (request._session) config.headers.Authorization = `Bearer ${request._session.accessToken}`;
  else delete config.headers.Authorization;
  return config;
}, (error) => { throw error; }, { synchronous: true });

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
const inflight = new Map<string, Promise<SessionSnapshot>>();

function refreshAccessToken(origin: SessionSnapshot): Promise<SessionSnapshot> {
  const key = `${origin.loginGeneration}:${origin.tokenRevision}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = tokenStore.withRefreshLock(origin, async () => {
    if (!tokenStore.sameLogin(origin)) throw changed();
    const current = tokenStore.snapshot()!;
    if (!tokenStore.owns(origin)) return current;
    if (current.refreshBlocked) throw new ApiError(0, { code: 'REFRESH_OUTCOME_UNKNOWN', message: '刷新结果不确定，请重新登录' });
    try {
      // 用裸 axios，避免走 http 实例再次进入响应拦截器造成递归
      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken: origin.refreshToken }, { timeout: 30_000 });
      // 兼容信封 { data: {...} } 与扁平 { accessToken, refreshToken } 两种响应
      const payload = (data as { data?: Record<string, unknown> })?.data ?? (data as Record<string, unknown>);
      const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken : null;
      const newRefreshToken = typeof payload?.refreshToken === 'string' ? payload.refreshToken : null;
      if (!accessToken || !newRefreshToken) {
        await tokenStore.blockRefreshIfOwned(origin);
        throw new ApiError(0, { code: 'REFRESH_OUTCOME_UNKNOWN', message: '刷新结果不确定，请重新登录；本地内容已保留' });
      }
      const saved = await tokenStore.rotate(origin, accessToken, newRefreshToken);
      if (saved) return saved;
      if (tokenStore.sameLogin(origin)) return tokenStore.snapshot()!;
      throw changed();
    } catch (error) {
      if (!tokenStore.sameLogin(origin)) throw changed();
      if (error instanceof ApiError) throw error;
      if (axios.isAxiosError(error) && error.response) {
        const body = normalizeErrorBody(error.response.data);
        if (body.code === 'REFRESH_TOKEN_REPLAYED') {
          if (!tokenStore.owns(origin)) return tokenStore.snapshot()!;
          await tokenStore.blockRefreshIfOwned(origin);
          throw new ApiError(401, { code: body.code, message: '刷新令牌已使用，请重新登录；本地内容已保留' });
        }
        if (error.response.status === 401 && body.code === 'INVALID_REFRESH_TOKEN') {
          await tokenStore.expireIfOwned(origin);
          throw new ApiError(401, body);
        }
        await tokenStore.blockRefreshIfOwned(origin);
        throw new ApiError(error.response.status, body);
      }
      await tokenStore.blockRefreshIfOwned(origin);
      throw new ApiError(0, { code: 'REFRESH_OUTCOME_UNKNOWN', message: '刷新结果不确定，请重新登录；本地内容已保留' });
    }
  }).finally(() => { if (inflight.get(key) === pending) inflight.delete(key); });
  inflight.set(key, pending);
  return pending;
}

// ── 响应拦截器 ───────────────────────────────────────────────────────────────
http.interceptors.response.use(
  (response) => {
    const config = response.config as RetriableConfig;
    if (!config._authPublic && config._session && !tokenStore.sameLogin(config._session)) throw changed();
    return response;
  },
  async (error: AxiosError) => {
    if (error instanceof ApiError) return Promise.reject(error);
    const status = error.response?.status ?? 0;
    const body = normalizeErrorBody(error.response?.data);
    const original = error.config as RetriableConfig | undefined;
    const origin = original?._session;
    if (!original?._authPublic && origin && !tokenStore.sameLogin(origin)) return Promise.reject(changed());

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
    if (!original?._authPublic && status === 401 && isSessionExpiredCode(body.code) && original && origin && !original._retry) {
      original._retry = true;
      if (!tokenStore.canRefresh()) return Promise.reject(new ApiError(401,
        { code: origin.refreshBlocked ? 'REFRESH_OUTCOME_UNKNOWN' : 'SESSION_COORDINATION_UNAVAILABLE',
          message: '无法安全刷新当前会话，请重新登录；本地内容已保留' }));
      try {
        const successor = await refreshAccessToken(origin);
        if (!tokenStore.sameLogin(origin)) throw changed();
        original._session = successor;
        original.headers.Authorization = `Bearer ${successor.accessToken}`;
        return http.request(original);
      } catch (failure) {
        return Promise.reject(failure instanceof ApiError ? failure : new ApiError(0,
          { code: 'REFRESH_OUTCOME_UNKNOWN', message: '刷新结果不确定，请重新登录；本地内容已保留' }));
      }
    }

    // 其他 401：会话不可用，交给 AuthProvider 跳转
    if (status === 401 && !original?._authPublic && origin) {
      await tokenStore.expireIfOwned(origin);
    }

    // 403 / 4xx / 5xx：只抛 ApiError，不做任何跳转
    return Promise.reject(new ApiError(status, body));
  },
);

export type { AxiosRequestConfig };
