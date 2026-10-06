import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { setRealSyncPermissions, syncV1Request, readSyncResult } from '../helpers/syncV1Fixture.mjs';

// Run only against a newly created, task-owned throwaway PostgreSQL database.
const prisma = new PrismaClient();
let actor;
let projects = {};

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const suffix = crypto.randomUUID();
  actor = await prisma.user.create({
    data: {
      id: `rp07t01-${suffix}`,
      username: `rp07t01-${suffix}`,
      displayName: 'RP07-T01 synthetic actor',
      passwordHash: 'not-a-real-password-hash',
      systemRole: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  for (const label of ['archive-denied', 'illegal-edge-http', 'illegal-edge-sync', 'http-allowed', 'sync-allowed', 'manager-guard']) {
    projects[label] = await prisma.project.create({
      data: {
        code: `RP07-${label}-${suffix}`,
        name: `RP07 ${label}`,
        type: 'TESTING',
        status: 'PLANNING',
        managerId: actor.id,
        createdById: actor.id,
        members: { create: { userId: actor.id, role: 'OWNER', createdById: actor.id } },
      },
    });
  }
});

after(async () => {
  await prisma.project.deleteMany({ where: { id: { in: Object.values(projects).map((project) => project.id) } } });
  // Keep the synthetic actor because project/sync audit rows are append-only.
  await prisma.$disconnect();
});

async function buildApp(permissions) {
  await setRealSyncPermissions(prisma, actor.id, permissions);
  return createApp({ db: prisma, actorResolver: async () => ({
    userId: actor.id,
    user: { id: actor.id, username: actor.username, displayName: actor.displayName },
    systemRole: 'ADMIN',
    permissions,
  }) });
}

async function request(app, path, method = 'GET', body) {
  const response = await syncV1Request(app, `/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json;
  try { json = path === '/sync/push' ? await readSyncResult(response) : await response.json(); } catch { json = null; }
  return { response, json };
}

async function syncStatus(app, project, status, suffix) {
  return request(app, '/sync/push', 'POST', {
    deviceId: `rp07-device-${suffix}`,
    changes: [{
      clientMutationId: `rp07-mutation-${suffix}`,
      entity: 'projects',
      id: project.id,
      op: 'upsert',
      data: { status },
    }],
  });
}

test('RP07-T01 AC-B09-01 projects.update alone cannot archive through HTTP or sync', async () => {
  const app = await buildApp(['projects.update']);
  const http = await request(app, `/projects/${projects['archive-denied'].id}`, 'PUT', { status: 'ARCHIVED' });
  assert.equal(http.response.status, 403);
  assert.equal((await prisma.project.findUnique({ where: { id: projects['archive-denied'].id } })).status, 'PLANNING');

  const sync = await syncStatus(app, projects['archive-denied'], 'ARCHIVED', crypto.randomUUID());
  assert.ok([200,400,403].includes(sync.response.status), 'actual authorization/state rejection, not protocol failure');
  assert.equal(sync.json.results[0].status, 'rejected');
  assert.equal((await prisma.project.findUnique({ where: { id: projects['archive-denied'].id } })).status, 'PLANNING');
});

test('RP07-T01 AC-B09-02 archive permission does not allow an edge outside the shared state machine', async () => {
  const app = await buildApp(['projects.update', 'projects.archive']);
  const http = await request(app, `/projects/${projects['illegal-edge-http'].id}`, 'PUT', { status: 'COMPLETED' });
  assert.equal(http.response.status, 400);
  assert.equal(http.json.code, 'INVALID_STATUS_TRANSITION');

  const sync = await syncStatus(app, projects['illegal-edge-sync'], 'COMPLETED', crypto.randomUUID());
  assert.ok([200,400,403].includes(sync.response.status), 'actual authorization/state rejection, not protocol failure');
  assert.equal(sync.json.results[0].status, 'rejected');
  assert.equal((await prisma.project.findUnique({ where: { id: projects['illegal-edge-http'].id } })).status, 'PLANNING');
  assert.equal((await prisma.project.findUnique({ where: { id: projects['illegal-edge-sync'].id } })).status, 'PLANNING');
});

test('RP07-T01 AC-B09-03 HTTP and sync use the same allowed project transition', async () => {
  const app = await buildApp(['projects.update']);
  const http = await request(app, `/projects/${projects['http-allowed'].id}`, 'PUT', { status: 'IN_PROGRESS' });
  assert.equal(http.response.status, 200);
  assert.equal((await prisma.project.findUnique({ where: { id: projects['http-allowed'].id } })).status, 'IN_PROGRESS');

  const sync = await syncStatus(app, projects['sync-allowed'], 'IN_PROGRESS', crypto.randomUUID());
  assert.equal(sync.response.status, 200);
  assert.equal(sync.json.results[0].status, 'applied');
  assert.equal((await prisma.project.findUnique({ where: { id: projects['sync-allowed'].id } })).status, 'IN_PROGRESS');
});

test('RP07-T01 managerId requires explicit manage_members transfer permission under approved D-S01-06 policy', async () => {
  const app = await buildApp(['projects.update']);
  const result = await request(app, '/sync/push', 'POST', {
    deviceId: `rp07-manager-device-${crypto.randomUUID()}`,
    changes: [{
      clientMutationId: `rp07-manager-mutation-${crypto.randomUUID()}`,
      entity: 'projects',
      id: projects['manager-guard'].id,
      op: 'upsert',
      data: { managerId: 'unapproved-manager-target' },
    }],
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.json.results[0].status, 'rejected');
  assert.equal((await prisma.project.findUnique({ where: { id: projects['manager-guard'].id } })).managerId, actor.id);
});
