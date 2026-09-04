import { useCallback, useEffect, useState } from 'react';
import {
  auditLogsAPI,
  dictAPI,
  toMessage,
  type AuditLog,
  type AuditLogQuery,
  type EntityAuditSummary,
} from '@/api';
import { useAuth } from '@/auth/useAuth';
import { useHasPerm, PERMS } from '@/auth/permissions';

const PAGE_SIZE = 20;

/**
 * M-1 §4：19 项 AuditAction 本地 fallback 标签。
 * 展示优先级：/api/dict EnumMeta(AuditAction) → 本表 → 原始 action 字符串。
 * 禁止恢复旧硬编码（auth.login / project.create / user.disable / backup.export 等）。
 */
const FALLBACK_ACTION_LABELS: Record<string, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  restore: '恢复',
  login: '登录',
  'login.failed': '登录失败',
  logout: '登出',
  'token.refresh': '令牌刷新',
  'password.change': '修改密码',
  'permission.change': '权限变更',
  submit: '提交',
  approve: '审批通过',
  reject: '驳回',
  assign: '指派',
  'status.change': '状态变更',
  upload: '上传',
  download: '下载',
  export: '导出',
  'read.sensitive': '读取敏感数据',
};

const ACTION_COLOR: Record<string, string> = {
  create: '#059669',
  update: '#2563eb',
  delete: '#dc2626',
  restore: '#059669',
  login: '#7c3aed',
  'login.failed': '#dc2626',
  logout: '#6b7280',
  'token.refresh': '#6b7280',
  'password.change': '#d97706',
  'permission.change': '#dc2626',
  submit: '#2563eb',
  approve: '#059669',
  reject: '#dc2626',
  assign: '#7c3aed',
  'status.change': '#d97706',
  upload: '#2563eb',
  download: '#6b7280',
  export: '#d97706',
  'read.sensitive': '#dc2626',
};

export default function AuditLogs() {
  const { user } = useAuth();
  const canExport = useHasPerm(PERMS.AUDIT_EXPORT);

  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');

  // EnumMeta(AuditAction) 标签字典
  const [labels, setLabels] = useState<Record<string, string>>(FALLBACK_ACTION_LABELS);

  // 实体下钻摘要（/api/audit/entity/:type/:id/summary）
  const [summary, setSummary] = useState<EntityAuditSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    dictAPI
      .byName('AuditAction')
      .then((rows) => {
        if (rows?.length) {
          const map: Record<string, string> = { ...FALLBACK_ACTION_LABELS };
          for (const row of rows) map[row.value] = row.label;
          setLabels(map);
        }
      })
      .catch(() => {/* 字典不可用时保持本地 fallback */});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: AuditLogQuery = { page, pageSize: PAGE_SIZE };
      if (action) params.action = action;
      if (entityType) params.entityType = entityType;
      const res = await auditLogsAPI.list(params);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(toMessage(e, '加载审计日志失败'));
    } finally {
      setLoading(false);
    }
  }, [page, action, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async () => {
    try {
      const params: AuditLogQuery = {};
      if (action) params.action = action;
      if (entityType) params.entityType = entityType;
      const res = await auditLogsAPI.export(params);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(toMessage(e, '导出失败（需要 audit.export 权限）'));
    }
  };

  const openEntitySummary = async (log: AuditLog) => {
    if (!log.entityType || !log.entityId) return;
    setSummaryLoading(true);
    setSummaryError('');
    setSummary(null);
    try {
      const res = await auditLogsAPI.entitySummary(log.entityType, log.entityId);
      setSummary(res);
    } catch (e) {
      setSummaryError(toMessage(e, '实体摘要加载失败'));
    } finally {
      setSummaryLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">审计日志</h1>
          <p className="text-sm text-gray-500 mt-1">
            记录关键业务操作，仅追加不可修改。当前操作人：{user?.displayName ?? user?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* M-1 §7.4：导出由 audit.export 控制 —— ADMIN 可看不可导出，AUDITOR/SUPER_ADMIN 可导出 */}
          {canExport && (
            <button type="button" className="btn btn-secondary" onClick={() => void handleExport()}>
              导出
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <select
          className="input w-48"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部动作</option>
          {Object.entries(FALLBACK_ACTION_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}（{v}）</option>
          ))}
        </select>
        <select
          className="input w-48"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部实体</option>
          {['PROJECT', 'TASK', 'USER', 'REPORT', 'SAMPLE', 'FORMULA', 'REAGENT_LOT', 'FILE', 'ROLE'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
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
              <th className="px-3 py-2 font-medium">操作人</th>
              <th className="px-3 py-2 font-medium">动作</th>
              <th className="px-3 py-2 font-medium">实体</th>
              <th className="px-3 py-2 font-medium">IP</th>
              <th className="px-3 py-2 font-medium">备注</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => {
              const color = ACTION_COLOR[log.action] ?? '#374151';
              const elevated =
                log.metadata != null &&
                typeof log.metadata === 'object' &&
                (log.metadata as Record<string, unknown>).elevated === true;
              return (
                <tr key={log.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {log.actor?.displayName ?? log.actorName ?? log.actorId ?? '—'}
                    {log.actorRole && (
                      <span className="ml-1 text-xs text-gray-400">{log.actorRole}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ background: `${color}14`, color }}
                    >
                      {labels[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {log.entityType ?? '—'}
                    {log.entityLabel ? ` · ${log.entityLabel}` : log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{log.ip ?? '—'}</td>
                  <td className="px-3 py-2">
                    {elevated && (
                      <span
                        className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ background: '#fef2f2', color: '#dc2626' }}
                        title="SUPER_ADMIN 以非项目成员身份访问（metadata.elevated=true）"
                      >
                        提权操作
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {log.entityType && log.entityId ? (
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => void openEntitySummary(log)}
                      >
                        查看摘要
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                  暂无审计记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 实体摘要弹层：AUDITOR 下钻唯一通道，不跳业务详情页 */}
      {(summary || summaryLoading || summaryError) && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setSummary(null);
            setSummaryError('');
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 mb-3">实体审计摘要</h3>
            {summaryLoading && <p className="text-sm text-gray-500">加载中…</p>}
            {summaryError && <p className="text-sm text-red-600">{summaryError}</p>}
            {summary && (
              <div className="space-y-2 text-sm">
                <p className="text-gray-600">
                  {summary.entityType} · {summary.entityId.slice(0, 8)} · 共 {summary.total} 条审计
                </p>
                <div className="flex flex-wrap gap-2">
                  {summary.byAction.map((b) => (
                    <span
                      key={b.action}
                      className="px-2 py-0.5 rounded text-xs"
                      style={{ background: '#f3f4f6', color: '#374151' }}
                    >
                      {labels[b.action] ?? b.action} × {b.count}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  首次：{summary.firstSeenAt ? new Date(summary.firstSeenAt).toLocaleString('zh-CN') : '—'}（{summary.firstSeenBy ?? '—'}）
                </p>
                <p className="text-xs text-gray-400">
                  最近：{summary.lastSeenAt ? new Date(summary.lastSeenAt).toLocaleString('zh-CN') : '—'}（{summary.lastSeenBy ?? '—'}）
                </p>
              </div>
            )}
            <div className="mt-4 text-right">
              <button type="button" className="btn btn-secondary" onClick={() => setSummary(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

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
