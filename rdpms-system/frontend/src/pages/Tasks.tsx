import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { taskAPI, projectAPI } from '../api/client';
import DocReference from '../components/DocReference';

// ── Types ───────────────────────────────────────────────
interface DocRef { id: string; code: string; title: string; docType: string; version: string; }
interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  status: string;
  priority: string;
  dueDate?: string;
  completedAt?: string;
  docRefs?: DocRef[];
  project?: { id: string; name: string; code: string };
  assignee?: { id: string; name: string; avatar?: string };
  updatedAt: string;
}

// ── Constants ────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { dotColor: string; barColor: string; textColor: string; bgColor: string }> = {
  '待开始': { dotColor: '#9ca3af', barColor: '#9ca3af', textColor: '#6b7280', bgColor: '#f9fafb' },
  '进行中': { dotColor: '#3b82f6', barColor: '#3b82f6', textColor: '#2563eb', bgColor: '#eff6ff' },
  '已完成': { dotColor: '#10b981', barColor: '#10b981', textColor: '#059669', bgColor: '#f0fdf4' },
  '已阻塞': { dotColor: '#ef4444', barColor: '#ef4444', textColor: '#dc2626', bgColor: '#fef2f2' },
};

const PRIORITY_CONFIG: Record<string, { barColor: string; textColor: string; bgColor: string; dotColor: string }> = {
  '高': { barColor: '#ef4444', textColor: '#dc2626', bgColor: '#fef2f2', dotColor: '#ef4444' },
  '中': { barColor: '#f59e0b', textColor: '#d97706', bgColor: '#fffbeb', dotColor: '#f59e0b' },
  '低': { barColor: '#9ca3af', textColor: '#6b7280', bgColor: '#f9fafb', dotColor: '#9ca3af' },
};

type ViewMode = 'kanban' | 'list' | 'priority';

const ViewIcons: Record<ViewMode, JSX.Element> = {
  kanban: (
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/>
      <rect x="17" y="3" width="5" height="15" rx="1.5"/>
    </svg>
  ),
  list: (
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
    </svg>
  ),
  priority: (
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" d="M3 4h18M3 9h13M3 14h8M3 19h5"/>
    </svg>
  ),
};

