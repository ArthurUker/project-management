import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { safeStoragePath } from '../../src/kernel/storage.js';

// Requires a newly created task-owned PostgreSQL database and task-owned UPLOAD_DIR.
const prisma = new PrismaClient();
let actor;
let docs = [];
let files = [];

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const suffix = crypto.randomUUID();
  actor = await prisma.user.create({ data: {
    id: `rp14t01-${suffix}`,
    username: `rp14t01-${suffix}`,
    displayName: 'RP14-T01 synthetic actor',
    passwordHash: 'not-a-real-password-hash',
    systemRole: 'ADMIN',
    status: 'ACTIVE',
  } });

  for (const scanStatus of ['INFECTED', 'CLEAN']) {
    const file = await createFile(suffix, scanStatus);
    files.push(file);
    const doc = await prisma.regulatoryDocument.create({ data: {
      dispatchNo: `RP14-${scanStatus}-${suffix}`,
      title: `RP14 ${scanStatus} synthetic document`,
      createdById: actor.id,
    } });
    docs.push(doc);
    await prisma.attachment.create({ data: {
      fileId: file.id,
      entityType: 'REGULATORY_DOCUMENT',
      entityId: doc.id,
      label: 'original',
      uploadedById: actor.id,
    } });
  }
});

async function createFile(suffix, scanStatus) {
  const storageKey = `rp14t01/${suffix}-${scanStatus}.txt`;
  const body = Buffer.from(`synthetic ${scanStatus} content`);
  await fs.mkdir(path.dirname(safeStoragePath(storageKey)), { recursive: true });
  await fs.writeFile(safeStoragePath(storageKey), body);
  return prisma.fileObject.create({ data: {
    storageKey,
    originalName: `${scanStatus}.txt`,
    mimeType: 'text/plain',
    sizeBytes: body.length,
    checksum: crypto.createHash('sha256').update(body).digest('hex'),
    scanStatus,
    scannedAt: new Date(),
    uploadedById: actor.id,
    ownerUserId: actor.id,
    accessScope: 'SHARED_LIBRARY',
    sharedReadPermission: 'regulatory_documents.view',
    classifiedAt: new Date(),
  } });
}

after(async () => {
  await prisma.attachment.deleteMany({ where: { fileId: { in: files.map((f) => f.id) } } });
  await prisma.regulatoryDocument.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await prisma.fileObject.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  for (const file of files) await fs.rm(safeStoragePath(file.storageKey), { force: true });
  await prisma.$disconnect();
});

const app = () => createApp({ db: prisma, actorResolver: async () => ({
  userId: actor.id,
  user: { id: actor.id, username: actor.username, displayName: actor.displayName },
  systemRole: 'ADMIN',
  permissions: ['files.download', 'regulatory_documents.view'],
}) });

test('RP14-T01 INFECTED content is refused by both file aliases and regulatory original-file alias', async () => {
  const server = app();
  for (const path of [`/files/${files[0].id}`, `/files/${files[0].id}/download`, `/regulatory-documents/${docs[0].id}/original-file`]) {
    const response = await server.request(`/api${path}`);
    assert.equal(response.status, 403, path);
    assert.doesNotMatch(await response.text(), /synthetic INFECTED content/);
  }
  const denied = await prisma.auditLog.count({ where: {
    actorId: actor.id,
    entityId: files[0].id,
    action: 'download',
  } });
  assert.ok(denied >= 3, 'all denied read aliases must leave a download audit event');
});

test('RP14-T01 CLEAN member fixture succeeds through file and regulatory original-file aliases', async () => {
  const server = app();
  for (const path of [`/files/${files[1].id}`, `/files/${files[1].id}/download`, `/regulatory-documents/${docs[1].id}/original-file`]) {
    const response = await server.request(`/api${path}`);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /synthetic CLEAN content/);
  }
});
