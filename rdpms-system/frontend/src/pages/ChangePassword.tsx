import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '@/api';
import { ApiError, toMessage } from '@/api';
import { useAuth } from '@/auth/useAuth';

/** 首登强制改密 / 用户主动改密共用页面 */
export default function ChangePassword() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const forced = Boolean(user?.mustChangePassword);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const validate = (): string | null => {
    if (!forced && !oldPassword) return '请输入当前密码';
    if (newPassword.length < 10) return '新密码至少 10 位';
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return '新密码需包含大小写字母与数字';
    }
    if (newPassword !== confirm) return '两次输入的新密码不一致';
    if (!forced && newPassword === oldPassword) return '新密码不能与当前密码相同';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setSaving(true);
    try {
      if (forced) {
        await authAPI.forceChangePassword(newPassword);
      } else {
        await authAPI.changePassword(oldPassword, newPassword);
      }
      await refreshUser();
      navigate('/', { replace: true });
    } catch (err) {
      setError(toMessage(err, '修改密码失败'));
      if (err instanceof ApiError) {
        const fields = err.fieldErrors;
        const first = Object.values(fields)[0];
        if (first) setError(first);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-display font-bold text-gray-900">
            {forced ? '首次登录需修改密码' : '修改密码'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {forced ? '出于安全要求，请设置新的登录密码' : `当前账号：${user?.username ?? ''}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {!forced && (
            <div>
              <label className="label">当前密码</label>
              <input
                type="password"
                className="input"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}

          <div>
            <label className="label">新密码</label>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="至少 10 位，含大小写字母与数字"
            />
          </div>

          <div>
            <label className="label">确认新密码</label>
            <input
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" disabled={saving} className="btn btn-primary w-full py-3">
            {saving ? '提交中…' : '确认修改'}
          </button>
        </form>
      </div>
    </div>
  );
}
