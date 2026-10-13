/**
 * AC-P0-01 真实导出夹具验证（执行指令第 139 行：以本次导出建立合成夹具）。
 * 使用 inputs/template-export.json（真实母版导出，sha256 536b4f88…）验证：
 * 稳定 ID 合并后 13 阶段 / 65 任务、65 个交付物、56 REQUIRED / 9 CONDITIONAL 语义保留。
 * 运行：node verify-with-real-export.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const HERE = path.dirname(new URL(import.meta.url).pathname);
// execution/p0-*/ → …/docs/review/templates/2026-10-13-reagent-master/；仓库根需上溯 6 层
const REPO_ROOT = path.resolve(HERE, '../../../../../../');
const MODULE_PATH = path.join(REPO_ROOT, 'rdpms-system/backend/src/modules/projectTemplates/canonicalTemplate.js');
const { buildCanonicalTemplate, buildInstantiationPlan } = await import(MODULE_PATH);

const INPUTS = path.join(HERE, '..', '..', 'inputs', 'template-export.json');
const exp = JSON.parse(fs.readFileSync(INPUTS, 'utf8'));

// 真实导出 → 夹具：config 原始字符串 + 结构化阶段（camelCase，与 Prisma 查询结果同形）
const tpl = { config: exp.template.config, phases: exp.structuredPhases };
const built = buildCanonicalTemplate(tpl);
assert.equal(built.ok, true, `canonical build failed: ${built.error}`);

const phases = built.canonical.phases;
const tasks = phases.flatMap((p) => p.tasks);

const structuredTasks = exp.structuredPhases.flatMap((p) => p.tasks);
const structById = new Map(structuredTasks.map((t) => [t.id, t]));

const results = {
  source: built.source,
  configVersion: built.canonical.configVersion,
  phaseCount: phases.length,
  taskCount: tasks.length,
  perPhaseTaskCounts: phases.map((p) => p.tasks.length),
  deliverableNonNull: tasks.filter((t) => t.expectedDeliverable !== null && t.expectedDeliverable !== '').length,
  applicabilityCounts: {
    required: tasks.filter((t) => t.applicability === 'required').length,
    conditional: tasks.filter((t) => t.applicability === 'conditional').length,
  },
  taskTypeNonNull: tasks.filter((t) => t.taskType != null).length,
  estimatedHoursNonNull: tasks.filter((t) => typeof t.estimatedHours === 'number').length,
  mismatchWithStructured: [],
};

// 逐字段与结构化表对照（稳定 ID 合并正确性）
for (const t of tasks) {
  const row = structById.get(t.id);
  if (!row) { results.mismatchWithStructured.push({ id: t.id, reason: 'structured row missing' }); continue; }
  if ((row.expectedDeliverable ?? null) !== (t.expectedDeliverable ?? null)) {
    results.mismatchWithStructured.push({ id: t.id, field: 'expectedDeliverable', canonical: t.expectedDeliverable, structured: row.expectedDeliverable });
  }
  if (String(row.applicability).toLowerCase() !== t.applicability) {
    results.mismatchWithStructured.push({ id: t.id, field: 'applicability', canonical: t.applicability, structured: row.applicability });
  }
  if ((row.taskType ?? null) !== (t.taskType ?? null)) {
    results.mismatchWithStructured.push({ id: t.id, field: 'taskType', canonical: t.taskType, structured: row.taskType });
  }
}

// 阶段节点信息（真实母版 p1 = approval 来自 config）
results.phaseTypes = phases.map((p) => p.type);
results.firstPhaseTasksSample = phases[0].tasks.slice(0, 2).map((t) => ({ id: t.id, title: t.title, deliverable: t.expectedDeliverable, applicability: t.applicability }));

const plan = buildInstantiationPlan(built.canonical, { startDate: '2026-10-13T00:00:00.000Z' });
results.planCounts = plan.counts;
results.planFirstPhaseName = plan.phases[0]?.name;

// ── 断言（AC-P0-01）───────────────────────────────────────────────────────────
assert.equal(phases.length, 13, '阶段数应为 13');
assert.equal(tasks.length, 65, '任务数应为 65');
assert.deepEqual(results.perPhaseTaskCounts, [7, 6, 6, 3, 3, 5, 5, 8, 4, 4, 5, 4, 5], '逐阶段任务数应与导出一致');
assert.equal(results.deliverableNonNull, 65, '65 个交付物必须全部保留');
assert.equal(results.applicabilityCounts.required, 56, 'REQUIRED 应为 56');
assert.equal(results.applicabilityCounts.conditional, 9, 'CONDITIONAL 应为 9');
assert.equal(results.taskTypeNonNull, 65, 'taskType 应全部保留');
assert.equal(results.estimatedHoursNonNull, 65, '人时应全部保留');
assert.equal(results.mismatchWithStructured.length, 0, '与结构化表逐字段对照不应有差异');
assert.equal(results.phaseTypes[0], 'approval', 'p1 approval 类型应保留（来自 config）');

console.log(JSON.stringify({ ...results, verdict: 'PASS_AC_P0_01_REAL_EXPORT_FIXTURE' }, null, 2));
