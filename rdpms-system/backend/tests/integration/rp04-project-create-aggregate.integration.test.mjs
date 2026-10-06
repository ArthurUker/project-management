import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';

// Run only against a newly created, task-owned throwaway PostgreSQL database.
const prisma = new PrismaClient();
let actor;
let app;
let createdProjectId;
const faultTriggers = [
  ['rp04_t02_fail_task_insert', 'tasks'],
  ['rp04_t02_fail_audit_insert', 'audit_logs'],
  ['rp04_t02_fail_receipt_insert', 'mutation_receipts'],
  ['rp04_t02_fail_sequence_write', 'code_sequences'],
];
const faultFunctions = faultTriggers.map(([trigger]) => `${trigger}_fn`);

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const suffix = crypto.randomUUID();
  actor = await prisma.user.create({
    data: {
      id: `rp04t02-${suffix}`,
      username: `rp04t02-${suffix}`,
      displayName: 'RP04-T02 synthetic actor',
      passwordHash: 'not-a-real-password-hash',
      systemRole: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });
  app = createApp({ db: prisma, actorResolver: async () => ({
    userId: actor.id,
    user: { id: actor.id, username: actor.username, displayName: actor.displayName },
    systemRole: 'SUPER_ADMIN',
    permissions: ['projects.create'],
  }) });
});

after(async () => {
  for (const [[trigger, table], fn] of faultTriggers.map((item, index) => [item, faultFunctions[index]])) {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "${table}"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
  }
  if (createdProjectId) await prisma.project.deleteMany({ where: { id: createdProjectId } });
  // Keep the synthetic actor because audit rows are append-only; the task runner
  // must drop this entire throwaway database after evidence capture.
  await prisma.$disconnect();
});

async function postProject(body, key) {
  const response = await app.request('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(body),
  });
  let json;
  try { json = await response.json(); } catch { json = null; }
  return { response, json };
}

async function withFaultTrigger(index, conditionSql, operation) {
  const [trigger, table] = faultTriggers[index];
  const fn = faultFunctions[index];
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${conditionSql} THEN RAISE EXCEPTION 'RP04_T02_INJECTED_FAILURE'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT OR UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
  try {
    await operation();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "${table}"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
  }
}

test('RP04-T02 AC-B18-01/02 project, children, audit and receipt commit once; same-key retry replays', async () => {
  const key = `rp04t02-${crypto.randomUUID()}`;
  const body = {
    name: 'RP04-T02 aggregate success',
    type: 'TESTING',
    tasks: [{ title: 'RP04-T02 task', phaseKey: 'Phase A', status: 'NOT_STARTED' }],
    milestones: [{ name: 'RP04-T02 milestone', phaseKey: 'Phase A', date: '2026-10-02' }],
    participantIds: [actor.id],
  };
  const year = String(new Date().getFullYear());
  const sequenceBefore = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
  const first = await postProject(body, key);
  assert.equal(first.response.status, 201, JSON.stringify(first.json));
  createdProjectId = first.json.id;
  assert.match(first.json.code, new RegExp(`^PRJ-${year}-\\d{3}$`));
  assert.equal(await prisma.project.count({ where: { id: createdProjectId } }), 1);
  assert.equal(await prisma.projectMember.count({ where: { projectId: createdProjectId, userId: actor.id, role: 'OWNER', leftAt: null } }), 1);
  const phase = await prisma.projectPhase.findFirst({ where: { projectId: createdProjectId, name: 'Phase A' } });
  assert.ok(phase);
  const task = await prisma.task.findFirst({ where: { projectId: createdProjectId, title: 'RP04-T02 task' } });
  assert.ok(task);
  assert.equal(task.phaseId, phase.id);
  const milestone = await prisma.milestone.findFirst({ where: { projectId: createdProjectId, name: 'RP04-T02 milestone' } });
  assert.ok(milestone);
  assert.equal(milestone.phaseId, phase.id);
  assert.equal(await prisma.projectPhase.count({ where: { projectId: createdProjectId, name: 'Phase A' } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { actorId: actor.id, entityType: 'PROJECT', entityId: createdProjectId, action: 'create' } }), 1);
  const sequenceAfterCreate = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
  assert.ok(sequenceAfterCreate.lastValue > (sequenceBefore?.lastValue ?? 0));

  const replay = await postProject(body, key);
  assert.equal(replay.response.status, 201);
  assert.equal(replay.response.headers.get('Idempotency-Replayed'), 'true');
  assert.equal(replay.json.id, createdProjectId);
  assert.equal(replay.json.code, first.json.code);
  assert.equal(await prisma.project.count({ where: { createdById: actor.id, name: body.name } }), 1);
  assert.equal(await prisma.task.count({ where: { projectId: createdProjectId } }), 1);
  assert.equal(await prisma.mutationReceipt.count({ where: { actorId: actor.id, idempotencyKey: key } }), 1);
  const sequenceAfterReplay = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
  assert.equal(sequenceAfterReplay.lastValue, sequenceAfterCreate.lastValue);
});

