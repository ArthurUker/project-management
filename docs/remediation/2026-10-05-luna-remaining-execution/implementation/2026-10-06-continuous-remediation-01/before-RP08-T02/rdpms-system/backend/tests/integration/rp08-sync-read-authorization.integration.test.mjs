import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';

const prisma = new PrismaClient();
const suffix = crypto.randomUUID();
const actors = {};
let project;
let app;
let currentActor;

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  for (const key of ['member', 'other', 'outsider']) {
    actors[key] = await prisma.user.create({ data: {
      id: `rp08-${key}-${suffix}`, username: `rp08-${key}-${suffix}`,
      displayName: `RP08 ${key}`, passwordHash: 'synthetic-only', systemRole: 'ADMIN', status: 'ACTIVE',
    } });
  }
  project = await prisma.project.create({ data: {
    code: `RP08-${suffix}`, name: 'RP08 synthetic project', type: 'TESTING', status: 'PLANNING',
    managerId: actors.member.id, createdById: actors.member.id,
    members: { create: [
      { userId: actors.member.id, role: 'MEMBER', createdById: actors.member.id },
      { userId: actors.other.id, role: 'VIEWER', createdById: actors.member.id },
    ] },
    tasks: { create: [{ id: `rp08-task-${suffix}`, title: 'Visible task', createdById: actors.member.id }] },
    reports: { create: [
      { id: `rp08-report-own-${suffix}`, authorId: actors.member.id, reportType: 'MONTHLY', periodKey: '2026-10', content: { body: 'own' } },
      { id: `rp08-report-other-${suffix}`, authorId: actors.other.id, reportType: 'MONTHLY', periodKey: '2026-10', content: { body: 'other' } },
    ] },
  } });
  await prisma.projectPhase.create({ data: { projectId: project.id, code: 'P1', name: 'Phase', sortOrder: 1 } });
  await prisma.milestone.create({ data: { projectId: project.id, name: 'Milestone', dueDate: new Date('2026-10-31') } });
  await prisma.monthlyProgress.create({ data: {
    projectId: project.id, periodKey: '2026-10', submittedById: actors.member.id,
    actualWork: 'synthetic progress',
  } });
  currentActor = { userId: actors.member.id, user: actors.member, systemRole: 'ADMIN', permissions: ['tasks.view'] };
  app = createApp({ db: prisma, actorResolver: async () => currentActor });
});

after(async () => {
  if (project) await prisma.project.deleteMany({ where: { id: project.id } });
  for (const user of Object.values(actors)) await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.$disconnect();
});

async function pull() {
  const response = await app.request('/api/sync/init');
  const body = await response.json();
  return { response, body };
}

test('sync read permissions, project membership, report own-only and field projection use persisted rows', async () => {
  // Authorized success precondition: active synthetic member, effective task-view grant, project/task exist in PostgreSQL.
  let result = await pull();
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.acl.projectIds.includes(project.id));
  assert.ok(result.body.changes.tasks.upserts.some((row) => row.id === `rp08-task-${suffix}`));
  const task = result.body.changes.tasks.upserts.find((row) => row.id === `rp08-task-${suffix}`);
  assert.equal(task.title, 'Visible task');
  assert.equal(Object.hasOwn(task, 'createdById'), false);
  assert.equal(Object.hasOwn(task, 'deletedAt'), false);
  assert.deepEqual(result.body.changes.reports.upserts, [], 'reports.view is absent, so report rows must not be returned');

  currentActor = { ...currentActor, permissions: [
    'projects.view', 'project_phases.view', 'milestones.view', 'progress.view',
  ] };
  result = await pull();
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.changes.projects.upserts.some((row) => row.id === project.id));
  assert.equal(Object.hasOwn(result.body.changes.projects.upserts.find((row) => row.id === project.id), 'metadata'), false);
  assert.ok(result.body.changes.projectPhases.upserts.some((row) => row.projectId === project.id));
  assert.ok(result.body.changes.milestones.upserts.some((row) => row.projectId === project.id));
  assert.ok(result.body.changes.monthlyProgress.upserts.some((row) => row.projectId === project.id));
  assert.ok(result.body.changes.projectMembers.upserts.some((row) => row.userId === actors.member.id));
  assert.deepEqual(result.body.changes.tasks.upserts, []);
  assert.deepEqual(result.body.changes.reports.upserts, []);

  currentActor = { ...currentActor, permissions: ['reports.view'] };
  result = await pull();
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.changes.tasks.upserts, [], 'tasks.view is absent');
  assert.deepEqual(result.body.changes.reports.upserts.map((row) => row.id), [`rp08-report-own-${suffix}`]);

  currentActor = { ...currentActor, userId: actors.outsider.id, user: actors.outsider, permissions: ['tasks.view', 'reports.view'] };
  result = await pull();
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.acl.projectIds, []);
  assert.deepEqual(result.body.changes.tasks.upserts, []);
  assert.deepEqual(result.body.changes.reports.upserts, []);
});

// ── LR2-04 补验：成员/非成员、VIEWER、SUPER_ADMIN(elevated)、零权限的逐实体矩阵 ──
//
// 覆盖边界（明确声明）：
//   * 身份为 createApp 注入的可信 actor（真实 PostgreSQL 中的合成用户行），**不是**完整 JWT 链证据；
//   * 读投影以 SYNC_ENTITIES 的已批准 readPermission / readFields 为准，键集合在此显式断言，
//     任何漂移都必须被复核（不得"跟着实现改期望"）；
//   * own-only（reports）对所有身份生效，包括 SUPER_ADMIN：同步下拉只返回本人撰写的汇报；
//   * 缓存撤权清理与历史回填仍属 RP08-T02（T-RP-04 / T-RP-12），本任务不覆盖、不激活；
//   * 同步读路径不写 elevated 审计（elevated 审计属在线读端点），本用例只断言可观察的可见性。

