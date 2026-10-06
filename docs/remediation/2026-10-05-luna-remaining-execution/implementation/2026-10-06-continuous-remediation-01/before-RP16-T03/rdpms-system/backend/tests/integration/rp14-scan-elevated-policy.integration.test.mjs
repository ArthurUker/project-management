import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { signAccessToken } from '../../dist/kernel/rbac.js';
import { safeStoragePath } from '../../dist/kernel/storage.js';
import { decideFileRead } from '../../dist/modules/files/fileReadService.js';

// Real Bearer verification, active-user lookup and DB permission loading. Login
// issuance/refresh policy is outside this task. Actors/audits live until DB drop.
const db = new PrismaClient();
const suffix = crypto.randomUUID();
const app = createApp({ db });
let member, outsider, elevated, project;
const objects = new Map();
const documents = new Map();
const secretBody = 'synthetic-byte-body-never-in-denial';

async function actor(label, systemRole = 'ADMIN', permissions = ['files.download', 'files.delete', 'regulatory_documents.view']) {
  const user = await db.user.create({ data: { username: `rp14-policy-${label}-${suffix}`,
    displayName: 'Synthetic policy actor', passwordHash: 'synthetic-only', status: 'ACTIVE', systemRole } });
  if (systemRole !== 'SUPER_ADMIN') {
    const role = await db.role.create({ data: { code: `RP14_${label}_${suffix}`, name: 'Synthetic file policy role',
      permissions: { create: permissions.map((code) => ({ permission: { connect: { code } } })) } } });
    await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { user, token: signAccessToken(user) };
}
function request(as, url, method = 'GET', server = app) {
  return server.request(`/api${url}`, { method, headers: { Authorization: `Bearer ${as.token}` } });
}
async function object(scanStatus = 'CLEAN', extra = {}) {
  const storageKey = `rp14-policy/${crypto.randomUUID()}.txt`;
  await fs.mkdir(path.dirname(safeStoragePath(storageKey)), { recursive: true });
  await fs.writeFile(safeStoragePath(storageKey), secretBody);
  return db.fileObject.create({ data: { storageKey, originalName: 'synthetic-sensitive-name.txt',
    mimeType: 'text/plain', sizeBytes: secretBody.length, checksum: crypto.createHash('sha256').update(secretBody).digest('hex'),
    scanStatus, uploadedById: member.user.id, ownerUserId: member.user.id, ownerProjectId: project.id,
    accessScope: 'PROJECT', classifiedAt: new Date(), ...extra } });
}
before(async () => {
  await db.$queryRaw`SELECT 1`;
  member = await actor('member'); outsider = await actor('outsider'); elevated = await actor('super', 'SUPER_ADMIN');
  project = await db.project.create({ data: { code: `RP14-P-${suffix}`, name: 'Synthetic project', type: 'TESTING',
    managerId: member.user.id, createdById: member.user.id,
    members: { create: [{ userId: member.user.id, role: 'MEMBER', createdById: member.user.id }] } } });
  for (const status of ['CLEAN', 'INFECTED', 'FAILED', 'SKIPPED', 'PENDING']) {
    const file = await object(status); objects.set(status, file);
    const doc = await db.regulatoryDocument.create({ data: { dispatchNo: `RP14-${status}-${suffix}`,
      title: 'Synthetic document', createdById: member.user.id } }); documents.set(status, doc);
    await db.attachment.create({ data: { fileId: file.id, entityType: 'REGULATORY_DOCUMENT',
      entityId: doc.id, label: 'original', uploadedById: member.user.id } });
  }
});
after(async () => { await db.$disconnect(); });

test('T-RP-05 legal CLEAN member and elevated nonmember read all three aliases with real Bearer auth', async () => {
  const file = objects.get('CLEAN');
  for (const as of [member, elevated]) {
    for (const url of [`/files/${file.id}`, `/files/${file.id}/download`, `/regulatory-documents/${documents.get('CLEAN').id}/original-file`]) {
      const response = await request(as, url); assert.equal(response.status, 200, url);
      assert.equal(await response.text(), secretBody);
    }
  }
  const rows = await db.auditLog.findMany({ where: { actorId: elevated.user.id, entityId: file.id } });
  assert.ok(rows.filter((r) => r.metadata?.elevated === true).length >= 3);
  assert.ok(rows.every((r) => r.metadata?.permissionCode));
});

for (const status of ['INFECTED', 'FAILED', 'SKIPPED', 'PENDING']) {
  test(`T-RP-05 ${status} blocks member and elevated through all three aliases and records redacted denials`, async () => {
    const file = objects.get(status);
    for (const as of [member, elevated]) {
      for (const url of [`/files/${file.id}`, `/files/${file.id}/download`, `/regulatory-documents/${documents.get(status).id}/original-file`]) {
        const res = await request(as, url); assert.equal(res.status, 403, url);
        const text = await res.text(); assert.doesNotMatch(text, /synthetic-byte-body|synthetic-sensitive-name|rp14-policy\//);
      }
      const denials = (await db.auditLog.findMany({ where: { actorId: as.user.id, entityId: file.id, action: 'download' } }))
        .filter((r) => r.metadata?.denied);
      assert.equal(denials.length, 3);
      assert.ok(denials.every((r) => r.metadata.scanStatus === status && r.entityLabel === null));
      assert.doesNotMatch(JSON.stringify(denials.map((r) => r.metadata)), /synthetic-byte-body|synthetic-sensitive-name|storageKey/);
    }
    assert.equal((await db.fileObject.findUnique({ where: { id: file.id } })).scanStatus, status);
  });
}

test('T-RP-05 null undefined unknown and noncanonical states deny (pure policy; enum prevents DB representation)', () => {
  for (const status of [null, undefined, '', 'UNKNOWN', 'clean', ' CLEAN ']) assert.equal(decideFileRead(status).allow, false);
});

test('B12 ordinary nonmember cannot read metadata/bytes/delete; real existing CLEAN file survives', async () => {
  const file = objects.get('CLEAN');
  for (const [url, method] of [[`/files/${file.id}/metadata`, 'GET'], [`/files/${file.id}`, 'GET'],
    [`/files/${file.id}/download`, 'GET'], [`/files/${file.id}`, 'DELETE'],
    [`/regulatory-documents/${documents.get('CLEAN').id}/original-file`, 'GET']]) {
    const res = await request(outsider, url, method); assert.equal(res.status, 404, url);
    assert.doesNotMatch(await res.text(), /synthetic-byte-body/);
  }
  assert.equal((await db.fileObject.findUnique({ where: { id: file.id } })).deletedAt, null);
});

test('B12 metadata remains visible for every scan state to member/elevated and omits storageKey', async () => {
  for (const file of objects.values()) for (const as of [member, elevated]) {
    const response = await request(as, `/files/${file.id}/metadata`); assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.id, file.id); assert.equal(data.scanStatus, file.scanStatus);
    assert.equal(Object.hasOwn(data, 'storageKey'), false);
  }
});

test('B12 elevated context does not bypass missing system permissions; revoked member capability hides existing file', async () => {
  const noPermission = await actor('noperms', 'ADMIN', []);
  await db.projectMember.create({ data: { projectId: project.id, userId: noPermission.user.id, role: 'MEMBER' } });
  const file = objects.get('CLEAN');
  assert.equal((await request(noPermission, `/files/${file.id}`)).status, 403);
  // Deliberate trusted-context permission deficit only for SUPER_ADMIN, since
  // production RBAC grants its fixed permission set. This is not JWT evidence.
  const deniedSuper = createApp({ db, actorResolver: async () => ({ userId: elevated.user.id,
    user: elevated.user, systemRole: 'SUPER_ADMIN', permissions: [] }) });
  assert.equal((await deniedSuper.request(`/api/files/${file.id}/metadata`)).status, 403);
  await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member.user.id } },
    data: { leftAt: new Date() } });
  try { assert.equal((await request(member, `/files/${file.id}`)).status, 404); }
  finally { await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member.user.id } }, data: { leftAt: null } }); }
});

