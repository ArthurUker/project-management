/**
 * 规范模板解析与投影模块（P0 技术修复核心）
 * ============================================================================
 * 目的：为「详情 / 预览 / 复制 / apply / 项目实例化」提供**同一条**解析与投影链路，
 *       修复 SYS-01（交付物/条件适用性丢失）、SYS-02（节点业务字段读回丢失）、
 *       SYS-03（复制与套用使用不同结构）三处信息传递缺陷。
 *
 * 固定规则（对应执行指令第五节，不自行扩大设计）：
 *  1. 兼容 config 为 JSON 字符串或对象；完全没有 config 的旧模板使用结构化表。
 *  2. 有效 config 决定其已表达的阶段/任务顺序、启用状态、连线、节点信息与编辑值。
 *  3. config 未携带的领域字段，按**相同任务 ID** 从结构化行补全（不靠数组位置或标题匹配）。
 *  4. 明确提供的 false/0/空值不得被旧行覆盖；null 不无条件视为缺失（用键存在性判断）。
 *  5. config 中新建、无结构化行的节点可以存在，用兼容默认值，不伪造交付物或角色。
 *  6. 保留 type/phaseInfo/completionTip/allowSkip/events/eventTemplates/milestones/
 *     布局(x,y)/子阶段的往返表达；结构化 isMilestone/工时不得静默丢失。
 *  7. 保存写完整、可版本识别的规范 JSON 对象（configVersion）；读取仍兼容旧字符串。
 *  8. 损坏、重复 ID 或引用不合法的配置不得静默退回旧表并显示成功；返回明确错误，保留原数据。
 *  9. 保护未被本轮编辑器支持的合法字段（未知键原样往返）；危险或不合法输入按受控解析拒绝。
 * 10. 执行优先级(priority)、regulatoryPriority、applicability、enabled 为不同概念，不得混淆。
 *
 * 注意：本模块不引入审批引擎、事件执行、A/B/C 自动裁剪或角色自动绑定。
 *       enabled=false 与 CONDITIONAL 语义分离；被禁用项不会被当作已完成或默认重新启用。
 */

/** 配置格式版本（接口/配置格式版本，非产品发布政策） */
export const CONFIG_VERSION = 2;

/** 任务领域字段（config 未携带时按同 ID 从结构化行补全；缺失不伪造） */
export const TASK_DOMAIN_FIELDS = [
  'code',
  'description',
  'taskType',
  'applicability',
  'regulatoryPriority',
  'expectedDeliverable',
  'regulatoryNotes',
  'estimatedHours',
  'assigneeRoleCode',
];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * 解析模板 config。字符串与对象均可；不合法时返回错误而非静默降级。
 * @returns {{ ok: true, data: object|null } | { ok: false, error: string }}
 */
export function parseTemplateConfig(config) {
  if (config === null || config === undefined) return { ok: true, data: null };
  if (isPlainObject(config)) return { ok: true, data: config };
  if (typeof config === 'string') {
    const trimmed = config.trim();
    if (trimmed === '') return { ok: true, data: null };
    try {
      const parsed = JSON.parse(trimmed);
      if (!isPlainObject(parsed)) {
        return { ok: false, error: 'CONFIG_INVALID: config 字符串解析结果不是对象' };
      }
      return { ok: true, data: parsed };
    } catch (err) {
      return { ok: false, error: `CONFIG_INVALID: config 不是合法 JSON（${err.message}）` };
    }
  }
  return { ok: false, error: `CONFIG_INVALID: config 类型不支持（${typeof config}）` };
}

/** 结构化阶段行 → 规范阶段（无 config 的旧模板路径） */
function phaseFromRow(row, idx) {
  return {
    id: row.id,
    key: row.code ?? `p${idx + 1}`,
    name: row.name ?? `阶段 ${idx + 1}`,
    order: row.sortOrder ?? idx + 1,
    totalDays: row.plannedDurationDays ?? 0,
    plannedStartOffsetDays: row.plannedStartOffsetDays ?? null,
    plannedDurationDays: row.plannedDurationDays ?? null,
    isMilestone: row.isMilestone === true,
    enabled: true,
    type: 'normal',
    phaseInfo: null,
    completionTip: null,
    allowSkip: false,
    events: [],
    eventTemplates: [],
    subPhases: [],
    nextPhaseIds: [],
    tasks: (row.tasks ?? []).map((t, ti) => taskFromRow(t, ti)),
  };
}