const SYNC_READ_MATRIX = {
  projects: {
    permission: 'projects.view',
    fields: ['actualEndDate', 'code', 'createdAt', 'endDate', 'id', 'isDraft', 'manager',
      'managerId', 'name', 'positioning', 'startDate', 'status', 'subtype', 'templateId',
      'type', 'updatedAt'],
    forbidden: ['metadata', 'createdById', 'deletedAt', 'updatedById', 'description'],
  },
  projectPhases: {
    permission: 'project_phases.view',
    fields: ['actualEnd', 'actualStart', 'code', 'createdAt', 'id', 'isMilestone', 'name',
      'notes', 'plannedEnd', 'plannedStart', 'progressPercent', 'projectId', 'sortOrder',
      'status', 'templatePhaseId', 'updatedAt'],
    forbidden: ['createdById', 'deletedAt', 'updatedById'],
  },
  tasks: {
    permission: 'tasks.view',
    fields: ['actualHours', 'applicability', 'assigneeId', 'code', 'completedAt', 'createdAt',
      'description', 'dueDate', 'estimatedHours', 'expectedDeliverable', 'id', 'parentId',
      'phaseId', 'priority', 'progressPercent', 'projectId', 'regulatoryNotes',
      'regulatoryPriority', 'sortOrder', 'startDate', 'startedAt', 'status', 'taskType',
      'templateTaskId', 'title', 'updatedAt'],
    forbidden: ['createdById', 'deletedAt', 'updatedById'],
  },
  milestones: {
    permission: 'milestones.view',
    fields: ['completedAt', 'createdAt', 'description', 'dueDate', 'id', 'name', 'phaseId',
      'projectId', 'status', 'updatedAt'],
    forbidden: ['createdById', 'deletedAt', 'updatedById'],
  },
  monthlyProgress: {
    permission: 'progress.view',
    fields: ['actualWork', 'completionPercent', 'createdAt', 'id', 'nextPlan', 'periodKey',
      'projectId', 'projectStatus', 'risks', 'submittedAt', 'submittedById', 'updatedAt'],
    forbidden: ['createdById', 'deletedAt', 'updatedById'],
  },
  reports: {
    permission: 'reports.view',
    fields: ['authorId', 'content', 'createdAt', 'currentVersion', 'id', 'periodEnd', 'periodKey',
      'periodStart', 'projectId', 'reportType', 'reviewNote', 'reviewedAt', 'status',
      'submittedAt', 'updatedAt'],
    forbidden: ['deletedAt', 'reviewerId', 'updatedById', 'createdById'],
  },
  projectMembers: {
    permission: 'projects.view',
    fields: ['id', 'joinedAt', 'projectId', 'role', 'userId'],
    forbidden: ['leftAt', 'createdById', 'updatedById'],
  },
};

const ALL_READ_PERMISSIONS = [...new Set(Object.values(SYNC_READ_MATRIX).map((row) => row.permission))];

let matrixCache = null;

async function buildMatrixFixtures() {
  if (matrixCache) return matrixCache;
  const suffix = crypto.randomUUID();
  const users = {};
  for (const key of ['member', 'viewer', 'outsider', 'zero', 'superAdmin']) {
    users[key] = await prisma.user.create({ data: {
      id: `rp08m-${key}-${suffix}`, username: `rp08m-${key.toLowerCase()}-${suffix}`,
      displayName: `RP08 matrix ${key}`, passwordHash: 'synthetic-only',
      systemRole: key === 'superAdmin' ? 'SUPER_ADMIN' : 'ADMIN', status: 'ACTIVE',
    } });
  }
  const project = await prisma.project.create({ data: {
    code: `RP08M-${suffix}`, name: 'RP08 matrix project', type: 'TESTING', status: 'PLANNING',
    managerId: users.member.id, createdById: users.member.id,
    members: { create: [
      { userId: users.member.id, role: 'OWNER', createdById: users.member.id },
      { userId: users.viewer.id, role: 'VIEWER', createdById: users.member.id },
      { userId: users.zero.id, role: 'MEMBER', createdById: users.member.id },
    ] },
    tasks: { create: [{ id: `rp08m-task-${suffix}`, title: 'Matrix task', createdById: users.member.id }] },
    reports: { create: [
      { id: `rp08m-report-member-${suffix}`, authorId: users.member.id, reportType: 'MONTHLY', periodKey: '2026-10', content: { body: 'member' } },
      { id: `rp08m-report-viewer-${suffix}`, authorId: users.viewer.id, reportType: 'MONTHLY', periodKey: '2026-10', content: { body: 'viewer' } },
      { id: `rp08m-report-zero-${suffix}`, authorId: users.zero.id, reportType: 'MONTHLY', periodKey: '2026-10', content: { body: 'zero' } },
    ] },
  } });
  await prisma.projectPhase.create({ data: { projectId: project.id, code: 'P1', name: 'Matrix phase', sortOrder: 1 } });
  await prisma.milestone.create({ data: { projectId: project.id, name: 'Matrix milestone', dueDate: new Date('2026-10-31') } });
  await prisma.monthlyProgress.create({ data: {
    projectId: project.id, periodKey: '2026-10', submittedById: users.member.id, actualWork: 'matrix progress',
  } });
  const reportIds = Object.fromEntries(Object.keys(users).map((name) => [name, []]));
  const storedReports = await prisma.report.findMany({
    where: { projectId: project.id }, select: { id: true, authorId: true },
  });
  for (const name of Object.keys(users)) {
    reportIds[name] = storedReports.filter((row) => row.authorId === users[name].id).map((row) => row.id);
  }
  matrixCache = { suffix, users, project, reportIds };
  return matrixCache;
}

