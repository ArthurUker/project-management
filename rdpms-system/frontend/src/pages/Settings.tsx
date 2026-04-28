import { useState } from 'react';
import { authAPI } from '../api/client';
import { useAppStore } from '../store/appStore';

export default function Settings() {
  const { user } = useAppStore();
  
  const [passwords, setPasswords] = useState({
    old: '',
    new: '',
    confirm: ''
  });
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async () => {
    if (!passwords.old || !passwords.new) {
      setPasswordMsg({ type: 'error', text: '请填写所有字段' });
      return;
    }
    if (passwords.new !== passwords.confirm) {
      setPasswordMsg({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }
    if (passwords.new.length < 6) {
      setPasswordMsg({ type: 'error', text: '新密码长度不能少于6位' });
      return;
    }
    try {
      await authAPI.changePassword(passwords.old, passwords.new);
      setPasswordMsg({ type: 'success', text: '密码修改成功' });
      setPasswords({ old: '', new: '', confirm: '' });
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.error || '修改失败' });
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl pb-8">
        <h1 className="text-2xl font-display font-bold text-gray-900 mb-6">系统设置</h1>

        {/* 个人信息 */}
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">个人信息</h2>
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-600 font-bold text-2xl">
                  {user?.name?.charAt(0)}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900">{user?.name}</p>
                <p className="text-sm text-gray-500">{user?.position || user?.role}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-500">用户名</p>
                <p className="font-medium text-gray-900">{user?.username}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">部门</p>
                <p className="font-medium text-gray-900">{user?.department || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">职位</p>
                <p className="font-medium text-gray-900">{user?.position || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">角色</p>
                <p className="font-medium text-gray-900">
                  {user?.role === 'admin' ? '管理员' : user?.role === 'manager' ? '项目经理' : '成员'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 修改密码 */}
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">修改密码</h2>
          {passwordMsg && (
            <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
              passwordMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}>
              {passwordMsg.text}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="label">旧密码</label>
              <input
                type="password"
                className="input"
                value={passwords.old}
                onChange={(e) => setPasswords(prev => ({ ...prev, old: e.target.value }))}
                placeholder="请输入旧密码"
              />
            </div>
            <div>
              <label className="label">新密码</label>
              <input
                type="password"
                className="input"
                value={passwords.new}
                onChange={(e) => setPasswords(prev => ({ ...prev, new: e.target.value }))}
                placeholder="至少6位"
              />
            </div>
            <div>
              <label className="label">确认新密码</label>
              <input
                type="password"
                className="input"
                value={passwords.confirm}
                onChange={(e) => setPasswords(prev => ({ ...prev, confirm: e.target.value }))}
                placeholder="再次输入新密码"
              />
            </div>
            <button onClick={handleChangePassword} className="btn btn-primary">
              修改密码
            </button>
          </div>
        </div>

        {/* 关于 */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">关于系统</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <p>研发项目管理系统 (R&D PMS)</p>
            <p>版本: 1.0.0</p>
            <p>基于 Local-First 架构设计</p>
            <p className="text-gray-400 mt-4">
              数据存储于本地IndexedDB，支持离线使用。<br />
              连接服务器后自动同步数据。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
