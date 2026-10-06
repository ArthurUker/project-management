import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
const target = new URL(process.env.DATABASE_URL); assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.pathname.slice(1), process.env.RDPMS_EXEC_OWNED_DB); assert.match(target.pathname, /^\/rdpms_test_/);
const db = new PrismaClient(); const app = createApp({ db }); const id = () => crypto.randomUUID();
const trace = []; let actor;
async function login(systemRole = 'SUPER_ADMIN') {
  const password = 'Owned RP09 recovery fixture 2026!'; const user = await db.user.create({ data: { username: `rp09-recovery-${id()}`, displayName: 'Synthetic recovery actor', passwordHash: await bcrypt.hash(password, 4), systemRole, status: 'ACTIVE' } });
  const r = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user.username, password }) }); assert.equal(r.status, 200); const session = await r.json();
  assert.equal((await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${session.accessToken}` } })).status, 200);
  return { ...user, token: session.accessToken };
}
before(async () => { actor = await login(); });
after(async () => { try { fs.writeFileSync(path.join(process.env.RDPMS_EXEC_EVIDENCE_DIR, 'persistent-recovery-state.json'), JSON.stringify({ trace, receipts: await db.syncMutation.findMany(), tasks: await db.task.findMany(), devices: await db.syncDevice.findMany(), strictAudits: await db.auditLog.findMany({ where: { entityLabel: { startsWith: 'sync:' } } }) }, null, 2)); } finally { await db.$disconnect(); } });
async function fixture(who = actor) {
  const p = await db.project.create({ data: { code: `RP09-recovery-${id()}`, name: 'Synthetic recovery project', type: 'TESTING', managerId: who.id, members: { create: { userId: who.id, role: 'MANAGER' } } } });
  const task = await db.task.create({ data: { projectId: p.id, title: 'before', updatedAt: new Date('2020-01-01') } });
  return { who, p, task, device: id(), command: { clientMutationId: id(), entity: 'tasks', id: task.id, projectId: p.id, op: 'upsert', data: { title: `after-${id()}` }, baseUpdatedAt: task.updatedAt.toISOString() } };
}
async function call(endpoint, command, f, server = app) {
  const r = await server.request(`/api/sync/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.who.token}` }, body: JSON.stringify({ protocolVersion: 1, deviceId: f.device, changes: Array.isArray(command) ? command : [command] }) });
  const body = await r.json(); trace.push({ endpoint, command, actorId: f.who.id, httpStatus: r.status, body }); return { r, body };
}
async function reserve(f, command = f.command, server = app) { const r = await call('receipts/reserve', command, f, server); assert.equal(r.r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.results[0].status, 'pending'); return { ...command, receiptHandle: r.body.results[0].receiptHandle, payloadHash: r.body.results[0].payloadHash }; }
async function audits(c) { return db.auditLog.count({ where: { metadata: { path: ['clientMutationId'], equals: c.clientMutationId } } }); }
function proxy(wrap) { return new Proxy(db, { get(t, k) { if (k === '$transaction') return (fn, opts) => t.$transaction((tx) => fn(wrap(tx)), opts); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } }); }
function barrier(match, expected = 2, phase = 'before') {
  let reached, release, hits = 0; const entered = new Promise((r) => { reached = r; }); const open = new Promise((r) => { release = r; });
  const wrap = (tx) => new Proxy(tx, { get(t, k) {
    const invoke = async (model, op, args, real) => {
      const selected = match(model, op, args) && hits < expected;
      const result = phase === 'after' ? await real() : undefined;
      if (selected) { hits++; if (hits === expected) reached(); await open; }
      return phase === 'after' ? result : real();
    };
    if (k === '$queryRaw') return (...args) => invoke('$queryRaw', '$queryRaw', args, () => t.$queryRaw(...args));
    if (typeof k === 'string' && ['syncMutation', 'task', 'report', 'user', 'userRole'].includes(k)) return new Proxy(t[k], { get(m, op) { const v = m[op]; return typeof v === 'function' ? (args) => invoke(k, op, args, () => v.call(m, args)) : v; } });
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  return { entered, release, hits: () => hits, app: createApp({ db: proxy(wrap) }) };
}
async function reach(g) { let timer; try { await Promise.race([g.entered, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('RP09_REAL_BARRIER_NOT_REACHED')), 8000); })]); } finally { clearTimeout(timer); } }
function receiptGate(key, expected = 2) { return barrier((model, _, args) => model === '$queryRaw' && String(args[0]).includes('sync_mutations') && args[1] === key, expected); }
async function settle(g, promises) { g.release(); return Promise.allSettled(promises); }

test('S03-OI-02 same-key identical contenders hit real receipt lock; one effect/audit and winner replay', async () => {
  const f = await fixture(); const c = await reserve(f); const g = receiptGate(c.clientMutationId); const requests = [call('push', c, f, g.app), call('push', c, f, g.app)];
  try { await reach(g); assert.equal(g.hits(), 2); } finally { await settle(g, requests); }
  const results = await Promise.all(requests); assert.ok(results.every((r) => r.r.status === 200)); assert.deepEqual(results.map((r) => !!r.body.results[0].replayed).sort(), [false, true]);
  assert.equal((await db.task.findUnique({ where: { id: c.id } })).title, c.data.title); assert.equal(await audits(c), 1); assert.equal(await db.syncMutation.count({ where: { clientMutationId: c.clientMutationId } }), 1);
  trace.push({ barrier: 'actual SELECT receipt FOR UPDATE', hits: g.hits(), effectCount: 1, auditCount: 1 });
});

test('S03-OI-02 same-key changed payload contender has409 and cannot overwrite winner receipt', async () => {
  const f = await fixture(); const c = await reserve(f); const bad = { ...c, payloadHash: undefined, data: { title: 'bad contender' } }; const g = receiptGate(c.clientMutationId); const requests = [call('push', c, f, g.app), call('push', bad, f, g.app)];
  try { await reach(g); } finally { await settle(g, requests); }
  const rs = await Promise.all(requests); assert.deepEqual(rs.map((r) => r.r.status).sort(), [200, 409]); assert.equal((await db.task.findUnique({ where: { id: c.id } })).title, c.data.title); assert.equal(await audits(c), 1);
  const receipt = await db.syncMutation.findUnique({ where: { id: c.receiptHandle } }); assert.equal(receipt.payloadHash, c.payloadHash); assert.equal(receipt.result.response.status, 'applied');
});

test('two fresh reservations race at actual create unique constraint; stable original handle/window', async () => {
  const f = await fixture(); await db.syncDevice.create({ data: { id: f.device, userId: actor.id } });
  const g = barrier((model, op, args) => model === 'syncMutation' && op === 'create' && args.data.clientMutationId === f.command.clientMutationId);
  const requests = [call('receipts/reserve', f.command, f, g.app), call('receipts/reserve', f.command, f, g.app)];
  try { await reach(g); } finally { await settle(g, requests); }
  const rs = await Promise.all(requests); assert.ok(rs.every((r) => r.r.status === 200)); assert.equal(rs[0].body.results[0].receiptHandle, rs[1].body.results[0].receiptHandle); assert.equal(rs[0].body.results[0].expiresAt, rs[1].body.results[0].expiresAt); assert.equal(await db.syncMutation.count({ where: { clientMutationId: f.command.clientMutationId } }), 1); assert.equal(await audits(f.command), 0);
});

test('different keys with same stale base race at actual CAS; losing command leaves no business/audit', async () => {
  const f = await fixture(); const c1 = await reserve(f); const c2 = await reserve(f, { ...f.command, clientMutationId: id(), data: { title: 'second title' } });
  const g = barrier((model, op, args) => model === 'task' && op === 'updateMany' && args.where.id === f.task.id); const requests = [call('push', c1, f, g.app), call('push', c2, f, g.app)];
  try { await reach(g); } finally { await settle(g, requests); }
  const rs = await Promise.all(requests); assert.deepEqual(rs.map((r) => r.body.results[0].status).sort(), ['applied', 'conflict']);
  assert.equal(await audits(c1) + await audits(c2), 1); const winner = rs.find((r) => r.body.results[0].status === 'applied').body.results[0].clientMutationId; assert.equal((await db.task.findUnique({ where: { id: f.task.id } })).title, winner === c1.clientMutationId ? c1.data.title : c2.data.title);
});

for (const applied of [false, true]) {
 test(`24h ${applied ? 'applied' : 'pending'} expiry returns explicit expired and never executes/renews`, async () => {
  const f = await fixture(); const c = await reserve(f); const created = await db.syncMutation.findUnique({ where: { id: c.receiptHandle } }); assert.equal(created.expiresAt.getTime() - created.createdAt.getTime(), 24 * 3600 * 1000);
  if (applied) await call('push', c, f); await db.syncMutation.update({ where: { id: c.receiptHandle }, data: { expiresAt: new Date('2000-01-01') } });
  const before = await db.task.findUnique({ where: { id: c.id } }); const auditCount = await audits(c); const receipt = await db.syncMutation.findUnique({ where: { id: c.receiptHandle } });
  for (const endpoint of ['push', 'receipts/query', 'receipts/reserve']) { const r = await call(endpoint, c, f); assert.equal(r.body.results[0].status, 'expired'); assert.equal(Object.hasOwn(r.body.results[0], 'result'), false); }
  assert.deepEqual(await db.task.findUnique({ where: { id: c.id } }), before); assert.equal(await audits(c), auditCount); assert.deepEqual(await db.syncMutation.findUnique({ where: { id: c.receiptHandle } }), receipt);
 });
}

test('missing receipt/handle remains unknown without implicit reserve, key change or lost original fixture', async () => {
  const f = await fixture(); const c = { ...f.command, receiptHandle: id() }; await db.syncDevice.create({ data: { id: f.device, userId: actor.id } }); const lastCopy = JSON.stringify(c);
  for (const endpoint of ['push', 'receipts/query', 'receipts/reserve']) { const r = await call(endpoint, c, f); assert.equal(r.body.results[0].status, 'unknown'); }
  assert.equal(await db.syncMutation.count({ where: { clientMutationId: c.clientMutationId } }), 0); assert.equal((await db.task.findUnique({ where: { id: c.id } })).title, 'before'); assert.equal(JSON.stringify(c), lastCopy); assert.equal(await audits(c), 0);
  // This proves preservation of owned protocol fixture, NOT actual frontend IDB retention.
});

test('lost reservation response re-reserve same exact intent recovers original handle without window extension', async () => {
  const f = await fixture(); const first = await call('receipts/reserve', f.command, f); const row = await db.syncMutation.findUnique({ where: { clientMutationId: f.command.clientMutationId } });
  const second = await call('receipts/reserve', f.command, f); assert.equal(second.body.results[0].receiptHandle, row.id); assert.equal(second.body.results[0].expiresAt, first.body.results[0].expiresAt); assert.equal(await audits(f.command), 0); assert.equal((await db.task.findUnique({ where: { id: f.task.id } })).title, 'before');
});

test('lastPushAt failure yields500 AFTER complete items; lookup/replay preserves committed state', async () => {
  const f = await fixture(); const c = await reserve(f);
  const client = proxy(tx => new Proxy(tx,{get(t,k){if(k==='syncDevice') return new Proxy(t[k],{get(m,op){if(op==='updateMany')return async(args)=>{if(args.data.lastPushAt)throw Error('OWNED_LAST_PUSH_FAULT');return m.updateMany(args);};return typeof m[op]==='function'?m[op].bind(m):m[op];}});return typeof t[k]==='function'?t[k].bind(t):t[k];}}));
  assert.equal((await call('push', c, f, createApp({ db: client }))).r.status, 500); assert.equal((await db.task.findUnique({ where: { id: c.id } })).title, c.data.title); assert.equal((await call('receipts/query', c, f)).body.results[0].status, 'applied'); assert.equal((await call('push', c, f)).body.results[0].replayed, true); assert.equal(await audits(c), 1);
});

test('actual HTTP/JWT disconnect after commit before response delivery recovers original result without duplicate', async () => {
  const f = await fixture(); const c = await reserve(f); let reached, release; const entered = new Promise((r) => { reached = r; }); const open = new Promise((r) => { release = r; });
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: async (request) => { const response = await app.fetch(request); if (new URL(request.url).pathname === '/api/sync/push') { reached(); await open; } return response; } });
  await new Promise((resolve) => server.once('listening', resolve)); const port = server.address().port; let req;
  const lost = new Promise((resolve, reject) => { req = http.request({ hostname: '127.0.0.1', port, path: '/api/sync/push', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` } }, () => reject(new Error('Unexpected delivered response'))); req.once('error', (error) => resolve(error.code)); req.end(JSON.stringify({ protocolVersion: 1, deviceId: f.device, changes: [c] })); });
  try { await reach({ entered }); req.destroy(new Error('OWNED_RESPONSE_LOSS')); await lost;
    assert.equal((await db.syncMutation.findUnique({ where: { id: c.receiptHandle } })).status, 'applied'); const saved = await db.task.findUnique({ where: { id: c.id } }); assert.equal(saved.title, c.data.title);
    const q = await call('receipts/query', c, f); assert.equal(q.body.results[0].status, 'applied'); const replay = await call('push', c, f); assert.equal(replay.body.results[0].replayed, true); assert.equal(await audits(c), 1); assert.deepEqual(await db.task.findUnique({ where: { id: c.id } }), saved);
    trace.push({ actualTransport: 'HTTP localhost ephemeral server, real JWT, socket destroyed after actual commit before response', committed: true, receivedResponse: false, duplicateEffect: false });
  } finally { release(); req.destroy(); server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
});

