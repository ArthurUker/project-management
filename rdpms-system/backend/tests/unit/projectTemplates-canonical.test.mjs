/**
 * P0 定向单元/契约测试：规范模板解析与投影（canonicalTemplate.js）
 * 覆盖：AC-P0-01（13/65、交付物、56 REQUIRED / 9 CONDITIONAL 语义）
 *       AC-P0-02（旧字符串与对象输入、保存读回、p1 approval）
 *       AC-P0-03（phaseInfo/事件/角色/子阶段/里程碑/禁用状态往返；事件仅保存）
 *       AC-P0-04（显式 false/0/空值不被覆盖；损坏配置与重复 ID/无效引用明确拒绝）
 *       AC-P0-05 单元层（复制重映射：原对象不被修改）
 * 运行：node --test tests/unit/projectTemplates-canonical.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalTemplate,
  buildInstantiationPlan,
  parseTemplateConfig,
  remapCanonicalIds,
  validateCanonicalPhases,
  CONFIG_VERSION,
} from '../../src/modules/projectTemplates/canonicalTemplate.js';

/** 结构化行夹具（模拟 TemplatePhase/TemplateTask 查询结果） */
function structuredFixture() {
  return [
    {
      id: 'ph-1',
      code: 'p1',
      name: '立项与需求确认',
      sortOrder: 1,
      plannedStartOffsetDays: 0,
      plannedDurationDays: 10,
      isMilestone: true,
      tasks: [
        {
          id: 'tk-1',
          code: 'T-1',
          title: '市场调研与需求收集',
          description: '收集需求',
          taskType: 'STRATEGY',
          applicability: 'REQUIRED',
          regulatoryPriority: 'P2',
          expectedDeliverable: '调研纪要',
          regulatoryNotes: null,
          estimatedHours: 16,
          assigneeRoleCode: null,
          sortOrder: 1,
        },
        {
          id: 'tk-2',
          title: 'C 类增强验证',
          description: null,
          taskType: 'PERFORMANCE_VALIDATION',
          applicability: 'CONDITIONAL',
          regulatoryPriority: 'P2',
          expectedDeliverable: '增强验证报告',
          regulatoryNotes: null,
          estimatedHours: 80,
          assigneeRoleCode: 'tech_lead',
          sortOrder: 2,
        },
      ],
    },
    {
      id: 'ph-2',
      code: 'p2',
      name: '项目管理机制',
      sortOrder: 2,
      plannedDurationDays: 5,
      isMilestone: false,
      tasks: [
        {
          id: 'tk-3',
          title: '团队组建与职责分工',
          taskType: 'OTHER',
          applicability: 'REQUIRED',
          regulatoryPriority: 'P2',
          expectedDeliverable: '职责表',
          estimatedHours: 8,
          sortOrder: 1,
        },
      ],
    },
  ];
}

/** 编辑器 config 夹具（JSON 字符串，仅含简化字段 —— 复现 SYS-01 场景） */
function configStringFixture() {
  return JSON.stringify({
    phases: [
      {
        id: 'ph-1',
        key: 'p1',
        name: '立项与需求确认',
        order: 1,
        totalDays: 10,
        type: 'approval',
        phaseInfo: '完成需求确认与声称边界',
        completionTip: '需产品与质量共同确认',
        allowSkip: false,
        events: [{ on: 'enter', action: 'notify' }],
        eventTemplates: [{ code: 'E1' }],
        isMilestone: true,
        enabled: true,
        nextPhaseIds: ['ph-2'],
        x: 100,
        y: 50,
        subPhases: [{ id: 'sub-1', name: '子阶段A', tasks: [{ id: 'tk-sub-1', title: '子任务A' }] }],
        tasks: [
          { id: 'tk-1', title: '市场调研与需求收集', priority: 'P2', estimatedDays: 2, role: 'member', source: 'template', enabled: true },
          { id: 'tk-2', title: 'C 类增强验证', priority: 'P2', estimatedDays: 10, role: 'member', source: 'template', enabled: false },
          { id: 'tk-new', title: '编辑器新增任务', priority: 'P3', estimatedDays: 1, role: 'member', source: 'editor', enabled: true },
        ],
      },
      {
        id: 'ph-2',
        key: 'p2',
        name: '项目管理机制',
        order: 2,
        totalDays: 5,
        type: 'normal',
        nextPhaseIds: [],
        tasks: [{ id: 'tk-3', title: '团队组建与职责分工', priority: 'P2', estimatedDays: 1, role: 'member', source: 'template', enabled: true }],
      },
    ],
    milestones: [{ id: 'm1', name: 'M1' }],
    customTopLevel: { keep: true },
  });
}

