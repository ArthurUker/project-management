// Audit reproductions: assertions confirm defects, NOT acceptance of correct behavior.
// Requires a disposable backend build + dedicated PostgreSQL cluster under RDPMS_AUDIT_ROOT.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = process.env.RDPMS_AUDIT_ROOT;
assert(root && path.basename(root).startsWith('rdpms-deep-audit-'));
const cfg = JSON.parse(await fs.readFile(path.join(root, 'database.json'), 'utf8'));
const url = new URL(cfg.url);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/rdpms_audit_isolated');
process.env.DATABASE_URL = cfg.url;
process.env.DIRECT_URL = cfg.url;
process.env.JWT_SECRET = 'isolated-audit-key-never-used-for-real-accounts';
process.env.JWT_ACCESS_TTL = '15m';
process.env.UPLOAD_DIR = path.join(root, 'uploads');
const backend = path.join(root, 'backend');
const require = createRequire(path.join(backend, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
const [{ data_directory: dataDirectory }] = await db.$queryRawUnsafe('SHOW data_directory');
assert.equal(await fs.realpath(dataDirectory), await fs.realpath(path.join(root, 'pgdata')));
const { createApp } = await import(pathToFileURL(path.join(backend, 'dist/bootstrap/createApp.js')));
const results = [];
const password = 'Audit-Only-Strong!2026';
const passwordHash = await bcrypt.hash(password, 4);
const old = new Date('2026-01-01T00:00:00Z');
const user = async (id, systemRole = 'MEMBER') => db.user.create({ data: {
  id, username: id, displayName: id, passwordHash, systemRole,
}});
const actor = (u, permissions = [], systemRole = 'MEMBER') => ({
  userId: u.id, user: u, systemRole, permissions,
});
const project = async (id, manager, members = []) => db.project.create({ data: {
  id, code: id, name: id, type: 'TESTING', managerId: manager.id, updatedAt: old,
  members: { create: members.map(([u, role]) => ({ userId: u.id, role })) },
}});
async function request(who, method, resource, body, database = db, headers = {}) {
  const app = createApp({ db: database, ...(who ? { actorResolver: async () => who } : {}) });
  const response = await app.request(resource, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  return { status: response.status, body: parsed };
}
function wrapDb(overrides) {
  return new Proxy(db, { get(target, key) {
    if (key in overrides) return overrides[key];
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  }});
}
async function probe(id, fn) {
  try { const evidence = await fn(); results.push({ id, defectReproduced: true, evidence }); }
  catch (e) { results.push({ id, defectReproduced: false, error: e.stack }); }
}
const a = await user('audit-author');
const b = await user('audit-member');
const outsider = await user('audit-outsider');
const admin = await user('audit-admin', 'ADMIN');
const sa = await user('audit-super', 'SUPER_ADMIN');
await project('audit-project', a, [[a, 'OWNER'], [b, 'MEMBER']]);

await probe('B01_ADMIN_RESETS_SUPER_ADMIN', async () => {
  const permission = await db.permission.create({ data: { code: 'users.reset_password', name: 'reset', module: 'users' } });
  const role = await db.role.create({ data: { code: 'ADMIN', name: 'ADMIN', permissions: { create: { permissionId: permission.id } } } });
  await db.userRole.create({ data: { userId: admin.id, roleId: role.id } });
  const login = await request(null, 'POST', '/api/auth/login', { username: admin.username, password });
  assert.equal(login.status, 200);
  const resetPassword = 'Replaced-Audit!2026';
  const reset = await request(null, 'PUT', `/api/users/${sa.id}/reset-password`, { newPassword: resetPassword }, db,
    { Authorization: `Bearer ${login.body.accessToken}` });
  const loginAsSuper = await request(null, 'POST', '/api/auth/login', { username: sa.username, password: resetPassword });
  assert.equal(reset.status, 200); assert.equal(loginAsSuper.status, 200);
  assert.equal(loginAsSuper.body.user.systemRole, 'SUPER_ADMIN');
  const privileged = await request(null, 'GET', '/api/backup/restore/tables', undefined, db,
    { Authorization: `Bearer ${loginAsSuper.body.accessToken}` });
  assert.equal(privileged.status, 200);
  return { adminResetStatus: reset.status, newLoginRole: loginAsSuper.body.user.systemRole,
    mustChangePassword: loginAsSuper.body.user.mustChangePassword, privilegedEndpointStatus: privileged.status };
});

await probe('B02_PROJECT_NESTED_HARD_DELETE', async () => {
  const p = await project('audit-nested', a, [[b, 'MEMBER']]);
  const t = await db.task.create({ data: { projectId: p.id, title: 'important-task' } });
  const who = actor(b, ['projects.update']);
  const denied = await request(who, 'DELETE', `/api/tasks/${t.id}`);
  const accepted = await request(who, 'PUT', `/api/projects/${p.id}`, { name: p.name, tasks: [], milestones: [] });
  const remaining = await db.task.findUnique({ where: { id: t.id } });
  assert.equal(denied.status, 403); assert.equal(accepted.status, 200); assert.equal(remaining, null);
  return { dedicatedDeleteStatus: denied.status, nestedEditStatus: accepted.status, taskPhysicallyAbsent: !remaining };
});

await probe('B03_PROJECT_STATUS_UNDEFINED', async () => {
  const r = await request(actor(a, ['projects.update']), 'PUT', '/api/projects/audit-project', { status: 'IN_PROGRESS' });
  assert.equal(r.status, 400); assert.match(r.body.error, /undefined/);
  return r;
});

await probe('B04_SYNC_READ_WITHOUT_VIEW_PERMISSION', async () => {
  const t = await db.task.create({ data: { projectId: 'audit-project', title: 'confidential-title' } });
  const who = actor(b, []);
  const online = await request(who, 'GET', `/api/tasks/${t.id}`);
  const sync = await request(who, 'GET', '/api/sync/init');
  assert.equal(online.status, 403); assert.equal(sync.status, 200);
  assert(sync.body.changes.tasks.upserts.some(x => x.id === t.id));
  return { onlineStatus: online.status, syncStatus: sync.status, taskReadWithoutPermission: true };
});

await probe('B05_SYNC_REPLAY_SCOPE_AND_PAYLOAD', async () => {
  const t = await db.task.create({ data: { projectId: 'audit-project', title: 'original' } });
  const body = { deviceId: 'audit-device-a', changes: [{ clientMutationId: 'audit-cm-shared', entity: 'tasks', id: t.id, data: { title: 'first-content' } }] };
  const first = await request(actor(a, ['tasks.update']), 'POST', '/api/sync/push', body);
  const otherPayload = structuredClone(body); otherPayload.changes[0].data.title = 'second-content';
  const different = await request(actor(a, ['tasks.update']), 'POST', '/api/sync/push', otherPayload);
  const foreign = await request(actor(outsider, []), 'POST', '/api/sync/push', { ...body, deviceId: 'audit-device-outsider' });
  assert.equal(first.body.results[0].status, 'applied');
  assert.equal(different.body.results[0].replayed, true); assert.equal(foreign.body.results[0].replayed, true);
  const row = await db.task.findUnique({ where: { id: t.id } });
  assert.equal(row.title, 'first-content');
  return { differentPayloadResult: different.body.results[0], outsiderResult: foreign.body.results[0], storedTitle: row.title };
});

await probe('B06_SYNC_WRITE_RECEIPT_NOT_ATOMIC', async () => {
  const t = await db.task.create({ data: { projectId: 'audit-project', title: 'before' } });
  const faultDb = wrapDb({ syncMutation: {
    findMany: db.syncMutation.findMany.bind(db.syncMutation),
    upsert: async () => { throw new Error('AUDIT_INJECTED_RECEIPT_WRITE_FAILURE'); },
  }});
  const r = await request(actor(a, ['tasks.update']), 'POST', '/api/sync/push', {
    deviceId: 'audit-device-a', changes: [{ clientMutationId: 'audit-cm-fault', entity: 'tasks', id: t.id, data: { title: 'committed-despite-error' } }],
  }, faultDb);
  const row = await db.task.findUnique({ where: { id: t.id } });
  assert.equal(r.status, 500); assert.equal(row.title, 'committed-despite-error');
  assert.equal(await db.syncMutation.count({ where: { clientMutationId: 'audit-cm-fault' } }), 0);
  return { httpStatus: r.status, committedTitle: row.title, receiptCount: 0, fault: 'receipt persistence failure after real SQL write' };
});

await probe('B07_SYNC_PULL_CAP_LOSES_ROWS', async () => {
  const u = await user('audit-cap-user'); const p = await project('audit-cap-project', u, [[u, 'OWNER']]);
  await db.task.createMany({ data: Array.from({ length: 3001 }, (_, i) => ({ id: `audit-cap-${i}`, projectId: p.id, title: `task-${i}`, updatedAt: old })) });
  const first = await request(actor(u, ['tasks.view']), 'GET', '/api/sync/init');
  const next = await request(actor(u, ['tasks.view']), 'GET', `/api/sync/init?since=${encodeURIComponent(first.body.cursor)}`);
  assert.equal(first.body.changes.tasks.upserts.length, 3000); assert.equal(next.body.changes.tasks.upserts.length, 0);
  return { databaseRows: 3001, firstPullRows: 3000, nextPullRows: 0, cursor: first.body.cursor };
});

await probe('B08_SYNC_NEW_MEMBERSHIP_NO_BACKFILL', async () => {
  const u = await user('audit-new-member'); const p = await project('audit-new-membership', a);
  const t = await db.task.create({ data: { projectId: p.id, title: 'old-project-task', updatedAt: old } });
  const first = await request(actor(u, ['tasks.view']), 'GET', '/api/sync/init');
  await db.projectMember.create({ data: { userId: u.id, projectId: p.id, role: 'MEMBER' } });
  const next = await request(actor(u, ['tasks.view']), 'GET', `/api/sync/init?since=${encodeURIComponent(first.body.cursor)}`);
  assert(next.body.acl.projectIds.includes(p.id)); assert(!next.body.changes.tasks.upserts.some(x => x.id === t.id));
  assert(!next.body.changes.projects.upserts.some(x => x.id === p.id));
  return { aclIncludesNewProject: true, projectBackfilled: false, historicalTaskBackfilled: false };
});

await probe('B09_SYNC_ARCHIVE_WITHOUT_TRANSITION', async () => {
  const p = await project('audit-state-bypass', a, [[b, 'MEMBER']]);
  const r = await request(actor(b, ['projects.update']), 'POST', '/api/sync/push', {
    deviceId: 'audit-device-b', changes: [{ clientMutationId: 'audit-cm-archive', entity: 'projects', id: p.id, data: { status: 'ARCHIVED' } }],
  });
  const row = await db.project.findUnique({ where: { id: p.id } });
  assert.equal(row.status, 'ARCHIVED'); assert.equal(r.body.results[0].status, 'applied');
  return { from: 'PLANNING', to: row.status, actorPermissions: ['projects.update'], projectMemberRole: 'MEMBER' };
});

await probe('B10_REPORT_SUBMIT_STALE_SNAPSHOT', async () => {
  const report = await db.report.create({ data: { projectId: 'audit-project', authorId: a.id, reportType: 'DAILY', periodKey: '2026-09-29', content: { text: 'before' } } });
  let intercepted = false;
  const interleavedDb = wrapDb({ report: new Proxy(db.report, { get(target, key) {
    if (key === 'findUnique') return async args => {
      const row = await target.findUnique(args);
      if (!intercepted && args.where.id === report.id) {
        intercepted = true;
        await db.report.update({ where: { id: report.id }, data: { content: { text: 'concurrent-save' } } });
      }
      return row;
    };
    const v = target[key]; return typeof v === 'function' ? v.bind(target) : v;
  }}) });
  const r = await request(actor(a, ['reports.submit']), 'POST', `/api/reports/${report.id}/submit`, { clientMutationId: 'audit-submit-key' }, interleavedDb);
  const current = await db.report.findUnique({ where: { id: report.id }, include: { versions: true } });
  assert.equal(r.status, 200); assert.equal(current.content.text, 'concurrent-save'); assert.equal(current.versions[0].content.text, 'before');
  const again = await request(actor(a, ['reports.submit']), 'POST', `/api/reports/${report.id}/submit`, { clientMutationId: 'audit-submit-key-2' });
  assert.equal(again.status, 200);
  return { status: current.status, currentContent: current.content, submittedSnapshot: current.versions[0].content,
    resubmitWhileSubmittedStatus: again.status, controlledInterleaving: 'save after submit read, before submit transaction' };
});

await probe('B11_ORIGINAL_FILE_BYPASSES_INFECTED_BLOCK', async () => {
  await fs.mkdir(process.env.UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(process.env.UPLOAD_DIR, 'benign-probe.txt'), 'BENIGN_AUDIT_BYTES');
  const f = await db.fileObject.create({ data: { storageKey: 'benign-probe.txt', originalName: 'probe.txt', mimeType: 'text/plain', sizeBytes: 18, uploadedById: a.id,
    accessScope: 'SHARED_LIBRARY', sharedReadPermission: 'regulatory_documents.view', scanStatus: 'INFECTED' } });
  const doc = await db.regulatoryDocument.create({ data: { dispatchNo: 'AUDIT-REG-1', title: 'audit source', createdById: a.id } });
  await db.attachment.create({ data: { fileId: f.id, entityType: 'REGULATORY_DOCUMENT', entityId: doc.id, label: 'original' } });
  const who = actor(b, ['files.download', 'regulatory_documents.view']);
  const direct = await request(who, 'GET', `/api/files/${f.id}/download`);
  const original = await request(who, 'GET', `/api/regulatory-documents/${doc.id}/original-file`);
  assert.equal(direct.status, 403); assert.equal(original.status, 200); assert.equal(original.body, 'BENIGN_AUDIT_BYTES');
  return { directStatus: direct.status, originalStatus: original.status, byteFixture: 'benign text, no malware' };
});

await probe('B12_SUPER_ADMIN_PROJECT_FILE_DENIED', async () => {
  const f = await db.fileObject.create({ data: { storageKey: 'super-probe', originalName: 'project.txt', mimeType: 'text/plain', sizeBytes: 1,
    accessScope: 'PROJECT', ownerProjectId: 'audit-project', uploadedById: a.id } });
  const who = actor(sa, ['projects.view', 'files.download'], 'SUPER_ADMIN');
  const p = await request(who, 'GET', '/api/projects/audit-project');
  const r = await request(who, 'GET', `/api/files/${f.id}/metadata`);
  assert.equal(p.status, 200); assert.equal(r.status, 404);
  return { elevatedProjectStatus: p.status, projectFileStatus: r.status };
});

await probe('B13_RESTORE_SILENT_DUPLICATE_DROP', async () => {
  const data = ['audit-import-1', 'audit-import-2'].map(id => ({ id, username: 'audit-duplicate-name', displayName: id, passwordHash }));
  const body = { backup: { version: '2.0', data: { users: data } }, mode: 'merge' };
  const who = actor(sa, [], 'SUPER_ADMIN');
  const preview = await request(who, 'POST', '/api/backup/restore/preview', body);
  const restored = await request(who, 'POST', '/api/backup/restore', body);
  const actual = await db.user.count({ where: { id: { in: data.map(x => x.id) } } });
  assert.equal(preview.body.ok, true); assert.equal(restored.status, 200); assert.equal(restored.body.summary.created, 2); assert.equal(actual, 1);
  return { previewOk: true, reportedCreated: 2, actualCreated: actual };
});

await probe('B14_EXPIRED_LOCK_STILL_REJECTED', async () => {
  const u = await user('audit-locked');
  await db.user.update({ where: { id: u.id }, data: { status: 'LOCKED', lockedUntil: old, failedLoginAttempts: 5 } });
  const r = await request(null, 'POST', '/api/auth/login', { username: u.username, password });
  assert.equal(r.status, 403); assert.equal(r.body.code, 'ACCOUNT_LOCKED');
  return { ...r, lockedUntil: old.toISOString() };
});

await probe('B15_REFRESH_PARALLEL_REUSE', async () => {
  const raw = 'audit-refresh-token-never-valid-outside-disposable-db';
  const row = await db.refreshToken.create({ data: { userId: a.id, tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), familyId: 'audit-family', expiresAt: new Date(Date.now() + 3600000) } });
  let arrived = 0; let release; const barrier = new Promise(resolve => { release = resolve; });
  const concurrentDb = wrapDb({ refreshToken: new Proxy(db.refreshToken, { get(target, key) {
    if (key === 'findUnique') return async args => { const found = await target.findUnique(args); arrived++; if (arrived === 2) release(); await barrier; return found; };
    const v = target[key]; return typeof v === 'function' ? v.bind(target) : v;
  }}) });
  const before = await db.refreshToken.count({ where: { userId: a.id } });
  const pair = await Promise.all([1, 2].map(() => request(null, 'POST', '/api/auth/refresh', { refreshToken: raw }, concurrentDb)));
  assert.deepEqual(pair.map(x => x.status), [200, 200]);
  const after = await db.refreshToken.count({ where: { userId: a.id } });
  assert.equal(after - before, 2);
  const jwtPayload = JSON.parse(Buffer.from(pair[0].body.accessToken.split('.')[1], 'base64url').toString());
  return { statuses: pair.map(x => x.status), successorTokensCreated: 2, advertisedTtl: pair[0].body.expiresIn, signedTtl: jwtPayload.exp - jwtPayload.iat,
    controlledInterleaving: 'both reads finish before either revokes old token', sourceId: row.id };
});

await probe('B16_TASK_HTTP_IGNORES_BASELINE', async () => {
  const t = await db.task.create({ data: { projectId: 'audit-project', title: 'latest' } });
  const r = await request(actor(b, ['tasks.update']), 'PUT', `/api/tasks/${t.id}`, { title: 'stale-overwrite', expectedUpdatedAt: old.toISOString() });
  assert.equal(r.status, 200); assert.equal((await db.task.findUnique({ where: { id: t.id } })).title, 'stale-overwrite');
  return { status: r.status, submittedBaseline: old.toISOString(), serverBaseline: t.updatedAt.toISOString(), staleOverwriteAccepted: true };
});

await probe('B17_ROLE_CREATION_REJECTS_REQUIRED_CODE', async () => {
  const r = await request(actor(sa, ['roles.create'], 'SUPER_ADMIN'), 'POST', '/api/roles', { code: 'AUDIT_CUSTOM', name: 'audit role' });
  assert.equal(r.status, 400); assert.match(r.body.error, /code/); return r;
});

await probe('B18_PROJECT_CREATE_PARTIAL_COMMIT', async () => {
  const name = 'audit-partially-created';
  const r = await request(actor(a, ['projects.create']), 'POST', '/api/projects', { name, type: 'TESTING', tasks: [{ title: 'bad-assignee', assigneeId: 'audit-nonexistent-user' }] });
  assert.equal(r.status, 500);
  const p = await db.project.findFirst({ where: { name } }); assert(p);
  return { httpStatus: r.status, projectCommitted: true, taskCount: await db.task.count({ where: { projectId: p.id } }) };
});

await probe('B19_CROSS_PROJECT_PARENT_ACCEPTED', async () => {
  const foreign = await project('audit-foreign-parent', outsider, [[outsider, 'OWNER']]);
  const parent = await db.task.create({ data: { projectId: foreign.id, title: 'foreign-parent' } });
  const r = await request(actor(b, ['tasks.create']), 'POST', '/api/sync/push', {
    deviceId: 'audit-device-b', changes: [{ clientMutationId: 'audit-cross-parent', entity: 'tasks', id: 'audit-child', data: { projectId: 'audit-project', title: 'cross-child', parentId: parent.id } }],
  });
  assert.equal(r.body.results[0].status, 'applied');
  const child = await db.task.findUnique({ where: { id: 'audit-child' } });
  assert.equal(child.parentId, parent.id); assert.notEqual(child.projectId, parent.projectId);
  return { childProject: child.projectId, parentProject: parent.projectId, accepted: true };
});

await probe('B20_PROJECT_SOFT_DELETE_STILL_LISTED', async () => {
  const p = await project('audit-deleted-visible', a, [[a, 'OWNER']]);
  await db.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
  const who = actor(a, ['projects.view']);
  const list = await request(who, 'GET', '/api/projects?keyword=audit-deleted-visible');
  const detail = await request(who, 'GET', `/api/projects/${p.id}`);
  assert.equal(list.body.list.length, 1); assert.equal(detail.status, 404);
  return { listCount: 1, detailStatus: 404 };
});

await db.$disconnect();
const output = { executedAt: new Date().toISOString(), isolation: { database: 'rdpms_audit_isolated', dataDirectory, port: cfg.port },
  summary: { reproduced: results.filter(x => x.defectReproduced).length, notReproduced: results.filter(x => !x.defectReproduced).length }, results };
await fs.writeFile(path.join(root, 'backend-results.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.summary.notReproduced) process.exitCode = 1;
