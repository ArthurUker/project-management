/**
 * RF05 真实集成测试 —— 文件作用域与资源归属授权（专用隔离库 rdpms_test）
 *
 * 验收（06 §第一阶段 RF05）：
 *   1. 甲项目成员看不到乙文件（list / metadata / download / delete）；
 *   2. 上传者私有暂存隔离（同项目成员也看不到）；
 *   3. import-source（法规原文）同样受策略约束；
 *   4. 历史无归属不自动公开（未分类记录仅超管可见/可分类）。
 *
 * 另外覆盖：绑定业务实体后按项目授权（staging → visible）、删除被证据引用的文件被拒。
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// 必须在导入 storage/createApp 之前设置上传根目录（模块加载时读取）
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rf05-uploads-'));

const { PrismaClient } = await import('@prisma/client');
const { createApp } = await import('../../dist/bootstrap/createApp.js');
const { createStubActor } = await import('../helpers/stubDeps.mjs');
const { putObject, UPLOAD_ROOT } = await import('../../dist/kernel/storage.js');
const { applyBindToFile, resolveBindTarget } = await import('../../dist/modules/files/fileCommands.js');
const { IT, seedMinimalFixture, restoreAuthorMembership } = await import('./fixtures.mjs');

const prisma = new PrismaClient();

const AUTHOR = IT.userAuthor; // 项目一 OWNER + 项目二 managerId
const OTHER = IT.userOther; // 仅项目一 MEMBER（对项目二无权）
const SUPER = 'it-user-super';

const FILES_PERMS = ['files.upload', 'files.download', 'files.delete'];
const actor = (userId, permissions = FILES_PERMS, systemRole = 'MEMBER') =>
  createStubActor({ userId, displayName: `集成-${userId}`, permissions, systemRole });

const buildApp = (userId, permissions = FILES_PERMS, systemRole = 'MEMBER') =>
  createApp({ db: prisma, actorResolver: async () => actor(userId, permissions, systemRole) });

const createdFileIds = [];

/** 造一个真实文件（字节落盘 + FileObject 行） */
async function makeFile({ owner, accessScope = 'PRIVATE_STAGING', ownerProjectId = null, sharedReadPermission = null, classified = true }) {
  const buf = Buffer.from(`rf05-${crypto.randomUUID()}`);
  const row = await putObject(prisma, {
    buffer: buf,
    originalName: `rf05-${crypto.randomUUID().slice(0, 8)}.txt`,
    mimeType: 'text/plain',
    uploadedById: owner,
  });
  createdFileIds.push(row.id);
  return prisma.fileObject.update({
    where: { id: row.id },
    data: {
      accessScope,
      ownerUserId: owner,
      ownerProjectId,
      sharedReadPermission,
      classifiedAt: classified ? new Date() : null,
    },
  });
}

const jsonGet = (app, url) => app.request(url);
const listIds = async (app) => {
  const res = await jsonGet(app, '/api/files?pageSize=100');
  assert.equal(res.status, 200, `列表应 200，实际 ${res.status}`);
  const body = await res.json();
  return (body.list ?? []).map((r) => r.id);
};

before(async () => {
  await seedMinimalFixture(prisma);
  await restoreAuthorMembership(prisma);
  // 夹具补充：项目二给作者 MANAGER 成员资格——
  // 资源级授权（resolveProjectAccess）只认**成员关系**（managerId 只影响项目列表可见性），
  // 这里按同一口径准备夹具，OTHER 仍然不是项目二成员（这正是「甲看乙」的用例前提）。
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: IT.project2, userId: AUTHOR } },
    update: { leftAt: null, role: 'MANAGER' },
    create: { projectId: IT.project2, userId: AUTHOR, role: 'MANAGER' },
  });
});

beforeEach(async () => {
  await restoreAuthorMembership(prisma);
});

after(async () => {
  if (createdFileIds.length) {
    await prisma.attachment.deleteMany({ where: { fileId: { in: createdFileIds } } });
    await prisma.fileObject.deleteMany({ where: { id: { in: createdFileIds } } });
  }
  await prisma.regulatoryDocument.deleteMany({ where: { id: { startsWith: 'it-reg-' } } });
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
});