test('stale middleware grant snapshot is not trusted when revoke commits before tx actor read', async () => {
  const who = await login('MEMBER'); const permission = await db.permission.findUnique({ where: { code: 'tasks.update' } }); const role = await db.role.create({ data: { code: `rp09_recovery_${id()}`, name: 'Synthetic recovery role', permissions: { create: { permissionId: permission.id } } } }); await db.userRole.create({ data: { userId: who.id, roleId: role.id } });
  const f = await fixture(who); const c = await reserve(f); const g = barrier((model, op, args) => model === 'user' && op === 'findUnique' && args.where.id === who.id, 1); const request = call('push', c, f, g.app);
  try { await reach(g); await db.rolePermission.deleteMany({ where: { roleId: role.id } }); } finally { await settle(g, [request]); }
  assert.equal((await request).r.status, 403); assert.equal((await db.task.findUnique({ where: { id: c.id } })).title, 'before'); assert.equal((await db.syncMutation.findUnique({ where: { id: c.receiptHandle } })).status, 'pending'); assert.equal(await audits(c), 0);
});

test('concurrent distinct-key deletes preserve one tombstone timestamp and per-intent noops', async () => {
  const f = await fixture(); const raw = { ...f.command, op: 'delete', data: {} }; const c1 = await reserve(f, raw); const c2 = await reserve(f, { ...raw, clientMutationId: id() });
  const g = barrier((model, op, args) => model === '$queryRaw' && args[0]?.strings?.join('?').includes('SELECT id FROM tasks WHERE id IN') && args[0]?.values?.includes(f.task.id)); const requests = [call('push', c1, f, g.app), call('push', c2, f, g.app)];
  try { await reach(g); } finally { await settle(g, requests); } const rs = await Promise.all(requests); assert.deepEqual(rs.map((r) => r.body.results[0].action).sort(), ['deleted', 'noop']); const row = await db.task.findUnique({ where: { id: f.task.id } }); assert.ok(row.deletedAt); assert.equal(await audits(c1) + await audits(c2), 2);
  await call('push', c1, f); await call('push', c2, f); assert.deepEqual(await db.task.findUnique({ where: { id: row.id } }), row);
});

