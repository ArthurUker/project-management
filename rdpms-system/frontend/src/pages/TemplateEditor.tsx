import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectTemplatesAPI } from '../api/client';
import ProcessFlowDiagram from '../components/ProcessFlowDiagram';
import MindMapView from '../components/MindMapView';
import PhaseTaskPanel from '../components/PhaseTaskPanel';
import { X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PhaseTask {
  id: string;
  title: string;
  name?: string;
  priority: '高' | '中' | '低';
  estimatedDays: number;
  role: string;
  source: 'self' | 'inherited';
  enabled: boolean;
}

// 节点事件类型
export type EventTrigger = 'onEnter' | 'onComplete' | 'onOverdue';
export type EventActionType = 'notify' | 'updateField' | 'startApproval' | 'webhook';

export interface PhaseEventAction {
  id: string;
  type: EventActionType;
  config: {
    /** notify: 通知对象 */
    notifyRoles?: string[];   // 角色列表
    notifyContent?: string;   // 通知内容
    /** updateField */
    fieldName?: string;
    fieldValue?: string;
    /** startApproval */
    approvalProcess?: string;
    /** webhook */
    webhookUrl?: string;
  };
}

export interface PhaseEvent {
  id: string;
  trigger: EventTrigger;
  label?: string;           // 自定义描述
  enabled: boolean;
  actions: PhaseEventAction[];
}

interface Phase {
  id: string;
  name: string;
  order: number;
  x?: number;
  y?: number;
  totalDays?: number;
  nextPhaseIds?: string[];
  type: 'normal' | 'milestone' | 'approval';
  source: 'self' | 'inherited';
  enabled: boolean;
  completionTip: string;
  phaseInfo?: {
    goal: string;
    description: string;
    projectTypes: string[];
    exitCriteria: string[];
    goNoGoRule: string;
  };
  eventTemplates?: PhaseEvent[];
  allowSkip: boolean;
  tasks: PhaseTask[];
  isSubPhase?: boolean;
  subPhases?: Array<{
    id: string;
    name: string;
    order: number;
    enabled?: boolean;
    tasks: PhaseTask[];
  }>;
  events: PhaseEvent[];
}

interface Milestone {
  id: string;
  name: string;
  phaseId: string;
  offsetDays: number;
}

function buildTemplatePreviewContent(name: string, phases: Phase[], milestones: Milestone[]) {
  const lines: string[] = [`# ${name || '模板预览'}`];

  phases.forEach((phase) => {
    lines.push(`## ${phase.order}. ${phase.name}`);
    lines.push(`- ${phase.tasks.length} 个任务${phase.totalDays ? ` · 预计 ${phase.totalDays} 天` : ''}`);

    if (phase.subPhases && phase.subPhases.length > 0) {
      phase.subPhases.forEach((subPhase) => {
        if (subPhase.enabled === false) return;
        lines.push(`### ${subPhase.order}. ${subPhase.name}`);
        lines.push(`- ${subPhase.tasks.filter((task) => task.enabled !== false).length} 个任务`);
        subPhase.tasks.forEach((task, index) => {
          if (task.enabled === false) return;
          const title = task.title || task.name || `任务 ${index + 1}`;
          const parts = [title];
          if (task.role) parts.push(task.role);
          if (task.priority) parts.push(`优先级 ${task.priority}`);
          if (task.estimatedDays) parts.push(`约 ${task.estimatedDays} 天`);
          lines.push(`- ${parts.join(' · ')}`);
        });
      });
      return;
    }

    phase.tasks.forEach((task, index) => {
      if (task.enabled === false) return;
      const title = task.title || task.name || `任务 ${index + 1}`;
      const parts = [title];
      if (task.role) parts.push(task.role);
      if (task.priority) parts.push(`优先级 ${task.priority}`);
      if (task.estimatedDays) parts.push(`约 ${task.estimatedDays} 天`);
      lines.push(`- ${parts.join(' · ')}`);
    });
  });

  if (milestones.length > 0) {
    lines.push('## 里程碑');
    milestones.forEach((milestone) => {
      const phase = phases.find((p) => p.id === milestone.phaseId);
      lines.push(`- ${milestone.name}${phase ? ` · ${phase.name}` : ''}${milestone.offsetDays ? ` · +${milestone.offsetDays} 天` : ''}`);
    });
  }

  return lines.join('\n');
}

// ─── Node Events Panel ─────────────────────────────────────────────────────

const TRIGGER_OPTIONS: { value: EventTrigger; label: string; icon: string; desc: string }[] = [
  { value: 'onEnter',   label: '进入阶段',   icon: '▶', desc: '当项目流转到该阶段时触发' },
  { value: 'onComplete',label: '完成阶段',   icon: '✓', desc: '当该阶段被标记为完成时触发' },
  { value: 'onOverdue', label: '阶段逾期',   icon: '⚠', desc: '当该阶段超过预计时间未完成时触发' },
];

const ACTION_OPTIONS: { value: EventActionType; label: string; icon: string }[] = [
  { value: 'notify',        label: '发送通知',   icon: '🔔' },
  { value: 'updateField',   label: '更新字段',   icon: '✏️' },
  { value: 'startApproval', label: '发起审批',   icon: '📋' },
  { value: 'webhook',       label: '调用 Webhook', icon: '🔗' },
];

const NOTIFY_ROLES = ['项目负责人', '研发工程师', '测试工程师', '质量经理', '项目管理员'];

const EVENT_RECOMMENDATIONS = [
  {
    key: 'evt-enter-notify',
    title: '事件 1：项目进入“项目立项”时自动通知相关人员',
    trigger: '当项目进入“项目立项”节点',
    actions: '通知项目负责人、研发负责人、市场/客户接口人、质量/文档负责人',
    note: '项目已进入立项阶段，请在规定时间内完成项目基本信息、需求来源、应用场景、样本范围、技术可行性、资源评估及风险初评。',
    value: '避免项目已经创建，但相关人员不知道需要补资料。',
  },
  {
    key: 'evt-submit-approval',
    title: '事件 2：立项资料提交后自动发起审批',
    trigger: '当“立项资料状态”变更为“已提交”',
    actions: '发起立项审批',
    note: '审批人建议：研发负责人 → 项目管理负责人/质量负责人 → 总经理/技术负责人（轻量组织可简化为：研发负责人 → 总经理/技术负责人）。',
    value: '确保立项评审流程标准化，减少漏审和口头决策。',
  },
  {
    key: 'evt-approval-pass',
    title: '事件 3：立项审批通过后自动进入下一阶段',
    trigger: '当“立项审批结果”为“通过”',
    actions: '更新项目状态为“已立项”；流转至“需求确认与产品定义”；自动生成下一阶段任务',
    note: '建议与任务模板联动，自动生成下一阶段标准任务清单。',
    value: '避免审批通过后靠人工推进，缩短等待和交接时间。',
  },
  {
    key: 'evt-approval-reject',
    title: '事件 4：立项审批不通过时自动退回',
    trigger: '当“立项审批结果”为“不通过”或“退回修改”',
    actions: '通知项目发起人补充资料；项目状态更新为“立项退回”；保留审批意见',
    note: '建议必须填写退回原因：需求不清晰、样本不可获得、技术路线不明确、资源不足、商业价值不足、风险不可接受、不符合公司战略。',
    value: '确保退回有据可查，避免“退回但无原因”导致反复沟通。',
  },
];

const PHASE_PROJECT_TYPE_OPTIONS = [
  '非医疗分子检测产品',
  '食品安全检测项目',
  '水产病原检测项目',
  '中药材鉴定项目',
  '海关检疫项目',
  '客户定制芯片项目',
  '客户定制设备项目',
  '合作开发项目',
  '平台设备开发项目',
  '平台软件开发项目',
  '准注册级试剂项目',
  '三类IVD注册项目',
];

function buildRecommendedPhaseInfo(phaseName: string) {
  const normalizedPhaseName = phaseName.trim() || '项目立项';
  return {
    goal: '完成项目需求、应用场景、产品边界、技术可行性、资源投入和风险的初步确认，形成项目是否进入方案设计阶段的立项决策。',
    description: `本阶段用于判断${normalizedPhaseName}是否具备研发启动条件。需明确项目来源、目标用户、应用场景、样本类型、检测对象、预期用途、交付形式、开发等级、初步技术路线、关键风险、资源投入及计划周期。阶段结束时应形成立项简表、用户需求记录、可行性初评和Go/No-Go决策。`,
    projectTypes: [
      '非医疗分子检测芯片项目',
      '食品安全检测项目',
      '水产病原检测项目',
      '中药材鉴定项目',
      '海关检疫项目',
      '客户定制芯片项目',
      '合作开发项目',
      '准注册级试剂项目',
    ],
    exitCriteria: [
      '项目基本信息已填写完整',
      '目标用户、应用场景、样本范围和检测对象已明确',
      '产品声称边界和不适用范围已初步确认',
      '已完成技术可行性和资源可行性初评',
      '已完成项目等级判定',
      '已识别主要风险和外部依赖',
      '已完成Go/No-Go决策并指定项目负责人',
    ],
    goNoGoRule: 'Go 条件：核心需求明确、技术路线可行、关键资源到位、风险可控。No-Go 条件：需求不清晰、关键样本不可获得、技术不可行、资源缺口无法补齐、风险不可接受。',
  };
}

function buildCompletionTipFromPhaseInfo(phaseInfo: {
  goal: string;
  description: string;
  projectTypes: string[];
  exitCriteria: string[];
  goNoGoRule: string;
}) {
  return [
    `【节点目标】\n${phaseInfo.goal || '请填写节点目标。'}`,
    `【节点说明】\n${phaseInfo.description || '请填写节点说明。'}`,
    `【适用项目类型】\n${phaseInfo.projectTypes.length > 0 ? phaseInfo.projectTypes.join('、') : '请填写适用项目类型。'}`,
    `【阶段完成标准】\n${phaseInfo.exitCriteria.length > 0 ? phaseInfo.exitCriteria.map((item, idx) => `${idx + 1}. ${item}`).join('\n') : '请填写阶段完成标准。'}`,
    `【Go/No-Go 判定】\n${phaseInfo.goNoGoRule || '请填写进入下一阶段的判定条件。'}`,
  ].join('\n\n');
}

function splitByLine(value: string) {
  return value
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ActionEditor({ action, onChange, onDelete }: {
  action: PhaseEventAction;
  onChange: (a: PhaseEventAction) => void;
  onDelete: () => void;
}) {
  const opt = ACTION_OPTIONS.find(o => o.value === action.type);
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 动作类型选择 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>{opt?.icon}</span>
          <select
            value={action.type}
            onChange={e => onChange({ ...action, type: e.target.value as EventActionType, config: {} })}
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer' }}
          >
            {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button onClick={onDelete} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}>×</button>
      </div>

      {/* 动作配置 */}
      {action.type === 'notify' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>通知对象</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {NOTIFY_ROLES.map(role => {
                const checked = (action.config.notifyRoles || []).includes(role);
                return (
                  <button
                    key={role}
                    onClick={() => {
                      const roles = action.config.notifyRoles || [];
                      const next = checked ? roles.filter((r: string) => r !== role) : [...roles, role];
                      onChange({ ...action, config: { ...action.config, notifyRoles: next } });
                    }}
                    style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, border: `1px solid ${checked ? '#3b82f6' : '#e2e8f0'}`, background: checked ? '#eff6ff' : '#fff', color: checked ? '#2563eb' : '#64748b', cursor: 'pointer', fontWeight: checked ? 600 : 400 }}
                  >{role}</button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>通知内容（可选）</div>
            <input
              value={action.config.notifyContent || ''}
              onChange={e => onChange({ ...action, config: { ...action.config, notifyContent: e.target.value } })}
              placeholder="留空则发送默认消息"
              style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      )}
      {action.type === 'updateField' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={action.config.fieldName || ''}
            onChange={e => onChange({ ...action, config: { ...action.config, fieldName: e.target.value } })}
            placeholder="字段名"
            style={{ flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none' }}
          />
          <input
            value={action.config.fieldValue || ''}
            onChange={e => onChange({ ...action, config: { ...action.config, fieldValue: e.target.value } })}
            placeholder="目标值"
            style={{ flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none' }}
          />
        </div>
      )}
      {action.type === 'startApproval' && (
        <input
          value={action.config.approvalProcess || ''}
          onChange={e => onChange({ ...action, config: { ...action.config, approvalProcess: e.target.value } })}
          placeholder="审批流程名称"
          style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
        />
      )}
      {action.type === 'webhook' && (
        <input
          value={action.config.webhookUrl || ''}
          onChange={e => onChange({ ...action, config: { ...action.config, webhookUrl: e.target.value } })}
          placeholder="https://your-webhook-url"
          style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
        />
      )}
    </div>
  );
}

function EventRuleCard({ event, phases: _phases, onUpdate, onDelete }: {
  event: PhaseEvent;
  phases?: any[];
  onUpdate: (e: PhaseEvent) => void;
  onDelete: () => void;
}) {
  const triggerOpt = TRIGGER_OPTIONS.find(t => t.value === event.trigger);

  const addAction = () => {
    const newAction: PhaseEventAction = { id: `act_${Date.now()}`, type: 'notify', config: {} };
    onUpdate({ ...event, actions: [...event.actions, newAction] });
  };

  const updateAction = (idx: number, updated: PhaseEventAction) => {
    const actions = [...event.actions];
    actions[idx] = updated;
    onUpdate({ ...event, actions });
  };

  const deleteAction = (idx: number) => {
    onUpdate({ ...event, actions: event.actions.filter((_, i) => i !== idx) });
  };

  return (
    <div style={{ background: '#fff', border: `1.5px solid ${event.enabled ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, opacity: event.enabled ? 1 : 0.55 }}>
      {/* 事件头部 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          {/* 触发条件 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>触发条件</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TRIGGER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                title={opt.desc}
                onClick={() => onUpdate({ ...event, trigger: opt.value })}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${event.trigger === opt.value ? '#3b82f6' : '#e2e8f0'}`,
                  background: event.trigger === opt.value ? '#eff6ff' : '#f8fafc',
                  color: event.trigger === opt.value ? '#1d4ed8' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span style={{ fontSize: 12 }}>{opt.icon}</span> {opt.label}
              </button>
            ))}
          </div>
          {triggerOpt && (
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{triggerOpt.desc}</div>
          )}
          <input
            value={event.label || ''}
            onChange={(e) => onUpdate({ ...event, label: e.target.value })}
            placeholder="可选：补充更精确的触发条件（例如：当立项资料状态=已提交）"
            style={{ width: '100%', marginTop: 6, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#475569', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        {/* 启用开关 + 删除 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onUpdate({ ...event, enabled: !event.enabled })}
            style={{ position: 'relative', width: 32, height: 17, borderRadius: 10, border: 'none', background: event.enabled ? '#3b82f6' : '#d1d5db', cursor: 'pointer', transition: 'background .2s', padding: 0 }}
          >
            <span style={{ position: 'absolute', top: 2, width: 13, height: 13, background: '#fff', borderRadius: '50%', transition: 'left .2s', left: event.enabled ? 17 : 2 }} />
          </button>
          <button onClick={onDelete} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', lineHeight: 1 }} title="删除此事件">×</button>
        </div>
      </div>

      {/* 分隔 + 执行动作 */}
      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', marginBottom: 8 }}>
          执行动作 <span style={{ color: '#94a3b8', fontWeight: 400 }}>（按顺序执行）</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {event.actions.length === 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '8px', border: '1px dashed #e2e8f0', borderRadius: 6 }}>
              暂无动作，点击下方添加
            </div>
          )}
          {event.actions.map((action, idx) => (
            <ActionEditor
              key={action.id}
              action={action}
              onChange={updated => updateAction(idx, updated)}
              onDelete={() => deleteAction(idx)}
            />
          ))}
          <button
            onClick={addAction}
            style={{ padding: '5px 10px', border: '1px dashed #93c5fd', borderRadius: 6, background: '#fff', color: '#3b82f6', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 600 }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>＋</span> 添加动作
          </button>
        </div>
      </div>
    </div>
  );
}

function PhaseEventsPanel({ events, onEventsChange, phaseName, eventTemplates, onEventTemplatesChange }: {
  events: PhaseEvent[];
  onEventsChange: (events: PhaseEvent[]) => void;
  phaseName?: string;
  eventTemplates?: PhaseEvent[];
  onEventTemplatesChange?: (templates: PhaseEvent[]) => void;
}) {
  const [copiedSuggestionKey, setCopiedSuggestionKey] = useState<string | null>(null);
  const [templatesLocal, setTemplatesLocal] = useState<PhaseEvent[]>([]);

  useEffect(() => {
    if (eventTemplates && eventTemplates.length > 0) {
      setTemplatesLocal(eventTemplates.map(t => ({ ...t })));
      return;
    }
    // fallback to built-in recommendations
    const built = EVENT_RECOMMENDATIONS.map((_, idx) => {
      // buildRecommendedEvent exists below, so skip here and generate minimal defaults
      const phaseLabel = phaseName || '当前节点';
      if (idx === 0) return { id: `tmpl_${Date.now()}_${idx}`, trigger: 'onEnter', enabled: true, label: `当项目进入“${phaseLabel}”节点`, actions: [{ id: `act_${Date.now()}_${idx}_0`, type: 'notify', config: { notifyRoles: ['项目负责人', '研发工程师', '质量经理'], notifyContent: '项目已进入立项阶段，请在规定时间内完成资料。' } }] } as PhaseEvent;
      if (idx === 1) return { id: `tmpl_${Date.now()}_${idx}`, trigger: 'onComplete', enabled: true, label: '当“立项资料状态”变更为“已提交”', actions: [{ id: `act_${Date.now()}_${idx}_0`, type: 'startApproval', config: { approvalProcess: '立项审批' } }] } as PhaseEvent;
      if (idx === 2) return { id: `tmpl_${Date.now()}_${idx}`, trigger: 'onComplete', enabled: true, label: '当“立项审批结果”为“通过”', actions: [{ id: `act_${Date.now()}_${idx}_0`, type: 'updateField', config: { fieldName: 'projectStatus', fieldValue: '已立项' } }] } as PhaseEvent;
      if (idx === 3) return { id: `tmpl_${Date.now()}_${idx}`, trigger: 'onComplete', enabled: true, label: '当“立项审批结果”为“不通过”或“退回修改”', actions: [{ id: `act_${Date.now()}_${idx}_0`, type: 'notify', config: { notifyRoles: ['项目负责人'], notifyContent: '立项审批未通过，请补充资料。' } }] } as PhaseEvent;
      return null;
    }).filter(Boolean) as PhaseEvent[];
    setTemplatesLocal(built);
  }, [eventTemplates, phaseName]);

  const addEvent = () => {
    const newEvent: PhaseEvent = {
      id: `evt_${Date.now()}`,
      trigger: 'onEnter',
      enabled: true,
      actions: [],
    };
    onEventsChange([...events, newEvent]);
  };

  const updateEvent = (idx: number, updated: PhaseEvent) => {
    const next = [...events];
    next[idx] = updated;
    onEventsChange(next);
  };

  const deleteEvent = (idx: number) => {
    onEventsChange(events.filter((_, i) => i !== idx));
  };

  const cloneEventInstance = (tmpl: PhaseEvent) => {
    return {
      ...tmpl,
      id: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      actions: (tmpl.actions || []).map((a, i) => ({ ...a, id: `act_${Date.now()}_${Math.floor(Math.random() * 1000)}_${i}` })),
    } as PhaseEvent;
  };

  const addTemplateToEvents = (idx: number) => {
    const tmpl = templatesLocal[idx];
    if (!tmpl) return;
    onEventsChange([...events, cloneEventInstance(tmpl)]);
  };

  const replaceWithTemplates = () => {
    if (!templatesLocal || templatesLocal.length === 0) return;
    onEventsChange(templatesLocal.map(t => cloneEventInstance(t)));
  };

  const saveTemplates = () => {
    onEventTemplatesChange?.(templatesLocal.map(t => ({ ...t })));
  };

  const updateTemplate = (idx: number, next: PhaseEvent) => {
    const arr = [...templatesLocal];
    arr[idx] = next;
    setTemplatesLocal(arr);
  };

  const deleteTemplate = (idx: number) => {
    setTemplatesLocal(templatesLocal.filter((_, i) => i !== idx));
  };

  const addTemplate = () => {
    setTemplatesLocal([...templatesLocal, { id: `tmpl_${Date.now()}`, trigger: 'onEnter', enabled: true, label: '新模板', actions: [] } as PhaseEvent]);
  };

  const updateTemplateAction = (tplIdx: number, actionIdx: number, updated: PhaseEventAction) => {
    const arr = [...templatesLocal];
    const tpl = { ...arr[tplIdx] };
    tpl.actions = (tpl.actions || []).map((a, i) => i === actionIdx ? updated : a);
    arr[tplIdx] = tpl;
    setTemplatesLocal(arr);
  };

  const addTemplateAction = (tplIdx: number) => {
    const arr = [...templatesLocal];
    const tpl = { ...arr[tplIdx] };
    tpl.actions = [...(tpl.actions || []), { id: `act_${Date.now()}`, type: 'notify', config: {} }];
    arr[tplIdx] = tpl;
    setTemplatesLocal(arr);
  };

  const deleteTemplateAction = (tplIdx: number, actionIdx: number) => {
    const arr = [...templatesLocal];
    const tpl = { ...arr[tplIdx] };
    tpl.actions = (tpl.actions || []).filter((_, i) => i !== actionIdx);
    arr[tplIdx] = tpl;
    setTemplatesLocal(arr);
  };

  return (
    <div style={{ padding: '12px 0' }}>
      {/* 说明 */}
      <div style={{ margin: '0 16px 12px', padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 11, color: '#0369a1', lineHeight: 1.6 }}>
        <strong>节点事件</strong>：当阶段进入特定状态时，自动触发预设动作（发通知、更新字段、发起审批或调用 Webhook）。
      </div>

      <div style={{ margin: '0 16px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: 'linear-gradient(180deg, #faf5ff 0%, #ffffff 65%)', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>节点事件配置建议</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>项目立项节点建议设置 4 类事件，适合用于提醒、审批、字段更新和任务生成。</div>
          </div>
          <button
            type="button"
            onClick={replaceWithRecommendedEvents}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #c4b5fd', background: '#ede9fe', color: '#5b21b6', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            一键套用 4 类事件
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>推荐事件模板</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>将常用事件保存为模板，方便一键套用或批量替换。</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={addTemplate} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 11, cursor: 'pointer' }}>新增模板</button>
              <button type="button" onClick={saveTemplates} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #c4b5fd', background: '#ede9fe', color: '#5b21b6', fontSize: 11, cursor: 'pointer' }}>保存模板</button>
              <button type="button" onClick={replaceWithTemplates} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>一键套用全部模板</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {templatesLocal.map((tmpl, tIdx) => (
              <div key={tmpl.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#f8fafc', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={tmpl.label || ''} onChange={(e) => updateTemplate(tIdx, { ...tmpl, label: e.target.value })} placeholder="模板标题" style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }} />
                    <select value={tmpl.trigger} onChange={(e) => updateTemplate(tIdx, { ...tmpl, trigger: e.target.value as EventTrigger })} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                      {TRIGGER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => addTemplateToEvents(tIdx)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 600 }}>添加到规则</button>
                    <button type="button" onClick={() => deleteTemplate(tIdx)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff1f2', color: '#b91c1c', fontSize: 11 }}>删除模板</button>
                  </div>
                </div>
                <div style={{ padding: '8px 10px', fontSize: 11, lineHeight: 1.7, color: '#475569' }}>
                  <div style={{ marginBottom: 8 }}><strong>动作列表：</strong></div>
                  {(tmpl.actions || []).map((action, aIdx) => (
                    <div key={action.id} style={{ marginBottom: 8 }}>
                      <ActionEditor
                        action={action}
                        onChange={(updated) => updateTemplateAction(tIdx, aIdx, updated)}
                        onDelete={() => deleteTemplateAction(tIdx, aIdx)}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button type="button" onClick={() => addTemplateAction(tIdx)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px dashed #93c5fd', background: '#fff', color: '#3b82f6', fontSize: 12 }}>＋ 添加动作</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 事件规则列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px' }}>
        {events.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '24px 0', border: '1px dashed #e2e8f0', borderRadius: 8 }}>
            暂无事件规则，点击下方按钮添加
          </div>
        )}
        {events.map((event, idx) => (
          <EventRuleCard
            key={event.id}
            event={event}
            onUpdate={updated => updateEvent(idx, updated)}
            onDelete={() => deleteEvent(idx)}
          />
        ))}
        <button
          onClick={addEvent}
          style={{ padding: '8px 0', border: '1.5px dashed #93c5fd', borderRadius: 8, background: '#fff', color: '#3b82f6', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>＋</span> 添加事件规则
        </button>
      </div>
    </div>
  );
}

// ─── Phase Node (sortable) ─────────────────────────────────────────────────

function PhaseNode({ phase, isSelected, onClick, onDelete }: {
  phase: Phase;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const typeColors: Record<string, string> = {
    normal: isSelected ? 'border-primary-500 bg-primary-50' : 'border-blue-300 bg-blue-50',
    milestone: isSelected ? 'border-orange-500 bg-orange-50' : 'border-orange-300 bg-orange-50',
    approval: isSelected ? 'border-purple-500 bg-purple-50' : 'border-purple-300 bg-purple-50',
  };

  const typeIcons: Record<string, string> = {
    normal: '📋',
    milestone: '🎯',
    approval: '✅',
  };

  return (
    <div ref={setNodeRef} style={style} className="group/phase-node">
      <div
        className={`border-2 rounded-lg p-3 cursor-pointer select-none transition-all ${typeColors[phase.type]} ${
          phase.enabled ? '' : 'opacity-50 border-dashed'
        }`}
        onClick={onClick}
      >
        <div className="flex items-center gap-2">
          {/* drag handle */}
          <span
            {...attributes}
            {...listeners}
            className="text-gray-300 cursor-grab active:cursor-grabbing"
            onClick={e => e.stopPropagation()}
          >
            ⠿
          </span>
          <span className="text-xs">{typeIcons[phase.type]}</span>
          <span className={`text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold ${
            phase.type === 'milestone' ? 'bg-orange-500 text-white' :
            phase.type === 'approval' ? 'bg-purple-500 text-white' :
            'bg-blue-500 text-white'
          }`}>{phase.order}</span>
          <span className={`flex-1 text-sm font-medium truncate ${!phase.enabled ? 'line-through text-gray-400' : ''}`}>
            {phase.name}
          </span>
          {phase.source === 'inherited' && <span title="继承" className="text-gray-400 text-xs">🔒</span>}
          {/* 删除按钮：悬停时显示 */}
          {onDelete && (
            <button
              type="button"
              className="opacity-0 group-hover/phase-node:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
              title="删除阶段"
              onClick={e => { e.stopPropagation(); onDelete(); }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 2.5h7M4 2.5V1.5a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v1M3 2.5l.5 6h3l.5-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
        <div className="ml-8 mt-1 flex gap-3 text-xs text-gray-400">
          <span>{phase.tasks.filter(t => t.enabled).length} 任务</span>
          <span>~{phase.tasks.filter(t=>t.enabled).reduce((s,t)=>s+t.estimatedDays,0)} 天</span>
        </div>
      </div>
      {/* connector arrow */}
      <div className="flex justify-center py-1">
        <span className="text-gray-300 text-xs">↓</span>
      </div>
    </div>
  );
}

// ─── Task Row ──────────────────────────────────────────────────────────────



// ─── Main Editor ──────────────────────────────────────────────────────────

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<any>(null);
  const [phases, setPhases] = useState<Phase[]>([]);

  // 将所有阶段的任务展平，附带阶段信息
  const allTasks = useMemo(() => {
    return (phases ?? []).flatMap((phase) =>
      (phase.tasks ?? []).map((task) => ({
        ...task,
        phaseId: phase.id,
        phaseName: phase.name,
        phaseOrder: phase.order ?? 0,
      }))
    );
  }, [phases]);

  // 展开 subPhases 为并行分支节点，让流程图显示子阶段小分支
  const flowPhases = useMemo<Phase[]>(() => {
    const hasSubPhases = phases.some((p) => p.subPhases && p.subPhases.length > 0);
    if (!hasSubPhases) return phases;

    const result: Phase[] = [];
    phases.forEach((phase, phaseIdx) => {
      const subPhases = phase.subPhases ?? [];
      const nextMajorPhase = phases[phaseIdx + 1];

      if (subPhases.length === 0) {
        result.push(phase);
        return;
      }

      // 主阶段节点 → 连向各子阶段
      result.push({ ...phase, nextPhaseIds: subPhases.map((sp) => sp.id) });

      // 子阶段节点 → 汇合到下一主阶段
      subPhases.forEach((sp) => {
        result.push({
          id: sp.id,
          name: sp.name,
          order: phase.order,
          type: 'normal',
          source: 'self',
          enabled: sp.enabled !== false,
          completionTip: '',
          allowSkip: false,
          tasks: sp.tasks,
          subPhases: [],
          events: [],
          nextPhaseIds: nextMajorPhase ? [nextMajorPhase.id] : [],
          isSubPhase: true,
        });
      });
    });
    return result;
  }, [phases]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [showCompletionPreview, setShowCompletionPreview] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showBatchOp, setShowBatchOp] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [quickSuccessorName, setQuickSuccessorName] = useState('');
  const [phaseHistory, setPhaseHistory] = useState<Phase[][]>([]);
  const [, setPhaseFuture] = useState<Phase[][]>([]);

  const suppressHistoryRef = useRef(true);
  const prevPhasesRef = useRef<Phase[]>([]);

  const clonePhases = useCallback((arr: Phase[]) => JSON.parse(JSON.stringify(arr)) as Phase[], []);

  // 并行阶段选择弹窗
  const [parallelModal, setParallelModal] = useState<null | { open: boolean; sourceId: string; targetId: string }>(null);

  const handleAddParallel = useCallback((sourceId: string, targetId: string) => {
    setParallelModal({ open: true, sourceId, targetId });
  }, []);

  const handleRemoveParallel = useCallback((targetPhaseId: string) => {
    if (!parallelModal) return;
    setPhases(prev => prev.map(p =>
      p.id === parallelModal.sourceId
        ? { ...p, nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== targetPhaseId) }
        : p
    ));
  }, [parallelModal]);


  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (id) fetchTemplate();
  }, [id]);

  useEffect(() => {
    if (suppressHistoryRef.current) {
      prevPhasesRef.current = clonePhases(phases);
      suppressHistoryRef.current = false;
      return;
    }

    const prev = prevPhasesRef.current;
    const prevKey = JSON.stringify(prev);
    const curKey = JSON.stringify(phases);
    if (prevKey === curKey) return;

    setPhaseHistory((h) => {
      const next = [...h, clonePhases(prev)];
      return next.slice(-10);
    });
    setPhaseFuture([]);
    prevPhasesRef.current = clonePhases(phases);
  }, [clonePhases, phases]);

  async function fetchTemplate() {
    setLoading(true);
    try {
      const res = await projectTemplatesAPI.get(id!);
      setTemplate(res);

      // 兼容后端多种返回格式：直接 phases / data.phases / content(JSON string).phases / list[0]
      function parsePhases(payload: any) {
        if (!payload) return [];
        if (Array.isArray(payload.phases)) return payload.phases;
        if (Array.isArray(payload.data?.phases)) return payload.data.phases;

        // content may be a JSON string or object
        const content = payload.content ?? payload.data?.content;
        if (typeof content === 'string') {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed?.phases)) return parsed.phases;
          } catch (e) {
            // ignore
          }
        } else if (typeof content === 'object' && Array.isArray(content?.phases)) {
          return content.phases;
        }

        // list => take first
        if (Array.isArray(payload.list) && payload.list.length > 0) {
          return parsePhases(payload.list[0]);
        }

        return [];
      }

      function normalizePhase(raw: any, idx: number) {
        const subPhases = Array.isArray(raw.subPhases)
          ? raw.subPhases.map((sub: any, subIdx: number) => ({
              id: sub.id || `subphase_${idx}_${subIdx}`,
              name: sub.name || sub.label || `分支 ${subIdx + 1}`,
              order: sub.order ?? subIdx + 1,
              enabled: sub.enabled !== false,
              tasks: (sub.tasks || []).map((t: any, ti: number) => ({
                id: t.id || `task_${Date.now()}_${subIdx}_${ti}`,
                title: t.title || '任务',
                priority: t.priority || '中',
                estimatedDays: t.estimatedDays || 3,
                role: t.role || 'member',
                source: t.source || 'self',
                enabled: t.enabled !== false,
              })),
            }))
          : [];

        const rootTasks = (raw.tasks || []).map((t: any, ti: number) => ({
          id: t.id || `task_${Date.now()}_${ti}`,
          title: t.title || '任务',
          priority: t.priority || '中',
          estimatedDays: t.estimatedDays || 3,
          role: t.role || 'member',
          source: t.source || 'self',
          enabled: t.enabled !== false,
        }));

        const tasks = rootTasks.length > 0 ? rootTasks : subPhases.flatMap((sub) => sub.tasks);

        const nextPhaseIds = raw.nextPhaseIds ?? (raw.transitions ? (raw.transitions || []).map((x: any) => x.toPhaseId || x.targetId || x.to) : undefined) ?? [];

        return {
          ...raw,
          id: raw.id || raw.key || `phase_${Date.now()}_${idx}`,
          name: raw.name || raw.label || `阶段 ${idx + 1}`,
          order: raw.order ?? idx + 1,
          type: raw.type || 'normal',
          source: raw.source || 'self',
          enabled: raw.enabled !== false,
          completionTip: raw.completionTip || '',
          phaseInfo: raw.phaseInfo,
          eventTemplates: raw.eventTemplates || [],
          allowSkip: raw.allowSkip || false,
          tasks,
          subPhases,
          nextPhaseIds,
          events: raw.events || [],
        };
      }

      const rawPhases = parsePhases(res as any);
      const loaded: Phase[] = (rawPhases as any[]).map((p: any, idx: number) => normalizePhase(p, idx));

      // Ensure phases are sorted by their explicit order before rendering (important for parallel numbering)
      const sorted = loaded.sort((a, b) => (a.order || 0) - (b.order || 0));

      // 若加载的模版没有任何显式连线（nextPhaseIds 全为空），自动生成线性连线。
      // 这样新模版加载时节点有初始连线，且之后用户删除连线不会触发"线性回退"自动重连。
      const hasAnyConnections = sorted.some(p => (p.nextPhaseIds ?? []).length > 0);
      if (!hasAnyConnections && sorted.length > 1) {
        for (let i = 0; i < sorted.length - 1; i++) {
          sorted[i].nextPhaseIds = [sorted[i + 1].id];
        }
      }

      suppressHistoryRef.current = true;
      setPhases(sorted);
      setPhaseHistory([]);
      setPhaseFuture([]);
      prevPhasesRef.current = clonePhases(sorted);

      const contentObj = (() => {
        const c = (res as any).content ?? (res as any).data?.content;
        if (typeof c === 'string') {
          try { return JSON.parse(c); } catch { return c; }
        }
        return c || {};
      })();

      setMilestones((contentObj.milestones || []).map((m: any, i: number) => ({
        id: m.id || `ms_${i}`,
        name: m.name || '里程碑',
        phaseId: m.phaseId || '',
        offsetDays: m.offsetDays || 0,
      })));

    } catch (e) {
      console.error(e);
      alert('加载模版失败');
    } finally {
      setLoading(false);
    }
  }

  // 拖拽连线回调：建立阶段流转关系（本地状态操作，保存时一并提交）
  const handlePhaseConnect = useCallback((sourceId: string, targetId: string) => {
    setPhases(prev => prev.map(p =>
      p.id === sourceId
        ? { ...p, nextPhaseIds: [...new Set([...(p.nextPhaseIds ?? []), targetId])] }
        : p
    ));
  }, []);

  const handleUndo = useCallback(() => {
    setPhaseHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      suppressHistoryRef.current = true;
      setPhaseFuture((f) => [clonePhases(phases), ...f].slice(0, 10));
      setPhases(clonePhases(last));
      prevPhasesRef.current = clonePhases(last);
      return h.slice(0, -1);
    });
  }, [clonePhases, phases]);

  // 在右侧面板中添加后继阶段（并行）
  const handleAddTransition = useCallback(
    (fromId: string, toId: string) => {
      setPhases(prev => prev.map(p =>
        p.id === fromId
          ? { ...p, nextPhaseIds: [...new Set([...(p.nextPhaseIds ?? []), toId])] }
          : p
      ));
    },
    []
  );

  const handleCreateSuccessorPhase = useCallback((fromId: string, rawName: string) => {
    const name = rawName.trim();
    if (!name) {
      alert('请先输入后继阶段名称');
      return;
    }

    const newId = `phase_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    setPhases((prev) => {
      const fromPhase = prev.find((p) => p.id === fromId);
      const siblingCount = (fromPhase?.nextPhaseIds ?? []).length;
      const maxOrder = prev.reduce((max, p) => Math.max(max, p.order || 0), 0);

      const newPhase: Phase = {
        id: newId,
        name,
        order: maxOrder + 1,
        x: typeof fromPhase?.x === 'number' ? fromPhase.x + 220 : undefined,
        y: typeof fromPhase?.y === 'number' ? fromPhase.y + siblingCount * 90 : undefined,
        type: 'normal',
        source: 'self',
        enabled: true,
        completionTip: '',
        allowSkip: false,
        tasks: [],
        events: [],
        nextPhaseIds: [],
      };

      return prev.map((p) =>
        p.id === fromId
          ? { ...p, nextPhaseIds: [...new Set([...(p.nextPhaseIds ?? []), newId])] }
          : p
      ).concat(newPhase);
    });

    setQuickSuccessorName('');
  }, []);

  // 右侧面板：删除后继阶段
  const handleRemoveTransition = useCallback(
    (fromId: string, toId: string) => {
      setPhases(prev => prev.map(p =>
        p.id === fromId
          ? { ...p, nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== toId) }
          : p
      ));
    },
    []
  );

  // 流程图上删除连线时调用（本地状态）
  const handleEdgeDelete = useCallback(
    (fromId: string, toId: string) => {
      setPhases(prev => prev.map(p =>
        p.id === fromId
          ? { ...p, nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== toId) }
          : p
      ));
    },
    []
  );

  // 边重连：删旧连线 + 建新连线（本地状态）
  const handleEdgeReconnect = useCallback((oldEdge: any, newConnection: any) => {
    const oldFrom = oldEdge?.source;
    const oldTo = oldEdge?.target;
    const newFrom = newConnection?.source;
    const newTo = newConnection?.target;
    if (!oldFrom || !oldTo || !newFrom || !newTo) {
      console.warn('[TemplateEditor] Invalid reconnect params', oldEdge, newConnection);
      return;
    }
    setPhases(prev => prev.map(p => {
      if (p.id === oldFrom) {
        return { ...p, nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== oldTo) };
      }
      if (p.id === newFrom) {
        return { ...p, nextPhaseIds: [...new Set([...(p.nextPhaseIds ?? []), newTo])] };
      }
      return p;
    }));
  }, []);

  // 拖拽放置操作：设为并行（来自画布的 drop menu）
  const handleDropParallel = useCallback((draggedPhaseId: string, targetPhaseId: string) => {
    setPhases(prev => {
      let updated = [...prev];
      // 找到指向 target 的前置阶段，增加 dragged 为其并行后继
      const prevPhase = updated.find(p => (p.nextPhaseIds ?? []).includes(targetPhaseId));
      if (prevPhase) {
        updated = updated.map(p =>
          p.id === prevPhase.id
            ? { ...p, nextPhaseIds: [...new Set([...(p.nextPhaseIds ?? []), draggedPhaseId])] }
            : p
        );
      }
      // dragged -> target 的第一个后继（汇合点）
      const targetPhase = updated.find(p => p.id === targetPhaseId);
      const mergeNodeId = (targetPhase?.nextPhaseIds ?? [])[0];
      if (mergeNodeId) {
        updated = updated.map(p =>
          p.id === draggedPhaseId
            ? { ...p, nextPhaseIds: [...new Set([...(p.nextPhaseIds ?? []), mergeNodeId])] }
            : p
        );
      }
      // 移除 dragged 原有串行前置（如果与新 prevPhase 不同）
      const draggedPrevPhase = updated.find(p =>
        p.id !== prevPhase?.id && (p.nextPhaseIds ?? []).includes(draggedPhaseId)
      );
      if (draggedPrevPhase) {
        updated = updated.map(p =>
          p.id === draggedPrevPhase.id
            ? { ...p, nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId) }
            : p
        );
      }
      return updated;
    });
  }, []);

  // 拖拽放置操作：插入到目标节点之后
  const handleDropInsertAfter = useCallback((draggedPhaseId: string, targetPhaseId: string) => {
    setPhases(prev => {
      const targetPhase = prev.find(p => p.id === targetPhaseId);
      if (!targetPhase) return prev;
      const targetNextIds = (targetPhase.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId);

      // 先移除所有指向 dragged 的前置关系，避免出现双前驱串线污染
      let updated = prev.map(p => ({
        ...p,
        nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId),
      }));

      // target -> dragged
      updated = updated.map(p =>
        p.id === targetPhaseId
          ? { ...p, nextPhaseIds: [draggedPhaseId] }
          : p
      );

      // dragged -> target 原后继（串行插入）
      updated = updated.map(p =>
        p.id === draggedPhaseId
          ? { ...p, nextPhaseIds: [...targetNextIds] }
          : p
      );

      return updated;
    });
  }, []);

  // 拖拽放置操作：插入在目标节点与其首个后继之间（语义更明确）
  const handleDropInsertBetween = useCallback((draggedPhaseId: string, targetPhaseId: string) => {
    setPhases(prev => {
      const targetPhase = prev.find(p => p.id === targetPhaseId);
      if (!targetPhase) return prev;
      const targetNextIds = (targetPhase.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId);
      if (targetNextIds.length === 0) {
        // 没有后继时，退化成“插入到此节点之后”
        return prev.map(p => {
          if (p.id === targetPhaseId) return { ...p, nextPhaseIds: [draggedPhaseId] };
          if (p.id === draggedPhaseId) return { ...p, nextPhaseIds: [] };
          return { ...p, nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId) };
        });
      }

      // 清理所有指向 dragged 的旧入边
      let updated = prev.map(p => ({
        ...p,
        nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId),
      }));

      // target -> dragged
      updated = updated.map(p =>
        p.id === targetPhaseId
          ? { ...p, nextPhaseIds: [draggedPhaseId] }
          : p
      );

      // dragged -> target 原后继（默认接首个，保证“插入两节点之间”语义稳定）
      const firstNextId = targetNextIds[0];
      updated = updated.map(p =>
        p.id === draggedPhaseId
          ? { ...p, nextPhaseIds: firstNextId ? [firstNextId] : [] }
          : p
      );

      return updated;
    });
  }, []);

  // 拖拽放置操作：与目标节点首个后继并行
  const handleDropParallelWithSuccessor = useCallback((draggedPhaseId: string, targetPhaseId: string) => {
    setPhases(prev => {
      const target = prev.find(p => p.id === targetPhaseId);
      if (!target) return prev;
      const successorId = (target.nextPhaseIds ?? [])[0];
      if (!successorId) {
        // 没有后继时，退化为目标并行后继
        return prev.map(p => {
          if (p.id === targetPhaseId) {
            return { ...p, nextPhaseIds: [...new Set([...(p.nextPhaseIds ?? []), draggedPhaseId])] };
          }
          if (p.id === draggedPhaseId) {
            return { ...p, nextPhaseIds: [] };
          }
          return { ...p, nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId) };
        });
      }

      const successor = prev.find(p => p.id === successorId);
      const successorNext = successor?.nextPhaseIds ?? [];

      // 1) 清理 dragged 原入边
      // 2) target 同时指向 successor 与 dragged（并行）
      // 3) dragged 默认汇入 successor 的后继，尽量保持流程连续
      return prev.map(p => {
        const cleaned = (p.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId);
        if (p.id === targetPhaseId) {
          return { ...p, nextPhaseIds: [...new Set([...cleaned, successorId, draggedPhaseId])] };
        }
        if (p.id === draggedPhaseId) {
          return { ...p, nextPhaseIds: [...new Set(successorNext)] };
        }
        return { ...p, nextPhaseIds: cleaned };
      });
    });
  }, []);

  // 拖拽放置操作：插入到目标节点之前
  const handleDropInsertBefore = useCallback((draggedPhaseId: string, targetPhaseId: string) => {
    setPhases(prev => {
      const targetPhase = prev.find(p => p.id === targetPhaseId);
      if (!targetPhase) return prev;

      const predecessors = prev
        .filter(p => (p.nextPhaseIds ?? []).includes(targetPhaseId) && p.id !== draggedPhaseId)
        .map(p => p.id);

      // 清理所有指向 dragged 的旧入边，避免重复前驱
      let updated = prev.map(p => ({
        ...p,
        nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== draggedPhaseId),
      }));

      // 所有 target 的前驱改为指向 dragged（保持并行前驱关系）
      updated = updated.map(p => {
        if (!predecessors.includes(p.id)) return p;
        const current = p.nextPhaseIds ?? [];
        const withoutTarget = current.filter(id => id !== targetPhaseId);
        return { ...p, nextPhaseIds: [...new Set([...withoutTarget, draggedPhaseId])] };
      });

      // dragged -> target
      updated = updated.map(p =>
        p.id === draggedPhaseId
          ? { ...p, nextPhaseIds: [targetPhaseId] }
          : p
      );

      return updated;
    });
  }, []);

  // 兼容旧名：handleConnect （一些 JSX 仍引用此名）

  // 阶段节点点击回调
  const handlePhaseClick = useCallback((phase: any) => {
    // 子阶段节点点击时，定位到其父主阶段
    if (phase.isSubPhase) {
      const parent = phases.find((p) =>
        (p.subPhases ?? []).some((sp) => sp.id === phase.id)
      );
      if (parent) {
        setSelectedPhaseId(parent.id);
        setActiveTab(0);
      }
      return;
    }
    setSelectedPhaseId(phase.id);
    setActiveTab(0);
  }, [phases]);

  const viewportCenterGetterRef = useRef<(() => { x: number; y: number }) | null>(null);

  const getNewPhasePosition = useCallback(() => {
    const center = viewportCenterGetterRef.current?.();

    // fallback: place after right-most phase if center is unavailable
    const existingX = phases
      .map((p) => (typeof p.x === 'number' ? p.x : null))
      .filter((v): v is number => v !== null);
    const existingY = phases
      .map((p) => (typeof p.y === 'number' ? p.y : null))
      .filter((v): v is number => v !== null);

    const fallbackX = existingX.length > 0 ? Math.max(...existingX) + 220 : 0;
    const fallbackY = existingY.length > 0 ? existingY[Math.floor(existingY.length / 2)] : 0;

    const base = {
      x: center?.x ?? fallbackX,
      y: center?.y ?? fallbackY,
    };

    const occupied = phases
      .map((p) => ({
        x: typeof p.x === 'number' ? p.x : null,
        y: typeof p.y === 'number' ? p.y : null,
      }))
      .filter((pos): pos is { x: number; y: number } => pos.x !== null && pos.y !== null);

    const offsets = [
      { x: 0, y: 0 },
      { x: 0, y: 96 },
      { x: 0, y: -96 },
      { x: 180, y: 0 },
      { x: -180, y: 0 },
      { x: 180, y: 96 },
      { x: 180, y: -96 },
      { x: -180, y: 96 },
      { x: -180, y: -96 },
    ];

    const isOccupied = (x: number, y: number) => {
      return occupied.some((pos) => Math.abs(pos.x - x) < 140 && Math.abs(pos.y - y) < 72);
    };

    for (const offset of offsets) {
      const x = base.x + offset.x;
      const y = base.y + offset.y;
      if (!isOccupied(x, y)) return { x, y };
    }

    return { x: base.x + 220, y: base.y + 120 };
  }, [phases]);

  function addPhase() {
    const position = getNewPhasePosition();
    const newPhase: Phase = {
      id: `phase_${Date.now()}`,
      name: '新阶段',
      order: phases.length + 1,
      x: position.x,
      y: position.y,
      type: 'normal',
      source: 'self',
      enabled: true,
      completionTip: '',
      allowSkip: false,
      tasks: [],
      events: [],
    };
    const updated = [...phases, newPhase];
    setPhases(updated);
    setSelectedPhaseId(newPhase.id);
    setActiveTab(0);
  }

  const handleNodePositionChange = useCallback((phaseId: string, x: number, y: number) => {
    setPhases(prev => prev.map(p =>
      p.id === phaseId ? { ...p, x, y } : p
    ));
  }, []);

  const handleNodesPositionBatchChange = useCallback((positions: Array<{ id: string; x: number; y: number }>) => {
    const posMap = new Map(positions.map(p => [p.id, p]));
    setPhases(prev => prev.map(p => {
      const pos = posMap.get(p.id);
      if (!pos) return p;
      return { ...p, x: pos.x, y: pos.y };
    }));
  }, []);

  function updatePhase(phaseId: string, updates: Partial<Phase>) {
    setPhases(prev => prev.map(p => p.id === phaseId ? { ...p, ...updates } : p));
  }

  function deletePhase(phaseId: string) {
    if (!confirm('确认删除该阶段？与该阶段相关的所有连线也将被移除。')) return;
    setPhases(prev => {
      const filtered = prev.filter(p => p.id !== phaseId);
      const cleaned = filtered.map(p => ({
        ...p,
        nextPhaseIds: (p.nextPhaseIds ?? []).filter(id => id !== phaseId),
      }));
      return cleaned.map((p, i) => ({ ...p, order: i + 1 }));
    });
    if (selectedPhaseId === phaseId) setSelectedPhaseId(null);
  }

  const filteredPhases = useMemo(() => {
    if (!searchText.trim()) return phases;
    const kw = searchText.trim().toLowerCase();
    return phases.filter(p => p.name.toLowerCase().includes(kw));
  }, [phases, searchText]);



  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPhases(prev => {
      const oldIdx = prev.findIndex(p => p.id === active.id);
      const newIdx = prev.findIndex(p => p.id === over.id);
      return arrayMove(prev, oldIdx, newIdx).map((p, i) => ({ ...p, order: i + 1 }));
    });
  }

  async function persistTemplate(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!template) return;
    const templateName = (editingTitle ? titleDraft : (template as any).name || '').trim();
    if (!templateName) {
      if (!silent) {
        alert('模版名称不能为空');
      }
      return false;
    }

    const content = {
      phases: phases.map(p => ({
        id: p.id,
        name: p.name,
        order: p.order,
        x: p.x,
        y: p.y,
        type: p.type,
        source: p.source,
        enabled: p.enabled,
        completionTip: p.completionTip,
        phaseInfo: p.phaseInfo,
        allowSkip: p.allowSkip,
        nextPhaseIds: p.nextPhaseIds ?? [],
        tasks: p.tasks.map(t => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          estimatedDays: t.estimatedDays,
          role: t.role,
          source: t.source,
          enabled: t.enabled,
        })),
        events: (p.events || []).map((ev: PhaseEvent) => ({
          id: ev.id,
          trigger: ev.trigger,
          label: ev.label,
          enabled: ev.enabled,
          actions: ev.actions,
        })),
        eventTemplates: (p.eventTemplates || []).map((ev: PhaseEvent) => ({
          id: ev.id,
          trigger: ev.trigger,
          label: ev.label,
          enabled: ev.enabled,
          actions: ev.actions,
        })),
      })),
      milestones,
    };

    setSaving(true);
    try {
      await projectTemplatesAPI.patch((template as any).id, {
        name: templateName,
        content: JSON.stringify(content),
      });
      setTemplate((t: any) => ({ ...t, name: templateName }));
      setTitleDraft(templateName);
      setEditingTitle(false);
      if (!silent) {
        alert('模版已保存！');
      }
      return true;
    } catch (e) {
      console.error(e);
      alert('保存失败');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    await persistTemplate();
  }

  const closePhaseEditorWithSave = useCallback(async () => {
    const ok = await persistTemplate({ silent: true });
    if (ok) {
      setSelectedPhaseId(null);
    }
  }, [template, editingTitle, titleDraft, phases, milestones]);

  const handlePhaseEditorKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-prevent-save-enter="true"]')) {
      return;
    }
    const tag = target.tagName;
    const isInputLike = tag === 'INPUT' || tag === 'SELECT';

    if (e.key === 'Enter' && isInputLike && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      await closePhaseEditorWithSave();
    }
  }, [closePhaseEditorWithSave]);

  // selectedPhase 从 phases 派生，确保编辑后右侧面板实时更新
  const selectedPhase = phases.find(p => p.id === selectedPhaseId) ?? null;
  useEffect(() => {
    setQuickSuccessorName('');
  }, [selectedPhaseId]);

  const currentPhaseInfo = useMemo(() => {
    if (!selectedPhase) {
      return {
        goal: '',
        description: '',
        projectTypes: [] as string[],
        exitCriteria: [] as string[],
        goNoGoRule: '',
      };
    }
    return selectedPhase.phaseInfo || {
      goal: '',
      description: '',
      projectTypes: [],
      exitCriteria: [],
      goNoGoRule: '',
    };
  }, [selectedPhase]);

  const updateCurrentPhaseInfo = useCallback((updates: Partial<NonNullable<Phase['phaseInfo']>>) => {
    if (!selectedPhase) return;
    updatePhase(selectedPhase.id, {
      phaseInfo: {
        goal: currentPhaseInfo.goal,
        description: currentPhaseInfo.description,
        projectTypes: currentPhaseInfo.projectTypes,
        exitCriteria: currentPhaseInfo.exitCriteria,
        goNoGoRule: currentPhaseInfo.goNoGoRule,
        ...updates,
      },
    });
  }, [selectedPhase, currentPhaseInfo]);

  const handleApplyPhaseInfoTemplate = useCallback(() => {
    if (!selectedPhase) return;
    updateCurrentPhaseInfo(buildRecommendedPhaseInfo(selectedPhase.name || '项目立项'));
  }, [selectedPhase, updateCurrentPhaseInfo]);

  const handleApplyPhaseInfoToCompletionTip = useCallback((mode: 'replace' | 'append') => {
    if (!selectedPhase) return;
    const tip = buildCompletionTipFromPhaseInfo(currentPhaseInfo);
    const current = (selectedPhase.completionTip || '').trim();
    const next = mode === 'append' && current ? `${current}\n\n${tip}` : tip;
    updatePhase(selectedPhase.id, { completionTip: next });
  }, [selectedPhase, currentPhaseInfo]);

  const totalTasks = phases.reduce((s, p) => s + p.tasks.filter(t => t.enabled).length, 0);
  const previewContent = useMemo(() => buildTemplatePreviewContent((template as any)?.name || '模板预览', phases, milestones), [template, phases, milestones]);

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>;
  if (!template) return <div className="flex items-center justify-center h-full text-gray-400">模版不存在</div>;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* 顶部栏 */}
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white">
        {/* 左侧：返回 + 标题 */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/project-templates')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">← 返回列表</button>
          <div className="w-px h-4 bg-gray-200" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">
                {editingTitle ? (
                  <input
                    autoFocus
                    className="text-sm font-semibold text-gray-800 border border-blue-300 rounded px-1 outline-none focus:ring-1 focus:ring-blue-300"
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={() => {
                      if (titleDraft.trim()) {
                        setTemplate((t: any) => ({ ...t, name: titleDraft.trim() }));
                      }
                      setEditingTitle(false);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') { setEditingTitle(false); }
                    }}
                  />
                ) : (template as any).name}
              </span>
              <button onClick={() => { setTitleDraft((template as any).name || ''); setEditingTitle(true); }} title="编辑名称"><span className="text-gray-400">✎</span></button>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{(template as any).code} · {phases.length} 个阶段 · {totalTasks} 个任务</div>
          </div>
        </div>

        {/* 右侧：工具按钮 + 保存 */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSearch(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-gray-50 ${showSearch ? 'text-blue-600 border-blue-300 bg-blue-50' : 'text-gray-600 border-gray-200'}`}>🔍 搜索</button>
          <div className="relative">
            <button onClick={() => setShowBatchOp(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-gray-50 ${showBatchOp ? 'text-blue-600 border-blue-300 bg-blue-50' : 'text-gray-600 border-gray-200'}`}>批量操作</button>
            {showBatchOp && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-36 py-1">
                <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" onClick={() => { setPhases(p => p.map(ph => ({ ...ph, enabled: true }))); setShowBatchOp(false); }}>全部启用</button>
                <button className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" onClick={() => { setPhases(p => p.map(ph => ({ ...ph, enabled: false }))); setShowBatchOp(false); }}>全部禁用</button>
                <button className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50" onClick={() => { if (confirm('确认删除所有已禁用的阶段？')) { setPhases(p => { const filtered = p.filter(ph => ph.enabled !== false); return filtered.map((ph, i) => ({ ...ph, order: i + 1 })); }); } setShowBatchOp(false); }}>删除已禁用阶段</button>
              </div>
            )}
          </div>
          <button
            onClick={handleUndo}
            disabled={phaseHistory.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md transition-colors ${phaseHistory.length === 0 ? 'text-gray-300 border-gray-200 cursor-not-allowed bg-gray-50' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            title={phaseHistory.length === 0 ? '没有可回退的操作' : `回退（剩余 ${phaseHistory.length} 步）`}
          >
            撤销
          </button>
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">预览</button>
          <div className="w-px h-4 bg-gray-200" />
          <button onClick={saveTemplate} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">{saving ? '保存中...' : '保存模版'}</button>
        </div>
      </div>

      {/* 主内容 */}
      {/* 主体区域 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── 左侧阶段面板 ── */}
        <div
          className={[
            'relative flex-shrink-0 flex flex-col',
            'border-r border-gray-200 bg-white',
            'transition-all duration-300 ease-in-out',
            leftPanelOpen ? 'w-72' : 'w-0 overflow-hidden',
          ].join(' ')}
        >
          {/* 面板内容（折叠时隐藏） */}
          {leftPanelOpen && (
            <div className="flex flex-col h-full w-72">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">阶段流程</span>
                <button
                  onClick={addPhase}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  + 新增阶段
                </button>
              </div>
              {showSearch && (
                <div className="px-3 py-2 border-b border-gray-100">
                  <input
                    autoFocus
                    placeholder="搜索阶段名称..."
                    className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-300"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                  />
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-3">
                {phases.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">点击「新增阶段」开始构建流程</p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={phases.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      {filteredPhases.map(phase => (
                        <PhaseNode
                          key={phase.id}
                          phase={phase}
                          isSelected={selectedPhase?.id === phase.id}
                          onClick={() => { setSelectedPhaseId(phase.id); setActiveTab(0); }}
                          onDelete={() => deletePhase(phase.id)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 左侧收起/展开按钮（悬浮在面板边缘） ── */}
        <button
          onClick={() => setLeftPanelOpen(v => !v)}
          className={[
            'absolute z-20 top-1/2 -translate-y-1/2',
            'flex items-center justify-center',
            'w-5 h-14 rounded-r-xl',
            'bg-blue-500 hover:bg-blue-600 active:bg-blue-700',
            'text-white shadow-lg',
            'transition-all duration-300 ease-in-out',
            'cursor-pointer select-none',
            leftPanelOpen ? 'left-72' : 'left-0',
          ].join(' ')}
          title={leftPanelOpen ? '收起阶段列表' : '展开阶段列表'}
        >
          <svg
            width="10" height="16" viewBox="0 0 10 16" fill="none"
            className={[
              'transition-transform duration-300',
              leftPanelOpen ? 'rotate-0' : 'rotate-180',
            ].join(' ')}
          >
            <path
              d="M7 2L2 8L7 14"
              stroke="white" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>

{/* 中央画布区域 */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* 画布工具栏 */}
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2
                          border-b border-gray-100 bg-white">
            <span className="text-xs text-gray-400">
              {phases.length} 个阶段 · {allTasks.length} 个任务
              {allTasks.length === 0 && (
                <span className="ml-2 text-amber-500">
                  ⚠️ 请先在左侧阶段中添加任务
                </span>
              )}
            </span>
            <div className="flex-1" />
          </div>

          {/* React Flow 画布 */}
          {phases.length > 0 ? (
            <div className="flex-1">
              <ProcessFlowDiagram
                phases={flowPhases}
                readonly={false}
                onRegisterViewportCenterGetter={(getter) => {
                  viewportCenterGetterRef.current = getter;
                }}
                onPhaseConnect={handlePhaseConnect}
                onPhaseClick={handlePhaseClick}
                onAddParallel={handleAddParallel}
                onEdgeDelete={handleEdgeDelete}
                onEdgeReconnect={handleEdgeReconnect}
                onDropParallel={handleDropParallel}
                onDropInsertAfter={handleDropInsertAfter}
                onDropInsertBetween={handleDropInsertBetween}
                onDropParallelWithSuccessor={handleDropParallelWithSuccessor}
                onDropInsertBefore={handleDropInsertBefore}
                onNodePositionChange={handleNodePositionChange}
                onNodesPositionChange={handleNodesPositionBatchChange}
              />
            </div>
          ) : (
            /* 空状态占位 */
            <div className="flex-1 flex flex-col items-center justify-center
                            bg-gray-50 text-gray-400">
              <div className="text-4xl mb-3">🗂</div>
              <div className="text-sm font-medium text-gray-500 mb-1">
                暂无任务节点
              </div>
              <div className="text-xs text-gray-400">
                请先在左侧阶段列表中添加任务，流程图将自动生成
              </div>
            </div>
          )}

          {/* 里程碑展示行 */}
          {milestones && milestones.length > 0 && (
            <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-400 flex-shrink-0">
                  里程碑
                </span>
                {milestones.map((ms: any, i: number) => {
                  const colors = [
                    'bg-red-50 text-red-600 border-red-200',
                    'bg-orange-50 text-orange-600 border-orange-200',
                    'bg-green-50 text-green-600 border-green-200',
                    'bg-blue-50 text-blue-600 border-blue-200',
                    'bg-purple-50 text-purple-600 border-purple-200',
                  ];
                  return (
                    <span
                      key={ms.id}
                      className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full
                                  border text-xs ${colors[i % colors.length]}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                      {ms.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── 节点编辑居中弹窗 ── */}
        {selectedPhase && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(15,23,42,0.45)' }}
            onClick={() => { void closePhaseEditorWithSave(); }}
          >
            <div
              className="relative flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
              style={{ width: 'min(92vw, 1220px)', height: 'min(92vh, calc(100vh - 56px))' }}
              onClick={e => e.stopPropagation()}
              onKeyDown={(e) => { void handlePhaseEditorKeyDown(e); }}
            >
              {/* 弹窗顶部 */}
              <div className="flex items-start justify-between px-7 py-4 border-b border-gray-100 flex-shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">编辑阶段</h3>
                  <p className="mt-1 text-xs text-gray-500">节点信息用于定义阶段本身；右侧模板建议仅辅助填写，不会自动污染表单。</p>
                </div>
                <button onClick={() => { void closePhaseEditorWithSave(); }} className="mt-0.5 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
              </div>

              {/* 标签页 */}
              <div className="flex border-b border-gray-100 flex-shrink-0">
                {['节点信息', '节点流转', '节点事件', '节点任务'].map((tab, i) => (
                  <button key={i} onClick={() => setActiveTab(i)} className={`flex-1 py-2.5 text-xs font-medium transition-colors ${activeTab === i ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                    {tab}
                  </button>
                ))}
              </div>

              {/* 内容区 */}
              <div className="flex-1 overflow-hidden flex flex-col" style={{ background: '#f8fafc' }}>
                {activeTab === 0 && (
                  <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>

                    {/* ── 左侧：正式表单 ── */}
                    <div className="overflow-y-auto p-5 space-y-4" style={{ borderRight: '1px solid #edf0f5' }}>

                      {/* 卡片 1：基础信息 */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="text-sm font-bold text-gray-900">基础信息</h4>
                            <p className="mt-1 text-xs text-gray-500">这里填写正式保存到系统的节点字段，不展示说明性长文。</p>
                          </div>
                          <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">正式表单区</span>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="text-sm font-semibold text-gray-700">节点名称 <span className="text-red-500">*</span></label>
                              <span className="text-xs text-gray-400">阶段显示名称</span>
                            </div>
                            <input
                              className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                              value={selectedPhase.name}
                              onChange={(e) => updatePhase(selectedPhase.id, { name: e.target.value })}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="text-sm font-semibold text-gray-700">节点类型</label>
                              <span className="text-xs text-gray-400">项目立项建议选择"审批"</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2.5">
                              {[{ value: 'normal', label: '普通' },{ value: 'milestone', label: '里程碑' },{ value: 'approval', label: '审批' }].map(({ value, label }) => (
                                <button key={value} onClick={() => updatePhase(selectedPhase.id, { type: value as any })} className={`h-10 text-sm font-semibold rounded-xl border transition-colors ${selectedPhase.type === value ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'}`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="text-sm font-semibold text-gray-700">节点目标</label>
                              <span className="text-xs text-gray-400">说明该阶段要达成什么</span>
                            </div>
                            <textarea
                              rows={3}
                              className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-vertical"
                              placeholder="一句话描述这个节点要达成的决策或成果"
                              value={currentPhaseInfo.goal}
                              onChange={(e) => updateCurrentPhaseInfo({ goal: e.target.value })}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="text-sm font-semibold text-gray-700">节点说明</label>
                              <span className="text-xs text-gray-400">说明工作范围、输入、输出和管理要求</span>
                            </div>
                            <textarea
                              rows={5}
                              className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-vertical"
                              placeholder="说明该节点需要明确的信息和产出文档"
                              value={currentPhaseInfo.description}
                              onChange={(e) => updateCurrentPhaseInfo({ description: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* 卡片 2：适用项目类型 */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-gray-900">适用项目类型</h4>
                          <p className="mt-1 text-xs text-gray-500">用于区分模板适用于哪些研发项目，后续可影响任务模板推荐。</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {PHASE_PROJECT_TYPE_OPTIONS.map((pt) => {
                            const active = currentPhaseInfo.projectTypes.includes(pt);
                            return (
                              <button
                                key={pt}
                                type="button"
                                onClick={() => {
                                  const next = active
                                    ? currentPhaseInfo.projectTypes.filter((t) => t !== pt)
                                    : [...currentPhaseInfo.projectTypes, pt];
                                  updateCurrentPhaseInfo({ projectTypes: next });
                                }}
                                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${active ? 'bg-blue-50 text-blue-600 border-blue-500 font-semibold' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}
                              >
                                {pt}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 卡片 3：完成规则 */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-gray-900">完成规则</h4>
                          <p className="mt-1 text-xs text-gray-500">用于控制节点是否可以关闭，以及完成节点时给用户的二次确认提示。</p>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="text-sm font-semibold text-gray-700">阶段完成标准</label>
                              <span className="text-xs text-gray-400">判断该阶段是否可流转</span>
                            </div>
                            <textarea
                              rows={8}
                              className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-vertical"
                              placeholder={'1. 项目基本信息已填写完整\n2. 已完成Go/No-Go决策并指定项目负责人'}
                              value={currentPhaseInfo.exitCriteria.map((item, i) => `${i + 1}. ${item}`).join('\n')}
                              onChange={(e) => {
                                const lines = e.target.value.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
                                updateCurrentPhaseInfo({ exitCriteria: lines });
                              }}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="text-sm font-semibold text-gray-700">节点完成提示</label>
                              <button
                                type="button"
                                className="text-xs font-semibold text-blue-600 hover:underline"
                                onClick={() => setShowCompletionPreview(v => !v)}
                              >
                                {showCompletionPreview ? '收起预览' : '预览完成确认弹窗'}
                              </button>
                            </div>
                            <textarea
                              rows={5}
                              className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-vertical"
                              placeholder="自定义提醒文案，作为节点二次确认框内容展示"
                              value={selectedPhase.completionTip || ''}
                              onChange={(e) => updatePhase(selectedPhase.id, { completionTip: e.target.value })}
                            />
                            {showCompletionPreview && (
                              <div className="mt-2 p-3 border border-dashed border-blue-300 rounded-xl bg-blue-50 text-blue-800 text-xs leading-relaxed whitespace-pre-line">
                                {`是否确认完成「${selectedPhase.name || '当前节点'}」阶段？\n\n${selectedPhase.completionTip || '（暂无节点完成提示）'}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 卡片 4：节点控制 */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <div className="mb-4">
                          <h4 className="text-sm font-bold text-gray-900">节点控制</h4>
                          <p className="mt-1 text-xs text-gray-500">控制该阶段是否允许跳过、是否需要排期估算和实际工时。</p>
                        </div>
                        <div className="space-y-2.5">
                          {([
                            { key: 'allowSkip', label: '允许跳过节点', desc: '项目立项是强制关卡，建议关闭。' },
                            { key: 'showProgress', label: '展示估分排期填写入口', desc: '立项阶段需要初步评估资源、周期和排期，建议开启。' },
                            { key: 'requireActualHours', label: '节点需填写实际工时', desc: '如需统计研发管理工时可开启；默认建议关闭。' },
                          ] as { key: string; label: string; desc: string }[]).map(({ key, label, desc }) => {
                            const enabled = !!(selectedPhase as any)[key];
                            return (
                              <div key={key} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 bg-white gap-4">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900">{label}</div>
                                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={enabled}
                                  aria-label={label}
                                  onClick={() => updatePhase(selectedPhase.id, { [key]: !enabled })}
                                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                                >
                                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                    {/* ── 右侧：模板建议面板 ── */}
                    <div className="overflow-y-auto p-4 space-y-3">

                      {/* 模板建议（蓝色） */}
                      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                        <h4 className="text-sm font-bold text-gray-900">模板建议</h4>
                        <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">右侧内容只是辅助建议，只有点击"应用模板"或"填入字段"时才写入左侧表单。</p>
                        <div className="mt-3 p-3 bg-white border border-blue-200 rounded-xl">
                          <div className="text-sm font-bold text-gray-900">{selectedPhase.name || '节点'}模板</div>
                          <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                            适用于非医疗分子检测产品、食品安全、水产病原、中药材鉴定、客户定制、合作开发和准注册级试剂项目。
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setShowApplyConfirm(true)}
                              className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                            >
                              应用模板
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowCompletionPreview(v => !v)}
                              className="flex-1 py-2 text-xs font-semibold border border-gray-300 bg-white text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
                            >
                              预览完成提示
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 字段建议 */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-4">
                        <h4 className="text-sm font-bold text-gray-900">字段建议</h4>
                        <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">点击"填入字段"可将建议内容写入对应字段，避免复制粘贴错误。</p>

                        {/* 节点目标建议 */}
                        <div className="mt-3 border border-gray-200 rounded-xl p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-gray-700">节点目标建议</span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-blue-600 hover:underline"
                              onClick={() => {
                                const draft = buildRecommendedPhaseInfo(selectedPhase.name);
                                navigator.clipboard?.writeText(draft.goal).catch(() => {});
                              }}
                            >复制</button>
                          </div>
                          <div className="text-xs text-gray-500 leading-relaxed line-clamp-4">
                            {buildRecommendedPhaseInfo(selectedPhase.name).goal}
                          </div>
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => updateCurrentPhaseInfo({ goal: buildRecommendedPhaseInfo(selectedPhase.name).goal })}
                              className="px-3 py-1.5 text-xs font-semibold border border-gray-300 bg-white text-gray-600 rounded-lg hover:bg-gray-50"
                            >填入字段</button>
                          </div>
                        </div>

                        {/* 阶段完成标准建议 */}
                        <div className="mt-2 border border-gray-200 rounded-xl p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-gray-700">阶段完成标准建议</span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-blue-600 hover:underline"
                              onClick={() => {
                                const draft = buildRecommendedPhaseInfo(selectedPhase.name);
                                navigator.clipboard?.writeText(draft.exitCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')).catch(() => {});
                              }}
                            >复制</button>
                          </div>
                          <div className="text-xs text-gray-500 leading-relaxed line-clamp-5 whitespace-pre-line">
                            {buildRecommendedPhaseInfo(selectedPhase.name).exitCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}
                          </div>
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => updateCurrentPhaseInfo({ exitCriteria: buildRecommendedPhaseInfo(selectedPhase.name).exitCriteria })}
                              className="px-3 py-1.5 text-xs font-semibold border border-gray-300 bg-white text-gray-600 rounded-lg hover:bg-gray-50"
                            >填入字段</button>
                          </div>
                        </div>

                        {/* 节点完成提示建议 */}
                        <div className="mt-2 border border-gray-200 rounded-xl p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-gray-700">节点完成提示建议</span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-blue-600 hover:underline"
                              onClick={() => {
                                const tip = buildCompletionTipFromPhaseInfo(currentPhaseInfo);
                                navigator.clipboard?.writeText(tip).catch(() => {});
                              }}
                            >复制</button>
                          </div>
                          <div className="text-xs text-gray-500 leading-relaxed line-clamp-3">
                            请确认项目立项资料已填写完整，并已完成立项评审。完成本节点后，项目将进入下一阶段。
                          </div>
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => handleApplyPhaseInfoToCompletionTip('replace')}
                              className="px-3 py-1.5 text-xs font-semibold border border-gray-300 bg-white text-gray-600 rounded-lg hover:bg-gray-50"
                            >填入字段</button>
                          </div>
                        </div>
                      </div>

                      {/* 常见遗漏项（amber） */}
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                        <h4 className="text-sm font-bold text-gray-900">{selectedPhase.name || '节点'}阶段常见遗漏项</h4>
                        <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-amber-900 leading-relaxed">
                          <li>未明确项目负责人</li>
                          <li>只写技术目标，没有写业务目标</li>
                          <li>未定义样本范围</li>
                          <li>未定义不适用范围</li>
                          <li>未判断项目等级</li>
                          <li>未评估样本获取风险</li>
                          <li>未设置 Go / No-Go 决策</li>
                          <li>未明确下一阶段交付物</li>
                        </ul>
                      </div>

                    </div>
                  </div>
                )}

                {activeTab !== 0 && (
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {activeTab === 1 && selectedPhase && (

                  <div className="p-4 space-y-6">

                    {/* ── 前置阶段（流入） ── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          前置阶段
                        </label>
                        <span className="text-[10px] text-gray-400">完成后本阶段才可开始</span>
                      </div>

                      {/* 已有前置阶段列表 */}
                      <div className="space-y-1.5 mb-2">
                        {(() => {
                          // 找出所有以 selectedPhase 为 target 的阶段
                          const prevPhases = phases.filter(p =>
                            (p.nextPhaseIds ?? []).includes(selectedPhase.id)
                          );
                          return prevPhases.length === 0 ? (
                            <div className="text-xs text-gray-300 py-3 text-center
                                            border border-dashed border-gray-200 rounded-lg">
                              暂无前置阶段（当前为起始节点）
                            </div>
                          ) : (
                            prevPhases.map(p => (
                              <div key={p.id}
                                className="flex items-center justify-between px-3 py-2
                                           bg-gray-50 border border-gray-200 rounded-lg group"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-500
                                                   text-[10px] font-bold flex items-center
                                                   justify-center flex-shrink-0">
                                    {p.order}
                                  </span>
                                  <span className="text-xs text-gray-600 truncate">{p.name}</span>
                                </div>
                                <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">
                                  {p.tasks?.length ?? 0} 任务
                                </span>
                              </div>
                            ))
                          );
                        })()}
                      </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* ── 后继阶段（流出，支持并行） ── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          后继阶段
                        </label>
                        <span className="text-[10px] text-blue-400 font-medium">
                          可添加多个（并行）
                        </span>
                      </div>

                      {/* 已配置的后继阶段 */}
                      <div className="space-y-1.5 mb-2">
                        {(selectedPhase.nextPhaseIds ?? []).length === 0 ? (
                          <div className="text-xs text-gray-300 py-3 text-center
                                          border border-dashed border-gray-200 rounded-lg">
                            暂无后继阶段（当前为终止节点）
                          </div>
                        ) : (
                          (selectedPhase.nextPhaseIds ?? []).map((nextId: string) => {
                            const nextPhase = phases.find(p => p.id === nextId);
                            return (
                              <div key={nextId}
                                className="flex items-center justify-between px-3 py-2
                                           bg-blue-50 border border-blue-100 rounded-lg group"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-600
                                                   text-[10px] font-bold flex items-center
                                                   justify-center flex-shrink-0">
                                    {nextPhase?.order ?? '?'}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-blue-700 truncate">
                                      {nextPhase?.name ?? nextId}
                                    </div>
                                    <div className="text-[10px] text-blue-400">
                                      {nextPhase?.tasks?.length ?? 0} 任务
                                      {(nextPhase?.totalDays ?? 0) > 0 &&
                                        ` · ~${nextPhase?.totalDays} 天`}
                                    </div>
                                  </div>
                                </div>
                                {/* 删除按钮 */}
                                <button
                                  onClick={() => handleRemoveTransition(selectedPhase.id, nextId)}
                                  className="ml-2 flex-shrink-0 w-6 h-6 rounded-full
                                             flex items-center justify-center
                                             text-blue-300 hover:text-red-400
                                             hover:bg-red-50 transition-colors
                                             opacity-0 group-hover:opacity-100"
                                  title="移除此流转"
                                >
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path d="M2 2l6 6M8 2l-6 6"
                                      stroke="currentColor" strokeWidth="1.8"
                                      strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 添加后继阶段下拉 */}
                      <select
                        className="w-full text-xs border border-gray-200 rounded-lg
                                   px-3 py-2.5 text-gray-600 bg-white
                                   focus:outline-none focus:ring-2 focus:ring-blue-200
                                   cursor-pointer"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddTransition(selectedPhase.id, e.target.value);
                          }
                          e.target.value = '';
                        }}
                      >
                        <option value="">＋ 添加后继阶段（可并行）...</option>
                        {phases
                          .filter(p =>
                            p.id !== selectedPhase.id &&
                            !(selectedPhase.nextPhaseIds ?? []).includes(p.id)
                          )
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              [{p.order}] {p.name}
                              {(p.tasks?.length ?? 0) > 0 ? ` ({p.tasks.length}任务)` : ''}
                            </option>
                          ))
                        }
                      </select>

                      <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2" data-prevent-save-enter="true">
                        <div className="text-[11px] text-blue-600 mb-1.5">快速新增后继阶段：仅填写名称，后续可在画布中继续完善详细配置。</div>
                        <div className="flex items-center gap-2">
                          <input
                            value={quickSuccessorName}
                            onChange={(e) => setQuickSuccessorName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCreateSuccessorPhase(selectedPhase.id, quickSuccessorName);
                              }
                            }}
                            placeholder="输入新阶段名称，例如：样机验证"
                            className="flex-1 text-xs border border-blue-200 rounded-md px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                          <button
                            type="button"
                            onClick={() => handleCreateSuccessorPhase(selectedPhase.id, quickSuccessorName)}
                            className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            新增并连接
                          </button>
                        </div>
                      </div>

                      {/* 并行说明 */}
                      {(selectedPhase.nextPhaseIds ?? []).length > 1 && (
                        <div className="mt-2 flex items-center gap-1.5 px-3 py-2
                                        bg-amber-50 border border-amber-200 rounded-lg">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                               className="flex-shrink-0 text-amber-500">
                            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M7 4v3.5M7 9.5v.5"
                              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          <span className="text-[11px] text-amber-600">
                            已配置 {(selectedPhase.nextPhaseIds ?? []).length} 个并行后继阶段，
                            流程图将显示分叉连线
                          </span>
                        </div>
                      )}
                    </div>

                  </div>
                )}
                {activeTab === 2 && selectedPhase && (
                  <PhaseEventsPanel
                    phaseName={selectedPhase.name}
                    events={selectedPhase.events || []}
                    eventTemplates={selectedPhase.eventTemplates || []}
                    onEventsChange={(newEvents) => updatePhase(selectedPhase.id, { events: newEvents })}
                    onEventTemplatesChange={(newTemplates) => updatePhase(selectedPhase.id, { eventTemplates: newTemplates })}
                  />
                )}

                {activeTab === 3 && selectedPhase && (
                  <div>
                    {/* lazy import to avoid TS name error in this file scope */}
                    {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                    {/* @ts-ignore */}
                    {null}
                    <PhaseTaskPanel
                      phaseId={selectedPhase.id}
                      tasks={selectedPhase.tasks ?? []}
                      onTasksChange={(newTasks) => updatePhase(selectedPhase.id, { tasks: newTasks })}
                    />
                  </div>
                )}
              </div>
                )}
              </div>

              {/* 弹窗底部 */}
              <div className="flex-shrink-0 flex items-center justify-between px-7 py-4 border-t border-gray-100 bg-white">
                <span className="text-xs text-gray-400">当前编辑：{['节点信息','节点流转','节点事件','节点任务'][activeTab]}｜建议区不会自动保存为表单内容</span>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setSelectedPhaseId(null); }}
                    className="px-4 py-2 text-sm font-semibold border border-gray-300 bg-white text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
                  >取消</button>
                  <button
                    type="button"
                    onClick={() => { void closePhaseEditorWithSave(); }}
                    className="px-5 py-2 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                  >保存阶段</button>
                </div>
              </div>

              {/* 应用模板确认弹窗 */}
              {showApplyConfirm && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl" style={{ background: 'rgba(15,23,42,0.42)' }}>
                  <div className="w-[440px] bg-white rounded-2xl p-6 shadow-2xl">
                    <h3 className="text-base font-bold text-gray-900">应用「{selectedPhase.name}模板」？</h3>
                    <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                      应用后将自动填入节点目标、节点说明、阶段完成标准和适用项目类型。<br/>
                      已填写的内容将被覆盖，请确认后操作。
                    </p>
                    <div className="mt-5 flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setShowApplyConfirm(false)}
                        className="px-4 py-2 text-sm font-semibold border border-gray-300 bg-white text-gray-600 rounded-xl hover:bg-gray-50"
                      >取消</button>
                      <button
                        type="button"
                        onClick={() => { handleApplyPhaseInfoTemplate(); setShowApplyConfirm(false); }}
                        className="px-5 py-2 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700"
                      >确认应用</button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
          {/* 并行阶段选择弹窗 */}
          {parallelModal?.open && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.3)' }}
              onClick={() => setParallelModal(null)}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-96 p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-800">添加并行阶段</h3>
                  <button onClick={() => setParallelModal(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                </div>

                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  选择一个已有阶段，将其设置为
                  <span className="font-medium text-blue-600 mx-1">
                    {phases.find(p => p.id === parallelModal.sourceId)?.name ?? '当前阶段'}
                  </span>
                  的并行后继阶段（与
                  <span className="font-medium text-blue-600 mx-1">
                    {phases.find(p => p.id === parallelModal.targetId)?.name ?? '目标阶段'}
                  </span>
                  同时进行）
                </p>

                {/* 当前已配置的并行阶段 Tags */}
                {(phases.find(p => p.id === parallelModal.sourceId)?.nextPhaseIds ?? []).length > 0 && (
                  <div className="mb-3">
                    <div className="text-[11px] text-gray-400 font-medium mb-2">当前并行后继阶段：</div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(phases.find(p => p.id === parallelModal.sourceId)?.nextPhaseIds ?? []).map((nid: string) => {
                        const np = phases.find(pp => pp.id === nid);
                        if (!np) return null;
                        return (
                          <span key={nid} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                            {np.name}
                            <button
                              className="text-blue-400 hover:text-red-500 transition-colors ml-0.5 leading-none"
                              onClick={(e) => { e.stopPropagation(); handleRemoveParallel(nid); }}
                              title="移除并行"
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M3 3l4 4M7 3l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 max-h-60 overflow-y-auto mb-4">
                  {phases
                    .filter(p => p.id !== parallelModal.sourceId && p.id !== parallelModal.targetId)
                    .map(p => {
                      const sourcePhase = phases.find(sp => sp.id === parallelModal.sourceId);
                      const isAlreadyParallel = (sourcePhase?.nextPhaseIds ?? []).includes(p.id);

                      return (
                        <button
                          key={p.id}
                          onClick={async () => {
                            if (isAlreadyParallel) {
                              await handleRemoveParallel(p.id);
                            } else {
                              await handlePhaseConnect(parallelModal.sourceId, p.id);
                              // 保持弹窗打开，允许继续编辑
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all text-left ${isAlreadyParallel ? 'border-blue-200 bg-blue-50 hover:bg-red-50 hover:border-red-200 group/added' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'} group`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isAlreadyParallel ? 'bg-blue-500 text-white group-hover/added:bg-red-400' : 'bg-blue-100 text-blue-600'}`}>{p.order}</span>
                            <div className="min-w-0">
                              <div className={`text-sm font-medium truncate ${isAlreadyParallel ? 'text-blue-700' : 'text-gray-700'}`}>{p.name}</div>
                              <div className="text-xs text-gray-400">{p.tasks?.length ?? 0} 任务{(p.totalDays ?? 0) > 0 && ` · ~${p.totalDays} 天`}</div>
                            </div>
                          </div>

                          <div className="flex-shrink-0 ml-3">
                            {isAlreadyParallel ? (
                              <>
                                <span className="group-hover/added:hidden inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  已添加
                                </span>
                                <span className="hidden group-hover/added:inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 3l4 4M7 3l-4 4" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                  点击移除
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] text-gray-300 group-hover:text-blue-400 transition-colors">+ 添加</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>

                <button onClick={() => setParallelModal(null)} className="w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">完成</button>
              </div>
            </div>
          )}

      </div>

      {/* 预览模态框 */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[96vw] h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">分支预览 — {(template as any).name}</span>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-hidden bg-[#fafbff]">
              <MindMapView content={previewContent} previewCollapseLevel={2} inlineHeight={window.innerHeight * 0.92 - 56} />
            </div>
          </div>
        </div>
      )}

      {/* 批量操作点击外部关闭 */}
      {showBatchOp && (
        <div className="fixed inset-0 z-40" onClick={() => setShowBatchOp(false)} />
      )}
    </div>
  );
}
