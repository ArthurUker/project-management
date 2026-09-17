/**
 * A02 真实隔离库用例 —— POST「保存草稿」命中已有汇报时的并发基线
 *
 * 桩依赖无法验证真实唯一键与 CAS 语义，故在专用隔离库（rdpms_test）验证：
 *   两个**不同幂等键**、**相同基线**的并发 POST，只能一方成功，另一方 409 CONFLICT，
 *   且后写者不得静默覆盖先写者（这正是 A02 的原缺陷路径）。
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubActor } from '../helpers/stubDeps.mjs';
import { IT, seedMinimalFixture } from './fixtures.mjs';

const prisma = new PrismaClient();
const PERMS = ['reports.create', 'reports.update'];

function buildApp() {
  return createApp({
    db: prisma,
    actorResolver: async () => createStubActor({
      userId: IT.userAuthor, displayName: '集成测试作者', permissions: PERMS,
    }),
  });
}

async function currentRow() {
  const row = await prisma.report.findUnique({ where: { id: IT.report } });
  return row;
}

function postBody(row, content, baseline, tag) {
  return JSON.stringify({
    projectId: row.projectId,
    reportType: row.reportType,
    periodKey: row.periodKey,
    content,
    ...(baseline ? { expectedUpdatedAt: baseline } : {}),
    clientMutationId: `it-post-conc-${tag}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
  });
}

before(async () => { await seedMinimalFixture(prisma); });

beforeEach(async () => {
  await seedMinimalFixture(prisma);
  await prisma.report.update({
    where: { id: IT.report },
    data: { status: 'DRAFT', content: {}, deletedAt: null },
  });
});

after(async () => {
  await prisma.mutationReceipt.deleteMany({ where: { actorId: IT.userAuthor } });
  await prisma.reportVersion.deleteMany({ where: { reportId: IT.report } });
  await prisma.$disconnect();
});

test('A02-I1 同基线不同幂等键并发 POST：仅一方成功，后写者不得覆盖', async () => {
  const app = buildApp();
  const row = await currentRow();
  const baseline = row.updatedAt.toISOString();

  const send = (tag, n) => app.request('/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: postBody(row, { n, mark: tag }, baseline, tag),
  });

  const [r1, r2] = await Promise.all([send('a', 1), send('b', 2)]);
  const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
  const codes = [r1.status, r2.status].sort((x, y) => x - y);

  assert.deepEqual(codes, [201, 409],
    `并发覆盖必须一方成功一方冲突，实际：${JSON.stringify([{ s: r1.status, c: b1.code }, { s: r2.status, c: b2.code }])}`);
  const conflict = r1.status === 409 ? b1 : b2;
  assert.equal(conflict.code, 'CONFLICT');

  const after = await currentRow();
  const winner = r1.status === 201 ? 'a' : 'b';
  assert.equal(after.content.mark, winner, '最终内容必须属于胜者（后写者不得静默覆盖）');
  const rows = await prisma.report.count({
    where: { projectId: row.projectId, authorId: IT.userAuthor, reportType: row.reportType, periodKey: row.periodKey, deletedAt: null },
  });
  assert.equal(rows, 1, '同一唯一键只应存在一条记录');
});

test('A02-I2 顺序覆盖（重新读取基线）仍可成功——未过度收紧', async () => {
  const app = buildApp();
  const first = await currentRow();
  const r1 = await app.request('/api/reports', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: postBody(first, { n: 1 }, first.updatedAt.toISOString(), 'seq1'),
  });
  assert.equal(r1.status, 201);

  const second = await currentRow();
  const r2 = await app.request('/api/reports', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: postBody(second, { n: 2 }, second.updatedAt.toISOString(), 'seq2'),
  });
  assert.equal(r2.status, 201, `顺序覆盖应成功，实际 ${r2.status}`);
  assert.equal((await currentRow()).content.n, 2);
});

test('A02-I3 过期基线覆盖 → 409 CONFLICT 且不写入', async () => {
  const app = buildApp();
  const row = await currentRow();
  const stale = new Date(row.updatedAt.getTime() - 60_000).toISOString();
  const res = await app.request('/api/reports', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: postBody(row, { n: 99 }, stale, 'stale'),
  });
  assert.equal(res.status, 409, `期望 409，实际 ${res.status}`);
  assert.equal((await res.json()).code, 'CONFLICT');
  assert.deepEqual((await currentRow()).content, {}, '过期基线不得写入');
});
