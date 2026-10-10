import { useCallback, useEffect, useMemo, useState } from 'react';
import { backupAPI, backupArchiveAPI, BACKUP_MODULES, toMessage } from '@/api';
import type {
  ArchiveRow,
  ArchiveStorageResponse,
  ArchiveRetentionPreview,
  ArchiveVerifyResponse,
  ArchiveRunResponse,
  BackupPayload,
  RestoreSummary,
  RestoreValidation,
} from '@/api';

/**
 * 数据备份与恢复（三个分区）
 *
 *   1. 导出与恢复（批次三 v2）：模块级 JSON 导出 → 只读校验（逐表差异）→ 单事务回灌；
 *   2. 归档备份：整库 pg_dump -Fc + AES-256-GCM 加密产物 —— 历史列表、立即备份、离线校验、
 *      下载（密文/元数据）、删除；同一时刻只允许一份作业（PG advisory lock，并发返回 409）；
 *   3. 存储用量：挂载水位 + 归档占用（按天）+ 其它备份目录 + 未登记目录 + 保留策略。
 *
 * 边界（有意为之）：
 *   - 全部入口仅 SUPER_ADMIN（data.export），与既有备份/恢复一致；
 *   - **应用内不做整库恢复** —— 那是 pg_restore + 运维窗口的活；
 *     归档的"恢复"链路是：下载/校验 → 运维解密（CLI）→ pg_restore。
 */
type Tab = 'transfer' | 'archive' | 'storage';

const TABS: Array<{ key: Tab; label: string; hint: string }> = [
  { key: 'transfer', label: '导出与恢复', hint: '模块级 JSON' },
  { key: 'archive', label: '归档备份', hint: '整库 · 加密' },
  { key: 'storage', label: '存储用量', hint: '磁盘 · 保留' },
];

export default function BackupManager() {
  const [tab, setTab] = useState<Tab>('transfer');

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900">数据备份与恢复</h1>
        <p className="mt-1 text-sm text-gray-500">
          模块级 JSON 导出与回灌（在线自助）+ 整库归档备份（加密、可校验、可下载）。
          整库灾难恢复由运维执行{' '}
          <code className="px-1 bg-gray-100 rounded">pg_restore</code>，本页不提供覆盖式恢复。
        </p>
      </div>

      <div role="tablist" aria-label="备份功能分区" className="flex flex-wrap gap-2">
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={active}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/70 text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
              <span className={`ml-2 text-xs ${active ? 'text-blue-100' : 'text-gray-400'}`}>{item.hint}</span>
            </button>
          );
        })}
      </div>

      {tab === 'transfer' && <TransferTab />}
      {tab === 'archive' && <ArchiveTab />}
      {tab === 'storage' && <StorageTab />}
    </div>
  );
}

/** 字节数 → 人类可读 */
function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN');
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

function NoticeBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>
  );
}

function VerifyBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    passed: { cls: 'result-badge result-pass', label: '已通过' },
    failed: { cls: 'result-badge result-fail', label: '未通过' },
    unknown: { cls: 'result-badge result-warn', label: '未校验' },
  };
  const item = map[status] ?? map.unknown;
  return <span className={item.cls}>{item.label}</span>;
}

/* ────────────────────────────── 1. 导出与恢复 ────────────────────────────── */