function actorFor(fixtures, role, permissions) {
  const user = fixtures.users[role];
  return { userId: user.id, user, systemRole: user.systemRole, permissions };
}

const scopedTo = (row, project) => (row.projectId ?? row.id) === project.id;

test('RP08 LR2-04 each read permission gates exactly its own entity for a real project member', async () => {
  const fixtures = await buildMatrixFixtures();
  for (const [entity, row] of Object.entries(SYNC_READ_MATRIX)) {
    currentActor = actorFor(fixtures, 'member', [row.permission]);
    const { response, body } = await pull();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(body.changes[entity].upserts.some((item) => scopedTo(item, fixtures.project)),
      `${row.permission} must expose ${entity}`);
    for (const [other, otherRow] of Object.entries(SYNC_READ_MATRIX)) {
      if (other === entity || otherRow.permission === row.permission) continue;
      assert.deepEqual(body.changes[other].upserts, [], `${row.permission} must not expose ${other}`);
      assert.deepEqual(body.changes[other].tombstones, [], `${row.permission} must not expose ${other} tombstones`);
    }
  }
});

test('RP08 LR2-04 field projection equals the approved per-entity allowlist and never leaks forbidden columns', async () => {
  const fixtures = await buildMatrixFixtures();
  currentActor = actorFor(fixtures, 'member', ALL_READ_PERMISSIONS);
  const { response, body } = await pull();
  assert.equal(response.status, 200, JSON.stringify(body));
  for (const [entity, row] of Object.entries(SYNC_READ_MATRIX)) {
    const upserts = body.changes[entity].upserts.filter((item) => scopedTo(item, fixtures.project));
    assert.ok(upserts.length > 0, `${entity} must return the member's own project rows`);
    for (const item of upserts) {
      assert.deepEqual(Object.keys(item).sort(), [...row.fields].sort(),
        `${entity} field projection drifted: ${JSON.stringify(Object.keys(item).sort())}`);
      for (const forbidden of row.forbidden) {
        assert.equal(Object.hasOwn(item, forbidden), false, `${entity} must not expose ${forbidden}`);
      }
    }
  }
});

test('RP08 LR2-04 member, VIEWER, outsider, SUPER_ADMIN and zero-permission actors see the documented scope', async () => {
  const fixtures = await buildMatrixFixtures();
  const expectations = [
    { role: 'member', expectProject: true },
    { role: 'viewer', expectProject: true },
    { role: 'outsider', expectProject: false },
    { role: 'zero', expectProject: true },
    { role: 'superAdmin', expectProject: true },
  ];
  for (const { role, expectProject } of expectations) {
    const permissions = role === 'zero' ? [] : ALL_READ_PERMISSIONS;
    currentActor = actorFor(fixtures, role, permissions);
    const { response, body } = await pull();
    assert.equal(response.status, 200, `${role}: ${JSON.stringify(body)}`);
    assert.equal(body.acl.projectIds.includes(fixtures.project.id), expectProject,
      `${role} project scope mismatch: ${JSON.stringify(body.acl.projectIds)}`);
    assert.deepEqual(body.acl.permissions, permissions, `${role} acl.permissions must mirror the granted set`);
    assert.equal(typeof body.acl.aclVersion, 'string');
    assert.equal(body.acl.aclVersion.length, 16);
    for (const [entity, row] of Object.entries(SYNC_READ_MATRIX)) {
      const upserts = body.changes[entity].upserts;
      if (!expectProject || !permissions.includes(row.permission)) {
        assert.deepEqual(upserts, [], `${role} must receive no ${entity} rows`);
        assert.deepEqual(body.changes[entity].tombstones, [], `${role} must receive no ${entity} tombstones`);
        continue;
      }
      if (entity === 'reports') {
        // own-only：只允许本人撰写的汇报；作者集合必须与该身份自己的报告集合一致
        const authors = [...new Set(upserts.map((item) => item.authorId))];
        assert.ok(authors.every((author) => author === fixtures.users[role].id),
          `${role} reports must stay own-only: ${JSON.stringify(authors)}`);
        assert.deepEqual(upserts.map((item) => item.id).sort(),
          fixtures.reportIds[role].slice().sort(),
          `${role} must receive exactly its own reports`);
        continue;
      }
      assert.ok(upserts.some((item) => scopedTo(item, fixtures.project)), `${role} must receive ${entity} rows`);
    }
  }
});

test('RP08 LR2-04 elevated SUPER_ADMIN sees non-member projects but reports remain own-only', async () => {
  const fixtures = await buildMatrixFixtures();
  currentActor = actorFor(fixtures, 'superAdmin', ALL_READ_PERMISSIONS);
  const { response, body } = await pull();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.ok(body.acl.projectIds.includes(fixtures.project.id), 'elevated SUPER_ADMIN scope includes non-member projects');
  assert.ok(body.changes.tasks.upserts.some((row) => row.projectId === fixtures.project.id),
    'elevated scope exposes child entities of non-member projects');
  assert.ok(body.changes.reports.upserts.every((row) => row.authorId === fixtures.users.superAdmin.id),
    'elevated scope does not bypass own-only reports');
});

