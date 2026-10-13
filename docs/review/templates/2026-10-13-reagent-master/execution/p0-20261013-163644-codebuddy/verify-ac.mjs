/**
 * P0 真实数据库/HTTP 验收（仅针对本轮自有临时库 rdpms_test_p0acc 与其上的隔离后端 :3117）
 * 覆盖：AC-P0-02/03/04（保存读回往返）、AC-P0-05（复制与重映射、原模板不变）、
 *       AC-P0-06（apply + 新建项目持久化领域字段与真实阶段名）、
 *       AC-P0-07（已有项目套用合法路径 + 冲突无部分写入）、AC-P0-08（权限拒绝）
 * 用法：DATABASE_URL=<临时库> node verify-ac.mjs
 * 说明：使用真实 JWT 登录（非注入 actor），未修改任何鉴权代码。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(HERE, '../../../../../../');
const BACKEND = path.join(REPO_ROOT, 'rdpms-system/backend');
const require_ = createRequire(path.join(BACKEND, 'package.json'));
const { PrismaClient } = require_('@prisma/client');

const DB_URL = process.env.DATABASE_URL;
const BASE = 'http://127.0.0.1:3117';
const PWD = 'P0Acc-2026-Test9';
if (!DB_URL || !DB_URL.includes('rdpms_test_p0acc')) {
  console.error('FATAL: DATABASE_URL 必须指向本轮自有临时库');
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const results = {};
const req = async (method, url, { token, body } = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* noop */ }
  return { status: res.status, body: json };
};
const pickToken = (b) => b?.token || b?.accessToken || b?.data?.token || b?.data?.accessToken || null;

// ── 登录 ───────────────────────────────────────────────────────────────────────
const adminLogin = await req('POST', '/api/auth/login', { body: { username: 'test_super_admin', password: PWD } });
const token = pickToken(adminLogin.body);
const me = adminLogin.body?.user || adminLogin.body?.data?.user || {};
results.login = { status: adminLogin.status, tokenAcquired: !!token, userId: me.id || null };

const fixture = await prisma.projectTemplate.findUnique({ where: { code: 'TPL-P0-FIXTURE' }, select: { id: true } });
const FID = fixture.id;

// ── AC-P0-02/03：详情读取（config 简化结构 + 结构化补全；节点类型保真）──────────
const detail = await req('GET', `/api/project-templates/${FID}`, { token });
const ph = detail.body?.phases || [];
const allTasks = ph.flatMap((p) => p.tasks || []);
results.detailRead = {
  status: detail.status,
  phases: ph.length,
  tasks: allTasks.length,
  firstPhaseType: ph[0]?.type ?? null,
  deliverableNonNull: allTasks.filter((t) => t.expectedDeliverable).length,
  taskTypeNonNull: allTasks.filter((t) => t.taskType).length,
  required: allTasks.filter((t) => t.applicability === 'required').length,
  conditional: allTasks.filter((t) => t.applicability === 'conditional').length,
  configTypeInDbIsString: typeof detail.body?.config === 'string',
};

