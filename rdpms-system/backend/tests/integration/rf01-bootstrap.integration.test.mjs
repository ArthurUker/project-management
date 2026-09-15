/**
 * RF01 真实集成测试 —— 装配与数据库作用域（专用隔离测试库）
 *
 * 与「路由替身测试」的区别：本文件连接真实 PostgreSQL（rdpms_test），
 * 验证真实约束下的装配、注入与只读连通性，不写业务数据。
 *
 * 前置：`npm run test:db:reset`（脚本自带生产库/演练库防护）
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/bootstrap/createApp.js';
import { createStubActor } from '../helpers/stubDeps.mjs';

const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
});

test('RF01-I1 真实数据库下装配的应用可响应就绪检查', async () => {
  const app = createApp({ db: prisma });
  const res = await app.request('/api/ready');
  const body = await res.json();
  assert.equal(res.status, 200, `就绪检查失败：${JSON.stringify(body)}`);
  assert.equal(body.ready, true);
  assert.equal(body.db, 'up');
});

test('RF01-I2 连接角色是测试库角色（确认未连到生产/演练库）', async () => {
  const rows = await prisma.$queryRawUnsafe('SELECT current_database() AS db, current_user AS role');
  assert.equal(rows[0].db, 'rdpms_test', '集成测试必须运行在专用隔离库 rdpms_test 上');
  assert.ok(rows[0].role.startsWith('rdpms_'), `意外的数据库角色：${rows[0].role}`);
});

test('RF01-I3 默认 JWT 流程与注入身份流程在真实装配下都可达', async () => {
  // 未注入 actorResolver：无 Authorization 头 → 401（默认流程未被破坏）
  const appDefault = createApp({ db: prisma });
  const resDefault = await appDefault.request('/api/reports');
  assert.equal(resDefault.status, 401);

  // 注入 actorResolver：通过鉴权，但无 reports.view 权限 → 403（非 500/ReferenceError）
  const appInjected = createApp({
    db: prisma,
    actorResolver: async () => createStubActor({ permissions: [] }),
  });
  const resInjected = await appInjected.request('/api/reports');
  const body = await resInjected.json();
  assert.equal(resInjected.status, 403, `期望 403，实际 ${resInjected.status}：${JSON.stringify(body)}`);
  assert.equal(body.code, 'PERMISSION_DENIED');
});