test('delete/fixture-restore ordering: delayed delete wins, committed noop does not re-delete later restore', async () => {
  const f = await fixture(); const c = await reserve(f, { ...f.command, op: 'delete', data: {} }); const g = barrier((model, op, args) => model === '$queryRaw' && args[0]?.strings?.join('?').includes('SELECT id FROM tasks WHERE id IN') && args[0]?.values?.includes(f.task.id), 1); const request = call('push', c, f, g.app);
  try { await reach(g); await db.task.update({ where: { id: f.task.id }, data: { deletedAt: null, title: 'fixture restore/new edit' } }); } finally { await settle(g, [request]); }
  assert.equal((await request).body.results[0].status, 'applied'); const row = await db.task.findUnique({ where: { id: f.task.id } }); assert.ok(row.deletedAt); assert.equal(row.title, 'fixture restore/new edit');
  const noop = await reserve(f, { ...f.command, clientMutationId: id(), op: 'delete', data: {} }); assert.equal((await call('push', noop, f)).body.results[0].action, 'noop');
  await db.task.update({ where: { id: f.task.id }, data: { deletedAt: null } }); assert.equal((await call('push', noop, f)).body.results[0].replayed, true); assert.equal((await db.task.findUnique({ where: { id: f.task.id } })).deletedAt, null);
});