// ── AC-P0-02/03/04：保存（规范对象，含 phaseInfo/events/显式禁用/显式空值）→ 重读 ─
const cfg = typeof detail.body.config === 'string' ? JSON.parse(detail.body.config) : detail.body.config;
cfg.phases[0].phaseInfo = 'P0 验收：退出条件';
cfg.phases[0].events = [{ on: 'enter', action: 'notify' }];
cfg.phases[1].enabled = false;                       // 显式禁用（不得被重新启用）
cfg.phases[0].tasks[0].expectedDeliverable = '';     // 显式空值（不得被结构化行覆盖回原值）
const putRes = await req('PUT', `/api/project-templates/${FID}`, { token, body: { config: cfg } });
const reread = await req('GET', `/api/project-templates/${FID}`, { token });
const rph = reread.body?.phases || [];
const rcfgRaw = reread.body?.config;
const rcfg = typeof rcfgRaw === 'string' ? JSON.parse(rcfgRaw) : rcfgRaw;
results.roundTrip = {
  putStatus: putRes.status,
  savedAsObject: rcfgRaw !== null && typeof rcfgRaw === 'object',
  configVersion: rcfg?.configVersion ?? null,
  typePreserved: rph[0]?.type === 'approval',
  phaseInfoPreserved: rph[0]?.phaseInfo === 'P0 验收：退出条件',
  eventsPreserved: Array.isArray(rph[0]?.events) && rph[0].events.length === 1,
  disabledPhaseStillDisabled: rph[1]?.enabled === false,
  explicitEmptyDeliverableKept: rph[0]?.tasks?.[0]?.expectedDeliverable === '',
  otherTaskDeliverableKept: (rph[0]?.tasks?.[1]?.expectedDeliverable ?? null) !== null,
};

// ── AC-P0-04：损坏/非法引用被明确拒绝，原记录不变 ───────────────────────────────
const beforeInvalid = await prisma.projectTemplate.findUnique({ where: { id: FID }, select: { name: true, config: true } });
const bad1 = await req('PUT', `/api/project-templates/${FID}`, { token, body: { config: '{不是 JSON' } });
const bad2 = await req('PUT', `/api/project-templates/${FID}`, {
  token,
  body: { config: { phases: [{ id: 'dup', name: 'A', order: 1, tasks: [] }, { id: 'dup', name: 'B', order: 2, tasks: [] }] } },
});
const bad3 = await req('PUT', `/api/project-templates/${FID}`, {
  token,
  body: { config: { phases: [{ id: 'x', name: 'A', order: 1, nextPhaseIds: ['missing'], tasks: [] }] } },
});
const afterInvalid = await prisma.projectTemplate.findUnique({ where: { id: FID }, select: { name: true, config: true } });
results.rejection = {
  brokenJson: { status: bad1.status, code: bad1.body?.error?.code ?? bad1.body?.code ?? null },
  duplicateIds: { status: bad2.status, code: bad2.body?.error?.code ?? bad2.body?.code ?? null },
  invalidRef: { status: bad3.status, code: bad3.body?.error?.code ?? bad3.body?.code ?? null },
  recordUnchanged: JSON.stringify(beforeInvalid.config) === JSON.stringify(afterInvalid.config),
};

// ── AC-P0-05：复制（领域内容保留、内部引用重映射、原模板不变）────────────────────
const copyRes = await req('POST', `/api/project-templates/${FID}/copy`, { token });
const copyId = copyRes.body?.template?.id;
const copyDetail = copyId ? await req('GET', `/api/project-templates/${copyId}`, { token }) : { status: 0, body: null };
const cph = copyDetail.body?.phases || [];
const ccfgRaw = copyDetail.body?.config;
const ccfg = typeof ccfgRaw === 'string' ? JSON.parse(ccfgRaw) : ccfgRaw;
const cTaskCount = cph.flatMap((p) => p.tasks || []).length;
const cDeliverableNonNull = cph.flatMap((p) => p.tasks || []).filter((t) => t.expectedDeliverable).length;
const originAfterCopy = await req('GET', `/api/project-templates/${FID}`, { token });
results.copy = {
  copyStatus: copyRes.status,
  copyIdAcquired: !!copyId,
  copyIsMaster: copyDetail.body?.isMaster ?? null,
  copyStatusField: copyDetail.body?.status ?? null,
  copyPhases: cph.length,
  copyTasks: cTaskCount,
  copyDeliverableNonNull: cDeliverableNonNull,
  configCopied: !!ccfg,
  phaseIdsRemapped: !!ccfg && ccfg.phases[0].id !== cfg.phases[0].id,
  nextRefsSelfConsistent: !!ccfg && ccfg.phases.every((p) => (p.nextPhaseIds || []).every((nid) => ccfg.phases.some((q) => q.id === nid))),
  originUnchanged: originAfterCopy.body?.phases?.[0]?.phaseInfo === 'P0 验收：退出条件',
};

