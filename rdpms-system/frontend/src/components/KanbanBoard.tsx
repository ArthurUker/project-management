import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { taskAPI, projectAPI } from '../api/client';
import DocReference from './DocReference';

// 任务类型定义
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

// 看板列类型
interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  bgColor: string;
  tasks: Task[];
}

// 任务卡片组件
function TaskCard({ 
  task, 
  onDragStart, 
  onClick 
}: { 
  task: Task; 
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onClick: (task: Task) => void;
}) {
  const priorityColors: Record<string, string> = {
    '高': 'bg-red-50 border-red-200',
    '中': 'bg-yellow-50 border-yellow-200',
    '低': 'bg-gray-50 border-gray-200'
  };
  
  const priorityBadgeColors: Record<string, string> = {
    '高': 'bg-red-500',
    '中': 'bg-yellow-500',
    '低': 'bg-gray-400'
  };

  return (
    <div
      className={`card border ${priorityColors[task.priority] || 'bg-white border-gray-200'} 
        cursor-grab active:cursor-grabbing rounded-lg p-3 mb-2 
        hover:shadow-md transition-all hover:-translate-y-0.5 group`}
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onClick(task)}
    >
      {/* 优先级指示条 */}
      <div className={`absolute top-0 left-0 w-1 h-full rounded-l-lg ${priorityBadgeColors[task.priority] || 'bg-gray-400'}`} />
      
      {/* 任务标题 */}
      <h4 className="font-medium text-gray-900 mb-2 pl-2 pr-2 leading-snug">
        {task.title}
      </h4>
      
      {/* 项目标签 */}
      {task.project && (
        <div className="mb-2 pl-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-primary-50 text-primary-600 border border-primary-100">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            {task.project.name}
          </span>
        </div>
      )}
      
      {/* 底部信息栏 */}
      <div className="flex items-center justify-between pl-2 pr-2 pt-2 border-t border-gray-100/50">
        {/* 优先级和文档引用 */}
        <div className="flex items-center space-x-2">
          {task.priority === '高' && (
            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            task.priority === '高' ? 'bg-red-100 text-red-600' :
            task.priority === '中' ? 'bg-yellow-100 text-yellow-600' :
            'bg-gray-100 text-gray-500'
          }`}>
            {task.priority}
          </span>
          {task.docRefs && task.docRefs.length > 0 && (
            <span className="text-xs flex items-center text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
              <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {task.docRefs.length}
            </span>
          )}
        </div>
        
        {/* 负责人和截止日期 */}
        <div className="flex items-center space-x-3">
          {task.dueDate && (
            <span className={`text-xs flex items-center ${
              new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-gray-400'
            }`}>
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(task.dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </span>
          )}
          
          {task.assignee ? (
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center ring-2 ring-white">
                <span className="text-xs text-primary-600 font-medium">
                  {task.assignee.name?.charAt(0) || '?'}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center ring-2 ring-white">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 看板列组件
function KanbanColumnComponent({
  column,
  onDragOver,
  onDrop,
  onDragStart,
  onTaskClick,
  onAddTask
}: {
  column: KanbanColumn;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onTaskClick: (task: Task) => void;
  onAddTask: (status: string) => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className={`flex-shrink-0 w-80 bg-gray-50/80 rounded-xl border border-gray-200/50 flex flex-col
        ${isCollapsed ? 'h-14' : 'max-h-[calc(100vh-220px)]'}`}
    >
      {/* 列头 */}
      <div className="px-4 py-3 border-b border-gray-200/50 flex items-center justify-between group">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${column.color}`} />
          <h3 className="font-semibold text-gray-800">{column.title}</h3>
          <span className="bg-white px-2 py-0.5 rounded-full text-xs text-gray-500 font-medium shadow-sm">
            {column.tasks.length}
          </span>
        </div>
        
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onAddTask(column.id)}
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
            title="添加任务"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <svg className={`w-4 h-4 text-gray-500 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* 任务列表 */}
      {!isCollapsed && (
        <div 
          className={`flex-1 overflow-y-auto p-3 ${column.bgColor}`}
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, column.id)}
        >
          {column.tasks.map((task) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onDragStart={(e) => onDragStart(e, task)}
              onClick={onTaskClick}
            />
          ))}
          
          {/* 添加任务按钮 */}
          <button
            onClick={() => onAddTask(column.id)}
            className="w-full py-2 px-3 rounded-lg border-2 border-dashed border-gray-300 
              text-gray-500 text-sm hover:border-primary-400 hover:text-primary-500 
              hover:bg-primary-50/50 transition-all flex items-center justify-center space-x-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>添加任务</span>
          </button>
        </div>
      )}
    </div>
  );
}

// 任务编辑弹窗
// 文档引用类型
interface DocRef {
  id: string;
  code: string;
  title: string;
  docType: string;
  version: string;
  category?: { name: string };
}

function TaskModal({
  task,
  projectId,
  onClose,
  onSave
}: {
  task?: Task | null;
  projectId?: string;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const { projects, user } = useAppStore();
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    projectId: task?.projectId || projectId || '',
    assigneeId: task?.assigneeId || '',
    priority: task?.priority || '中',
    status: task?.status || '待开始',
    dueDate: task?.dueDate ? task.dueDate.split('T')[0] : ''
  });
  const [docRefs, setDocRefs] = useState<DocRef[]>(task?.docRefs || []);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...formData, docRefs });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {task ? '编辑任务' : '新建任务'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* 任务标题 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">任务标题 *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="input"
              placeholder="请输入任务标题"
              autoFocus
            />
          </div>
          
          {/* 所属项目 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">所属项目 *</label>
            <select
              required
              value={formData.projectId}
              onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
              className="input"
            >
              <option value="">选择项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          {/* 任务描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">任务描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input min-h-[100px] resize-none"
              placeholder="详细描述任务内容..."
            />
          </div>
          
          {/* 优先级和状态 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">优先级</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="input"
              >
                <option value="高">🔴 高</option>
                <option value="中">🟡 中</option>
                <option value="低">⚪ 低</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">状态</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="input"
              >
                <option value="待开始">待开始</option>
                <option value="进行中">进行中</option>
                <option value="已完成">已完成</option>
                <option value="已阻塞">已阻塞</option>
              </select>
            </div>
          </div>
          
          {/* 负责人和截止日期 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">负责人</label>
              <input
                type="text"
                value={user?.name || ''}
                className="input bg-gray-50"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">截止日期</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="input"
              />
            </div>
          </div>

          {/* 文档引用 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              引用文档
            </label>
            <DocReference
              value={docRefs}
              onChange={setDocRefs}
              placeholder="搜索 SOP、模板、指南..."
              maxItems={5}
            />
          </div>
        </form>
        
        {/* 底部操作 */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            取消
          </button>
          <button 
            type="submit" 
            onClick={handleSubmit}
            disabled={saving || !formData.title || !formData.projectId}
            className="btn btn-primary"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 主看板组件
interface KanbanBoardProps {
  projectId?: string;
}

export default function KanbanBoard({ projectId }: KanbanBoardProps) {
  const { tasks, projects, saveTaskLocal, setTasks: _setTasks, setProjects } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProject, setFilterProject] = useState(projectId || '');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [addingColumn, setAddingColumn] = useState<string | null>(null);
  const dragItem = useRef<Task | null>(null);

  // Ensure projects are loaded the same way Projects page does
  useEffect(() => {
    const loadProjects = async () => {
      try {
        if (projects && projects.length > 0) return;
        const res: any = await projectAPI.list({ pageSize: 999 });
        const list = res.list || res.data?.list || res.data || [];
        setProjects(list);
        console.log('[KanbanBoard] loaded projects for dropdown:', list.length);
      } catch (err) {
        console.error('[KanbanBoard] failed to load projects for dropdown', err);
      }
    };
    loadProjects();
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProject, setFilterProject] = useState(projectId || '');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [addingColumn, setAddingColumn] = useState<string | null>(null);
  const dragItem = useRef<Task | null>(null);

  // 定义看板列
  const columns: KanbanColumn[] = [
    { id: '待开始', title: '待开始', color: 'bg-gray-400', bgColor: 'bg-gray-50/50', tasks: [] },
    { id: '进行中', title: '进行中', color: 'bg-blue-500', bgColor: 'bg-blue-50/30', tasks: [] },
    { id: '已完成', title: '已完成', color: 'bg-green-500', bgColor: 'bg-green-50/30', tasks: [] },
    { id: '已阻塞', title: '已阻塞', color: 'bg-red-500', bgColor: 'bg-red-50/30', tasks: [] }
  ];

  // 过滤任务
  const filteredTasks = tasks.filter(task => {
    if (searchTerm && !task.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterProject && task.projectId !== filterProject) return false;
    return true;
  });

  // 按状态分组
  const boardData = columns.map(col => ({
    ...col,
    tasks: filteredTasks.filter(t => t.status === col.id)
  }));

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent, task: Task) => {
    dragItem.current = task;
    e.dataTransfer.effectAllowed = 'move';
  };

  // 拖拽经过
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // 放置任务
  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    if (!dragItem.current) return;
    
    const task = dragItem.current;
    if (task.status === newStatus) return;

    // 更新本地状态
    const updatedTask = { ...task, status: newStatus };
    await saveTaskLocal(updatedTask);
    dragItem.current = null;

    // 同步到服务器
    try {
      await taskAPI.updateStatus(task.id, newStatus);
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  // 打开任务详情/编辑
  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
    setShowModal(true);
  };

  // 添加新任务
  const handleAddTask = (status: string) => {
    setEditingTask(null);
    setAddingColumn(status);
    setShowModal(true);
  };

  // 保存任务
  const handleSaveTask = async (data: any) => {
    try {
      if (editingTask) {
        // 更新任务
        const res = await taskAPI.update(editingTask.id, data);
        const taskRes = (res as any).data ? (res as any).data : res;
        await saveTaskLocal(taskRes);
      } else {
        // 创建任务
        const res = await taskAPI.create({
          ...data,
          status: data.status || addingColumn || '待开始'
        });
        const taskRes = (res as any).data ? (res as any).data : res;
        await saveTaskLocal(taskRes);
      }
      setShowModal(false);
      setEditingTask(null);
      setAddingColumn(null);
    } catch (err) {
      console.error('Failed to save task:', err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center space-x-4">
          {/* 搜索 */}
          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="搜索任务..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-64"
            />
          </div>
          
          {/* 项目筛选 */}
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="input w-48"
          >
            <option value="">全部项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        
        {/* 新建任务按钮 */}
        <button 
          onClick={() => handleAddTask('待开始')}
          className="btn btn-primary flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>新建任务</span>
        </button>
      </div>

      {/* 看板主体 */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex space-x-4 h-full pb-4">
          {boardData.map((column) => (
            <KanbanColumnComponent
              key={column.id}
              column={column}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onTaskClick={handleTaskClick}
              onAddTask={handleAddTask}
            />
          ))}
        </div>
      </div>

      {/* 任务编辑弹窗 */}
      {showModal && (
        <TaskModal
          task={editingTask}
          projectId={addingColumn ? undefined : projectId}
          onClose={() => {
            setShowModal(false);
            setEditingTask(null);
            setAddingColumn(null);
          }}
          onSave={handleSaveTask}
        />
      )}
    </div>
  );
}