// ── AC-P0-01：交付物与适用性（config 缺字段时按同 ID 从结构化行补全）────────────
test('AC-P0-01 config 简化字段 + 结构化补全：交付物/适用性/任务类型不丢失', () => {
  const tpl = { config: configStringFixture(), phases: structuredFixture() };
  const built = buildCanonicalTemplate(tpl);
  assert.equal(built.ok, true, built.error);
  const phases = built.canonical.phases;
  assert.equal(phases.length, 2);

  const t1 = phases[0].tasks.find((t) => t.id === 'tk-1');
  assert.equal(t1.expectedDeliverable, '调研纪要', 'config 未携带时按同 ID 从结构化行补全交付物');
  assert.equal(t1.applicability, 'required');
  assert.equal(t1.taskType, 'STRATEGY');
  assert.equal(t1.regulatoryPriority, 'P2');
  assert.equal(t1.estimatedHours, 16, '人时按同 ID 补全');

  const t2 = phases[0].tasks.find((t) => t.id === 'tk-2');
  assert.equal(t2.applicability, 'conditional', 'CONDITIONAL 语义保留，不被补成 REQUIRED');
  assert.equal(t2.assigneeRoleCode, 'tech_lead', '角色意图按同 ID 补全');
  assert.equal(t2.enabled, false, '显式禁用保留');

  const t3 = phases[0].tasks.find((t) => t.id === 'tk-new');
  assert.equal(t3.expectedDeliverable, null, '编辑器新增且无结构化行：不伪造交付物');
  assert.equal(t3.applicability, 'required', '兼容缺省；不强加条件语义');

  // 条件统计（56/9 场景的语义检查）
  const allTasks = phases.flatMap((p) => p.tasks);
  assert.equal(allTasks.filter((t) => t.applicability === 'conditional').length, 1);
  assert.equal(allTasks.filter((t) => t.applicability === 'required').length, 3);
});

// ── AC-P0-02：旧字符串与对象输入；保存重开；p1 approval ───────────────────────
test('AC-P0-02 字符串与对象 config 均可读；节点类型 approval 保留；保存为对象后重读一致', () => {
  const strBuilt = buildCanonicalTemplate({ config: configStringFixture(), phases: structuredFixture() });
  assert.equal(strBuilt.ok, true);
  assert.equal(strBuilt.canonical.phases[0].type, 'approval', 'p1 approval 不被缺省成 normal');

  const objTpl = {
    config: JSON.parse(configStringFixture()),
    phases: structuredFixture(),
  };
  const objBuilt = buildCanonicalTemplate(objTpl);
  assert.equal(objBuilt.ok, true);
  assert.deepEqual(
    objBuilt.canonical.phases.map((p) => p.type),
    strBuilt.canonical.phases.map((p) => p.type),
    '字符串与对象输入得到一致的节点类型',
  );

  // 保存 → 重读（模拟 PUT 保存规范对象后再读取）
  const saved = objBuilt.canonical;
  assert.equal(saved.configVersion, CONFIG_VERSION, '保存结果带配置格式版本');
  const reread = buildCanonicalTemplate({ config: saved, phases: structuredFixture() });
  assert.equal(reread.ok, true);
  assert.equal(reread.canonical.phases[0].type, 'approval');
  assert.equal(reread.canonical.phases[0].tasks[0].expectedDeliverable, '调研纪要');
});

