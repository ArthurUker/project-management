import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';

// Run only on a new task-owned throwaway PostgreSQL database.
const prisma = new PrismaClient();
let actor;
let project;
let deviceId;
let liveIds = [];
let deletedIds = [];
let app;

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const suffix = crypto.randomUUID();
  actor = await prisma.user.create({ data: {
    id: `rp13t01-${suffix}`,
    username: `rp13t01-${suffix}`,
    displayName: 'RP13-T01 synthetic actor',
    passwordHash: 'not-a-real-password-hash',
    systemRole: 'ADMIN',
    status: 'ACTIVE',
  } });
  project = await prisma.project.create({ data: {
    code: `RP13-${suffix}`,
    name: 'RP13 pagination synthetic project',
    type: 'TESTING',
    status: 'PLANNING',
    managerId: actor.id,
    createdById: actor.id,
    members: { create: { userId: actor.id, role: 'OWNER', createdById: actor.id } },
  } });
  deviceId = `rp13-device-${suffix}`;

  const now = Date.now();
  const updatedAt = new Date(now - 30_000);
  liveIds = Array.from({ length: 3001 }, (_, i) => `rp13-live-${suffix}-${i}`);
  deletedIds = Array.from({ length: 5001 }, (_, i) => `rp13-deleted-${suffix}-${i}`);
  await prisma.task.createMany({ data: liveIds.map((id, i) => ({
    id, projectId: project.id, title: `RP13 live ${i}`, createdAt: updatedAt, updatedAt,
  })) });
  await prisma.task.createMany({ data: deletedIds.map((id, i) => ({
    id, projectId: project.id, title: `RP13 deleted ${i}`, createdAt: updatedAt, updatedAt,
    deletedAt: updatedAt,
  })) });
  app = createApp({ db: prisma, actorResolver: async () => ({
    userId: actor.id,
    user: { id: actor.id, username: actor.username, displayName: actor.displayName },
    systemRole: 'ADMIN',
    permissions: ['tasks.view'],
  }) });
});

after(async () => {
  if (deviceId) await prisma.syncDevice.deleteMany({ where: { id: deviceId } });
  if (project) await prisma.project.deleteMany({ where: { id: project.id } });
  await prisma.$disconnect();
});

async function pull(params) {
  const query = new URLSearchParams(params);
  const response = await app.request(`/api/sync/init?${query}`);
  let json;
  try { json = await response.json(); } catch { json = null; }
  return { response, json };
}

test('RP13-T01 keyset continuation returns all truncated live and tombstone streams before cursor advances', async () => {
  const since = new Date(Date.now() - 60_000).toISOString();
  let result = await pull({ since, deviceId, paginationVersion: '1' });
  assert.equal(result.response.status, 200, JSON.stringify(result.json));
  assert.equal(result.json.pagination.hasMore, true);
  assert.equal(result.json.cursor, since, 'intermediate pages must not advance the durable checkpoint');
  const collectedLive = [];
  const collectedDeleted = [];
  let pageCount = 0;
  while (true) {
    pageCount += 1;
    assert.ok(pageCount <= 5, 'pagination must make bounded forward progress');
    collectedLive.push(...result.json.changes.tasks.upserts.map((row) => row.id).filter((id) => id.startsWith('rp13-live-')));
    collectedDeleted.push(...result.json.changes.tasks.tombstones.filter((id) => id.startsWith('rp13-deleted-')));
    if (!result.json.pagination.hasMore) break;
    assert.ok(result.json.pagination.nextPageToken);
    result = await pull({ deviceId, paginationVersion: '1', pageToken: result.json.pagination.nextPageToken });
    assert.equal(result.response.status, 200, JSON.stringify(result.json));
  }
  assert.equal(new Set(collectedLive).size, liveIds.length);
  assert.equal(new Set(collectedDeleted).size, deletedIds.length);
  assert.ok(Date.parse(result.json.cursor) > Date.parse(since));
  assert.equal(result.json.cursor, result.json.serverTime);
});

test('RP13-T01 an oversized first response rejects legacy clients without moving their checkpoint', async () => {
  const since = new Date(Date.now() - 60_000).toISOString();
  const result = await pull({ since, deviceId: `rp13-legacy-${deviceId}` });
  assert.equal(result.response.status, 409);
  assert.equal(result.json.code, 'SYNC_PAGINATION_REQUIRED');
});