// ══ LR3-02 补验 B1–B5（普通 API ↔ 同步 成对对照 / elevated 非空 / 墓碑 / 增量 / 字段子集）══
//
// 覆盖边界：身份为注入可信 actor（真实 DB 合成用户行），不是完整 JWT 链证据；
// 字段合同来源为当前普通 API 实现（见 read-contract-matrix.md），不把 SYNC_ENTITIES 当批准依据；
// 不实施 RP08-T02 的缓存撤权/历史回填/水位政策，不改 sync.js、普通 API 或前端。

async function apiGet(targetApp, path) {
  const response = await targetApp.request(path);
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

async function pullWith(query) {
  const response = await app.request(`/api/sync/init${query}`);
  return { response, body: await response.json() };
}

/** 递归收集响应中的 id / userId / projectId，便于跨聚合与实体两种形状做同一断言 */
function collectIds(value, out = new Set()) {
  if (Array.isArray(value)) { value.forEach((item) => collectIds(item, out)); return out; }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'id' || key === 'userId' || key === 'projectId') && typeof item === 'string') out.add(item);
      collectIds(item, out);
    }
  }
  return out;
}

async function rowIdsOf(fixtures) {
  const memberRow = await prisma.projectMember.findFirst({
    where: { projectId: fixtures.project.id, userId: fixtures.users.member.id, leftAt: null },
  });
  const phase = await prisma.projectPhase.findFirst({ where: { projectId: fixtures.project.id } });
  const milestone = await prisma.milestone.findFirst({ where: { projectId: fixtures.project.id } });
  const progress = await prisma.monthlyProgress.findFirst({ where: { projectId: fixtures.project.id } });
  const task = await prisma.task.findFirst({ where: { projectId: fixtures.project.id } });
  return {
    project: fixtures.project.id,
    task: task.id,
    phase: phase.id,
    milestone: milestone.id,
    progress: progress.id,
    member: memberRow.id,
    report: fixtures.reportIds.member[0],
  };
}

const ORDINARY_PAIRS = [
  { entity: 'projects', permission: 'projects.view', path: (id) => `/api/projects/${id}`, row: 'project' },
  { entity: 'projectPhases', permission: 'project_phases.view', path: (id) => `/api/projects/${id}/phases`, row: 'phase' },
  { entity: 'tasks', permission: 'tasks.view', path: (id) => `/api/projects/${id}/tasks`, row: 'task' },
  { entity: 'milestones', permission: 'milestones.view', path: (id) => `/api/projects/${id}/milestones`, row: 'milestone' },
  { entity: 'monthlyProgress', permission: 'progress.view', path: (id) => `/api/progress?projectId=${id}`, row: 'progress' },
  { entity: 'reports', permission: 'reports.view', path: (id) => `/api/projects/${id}/reports`, row: 'report' },
  { entity: 'projectMembers', permission: 'projects.view', path: (id) => `/api/projects/${id}/members`, row: 'member' },
];

test('RP08 LR3-02 B1 every entity: ordinary API success pairs with sync delivery, and removing the permission denies both', async () => {
  const fixtures = await buildMatrixFixtures();
  const ids = await rowIdsOf(fixtures);
  for (const pair of ORDINARY_PAIRS) {
    currentActor = actorFor(fixtures, 'member', [pair.permission]);
    const online = await apiGet(app, pair.path(fixtures.project.id));
    assert.equal(online.status, 200, `${pair.entity} ordinary API: ${JSON.stringify(online.body)}`);
    assert.ok(collectIds(online.body).has(ids[pair.row]),
      `${pair.entity} ordinary API must return the real row ${ids[pair.row]}`);
    const granted = await pullWith('');
    assert.equal(granted.response.status, 200, JSON.stringify(granted.body));
    assert.ok(granted.body.changes[pair.entity].upserts.some((row) => row.id === ids[pair.row]),
      `${pair.entity} must be delivered by sync with ${pair.permission}`);

    currentActor = actorFor(fixtures, 'zero', []);
    const denied = await apiGet(app, pair.path(fixtures.project.id));
    assert.equal(denied.status, 403, `${pair.entity} ordinary API must reject without ${pair.permission}`);
    const noPermission = await pullWith('');
    assert.equal(noPermission.response.status, 200, JSON.stringify(noPermission.body));
    assert.deepEqual(noPermission.body.changes[pair.entity].upserts, [],
      `${pair.entity} must not be delivered by sync without ${pair.permission}`);
    assert.deepEqual(noPermission.body.changes[pair.entity].tombstones, [],
      `${pair.entity} tombstones must not leak without ${pair.permission}`);
  }
});

test('RP08 LR3-02 B1b losing project membership removes the project from both the ordinary API and the sync scope', async () => {
  const fixtures = await buildMatrixFixtures();
  const membership = await prisma.projectMember.findFirst({
    where: { projectId: fixtures.project.id, userId: fixtures.users.viewer.id, leftAt: null },
  });
  assert.ok(membership, 'viewer membership fixture must exist');
  currentActor = actorFor(fixtures, 'viewer', ALL_READ_PERMISSIONS);
  const before = await pullWith('');
  assert.ok(before.body.acl.projectIds.includes(fixtures.project.id));
  const detailBefore = await apiGet(app, `/api/projects/${fixtures.project.id}`);
  assert.equal(detailBefore.status, 200, JSON.stringify(detailBefore.body));

  await prisma.projectMember.update({ where: { id: membership.id }, data: { leftAt: new Date() } });

  const detailAfter = await apiGet(app, `/api/projects/${fixtures.project.id}`);
  assert.equal(detailAfter.status, 404, 'a non-member must not read the project detail');
  const after = await pullWith('');
  assert.equal(after.response.status, 200, JSON.stringify(after.body));
  assert.equal(after.body.acl.projectIds.includes(fixtures.project.id), false,
    'sync acl must drop the project after membership loss');
  for (const [entity] of Object.entries(SYNC_READ_MATRIX)) {
    assert.deepEqual(after.body.changes[entity].upserts, [], `${entity} rows must disappear with membership`);
  }
  // 复原，避免影响同库后续用例
  await prisma.projectMember.update({ where: { id: membership.id }, data: { leftAt: null } });
});