test('RF05-I1 项目文件的 list / metadata / download：非成员一律不可见，成员可读', async () => {
  const file = await makeFile({ owner: AUTHOR, accessScope: 'PROJECT', ownerProjectId: IT.project2 });
  const otherApp = buildApp(OTHER); // 仅项目一成员
  const authorApp = buildApp(AUTHOR);

  assert.equal((await listIds(otherApp)).includes(file.id), false, '非成员不得在列表中看到该项目文件');
  assert.equal((await listIds(authorApp)).includes(file.id), true, '项目负责人应能看到');

  assert.equal((await jsonGet(otherApp, `/api/files/${file.id}/metadata`)).status, 404, '非成员 metadata 应 404（隐藏存在性）');
  assert.equal((await jsonGet(otherApp, `/api/files/${file.id}/download`)).status, 404, '非成员下载应 404');
  assert.equal((await jsonGet(otherApp, `/api/files/${file.id}`)).status, 404, '前端使用的 /files/:id 也必须拒绝');

  const okMeta = await jsonGet(authorApp, `/api/files/${file.id}/metadata`);
  assert.equal(okMeta.status, 200, `成员 metadata 应 200，实际 ${okMeta.status}`);
  const dl = await jsonGet(authorApp, `/api/files/${file.id}/download`);
  assert.equal(dl.status, 200, `成员下载应 200，实际 ${dl.status}`);
});

test('RF05-I2 私有暂存隔离：同项目成员也不可见，仅上传人可读可删', async () => {
  const staged = await makeFile({ owner: AUTHOR, accessScope: 'PRIVATE_STAGING' });
  const otherApp = buildApp(OTHER);
  const authorApp = buildApp(AUTHOR);

  assert.equal((await listIds(otherApp)).includes(staged.id), false, '他人不得看到暂存文件');
  assert.equal((await jsonGet(otherApp, `/api/files/${staged.id}/metadata`)).status, 404);
  assert.equal((await jsonGet(otherApp, `/api/files/${staged.id}/download`)).status, 404);
  assert.equal((await otherApp.request(`/api/files/${staged.id}`, { method: 'DELETE' })).status, 404, '他人删除也应 404');

  assert.equal((await listIds(authorApp)).includes(staged.id), true, '上传人应看到自己的暂存');
  assert.equal((await jsonGet(authorApp, `/api/files/${staged.id}/download`)).status, 200);
  assert.equal((await authorApp.request(`/api/files/${staged.id}`, { method: 'DELETE' })).status, 200, '上传人可删除自己的暂存');
});

test('RF05-I3 历史无归属不自动公开：普通用户 404，超管可读并可列出待分类清单', async () => {
  // 模拟历史脏数据：既无 owner 也无上传者（迁移后保持未分类）
  const legacy = await prisma.fileObject.create({
    data: {
      storageKey: `2026/${crypto.randomUUID()}-legacy.txt`,
      originalName: 'legacy.txt',
      mimeType: 'text/plain',
      sizeBytes: 3,
      uploadedById: null,
      accessScope: 'PRIVATE_STAGING',
      ownerUserId: null,
      classifiedAt: null,
    },
  });
  createdFileIds.push(legacy.id);

  const otherApp = buildApp(OTHER);
  const superApp = buildApp(SUPER, [...FILES_PERMS, 'files.download'], 'SUPER_ADMIN');

  assert.equal((await jsonGet(otherApp, `/api/files/${legacy.id}/metadata`)).status, 404, '历史无归属不得自动公开');
  assert.equal((await listIds(otherApp)).includes(legacy.id), false);
  assert.equal((await jsonGet(superApp, `/api/files/${legacy.id}/metadata`)).status, 200, '超管可读以完成人工分类');

  const pending = await jsonGet(superApp, '/api/files?needsClassification=true&pageSize=100');
  assert.equal(pending.status, 200);
  const pendingBody = await pending.json();
  assert.ok((pendingBody.list ?? []).some((r) => r.id === legacy.id), '待分类清单应包含该文件');
  assert.equal(
    (await jsonGet(otherApp, '/api/files?needsClassification=true')).status,
    403,
    '非超管不得列出待分类清单',
  );
});

test('RF05-I4 绑定到项目后按项目授权（staging → visible）', async () => {
  const staged = await makeFile({ owner: AUTHOR, accessScope: 'PRIVATE_STAGING' });
  const otherApp = buildApp(OTHER);
  assert.equal((await jsonGet(otherApp, `/api/files/${staged.id}/metadata`)).status, 404, '绑定前他人不可见');

  await prisma.attachment.create({
    data: { fileId: staged.id, entityType: 'TASK', entityId: IT.task, label: 'attachment', uploadedById: AUTHOR },
  });
  const resolution = await resolveBindTarget(prisma, 'TASK', IT.task);
  assert.equal(resolution.scope, 'PROJECT');
  assert.equal(resolution.projectId, IT.project, '任务附件应归属任务所在项目');
  await applyBindToFile(prisma, staged.id, resolution, AUTHOR);

  const bound = await prisma.fileObject.findUnique({ where: { id: staged.id } });
  assert.equal(bound.accessScope, 'PROJECT');
  assert.equal(bound.ownerProjectId, IT.project);
  assert.ok(bound.classifiedAt, '绑定即完成分类（不再是未分类）');
  assert.equal((await jsonGet(otherApp, `/api/files/${staged.id}/metadata`)).status, 200, '绑定后同项目成员可读');
});

