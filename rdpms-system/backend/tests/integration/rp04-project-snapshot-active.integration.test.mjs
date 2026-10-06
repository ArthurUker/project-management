import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';

const prisma = new PrismaClient();
let user;
let liveProject;
let deletedProject;
let illegalProject;
let template;

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const suffix = crypto.randomUUID();
  user = await prisma.user.create({
    data: {
      id: `rp04-${suffix}`,
      username: `rp04-${suffix}`,
      displayName: 'RP04 synthetic user',
      passwordHash: 'not-a-real-password-hash',
      systemRole: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });
  liveProject = await prisma.project.create({
    data: {
      code: `RP04-LIVE-${suffix}`,
      name: 'RP04 live project',
      type: 'TESTING',
      status: 'PLANNING',
      managerId: user.id,
      startDate: new Date('2024-06-15T00:00:00.000Z'),
    },
  });
  deletedProject = await prisma.project.create({
    data: {
      code: `RP04-DELETED-${suffix}`,
      name: 'RP04 deleted project',
      type: 'TESTING',
      status: 'COMPLETED',
      managerId: user.id,
      deletedAt: new Date(),
    },
  });
  illegalProject = await prisma.project.create({
    data: {
      code: `RP04-ILLEGAL-${suffix}`,
      name: 'RP04 illegal transition project',
      type: 'TESTING',
      status: 'PLANNING',
      managerId: user.id,
    },
  });
  template = await prisma.projectTemplate.create({
    data: {
      code: `RP04-TEMPLATE-${suffix}`,
      name: 'RP04 template',
      createdById: user.id,
      phases: {
        create: [{
          code: `RP04-PHASE-${suffix}`,
          name: 'RP04 phase',
          sortOrder: 0,
          plannedDurationDays: 3,
          tasks: { create: [{ title: 'RP04 template task', sortOrder: 0 }] },
        }],
      },
    },
  });
});

after(async () => {
  if (liveProject || deletedProject || illegalProject) {
    await prisma.project.deleteMany({ where: { id: { in: [liveProject?.id, deletedProject?.id, illegalProject?.id].filter(Boolean) } } });
  }
  if (template) await prisma.projectTemplate.deleteMany({ where: { id: template.id } });
  // The routes append audit rows referencing this synthetic actor. Keep the
  // actor until the task-owned throwaway database is dropped by the runner;
  // deleting it would mutate append-only audit rows through ON DELETE SET NULL.
  await prisma.$disconnect();
});

function buildApp() {
  return createApp({
    db: prisma,
    actorResolver: async () => ({
      userId: user.id,
      user: { id: user.id, username: user.username, displayName: user.displayName },
      systemRole: 'SUPER_ADMIN',
      permissions: ['projects.view', 'projects.update', 'projects.archive'],
    }),
  });
}

async function requestJson(path, method = 'GET', body) {
  const response = await buildApp().request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

test('RP04 AC-B20 ordinary list, count and project type/status statistics exclude soft-deleted rows', async () => {
  const expectedLiveCount = await prisma.project.count({ where: { deletedAt: null } });
  const list = await requestJson('/projects');
  assert.equal(list.response.status, 200);
  assert.equal(list.body.total, expectedLiveCount);
  assert.ok(list.body.list.some((project) => project.id === liveProject.id));
  assert.ok(!list.body.list.some((project) => project.id === deletedProject.id));

  const types = await requestJson('/projects/stats/types');
  const expectedTypes = await prisma.project.groupBy({ by: ['type'], where: { deletedAt: null }, _count: { id: true } });
  assert.deepEqual(
    [...types.body].sort((a, b) => a.type.localeCompare(b.type)),
    expectedTypes.map((row) => ({ type: row.type, count: row._count.id })).sort((a, b) => a.type.localeCompare(b.type)),
  );

  const statuses = await requestJson('/projects/stats/status');
  const expectedStatuses = await prisma.project.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { id: true } });
  assert.deepEqual(
    [...statuses.body].sort((a, b) => a.status.localeCompare(b.status)),
    expectedStatuses.map((row) => ({ status: row.status, count: row._count.id })).sort((a, b) => a.status.localeCompare(b.status)),
  );

  const detail = await requestJson(`/projects/${deletedProject.id}`);
  assert.equal(detail.response.status, 404);
});

test('RP04 AC-B03 project status comes from a business snapshot and legal/illegal transitions behave correctly', async () => {
  const legal = await requestJson(`/projects/${liveProject.id}`, 'PUT', { name: 'RP04 renamed', status: 'IN_PROGRESS' });
  assert.equal(legal.response.status, 200, JSON.stringify(legal.body));
  assert.equal((await prisma.project.findUnique({ where: { id: liveProject.id } })).status, 'IN_PROGRESS');

  const unchanged = await requestJson(`/projects/${liveProject.id}`, 'PUT', { name: 'RP04 ordinary edit', status: 'IN_PROGRESS' });
  assert.equal(unchanged.response.status, 200, JSON.stringify(unchanged.body));
  assert.equal((await prisma.project.findUnique({ where: { id: liveProject.id } })).name, 'RP04 ordinary edit');

  const illegal = await requestJson(`/projects/${illegalProject.id}`, 'PUT', { status: 'COMPLETED' });
  assert.equal(illegal.response.status, 400);
  assert.equal(illegal.body.code, 'INVALID_STATUS_TRANSITION');
  assert.equal((await prisma.project.findUnique({ where: { id: illegalProject.id } })).status, 'PLANNING');
});

test('RP04 AC-B03 batch status and template defaults use selected business state/date', async () => {
  const batch = await requestJson('/projects/batch-update-status', 'POST', { ids: [illegalProject.id], status: 'IN_PROGRESS' });
  assert.equal(batch.response.status, 200, JSON.stringify(batch.body));
  assert.equal((await prisma.project.findUnique({ where: { id: illegalProject.id } })).status, 'IN_PROGRESS');

  const applied = await requestJson(`/projects/${liveProject.id}/apply-template`, 'POST', { templateId: template.id });
  assert.equal(applied.response.status, 200, JSON.stringify(applied.body));
  const firstPhase = await prisma.projectPhase.findFirst({ where: { projectId: liveProject.id }, orderBy: { sortOrder: 'asc' } });
  assert.ok(firstPhase);
  assert.equal(firstPhase.plannedStart.toISOString().slice(0, 10), '2024-06-15');
});
