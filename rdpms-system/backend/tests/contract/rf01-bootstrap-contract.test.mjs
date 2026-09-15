/**
 * RF01 装配契约测试 —— createApp 的对外契约（05 §1）
 *
 * 契约：
 *   - createApp({db, clock, idGenerator, actorResolver, services}) 返回 Hono 应用
 *   - 应用可直接 app.request() 请求，无需监听端口
 *   - 未认证 → 401；未知路径 → 404；响应体为 {error, code}
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/bootstrap/createApp.js';
import { createStubActor } from '../helpers/stubDeps.mjs';

test('RF01-C1 createApp 接受 05 §1 声明的依赖形参', () => {
  const app = createApp({
    db: {},
    clock: { now: () => new Date('2026-09-15T00:00:00Z') },
    idGenerator: { next: () => 'fixed-id' },
    actorResolver: async () => createStubActor({ permissions: [] }),
    services: {},
  });
  assert.equal(typeof app.fetch, 'function');
  assert.equal(typeof app.request, 'function');
});

test('RF01-C2 健康检查不需要数据库即可返回', async () => {
  const app = createApp({ db: {} });
  const res = await app.request('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('RF01-C3 未认证的业务请求返回 401 且不泄漏内部错误', async () => {
  const app = createApp({ db: {} });
  const res = await app.request('/api/reports');
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(typeof body.error, 'string');
  assert.ok(body.code);
  assert.doesNotMatch(JSON.stringify(body), /PrismaClient|at Object\./);
});

test('RF01-C4 未知路径返回 404 契约响应', async () => {
  const app = createApp({ db: {} });
  const res = await app.request('/definitely-not-a-route');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not Found', code: 404 });
});

test('RF01-C4b /api 下的未知路径仍先要求认证（现有安全口径不变）', async () => {
  const app = createApp({ db: {} });
  const res = await app.request('/api/definitely-not-a-route');
  assert.equal(res.status, 401, '挂载在 /api 的鉴权中间件对未知路径同样生效');
});

test('RF01-C5 默认依赖下不构造数据库客户端（无 DATABASE_URL 也能装配）', async () => {
  // 该断言在 tests/unit/rf01-bootstrap.test.mjs 的子进程用例中做严格验证（含无 DATABASE_URL）；
  // 这里补充同进程内的装配检查：缺省 db 时应用仍可装配并响应健康检查。
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const app = createApp({});
    const res = await app.request('/health');
    assert.equal(res.status, 200);
  } finally {
    if (previous !== undefined) process.env.DATABASE_URL = previous;
  }
});