test('RP04-T02 AC-B18-01/03 injected sequence, child, audit and receipt failures roll back the aggregate', async () => {
  const year = String(new Date().getFullYear());
  const scenarios = [
    { trigger: 0, condition: "NEW.title = 'RP04_FAIL_CHILD'", name: 'RP04-T02 child fault' },
    { trigger: 1, condition: "NEW.entity_type = 'PROJECT' AND NEW.entity_label = 'RP04_FAIL_AUDIT'", name: 'RP04_FAIL_AUDIT' },
    { trigger: 2, condition: "NEW.idempotency_key LIKE 'rp04t02-fail-receipt-%'", name: 'RP04-T02 receipt fault' },
    { trigger: 3, condition: "NEW.scope = 'PROJECT'", name: 'RP04-T02 sequence fault' },
  ];
  for (const scenario of scenarios) {
    const beforeSequence = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
    const key = scenario.trigger === 2 ? `rp04t02-fail-receipt-${crypto.randomUUID()}` : `rp04t02-fail-${crypto.randomUUID()}`;
    const projectCountBefore = await prisma.project.count({ where: { createdById: actor.id } });
    await withFaultTrigger(scenario.trigger, scenario.condition, async () => {
      const response = await postProject({
        name: scenario.name,
        tasks: [{ title: scenario.trigger === 0 ? 'RP04_FAIL_CHILD' : 'RP04 ordinary fault fixture', phaseKey: 'Fault Phase' }],
        milestones: [{ name: 'RP04 fault milestone', phaseKey: 'Fault Phase', date: '2026-10-02' }],
      }, key);
      assert.equal(response.response.status, 500, `fault=${scenario.trigger} body=${JSON.stringify(response.json)}`);
    });

    const afterSequence = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
    assert.equal(afterSequence?.lastValue ?? null, beforeSequence?.lastValue ?? null, `sequence persisted after fault=${scenario.trigger}`);
    assert.equal(await prisma.project.count({ where: { createdById: actor.id } }), projectCountBefore, `project persisted after fault=${scenario.trigger}`);
    assert.equal(await prisma.task.count({ where: { title: { in: ['RP04_FAIL_CHILD', 'RP04 ordinary fault fixture'] } } }), 0);
    assert.equal(await prisma.milestone.count({ where: { name: 'RP04 fault milestone' } }), 0);
    assert.equal(await prisma.mutationReceipt.count({ where: { actorId: actor.id, idempotencyKey: key } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { actorId: actor.id, entityType: 'PROJECT', entityLabel: scenario.name } }), 0);
  }
});

test('RP04-T02 accepts valid top-level scalars, including string subtype, type and ISO dates', async () => {
  const year = String(new Date().getFullYear());
  const sequenceBefore = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
  const { response, json } = await postProject({
    name: 'RP04-T02 top-level positive',
    type: '测试',
    subtype: 'synthetic-subtype',
    positioning: 'synthetic-positioning',
    startDate: '2026-10-02',
    endDate: '2026-12-31',
    tasks: [{ title: 'RP04-T02 positive task', phaseKey: 'Positive Phase' }],
  });
  assert.equal(response.status, 201, JSON.stringify(json));
  const created = await prisma.project.findUnique({ where: { id: json.id } });
  assert.equal(created.type, 'TESTING');
  assert.equal(created.subtype, 'synthetic-subtype');
  assert.equal(created.positioning, 'synthetic-positioning');
  assert.equal(new Date(created.startDate).toISOString().slice(0, 10), '2026-10-02');
  const sequenceAfter = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
  assert.ok(sequenceAfter.lastValue > (sequenceBefore?.lastValue ?? 0));
  await prisma.project.deleteMany({ where: { id: json.id } });
});

