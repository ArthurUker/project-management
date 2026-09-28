/**
 * A01 真实集成测试 —— 历史版本读取必须与正文详情同权（专用隔离库 rdpms_test）
 *
 * 单测只能证明「非成员被拒、成员被放行」（桩的 reportVersion 数据源不生效），
 * 版本**正文**是否真的返回、撤权后是否真的读不到，必须在真实库上验证：
 *   - 合法成员 → 200 且能拿到版本正文；
 *   - 被移出项目（leftAt 非空）→ 404，且响应里不得出现任何正文；
 *   - 已删除日报 → 404（与详情一致）。
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { createStubActor } from '../helpers/stubDeps.mjs';
import { IT, seedMinimalFixture, revokeAuthorMembership, restoreAuthorMembership } from './fixtures.mjs';

const prisma = new PrismaClient();
const AUTHOR_ID = IT.userAuthor;
const SNAPSHOT = { evidence: 'A01-版本正文-合成数据' };

function buildApp(permissions = ['reports.view', 'reports.update']) {
  return createApp({
    db: prisma,
    actorResolver: async () => createStubActor({ userId: AUTHOR_ID, displayName: '集成测试作者', permissions }),
  });
}

before(async () => {
  await seedMinimalFixture(prisma);
});

beforeEach(async () => {
  await restoreAuthorMembership(prisma);
  await seedMinimalFixture(prisma);
  await prisma.report.update({
    where: { id: IT.report },
    data: { status: 'SUBMITTED', content: { current: true }, deletedAt: null },
  });
  await prisma.reportVersion.deleteMany({ where: { reportId: IT.report } });
  await prisma.reportVersion.create({
    data: { reportId: IT.report, version: 1, content: SNAPSHOT, createdById: AUTHOR_ID },
  });
});

after(async () => {
  await prisma.reportVersion.deleteMany({ where: { reportId: IT.report } });
  await prisma.report.update({ where: { id: IT.report }, data: { status: 'DRAFT', deletedAt: null } });
  await prisma.$disconnect();
});

test('A01-I1 项目成员读取历史版本 → 200 且返回版本正文', async () => {
  const res = await buildApp().request(`/api/reports/${IT.report}/versions`);
  assert.equal(res.status, 200, `成员应放行，实际 ${res.status}`);
  const body = await res.json();
  assert.ok(Array.isArray(body) && body.length === 1, `应返回 1 条版本，实际 ${JSON.stringify(body)?.slice(0, 120)}`);
  assert.deepEqual(body[0].content, SNAPSHOT, '版本正文必须真实返回（这正是 A01 泄露的点）');
});

test('A01-I2 被移出项目后读取历史版本 → 404 且不泄露任何正文', async () => {
  await revokeAuthorMembership(prisma);
  try {
    const res = await buildApp().request(`/api/reports/${IT.report}/versions`);
    assert.equal(res.status, 404, `撤权后应 404（隐藏存在性），实际 ${res.status}`);
    const text = await res.text();
    assert.equal(
      text.includes(SNAPSHOT.evidence),
      false,
      `响应不得包含版本正文，实际 body=${text.slice(0, 160)}`,
    );
  } finally {
    await restoreAuthorMembership(prisma);
  }
});

test('A01-I3 已删除日报的历史版本 → 404（与正文详情同口径）', async () => {
  await prisma.report.update({ where: { id: IT.report }, data: { deletedAt: new Date() } });
  const res = await buildApp().request(`/api/reports/${IT.report}/versions`);
  assert.equal(res.status, 404, `已删除资源应 404，实际 ${res.status}`);
  await prisma.report.update({ where: { id: IT.report }, data: { deletedAt: null } });
});
