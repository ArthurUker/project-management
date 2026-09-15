/**
 * RF04 回归用例 —— 所有写入口授权（路由替身测试，不连数据库）
 *
 * 对应发现：F06（汇报单项写入缺项目授权）、F07（同步绕开状态与细分权限）、
 *          F13（通用更新可改状态，绕开专用动作权限）
 * 验收（06_重构任务与发布门禁.md RF04）：
 *   - 用户仅有 update 无 transition 时不能改状态
 *   - 被移出项目不能更新/撤回/删除
 *   - 跨项目 phaseId 被拒绝
 *   - reviewed 内容所有入口均锁定
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubDb, createStubActor, jsonRequest } from '../helpers/stubDeps.mjs';

const AUTHOR = { userId: 'u1', displayName: '作者' };
const OTHER = { userId: 'u2', displayName: '他人' };

const ALL_REPORT_PERMS = ['reports.create', 'reports.update', 'reports.submit', 'reports.delete', 'reports.review'];

function draftReport(overrides = {}) {
  return {
    id: 'r1',
    projectId: 'p1',
    authorId: AUTHOR.userId,
    reportType: 'DAILY',
    periodKey: '2026-09-15',
    status: 'DRAFT',
    content: {},
    deletedAt: null,
    ...overrides,
  };
}

function task(overrides = {}) {
  return {
    id: 't1',
    projectId: 'p1',
    title: '任务一',
    status: 'TODO',
    assigneeId: null,
    deletedAt: null,
    ...overrides,
  };
}

const MEMBER_ACCESS = { role: 'MEMBER', leftAt: null }; // MEMBER = read+write（无 transition/assign）
const OWNER_ACCESS = { role: 'OWNER', leftAt: null };

// ── F06：汇报的删除 / 撤回必须有项目范围与动作权限 ─────────────────────────

test('RF04-U1 被移出项目的作者不能删除自己的汇报', async () => {
  const db = createStubDb({ reports: [draftReport()], membership: null });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ALL_REPORT_PERMS }),
  });

  const res = await jsonRequest(app, '/api/reports/r1', { method: 'DELETE' });
  assert.equal(res.status, 404, '非成员应 404（隐藏资源存在性）');
  assert.equal(db.state.reports[0].deletedAt, null, '不得软删');
});

test('RF04-U2 非作者即使有 reports.delete 也不能删除他人汇报', async () => {
  const db = createStubDb({ reports: [draftReport()], membership: OWNER_ACCESS });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...OTHER, permissions: ALL_REPORT_PERMS }),
  });

  const res = await jsonRequest(app, '/api/reports/r1', { method: 'DELETE' });
  const body = await res.json();
  assert.notEqual(res.status, 200, `不得删除他人汇报，实际：${JSON.stringify(body)}`);
  assert.equal(db.state.reports[0].deletedAt, null);
});

test('RF04-U3 被移出项目的作者不能撤回自己已提交的汇报', async () => {
  const db = createStubDb({ reports: [draftReport({ status: 'SUBMITTED' })], membership: null });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ALL_REPORT_PERMS }),
  });

  const res = await jsonRequest(app, '/api/reports/r1/recall', { method: 'PATCH' });
  assert.equal(res.status, 404, '非成员应 404');
  assert.equal(db.state.reports[0].status, 'SUBMITTED', '不得撤回');
});

test('RF04-U4 成员但无 write 能力（VIEWER）不能更新自己的汇报', async () => {
  const db = createStubDb({ reports: [draftReport()], membership: { role: 'VIEWER', leftAt: null } });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ALL_REPORT_PERMS }),
  });

  const res = await jsonRequest(app, '/api/reports/r1', {
    method: 'PUT',
    body: { content: { n: 1 } },
  });
  assert.notEqual(res.status, 200, 'VIEWER 无 write 能力，不得更新');
  assert.deepEqual(db.state.reports[0].content, {});
});

// ── F13：任务通用更新不得绕开状态/指派的专用动作权限 ────────────────────────

test('RF04-U5 只有 tasks.update 时不能通过通用 PUT 改状态', async () => {
  const db = createStubDb({ tasks: [task()], membership: OWNER_ACCESS });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['tasks.update'] }),
  });

  const res = await jsonRequest(app, '/api/tasks/t1', {
    method: 'PUT',
    body: { status: 'IN_PROGRESS' },
  });
  const body = await res.json();

  assert.equal(res.status, 403, `仅有 tasks.update 不得改状态，实际：${JSON.stringify(body)}`);
  assert.equal(db.state.tasks[0].status, 'TODO', '状态必须保持不变');
});

test('RF04-U6 有 tasks.change_status 但项目能力无 transition 时仍不能改状态', async () => {
  const db = createStubDb({ tasks: [task()], membership: MEMBER_ACCESS });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['tasks.update', 'tasks.change_status'] }),
  });

  const res = await jsonRequest(app, '/api/tasks/t1', {
    method: 'PUT',
    body: { status: 'IN_PROGRESS' },
  });
  assert.equal(res.status, 403, 'MEMBER 项目角色无 transition 能力');
  assert.equal(db.state.tasks[0].status, 'TODO');
});

test('RF04-U7 有 tasks.update 时不能通过通用 PUT 改负责人', async () => {
  const db = createStubDb({ tasks: [task()], membership: OWNER_ACCESS });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['tasks.update'] }),
  });

  const res = await jsonRequest(app, '/api/tasks/t1', {
    method: 'PUT',
    body: { assigneeId: 'u2' },
  });
  assert.equal(res.status, 403, '指派必须走 tasks.assign');
  assert.equal(db.state.tasks[0].assigneeId, null);
});

test('RF04-U8 同时具备权限与项目能力时，状态流转正常放行（回归）', async () => {
  const db = createStubDb({ tasks: [task()], membership: OWNER_ACCESS });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({
      ...AUTHOR,
      permissions: ['tasks.update', 'tasks.change_status', 'tasks.assign'],
    }),
  });

  const res = await jsonRequest(app, '/api/tasks/t1', {
    method: 'PUT',
    body: { status: 'IN_PROGRESS', assigneeId: 'u2' },
  });
  assert.equal(res.status, 200, '具备权限时应放行');
  assert.equal(db.state.tasks[0].status, 'IN_PROGRESS');
  assert.equal(db.state.tasks[0].assigneeId, 'u2');
});

test('RF04-U9 跨项目 phaseId 被拒绝（任务更新）', async () => {
  const db = createStubDb({
    tasks: [task()],
    membership: OWNER_ACCESS,
    phases: [{ id: 'ph-other', projectId: 'p2', deletedAt: null }],
  });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['tasks.update'] }),
  });

  const res = await jsonRequest(app, '/api/tasks/t1', {
    method: 'PUT',
    body: { phaseId: 'ph-other' },
  });
  const body = await res.json();
  assert.equal(res.status, 400, `跨项目阶段必须拒绝，实际：${JSON.stringify(body)}`);
  assert.match(String(body.error), /phaseId/);
});

// ── F07：同步上行必须与普通 API 同源判定 ────────────────────────────────────

function pushChange(entity, id, data, op = 'upsert') {
  return {
    deviceId: 'dev-1',
    changes: [{ clientMutationId: `m-${entity}-${id}-${op}`, entity, id, op, data }],
  };
}

test('RF04-U10 同步不得覆盖已审阅汇报的内容（reviewed 锁定）', async () => {
  const db = createStubDb({ reports: [draftReport({ status: 'REVIEWED' })], membership: OWNER_ACCESS });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ALL_REPORT_PERMS }),
  });

  const res = await jsonRequest(app, '/api/sync/push', {
    body: pushChange('reports', 'r1', { content: { hacked: true } }),
  });
  const body = await res.json();

  assert.equal(body.results[0].status, 'rejected', `已审阅汇报必须拒绝，实际：${JSON.stringify(body.results[0])}`);
  assert.deepEqual(db.state.reports[0].content, {}, '内容不得被同步覆盖');
});

test('RF04-U11 同步不得修改他人汇报', async () => {
  const db = createStubDb({ reports: [draftReport()], membership: OWNER_ACCESS });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...OTHER, permissions: ALL_REPORT_PERMS }),
  });

  const res = await jsonRequest(app, '/api/sync/push', {
    body: pushChange('reports', 'r1', { content: { hacked: true } }),
  });
  const body = await res.json();

  assert.equal(body.results[0].status, 'rejected');
  assert.deepEqual(db.state.reports[0].content, {});
});

test('RF04-U12 同步改任务状态需要 tasks.change_status（无权限则拒绝）', async () => {
  const db = createStubDb({ tasks: [task()], membership: OWNER_ACCESS });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['tasks.update'] }),
  });

  const res = await jsonRequest(app, '/api/sync/push', {
    body: pushChange('tasks', 't1', { status: 'IN_PROGRESS' }),
  });
  const body = await res.json();

  assert.equal(body.results[0].status, 'rejected', `同步改状态必须校验权限，实际：${JSON.stringify(body.results[0])}`);
  assert.equal(db.state.tasks[0].status, 'TODO');
});

test('RF04-U13 同步里的跨项目 phaseId 被拒绝', async () => {
  const db = createStubDb({
    tasks: [task()],
    membership: OWNER_ACCESS,
    phases: [{ id: 'ph-other', projectId: 'p2', deletedAt: null }],
  });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['tasks.update', 'tasks.change_status'] }),
  });

  const res = await jsonRequest(app, '/api/sync/push', {
    body: pushChange('tasks', 't1', { phaseId: 'ph-other' }),
  });
  const body = await res.json();

  assert.equal(body.results[0].status, 'rejected', `跨项目阶段必须拒绝，实际：${JSON.stringify(body.results[0])}`);
  assert.match(String(body.results[0].reason), /phaseId/);
});

test('RF04-U15 新建日报走持久幂等：同 key 同 payload 重试不重复创建', async () => {
  const db = createStubDb({ reports: [] });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['reports.create'] }),
  });
  const body = {
    projectId: 'p1',
    reportType: 'DAILY',
    periodKey: '2026-11-01',
    content: { n: 1 },
    clientMutationId: 'rf04-post-key-1',
  };

  const first = await jsonRequest(app, '/api/reports', { body });
  assert.equal(first.status, 201);

  const replay = await jsonRequest(app, '/api/reports', { body });
  assert.equal(replay.status, 201, '重试必须回放首次结果');
  assert.equal(replay.headers.get('idempotent-replay'), 'true');
  assert.deepEqual(await replay.json(), await first.clone().json());

  assert.equal(db.state.reports.length, 1, '不得重复创建');
  assert.equal(db.state.mutationReceipts.length, 1);
  assert.equal(db.state.auditLogs.length, 1, '重放不得重复写审计');
});

test('RF04-U14 被移出项目后同步更新被拒绝', async () => {
  const db = createStubDb({ tasks: [task()], membership: { role: 'MEMBER', leftAt: new Date() } });
  const app = createApp({
    db,
    actorResolver: async () => createStubActor({ ...AUTHOR, permissions: ['tasks.update'] }),
  });

  const res = await jsonRequest(app, '/api/sync/push', {
    body: pushChange('tasks', 't1', { title: '改名' }),
  });
  const body = await res.json();

  assert.equal(body.results[0].status, 'rejected');
  assert.equal(db.state.tasks[0].title, '任务一');
});