test('RP04-T02 rejects malformed top-level scalars before normalization or persistence', async () => {
  const malformed = [
    ['subtype object', { subtype: { unexpected: 'object' } }],
    ['subtype array', { subtype: ['registration'] }],
    ['type array', { type: ['TESTING'] }],
    ['type object', { type: { value: 'TESTING' } }],
    ['name array', { name: ['RP04 name'] }],
    ['positioning object', { positioning: { value: 'synthetic' } }],
    ['managerId object', { managerId: { id: actor.id } }],
    ['isDraft string', { isDraft: 'true' }],
    ['startDate boolean', { startDate: false }],
    ['endDate boolean', { endDate: true }],
    ['startDate object', { startDate: { value: '2026-10-02' } }],
    ['startDate numeric epoch', { startDate: 1767225600 }],
  ];
  const year = String(new Date().getFullYear());
  const sequenceBefore = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
  const projectsBefore = await prisma.project.count();
  const tasksBefore = await prisma.task.count();
  const phasesBefore = await prisma.projectPhase.count();
  const milestonesBefore = await prisma.milestone.count();
  const auditsBefore = await prisma.auditLog.count({ where: { entityType: 'PROJECT' } });
  const receiptsBefore = await prisma.mutationReceipt.count();

  for (const [label, fields] of malformed) {
    const key = `rp04t02-top-${crypto.randomUUID()}`;
    const { response, json } = await postProject({
      name: `RP04 top-level ${label}`,
      type: 'TESTING',
      ...fields,
      tasks: [{ title: 'RP04 top-level fixture task', phaseKey: 'Top Level Phase' }],
      milestones: [{ name: 'RP04 top-level fixture milestone', date: '2026-10-02' }],
    }, key);
    assert.equal(response.status, 400, `${label}: ${JSON.stringify(json)}`);
    assert.equal(json.code, 'VALIDATION_ERROR', `${label}: ${JSON.stringify(json)}`);
    assert.equal(await prisma.mutationReceipt.count({ where: { actorId: actor.id, idempotencyKey: key } }), 0, `${label} must not leave a receipt`);
  }

  const sequenceAfter = await prisma.codeSequence.findUnique({ where: { scope_periodKey: { scope: 'PROJECT', periodKey: year } } });
  assert.equal(sequenceAfter?.lastValue ?? null, sequenceBefore?.lastValue ?? null, 'rejected commands must not advance the code sequence');
  assert.equal(await prisma.project.count(), projectsBefore, 'no partial project aggregate');
  assert.equal(await prisma.task.count(), tasksBefore, 'no partial task rows');
  assert.equal(await prisma.projectPhase.count(), phasesBefore, 'no partial phase rows');
  assert.equal(await prisma.milestone.count(), milestonesBefore, 'no partial milestone rows');
  assert.equal(await prisma.auditLog.count({ where: { entityType: 'PROJECT' } }), auditsBefore, 'no audit rows for rejected commands');
  assert.equal(await prisma.mutationReceipt.count(), receiptsBefore, 'no receipt rows for rejected commands');
});

test('RP04-T02 rejects malformed nested task scalars before normalization or persistence', async () => {
  const malformed = [
    ['applicability object', { applicability: { value: 'required' } }],
    ['applicability array', { applicability: ['required'] }],
    ['applicabilityStatus object', { applicabilityStatus: { value: 'required' } }],
    ['status object', { status: { value: 'NOT_STARTED' } }],
    ['priority array', { priority: ['HIGH'] }],
    ['title object', { title: { value: 'bad title' } }],
    ['sortOrder object', { sortOrder: { value: 1 } }],
    ['dueDate object', { dueDate: { value: '2026-10-02' } }],
  ];
  const projectsBefore = await prisma.project.count({ where: { createdById: actor.id } });
  const tasksBefore = await prisma.task.count();
  const phasesBefore = await prisma.projectPhase.count();
  const milestonesBefore = await prisma.milestone.count();
  for (const [label, fields] of malformed) {
    const response = await postProject({
      name: `RP04 malformed ${label}`,
      tasks: [{ title: 'valid task title', ...fields }],
      milestones: [{ name: 'valid milestone', date: '2026-10-02' }],
    });
    assert.equal(response.response.status, 400, `${label}: ${JSON.stringify(response.json)}`);
    assert.equal(response.json.code, 'VALIDATION_ERROR');
  }
  assert.equal(await prisma.project.count({ where: { createdById: actor.id } }), projectsBefore);
  assert.equal(await prisma.task.count(), tasksBefore);
  assert.equal(await prisma.projectPhase.count(), phasesBefore);
  assert.equal(await prisma.milestone.count(), milestonesBefore);
});
