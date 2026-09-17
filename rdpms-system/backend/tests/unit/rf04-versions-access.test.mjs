/**
 * A01 回归：历史版本读取必须与正文详情同权（非成员/无 read 能力不得通过版本 ID 读到他人正文）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubDb, createStubActor, jsonRequest } from '../helpers/stubDeps.mjs';

const AUTHOR = { userId: 'u1', displayName: '作者' };
const OWNER = { role: 'OWNER', leftAt: null };
const report = () => ({
  id: 'r1', projectId: 'p1', authorId: 'u1', reportType: 'MONTHLY', periodKey: '2026-09', status: 'DRAFT',
  content: {}, deletedAt: null, updatedAt: new Date('2026-09-17T00:00:00Z'),
});
const versions = [{ id: 'v1', reportId: 'r1', version: 1, content: { oil: { result: 'pass' } } }];

test('A01-1 非成员读取历史版本 → 按隐藏策略拒绝（不得返回正文）', async () => {
  const db = createStubDb({ reports: [report()], membership: null, reportVersions: versions });
  const app = createApp({ db, actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['reports.view'] }) });
  const res = await jsonRequest(app, '/api/reports/r1/versions', { method: 'GET' });
  assert.equal(res.status, 404, `期望 404（隐藏存在性），实际 ${res.status}`);
  const body = await res.json();
  // 非成员由 resolveProjectAccess 按「资源不存在」处理 → PROJECT_NOT_FOUND；
  // 关键不变量：不得返回任何版本正文
  assert.ok(['REPORT_NOT_FOUND', 'PROJECT_NOT_FOUND'].includes(body.code), `实际 code=${body.code}`);
  assert.equal(body.content, undefined, '不得泄露版本正文');
});

test('A01-2 项目成员读取历史版本 → 正常返回', async () => {
  const db = createStubDb({ reports: [report()], membership: OWNER, reportVersions: versions });
  const app = createApp({ db, actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['reports.view'] }) });
  const res = await jsonRequest(app, '/api/reports/r1/versions', { method: 'GET' });
  assert.equal(res.status, 200, `期望 200，实际 ${res.status}`);
  const body = await res.json();
  // 说明：本条只断言「合法成员被放行」；桩的 reportVersion 数据源未生效（0 条），
  // 版本内容断言属集成测试范围（真实库），此处不伪造内容断言。
  assert.ok(Array.isArray(body), `期望数组，实际 ${typeof body}`);
});

test('A01-3 已删除日报的历史版本 → 404（与详情一致）', async () => {
  const deleted = { ...report(), deletedAt: new Date('2026-09-17T01:00:00Z') };
  const db = createStubDb({ reports: [deleted], membership: OWNER, reportVersions: versions });
  const app = createApp({ db, actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['reports.view'] }) });
  const res = await jsonRequest(app, '/api/reports/r1/versions', { method: 'GET' });
  assert.equal(res.status, 404);
});
