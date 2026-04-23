import { useEffect, useMemo, useState } from 'react';
import { userAPI } from '../api/client';
import { useAppStore } from '../store/appStore';
import { hasPerm, PERMS } from '../utils/permissions';

const ROLE_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  admin:   { label: '管理员',   color: '#7c3aed', bg: '#f5f3ff', dot: '#7c3aed' },
  manager: { label: '项目经理', color: '#2563eb', bg: '#eff6ff', dot: '#2563eb' },
  member:  { label: '成员',     color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
};

const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#14b8a6'];
const avatarColor = (name: string) => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

type ModalMode = 'create' | 'edit';

export default function Users() {
  const { user: currentUser } = useAppStore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchKw, setSearchKw] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modal
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', name: '', position: '', department: '', role: 'member' });
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res: any = await userAPI.list({ pageSize: 200 });
      setUsers(res.list || []);
    } catch { } finally { setLoading(false); }
  };

  const openCreate = () => {
    setModalMode('create');
    setEditTarget(null);
    setFormData({ username: '', password: '', name: '', position: '', department: '', role: 'member' });
    setNewPassword('');
    setShowModal(true);
  };

  const openEdit = (u: any) => {
    setModalMode('edit');
    setEditTarget(u);
    setFormData({ username: u.username, password: '', name: u.name, position: u.position || '', department: u.department || '', role: u.role });
    setNewPassword('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name) { alert('请填写姓名'); return; }
    if (modalMode === 'create' && (!formData.username || !formData.password)) { alert('请填写用户名和密码'); return; }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await userAPI.create(formData);
      } else {
        await userAPI.update(editTarget.id, { name: formData.name, position: formData.position, department: formData.department, role: formData.role });
        if (newPassword.trim()) await userAPI.resetPassword(editTarget.id, newPassword.trim());
      }
      setShowModal(false);
      loadUsers();
    } catch (err: any) { alert(err.error || '操作失败'); } finally { setSaving(false); }
  };

  const handleDelete = async (u: any) => {
    if (!confirm(`确定删除成员「${u.name}」？此操作不可恢复。`)) return;
    try { await userAPI.delete(u.id); loadUsers(); } catch (err: any) { alert(err.error || '删除失败'); }
  };

  const stats = useMemo(() => {
    const total = users.length;
    return [
      { label: '全部成员',  count: total,                                                   color: '#6b7280', bg: '#f3f4f6', action: () => { setFilterRole(''); setFilterStatus(''); } },
      { label: '管理员',   count: users.filter(u => u.role === 'admin').length,             color: '#7c3aed', bg: '#f5f3ff', action: () => setFilterRole('admin') },
      { label: '项目经理', count: users.filter(u => u.role === 'manager').length,           color: '#2563eb', bg: '#eff6ff', action: () => setFilterRole('manager') },
      { label: '普通成员', count: users.filter(u => u.role === 'member').length,            color: '#6b7280', bg: '#f3f4f6', action: () => setFilterRole('member') },
      { label: '正常状态', count: users.filter(u => !u.status || u.status === 'active').length, color: '#10b981', bg: '#f0fdf4', action: () => setFilterStatus('active') },
      { label: '已禁用',   count: users.filter(u => u.status === 'disabled').length,       color: '#ef4444', bg: '#fef2f2', action: () => setFilterStatus('disabled') },
    ];
  }, [users]);

  const filtered = useMemo(() => users.filter(u => {
    const mK = !searchKw || u.name?.toLowerCase().includes(searchKw.toLowerCase()) || u.username?.toLowerCase().includes(searchKw.toLowerCase()) || (u.department || '').toLowerCase().includes(searchKw.toLowerCase());
    const mR = !filterRole || u.role === filterRole;
    const mS = !filterStatus || (filterStatus === 'active' ? (!u.status || u.status === 'active') : u.status === filterStatus);
    return mK && mR && mS;
  }), [users, searchKw, filterRole, filterStatus]);

  if (!hasPerm(currentUser, PERMS.USERS_MANAGE)) {
    return <div className="card p-12 text-center text-gray-500">您没有权限访问此页面</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

      {/* ══ 标题行 ══ */}
      <div className="flex items-center justify-between mb-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="text-2xl font-display font-bold text-gray-900">成员管理</h1>
          <span style={{ fontSize: '12px', color: '#9ca3af', background: '#f3f4f6', padding: '2px 10px', borderRadius: '20px', fontWeight: 500 }}>{users.length} 名成员</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={loadUsers} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            刷新
          </button>
          <button onClick={openCreate} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
            添加成员
          </button>
        </div>
      </div>

      {/* ══ 统计卡片 ══ */}
      <div className="card p-4 mb-6">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
          {stats.map(s => (
            <div
              key={s.label}
              onClick={s.action}
              style={{ borderRadius: '10px', padding: '14px 16px', border: '1px solid #e5e7eb', borderLeft: `4px solid ${s.color}`, cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ fontSize: '12px', color: s.color, fontWeight: 500, marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 筛选区 ══ */}
      <div className="card p-3 mb-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '280px' }}>
            <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/></svg>
            <input style={{ width: '100%', padding: '7px 12px 7px 34px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }} placeholder="搜索姓名/用户名/部门..." value={searchKw} onChange={e => setSearchKw(e.target.value)} />
          </div>
          <div style={{ width: '1px', height: '26px', background: '#e5e7eb' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 500 }}>角色：</span>
            {[['', '全部'], ['admin', '管理员'], ['manager', '项目经理'], ['member', '成员']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterRole(v)} style={{ padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none', background: filterRole === v ? '#eff6ff' : '#f3f4f6', color: filterRole === v ? '#2563eb' : '#6b7280', outline: filterRole === v ? '1.5px solid #bfdbfe' : 'none', transition: 'all .15s' }}>{l}</button>
            ))}
          </div>
          <div style={{ width: '1px', height: '26px', background: '#e5e7eb' }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '7px 24px 7px 10px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#374151', background: '#f9fafb', cursor: 'pointer', outline: 'none' }}>
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>共 {filtered.length} 名</span>
        </div>
      </div>

      {/* ══ 成员卡片 ══ */}
      {loading ? (
        <div className="card p-10 text-center text-gray-400 animate-pulse" style={{ fontSize: '14px' }}>加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-400" style={{ fontSize: '14px' }}>暂无成员数据</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {filtered.map(u => {
            const rc = ROLE_CFG[u.role] ?? ROLE_CFG.member;
            const isActive = !u.status || u.status === 'active';
            const ac = avatarColor(u.name ?? u.username ?? '');
            const isSelf = u.id === currentUser?.id;
            return (
              <div
                key={u.id}
                style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden', transition: 'box-shadow .2s, transform .15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,.09)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
              >
                {/* Color top bar */}
                <div style={{ height: '4px', background: rc.color }} />
                <div style={{ padding: '16px' }}>
                  {/* Avatar + name row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: ac, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {u.name?.charAt(0) ?? u.username?.charAt(0) ?? '?'}
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{u.name}{isSelf && <span style={{ fontSize: '11px', color: '#10b981', marginLeft: '6px', background: '#f0fdf4', padding: '1px 6px', borderRadius: '5px' }}>我</span>}</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>@{u.username}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', background: rc.bg, color: rc.color, fontWeight: 600 }}>{rc.label}</span>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', background: isActive ? '#f0fdf4' : '#fef2f2', color: isActive ? '#059669' : '#dc2626', fontWeight: 500 }}>{isActive ? '正常' : '已禁用'}</span>
                    </div>
                  </div>
                  {/* Info grid */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {u.department && <span style={{ fontSize: '12px', color: '#6b7280', background: '#f3f4f6', padding: '3px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>{u.department}
                    </span>}
                    {u.position && <span style={{ fontSize: '12px', color: '#6b7280', background: '#f3f4f6', padding: '3px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="7" r="4"/><path strokeLinecap="round" d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>{u.position}
                    </span>}
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                    <button
                      onClick={() => openEdit(u)}
                      style={{ flex: 1, padding: '6px', fontSize: '12px', borderRadius: '7px', border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', cursor: 'pointer', fontWeight: 500, transition: 'all .15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#bfdbfe'; (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                    >编辑</button>
                    {!isSelf && (
                      <button
                        onClick={() => handleDelete(u)}
                        style={{ flex: 1, padding: '6px', fontSize: '12px', borderRadius: '7px', border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontWeight: 500, transition: 'all .15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff5f5'; }}
                      >删除</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ 弹窗 ══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{modalMode === 'create' ? '添加成员' : '编辑成员'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {modalMode === 'create' && (
                <>
                  <div>
                    <label className="label">用户名 *</label>
                    <input type="text" className="input" placeholder="用于登录" value={formData.username} onChange={e => setFormData(p => ({ ...p, username: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">初始密码 *</label>
                    <input type="password" className="input" placeholder="至少6位" value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} />
                  </div>
                </>
              )}
              <div>
                <label className="label">姓名 *</label>
                <input type="text" className="input" placeholder="真实姓名" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">部门</label>
                  <input type="text" className="input" placeholder="所属部门" value={formData.department} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} />
                </div>
                <div>
                  <label className="label">职位</label>
                  <input type="text" className="input" placeholder="如：研发工程师" value={formData.position} onChange={e => setFormData(p => ({ ...p, position: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">角色</label>
                <select className="input" value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value }))}>
                  <option value="member">成员</option>
                  <option value="manager">项目经理</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              {modalMode === 'edit' && (
                <div>
                  <label className="label">重置密码（留空不修改）</label>
                  <input type="password" className="input" placeholder="输入新密码" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">取消</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">{saving ? '保存中...' : (modalMode === 'create' ? '创建' : '保存')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
