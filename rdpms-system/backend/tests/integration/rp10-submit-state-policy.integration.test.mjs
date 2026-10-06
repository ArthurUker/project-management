import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { signAccessToken } from '../../dist/kernel/rbac.js';

const db = new PrismaClient();
const suffix = crypto.randomUUID();
let author, reviewer, project;
const app = createApp({ db });
let sequence = 0;

async function actor(label) {
  const user = await db.user.create({ data: { username: `rp10-policy-${label}-${suffix}`,
    displayName: 'Synthetic report actor', passwordHash: 'synthetic-only', systemRole: 'ADMIN', status: 'ACTIVE' } });
  const role = await db.role.create({ data: { code: `RP10_${label}_${suffix}`, name: 'Synthetic report role',
    permissions: { create: ['reports.submit', 'reports.review', 'reports.update', 'reports.view']
      .map((code) => ({ permission: { connect: { code } } })) } } });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return { user, token: signAccessToken({ ...user, datasetEpoch: (await db.dataRecoveryState.findUniqueOrThrow({where:{id:1}})).epoch }), role };
}
async function report(status = 'DRAFT') {
  const row = await db.report.create({ data: { projectId: project.id, authorId: author.user.id,
    reportType: 'DAILY', periodKey: `2026-10-${String(++sequence).padStart(2, '0')}`,
    status, content: { revision: `source-${sequence}` } } });
  if (status !== 'DRAFT') await db.reportVersion.create({ data: { reportId: row.id, version: 1,
    content: row.content, createdById: author.user.id } });
  return row;
}
function request(as, id, operation, body = {}, server = app) {
  return server.request(`/api/reports/${id}${operation ? `/${operation}` : ''}`, {
    method: operation ? 'POST' : 'PUT', headers: { Authorization: `Bearer ${as.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function submit(row, key, server = app) { return request(author, row.id, 'submit', { clientMutationId: key }, server); }
async function state(row) {
  return { row: await db.report.findUnique({ where: { id: row.id } }),
    versions: await db.reportVersion.findMany({ where: { reportId: row.id }, orderBy: { version: 'asc' } }),
    receipts: await db.mutationReceipt.findMany({ where: { resourceScope: `report:${row.id}` }, orderBy: { id: 'asc' } }),
    audits: await db.auditLog.findMany({ where: { entityId: row.id }, orderBy: { id: 'asc' } }) };
}
before(async () => {
  await db.$queryRaw`SELECT 1`;
  author = await actor('author'); reviewer = await actor('reviewer');
  project = await db.project.create({ data: { code: `RP10-P-${suffix}`, name: 'Synthetic report project', type: 'TESTING',
    managerId: reviewer.user.id, createdById: reviewer.user.id,
    members: { create: [{ userId: author.user.id, role: 'MEMBER' }, { userId: reviewer.user.id, role: 'MANAGER' }] } } });
});
after(async () => { await db.$disconnect(); });

// Stops at the real transaction SELECT FOR UPDATE invocation, after route
// preflight. SQL is executed unchanged on release. No sleeps/mock row state.
function lockGate(id, count = 1) {
  let seen = 0, resolveReached, resolveRelease;
  const reached = new Promise((resolve) => { resolveReached = resolve; });
  const released = new Promise((resolve) => { resolveRelease = resolve; });
  const traces = [];
  const client = new Proxy(db, { get(target, key) {
    if (key === '$transaction') return (callback, options) => target.$transaction((tx) => callback(new Proxy(tx, {
      get(inner, prop) {
        if (prop === '$queryRaw') return async (...args) => {
          const hit = args[1] === id && String(args[0]).includes('FOR UPDATE') && seen < count;
          if (hit) {
            seen++; traces.push({ boundary: 'transaction report SELECT FOR UPDATE', reportId: id, ordinal: seen });
            if (seen === count) resolveReached();
            await released;
          }
          return inner.$queryRaw(...args);
        };
        const value = inner[prop]; return typeof value === 'function' ? value.bind(inner) : value;
      },
    })), options);
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  return { client, reached, release: resolveRelease, traces, seen: () => seen };
}
async function reached(gate) {
  let timer;
  try { await Promise.race([gate.reached, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('BARRIER_NOT_REACHED')), 8000); })]); }
  finally { clearTimeout(timer); }
}
async function settle(gate, pending) { gate.release(); await Promise.allSettled(pending); }

for (const status of ['DRAFT', 'NEEDS_REVISION']) {
  test(`D-S01-07 ${status} legally submits same-revision snapshot/version/audit/receipt with real Bearer auth`, async () => {
    const row = await report(status); const response = await submit(row, `legal-${row.id}`); assert.equal(response.status, 200);
    const saved = await state(row); const expected = status === 'DRAFT' ? 1 : 2;
    assert.equal(saved.row.status, 'SUBMITTED'); assert.equal(saved.row.currentVersion, expected);
    assert.equal(saved.versions.at(-1).version, expected); assert.deepEqual(saved.versions.at(-1).content, saved.row.content);
    assert.equal(saved.receipts.length, 1); assert.equal(saved.receipts[0].responseStatus, 200);
    assert.equal(saved.audits.filter((r) => r.action === 'submit').length, 1);
  });
}

for (const status of ['SUBMITTED', 'REVIEWING', 'REVIEWED']) {
  test(`D-S01-07 ${status} new-key submit rejects 409 without row/version/audit/receipt changes`, async () => {
    const row = await report(status); const before = await state(row); const response = await submit(row, `invalid-${row.id}`);
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'INVALID_STATE');
    assert.deepEqual(await state(row), before);
  });
}

test('D-S01-07 same-key replays after reject/reviewed states without resubmission; new key follows current state', async () => {
  const row = await report(); const key = `replay-${row.id}`;
  const first = await submit(row, key); assert.equal(first.status, 200); const firstBody = await first.json();
  assert.equal((await request(reviewer, row.id, 'reject', { note: 'Synthetic revision request' })).status, 200);
  const beforeReplay = await state(row); const replay = await submit(row, key);
  assert.equal(replay.status, 200); assert.equal(replay.headers.get('Idempotent-Replay'), 'true');
  assert.deepEqual(await replay.json(), firstBody); assert.deepEqual(await state(row), beforeReplay);
  assert.equal((await request(author, row.id, '', { content: { revision: 'revised' }, clientMutationId: `save-${row.id}` })).status, 200);
  assert.equal((await submit(row, `second-${row.id}`)).status, 200);
  assert.equal((await request(reviewer, row.id, 'approve', { note: 'Approved synthetic revision' })).status, 200);
  const reviewed = await state(row); const replayReviewed = await submit(row, key);
  assert.equal(replayReviewed.status, 200); assert.equal(replayReviewed.headers.get('Idempotent-Replay'), 'true');
  assert.deepEqual(await state(row), reviewed);
  assert.equal((await submit(row, `third-${row.id}`)).status, 409);
});

test('S03-OI-08 five concurrent same keys commit one version/audit/receipt and replay four times', async () => {
  const row = await report(); const key = `same-${row.id}`;
  const results = await Promise.all(Array.from({ length: 5 }, () => submit(row, key)));
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200, 200]);
  assert.equal(results.filter((r) => r.headers.get('Idempotent-Replay') === 'true').length, 4);
  const saved = await state(row); assert.equal(saved.versions.length, 1); assert.equal(saved.receipts.length, 1);
  assert.equal(saved.audits.filter((a) => a.action === 'submit').length, 1);
});

test('S03-OI-08 distinct keys all past preflight: one winning submission, four state rejections, no partial versions/receipts', async () => {
  const row = await report(); const gate = lockGate(row.id, 5); const server = createApp({ db: gate.client });
  const pending = Array.from({ length: 5 }, (_, i) => submit(row, `distinct-${row.id}-${i}`, server));
  try { await reached(gate); assert.equal(gate.seen(), 5); }
  finally { await settle(gate, pending); }
  const results = await Promise.all(pending); assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409, 409, 409]);
  const saved = await state(row); assert.equal(saved.versions.length, 1); assert.equal(saved.receipts.length, 1);
  assert.equal(saved.row.currentVersion, 1); assert.deepEqual(saved.versions[0].content, saved.row.content);
  assert.equal(saved.audits.filter((r) => r.action === 'submit').length, 1);
  console.log('S03-OI-08 distinct-key barrier:', JSON.stringify(gate.traces));
});

for (const operation of ['approve', 'reject']) {
  test(`D-S01-07 stale ${operation} cannot overwrite newer resubmission after real lock barrier`, async () => {
    const row = await report(); assert.equal((await submit(row, `initial-${row.id}`)).status, 200);
    const gate = lockGate(row.id); const lateServer = createApp({ db: gate.client });
    const late = request(reviewer, row.id, operation, { note: 'Late synthetic review' }, lateServer);
    let winnerState;
    try {
      await reached(gate); assert.equal(gate.seen(), 1);
      assert.equal((await request(reviewer, row.id, 'reject', { note: 'Winner revision request' })).status, 200);
      assert.equal((await request(author, row.id, '', { content: { revision: `winner-${operation}` }, clientMutationId: `save-${row.id}` })).status, 200);
      assert.equal((await submit(row, `resubmit-${row.id}`)).status, 200); winnerState = await state(row);
    } finally { await settle(gate, [late]); }
    const response = await late; assert.equal(response.status, 409);
    assert.deepEqual(await state(row), winnerState); assert.equal(winnerState.row.currentVersion, 2);
    assert.equal(winnerState.row.status, 'SUBMITTED'); assert.deepEqual(winnerState.versions.at(-1).content, winnerState.row.content);
    console.log(`stale ${operation} barrier:`, JSON.stringify(gate.traces));
  });
}

test('D-S01-07 concurrent approve/reject of one SUBMITTED version allow one winner and one 409', async () => {
  const row = await report(); assert.equal((await submit(row, `review-race-${row.id}`)).status, 200);
  const gate = lockGate(row.id, 2); const server = createApp({ db: gate.client });
  const pending = ['approve', 'reject'].map((operation) => request(reviewer, row.id, operation, { note: 'Synthetic review race' }, server));
  try { await reached(gate); assert.equal(gate.seen(), 2); }
  finally { await settle(gate, pending); }
  const results = await Promise.all(pending); assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const saved = await state(row); assert.equal(saved.versions.length, 1);
  assert.equal(saved.audits.filter((r) => ['approve', 'reject'].includes(r.action)).length, 1);
});

test('D-S01-07 strict audit failure rolls back submit/review state, versions and receipt (injected failure, real transaction)', async () => {
  const broken = new Proxy(db, { get(target, key) {
    if (key === '$transaction') return (callback, options) => target.$transaction((tx) => callback(new Proxy(tx, {
      get(inner, prop) {
        if (prop === 'auditLog') return { create: async () => { throw new Error('Synthetic strict audit failure'); } };
        const value = inner[prop]; return typeof value === 'function' ? value.bind(inner) : value;
      },
    })), options);
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  const server = createApp({ db: broken });
  const row = await report(); const before = await state(row);
  assert.equal((await submit(row, `audit-fail-${row.id}`, server)).status, 500); assert.deepEqual(await state(row), before);
  assert.equal((await submit(row, `audit-success-${row.id}`)).status, 200); const submitted = await state(row);
  assert.equal((await request(reviewer, row.id, 'approve', {}, server)).status, 500); assert.deepEqual(await state(row), submitted);
});

test('D-S01-07 current membership and permission still precede receipt replay; author ownership enforced', async () => {
  const row = await report(); const key = `authorization-${row.id}`;
  assert.equal((await submit(row, key)).status, 200); const saved = await state(row);
  await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: author.user.id } }, data: { leftAt: new Date() } });
  try { assert.equal((await submit(row, key)).status, 404); assert.deepEqual(await state(row), saved); }
  finally { await db.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: author.user.id } }, data: { leftAt: null } }); }
  await db.userRole.delete({ where: { userId_roleId: { userId: author.user.id, roleId: author.role.id } } });
  try { assert.equal((await submit(row, key)).status, 403); assert.deepEqual(await state(row), saved); }
  finally { await db.userRole.create({ data: { userId: author.user.id, roleId: author.role.id } }); }
  const draft = await report();
  assert.equal((await request(reviewer, draft.id, 'submit', { clientMutationId: `wrong-author-${draft.id}` })).status, 400);
  assert.equal((await state(draft)).receipts.length, 0);
});