test('RP08 LR3-02 B2 SUPER_ADMIN sees a non-empty own report set while other authors stay invisible to sync', async () => {
  const fixtures = await buildMatrixFixtures();
  const own = await prisma.report.create({ data: {
    id: `rp08m-report-superadmin-${fixtures.suffix}`,
    projectId: fixtures.project.id, authorId: fixtures.users.superAdmin.id,
    reportType: 'MONTHLY', periodKey: '2026-10', content: { body: 'super-admin-own' },
  } });
  const others = [fixtures.reportIds.member[0], fixtures.reportIds.viewer[0], fixtures.reportIds.zero[0]];

  currentActor = actorFor(fixtures, 'superAdmin', ['reports.view']);
  const { response, body } = await pullWith('');
  assert.equal(response.status, 200, JSON.stringify(body));
  const ids = body.changes.reports.upserts.map((row) => row.id);
  assert.ok(ids.length > 0, 'the elevated own-report fixture must be non-empty');
  assert.deepEqual(ids, [own.id], 'sync reports must contain exactly the actor-authored report');
  for (const other of others) {
    assert.equal(ids.includes(other), false, `other author's report ${other} must not be delivered`);
  }
  assert.equal(body.changes.reports.upserts[0].authorId, fixtures.users.superAdmin.id);

  // 普通 API 侧同一项目对 SUPER_ADMIN 返回全部作者 → 证明 own-only 是同步的额外限制，而非在线合同
  const online = await apiGet(app, `/api/projects/${fixtures.project.id}/reports`);
  assert.equal(online.status, 200, JSON.stringify(online.body));
  const onlineIds = collectIds(online.body);
  for (const other of others) assert.ok(onlineIds.has(other), `ordinary API must still expose ${other}`);
  assert.ok(onlineIds.has(own.id));
});

test('RP08 LR3-02 B3 applicable tombstones are delivered with permission and never leak without it', async () => {
  const fixtures = await buildMatrixFixtures();
  const projectId = fixtures.project.id;
  const own = await prisma.report.create({ data: {
    id: `rp08m-report-tomb-${fixtures.suffix}`, projectId,
    authorId: fixtures.users.superAdmin.id, reportType: 'MONTHLY', periodKey: '2026-11',
    content: { body: 'tombstoned' }, deletedAt: new Date(),
  } });
  const memberReport = await prisma.report.create({ data: {
    id: `rp08m-report-tomb-member-${fixtures.suffix}`, projectId,
    authorId: fixtures.users.member.id, reportType: 'MONTHLY', periodKey: '2026-11',
    content: { body: 'tombstoned-member' }, deletedAt: new Date(),
  } });
  const deletedAt = new Date();
  const task = await prisma.task.create({ data: {
    id: `rp08m-task-tomb-${fixtures.suffix}`, projectId, title: 'tombstoned task',
    createdById: fixtures.users.member.id, deletedAt,
  } });
  const milestone = await prisma.milestone.create({ data: {
    id: `rp08m-milestone-tomb-${fixtures.suffix}`, projectId, name: 'tombstoned milestone',
    dueDate: new Date('2026-12-31'), deletedAt,
  } });
  const phase = await prisma.projectPhase.create({ data: {
    id: `rp08m-phase-tomb-${fixtures.suffix}`, projectId, code: 'P9', name: 'tombstoned phase',
    sortOrder: 9, deletedAt,
  } });
  const progress = await prisma.monthlyProgress.create({ data: {
    id: `rp08m-progress-tomb-${fixtures.suffix}`, projectId, periodKey: '2026-09',
    submittedById: fixtures.users.member.id, actualWork: 'tombstoned', deletedAt,
  } });
  const leftMember = await prisma.projectMember.create({ data: {
    id: `rp08m-member-left-${fixtures.suffix}`, projectId, userId: fixtures.users.outsider.id,
    role: 'MEMBER', createdById: fixtures.users.member.id, leftAt: new Date(),
  } });

  currentActor = actorFor(fixtures, 'member', ALL_READ_PERMISSIONS);
  const granted = await pullWith('');
  assert.equal(granted.response.status, 200, JSON.stringify(granted.body));
  const tombstoneOf = (entity) => granted.body.changes[entity].tombstones;
  assert.ok(tombstoneOf('tasks').includes(task.id), 'task tombstone must be delivered to a permitted member');
  assert.ok(tombstoneOf('milestones').includes(milestone.id), 'milestone tombstone must be delivered');
  assert.ok(tombstoneOf('projectPhases').includes(phase.id), 'phase tombstone must be delivered');
  assert.ok(tombstoneOf('monthlyProgress').includes(progress.id), 'progress tombstone must be delivered');
  assert.ok(tombstoneOf('projectMembers').includes(leftMember.id), 'left member tombstone must be delivered');
  assert.ok(tombstoneOf('reports').includes(memberReport.id), 'own report tombstone must be delivered');

  // 普通 API 的活跃视图不返回墓碑（deletedAt/leftAt 过滤）
  const onlineTasks = await apiGet(app, `/api/projects/${projectId}/tasks`);
  assert.equal(onlineTasks.status, 200);
  assert.equal(collectIds(onlineTasks.body).has(task.id), false,
    'ordinary active view must not return soft-deleted tasks');
  const onlineMembers = await apiGet(app, `/api/projects/${projectId}/members`);
  assert.equal(onlineMembers.status, 200);
  assert.equal(collectIds(onlineMembers.body).has(leftMember.id), false,
    'ordinary active view must not return left members');

  // 无权限时墓碑 ID 不得泄漏
  currentActor = actorFor(fixtures, 'zero', []);
  const noPermission = await pullWith('');
  for (const [entity] of Object.entries(SYNC_READ_MATRIX)) {
    assert.deepEqual(noPermission.body.changes[entity].tombstones, [],
      `${entity} tombstones must not leak without read permission`);
  }
  const secretIds = [task.id, milestone.id, phase.id, progress.id, leftMember.id, memberReport.id];
  const serialized = JSON.stringify(noPermission.body);
  for (const id of secretIds) {
    assert.equal(serialized.includes(id), false, `tombstoned row ${id} leaked to a zero-permission actor`);
  }

  // reports 墓碑同样受 own-only 约束
  currentActor = actorFor(fixtures, 'superAdmin', ['reports.view']);
  const elevated = await pullWith('');
  assert.deepEqual(elevated.body.changes.reports.tombstones, [own.id],
    'elevated actor must only see its own report tombstone');
  assert.equal(elevated.body.changes.reports.tombstones.includes(memberReport.id), false);

  // 非成员：全部实体（含墓碑）不可见
  currentActor = actorFor(fixtures, 'outsider', ALL_READ_PERMISSIONS);
  const outsider = await pullWith('');
  assert.deepEqual(outsider.body.acl.projectIds, []);
  const outsiderPayload = JSON.stringify(outsider.body);
  for (const id of secretIds.concat([own.id])) {
    assert.equal(outsiderPayload.includes(id), false, `non-member must not receive ${id}`);
  }
});