// ── AC-P0-06：apply 载荷 + 新建项目持久化 ───────────────────────────────────────
const applyRes = await req('POST', `/api/project-templates/${FID}/apply`, { token, body: { startDate: new Date().toISOString() } });
const payload = applyRes.body?.payload || {};
results.applyPayload = {
  status: applyRes.status,
  tasks: payload.tasks?.length ?? 0,
  firstPhaseName: payload.phases?.[0]?.name ?? null,
  firstTaskDeliverable: payload.tasks?.[0]?.expectedDeliverable ?? null,
  firstTaskTemplateTaskId: payload.tasks?.[0]?.templateTaskId ?? null,
  counts: payload.counts ?? null,
  runtimeUnsupportedKeys: Object.keys(payload.runtimeUnsupported || {}).length,
};

const createRes = await req('POST', '/api/projects', {
  token,
  body: {
    name: 'P0 验收项目（临时库）',
    type: 'TESTING',
    managerId: me.id,
    participantIds: [],
    startDate: new Date().toISOString(),
    templateId: FID,
    tasks: (payload.tasks || []).map((t) => ({ ...t, phaseId: t.templatePhaseId, assigneeId: me.id })),
    milestones: [],
  },
});
const projId = createRes.body?.id || createRes.body?.project?.id || null;
const dbTasks = projId ? await prisma.task.findMany({ where: { projectId: projId }, orderBy: { sortOrder: 'asc' } }) : [];
const dbPhases = projId ? await prisma.projectPhase.findMany({ where: { projectId: projId }, orderBy: { sortOrder: 'asc' } }) : [];
results.newProjectPersisted = {
  createStatus: createRes.status,
  projectId: projId,
  phaseCount: dbPhases.length,
  taskCount: dbTasks.length,
  deliverableNonNull: dbTasks.filter((t) => t.expectedDeliverable).length,
  taskTypeNonNull: dbTasks.filter((t) => t.taskType).length,
  regulatoryPriorityNonNull: dbTasks.filter((t) => t.regulatoryPriority).length,
  applicabilityCounts: dbTasks.reduce((acc, t) => ({ ...acc, [t.applicability]: (acc[t.applicability] || 0) + 1 }), {}),
  templateTaskIdNonNull: dbTasks.filter((t) => t.templateTaskId).length,
  firstPhaseName: dbPhases[0]?.name ?? null,
  noKeyLikePhaseName: dbPhases.every((p) => !/^p\d+$/i.test(p.name)),
};

// ── AC-P0-07：已有项目套用（完整独立项目 + 冲突无部分写入）──────────────────────
const proj2Res = await req('POST', '/api/projects', {
  token,
  body: { name: 'P0 验收项目2（套用模板）', type: 'TESTING', managerId: me.id, participantIds: [], startDate: new Date().toISOString() },
});
const proj2Id = proj2Res.body?.id || proj2Res.body?.project?.id || null;
const applyToExisting = await req('POST', `/api/projects/${proj2Id}/apply-template`, {
  token,
  body: { templateId: FID, startDate: new Date().toISOString() },
});
const p2Tasks = proj2Id ? await prisma.task.findMany({ where: { projectId: proj2Id } }) : [];
const p2Phases = proj2Id ? await prisma.projectPhase.findMany({ where: { projectId: proj2Id }, orderBy: { sortOrder: 'asc' } }) : [];
const beforeConflict = p2Tasks.length;
const conflict = await req('POST', `/api/projects/${proj2Id}/apply-template`, { token, body: { templateId: FID } });
const afterConflict = proj2Id ? await prisma.task.count({ where: { projectId: proj2Id } }) : 0;
results.applyToExistingProject = {
  createStatus: proj2Res.status,
  applyStatus: applyToExisting.status,
  taskCount: p2Tasks.length,
  deliverableNonNull: p2Tasks.filter((t) => t.expectedDeliverable).length,
  applicabilityCounts: p2Tasks.reduce((acc, t) => ({ ...acc, [t.applicability]: (acc[t.applicability] || 0) + 1 }), {}),
  firstPhaseName: p2Phases[0]?.name ?? null,
  conflictStatus: conflict.status,
  conflictCode: conflict.body?.error?.code ?? conflict.body?.code ?? null,
  tasksBeforeConflict: beforeConflict,
  tasksAfterConflict: afterConflict,
  noPartialWrite: beforeConflict === afterConflict,
};

