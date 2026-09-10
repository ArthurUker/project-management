import { useMemo, useState } from 'react';
import { backupAPI, BACKUP_MODULES, toMessage } from '@/api';
import type { BackupPayload, RestoreSummary, RestoreValidation } from '@/api';

/**
 * 数据备份与恢复（批次三 v2）
 *
 * 流程：选择备份文件 → 只读校验（逐表差异）→ 选择模式 → 执行（单事务，失败整体回滚）
 * 约束：仅 SUPER_ADMIN；replace 为破坏性操作需显式二次确认；
 *       运维级整库恢复仍走 pg_dump / pg_restore。
 */
export default function BackupManager() {
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
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900">数据备份与恢复</h1>
        <p className="mt-1 text-sm text-gray-500">
          模块级 JSON 导出与回灌。恢复走「只读校验 → 单事务应用」，任一步失败自动回滚；
          整库级灾难恢复请由运维执行 <code className="px-1 bg-gray-100 rounded">pg_dump / pg_restore</code>。
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── 导出 ── */}
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
            <span className="text-xs text-amber-600">已选 {selectedModules.length} / {BACKUP_MODULES.length} 个模块（部分导出）</span>
          )}
        </div>
      </div>

      {/* ── 恢复 ── */}
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
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
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

      {/* ── 校验结果 ── */}
      {validation && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">
            校验结果{' '}
            <span className={validation.ok ? 'text-green-600' : 'text-red-600'}>
              {validation.ok ? '通过' : '未通过'}
            </span>
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

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
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

      {/* ── 恢复结果 ── */}
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
