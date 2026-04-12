import React, { useState, useCallback } from 'react';
import api from '../api/client';

interface Task {
  id: string;
  name: string;
  description?: string;
  required?: boolean;
}

interface PhaseTaskPanelProps {
  phaseId: string;
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
}

const PhaseTaskPanel: React.FC<PhaseTaskPanelProps> = ({
  phaseId,
  tasks,
  onTasksChange,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!newTaskName.trim()) return;
    setLoading(true);
    try {
      const res = await api.post(`/tasks`, {
        projectId: undefined,
        title: newTaskName.trim(),
      });
      const created = res?.data ?? res;
      // attach to phase locally
      onTasksChange([...tasks, { id: created.id || `${Date.now()}`, name: created.title || created.name || newTaskName.trim() }]);
      setNewTaskName('');
      setAdding(false);
    } catch (e) {
      console.error('新增任务失败', e);
    } finally {
      setLoading(false);
    }
  }, [newTaskName, onTasksChange, tasks]);

  const handleEdit = useCallback(async (taskId: string) => {
    if (!editingName.trim()) return;
    setLoading(true);
    try {
      // try PATCH tasks/:id
      await api.put(`/tasks/${taskId}`, { title: editingName.trim() });
      onTasksChange(tasks.map(t => t.id === taskId ? { ...t, name: editingName.trim() } : t));
      setEditingId(null);
    } catch (e) {
      console.error('编辑任务失败', e);
      setEditingId(null);
    } finally {
      setLoading(false);
    }
  }, [editingName, onTasksChange, tasks]);

  const handleDelete = useCallback(async (taskId: string) => {
    setLoading(true);
    try {
      await api.delete(`/tasks/${taskId}`);
      onTasksChange(tasks.filter(t => t.id !== taskId));
    } catch (e) {
      console.error('删除任务失败', e);
    } finally {
      setLoading(false);
    }
  }, [onTasksChange, tasks]);

  return (
    <div style={{ padding: '12px 0' }}>
      {tasks.length === 0 && !adding && (
        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '24px 0' }}>
          暂无任务，点击下方按钮添加
        </div>
      )}

      {tasks.map((task, index) => (
        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <span style={{ minWidth: 20, height: 20, borderRadius: '50%', background: '#eff6ff', color: '#3b82f6', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {index + 1}
          </span>

          {editingId === task.id ? (
            <input
              autoFocus
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleEdit(task.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              style={{ flex: 1, border: '1px solid #3b82f6', borderRadius: 4, padding: '2px 6px', fontSize: 13 }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{task.name}</span>
          )}

          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {editingId === task.id ? (
              <>
                <button onClick={() => handleEdit(task.id)} style={btnStyle('#3b82f6', 'white')}>保存</button>
                <button onClick={() => setEditingId(null)} style={btnStyle('#f3f4f6', '#6b7280')}>取消</button>
              </>
            ) : (
              <>
                <button onClick={() => { setEditingId(task.id); setEditingName(task.name); }} style={btnStyle('#f3f4f6', '#6b7280')}>编辑</button>
                <button onClick={() => handleDelete(task.id)} style={btnStyle('#fef2f2', '#ef4444')}>删除</button>
              </>
            )}
          </div>
        </div>
      ))}

      {adding && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <input
            autoFocus
            placeholder="输入任务名称"
            value={newTaskName}
            onChange={e => setNewTaskName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setAdding(false); setNewTaskName(''); }
            }}
            style={{ flex: 1, border: '1px solid #3b82f6', borderRadius: 4, padding: '4px 8px', fontSize: 13 }}
          />
          <button onClick={handleAdd} disabled={loading} style={btnStyle('#3b82f6', 'white')}>确认</button>
          <button onClick={() => { setAdding(false); setNewTaskName(''); }} style={btnStyle('#f3f4f6', '#6b7280')}>取消</button>
        </div>
      )}

      {!adding && (
        <div style={{ padding: '10px 16px' }}>
          <button onClick={() => setAdding(true)} style={{ width: '100%', padding: '6px 0', border: '1px dashed #93c5fd', borderRadius: 6, background: 'white', color: '#3b82f6', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            添加任务
          </button>
        </div>
      )}
    </div>
  );
};

const btnStyle = (bg: string, color: string): React.CSSProperties => ({ padding: '2px 8px', borderRadius: 4, border: 'none', background: bg, color, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' });

export default PhaseTaskPanel;