test('safe containment switch denies new reservation/writes while keeping authorized receipt lookup', async () => {
  const f = await fixture(); const c = await reserve(f); await call('push', c, f); const row = await db.task.findUnique({ where: { id: c.id } }); const old = process.env.RDPMS_SYNC_WRITE_DISABLED;
  try { process.env.RDPMS_SYNC_WRITE_DISABLED = 'true'; assert.equal((await call('push', c, f)).r.status, 503); assert.equal((await call('receipts/reserve', { ...f.command, clientMutationId: id() }, f)).r.status, 503); assert.equal((await call('receipts/query', c, f)).body.results[0].status, 'applied'); }
  finally { if (old === undefined) delete process.env.RDPMS_SYNC_WRITE_DISABLED; else process.env.RDPMS_SYNC_WRITE_DISABLED = old; }
  assert.deepEqual(await db.task.findUnique({ where: { id: c.id } }), row); assert.equal(await audits(c), 1);
});

test('account disable commits after middleware but before tx user read: no business/applied receipt', async () => {
  const who = await login(); const f = await fixture(who); const c = await reserve(f); const g = barrier((model, op, args) => model === 'user' && op === 'findUnique' && args.where.id === who.id, 1); const request = call('push', c, f, g.app);
  try { await reach(g); await db.user.update({ where: { id: who.id }, data: { status: 'DISABLED' } }); } finally { await settle(g, [request]); }
  assert.equal((await request).r.status, 401); assert.equal((await db.task.findUnique({ where: { id: c.id } })).title, 'before'); assert.equal((await db.syncMutation.findUnique({ where: { id: c.receiptHandle } })).status, 'pending'); assert.equal(await audits(c), 0);
});

