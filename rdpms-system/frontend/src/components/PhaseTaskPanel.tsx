/**
 * PhaseTaskPanel — 节点任务管理
 * 支持：
 *  1. 从知识库（任务模版库）引用任务
 *  2. 在引用任务基础上修改字段
 *  3. 手动新建自定义任务
 */
import React, { useState, useCallback, useEffect } from 'react';
import { taskTemplatesAPI } from '../api/client';

interface Task {
  id: string;
  title: string;
  name?: string;
  priority: '高' | '中' | '低';
  estimatedDays: number;
  role: string;
  source: 'self' | 'inherited';
  enabled: boolean;
  templateRef?: string;
}

interface PhaseTaskPanelProps {
  phaseId?: string;
  tasks: any[];
  onTasksChange: (tasks: any[]) => void;
}

const PRIORITY_COLORS: Record<string, string> = { 高: '#ef4444', 中: '#f59e0b', 低: '#10b981' };
const PRIORITY_BG: Record<string, string> = { 高: '#fef2f2', 中: '#fffbeb', 低: '#f0fdf4' };

/** 任务编辑弹窗 */
function TaskEditModal({ task, onSave, onClose }: {
  task: Partial<Task>;
  onSave: (t: Partial<Task>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Task>>({ title: '', priority: '中', estimatedDays: 3, role: '', ...task });
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 14, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
          {task.id ? '编辑任务' : '新建任务'}
          {task.templateRef && <span style={{ fontSize: 11, color: '#3b82f6', background: '#eff6ff', padding: '2px 7px', borderRadius: 20, fontWeight: 500 }}>引用自模版</span>}
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4, display: 'block' }}>任务名称 *</label>
            <input autoFocus value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#3b82f6'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4, display: 'block' }}>优先级</label>
              <select value={form.priority || '中'} onChange={e => setForm(f => ({ ...f, priority: e.target.value as any }))}
                style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff' }}>
                <option value="高">高</option><option value="中">中</option><option value="低">低</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4, display: 'block' }}>预计天数</label>
              <input type="number" min={0.5} step={0.5} value={form.estimatedDays ?? 3}
                onChange={e => setForm(f => ({ ...f, estimatedDays: parseFloat(e.target.value) || 0 }))}
                style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4, display: 'block' }}>负责角色</label>
            <input value={form.role || ''} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              placeholder="如：研发工程师、测试员"
              style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>取消</button>
          <button onClick={() => { if (!(form.title || '').trim()) return; onSave(form); }}
            style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>保存</button>
        </div>
      </div>
    </div>
  );
}