/** 结构化任务行 → 规范任务（显式携带领域字段，不做静默默认） */
function taskFromRow(row, idx) {
  return {
    id: row.id,
    code: row.code ?? null,
    title: row.title ?? '',
    description: row.description ?? null,
    taskType: row.taskType ?? null,
    applicability: typeof row.applicability === 'string' ? row.applicability.toLowerCase() : 'required',
    regulatoryPriority: row.regulatoryPriority ?? null,
    expectedDeliverable: row.expectedDeliverable ?? null,
    regulatoryNotes: row.regulatoryNotes ?? null,
    estimatedHours: row.estimatedHours ?? null,
    estimatedDays: row.estimatedHours ? Math.ceil(row.estimatedHours / 8) : 3,
    assigneeRoleCode: row.assigneeRoleCode ?? null,
    enabled: true,
    sortOrder: row.sortOrder ?? idx,
  };
}

/**
 * 合并单个任务：config 值（含显式 null/''/0/false）优先，缺失时按同 ID 从结构化行补全。
 * 未知合法字段原样保留（规则 9）。
 */
function mergeTask(cfgTask, idx, structTaskById) {
  const row = structTaskById.get(cfgTask?.id);
  const out = { ...(isPlainObject(cfgTask) ? cfgTask : {}) }; // 保留未知键

  out.id = cfgTask?.id ?? row?.id ?? null;
  out.title = cfgTask?.title ?? row?.title ?? '';
  out.sortOrder = cfgTask?.sortOrder ?? row?.sortOrder ?? idx;

  // 领域字段：键存在即采用 config 值（含空值），否则从同 ID 结构化行补全，仍无则不伪造
  for (const f of TASK_DOMAIN_FIELDS) {
    if (isPlainObject(cfgTask) && f in cfgTask) {
      out[f] = cfgTask[f];
    } else if (row) {
      out[f] = row[f] ?? null;
    } else if (!(f in out)) {
      out[f] = null;
    }
  }

  // applicability 归一为小写契约（既有 FE 兼容）；显式空值不伪造为 required 以外的值
  if (typeof out.applicability === 'string' && out.applicability.trim() !== '') {
    out.applicability = out.applicability.toLowerCase();
  } else if (out.applicability == null) {
    out.applicability = 'required';
  } else if (typeof out.applicability === 'string') {
    out.applicability = out.applicability.toLowerCase(); // '' 保持空字符串，登记为“明确为空”
  }

  // 人时与估算天数：两者语义不同（SYS-05），分别保留
  const cfgHours = cfgTask?.estimatedHours;
  if (typeof cfgHours === 'number') {
    out.estimatedHours = cfgHours;
  } else if (row && typeof row.estimatedHours === 'number') {
    out.estimatedHours = row.estimatedHours;
  } else if (!('estimatedHours' in out)) {
    out.estimatedHours = null;
  }
  const cfgDays = cfgTask?.estimatedDays;
  if (typeof cfgDays === 'number') {
    out.estimatedDays = cfgDays;
  } else if (typeof out.estimatedHours === 'number') {
    out.estimatedDays = Math.ceil(out.estimatedHours / 8);
  } else if (!('estimatedDays' in out)) {
    out.estimatedDays = 3;
  }

  // enabled：显式 false 保留（禁用项不得被重新启用）；缺失默认 true
  out.enabled = 'enabled' in (cfgTask ?? {}) ? cfgTask.enabled !== false : true;
  return out;
}

/** 子阶段合并：保留原结构并补全已知字段（不递归展开为独立阶段） */
function mergeSubPhase(sp, idx) {
  const out = { ...(isPlainObject(sp) ? sp : {}) };
  out.id = sp?.id ?? `sp${idx + 1}`;
  out.name = sp?.name ?? `子阶段 ${idx + 1}`;
  out.enabled = 'enabled' in (sp ?? {}) ? sp.enabled !== false : true;
  out.tasks = Array.isArray(sp?.tasks) ? sp.tasks.map((t, ti) => mergeTask(t, ti, new Map())) : [];
  return out;
}

/**
 * 校验规范阶段列表：重复 ID、无效连线引用、缺失 ID 均明确拒绝。
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateCanonicalPhases(phases) {
  const ids = new Set();
  for (const [idx, p] of phases.entries()) {
    if (!p || typeof p !== 'object') {
      return { ok: false, error: `CONFIG_INVALID: 第 ${idx + 1} 个阶段不是对象` };
    }
    if (!p.id) {
      return { ok: false, error: `CONFIG_INVALID: 第 ${idx + 1} 个阶段缺少 id` };
    }
    if (ids.has(p.id)) {
      return { ok: false, error: `CONFIG_INVALID: 阶段 id 重复（${p.id}）` };
    }
    ids.add(p.id);
  }
  // 任务 ID 全局唯一 + 连线引用有效
  const taskIds = new Set();
  for (const p of phases) {
    for (const t of p.tasks ?? []) {
      if (!t?.id) {
        return { ok: false, error: `CONFIG_INVALID: 阶段 ${p.id} 下存在缺少 id 的任务` };
      }
      if (taskIds.has(t.id)) {
        return { ok: false, error: `CONFIG_INVALID: 任务 id 重复（${t.id}）` };
      }
      taskIds.add(t.id);
    }
    for (const nid of p.nextPhaseIds ?? []) {
      if (!ids.has(nid)) {
        return { ok: false, error: `CONFIG_INVALID: 阶段 ${p.id} 的 nextPhaseIds 引用了不存在的阶段（${nid}）` };
      }
    }
  }
  return { ok: true };
}

/**
 * 构建规范模板：config（有效时）优先 + 结构化同 ID 补全 + 未知字段保留。
 * @param {object} tpl 含 config 与 phases(含 tasks) 的模板行
 * @returns {{ ok: true, canonical: object, source: 'config'|'structured' } | { ok: false, error: string }}
 */