// ── AC-P0-08：权限负例（真实 JWT，未修改鉴权）───────────────────────────────────
const viewerLogin = await req('POST', '/api/auth/login', { body: { username: 'test_viewer', password: PWD } });
const viewerToken = pickToken(viewerLogin.body);
const denyPut = await req('PUT', `/api/project-templates/${FID}`, { token: viewerToken, body: { name: '越权改名' } });
const denyCopy = viewerToken ? await req('POST', `/api/project-templates/${FID}/copy`, { token: viewerToken }) : { status: 0 };
const stillSame = await req('GET', `/api/project-templates/${FID}`, { token });
results.permissionDenial = {
  viewerLoginStatus: viewerLogin.status,
  viewerTokenAcquired: !!viewerToken,
  putStatus: denyPut.status,
  copyStatus: denyCopy.status,
  putDenied: denyPut.status === 403,
  nameUnchanged: stillSame.body?.name === 'P0 合成夹具模板（试剂/芯片母版副本）',
};

// 说明：本脚本在 AC-P0-04 用例中把第 1 个任务的 expectedDeliverable 显式置为空串（验证「显式空值不被覆盖」），
// 该条在后续统计中即为「空」，因此交付物非空数量为 65 - 1 = 64（属预期，不是丢失）。
const EXPECTED_DELIVERABLE_NON_NULL = 64;
results.summary = {
  ac02_roundTripOk: results.roundTrip.putStatus === 200 && results.roundTrip.phaseInfoPreserved && results.roundTrip.typePreserved,
  ac03_nodeFieldsOk: results.roundTrip.eventsPreserved && results.roundTrip.phaseInfoPreserved,
  ac04_rejectionOk: results.rejection.brokenJson.status >= 400 && results.rejection.duplicateIds.status >= 400 && results.rejection.invalidRef.status >= 400 && results.rejection.recordUnchanged,
  ac04_explicitEmptyKept: results.roundTrip.explicitEmptyDeliverableKept === true,
  ac05_copyOk: results.copy.copyDeliverableNonNull === EXPECTED_DELIVERABLE_NON_NULL
    && results.copy.phaseIdsRemapped === true
    && results.copy.originUnchanged === true
    && results.copy.nextRefsSelfConsistent === true,
  ac06_newProjectOk: results.newProjectPersisted.deliverableNonNull === EXPECTED_DELIVERABLE_NON_NULL
    && results.newProjectPersisted.templateTaskIdNonNull === 65
    && results.newProjectPersisted.applicabilityCounts?.REQUIRED === 56
    && results.newProjectPersisted.applicabilityCounts?.CONDITIONAL === 9
    && results.newProjectPersisted.noKeyLikePhaseName === true,
  ac07_applyExistingOk: results.applyToExistingProject.applyStatus === 200
    && results.applyToExistingProject.noPartialWrite === true
    && results.applyToExistingProject.conflictCode === 'TEMPLATE_ALREADY_APPLIED',
  ac08_permissionOk: results.permissionDenial.putDenied === true && results.permissionDenial.nameUnchanged === true,
};

console.log(JSON.stringify(results, null, 2));
await prisma.$disconnect();