test('RP08 LR3-02 B4 incremental pull from a deterministic cut point returns only post-cut changes and tombstones', async () => {
  const fixtures = await buildMatrixFixtures();
  const projectId = fixtures.project.id;
  const deviceId = `rp08m-device-${fixtures.suffix}`;
  currentActor = actorFor(fixtures, 'member', [...ALL_READ_PERMISSIONS, 'tasks.update']);

  const full = await pullWith(`?deviceId=${deviceId}`);
  assert.equal(full.response.status, 200, JSON.stringify(full.body));
  assert.equal(full.body.full, true, 'the first pull must be a full pull');
  const cut = full.body.cursor;
  assert.ok(cut && !Number.isNaN(new Date(cut).getTime()), 'full pull must return a usable cursor');

  const beforeIds = await rowIdsOf(fixtures);
  assert.ok(full.body.changes.tasks.upserts.some((row) => row.id === beforeIds.task), 'full pull must include the task');
  assert.ok(full.body.changes.projectPhases.upserts.some((row) => row.id === beforeIds.phase), 'full pull must include the phase');

  const milestone = await prisma.milestone.create({ data: {
    id: `rp08m-milestone-incr-${fixtures.suffix}`, projectId, name: 'incremental milestone',
    dueDate: new Date('2026-12-31'),
  } });

  // 让数据库时间跨过切点毫秒边界（只用于避免同毫秒相等，不用于排序竞争）
  await new Promise((resolve) => { setTimeout(resolve, 50); });

  const updated = await app.request(`/api/tasks/${beforeIds.task}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'incremental task title' }),
  });
  assert.equal(updated.status, 200, JSON.stringify(await updated.json()));
  await prisma.milestone.update({ where: { id: milestone.id }, data: { deletedAt: new Date() } });

  const incremental = await pullWith(`?since=${encodeURIComponent(cut)}&deviceId=${deviceId}`);
  assert.equal(incremental.response.status, 200, JSON.stringify(incremental.body));
  assert.equal(incremental.body.full, false, 'a pull with since must not be a full pull');

  const taskUpserts = incremental.body.changes.tasks.upserts.map((row) => row.id);
  assert.ok(taskUpserts.includes(beforeIds.task), 'the post-cut task update must be delivered');
  const taskRow = incremental.body.changes.tasks.upserts.find((row) => row.id === beforeIds.task);
  assert.equal(taskRow.title, 'incremental task title');
  assert.ok(incremental.body.changes.milestones.tombstones.includes(milestone.id),
    'the post-cut milestone tombstone must be delivered');
  assert.equal(incremental.body.changes.projectPhases.upserts.some((row) => row.id === beforeIds.phase), false,
    'rows unchanged since the cut must not be re-delivered');
  assert.equal(incremental.body.changes.milestones.upserts.some((row) => row.id === milestone.id), false,
    'a tombstoned row must not also appear as an upsert');
  assert.ok(new Date(incremental.body.cursor) > new Date(cut), 'the incremental cursor must advance');
});

test('RP08 LR3-02 B5 sync fields are a verified subset of the ordinary API response, with forbidden columns absent', async () => {
  const fixtures = await buildMatrixFixtures();
  currentActor = actorFor(fixtures, 'member', ALL_READ_PERMISSIONS);
  const projectId = fixtures.project.id;

  const detail = await apiGet(app, `/api/projects/${projectId}`);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  const { response, body } = await pullWith('');
  assert.equal(response.status, 200, JSON.stringify(body));
  const projectRow = body.changes.projects.upserts.find((row) => row.id === projectId);
  assert.ok(projectRow, 'sync must deliver the project row');

  for (const key of Object.keys(projectRow)) {
    if (key === 'manager') continue;
    assert.ok(Object.hasOwn(detail.body, key), `sync project field ${key} must exist in the ordinary API response`);
  }
  for (const forbidden of ['metadata', 'createdById', 'updatedById', 'deletedAt']) {
    assert.equal(Object.hasOwn(projectRow, forbidden), false, `sync must not expose ${forbidden}`);
  }
  assert.deepEqual(Object.keys(projectRow.manager).sort(), ['displayName', 'id'],
    'sync nested manager must be the narrow projection');
  assert.ok(Object.keys(detail.body.manager).length > Object.keys(projectRow.manager).length,
    'ordinary API manager must be a wider projection (sync is a subset, not an equality requirement)');

  const tasks = await apiGet(app, `/api/projects/${projectId}/tasks`);
  assert.equal(tasks.status, 200, JSON.stringify(tasks.body));
  const taskRow = body.changes.tasks.upserts[0];
  assert.ok(taskRow, 'sync must deliver a task row');
  for (const nested of ['assignee', 'phase', 'regulatoryDocuments']) {
    assert.equal(Object.hasOwn(taskRow, nested), false, `sync task must not embed ${nested}`);
    assert.ok(JSON.stringify(tasks.body).includes(`"${nested}"`),
      `ordinary API task projection is expected to embed ${nested}`);
  }
  for (const key of Object.keys(taskRow)) {
    assert.ok(JSON.stringify(tasks.body).includes(`"${key}"`),
      `sync task field ${key} must be present in the ordinary API projection`);
  }
});

// ══ SUP-02 / LR4-02 测试补强（TEST_ONLY，业务源码零改动）════════════════════════════
//
// 目标：把七实体（projects/projectPhases/tasks/milestones/monthlyProgress/reports/
// projectMembers）的「同一真实行、逐字段键-值」对照固化到正式套件，取代原有的整段 JSON
// 子串搜键方式。成员入口是裸数组，其他入口可能为 list 或单对象，按真实响应形状提取指定
// ID。每个同步键必须属于同一在线行，标量/数组逐项 deepEqual；manager 等较窄嵌套投影逐键
// 比较在线同一对象；禁止字段（createdById/updatedById/deletedAt/reviewerId/leftAt/metadata
// 等）不出现。移除该实体读权限后，普通 API 拒绝（403），同步对应 upserts/tombstones 为空。
// 来源标 CURRENT_IMPLEMENTATION_COMPARISON；独立产品/安全字段政策批准仍 NOT_EVALUATED。

function extractOnlineRow(body, id) {
  if (Array.isArray(body)) return body.find((x) => x.id === id);
  if (body && typeof body === 'object') {
    if (body.id === id) return body;
    if (Array.isArray(body.list)) return body.list.find((x) => x.id === id);
  }
  return undefined;
}

/** 字段对照表的源码引用（当前实现的读投影与普通接口入口；只读核对得到，未修改业务） */
const FIELD_TABLE_SOURCE = {
  projects: { sync: 'rdpms-system/backend/src/routes/sync.js:53', ordinary: 'rdpms-system/backend/src/routes/projects.js:328' },
  projectPhases: { sync: 'rdpms-system/backend/src/routes/sync.js:68', ordinary: 'rdpms-system/backend/src/routes/projects.js:814' },
  tasks: { sync: 'rdpms-system/backend/src/routes/sync.js:84', ordinary: 'rdpms-system/backend/src/routes/projects.js:767' },
  milestones: { sync: 'rdpms-system/backend/src/routes/sync.js:106', ordinary: 'rdpms-system/backend/src/routes/projects.js:801' },
  monthlyProgress: { sync: 'rdpms-system/backend/src/routes/sync.js:124', ordinary: 'rdpms-system/backend/src/routes/progress.js:159' },
  reports: { sync: 'rdpms-system/backend/src/routes/sync.js:141', ordinary: 'rdpms-system/backend/src/routes/projects.js:787' },
  projectMembers: { sync: 'rdpms-system/backend/src/routes/sync.js:158', ordinary: 'rdpms-system/backend/src/routes/projects.js:703' },
};

test('RP08 LR4-02 SUP-02 exact-row field key/value comparison for all seven entities, plus permission denial', async () => {
  const fixtures = await buildMatrixFixtures();
  // 取每个实体的活跃行（过滤 deletedAt/leftAt），确保普通 API 的活跃视图一定返回它。
  const member = fixtures.users.member;
  const projectId = fixtures.project.id;
  const activeIds = {
    project: projectId,
    phase: (await prisma.projectPhase.findFirst({ where: { projectId, deletedAt: null } })).id,
    task: (await prisma.task.findFirst({ where: { projectId, deletedAt: null } })).id,
    milestone: (await prisma.milestone.findFirst({ where: { projectId, deletedAt: null } })).id,
    progress: (await prisma.monthlyProgress.findFirst({ where: { projectId, deletedAt: null } })).id,
    member: (await prisma.projectMember.findFirst({ where: { projectId, userId: member.id, leftAt: null } })).id,
    report: (await prisma.report.findFirst({ where: { projectId, authorId: member.id, deletedAt: null } })).id,
  };
  const grantedPermissions = [...ALL_READ_PERMISSIONS];
  const traces = [];

  for (const pair of ORDINARY_PAIRS) {
    const id = activeIds[pair.row];
    const matrix = SYNC_READ_MATRIX[pair.entity];

    // ── 1) 成功夹具：同一真实 actor（userId / systemRole / 成员资格 / 报告作者归属），带全部读权限 ──
    const grantedActor = actorFor(fixtures, 'member', grantedPermissions);
    currentActor = grantedActor;
    const online = await apiGet(app, pair.path(projectId));
    assert.equal(online.status, 200, `${pair.entity} ordinary API: ${JSON.stringify(online.body)}`);
    const onlineRow = extractOnlineRow(online.body, id);
    assert.ok(onlineRow, `${pair.entity} ordinary API must return the real active row ${id}`);
    assert.equal(onlineRow.id, id);

    const granted = await pullWith('');
    assert.equal(granted.response.status, 200, JSON.stringify(granted.body));
    const syncRow = granted.body.changes[pair.entity].upserts.find((x) => x.id === id);
    assert.ok(syncRow, `${pair.entity} sync must deliver the same real row ${id}`);
    assert.equal(syncRow.id, id);

    // 逐键逐值：每个同步键必须属于同一在线行；标量/数组 deepEqual；
    // manager 等较窄嵌套投影逐键比较在线同一对象（不要求整个响应相等）。
    const compared = [];
    for (const [key, value] of Object.entries(syncRow)) {
      assert.ok(Object.hasOwn(onlineRow, key), `sync ${pair.entity}.${key} must exist in the ordinary API row`);
      if (key === 'manager' && value && typeof value === 'object') {
        for (const [nested, v] of Object.entries(value)) {
          assert.ok(Object.hasOwn(onlineRow.manager ?? {}, nested),
            `sync ${pair.entity}.manager.${nested} must exist in the online object`);
          assert.deepEqual(v, onlineRow.manager[nested],
            `${pair.entity}.manager.${nested} must match the online object`);
          compared.push({ key: `manager.${nested}`, syncValue: v, onlineValue: onlineRow.manager[nested] });
        }
      } else {
        assert.deepEqual(value, onlineRow[key],
          `exact ${pair.entity}.${key} value must match the online row`);
        compared.push({ key, syncValue: value, onlineValue: onlineRow[key] });
      }
    }
    const forbiddenAbsent = [];
    for (const forbidden of matrix.forbidden) {
      assert.equal(Object.hasOwn(syncRow, forbidden), false,
        `${pair.entity} sync must not expose ${forbidden}`);
      forbiddenAbsent.push(forbidden);
    }

    // ── 2) 拒例：同一 actor，只移除该实体的目标读权限，其他权限与身份原样 ──
    const deniedPermissions = grantedPermissions.filter((code) => code !== pair.permission);
    const deniedActor = actorFor(fixtures, 'member', deniedPermissions);
    const removed = grantedPermissions.filter((code) => !deniedPermissions.includes(code));
    const added = deniedPermissions.filter((code) => !grantedPermissions.includes(code));
    assert.equal(deniedActor.userId, grantedActor.userId,
      `${pair.entity}: the denial must use the same userId, not another account`);
    assert.equal(deniedActor.systemRole, grantedActor.systemRole,
      `${pair.entity}: the denial must keep the same systemRole`);
    assert.deepEqual(removed, [pair.permission],
      `${pair.entity}: the permission difference must be exactly the target permission`);
    assert.deepEqual(added, [], `${pair.entity}: the denial must not add permissions`);
    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId: member.id, leftAt: null },
    });
    assert.ok(membership, `${pair.entity}: membership must stay unchanged for the same-actor contrast`);
    if (pair.entity === 'reports') {
      const reportRow = await prisma.report.findUnique({ where: { id } });
      assert.equal(reportRow.authorId, member.id,
        'the report target must belong to the same actor (own-only attribution unchanged)');
    }

    currentActor = deniedActor;
    const denied = await apiGet(app, pair.path(projectId));
    assert.equal(denied.status, 403,
      `${pair.entity} ordinary API must reject the same actor without ${pair.permission}: ${JSON.stringify(denied.body)}`);
    const noPermission = await pullWith('');
    assert.equal(noPermission.response.status, 200, JSON.stringify(noPermission.body));
    assert.deepEqual(noPermission.body.changes[pair.entity].upserts, [],
      `${pair.entity} must not be delivered by sync without ${pair.permission}`);
    assert.deepEqual(noPermission.body.changes[pair.entity].tombstones, [],
      `${pair.entity} tombstones must not leak without ${pair.permission}`);

    traces.push({
      entity: pair.entity,
      ordinaryEntrypoint: pair.path(projectId),
      responseShape: Array.isArray(online.body)
        ? 'bare-array'
        : (Array.isArray(online.body?.list) ? 'list-object' : 'single-object'),
      permission: pair.permission,
      targetId: id,
      syncFieldCount: Object.keys(syncRow).length,
      syncFields: Object.keys(syncRow).sort(),
      compared,
      forbiddenChecked: forbiddenAbsent,
      syncSource: FIELD_TABLE_SOURCE[pair.entity].sync,
      ordinarySource: FIELD_TABLE_SOURCE[pair.entity].ordinary,
      denial: {
        sameActor: deniedActor.userId === grantedActor.userId,
        removedPermissions: removed,
        ordinaryStatus: denied.status,
        syncUpserts: noPermission.body.changes[pair.entity].upserts.length,
        syncTombstones: noPermission.body.changes[pair.entity].tombstones.length,
      },
      source: 'CURRENT_IMPLEMENTATION_COMPARISON',
    });
  }
  console.log(`SUP02_FIELD_TRACE ${JSON.stringify(traces)}`);
});