export function buildCanonicalTemplate(tpl) {
  const structPhases = Array.isArray(tpl?.phases) ? tpl.phases : [];
  const structPhaseById = new Map(structPhases.map((p) => [p.id, p]));
  const structTaskById = new Map();
  for (const p of structPhases) {
    for (const t of p.tasks ?? []) structTaskById.set(t.id, t);
  }

  const parsed = parseTemplateConfig(tpl?.config);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const cfgPhases = Array.isArray(parsed.data?.phases) ? parsed.data.phases : null;
  const basePhases = cfgPhases && cfgPhases.length > 0
    ? cfgPhases
    : structPhases.map((p, idx) => phaseFromRow(p, idx));
  const source = cfgPhases && cfgPhases.length > 0 ? 'config' : 'structured';

  const phases = basePhases.map((p, idx) => {
    const row = structPhaseById.get(p?.id);
    const out = { ...(isPlainObject(p) ? p : {}) }; // 保留未知键（规则 9）

    out.id = p?.id;
    out.key = p?.key ?? p?.code ?? row?.code ?? `p${idx + 1}`;
    out.name = p?.name ?? row?.name ?? `阶段 ${idx + 1}`;
    out.order = Number.isFinite(p?.order) ? p.order : (row?.sortOrder ?? idx + 1);
    out.totalDays = Number.isFinite(p?.totalDays) ? p.totalDays : (row?.plannedDurationDays ?? 0);

    // 结构化专属字段：config 未表达时补全（不得静默丢失 isMilestone/计划工期）
    out.plannedStartOffsetDays = Number.isFinite(p?.plannedStartOffsetDays)
      ? p.plannedStartOffsetDays
      : (row?.plannedStartOffsetDays ?? null);
    out.plannedDurationDays = Number.isFinite(p?.plannedDurationDays)
      ? p.plannedDurationDays
      : (row?.plannedDurationDays ?? null);
    out.isMilestone = 'isMilestone' in (p ?? {}) ? p.isMilestone === true : (row?.isMilestone ?? false);
    out.enabled = 'enabled' in (p ?? {}) ? p.enabled !== false : true;

    // 节点业务字段（SYS-02）：config 值优先，缺失用兼容缺省；不引入审批/事件执行
    out.type = p?.type ?? 'normal';
    out.phaseInfo = p?.phaseInfo ?? null;
    out.completionTip = p?.completionTip ?? null;
    out.allowSkip = 'allowSkip' in (p ?? {}) ? p.allowSkip === true : false;
    out.events = Array.isArray(p?.events) ? p.events : [];
    out.eventTemplates = Array.isArray(p?.eventTemplates) ? p.eventTemplates : [];
    out.subPhases = Array.isArray(p?.subPhases) ? p.subPhases.map((sp, si) => mergeSubPhase(sp, si)) : [];
    out.nextPhaseIds = Array.isArray(p?.nextPhaseIds) ? p.nextPhaseIds.filter(Boolean) : [];
    out.x = Number.isFinite(p?.x) ? p.x : (p?.x ?? undefined);
    out.y = Number.isFinite(p?.y) ? p.y : (p?.y ?? undefined);
    out.tasks = Array.isArray(p?.tasks) ? p.tasks.map((t, ti) => mergeTask(t, ti, structTaskById)) : [];
    return out;
  });

  const validation = validateCanonicalPhases(phases);
  if (!validation.ok) return { ok: false, error: validation.error };

  // 模板级扩展：milestones 与未知顶层键原样保留
  const { phases: _drop, ...restExtras } = parsed.data ?? {};
  const canonical = {
    configVersion: CONFIG_VERSION,
    ...restExtras,
    phases,
    milestones: Array.isArray(parsed.data?.milestones) ? parsed.data.milestones : [],
  };
  return { ok: true, canonical, source };
}

/**
 * 规范模板 → 实例化计划（供 /apply、项目创建、已有项目套用共用）。
 * 明确表达：阶段名用 name（不是 key/UUID）、任务保留领域字段与模板身份、
 * 空阶段显式登记（不静默遗失）。不设计新的排期/关键路径算法。
 */