test('overlapping grant revoke after tx snapshot follows one valid serial order; later lookup always denied', async () => {
  const who = await login('MEMBER'); const permission = await db.permission.findUnique({ where: { code: 'tasks.update' } }); const role = await db.role.create({ data: { code: `rp09_overlap_${id()}`, name: 'Synthetic overlap role', permissions: { create: { permissionId: permission.id } } } }); await db.userRole.create({ data: { userId: who.id, roleId: role.id } });
  const f = await fixture(who); const c = await reserve(f); const g = barrier((model, op, args) => model === 'userRole' && op === 'findMany' && args.where.userId === who.id, 1, 'after'); const request = call('push', c, f, g.app);
  try { await reach(g); await db.rolePermission.deleteMany({ where: { roleId: role.id } }); } finally { await settle(g, [request]); }
  const response = await request; assert.ok([200, 403].includes(response.r.status), JSON.stringify(response.body));
  const applied = response.r.status === 200; assert.equal(response.body.results[0].status, applied ? 'applied' : 'rejected'); const row = await db.task.findUnique({ where: { id: c.id } }); const receipt = await db.syncMutation.findUnique({ where: { id: c.receiptHandle } });
  assert.equal(row.title, applied ? c.data.title : 'before'); assert.equal(receipt.status, applied ? 'applied' : 'pending'); assert.equal(await audits(c), applied ? 1 : 0); assert.equal((await call('receipts/query', c, f)).body.results[0].status, 'unknown');
  trace.push({ overlapBoundary: 'grant read completed inside Serializable tx', order: applied ? 'command ordered before concurrent revoke' : 'retry observed revoke', laterLookup: 'unknown' });
});

