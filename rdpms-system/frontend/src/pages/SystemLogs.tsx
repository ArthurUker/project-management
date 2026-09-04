import { useCallback, useEffect, useState } from 'react';
import { systemLogsAPI, toMessage, type SystemLog, type SystemLogQuery } from '@/api';
import { useHasPerm, PERMS } from '@/auth/permissions';

const PAGE_SIZE = 20;

const LEVEL_CFG: Record<string, { label: string; color: string; bg: string }> = {
  DEBUG: { label: 'DEBUG', color: '#6b7280', bg: '#f3f4f6' },
  INFO: { label: 'INFO', color: '#2563eb', bg: '#eff6ff' },
  WARN: { label: 'WARN', color: '#d97706', bg: '#fffbeb' },
  ERROR: { label: 'ERROR', color: '#dc2626', bg: '#fef2f2' },
  FATAL: { label: 'FATAL', color: '#ffffff', bg: '#7f1d1d' },
};

/**
 * SystemLogs — 系统日志（M-1 §7.5）
 *
 * 权限规则（UI 显隐；真实拦截在后端）：
 *   perm: system.logs.view
 *   SUPER_ADMIN 可见 / AUDITOR 可见 / ADMIN 不可见（无该权限）
 */
export default function SystemLogs() {
  const canView = useHasPerm(PERMS.SYSTEM_LOGS_VIEW);

  const [items, setItems] = useState<SystemLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [level, setLevel] = useState('');
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: SystemLogQuery = { page, pageSize: PAGE_SIZE };
      if (level) params.level = level;
      if (keyword) params.action = keyword;
      const res = await systemLogsAPI.list(params);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(toMessage(e, '加载系统日志失败'));
    } finally {
      setLoading(false);
    }
  }, [page, level, keyword]);

  useEffect(() => {
    if (canView) void load();
  }, [load, canView]);

  if (!canView) {
    return (
      <div className="card p-12 text-center text-gray-500">您没有访问系统日志的权限</div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">系统日志</h1>
          <p className="text-sm text-gray-500 mt-1">
            登录 / 登出 / 令牌刷新等系统事件的运行时记录。仅 system.logs.view 持有者可见。
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <select
          className="input w-40"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部级别</option>
          {Object.entries(LEVEL_CFG).map(([v, cfg]) => (
            <option key={v} value={v}>{cfg.label}</option>
          ))}
        </select>
        <input
          className="input w-56"
          placeholder="按 action 过滤，如 login"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
        />
        <span className="text-sm text-gray-500">共 {total} 条</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-left text-gray-600">
              <th className="px-3 py-2 font-medium">时间</th>
              <th className="px-3 py-2 font-medium">级别</th>
              <th className="px-3 py-2 font-medium">分类</th>
              <th className="px-3 py-2 font-medium">事件</th>
              <th className="px-3 py-2 font-medium">消息</th>
              <th className="px-3 py-2 font-medium">操作人</th>
              <th className="px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => {
              const lv = LEVEL_CFG[log.level] ?? LEVEL_CFG.INFO;
              return (
                <tr key={log.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ background: lv.bg, color: lv.color }}
                    >
                      {lv.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{log.category ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-800">{log.action}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{log.message ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {log.user?.displayName ?? log.userId ?? 'system'}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{log.ip ?? '—'}</td>
                </tr>
              );
            })}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                  暂无系统日志
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          上一页
        </button>
        <span className="text-sm text-gray-600">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
