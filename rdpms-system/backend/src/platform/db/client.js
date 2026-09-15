/**
 * platform/db/client.js —— 数据库客户端解析入口（RF01 收尾：实例级注入）
 *
 * 目标（05_目标架构与重构契约 §1）：
 *   createApp({db}) 注入的依赖只对该应用实例生效；导入应用模块不连接数据库。
 *
 * 现状迁移策略：
 *   旧路由以 `import { prisma } from '../index.js'` 静态引用单例。RF01 起统一改为从本模块引用；
 *   `prisma` 是「按当前请求作用域解析」的代理：
 *     - 请求作用域内 → 解析到该应用实例注入的 db（实例级隔离）
 *     - 作用域外     → 解析到惰性 fallback 客户端（worker/脚本应改为显式传参）
 *   因此多个并存的应用实例不会串用依赖，也不存在进程级可变单例。
 *
 * 约束：
 *   - 导入本模块不创建客户端、不建立连接。
 *   - 只有 bootstrap/server.js 允许用 createPrismaClient() 构造真实客户端。
 */
import { PrismaClient } from '@prisma/client';
import { resolveDb, setFallbackDbFactory, resetFallbackDb } from '../requestContext.js';

/** 构造真实客户端（仅启动入口使用） */
export function createPrismaClient(options) {
  return new PrismaClient(options);
}

// fallback 工厂：仅当代码脱离应用实例作用域时才会被调用
setFallbackDbFactory(() => createPrismaClient());

/**
 * 兼容旧路由的解析代理：属性访问与调用都转发到「当前作用域解析出的客户端」。
 * 这样既保证实例级隔离，又不必一次改写全部旧路由（命令层落地后应改为显式传参）。
 */
export const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = resolveDb();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
    has(_target, prop) {
      return prop in resolveDb();
    },
  },
);

/** 显式解析当前作用域客户端（新代码优先使用，替代对 prisma 代理的隐式依赖） */
export function getScopedDb() {
  return resolveDb();
}

/** 仅供测试：清空 fallback */
export { resetFallbackDb };