// ── Shared Task Card ─────────────────────────────────────
function TaskCard({ task, onEdit, onDragStart }: {
  task: Task;
  onEdit: (task: Task) => void;
  onDragStart?: (e: React.DragEvent, task: Task) => void;
}) {
  const sCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG['待开始'];
  const pCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG['低'];
  const isOverdue = task.dueDate && !task.completedAt && new Date(task.dueDate) < new Date();

  return (
    <div
      style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb',
        overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow .2s, transform .15s',
      }}
      draggable={!!onDragStart}
      onDragStart={onDragStart ? e => onDragStart(e, task) : undefined}
      onClick={() => onEdit(task)}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,.10)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
    >
      {/* Priority color bar */}
      <div style={{ height: '3px', background: pCfg.barColor, flexShrink: 0 }} />
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', lineHeight: 1.4 }}>{task.title}</div>
        {task.project && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '5px', alignSelf: 'flex-start' }}>
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
            {task.project.name}
          </span>
        )}
        {task.description && (
          <p style={{ fontSize: '12px', color: '#9ca3af', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{task.description}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '5px', background: pCfg.bgColor, color: pCfg.textColor, fontWeight: 600 }}>{task.priority}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: sCfg.textColor }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sCfg.dotColor, display: 'inline-block' }} />
              {task.status}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {task.dueDate && (
              <span style={{ fontSize: '11px', color: isOverdue ? '#dc2626' : '#9ca3af', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg>
                {new Date(task.dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
              </span>
            )}
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: task.assignee ? '#eff6ff' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: task.assignee ? '#2563eb' : '#9ca3af' }}>
              {task.assignee ? task.assignee.name.charAt(0) : '?'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Kanban View ──────────────────────────────────────────
function KanbanView({ tasks, onEdit, onAddTask, onUpdateStatus }: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onAddTask: (status: string) => void;
  onUpdateStatus: (task: Task, newStatus: string) => void;
}) {
  const dragItem = useRef<Task | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const statuses = ['待开始', '进行中', '已完成', '已阻塞'];

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    dragItem.current = task;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(status);
  };
  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragItem.current || dragItem.current.status === status) return;
    onUpdateStatus(dragItem.current, status);
    dragItem.current = null;
  };
  const handleDragLeave = () => setDragOver(null);

  return (
    <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
      {statuses.map(status => {
        const cfg = STATUS_CONFIG[status];
        const colTasks = tasks.filter(t => t.status === status);
        const isDragTarget = dragOver === status;
        return (
          <div
            key={status}
            style={{
              flex: '0 0 280px', minWidth: '280px',
              background: isDragTarget ? cfg.bgColor : '#f9fafb',
              borderRadius: '12px',
              border: isDragTarget ? `2px solid ${cfg.barColor}` : '1px solid #e5e7eb',
              display: 'flex', flexDirection: 'column',
              minHeight: '300px', transition: 'border .15s, background .15s',
            }}
            onDragOver={e => handleDragOver(e, status)}
            onDrop={e => handleDrop(e, status)}
            onDragLeave={handleDragLeave}
          >
            {/* Column header */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.dotColor, display: 'inline-block' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>{status}</span>
                <span style={{ fontSize: '12px', color: '#9ca3af', background: '#fff', padding: '1px 8px', borderRadius: '20px', border: '1px solid #e5e7eb' }}>{colTasks.length}</span>
              </div>
              <button
                onClick={() => onAddTask(status)}
                style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
              </button>
            </div>
            {/* Task list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {colTasks.map(task => (
                <TaskCard key={task.id} task={task} onEdit={onEdit} onDragStart={handleDragStart} />
              ))}
              <button
                onClick={() => onAddTask(status)}
                style={{ padding: '8px', borderRadius: '8px', border: '2px dashed #d1d5db', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: colTasks.length > 0 ? '2px' : 0 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
                添加任务
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── List View ────────────────────────────────────────────
function ListView({ tasks, onEdit }: { tasks: Task[]; onEdit: (task: Task) => void }) {
  if (tasks.length === 0) return (
    <div className="card" style={{ textAlign: 'center', padding: '48px', color: '#9ca3af', fontSize: '14px' }}>暂无任务</div>
  );
  return (
    <div className="card">
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 90px 110px 100px', gap: '12px', padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', fontSize: '12px', fontWeight: 600, color: '#6b7280', borderRadius: '8px 8px 0 0' }}>
        <span>任务名称</span><span>所属项目</span><span>优先级</span><span>状态</span><span>负责人</span><span>截止日期</span>
      </div>
      {tasks.map(task => {
        const sCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG['待开始'];
        const pCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG['低'];
        const isOverdue = task.dueDate && !task.completedAt && new Date(task.dueDate) < new Date();
        return (
          <div
            key={task.id}
            style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 90px 110px 100px', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', transition: 'background .15s', alignItems: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => onEdit(task)}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{task.title}</div>
              {task.description && <div style={{ fontSize: '11px', color: '#d1d5db', marginTop: '2px' }}>{task.description.slice(0, 40)}{task.description.length > 40 ? '...' : ''}</div>}
            </div>
            <div>{task.project && <span style={{ fontSize: '12px', background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '5px' }}>{task.project.name}</span>}</div>
            <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '5px', background: pCfg.bgColor, color: pCfg.textColor, fontWeight: 600, display: 'inline-block' }}>{task.priority}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: sCfg.textColor }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: sCfg.dotColor, flexShrink: 0 }} />
              {task.status}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: task.assignee ? '#eff6ff' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: task.assignee ? '#2563eb' : '#9ca3af', flexShrink: 0 }}>
                {task.assignee ? task.assignee.name.charAt(0) : '?'}
              </div>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>{task.assignee?.name ?? '未分配'}</span>
            </div>
            <span style={{ fontSize: '12px', color: isOverdue ? '#dc2626' : '#9ca3af' }}>
              {task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Priority View ────────────────────────────────────────
function PriorityView({ tasks, onEdit, onAddTask }: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onAddTask: (priority: string) => void;
}) {
  const priorities = ['高', '中', '低'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {priorities.map(priority => {
        const cfg = PRIORITY_CONFIG[priority];
        const prioTasks = tasks.filter(t => t.priority === priority);
        return (
          <div key={priority} className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', background: cfg.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '4px', height: '20px', borderRadius: '2px', background: cfg.barColor, display: 'block' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: cfg.textColor }}>{priority}优先级</span>
                <span style={{ fontSize: '12px', color: '#9ca3af', background: '#fff', padding: '1px 8px', borderRadius: '20px', border: '1px solid #e5e7eb' }}>{prioTasks.length}</span>
              </div>
              <button
                onClick={() => onAddTask(priority)}
                style={{ padding: '4px 12px', fontSize: '12px', color: cfg.textColor, background: '#fff', border: `1.5px solid ${cfg.barColor}`, borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
              >+ 添加</button>
            </div>
            {prioTasks.length > 0 ? (
              <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                {prioTasks.map(task => <TaskCard key={task.id} task={task} onEdit={onEdit} />)}
              </div>
            ) : (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#d1d5db', fontSize: '13px' }}>
                暂无{priority}优先级任务 —&nbsp;
                <button onClick={() => onAddTask(priority)} style={{ color: cfg.textColor, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '13px' }}>+ 新建</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Task Modal ───────────────────────────────────────────
function TaskModal({ task, defaultStatus, defaultPriority, projectList, currentUser, onClose, onSave }: {
  task?: Task | null;
  defaultStatus: string;
  defaultPriority: string;
  projectList: any[];
  currentUser: any;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    projectId: task?.projectId ?? '',
    priority: task?.priority ?? defaultPriority,
    status: task?.status ?? defaultStatus,
    dueDate: task?.dueDate ? task.dueDate.split('T')[0] : '',
  });
  const [docRefs, setDocRefs] = useState<DocRef[]>(task?.docRefs ?? []);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ ...form, docRefs }); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{task ? '编辑任务' : '新建任务'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">任务标题 *</label>
            <input type="text" required className="input" placeholder="请输入任务标题" autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">所属项目 *</label>
            <select required className="input" value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
              <option value="">选择项目</option>
              {projectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">任务描述</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="详细描述任务内容..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">优先级</label>
              <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="高">🔴 高</option>
                <option value="中">🟡 中</option>
                <option value="低">⚪ 低</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">状态</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="待开始">待开始</option>
                <option value="进行中">进行中</option>
                <option value="已完成">已完成</option>
                <option value="已阻塞">已阻塞</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">负责人</label>
              <input type="text" className="input bg-gray-50" value={currentUser?.name ?? ''} disabled />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">截止日期</label>
              <input type="date" className="input" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">引用文档</label>
            <DocReference value={docRefs} onChange={setDocRefs} placeholder="搜索 SOP、模板、指南..." maxItems={5} />
          </div>
        </form>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">取消</button>
          <button onClick={handleSubmit as any} disabled={saving || !form.title || !form.projectId} className="btn btn-primary">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────
export default function Tasks() {
  const { tasks: storeTasks, saveTaskLocal, user } = useAppStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // Filters
  const [filterProject, setFilterProject] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultStatus, setDefaultStatus] = useState('待开始');
  const [defaultPriority, setDefaultPriority] = useState('中');

  useEffect(() => {
    projectAPI.list({ pageSize: 999 }).then((res: any) => {
      setProjects(res.list || res.projects || res.data || []);
    }).catch(() => {});
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await taskAPI.list({ pageSize: 500 });
      const list: any[] = res.list || res.data || res.tasks || [];
      for (const t of list) await saveTaskLocal(t);
    } catch {}
    finally { setLoading(false); }
  }, [saveTaskLocal]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const tasks = storeTasks as Task[];

  // Stats
  const stats = useMemo(() => {
    const total = tasks.length;
    const pct = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;
    const c = (s: string) => tasks.filter(t => t.status === s).length;
    const overdue = tasks.filter(t => t.dueDate && !t.completedAt && new Date(t.dueDate) < new Date()).length;
    return [
      { label: '全部', count: total, percent: 100, barColor: '#9ca3af', textColor: '#6b7280', dotColor: '#9ca3af', action: () => { setFilterStatus(''); } },
      { label: '进行中', count: c('进行中'), percent: pct(c('进行中')), barColor: '#3b82f6', textColor: '#2563eb', dotColor: '#3b82f6', action: () => setFilterStatus('进行中') },
      { label: '待开始', count: c('待开始'), percent: pct(c('待开始')), barColor: '#9ca3af', textColor: '#6b7280', dotColor: '#9ca3af', action: () => setFilterStatus('待开始') },
      { label: '已完成', count: c('已完成'), percent: pct(c('已完成')), barColor: '#10b981', textColor: '#059669', dotColor: '#10b981', action: () => setFilterStatus('已完成') },
      { label: '已阻塞', count: c('已阻塞'), percent: pct(c('已阻塞')), barColor: '#ef4444', textColor: '#dc2626', dotColor: '#ef4444', action: () => setFilterStatus('已阻塞') },
      { label: '已逾期', count: overdue, percent: pct(overdue), barColor: '#f59e0b', textColor: '#d97706', dotColor: '#f59e0b', action: () => {} },
    ];
  }, [tasks]);

  const filteredTasks = useMemo(() => tasks.filter(t => {
    const mP = !filterProject || t.projectId === filterProject;
    const mPr = !filterPriority || t.priority === filterPriority;
    const mS = !filterStatus || t.status === filterStatus;
    const mK = !searchKeyword || t.title.toLowerCase().includes(searchKeyword.toLowerCase());
    return mP && mPr && mS && mK;
  }), [tasks, filterProject, filterPriority, filterStatus, searchKeyword]);

  const handleEditTask = (task: Task) => { setEditingTask(task); setDefaultStatus(task.status); setDefaultPriority(task.priority); setShowModal(true); };
  const handleAddTask = (status: string) => { setEditingTask(null); setDefaultStatus(status); setDefaultPriority('中'); setShowModal(true); };
  const handleAddByPriority = (priority: string) => { setEditingTask(null); setDefaultStatus('待开始'); setDefaultPriority(priority); setShowModal(true); };

  const handleUpdateStatus = async (task: Task, status: string) => {
    await saveTaskLocal({ ...task, status });
    try { await taskAPI.updateStatus(task.id, status); } catch {}
  };

  const handleSaveTask = async (data: any) => {
    try {
      if (editingTask) {
        const res: any = await taskAPI.update(editingTask.id, data);
        await saveTaskLocal(res.data ?? res);
      } else {
        const res: any = await taskAPI.create({ ...data, status: data.status || defaultStatus });
        await saveTaskLocal(res.data ?? res);
      }
      setShowModal(false);
      setEditingTask(null);
      loadTasks();
    } catch (err) { console.error(err); }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

      {/* ══ 页面标题行 ══ */}
      <div className="flex items-center justify-between mb-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="text-2xl font-display font-bold text-gray-900">任务管理</h1>
          <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 10px', borderRadius: '20px', fontWeight: 500 }}>
            {tasks.length} 个任务
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* View switcher */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#f3f4f6', borderRadius: '10px', padding: '4px', gap: '2px' }}>
            {(['kanban', 'list', 'priority'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '7px 14px', borderRadius: '7px',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none',
                  transition: 'all .15s',
                  background: viewMode === mode ? '#fff' : 'transparent',
                  color: viewMode === mode ? '#2563eb' : '#6b7280',
                  boxShadow: viewMode === mode ? '0 1px 4px rgba(37,99,235,.15)' : 'none',
                }}
              >
                {ViewIcons[mode]}
                {{ kanban: '看板', list: '列表', priority: '优先级' }[mode]}
              </button>
            ))}
          </div>
          <div style={{ width: '1px', height: '24px', background: '#e5e7eb' }} />
          <button onClick={loadTasks} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            刷新
          </button>
          <button onClick={() => handleAddTask('待开始')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
            新建任务
          </button>
        </div>
      </div>

      {/* ══ 统计卡片 ══ */}
      <div className="card p-4 mb-6">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
          {stats.map(stat => (
            <div
              key={stat.label}
              style={{
                borderRadius: '10px', padding: '14px 16px',
                border: '1px solid #e5e7eb', borderLeft: `4px solid ${stat.barColor}`,
                cursor: 'pointer', transition: 'all .2s', background: filterStatus === stat.label ? '#f0f7ff' : 'transparent',
              }}
              onClick={stat.action}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: stat.textColor, fontWeight: 500 }}>{stat.label}</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: stat.dotColor, display: 'block' }} />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: stat.textColor, lineHeight: 1 }}>{stat.count}</div>
              <div style={{ height: '4px', borderRadius: '3px', background: '#f3f4f6', overflow: 'hidden', marginTop: '8px' }}>
                <div style={{ height: '100%', borderRadius: '3px', background: stat.barColor, width: `${stat.percent}%`, transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: '11px', color: '#d1d5db', marginTop: '4px' }}>占比 {stat.percent}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 筛选区 ══ */}
      <div className="card p-3 mb-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '280px' }}>
            <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
            </svg>
            <input
              style={{ width: '100%', padding: '7px 12px 7px 34px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }}
              placeholder="搜索任务名称..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
            />
          </div>
          <div style={{ width: '1px', height: '26px', background: '#e5e7eb' }} />
          {/* Project filter */}
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            style={{ padding: '7px 24px 7px 10px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#f9fafb', cursor: 'pointer', outline: 'none', fontWeight: 500 }}
          >
            <option value="">全部项目</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '7px 24px 7px 10px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#f9fafb', cursor: 'pointer', outline: 'none', fontWeight: 500 }}
          >
            <option value="">全部状态</option>
            {['待开始', '进行中', '已完成', '已阻塞'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ width: '1px', height: '26px', background: '#e5e7eb' }} />
          {/* Priority filter tags */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 500 }}>优先级：</span>
            {['', '高', '中', '低'].map(p => (
              <button
                key={p || 'all'}
                onClick={() => setFilterPriority(p)}
                style={{
                  padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', border: 'none', transition: 'all .15s',
                  background: filterPriority === p ? '#eff6ff' : '#f3f4f6',
                  color: filterPriority === p ? '#2563eb' : '#6b7280',
                  outline: filterPriority === p ? '1.5px solid #bfdbfe' : 'none',
                }}
              >{p || '全部'}</button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>共 {filteredTasks.length} 条</span>
        </div>
      </div>

      {/* ══ 内容区 ══ */}
      {loading ? (
        <div className="card p-10 text-center text-gray-400 animate-pulse" style={{ fontSize: '14px' }}>加载中...</div>
      ) : (
        <>
          {viewMode === 'kanban' && (
            <KanbanView tasks={filteredTasks} onEdit={handleEditTask} onAddTask={handleAddTask} onUpdateStatus={handleUpdateStatus} />
          )}
          {viewMode === 'list' && <ListView tasks={filteredTasks} onEdit={handleEditTask} />}
          {viewMode === 'priority' && <PriorityView tasks={filteredTasks} onEdit={handleEditTask} onAddTask={handleAddByPriority} />}
        </>
      )}

      {/* Task Modal */}
      {showModal && (
        <TaskModal
          task={editingTask}
          defaultStatus={defaultStatus}
          defaultPriority={defaultPriority}
          projectList={projects}
          currentUser={user}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
          onSave={handleSaveTask}
        />
      )}
    </div>
  );
}