test('RF05-I5 import-source（法规原文）同样受限：未绑定 → 404，绑定共享库 → 有权限者 200', async () => {
  const docId = `it-reg-${crypto.randomUUID().slice(0, 8)}`;
  await prisma.regulatoryDocument.create({
    data: { id: docId, dispatchNo: `RF05-${crypto.randomUUID().slice(0, 6)}`, title: 'RF05 测试法规' },
  });

  const staged = await makeFile({ owner: AUTHOR, accessScope: 'PRIVATE_STAGING' });
  await prisma.attachment.create({
    data: { fileId: staged.id, entityType: 'REGULATORY_DOCUMENT', entityId: docId, label: 'original', uploadedById: AUTHOR },
  });

  const viewerApp = buildApp(OTHER, ['files.download', 'regulatory_documents.view']);
  const noPermApp = buildApp(OTHER, ['files.download']);

  assert.equal(
    (await jsonGet(viewerApp, `/api/regulatory-documents/${docId}/original-file`)).status,
    404,
    '未绑定（仍是私有暂存）的原文不得因存在附件关系而放行',
  );
  assert.equal(
    (await jsonGet(noPermApp, `/api/regulatory-documents/${docId}/original-file`)).status,
    403,
    '无 regulatory_documents.view 一律拒绝',
  );

  const resolution = await resolveBindTarget(prisma, 'REGULATORY_DOCUMENT', docId);
  assert.equal(resolution.scope, 'SHARED_LIBRARY');
  assert.equal(resolution.sharedReadPermission, 'regulatory_documents.view');
  await applyBindToFile(prisma, staged.id, resolution, AUTHOR);

  assert.equal(
    (await jsonGet(viewerApp, `/api/regulatory-documents/${docId}/original-file`)).status,
    200,
    '绑定共享库后，持声明权限的用户可读原文',
  );
  const docList = await jsonGet(viewerApp, '/api/regulatory-documents?pageSize=100');
  assert.equal(docList.status, 200, '法规列表仍应正常（元数据回填走策略）');
});

test('RF05-I6 删除被证据引用的文件被拒绝（只允许撤销非证据关联）', async () => {
  const docId = `it-reg-${crypto.randomUUID().slice(0, 8)}`;
  await prisma.regulatoryDocument.create({
    data: { id: docId, dispatchNo: `RF05E-${crypto.randomUUID().slice(0, 6)}`, title: 'RF05 证据引用' },
  });
  const file = await makeFile({ owner: AUTHOR, accessScope: 'PRIVATE_STAGING' });
  await prisma.attachment.create({
    data: { fileId: file.id, entityType: 'REGULATORY_DOCUMENT', entityId: docId, label: 'original', uploadedById: AUTHOR },
  });

  const res = await buildApp(AUTHOR).request(`/api/files/${file.id}`, { method: 'DELETE' });
  assert.equal(res.status, 409, `被证据引用的文件不得整体删除，实际 ${res.status}`);
  const body = await res.json();
  assert.equal(body.code, 'FILE_REFERENCED_BY_EVIDENCE');
  const still = await prisma.fileObject.findUnique({ where: { id: file.id } });
  assert.equal(still.deletedAt, null, '文件必须仍然存在');
});

test('RF05-I7 人工分类（超管）：未分类历史文件可被明确归类为项目/共享库', async () => {
  const legacy = await prisma.fileObject.create({
    data: {
      storageKey: `2026/${crypto.randomUUID()}-legacy2.txt`,
      originalName: 'legacy2.txt',
      mimeType: 'text/plain',
      sizeBytes: 3,
      accessScope: 'PRIVATE_STAGING',
      ownerUserId: null,
      classifiedAt: null,
    },
  });
  createdFileIds.push(legacy.id);

  const superApp = buildApp(SUPER, [...FILES_PERMS], 'SUPER_ADMIN');
  const patched = await superApp.request(`/api/files/${legacy.id}/scope`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'PROJECT', ownerProjectId: IT.project }),
  });
  assert.equal(patched.status, 200, `超管分类应成功，实际 ${patched.status}`);
  const row = await prisma.fileObject.findUnique({ where: { id: legacy.id } });
  assert.equal(row.accessScope, 'PROJECT');
  assert.equal(row.ownerProjectId, IT.project);
  assert.ok(row.classifiedAt, '分类时间必须写入');

  const otherApp = buildApp(OTHER);
  assert.equal((await jsonGet(otherApp, `/api/files/${legacy.id}/metadata`)).status, 200, '分类后按项目授权生效');

  const forbiddenPatch = await otherApp.request(`/api/files/${legacy.id}/scope`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'PUBLIC' }),
  });
  assert.equal(forbiddenPatch.status, 403, '非超管不得调整作用域');
});
