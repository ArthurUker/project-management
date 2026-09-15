/**
 * RF03 真实集成测试 —— 日报周期键（专用隔离库 rdpms_test）
 *
 * 验收（06）：同人同项目两天 DAILY 必须产生两条，而不是落到同一唯一键互相覆盖。
 * 桩依赖无法证明唯一约束与 upsert 的真实行为，故在真实库验证。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/bootstrap/createApp.js';
import { createStubActor } from '../helpers/stubDeps.mjs';
import { IT, seedMinimalFixture } from './fixtures.mjs';

const prisma = new PrismaClient();

const AUTHOR = createStubActor({
  userId: IT.userAuthor,
  displayName: '集成测试作者',
  permissions: ['reports.create', 'reports.update', 'reports.submit'],
});

const DAY_A = '2026-10-01';
const DAY_B = '2026-10-02';

function buildApp() {
  return createApp({ db: prisma, actorResolver: async () => AUTHOR });
}

async function cleanupPeriods() {
  const rows = await prisma.report.findMany({
    where: { projectId: IT.project, authorId: IT.userAuthor, periodKey: { in: [DAY_A, DAY_B] } },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await prisma.reportVersion.deleteMany({ where: { reportId: { in: ids } } });
  await prisma.mutationReceipt.deleteMany({ where: { resourceScope: { in: ids.map((id) => `report:${id}`) } } });
  await prisma.report.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  await seedMinimalFixture(prisma);
  await cleanupPeriods();
});

after(async () => {
  await cleanupPeriods();
  await prisma.mutationReceipt.deleteMany({ where: { actorId: AUTHOR.userId } });
  await prisma.$disconnect();
});

function saveReport(app, periodKey, content) {
  return app.request('/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: IT.project,
      reportType: 'DAILY',
      periodKey,
      content,
    }),
  });
}

test('RF03-I1 同人同项目两天 DAILY 产生两条（真实唯一约束）', async () => {
  const app = buildApp();

  const a = await saveReport(app, DAY_A, { n: 1 });
  const b = await saveReport(app, DAY_B, { n: 2 });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);

  const rows = await prisma.report.findMany({
    where: { projectId: IT.project, authorId: IT.userAuthor, reportType: 'DAILY', periodKey: { in: [DAY_A, DAY_B] } },
    orderBy: { periodKey: 'asc' },
  });
  assert.equal(rows.length, 2, '两天必须各有一条');
  assert.deepEqual(rows.map((r) => r.periodKey), [DAY_A, DAY_B]);
  assert.notEqual(rows[0].id, rows[1].id);
});

test('RF03-I2 同一天重复保存仍然是同一条（upsert 语义）', async () => {
  const app = buildApp();
  const res = await saveReport(app, DAY_A, { n: 111 });
  assert.equal(res.status, 201);

  const rows = await prisma.report.findMany({
    where: { projectId: IT.project, authorId: IT.userAuthor, reportType: 'DAILY', periodKey: DAY_A },
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].content, { n: 111 }, '同日保存应覆盖内容而不是新增记录');
});

test('RF03-I3 月份键被服务端拒绝（F03：不得退化成月键）', async () => {
  const app = buildApp();
  const res = await saveReport(app, '2026-10', { n: 1 });
  const body = await res.json();

  assert.equal(res.status, 400, `月键必须被拒绝，实际：${JSON.stringify(body)}`);
  assert.equal(body.code, 'VALIDATION_ERROR');

  const count = await prisma.report.count({
    where: { projectId: IT.project, authorId: IT.userAuthor, periodKey: '2026-10' },
  });
  assert.equal(count, 0);
});

test('RF03-I4 已提交的汇报不能被保存接口覆盖（真实状态约束）', async () => {
  const app = buildApp();
  await saveReport(app, DAY_B, { n: 2 });

  const [row] = await prisma.report.findMany({
    where: { projectId: IT.project, authorId: IT.userAuthor, periodKey: DAY_B },
  });
  const submitted = await app.request(`/api/reports/${row.id}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientMutationId: 'rf03-i4-submit' }),
  });
  assert.equal(submitted.status, 200);

  const overwrite = await saveReport(app, DAY_B, { hacked: true });
  assert.equal(overwrite.status, 409, '已提交内容对所有保存入口锁定');

  const after = await prisma.report.findUnique({ where: { id: row.id } });
  assert.deepEqual(after.content, { n: 2 }, '内容必须保持提交时的样子');
  assert.equal(after.status, 'SUBMITTED');
});
