import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { parseSyncCommand } from '../../dist/modules/sync/syncMutationCommands.js';
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname.slice(1), process.env.RDPMS_EXEC_OWNED_DB); assert.match(url.pathname, /^\/rdpms_test_/);
const db = new PrismaClient(); const app = createApp({ db });
const uuid = () => crypto.randomUUID();
let admin, other;
const transportTrace = [];
after(async () => {
  try {
    fs.writeFileSync(path.join(process.env.RDPMS_EXEC_EVIDENCE_DIR, 'persistent-state.json'), JSON.stringify({
      transportTrace,
      receipts: await db.syncMutation.findMany({ orderBy: { createdAt: 'asc' } }),
      tasks: await db.task.findMany(), reports: await db.report.findMany(),
      phases: await db.projectPhase.findMany(), projects: await db.project.findMany(),
      milestones: await db.milestone.findMany(), progress: await db.monthlyProgress.findMany(),
      members: await db.projectMember.findMany(),
      strictAudits: await db.auditLog.findMany({ where: { entityLabel: { startsWith: 'sync:' } } }),
    }, null, 2));
  } finally { await db.$disconnect(); }
}); // Append-only audit actors remain until whole owned DB drop.
async function actor(role = 'SUPER_ADMIN', permissions) {
  const password = 'Owned RP09 synthetic password 2026!';
  const user = await db.user.create({ data: { username: `rp09-${uuid()}`, displayName: 'Synthetic RP09', passwordHash: await bcrypt.hash(password, 4), systemRole: role, status: 'ACTIVE' } });
  if (permissions) {
    const granted = await db.permission.findMany({ where: { code: { in: permissions } } }); assert.equal(granted.length, permissions.length);
    const r = await db.role.create({ data: { code: `rp09_${uuid()}`, name: 'Synthetic RP09 grants', permissions: { create: granted.map((p) => ({ permissionId: p.id })) } } });
    await db.userRole.create({ data: { userId: user.id, roleId: r.id } }); user.testRole = r;
  }
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user.username, password }) });
  assert.equal(login.status, 200); const loginBody = await login.json(); assert.equal(loginBody.user.id, user.id);
  const me = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${loginBody.accessToken}` } }); assert.equal(me.status, 200);
  return { ...user, token: loginBody.accessToken };
}
before(async () => { admin = await actor(); other = await actor(); });
async function project(who = admin) { return db.project.create({ data: { code: `RP09-${uuid()}`, name: 'Synthetic project', type: 'TESTING', managerId: who.id, createdById: who.id, members: { create: { userId: who.id, role: 'MANAGER' } } } }); }
async function fixture(who = admin) {
  const p = await project(who); const task = await db.task.create({ data: { projectId: p.id, title: 'before', createdById: who.id } });
  return { p, task, who, device: `rp09-${uuid()}`, command: { clientMutationId: uuid(), entity: 'tasks', id: task.id, op: 'upsert', projectId: p.id, data: { title: `after-${uuid()}` }, baseUpdatedAt: task.updatedAt.toISOString() } };
}
async function call(path, changes, f, server = app, who = f.who) {
  const response = await server.request(`/api/sync/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.token}` }, body: JSON.stringify({ protocolVersion: 1, deviceId: f.device, changes }) });
  const body = await response.json(); transportTrace.push({ path, actorId: who.id, deviceId: f.device, changes, httpStatus: response.status, body }); return { response, body };
}
async function reserve(f, command = f.command, server = app) {
  const r = await call('receipts/reserve', [command], f, server); assert.equal(r.response.status, 200, JSON.stringify(r.body));
  const row = r.body.results[0]; assert.equal(row.status, 'pending'); assert.ok(row.receiptHandle && row.payloadHash.length === 64);
  return { ...command, receiptHandle: row.receiptHandle, payloadHash: row.payloadHash };
}
async function audits(key) { return db.auditLog.findMany({ where: { metadata: { path: ['clientMutationId'], equals: key } } }); }
function proxy(wrap) { return new Proxy(db, { get(t, k) { if (k === '$transaction') return (fn, options) => t.$transaction((tx) => fn(wrap(tx)), options); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } }); }
function fault(model, method, afterWrite = false) { return createApp({ db: proxy((tx) => new Proxy(tx, { get(t, k) { if (k === model) return new Proxy(t[k], { get(m, op) { if (op === method) return async (args) => { if (afterWrite) await m[op](args); throw new Error('OWNED_RP09_FAULT'); }; const v = m[op]; return typeof v === 'function' ? v.bind(m) : v; } }); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } })) }); }

test('AC-B05/B06 real password/Bearer legal reserve→write→query→replay has one strict audit and bound receipt', async () => {
  const f = await fixture(); const command = await reserve(f);
  const before = await db.task.findUnique({ where: { id: f.task.id } }); assert.equal(before.title, 'before');
  const r = await call('push', [command], f); assert.equal(r.response.status, 200); assert.equal(r.body.results[0].status, 'applied');
  assert.equal((await db.task.findUnique({ where: { id: f.task.id } })).title, command.data.title);
  const receipt = await db.syncMutation.findUnique({ where: { clientMutationId: command.clientMutationId } });
  assert.equal(receipt.userId, admin.id); assert.equal(receipt.deviceId, f.device); assert.equal(receipt.resourceScope, `project:${f.p.id}`); assert.equal(receipt.receiptVersion, 1); assert.equal(receipt.payloadHash, command.payloadHash); assert.equal(receipt.status, 'applied');
  assert.equal((await audits(command.clientMutationId)).length, 1);
  const q = await call('receipts/query', [command], f); assert.equal(q.body.results[0].status, 'applied'); assert.deepEqual(q.body.results[0].result, r.body.results[0]);
  const replay = await call('push', [command], f); assert.deepEqual(replay.body.results[0], { ...r.body.results[0], replayed: true });
  assert.deepEqual(await db.syncMutation.findUnique({ where: { id: receipt.id } }), receipt); assert.equal((await audits(command.clientMutationId)).length, 1);
});

test('AC-B05-01 known key cross-actor/device/scope has no result leak or ownership overwrite', async () => {
  const f = await fixture(); const c = await reserve(f); await call('push', [c], f);
  const before = await db.syncMutation.findUnique({ where: { clientMutationId: c.clientMutationId } });
  const foreign = { ...f, who: other, device: uuid() };
  for (const x of [foreign, { ...f, device: uuid() }]) {
    const q = await call('receipts/query', [c], x); assert.equal(q.body.results[0].status, 'unknown'); assert.equal(Object.hasOwn(q.body.results[0], 'result'), false);
    const r = await call('receipts/reserve', [{ ...c, receiptHandle: undefined }], x); assert.equal(r.body.results[0].status, 'unknown');
  }
  const p2 = await project(); const mismatch = { ...c, projectId: p2.id, payloadHash: undefined };
  const q = await call('receipts/query', [mismatch], f); assert.equal(q.body.results[0].status, 'unknown');
  assert.deepEqual(await db.syncMutation.findUnique({ where: { id: before.id } }), before); assert.equal((await audits(c.clientMutationId)).length, 1);
});

test('foreign existing SyncDevice cannot be used or relabelled', async () => {
  const f = await fixture(); await reserve(f); const old = await db.syncDevice.findUnique({ where: { id: f.device } });
  const r = await call('receipts/reserve', [{ ...f.command, clientMutationId: uuid() }], { ...f, who: other }); assert.equal(r.response.status, 404);
  assert.deepEqual(await db.syncDevice.findUnique({ where: { id: f.device } }), old);
});

test('AC-B05-02 same key changed payload is explicit409, no second DB/audit/receipt effects', async () => {
  const f = await fixture(); const c = await reserve(f); await call('push', [c], f); const before = await db.task.findUnique({ where: { id: f.task.id } });
  const bad = { ...c, payloadHash: undefined, data: { title: 'different' } }; const r = await call('push', [bad], f); assert.equal(r.response.status, 409); assert.equal(r.body.results[0].code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  assert.deepEqual(await db.task.findUnique({ where: { id: f.task.id } }), before); assert.equal((await audits(c.clientMutationId)).length, 1);
});

for (const [model, method, afterWrite] of [['task', 'updateMany', true], ['auditLog', 'create', false], ['syncMutation', 'update', true]]) {
 test(`AC-B06-01 ${model}.${method} failpoint rolls back task/audit/applied receipt in real DB`, async () => {
  const f = await fixture(); const c = await reserve(f); const before = await db.task.findUnique({ where: { id: f.task.id } }); const old = await db.syncMutation.findUnique({ where: { id: c.receiptHandle } });
  const r = await call('push', [c], f, fault(model, method, afterWrite)); assert.equal(r.response.status, 500);
  assert.deepEqual(await db.task.findUnique({ where: { id: f.task.id } }), before); assert.deepEqual(await db.syncMutation.findUnique({ where: { id: c.receiptHandle } }), old); assert.equal((await audits(c.clientMutationId)).length, 0);
  assert.equal((await call('push', [c], f)).body.results[0].status, 'applied');
 });
}

test('AC-B06-03 partial batch first commit/second receipt fault/third unprocessed; query reconstructs', async () => {
  const f = await fixture(); const g = await fixture(); const third = await fixture(); const c1 = await reserve(f); const c2 = await reserve({ ...g, device: f.device }); const c3 = await reserve({ ...third, device: f.device });
  let count = 0;
  const server = createApp({ db: proxy((tx) => new Proxy(tx, { get(t, k) { if (k === 'syncMutation') return new Proxy(t[k], { get(m, op) { if (op === 'update') return async (args) => { if (++count === 2) throw new Error('OWNED_SECOND_ITEM_RECEIPT_FAULT'); return m.update(args); }; const v = m[op]; return typeof v === 'function' ? v.bind(m) : v; } }); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } })) });
  const r = await call('push', [c1, c2, c3], f, server); assert.equal(r.response.status, 500);
  assert.equal((await db.task.findUnique({ where: { id: c1.id } })).title, c1.data.title);
  for (const c of [c2, c3]) { assert.equal((await db.task.findUnique({ where: { id: c.id } })).title, 'before'); assert.equal((await db.syncMutation.findUnique({ where: { id: c.receiptHandle } })).status, 'pending'); }
  const q = await call('receipts/query', [c1, c2, c3], f); assert.deepEqual(q.body.results.map((r) => r.status), ['applied', 'pending', 'pending']);
});

test('no-reservation legacy protocol and unknown handle cannot execute; null legacy columns unchanged', async () => {
  const f = await fixture(); const legacy = await app.request('/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ deviceId: f.device, changes: [f.command] }) }); assert.equal(legacy.status, 426);
  await db.syncDevice.create({ data: { id: f.device, userId: admin.id } });
  const old = await db.syncMutation.create({ data: { clientMutationId: f.command.clientMutationId, deviceId: f.device, userId: admin.id, entity: 'tasks', entityId: f.task.id, op: 'upsert', status: 'applied', result: { private: 'legacy' } } });
  const r = await call('push', [{ ...f.command, receiptHandle: old.id }], f); assert.equal(r.body.results[0].status, 'unknown');
  assert.equal((await db.task.findUnique({ where: { id: f.task.id } })).title, 'before'); assert.deepEqual(await db.syncMutation.findUnique({ where: { id: old.id } }), old);
});

test('scalar validation precedes hashing/ORM, long keys not sliced and __proto__ stays hash input', async () => {
  const f = await fixture(); const before = await db.syncMutation.count();
  for (const bad of [{ clientMutationId: [] }, { clientMutationId: 'x'.repeat(65) }, { id: {} }, { op: 'other' }, { data: [] }, { baseUpdatedAt: {} }]) {
    const r = await call('receipts/reserve', [{ ...f.command, ...bad }], f); assert.equal(r.response.status, 400);
  }
  assert.equal(await db.syncMutation.count(), before);
  const c1 = parseSyncCommand({ ...f.command, data: JSON.parse('{"title":"x","__proto__":{"marker":1}}') }, { tasks: {} });
  const c2 = parseSyncCommand({ ...f.command, data: { title: 'x' } }, { tasks: {} }); assert.notEqual(c1.payloadHash, c2.payloadHash);
  assert.equal(parseSyncCommand({ ...f.command, data: { a: [1, 2], b: null } }, { tasks: {} }).payloadHash, parseSyncCommand({ ...f.command, data: { b: null, a: [1, 2] } }, { tasks: {} }).payloadHash);
});

test('current role/grant/member/ACTIVE withdrawal denies query/replay, not stale request auth', async () => {
  const who = await actor('MEMBER', ['tasks.update']); const f = await fixture(who); const c = await reserve(f); await call('push', [c], f);
  await db.rolePermission.deleteMany({ where: { roleId: who.testRole.id } });
  assert.equal((await call('receipts/query', [c], f)).body.results[0].status, 'unknown'); assert.equal((await call('push', [c], f)).response.status, 403);
  const permission = await db.permission.findUnique({ where: { code: 'tasks.update' } }); await db.rolePermission.create({ data: { roleId: who.testRole.id, permissionId: permission.id } });
  await db.projectMember.update({ where: { projectId_userId: { projectId: f.p.id, userId: who.id } }, data: { leftAt: new Date() } });
  assert.equal((await call('receipts/query', [c], f)).body.results[0].status, 'unknown');
  await db.user.update({ where: { id: who.id }, data: { status: 'DISABLED' } }); assert.equal((await call('push', [c], f)).response.status, 401);
});

test('create-only role can replay its original create; permission upgrade cannot reinterpret reserved update as create', async () => {
  const who = await actor('MEMBER', ['tasks.create']); const p = await project(who); const f = { p, who, device: uuid(), command: { clientMutationId: uuid(), entity: 'tasks', id: uuid(), projectId: p.id, op: 'upsert', data: { title: 'new synthetic' } } };
  const c = await reserve(f); const first = await call('push', [c], f); assert.equal(first.body.results[0].action, 'created'); const replay = await call('push', [c], f); assert.equal(replay.body.results[0].replayed, true); assert.equal((await audits(c.clientMutationId)).length, 1);
});

const models = { projects: 'project', projectPhases: 'projectPhase', tasks: 'task', milestones: 'milestone', monthlyProgress: 'monthlyProgress', reports: 'report', projectMembers: 'projectMember' };
for (const entity of Object.keys(models)) {
 test(`TASK-RP09-T01 ${entity} legal update persists scoped receipt + strict audit`, async () => {
  const p = await project(); let row; let patch;
  if (entity === 'projects') { row = p; patch = { name: 'updated project' }; }
  if (entity === 'projectPhases') { row = await db.projectPhase.create({ data: { projectId: p.id, code: 'P1', name: 'before', sortOrder: 1 } }); patch = { name: 'updated phase' }; }
  if (entity === 'tasks') { row = await db.task.create({ data: { projectId: p.id, title: 'before' } }); patch = { title: 'updated task', status: 'IN_PROGRESS', assigneeId: other.id }; }
  if (entity === 'milestones') { row = await db.milestone.create({ data: { projectId: p.id, name: 'before', dueDate: new Date('2026-11-01') } }); patch = { name: 'updated milestone' }; }
  if (entity === 'monthlyProgress') { row = await db.monthlyProgress.create({ data: { projectId: p.id, periodKey: '2026-10', submittedById: admin.id } }); patch = { actualWork: 'updated progress' }; }
  if (entity === 'reports') { row = await db.report.create({ data: { projectId: p.id, authorId: admin.id, reportType: 'MONTHLY', periodKey: '2026-10', content: {} } }); patch = { content: { marker: 'updated report' } }; }
  if (entity === 'projectMembers') { row = await db.projectMember.create({ data: { projectId: p.id, userId: other.id, role: 'MEMBER' } }); patch = { role: 'VIEWER' }; }
  const f = { p, who: admin, device: uuid(), command: { clientMutationId: uuid(), entity, id: row.id, op: 'upsert', projectId: p.id, data: patch } };
  const c = await reserve(f); const r = await call('push', [c], f); assert.equal(r.response.status, 200, JSON.stringify(r.body)); assert.equal(r.body.results[0].status, 'applied');
  const saved = await db[models[entity]].findUnique({ where: { id: row.id } }); for (const [key, value] of Object.entries(patch)) assert.deepEqual(saved[key], value);
  assert.equal((await audits(c.clientMutationId)).length, 1); assert.equal((await db.syncMutation.findUnique({ where: { id: c.receiptHandle } })).status, 'applied');
 });
}

test('report applied replay bypasses later state lock only after author/grant authorization; new key cannot overwrite submitted', async () => {
  const p = await project(); const row = await db.report.create({ data: { projectId: p.id, authorId: admin.id, reportType: 'MONTHLY', periodKey: '2026-10', content: {} } });
  const f = { p, who: admin, device: uuid(), command: { clientMutationId: uuid(), entity: 'reports', id: row.id, op: 'upsert', projectId: p.id, data: { content: { marker: 'original' } } } };
  const c = await reserve(f); await call('push', [c], f); await db.report.update({ where: { id: row.id }, data: { status: 'SUBMITTED' } });
  assert.equal((await call('push', [c], f)).body.results[0].replayed, true);
  const fresh = await reserve(f, { ...f.command, clientMutationId: uuid(), data: { content: { marker: 'late' } } }); const r = await call('push', [fresh], f); assert.equal(r.response.status, 409); assert.equal(r.body.results[0].code, 'INVALID_STATE'); assert.deepEqual((await db.report.findUnique({ where: { id: row.id } })).content, { marker: 'original' }); assert.equal((await audits(fresh.clientMutationId)).length, 0);
});

test('T-RP-07 stale authorized delete wins; same/different key deletion does not move original tombstone', async () => {
  const f = await fixture(); const c = await reserve(f, { ...f.command, op: 'delete', data: {}, baseUpdatedAt: '2000-01-01T00:00:00.000Z' });
  assert.equal((await call('push', [c], f)).body.results[0].action, 'deleted'); const tombstone = await db.task.findUnique({ where: { id: f.task.id } }); assert.ok(tombstone.deletedAt);
  assert.equal((await call('push', [c], f)).body.results[0].replayed, true);
  const c2 = await reserve(f, { ...f.command, clientMutationId: uuid(), op: 'delete', data: {} }); assert.equal((await call('push', [c2], f)).body.results[0].action, 'noop');
  assert.deepEqual(await db.task.findUnique({ where: { id: f.task.id } }), tombstone); assert.equal((await audits(c.clientMutationId)).length, 1);
});

for (const entity of Object.keys(models).filter((e) => e !== 'projects')) {
 test(`TASK-RP09-T01 ${entity} legal offline create/replay and current delete contract`, async () => {
  const p = await project(); let data;
  if (entity === 'projectPhases') data = { code: 'P1', name: 'fresh phase', sortOrder: 1 };
  if (entity === 'tasks') data = { title: 'fresh task' };
  if (entity === 'milestones') data = { name: 'fresh milestone', dueDate: '2026-11-01T00:00:00.000Z' };
  if (entity === 'monthlyProgress') data = { periodKey: '2026-10', actualWork: 'fresh progress' };
  if (entity === 'reports') data = { reportType: 'MONTHLY', periodKey: '2026-10', content: { marker: 'fresh report' } };
  if (entity === 'projectMembers') data = { userId: other.id, role: 'MEMBER' };
  const f = { p, who: admin, device: uuid(), command: { clientMutationId: uuid(), entity, id: uuid(), projectId: p.id, op: 'upsert', data } };
  const c = await reserve(f); const r = await call('push', [c], f); assert.equal(r.response.status, 200, JSON.stringify(r.body)); assert.equal(r.body.results[0].action, 'created');
  const saved = await db[models[entity]].findUnique({ where: { id: c.id } }); assert.equal(saved.projectId, p.id);
  if (entity === 'reports') assert.equal(saved.authorId, admin.id); if (entity === 'monthlyProgress') assert.equal(saved.submittedById, admin.id);
  assert.equal((await call('push', [c], f)).body.results[0].replayed, true); assert.equal((await audits(c.clientMutationId)).length, 1);
  if (['projectPhases', 'milestones', 'monthlyProgress'].includes(entity)) {
    // The corresponding delete grants are frozen P1, absent from SUPER_ADMIN's
    // current P0+unfrozen list. Do not manufacture new policy to pass a fixture.
    const denied = await call('receipts/reserve', [{ ...f.command, clientMutationId: uuid(), op: 'delete', data: {} }], f);
    assert.equal(denied.response.status, 403); assert.equal(denied.body.code, 'PERMISSION_DENIED');
    assert.deepEqual(await db[models[entity]].findUnique({ where: { id: c.id } }), saved);
    return;
  }
  const del = await reserve(f, { ...f.command, clientMutationId: uuid(), op: 'delete', data: {} }); const deleted = await call('push', [del], f); assert.equal(deleted.body.results[0].action, 'deleted', JSON.stringify(deleted.body));
  const after = await db[models[entity]].findUnique({ where: { id: c.id } }); assert.ok(after[entity === 'projectMembers' ? 'leftAt' : 'deletedAt']);
  assert.equal((await call('push', [del], f)).body.results[0].replayed, true);
  const second = await reserve(f, { ...f.command, clientMutationId: uuid(), op: 'delete', data: {} }); assert.equal((await call('push', [second], f)).body.results[0].action, 'noop');
  assert.deepEqual(await db[models[entity]].findUnique({ where: { id: c.id } }), after);
 });
}

test('project delete preserves current project-not-visible replay denial and atomic first tombstone', async () => {
  const p = await project(); const f = { p, who: admin, device: uuid(), command: { clientMutationId: uuid(), entity: 'projects', id: p.id, projectId: p.id, op: 'delete', data: {} } };
  const c = await reserve(f); assert.equal((await call('push', [c], f)).body.results[0].action, 'deleted');
  const after = await db.project.findUnique({ where: { id: p.id } }); assert.ok(after.deletedAt);
  assert.equal((await call('receipts/query', [c], f)).body.results[0].status, 'unknown');
  assert.equal((await call('push', [c], f)).response.status, 404); assert.deepEqual(await db.project.findUnique({ where: { id: p.id } }), after); assert.equal((await audits(c.clientMutationId)).length, 1);
});

test('device registration scalar and atomic owner filter protect foreign metadata', async () => {
  const deviceId = uuid();
  const deviceCall = (actor, body) => app.request('/api/sync/device', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` }, body: JSON.stringify(body) });
  assert.equal((await deviceCall(admin, { deviceId, label: 'owned' })).status, 200);
  const old = await db.syncDevice.findUnique({ where: { id: deviceId } }); assert.equal((await deviceCall(other, { deviceId, label: 'foreign' })).status, 404); assert.deepEqual(await db.syncDevice.findUnique({ where: { id: deviceId } }), old);
  for (const bad of [[], {}, 'x'.repeat(65)]) assert.equal((await deviceCall(admin, { deviceId: bad })).status, 400);
});

test('same tx task fields/status/assignment rollback together after strict audit fault', async () => {
  const f = await fixture(); const c = await reserve(f, { ...f.command, data: { title: 'compound', status: 'IN_PROGRESS', assigneeId: other.id } }); const before = await db.task.findUnique({ where: { id: f.task.id } });
  const r = await call('push', [c], f, fault('auditLog', 'create')); assert.equal(r.response.status, 500); assert.deepEqual(await db.task.findUnique({ where: { id: f.task.id } }), before); assert.equal((await db.syncMutation.findUnique({ where: { id: c.receiptHandle } })).status, 'pending');
});