async function grants(who, codes) {
  const permissions = await db.permission.findMany({ where: { code: { in: codes } } }); assert.equal(permissions.length, codes.length);
  const role = await db.role.create({ data: { code: `rp09_security_${id()}`, name: 'Synthetic scoped security role', permissions: { create: permissions.map((p) => ({ permissionId: p.id })) } } }); await db.userRole.create({ data: { userId: who.id, roleId: role.id } });
}

test('v1 equivalents RF04-U25/I3: legal field update succeeds; status/assign/delete remain separate denied permissions', async () => {
  const who = await login('MEMBER'); await grants(who, ['tasks.update']); const f = await fixture(who); const legal = await reserve(f); assert.equal((await call('push', legal, f)).body.results[0].status, 'applied');
  const before = await db.task.findUnique({ where: { id: f.task.id } });
  for (const [op, data] of [['upsert', { status: 'IN_PROGRESS' }], ['upsert', { assigneeId: actor.id }], ['delete', {}]]) {
    const raw = { ...f.command, clientMutationId: id(), op, data, baseUpdatedAt: undefined };
    const r = await call('receipts/reserve', raw, f); assert.equal(r.r.status, 403); assert.equal(r.body.code, 'PERMISSION_DENIED'); assert.equal(await db.syncMutation.count({ where: { clientMutationId: raw.clientMutationId } }), 0);
  }
  assert.deepEqual(await db.task.findUnique({ where: { id: before.id } }), before);
});

test('v1 equivalents RF04-U10/U11/I2: legal own report succeeds; other author/reviewed writes denied', async () => {
  const who = await login('MEMBER'); await grants(who, ['reports.update']); const f = await fixture(who);
  const own = await db.report.create({ data: { projectId: f.p.id, authorId: who.id, reportType: 'MONTHLY', periodKey: '2026-10', content: {} } }); const foreign = await db.report.create({ data: { projectId: f.p.id, authorId: actor.id, reportType: 'MONTHLY', periodKey: '2026-10', content: {} } });
  const raw = { clientMutationId: id(), entity: 'reports', id: own.id, projectId: f.p.id, op: 'upsert', data: { content: { marker: 'legal own content' } } }; const legal = await reserve(f, raw); assert.equal((await call('push', legal, f)).body.results[0].status, 'applied');
  assert.equal((await call('receipts/reserve', { ...raw, clientMutationId: id(), id: foreign.id }, f)).r.status, 403);
  await db.report.update({ where: { id: own.id }, data: { status: 'REVIEWED' } }); const c = await reserve(f, { ...raw, clientMutationId: id(), data: { content: { marker: 'denied late content' } } }); assert.equal((await call('push', c, f)).r.status, 409);
  assert.deepEqual((await db.report.findUnique({ where: { id: own.id } })).content, raw.data.content); assert.deepEqual((await db.report.findUnique({ where: { id: foreign.id } })).content, {}); assert.equal(await audits(c), 0);
});

test('v1 equivalents RF04-U13/I4/I5: same-project phase accepted, cross-project reference rejected within tx', async () => {
  const f = await fixture(); const goodPhase = await db.projectPhase.create({ data: { projectId: f.p.id, code: 'P1', name: 'Own phase', sortOrder: 1 } }); const other = await fixture(); const badPhase = await db.projectPhase.create({ data: { projectId: other.p.id, code: 'P2', name: 'Other phase', sortOrder: 1 } });
  const legal = await reserve(f, { ...f.command, data: { phaseId: goodPhase.id } }); assert.equal((await call('push', legal, f)).body.results[0].status, 'applied');
  const current = await db.task.findUnique({ where: { id: f.task.id } }); const denied = await reserve(f, { ...f.command, clientMutationId: id(), baseUpdatedAt: current.updatedAt.toISOString(), data: { phaseId: badPhase.id } }); const r = await call('push', denied, f); assert.equal(r.r.status, 400); assert.equal(r.body.results[0].code, 'INVALID_REFERENCE'); assert.deepEqual(await db.task.findUnique({ where: { id: current.id } }), current); assert.equal(await audits(denied), 0);
});