export function buildInstantiationPlan(canonical, { startDate } = {}) {
  const start = startDate ? new Date(startDate) : new Date();
  let dayOffset = 0;
  const tasks = [];
  const phases = [];
  const emptyPhases = [];

  for (const phase of canonical?.phases ?? []) {
    const phaseTasks = [];
    for (const t of phase.tasks ?? []) {
      const days = Number.isFinite(t.estimatedDays) ? t.estimatedDays : 3;
      const dueDate = new Date(start);
      dueDate.setDate(dueDate.getDate() + dayOffset + days);
      const row = {
        // 模板任务身份（追溯）：用于项目任务回指模板任务
        templateTaskId: t.id,
        templatePhaseId: phase.id,
        title: t.title,
        code: t.code ?? null,
        // 领域字段（SYS-01 核心）
        description: t.description ?? null,
        taskType: t.taskType ?? null,
        applicability: t.applicability ?? 'required',
        regulatoryPriority: t.regulatoryPriority ?? null,
        expectedDeliverable: t.expectedDeliverable ?? null,
        regulatoryNotes: t.regulatoryNotes ?? null,
        estimatedHours: Number.isFinite(t.estimatedHours) ? t.estimatedHours : null,
        assigneeRoleCode: t.assigneeRoleCode ?? null,
        // 执行态（不由模板决定）
        priority: 'MEDIUM',
        status: 'NOT_STARTED',
        enabled: t.enabled !== false,
        estimatedDays: days,
        dueDate: dueDate.toISOString(),
      };
      tasks.push(row);
      phaseTasks.push(row);
      dayOffset += days;
    }
    phases.push({
      templatePhaseId: phase.id,
      key: phase.key,
      name: phase.name, // 正确阶段名称（不是 UUID/p1）
      order: phase.order,
      totalDays: phase.totalDays ?? 0,
      isMilestone: phase.isMilestone === true,
      enabled: phase.enabled !== false,
      type: phase.type ?? 'normal',
      phaseInfo: phase.phaseInfo ?? null,
      completionTip: phase.completionTip ?? null,
      allowSkip: phase.allowSkip === true,
      nextPhaseIds: phase.nextPhaseIds ?? [],
      taskCount: phaseTasks.length,
      tasks: phaseTasks,
    });
    if (phaseTasks.length === 0) {
      emptyPhases.push({ templatePhaseId: phase.id, key: phase.key, name: phase.name });
    }
  }

  return {
    runtimeUnsupported: {
      // 当前项目模型不能表达的模板能力：模板可保留，实例化暂不支持（不得伪称生效）
      events: 'event_config_not_executed',
      eventTemplates: 'event_template_not_executed',
      approvalGating: 'no_approval_gate_engine',
      subPhases: 'sub_phase_not_materialized_as_project_phase',
      roleBinding: 'assignee_role_intent_not_bound_to_users',
      nodeLayout: 'canvas_layout_not_applicable_to_project',
    },
    startDate: start.toISOString(),
    phases,
    tasks,
    emptyPhases,
    counts: {
      phaseCount: phases.length,
      taskCount: tasks.length,
      emptyPhaseCount: emptyPhases.length,
      conditionalCount: tasks.filter((t) => t.applicability === 'conditional').length,
      requiredCount: tasks.filter((t) => t.applicability === 'required').length,
      disabledTaskCount: tasks.filter((t) => t.enabled === false).length,
    },
  };
}

/**
 * 复制时重映射 config 内部 ID（阶段/任务/连线/子阶段），保证副本自洽。
 * 仅重映射能识别的引用；未知字段原样保留。
 */
export function remapCanonicalIds(canonical, phaseIdMap, taskIdMap) {
  const remapSub = (sp) => ({
    ...sp,
    id: sp.id,
    tasks: (sp.tasks ?? []).map((t) => ({
      ...t,
      id: taskIdMap.get(t.id) ?? t.id,
    })),
  });
  return {
    ...canonical,
    configVersion: CONFIG_VERSION,
    phases: (canonical?.phases ?? []).map((p) => ({
      ...p,
      id: phaseIdMap.get(p.id) ?? p.id,
      nextPhaseIds: (p.nextPhaseIds ?? []).map((nid) => phaseIdMap.get(nid) ?? nid),
      subPhases: (p.subPhases ?? []).map(remapSub),
      tasks: (p.tasks ?? []).map((t) => ({ ...t, id: taskIdMap.get(t.id) ?? t.id })),
    })),
  };
}

export default {
  CONFIG_VERSION,
  TASK_DOMAIN_FIELDS,
  parseTemplateConfig,
  validateCanonicalPhases,
  buildCanonicalTemplate,
  buildInstantiationPlan,
  remapCanonicalIds,
};
