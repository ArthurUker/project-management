import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { toMessage, isApiError, ERR } from '@/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login, status, user } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);

  // 未登录访问受保护页面时会写入 state.from，登录后回跳
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  // 已登录用户不应停留在登录页
  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    navigate(user.mustChangePassword ? '/change-password' : from, { replace: true });
  }, [status, user, from, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (isApiError(err) && err.code === ERR.RATE_LIMITED) {
        setError('尝试次数过多，请稍后再试');
      } else if (isApiError(err) && err.code === ERR.AUTH_DISABLED) {
        setError('账号已被停用，请联系管理员');
      } else {
        setError(toMessage(err, '登录失败，请检查用户名和密码'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-fadeIn">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">RD</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900">研发项目管理系统</h1>
          <p className="text-gray-500 mt-2">R&D Project Management System</p>
        </div>

        {/* 登录表单 */}
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="label">用户名</label>
            <input
              type="text"
              className="input"
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  formRef.current?.requestSubmit?.();
                }
              }}
            />
          </div>

          <div>
            <label className="label">密码</label>
            <input
              type="password"
              className="input"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  formRef.current?.requestSubmit?.();
                }
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3 text-base disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">研发项目管理系统 v1.0</p>
      </div>
    </div>
  );
}
