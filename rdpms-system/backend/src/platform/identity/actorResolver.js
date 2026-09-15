/**
 * platform/identity/actorResolver.js —— 身份解析（RF01 收尾：实例级）
 *
 * 默认流程仍是 JWT + 权限装载（kernel/rbac.js authenticate）。
 * createApp({actorResolver}) 注入后，该实例的请求改用注入的解析器产生可信 actor，
 * 使路由契约测试不必签发 JWT、不依赖用户表；多个应用实例并存时互不影响。
 *
 * 约束（05 §2.1）：actor 只能由服务端会话校验产生，客户端不得传 actorId 覆盖身份。
 */
import { currentActorResolver } from '../requestContext.js';

/**
 * 取当前应用实例的身份解析器（不在任何实例作用域内时为 null → 走 JWT 默认流程）。
 * @returns {((c: any) => Promise<object|null>) | null}
 */
export function getActorResolver() {
  return currentActorResolver();
}
