/**
 * idempotency.js — Hono 幂等键中间件（去重层 2）
 *
 * 原理：
 *   客户端每次请求携带唯一 Idempotency-Key 请求头。
 *   服务端将"成功响应"缓存 TTL 时间（默认 24h）。
 *   同一 key 的重复请求直接返回缓存结果，不再执行业务逻辑。
 *
 * 适用范围：PUT 请求（幂等更新）。
 * 生产建议：store 替换为 Redis（当前为内存 Map，重启后缓存失效）。
 *
 * 用法（在 index.js 中）：
 *   import { createIdempotencyMiddleware } from './middleware/idempotency.js';
 *   app.use('/api/*', createIdempotencyMiddleware());
 */

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 小时（毫秒）

/**
 * @param {{ ttl?: number }} [options]
 * @returns {import('hono').MiddlewareHandler}
 */
export function createIdempotencyMiddleware(options = {}) {
  const TTL = options.ttl ?? DEFAULT_TTL;

  // key → { body: object, statusCode: number, timestamp: number }
  /** @type {Map<string, { body: unknown; statusCode: number; timestamp: number }>} */
  const store = new Map();

  return async (c, next) => {
    // 只处理 PUT 方法
    if (c.req.method !== 'PUT') {
      return next();
    }

    const idempotencyKey = c.req.header('idempotency-key');
    if (!idempotencyKey) {
      return next();
    }

    // 清理过期条目（惰性清理，每次请求触发）
    _cleanup(store, TTL);

    // 命中缓存 → 直接返回上次结果（不执行后续处理器）
    const cached = store.get(idempotencyKey);
    if (cached) {
      console.log(`[Idempotency] ♻️ 重复请求，返回缓存结果: key=${idempotencyKey}`);
      return c.json(cached.body, cached.statusCode);
    }

    // 执行下游路由
    await next();

    // 缓存成功响应（2xx）
    const statusCode = c.res.status;
    if (statusCode >= 200 && statusCode < 300) {
      try {
        // clone 后读取 json，不消耗原始响应流
        const body = await c.res.clone().json();
        store.set(idempotencyKey, { body, statusCode, timestamp: Date.now() });
      } catch {
        // 响应体非 JSON（例如 204 No Content），不缓存
      }
    }
  };
}

/**
 * 清理过期缓存条目
 * @param {Map<string, { timestamp: number }>} store
 * @param {number} ttl
 */
function _cleanup(store, ttl) {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (now - val.timestamp > ttl) {
      store.delete(key);
    }
  }
}