// ── AC-P0-03：节点信息/事件/子阶段/里程碑/禁用 往返；事件仅保存 ────────────────
test('AC-P0-03 phaseInfo/事件/子阶段/里程碑/禁用状态保存重开不丢（事件不执行）', () => {
  const built = buildCanonicalTemplate({ config: configStringFixture(), phases: structuredFixture() });
  assert.equal(built.ok, true);
  const p1 = built.canonical.phases[0];
  assert.equal(p1.phaseInfo, '完成需求确认与声称边界');
  assert.equal(p1.completionTip, '需产品与质量共同确认');
  assert.equal(p1.allowSkip, false);
  assert.deepEqual(p1.events, [{ on: 'enter', action: 'notify' }]);
  assert.deepEqual(p1.eventTemplates, [{ code: 'E1' }]);
  assert.equal(p1.subPhases.length, 1);
  assert.equal(p1.subPhases[0].name, '子阶段A');
  assert.equal(p1.x, 100);
  assert.equal(p1.y, 50);
  assert.equal(p1.isMilestone, true);
  assert.deepEqual(built.canonical.milestones, [{ id: 'm1', name: 'M1' }]);
  assert.deepEqual(built.canonical.customTopLevel, { keep: true }, '未知顶层键原样保留');

  // 事件与审批为"仅保存"能力：实例化计划必须显式登记不被执行
  const plan = buildInstantiationPlan(built.canonical, { startDate: '2026-10-13T00:00:00.000Z' });
  assert.equal(plan.runtimeUnsupported.events, 'event_config_not_executed');
  assert.equal(plan.runtimeUnsupported.approvalGating, 'no_approval_gate_engine');
});

// ── AC-P0-04：显式 false/0/空值不被覆盖；损坏与非法配置明确拒绝 ────────────────
test('AC-P0-04 显式 false/0/空串不被结构化行覆盖', () => {
  const cfg = {
    phases: [
      {
        id: 'ph-1',
        name: '显式空值阶段',
        order: 1,
        enabled: false,
        type: 'normal',
        tasks: [
          { id: 'tk-1', title: '任务', estimatedDays: 0, applicability: 'conditional', expectedDeliverable: '', enabled: false },
        ],
      },
    ],
  };
  const built = buildCanonicalTemplate({ config: cfg, phases: structuredFixture() });
  assert.equal(built.ok, true, built.error);
  const t = built.canonical.phases[0].tasks[0];
  assert.equal(t.estimatedDays, 0, '显式 0 不得被结构化行覆盖');
  assert.equal(t.expectedDeliverable, '', '显式空串保留（不得被旧行覆盖成有值）');
  assert.equal(t.enabled, false, '显式禁用保留');
  assert.equal(built.canonical.phases[0].enabled, false, '阶段级禁用保留');
});

test('AC-P0-04 损坏 config / 重复 ID / 无效连线引用均明确拒绝', () => {
  const broken = buildCanonicalTemplate({ config: '{不是JSON', phases: structuredFixture() });
  assert.equal(broken.ok, false);
  assert.match(broken.error, /CONFIG_INVALID/);

  const dupPhase = buildCanonicalTemplate({
    config: { phases: [{ id: 'ph-1', name: 'A', order: 1, tasks: [] }, { id: 'ph-1', name: 'B', order: 2, tasks: [] }] },
    phases: [],
  });
  assert.equal(dupPhase.ok, false);
  assert.match(dupPhase.error, /阶段 id 重复/);

  const dupTask = buildCanonicalTemplate({
    config: {
      phases: [
        { id: 'ph-1', name: 'A', order: 1, tasks: [{ id: 'tk-1', title: 'X' }] },
        { id: 'ph-2', name: 'B', order: 2, tasks: [{ id: 'tk-1', title: 'Y' }] },
      ],
    },
    phases: [],
  });
  assert.equal(dupTask.ok, false);
  assert.match(dupTask.error, /任务 id 重复/);

  const badRef = buildCanonicalTemplate({
    config: { phases: [{ id: 'ph-1', name: 'A', order: 1, nextPhaseIds: ['ph-404'], tasks: [] }] },
    phases: [],
  });
  assert.equal(badRef.ok, false);
  assert.match(badRef.error, /引用了不存在的阶段/);

  const notArray = parseTemplateConfig('[1,2,3]');
  assert.equal(notArray.ok, false, '数组等非对象输入受控拒绝');
});

