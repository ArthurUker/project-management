import { useEffect, useState } from 'react';
import { userAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

export default function Users() {
  const { user: currentUser } = useAppStore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    position: '',
    department: '',
    role: 'member'
  });
  
  useEffect(() => {
    loadUsers();
  }, []);
  
  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await userAPI.list({ pageSize: 100 });
      setUsers(res.list || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateUser = async () => {
    if (!formData.username || !formData.password || !formData.name) {
      alert('请填写必填字段');
      return;
    }
    
    try {
      await userAPI.create(formData);
      setShowModal(false);
      setFormData({ username: '', password: '', name: '', position: '', department: '', role: 'member' });
      loadUsers();
    } catch (err: any) {
      alert(err.error || '创建失败');
    }
  };
  
  const handleDeleteUser = async (id: string) => {
    if (!confirm('确定要删除该用户吗？')) return;
    
    try {
      await userAPI.delete(id);
      loadUsers();
    } catch (err: any) {
      alert(err.error || '删除失败');
    }
  };
  
  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    member: 'bg-gray-100 text-gray-600'
  };
  
  if (currentUser?.role !== 'admin') {
    return (
      <div className="card p-12 text-center text-gray-500">
        您没有权限访问此页面
      </div>
    );
  }
  
  return (
    <div>
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-gray-900">成员管理</h1>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          + 添加成员
        </button>
      </div>
      
      {/* 用户列表 */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">姓名</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">用户名</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">部门</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">职位</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">角色</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">状态</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">加载中...</td>
                </tr>
              ) : users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-semibold">
                          {user.name?.charAt(0)}
                        </span>
                      </div>
                      <span className="font-medium text-gray-900">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{user.username}</td>
                  <td className="px-6 py-4 text-gray-600">{user.department || '-'}</td>
                  <td className="px-6 py-4 text-gray-600">{user.position || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[user.role]}`}>
                      {user.role === 'admin' ? '管理员' : user.role === 'manager' ? '项目经理' : '成员'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {user.status === 'active' ? '正常' : '已禁用'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* 添加用户弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">添加成员</h2>
            
            <div className="space-y-4">
              <div>
                <label className="label">用户名 *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="用于登录"
                />
              </div>
              <div>
                <label className="label">密码 *</label>
                <input
                  type="password"
                  className="input"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="至少6位"
                />
              </div>
              <div>
                <label className="label">姓名 *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="真实姓名"
                />
              </div>
              <div>
                <label className="label">部门</label>
                <input
                  type="text"
                  className="input"
                  value={formData.department}
                  onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="所属部门"
                />
              </div>
              <div>
                <label className="label">职位</label>
                <input
                  type="text"
                  className="input"
                  value={formData.position}
                  onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                  placeholder="如：结构研发工程师"
                />
              </div>
              <div>
                <label className="label">角色</label>
                <select
                  className="input"
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="member">成员</option>
                  <option value="manager">项目经理</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn btn-secondary">
                取消
              </button>
              <button onClick={handleCreateUser} className="btn btn-primary">
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
