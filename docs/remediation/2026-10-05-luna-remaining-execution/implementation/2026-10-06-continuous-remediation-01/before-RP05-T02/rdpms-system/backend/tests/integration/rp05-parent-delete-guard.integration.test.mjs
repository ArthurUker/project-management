import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';

// Run only against a newly created, task-owned throwaway PostgreSQL database.
const prisma = new PrismaClient();
let actor;
let projectA;
let projectB;
let parentA;
let parentB;
let app;

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const suffix = crypto.randomUUID();
  actor = await prisma.user.create({
    data: {
      id: `rp05t01-${suffix}`,
      username: `rp05t01-${suffix}`,
      displayName: 'RP05-T01 synthetic actor',
      passwordHash: 'not-a-real-password-hash',
      systemRole: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  projectA = await createProject(suffix, 'A');
  projectB = await createProject(suffix, 'B');
  parentA = await createTask(projectA.id, 'A parent');
  parentB = await createTask(projectB.id, 'B parent');
  app = buildApp(['projects.update', 'tasks.update', 'tasks.create']);
});

function buildApp(permissions) {
  return createApp({ db: prisma, actorResolver: async () => ({
    userId: actor.id,
    user: { id: actor.id, username: actor.username, displayName: actor.displayName },
    systemRole: 'ADMIN',
    // The default test actor deliberately lacks tasks.delete.
    permissions,
  }) });
}

async function createProject(suffix, label) {
  return prisma.project.create({
    data: {
      code: `RP05-${label}-${suffix}`,
      name: `RP05 project ${label}`,
      type: 'TESTING',
      status: 'PLANNING',
      managerId: actor.id,
      createdById: actor.id,
      members: { create: { userId: actor.id, role: 'OWNER', createdById: actor.id } },
    },
  });
}

async function createTask(projectId, title) {
  return prisma.task.create({ data: { projectId, title, createdById: actor.id } });
}

after(async () => {
  await prisma.project.deleteMany({ where: { id: { in: [projectA?.id, projectB?.id].filter(Boolean) } } });
  // Keep the synthetic actor because audit rows are append-only; the task runner
  // must drop the whole disposable database after preserving sanitized evidence.
  await prisma.$disconnect();
});

async function request(path, method = 'GET', body, targetApp = app) {
  const response = await targetApp.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json;
  try { json = await response.json(); } catch { json = null; }
  return { response, json };
}

test('RP05-T01 AC-B02 project PUT cannot physically remove tasks without tasks.delete', async () => {
  const beforeTask = await prisma.task.findUnique({ where: { id: parentA.id } });
  const result = await request(`/projects/${projectA.id}`, 'PUT', { name: projectA.name, tasks: [] });
  assert.equal(result.response.status, 403, JSON.stringify(result.json));
  const afterTask = await prisma.task.findUnique({ where: { id: parentA.id } });
  assert.ok(afterTask);
  assert.equal(afterTask.id, beforeTask.id);
  assert.equal(afterTask.title, beforeTask.title);
  assert.equal(afterTask.deletedAt, null);
});

test('RP05-T01 AC-B19 online task create/update reject cross-project parent and keep same-project parent writable', async () => {
  const rejectedCreate = await request('/tasks', 'POST', {
    projectId: projectB.id,
    title: 'RP05 cross-project online child',
    parentId: parentA.id,
  });
  assert.equal(rejectedCreate.response.status, 400, JSON.stringify(rejectedCreate.json));
  assert.equal(await prisma.task.count({ where: { projectId: projectB.id, title: 'RP05 cross-project online child' } }), 0);

  const validCreate = await request('/tasks', 'POST', {
    projectId: projectB.id,
    title: 'RP05 same-project child',
    parentId: parentB.id,
  });
  assert.equal(validCreate.response.status, 201, JSON.stringify(validCreate.json));
  assert.equal(validCreate.json.parentId, parentB.id);

  const rejectedUpdate = await request(`/tasks/${validCreate.json.id}`, 'PUT', { parentId: parentA.id });
  assert.equal(rejectedUpdate.response.status, 400, JSON.stringify(rejectedUpdate.json));
  assert.equal((await prisma.task.findUnique({ where: { id: validCreate.json.id } })).parentId, parentB.id);
});

test('RP05-T01 AC-B19 sync push rejects a cross-project parent without creating the child task', async () => {
  const childId = `rp05-cross-${crypto.randomUUID()}`;
  const mutationId = `rp05-mutation-${crypto.randomUUID()}`;
  const result = await request('/sync/push', 'POST', {
    deviceId: `rp05-device-${crypto.randomUUID()}`,
    changes: [{
      clientMutationId: mutationId,
      entity: 'tasks',
      id: childId,
      op: 'upsert',
      data: { projectId: projectB.id, title: 'RP05 cross-project sync child', parentId: parentA.id },
    }],
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.json));
  assert.equal(result.json.results[0].status, 'rejected');
  assert.equal(await prisma.task.findUnique({ where: { id: childId } }), null);
});

test('RP05-T01 AC-B19-03 project array replacement cannot cascade-delete a cross-project child, even for an authorized deleter', async () => {
  const crossChild = await createTask(projectB.id, 'RP05 anomalous cross-project child');
  await prisma.task.update({ where: { id: crossChild.id }, data: { parentId: parentA.id } });
  const authorizedDeleteApp = buildApp(['projects.update', 'tasks.update', 'tasks.create', 'tasks.delete']);
  const result = await request(`/projects/${projectA.id}`, 'PUT', { name: projectA.name, tasks: [] }, authorizedDeleteApp);
  assert.equal(result.response.status, 400, JSON.stringify(result.json));
  assert.equal(result.json.code, 'CROSS_PROJECT_CHILD_EXISTS');
  assert.ok(await prisma.task.findUnique({ where: { id: parentA.id } }));
  const preservedChild = await prisma.task.findUnique({ where: { id: crossChild.id } });
  assert.ok(preservedChild);
  assert.equal(preservedChild.projectId, projectB.id);
  assert.equal(preservedChild.parentId, parentA.id);
});
