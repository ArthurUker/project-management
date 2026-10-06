/**
 * platform/requestContext.js —— 应用实例级依赖的请求作用域（RF01 收尾）
 *
 * 目的：让依赖成为 **应用实例级** 注入，而不是进程级可变单例。
 *   同一个进程内可并存多个 createApp({db, actorResolver}) 实例，
 *   每个实例的请求始终解析到自己的依赖，即使请求交错执行也不会串用。
 *
 * 机制：createApp 在第一个中间件里用 runWithContext(ctx, next) 进入 AsyncLocalStorage 作用域，
 *      该作用域内的所有下游代码都解析到本实例的依赖。
 *
 * 边界（必须知道）：
 *   - 只有「请求内的异步调用链」继承该作用域；脱离请求上下文的代码（定时任务、队列消费者、
 *     脚本）不在作用域内，会回落到 fallback。worker/脚本必须显式接收依赖。
 *   - 本模块不提供任何跨实例可变的全局；fallback 客户端惰性创建后不再变更。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/** fallback 数据库客户端（仅在「不处于任何应用实例作用域」时使用） */
let fallbackDb = null;
/** 构造 fallback 的工厂，由 db/client.js 注入，避免循环依赖 */
let fallbackFactory = null;

/** @param {() => object} factory */
export function setFallbackDbFactory(factory) {
  fallbackFactory = factory;
}

/**
 * 在指定依赖作用域中执行。
 * @template T
 * @param {{db?: object|null, actorResolver?: Function|null}} ctx
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithContext(ctx, fn) {
  return storage.run(
    { db: ctx?.db ?? null, actorResolver: ctx?.actorResolver ?? null },
    fn,
  );
}

/** 当前作用域上下文；不在任何应用实例作用域内时为 undefined */
export function currentContext() {
  return storage.getStore();
}

/** 当前作用域内的 db；不在作用域内时为 null */
export function currentDb() {
  return storage.getStore()?.db ?? null;
}

/** 当前作用域内的身份解析器；未注入时为 null（此时使用默认 JWT 流程） */
export function currentActorResolver() {
  return storage.getStore()?.actorResolver ?? null;
}

/**
 * 解析应使用的 db：优先当前实例作用域，其次 fallback。
 * fallback 只在脱离请求上下文时创建（生产启动入口显式注入，不依赖它）。
 */
export function resolveDb() {
  const scoped = currentDb();
  if (scoped) return scoped;
  if (!fallbackDb) {
    if (!fallbackFactory) {
      throw new Error('[db] 没有可用的数据库客户端：既不在应用实例作用域内，也未注册 fallback 工厂');
    }
    fallbackDb = fallbackFactory();
  }
  return fallbackDb;
}

/** 仅供测试：清空 fallback，避免跨用例污染 */
export function resetFallbackDb() {
  fallbackDb = null;
}

/** HTTP correlation only; restore callbacks have their own durable gate/authority. */
export function setRequestDatasetEpoch(epoch, recoveryOperation = false) {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('REQUEST_EPOCH_CONTEXT_REQUIRED');
  ctx.datasetEpoch = epoch; ctx.recoveryOperation = recoveryOperation;
}