test('v1 project update/delete/archive guards preserve separate action policy (RF04-U24/I9, B09)', async () => {
  const who = await login('MEMBER'); await grants(who, ['projects.update']); const f = await fixture(who); const raw = { clientMutationId: id(), entity: 'projects', id: f.p.id, projectId: f.p.id, op: 'upsert', data: { name: 'legal renamed' } };
  const legal = await reserve(f, raw); assert.equal((await call('push', legal, f)).body.results[0].status, 'applied');
  for (const command of [{ ...raw, clientMutationId: id(), op: 'delete', data: {} }, { ...raw, clientMutationId: id(), data: { status: 'ARCHIVED' } }]) assert.equal((await call('receipts/reserve', command, f)).r.status, 403);
  const row = await db.project.findUnique({ where: { id: f.p.id } }); assert.equal(row.name, 'legal renamed'); assert.equal(row.deletedAt, null); assert.equal(row.status, 'PLANNING');
});

test('v1 report save-vs-real-HTTP-submit barrier preserves submitted content/version (old RP10 sync race equivalent)', async () => {
  const f = await fixture(); const report = await db.report.create({ data: { projectId: f.p.id, authorId: actor.id, reportType: 'MONTHLY', periodKey: '2026-10', content: { marker: 'submit snapshot' } } });
  const c = await reserve(f, { clientMutationId: id(), entity: 'reports', id: report.id, projectId: f.p.id, op: 'upsert', data: { content: { marker: 'late sync' } } });
  const g = barrier((model, op, args) => model === 'report' && op === 'updateMany' && args.where.id === report.id, 1); const request = call('push', c, f, g.app);
  try { await reach(g); const submit = await app.request(`/api/reports/${report.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` }, body: JSON.stringify({ clientMutationId: id() }) }); assert.equal(submit.status, 200, JSON.stringify(await submit.clone().json())); } finally { await settle(g, [request]); }
  const r = await request; assert.equal(r.r.status, 409); assert.equal(r.body.results[0].code, 'INVALID_STATE'); const saved = await db.report.findUnique({ where: { id: report.id } }); assert.equal(saved.status, 'SUBMITTED'); assert.deepEqual(saved.content, report.content);
  const versions = await db.reportVersion.findMany({ where: { reportId: report.id } }); assert.equal(versions.length, 1); assert.deepEqual(versions[0].content, report.content); assert.equal(saved.currentVersion, versions[0].version); assert.equal((await db.syncMutation.findUnique({ where: { id: c.receiptHandle } })).status, 'pending'); assert.equal(await audits(c), 0);
});

test('v1 RF02 rejection/retry preserves immutable original key and succeeds after cause fixed', async () => {
  const f = await fixture(); const raw = { ...f.command, data: { phaseId: id() } }; const c = await reserve(f, raw); const first = await call('push', c, f); assert.equal(first.r.status, 400); assert.equal((await db.syncMutation.findUnique({ where: { id: c.receiptHandle } })).status, 'pending');
  await db.projectPhase.create({ data: { id: raw.data.phaseId, projectId: f.p.id, code: 'P1', name: 'Fixed synthetic reference', sortOrder: 1 } }); const r = await call('push', c, f); assert.equal(r.body.results[0].status, 'applied'); assert.equal((await db.task.findUnique({ where: { id: f.task.id } })).phaseId, raw.data.phaseId); assert.equal(await audits(c), 1); assert.equal((await call('push', c, f)).body.results[0].replayed, true);
});
