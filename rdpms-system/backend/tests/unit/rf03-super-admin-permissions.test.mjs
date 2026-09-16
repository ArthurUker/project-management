/**
 * RF03 浏览器验收前置缺陷的回归用例
 *
 * 缺陷：/api/auth/me 对 SUPER_ADMIN 返回空 permissions（loadPermissions 返回 undefined，
 * 调用方回落为 []），前端因此拿不到任何权限点、界面全面 403；而同步入口对同一账号返回全量权限。
 * 修复：超管口径改为「全部权限码」，与同步入口一致（后端仍按 SUPER_ADMIN 短路放行）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubDb, createStubActor, jsonRequest } from '../helpers/stubDeps.mjs';

test('RF03-U21 SUPER_ADMIN 的 /api/auth/me 返回全量权限（不得为空）', async () => {
  const db = createStubDb({ permissions: [{ code: 'reports.view' }, { code: 'reports.update' }] });
  db.state.users = [{
    id: 'u-super',
    username: 'test_super_admin',
    displayName: '测试-超级管理员',
    systemRole: 'SUPER_ADMIN',
    status: 'ACTIVE',
    deletedAt: null,
    passwordHash: 'x',
  }];
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({
      userId: 'u-super', username: 'test_super_admin', systemRole: 'SUPER_ADMIN', permissions: [],
    }),
  });

  const res = await app.request('/api/auth/me', {
    headers: { 'x-test-actor': 'test_super_admin' },
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(Array.isArray(body.permissions), 'permissions 必须是数组');
  assert.ok(body.permissions.length > 0, '超管不得拿到空权限列表');
  assert.ok(body.permissions.includes('reports.view'), '必须包含 reports.view');
});