// ── 无 config 的旧模板：可由结构化表构建，且不丢失领域字段 ─────────────────────
test('旧模板（无 config）由结构化表构建并保留领域字段', () => {
  const built = buildCanonicalTemplate({ config: null, phases: structuredFixture() });
  assert.equal(built.ok, true);
  assert.equal(built.source, 'structured');
  const t1 = built.canonical.phases[0].tasks[0];
  assert.equal(t1.expectedDeliverable, '调研纪要');
  assert.equal(built.canonical.phases[0].isMilestone, true, 'isMilestone 不静默丢失');
  assert.equal(built.canonical.phases[0].plannedDurationDays, 10, '计划工期不静默丢失');
});

// ── AC-P0-05（单元层）：复制重映射不改动原对象 ─────────────────────────────────
test('AC-P0-05 复制重映射：阶段/任务/连线/子阶段 ID 一致重映射，原对象不变', () => {
  const built = buildCanonicalTemplate({ config: configStringFixture(), phases: structuredFixture() });
  assert.equal(built.ok, true);
  const originalSnapshot = JSON.stringify(built.canonical);

  const phaseIdMap = new Map([['ph-1', 'new-ph-1'], ['ph-2', 'new-ph-2']]);
  const taskIdMap = new Map([['tk-1', 'new-tk-1'], ['tk-2', 'new-tk-2'], ['tk-3', 'new-tk-3'], ['tk-new', 'new-tk-new'], ['tk-sub-1', 'new-tk-sub-1']]);
  const copied = remapCanonicalIds(built.canonical, phaseIdMap, taskIdMap);

  assert.equal(copied.phases[0].id, 'new-ph-1');
  assert.deepEqual(copied.phases[0].nextPhaseIds, ['new-ph-2'], '连线引用同步重映射');
  assert.equal(copied.phases[0].tasks[0].id, 'new-tk-1');
  assert.equal(copied.phases[0].subPhases[0].tasks[0].id, 'new-tk-sub-1', '子阶段任务引用重映射');
  assert.equal(copied.phases[0].tasks[0].expectedDeliverable, '调研纪要', '副本保留领域内容');
  assert.equal(JSON.stringify(built.canonical), originalSnapshot, '原模板对象未被修改');
});

// ── AC-P0-06（投影层）：实例化计划保留领域字段与真实阶段名 ─────────────────────
test('实例化计划：真实阶段名（非 p1/UUID）、领域字段、模板任务身份、空间阶段登记', () => {
  const built = buildCanonicalTemplate({ config: configStringFixture(), phases: structuredFixture() });
  const plan = buildInstantiationPlan(built.canonical, { startDate: '2026-10-13T00:00:00.000Z' });
  assert.equal(plan.phases[0].name, '立项与需求确认', '阶段名不是 key/UUID');
  assert.equal(plan.tasks[0].templateTaskId, 'tk-1', '模板任务身份保留');
  assert.equal(plan.tasks[0].expectedDeliverable, '调研纪要', '交付物进入实例化计划');
  assert.equal(plan.counts.conditionalCount, 1);
  assert.equal(plan.counts.requiredCount, 3);
  assert.equal(plan.counts.disabledTaskCount, 1, '禁用项计数登记（不被静默启用）');
  assert.deepEqual(plan.emptyPhases, [], '无空阶段时为空数组');

  // 空阶段：显式登记，不静默遗失
  const withEmpty = buildCanonicalTemplate({
    config: { phases: [{ id: 'ph-e', name: '空阶段', order: 1, tasks: [] }] },
    phases: [],
  });
  const emptyPlan = buildInstantiationPlan(withEmpty.canonical, {});
  assert.equal(emptyPlan.emptyPhases.length, 1);
  assert.equal(emptyPlan.emptyPhases[0].name, '空阶段');
});

test('validateCanonicalPhases 直接可用的边界输入', () => {
  assert.equal(validateCanonicalPhases([]).ok, true);
  assert.equal(validateCanonicalPhases([{ id: 'a', tasks: [] }]).ok, true);
  assert.equal(validateCanonicalPhases([{ id: 'a', tasks: [{ title: 'no-id' }] }]).ok, false);
});