test('B12 member-owner/elevated deletion keeps existing policy even when scan is not CLEAN; unrelated member cannot delete', async () => {
  for (const as of [member, elevated]) {
    const file = await object('PENDING');
    const res = await request(as, `/files/${file.id}`, 'DELETE'); assert.equal(res.status, 200);
    assert.ok((await db.fileObject.findUnique({ where: { id: file.id } })).deletedAt);
  }
  const viewer = await actor('viewer');
  await db.projectMember.create({ data: { projectId: project.id, userId: viewer.user.id, role: 'VIEWER' } });
  const file = await object();
  assert.equal((await request(viewer, `/files/${file.id}`, 'DELETE')).status, 403);
  assert.equal((await db.fileObject.findUnique({ where: { id: file.id } })).deletedAt, null);
});

test('RP14 paths reject missing/deleted/outside-root files and never expose bytes; legacy original has unknown scan and is refused', async () => {
  assert.equal((await request(member, '/files/does-not-exist')).status, 404);
  const deleted = await object('CLEAN', { deletedAt: new Date() });
  assert.equal((await request(member, `/files/${deleted.id}`)).status, 404);
  const missing = await object(); await fs.rm(safeStoragePath(missing.storageKey));
  assert.equal((await request(member, `/files/${missing.id}`)).status, 404);
  const outside = await object();
  await db.fileObject.update({ where: { id: outside.id }, data: { storageKey: '../outside-private.txt' } });
  const res = await request(member, `/files/${outside.id}`); assert.equal(res.status, 403);
  assert.doesNotMatch(await res.text(), /outside-private|synthetic-byte-body/);
  const doc = await db.regulatoryDocument.create({ data: { dispatchNo: `RP14-legacy-${suffix}`, title: 'Legacy synthetic document' } });
  assert.equal((await request(member, `/regulatory-documents/${doc.id}/original-file`)).status, 403);
  const audits = await db.auditLog.findMany({ where: { entityId: doc.id, actorId: member.user.id } });
  assert.ok(audits.some((r) => r.metadata?.scanStatus === 'UNKNOWN' && r.metadata?.denied === 'FILE_SCAN_NOT_CLEAN'));
});

test('RP14 required denial/elevated audit failure cannot export bytes (fault-injected DB boundary)', async () => {
  const broken = new Proxy(db, { get(target, key) {
    if (key === 'auditLog') return new Proxy(target.auditLog, { get(model, prop) {
      if (prop === 'create') return async () => { throw new Error('synthetic audit write failure'); };
      const val = model[prop]; return typeof val === 'function' ? val.bind(model) : val;
    } });
    const val = target[key]; return typeof val === 'function' ? val.bind(target) : val;
  } });
  const faulty = createApp({ db: broken });
  for (const [as, file] of [[member, objects.get('FAILED')], [elevated, objects.get('CLEAN')]]) {
    const res = await request(as, `/files/${file.id}`, 'GET', faulty); assert.equal(res.status, 500);
    assert.doesNotMatch(await res.text(), /synthetic-byte-body|synthetic-sensitive-name/);
  }
});
