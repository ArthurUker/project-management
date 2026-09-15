/**
 * RF04 真实集成测试 —— 写入口授权（专用隔离库 rdpms_test）
 *
 * 验收（06）：被移出项目不能更新/撤回/删除；reviewed 内容所有入口锁定；
 * 跨项目 phaseId 被拒绝；仅有 update 无 transition 不能改状态。
 * 桩依赖无法验证真实的成员关系与唯一约束，故在真实库上验证。
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubActor } from '../helpers/stubDeps.mjs';
import { IT, seedMinimalFixture, revokeAuthorMembership, restoreAuthorMembership } from './fixtures.mjs';

const prisma = new PrismaClient();
const AUTHOR_ID = IT.userAuthor;

function actorWith(permissions) {
  return createStubActor({ userId: AUTHOR_ID, displayName: '集成测试作者', permissions });
}

function buildApp(permissions) {
  return createApp({ db: prisma, actorResolver: async () => actorWith(permissions) });
}

function pushBody(entity, id, data, op = 'upsert') {
  return {
    deviceId: 'it-device-1',
    changes: [{ clientMutationId: `it-${entity}-${id}-${op}-${Date.now()}`, entity, id, op, data }],
  };
}

before(async () => {
  await seedMinimalFixture(prisma);
});

beforeEach(async () => {
  await restoreAuthorMembership(prisma);
  await seedMinimalFixture(prisma);
  await prisma.report.update({
    where: { id: IT.report },
    data: { status: 'DRAFT', content: {}, deletedAt: null },
  });
});

after(async () => {
  await prisma.mutationReceipt.deleteMany({ where: { actorId: AUTHOR_ID } });
  await prisma.reportVersion.deleteMany({ where: { reportId: IT.report } });
  await prisma.$disconnect();
});

test('RF04-I1 被移出项目后，作者不能更新/撤销/删除自己的汇报', async () => {
  const app = buildApp(['reports.update', 'reports.submit', 'reports.delete']);

  // 先确认在项目内可以正常更新（基线）
  const ok = await app.request(`/api/reports/${IT.report}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: { n: 1 } }),
  });
  assert.equal(ok.status, 200);

  await revokeAuthorMembership(prisma);
  try {
    const update = await app.request(`/api/reports/${IT.report}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: { n: 2 } }),
    });
    assert.equal(update.status, 404, '被移出项目后更新应 404');

    const remove = await app.request(`/api/reports/${IT.report}`, { method: 'DELETE' });
    assert.equal(remove.status, 404, '被移出项目后删除应 404');

    const recall = await app.request(`/api/reports/${IT.report}/recall`, { method: 'PATCH' });
    assert.equal(recall.status, 404, '被移出项目后撤回应 404');
  } finally {
    await restoreAuthorMembership(prisma);
  }

  const row = await prisma.report.findUnique({ where: { id: IT.report } });
  assert.equal(row.deletedAt, null, '不得被软删');
  assert.deepEqual(row.content, { n: 1 }, '不得被越权改写');
});

test('RF04-I2 同步不得覆盖已审阅汇报（真实状态锁定）', async () => {
  await prisma.report.update({ where: { id: IT.report }, data: { status: 'REVIEWED' } });
  const app = buildApp(['reports.update', 'reports.create']);

  const res = await app.request('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(pushBody('reports', IT.report, { content: { hacked: true } })),
  });
  const body = await res.json();

  assert.equal(body.results[0].status, 'rejected', `已审阅汇报必须拒绝：${JSON.stringify(body.results[0])}`);

  const row = await prisma.report.findUnique({ where: { id: IT.report } });
  assert.deepEqual(row.content, {}, '内容不得被同步覆盖');
  assert.equal(row.status, 'REVIEWED');
});

test('RF04-I3 同步改任务状态需要 tasks.change_status（真实权限与项目能力）', async () => {
  // 1) 只有 tasks.update：拒绝
  const weakApp = buildApp(['tasks.update']);
  const rejected = await weakApp.request('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(pushBody('tasks', IT.task, { status: 'IN_PROGRESS' })),
  });
  const rejectedBody = await rejected.json();
  assert.equal(rejectedBody.results[0].status, 'rejected', '无 change_status 权限必须拒绝');

  let row = await prisma.task.findUnique({ where: { id: IT.task } });
  assert.equal(row.status, 'NOT_STARTED', '状态不得被改动');

  // 2) 具备 tasks.update + tasks.change_status，且项目角色为 OWNER（有 transition）：放行
  const strongApp = buildApp(['tasks.update', 'tasks.change_status']);
  const applied = await strongApp.request('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(pushBody('tasks', IT.task, { status: 'IN_PROGRESS' })),
  });
  const appliedBody = await applied.json();
  assert.equal(appliedBody.results[0].status, 'applied', `具备权限时应放行：${JSON.stringify(appliedBody.results[0])}`);

  row = await prisma.task.findUnique({ where: { id: IT.task } });
  assert.equal(row.status, 'IN_PROGRESS');
});

test('RF04-I4 跨项目 phaseId 在普通 API 与同步入口都被拒绝', async () => {
  const httpApp = buildApp(['tasks.update', 'tasks.change_status']);
  const httpRes = await httpApp.request(`/api/tasks/${IT.task}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phaseId: IT.phaseOther }),
  });
  assert.equal(httpRes.status, 400, 'HTTP 入口必须拒绝跨项目阶段');

  const syncRes = await httpApp.request('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(pushBody('tasks', IT.task, { phaseId: IT.phaseOther })),
  });
  const syncBody = await syncRes.json();
  assert.equal(syncBody.results[0].status, 'rejected', '同步入口必须拒绝跨项目阶段');
  assert.match(String(syncBody.results[0].reason), /phaseId/);

  const row = await prisma.task.findUnique({ where: { id: IT.task } });
  assert.equal(row.phaseId, IT.phase, '阶段归属不得被改写');
});

test('RF04-I7 相同基线版本的并发更新：仅一个成功，另一个冲突（不同幂等键）', async () => {
  const app = buildApp(['tasks.update']);
  const before = await prisma.task.findUnique({ where: { id: IT.task } });
  const base = before.updatedAt.toISOString();

  const push = (mutationId, title) => app.request('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'it-device-1',
      changes: [{
        clientMutationId: mutationId,
        entity: 'tasks',
        id: IT.task,
        op: 'upsert',
        data: { title },
        baseUpdatedAt: base,
      }],
    }),
  });

  // 两个**不同**幂等键、相同基线版本 → 并发提交
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const [r1, r2] = await Promise.all([
    push(`it-conc-a-${runId}`, '并发改名A'),
    push(`it-conc-b-${runId}`, '并发改名B'),
  ]);
  const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
  const statuses = [b1.results[0].status, b2.results[0].status].sort();

  assert.deepEqual(
    statuses,
    ['applied', 'conflict'],
    `并发写必须只有一个成功：${JSON.stringify([b1.results[0], b2.results[0]])}`,
  );

  const after = await prisma.task.findUnique({ where: { id: IT.task } });
  assert.equal(b1.results[0].replayed, undefined, '用例键必须每次运行唯一，否则会命中历史回放');
  assert.equal(b2.results[0].replayed, undefined);
  const winner = b1.results[0].status === 'applied' ? '并发改名A' : '并发改名B';
  assert.equal(after.title, winner, '后写者不得静默覆盖（last-write-wins 必须被阻止）');
});

test('RF04-I8 汇报 PUT 的并发基线：正确基线放行，过期基线 409 且不改数据', async () => {
  const app = buildApp(['reports.update']);
  const before = await prisma.report.findUnique({ where: { id: IT.report } });
  const stale = new Date(before.updatedAt.getTime() - 60_000).toISOString();

  const conflict = await app.request(`/api/reports/${IT.report}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: { n: 'stale' }, expectedUpdatedAt: stale, clientMutationId: 'it-base-miss' }),
  });
  assert.equal(conflict.status, 409, '过期基线必须冲突');

  const untouched = await prisma.report.findUnique({ where: { id: IT.report } });
  assert.deepEqual(untouched.content, {}, '冲突请求不得改写数据');

  const ok = await app.request(`/api/reports/${IT.report}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: { n: 'fresh' },
      expectedUpdatedAt: before.updatedAt.toISOString(),
      clientMutationId: `it-base-hit-${Date.now()}`,
    }),
  });
  assert.equal(ok.status, 200, '正确基线应放行');
  const updated = await prisma.report.findUnique({ where: { id: IT.report } });
  assert.deepEqual(updated.content, { n: 'fresh' });
});

test('RF04-I9 同步缺少动作权限时不落库（projects 实体补齐权限）', async () => {
  const app = buildApp([]); // 无 projects.update 权限
  const res = await app.request('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deviceId: 'it-device-1',
      changes: [{
        clientMutationId: `it-projects-perm-${Date.now()}`,
        entity: 'projects',
        id: IT.project,
        op: 'upsert',
        data: { name: '被改写的项目名' },
      }],
    }),
  });
  const body = await res.json();
  assert.equal(body.results[0].status, 'rejected', JSON.stringify(body.results[0]));
  assert.match(String(body.results[0].reason), /projects\.update/);

  const row = await prisma.project.findUnique({ where: { id: IT.project } });
  assert.equal(row.name, '集成测试项目', '名称不得被改写');
});

test('RF04-I6 新建日报的持久幂等：同 key 同 payload 重试只落一条', async () => {
  const periodKey = '2026-11-02';
  const app = buildApp(['reports.create']);
  const payload = {
    projectId: IT.project,
    reportType: 'DAILY',
    periodKey,
    content: { n: 1 },
    clientMutationId: 'it-post-idem-1',
  };

  try {
    const first = await app.request('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(first.status, 201);

    const replay = await app.request('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(replay.status, 201);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.deepEqual(await replay.json(), await first.clone().json());

    const rows = await prisma.report.findMany({
      where: { projectId: IT.project, authorId: AUTHOR_ID, reportType: 'DAILY', periodKey },
    });
    assert.equal(rows.length, 1, '重试不得重复创建');
  } finally {
    const rows = await prisma.report.findMany({
      where: { projectId: IT.project, authorId: AUTHOR_ID, periodKey },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await prisma.reportVersion.deleteMany({ where: { reportId: { in: ids } } });
      await prisma.mutationReceipt.deleteMany({ where: { resourceScope: { in: ids.map((id) => `report:${id}`) } } });
      await prisma.report.deleteMany({ where: { id: { in: ids } } });
    }
  }
});

test('RF04-I5 同项目内的 phaseId 正常放行（回归）', async () => {
  const app = buildApp(['tasks.update']);
  const res = await app.request('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(pushBody('tasks', IT.task, { phaseId: IT.phase, title: '改名后的任务' })),
  });
  const body = await res.json();
  assert.equal(body.results[0].status, 'applied', JSON.stringify(body.results[0]));

  const row = await prisma.task.findUnique({ where: { id: IT.task } });
  assert.equal(row.title, '改名后的任务');
});