function TransferTab() {
  const [selectedModules, setSelectedModules] = useState<string[]>(BACKUP_MODULES.map((m) => m.key));
  const [exporting, setExporting] = useState(false);

  const [payload, setPayload] = useState<BackupPayload | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [replaceAck, setReplaceAck] = useState(false);

  const [previewing, setPreviewing] = useState(false);
  const [validation, setValidation] = useState<RestoreValidation | null>(null);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payloadStats = useMemo(() => {
    if (!payload?.data) return [];
    return Object.entries(payload.data)
      .filter(([, rows]) => Array.isArray(rows))
      .map(([key, rows]) => ({ key, rows: (rows as unknown[]).length }))
      .sort((a, b) => b.rows - a.rows);
  }, [payload]);

  const toggleModule = (key: string) => {
    setSelectedModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleExport = async () => {
    setError(null);
    if (selectedModules.length === 0) {
      setError('至少选择一个导出模块');
      return;
    }
    setExporting(true);
    try {
      await backupAPI.export(selectedModules);
    } catch (e) {
      setError(toMessage(e, '导出失败'));
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File | null) => {
    setError(null);
    setValidation(null);
    setSummary(null);
    setPayload(null);
    setFileName('');
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      if (!parsed?.data || typeof parsed.data !== 'object') {
        throw new Error('不是有效的备份文件（缺少 data 字段）');
      }
      setPayload(parsed);
      setFileName(file.name);
    } catch (e) {
      setError(toMessage(e, '备份文件解析失败'));
    }
  };

  const handlePreview = async () => {
    if (!payload) return;
    setError(null);
    setSummary(null);
    setPreviewing(true);
    try {
      const res = await backupAPI.preview(payload, mode);
      setValidation(res);
    } catch (e) {
      setError(toMessage(e, '预检失败'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!payload || !validation?.ok) return;
    if (mode === 'replace' && !replaceAck) return;
    setError(null);
    setApplying(true);
    try {
      const res = await backupAPI.restore(payload, mode, mode === 'replace');
      setSummary(res.summary);
      setValidation(null);
    } catch (e) {
      setError(toMessage(e, '恢复失败（事务已回滚）'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-3">导出备份</h2>
        <div className="flex flex-wrap gap-3">
          {BACKUP_MODULES.map((m) => (
            <label key={m.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={selectedModules.includes(m.key)}
                onChange={() => toggleModule(m.key)}
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn btn-secondary" onClick={() => setSelectedModules(BACKUP_MODULES.map((m) => m.key))}>
            全选
          </button>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? '导出中…' : '导出 JSON'}
          </button>
          {selectedModules.length !== BACKUP_MODULES.length && (
            <span className="text-xs text-amber-600">
              已选 {selectedModules.length} / {BACKUP_MODULES.length} 个模块（部分导出）
            </span>
          )}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">数据恢复</h2>

        <div>
          <label className="block text-xs text-gray-500 mb-1">备份文件（.json）</label>
          <input
            type="file"
            accept="application/json,.json"
            className="block w-full text-sm"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          {payload && (
            <p className="mt-2 text-xs text-gray-500">
              {fileName} · 版本 {payload.version ?? '未知'} · 导出时间{' '}
              {payload.exportedAt ? new Date(payload.exportedAt).toLocaleString('zh-CN') : '未知'} · 表{' '}
              {payloadStats.length} 张 / 共 {payloadStats.reduce((s, t) => s + t.rows, 0)} 行
            </p>
          )}
        </div>

        {payload && payloadStats.length > 0 && (
          <div className="glass-panel overflow-hidden">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">数据表</th>
                  <th className="px-3 py-2 text-right">行数</th>
                </tr>
              </thead>
              <tbody>
                {payloadStats.map((t) => (
                  <tr key={t.key} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{t.key}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{t.rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-xs text-gray-500">恢复模式</span>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="radio" className="mt-1" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            <span>
              <b>合并（merge，默认）</b>：按主键写入，已存在的记录被备份内容覆盖，未涉及的既有数据保持不变。
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="radio" className="mt-1" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>
              <b className="text-red-600">替换（replace，破坏性）</b>：先清空备份覆盖的表（append-only 表跳过），再整体写入。
            </span>
          </label>
          {mode === 'replace' && (
            <label className="flex items-center gap-2 text-sm text-red-600 pl-6">
              <input type="checkbox" checked={replaceAck} onChange={(e) => setReplaceAck(e.target.checked)} />
              我已知晓 replace 会清空被覆盖表的数据，并已做好 pg_dump 级备份
            </label>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button className="btn btn-secondary" onClick={handlePreview} disabled={!payload || previewing}>
            {previewing ? '校验中…' : '校验并预览差异'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleApply}
            disabled={!validation?.ok || applying || (mode === 'replace' && !replaceAck)}
          >
            {applying ? '恢复中…' : '执行恢复'}
          </button>
        </div>
      </div>

      {validation && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">
            校验结果{' '}
            <span className={validation.ok ? 'text-green-600' : 'text-red-600'}>{validation.ok ? '通过' : '未通过'}</span>
          </h2>

          {validation.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1">
              {validation.errors.map((e, i) => (
                <div key={i}>· {e}</div>
              ))}
            </div>
          )}
          {validation.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 space-y-1">
              {validation.warnings.map((w, i) => (
                <div key={i}>· {w}</div>
              ))}
            </div>
          )}

          <div className="glass-panel overflow-hidden">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">数据表</th>
                  <th className="px-3 py-2 text-right">备份行数</th>
                  <th className="px-3 py-2 text-right">新增</th>
                  <th className="px-3 py-2 text-right">覆盖</th>
                  <th className="px-3 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {validation.tables.map((t) => (
                  <tr key={t.key} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{t.key}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{t.rows}</td>
                    <td className="px-3 py-2 text-right text-green-700">{t.new}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{t.existing}</td>
                    <td className="px-3 py-2">
                      {t.errors.length ? (
                        <span className="text-red-600">错误 {t.errors.length}</span>
                      ) : t.warnings.length ? (
                        <span className="text-amber-600">警告 {t.warnings.length}</span>
                      ) : (
                        <span className="text-green-600">正常</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary && (
        <div className="card p-6 space-y-2">
          <h2 className="font-semibold text-gray-900">恢复完成</h2>
          <p className="text-sm text-gray-600">
            模式 <b>{summary.mode}</b> · 新增 <b className="text-green-700">{summary.created}</b> 行 · 覆盖{' '}
            <b className="text-blue-700">{summary.updated}</b> 行 · 清除 <b className="text-red-700">{summary.deleted}</b> 行 ·
            耗时 {(summary.durationMs / 1000).toFixed(1)}s
          </p>
          <p className="text-xs text-gray-400">本次操作已写入审计日志（action=restore）。</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── 2. 归档备份 ─────────────────────────────── */

function ArchiveTab() {
  const pageSize = 20;
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | 'ok' | 'failed'>('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ jobId: string; result: ArchiveVerifyResponse } | null>(null);
  const [runResult, setRunResult] = useState<ArchiveRunResponse['result'] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await backupArchiveAPI.list({ page, pageSize, status: status || undefined });
      setRows(res.items);
      setTotal(res.total);
      if (res.storageError) setError(`归档目录不可用：${res.storageError}`);
    } catch (e) {
      setError(toMessage(e, '加载归档列表失败'));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRun = async () => {
    if (
      !confirm(
        '立即生成一份整库归档备份？\n\n作业期间会在数据库侧持有快照事务与 advisory lock，' +
          '单份耗时通常数十秒；此期间无法再启动第二份归档备份。',
      )
    )
      return;
    setError(null);
    setNotice(null);
    setRunResult(null);
    setRunning(true);
    try {
      const res = await backupArchiveAPI.run();
      setRunResult(res.result);
      setNotice(`归档完成：${res.result.jobId}（${formatBytes(res.result.fileSize)}，${res.result.tableCount} 张表）`);
      setPage(1);
      await load();
    } catch (e) {
      setError(toMessage(e, '归档备份失败'));
    } finally {
      setRunning(false);
    }
  };

  const handleVerify = async (row: ArchiveRow) => {
    setError(null);
    setNotice(null);
    setBusyId(row.id);
    setVerify(null);
    try {
      const res = await backupArchiveAPI.verify(row.id);
      setVerify({ jobId: row.jobId, result: res });
      await load();
    } catch (e) {
      setError(toMessage(e, '归档校验失败'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (row: ArchiveRow, format: 'aes' | 'meta') => {
    setError(null);
    setBusyId(row.id);
    try {
      await backupArchiveAPI.download(row.id, format);
    } catch (e) {
      setError(toMessage(e, '下载失败'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (row: ArchiveRow) => {
    if (!confirm(`确认删除归档 ${row.jobId}？\n产物文件与登记记录都会被删除，且不可恢复。`)) return;
    setError(null);
    setNotice(null);
    setBusyId(row.id);
    try {
      const res = await backupArchiveAPI.remove(row.id);
      setNotice(`已删除 ${res.jobId}`);
      await load();
    } catch (e) {
      setError(toMessage(e, '删除失败'));
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <NoticeBanner message={notice} />

      <div className="card p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">归档备份</h2>
            <p className="mt-1 text-xs text-gray-500">
              整库 <code className="px-1 bg-gray-100 rounded">pg_dump -Fc -Z6</code> → AES-256-GCM 加密 →
              目录级原子发布。校验为离线五项（meta 形状 / 目录绑定 / 解密 / sha256 / 表清单对账）。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | 'ok' | 'failed');
                setPage(1);
              }}
            >
              <option value="">全部状态</option>
              <option value="ok">仅成功</option>
              <option value="failed">仅失败留痕</option>
            </select>
            <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
            <button className="btn btn-primary" onClick={handleRun} disabled={running}>
              {running ? '备份中…（请勿关闭页面）' : '立即备份'}
            </button>
          </div>
        </div>

        {runResult && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 space-y-1">
            <div>
              jobId <b>{runResult.jobId}</b> · 目录 <code>{runResult.dir}</code> · 密文{' '}
              <b>{formatBytes(runResult.fileSize)}</b>（明文 {formatBytes(runResult.plainBytes)}）· {runResult.tableCount} 张表 ·
              快照 {runResult.snapshotMode} · 耗时 {(runResult.durationMs / 1000).toFixed(1)}s
            </div>
            {runResult.warnings.length > 0 && <div>告警：{runResult.warnings.join('；')}</div>}
            {runResult.retention && (
              <div>
                保留策略：删除 {runResult.retention.removed.length} 份（{formatBytes(runResult.retention.removedBytes)}）·
                保留 {runResult.retention.kept} 份 · 跳过 {runResult.retention.skipped} 份未登记目录
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-6 space-y-3">
        <div className="glass-panel overflow-hidden">
          <table className="glass-table">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left">时间</th>
                <th className="px-3 py-2 text-left">jobId / 类型</th>
                <th className="px-3 py-2 text-left">状态</th>
                <th className="px-3 py-2 text-right">密文大小</th>
                <th className="px-3 py-2 text-right">表数</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-gray-400" colSpan={6}>
                    {loading ? '加载中…' : '暂无归档记录'}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatTime(row.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-gray-700">{row.jobId}</div>
                    <div className="text-xs text-gray-400">
                      {row.runType} · {row.snapshotMode}
                      {row.fileExists === false && <span className="text-amber-600"> · 产物缺失</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {row.status === 'ok' ? (
                      <VerifyBadge status={row.verifyStatus} />
                    ) : (
                      <span className="result-badge result-fail">失败</span>
                    )}
                    {row.status === 'failed' && row.failureCode && (
                      <div className="mt-1 text-xs text-red-600">{row.failureCode}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {row.status === 'ok' ? formatBytes(row.fileSize) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{row.tableCount || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => void handleVerify(row)}
                        disabled={row.status !== 'ok' || row.fileExists !== true || busyId === row.id}
                      >
                        校验
                      </button>
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => void handleDownload(row, 'aes')}
                        disabled={row.status !== 'ok' || row.fileExists !== true || busyId === row.id}
                      >
                        下载密文
                      </button>
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => void handleDownload(row, 'meta')}
                        disabled={row.status !== 'ok' || row.fileExists !== true || busyId === row.id}
                      >
                        meta
                      </button>
                      <button
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => void handleRemove(row)}
                        disabled={busyId === row.id}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            共 {total} 条 · 第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              上一页
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              下一页
            </button>
          </div>
        </div>

        {verify && (
          <div className="rounded-lg border border-gray-200 bg-white/70 px-4 py-3 text-sm space-y-1">
            <div className="font-semibold text-gray-900">
              校验 {verify.jobId}：{verify.result.ok ? <span className="text-green-600">通过</span> : <span className="text-red-600">未通过</span>}
            </div>
            {verify.result.checks.map((check) => (
              <div key={check.name} className={check.ok ? 'text-gray-600' : 'text-red-600'}>
                {check.ok ? '✓' : '×'} {check.name}：{check.detail}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── 3. 存储用量 ─────────────────────────────── */

function StorageTab() {
  const [data, setData] = useState<ArchiveStorageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<(ArchiveRetentionPreview & { removedBytes?: number; kept?: number }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await backupArchiveAPI.storage());
    } catch (e) {
      setError(toMessage(e, '加载存储用量失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePlan = async (dryRun: boolean) => {
    if (!dryRun && !confirm('立即执行保留策略？被清理的归档文件不可恢复。')) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await backupArchiveAPI.retention(dryRun);
      setPlan(res);
      if (!dryRun) {
        setNotice(`保留策略已执行：删除 ${res.removed?.length ?? 0} 份`);
        await load();
      }
    } catch (e) {
      setError(toMessage(e, '保留策略执行失败'));
    } finally {
      setBusy(false);
    }
  };

  const mount = data?.mount ?? null;
  const usagePct = mount?.usagePct ?? 0;
  const levelTone =
    data?.level === 'low'
      ? 'border-red-200 bg-red-50 text-red-700'
      : data?.level === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-green-200 bg-green-50 text-green-700';

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <NoticeBanner message={notice} />

      <div className="card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">磁盘水位</h2>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>
        {data && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${levelTone}`}>
            门禁：可用空间 ≥ {data.thresholds.minFreeMb} MB 才允许备份；占用率 ≥ {data.thresholds.warnPct}% 仅告警。
            {data.warnings.length > 0 && <div className="mt-1">· {data.warnings.join('；')}</div>}
          </div>
        )}
        {mount ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span className="font-mono">{mount.path}</span>
              <span>
                {formatBytes(mount.usedBytes)} / {formatBytes(mount.totalBytes)} · 可用 {formatBytes(mount.freeBytes)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className={`h-2 rounded-full ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 75 ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, usagePct)}%` }}
              />
            </div>
            <div className="text-right text-xs text-gray-500">{usagePct}%</div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">未取到挂载信息。</p>
        )}
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold text-gray-900">归档目录</h2>
        {data ? (
          <>
            <p className="text-xs text-gray-500">
              <span className="font-mono">{data.archive.root}</span> · 共 <b>{data.archive.count}</b> 份 ·{' '}
              <b>{formatBytes(data.archive.totalBytes)}</b>
              {data.archive.workBytes > 0 && <> · 未发布工作区 {formatBytes(data.archive.workBytes)}</>}
            </p>
            <div className="glass-panel overflow-hidden">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left">日期目录</th>
                    <th className="px-3 py-2 text-right">份数</th>
                    <th className="px-3 py-2 text-right">占用</th>
                  </tr>
                </thead>
                <tbody>
                  {data.archive.byDay.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-sm text-gray-400" colSpan={3}>
                        尚无归档产物
                      </td>
                    </tr>
                  )}
                  {data.archive.byDay.map((day) => (
                    <tr key={day.day} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{day.day}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{day.count}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatBytes(day.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">{loading ? '加载中…' : '暂无数据'}</p>
        )}
      </div>

      {data && data.dirs.length > 0 && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">其它备份与数据目录</h2>
          <div className="glass-panel overflow-hidden">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">用途</th>
                  <th className="px-3 py-2 text-left">目录</th>
                  <th className="px-3 py-2 text-right">文件数</th>
                  <th className="px-3 py-2 text-right">占用</th>
                </tr>
              </thead>
              <tbody>
                {data.dirs.map((dir) => (
                  <tr key={dir.dir} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{dir.label}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{dir.dir}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{dir.files}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatBytes(dir.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">保留策略</h2>
            {data && (
              <p className="mt-1 text-xs text-gray-500">
                保留 {data.retention.keepDays > 0 ? `${data.retention.keepDays} 天内` : '不限天数'} · 最多{' '}
                {data.retention.keepCount > 0 ? `${data.retention.keepCount} 份` : '不限份数'}
                （取"最先超限"的规则，且永远保留最新一份；未登记目录一律不删）
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => void handlePlan(true)} disabled={busy}>
              预览待清理
            </button>
            <button className="btn btn-danger" onClick={() => void handlePlan(false)} disabled={busy}>
              立即清理
            </button>
          </div>
        </div>

        {plan && (
          <div className="glass-panel overflow-hidden">
            <table className="glass-table">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">处置</th>
                  <th className="px-3 py-2 text-left">产物目录</th>
                  <th className="px-3 py-2 text-right">占用</th>
                </tr>
              </thead>
              <tbody>
                {plan.remove.length === 0 && plan.skipped.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-sm text-gray-400" colSpan={3}>
                      没有需要清理的产物
                    </td>
                  </tr>
                )}
                {plan.remove.map((item) => (
                  <tr key={item.dir} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-red-600">将删除</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.dir}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatBytes(item.bytes)}</td>
                  </tr>
                ))}
                {plan.skipped.map((item) => (
                  <tr key={item.dir} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-amber-600">跳过（未登记）</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.dir}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatBytes(item.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.unregistered.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-1">
            <div className="font-semibold">未登记的产物目录（不会被自动清理，请人工确认）：</div>
            {data.unregistered.map((item) => (
              <div key={item.dir}>
                · <span className="font-mono">{item.dir}</span>（{formatBytes(item.bytes)}）—— {item.reason}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