/** 知识库任务模版选择弹窗 */
function TaskTemplatePickerModal({ existingTitles, onImport, onClose }: {
  existingTitles: string[];
  onImport: (tasks: Partial<Task>[]) => void;
  onClose: () => void;
}) {
  const [templateList, setTemplateList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    taskTemplatesAPI.list({ pageSize: 200 })
      .then((res: any) => setTemplateList(res?.list || res?.data || []))
      .catch(() => setTemplateList([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = templateList.filter(t =>
    !search || (t.title || t.name || '').toLowerCase().includes(search.toLowerCase()) || (t.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const handleImport = () => {
    const picked = templateList.filter(t => selected.has(t.id)).map(t => ({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: t.title || t.name || '任务',
      name: t.title || t.name || '任务',
      priority: t.priority || '中',
      estimatedDays: t.estimatedDays || 3,
      role: t.role || '',
      source: 'inherited' as const,
      enabled: true,
      templateRef: t.id,
    }));
    onImport(picked);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 72px rgba(0,0,0,.18)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>从任务模版库引用</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>选择后将导入到当前节点任务列表</div>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: '10px 18px', borderBottom: '1px solid #f8fafc' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索任务模版..."
            style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px', fontSize: 13 }}>加载中...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px', fontSize: 13 }}>暂无任务模版，请先在知识库→任务模版库中创建</div>
          ) : filtered.map(t => {
            const isSelected = selected.has(t.id);
            const title = t.title || t.name || '任务';
            const isAlready = existingTitles.includes(title);
            return (
              <div key={t.id} onClick={() => !isAlready && toggle(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', cursor: isAlready ? 'not-allowed' : 'pointer', background: isSelected ? '#eff6ff' : 'transparent', opacity: isAlready ? 0.45 : 1, borderBottom: '1px solid #f8fafc' }}
                onMouseEnter={e => { if (!isAlready) (e.currentTarget as HTMLDivElement).style.background = isSelected ? '#eff6ff' : '#f8fafc'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isSelected ? '#eff6ff' : 'transparent'; }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${isSelected ? '#3b82f6' : '#d1d5db'}`, background: isSelected ? '#3b82f6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{title}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                    {t.priority && <span style={{ fontSize: 11, color: PRIORITY_COLORS[t.priority] || '#64748b', background: PRIORITY_BG[t.priority] || '#f8fafc', padding: '1px 6px', borderRadius: 10 }}>{t.priority}</span>}
                    {t.estimatedDays && <span style={{ fontSize: 11, color: '#94a3b8' }}>~{t.estimatedDays}天</span>}
                    {t.role && <span style={{ fontSize: 11, color: '#94a3b8' }}>{t.role}</span>}
                  </div>
                </div>
                {isAlready && <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>已添加</span>}
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>已选 {selected.size} 个</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>取消</button>
            <button onClick={handleImport} disabled={selected.size === 0}
              style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: selected.size > 0 ? '#3b82f6' : '#e2e8f0', color: selected.size > 0 ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 600, cursor: selected.size > 0 ? 'pointer' : 'not-allowed' }}>
              引用 {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PhaseTaskPanel: React.FC<PhaseTaskPanelProps> = ({ phaseId, tasks, onTasksChange }) => {
  React.useEffect(() => { console.debug('[PhaseTaskPanel] phase', phaseId); }, [phaseId]);

  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const normalizedTasks: Task[] = tasks.map(t => ({
    id: t.id,
    title: t.title || t.name || '',
    name: t.title || t.name || '',
    priority: t.priority || '中',
    estimatedDays: t.estimatedDays || 3,
    role: t.role || '',
    source: t.source || 'self',
    enabled: t.enabled !== false,
    templateRef: t.templateRef,
  }));

  const existingTitles = normalizedTasks.map(t => t.title);

  const handleSaveTask = useCallback((form: Partial<Task>) => {
    if (showEditModal === '__new__') {
      onTasksChange([...tasks, { id: `task_${Date.now()}`, title: form.title, name: form.title, priority: form.priority || '中', estimatedDays: form.estimatedDays || 3, role: form.role || '', source: 'self', enabled: true }]);
    } else {
      onTasksChange(tasks.map(t => t.id === showEditModal ? { ...t, title: form.title, name: form.title, priority: form.priority, estimatedDays: form.estimatedDays, role: form.role } : t));
    }
    setShowEditModal(null);
  }, [showEditModal, tasks, onTasksChange]);

  const handleDelete = useCallback((taskId: string) => {
    onTasksChange(tasks.filter(t => t.id !== taskId));
  }, [tasks, onTasksChange]);

  const handleToggleEnabled = useCallback((taskId: string) => {
    onTasksChange(tasks.map(t => t.id === taskId ? { ...t, enabled: !t.enabled } : t));
  }, [tasks, onTasksChange]);

  const handleImport = useCallback((imported: Partial<Task>[]) => {
    onTasksChange([...tasks, ...imported]);
    setShowPicker(false);
  }, [tasks, onTasksChange]);

  const editingTask = showEditModal && showEditModal !== '__new__'
    ? normalizedTasks.find(t => t.id === showEditModal) || {}
    : {};

  return (
    <div style={{ padding: '8px 0' }}>
      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px' }}>
        <button onClick={() => setShowPicker(true)}
          style={{ flex: 1, padding: '7px 10px', border: '1px solid #bfdbfe', borderRadius: 7, background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          从模版库引用
        </button>
        <button onClick={() => setShowEditModal('__new__')}
          style={{ flex: 1, padding: '7px 10px', border: '1px dashed #93c5fd', borderRadius: 7, background: '#fff', color: '#3b82f6', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>＋</span>
          新建任务
        </button>
      </div>

      {/* 任务列表 */}
      {normalizedTasks.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '20px 0' }}>
          暂无任务，从模版库引用或手动新建
        </div>
      ) : normalizedTasks.map((task, index) => (
        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderBottom: '1px solid #f8fafc', opacity: task.enabled ? 1 : 0.5 }}>
          <span style={{ minWidth: 20, height: 20, borderRadius: '50%', background: task.source === 'inherited' ? '#eff6ff' : '#f8fafc', color: task.source === 'inherited' ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {index + 1}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: task.enabled ? '#1e293b' : '#94a3b8', textDecoration: task.enabled ? 'none' : 'line-through' }}>{task.title}</span>
              {task.source === 'inherited' && <span style={{ fontSize: 10, color: '#3b82f6', background: '#eff6ff', padding: '1px 5px', borderRadius: 8, fontWeight: 500, flexShrink: 0 }}>引用</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: PRIORITY_COLORS[task.priority] || '#64748b', background: PRIORITY_BG[task.priority] || '#f8fafc', padding: '1px 6px', borderRadius: 10 }}>{task.priority}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>~{task.estimatedDays}天</span>
              {task.role && <span style={{ fontSize: 11, color: '#94a3b8' }}>{task.role}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={() => handleToggleEnabled(task.id)} title={task.enabled ? '禁用' : '启用'}
              style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', color: task.enabled ? '#94a3b8' : '#10b981', fontSize: 11, cursor: 'pointer' }}>
              {task.enabled ? '禁用' : '启用'}
            </button>
            <button onClick={() => setShowEditModal(task.id)}
              style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 11, cursor: 'pointer' }}>编辑</button>
            <button onClick={() => handleDelete(task.id)}
              style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>删除</button>
          </div>
        </div>
      ))}

      {showEditModal && (
        <TaskEditModal task={showEditModal === '__new__' ? {} : editingTask} onSave={handleSaveTask} onClose={() => setShowEditModal(null)} />
      )}
      {showPicker && (
        <TaskTemplatePickerModal existingTitles={existingTitles} onImport={handleImport} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
};

export default PhaseTaskPanel;

