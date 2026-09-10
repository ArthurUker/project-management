import { useSync } from '../offline/SyncProvider';

const ENTITY_LABEL: Record<string, string> = {
  projects: '项目',
  projectPhases: '阶段',
  tasks: '任务',
  milestones: '里程碑',
  monthlyProgress: '月度进展',
  reports: '汇报',
  projectMembers: '项目成员',
};

/**
 * 同步面板：立即同步 / 冲突处置（采用服务端 or 保留本地重推）/ 被拒清单
 */
export default function SyncConflictDialog({ onClose, onSyncNow }: { onClose: () => void; onSyncNow: () => void }) {
  const { conflicts, rejections, resolveConflict, clearRejections, syncing, lastSyncAt, lastError, pending, deviceId, online } =
    useSync();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-gray-900">离线同步</h3>
          <button className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          设备 {deviceId.slice(0, 8)} · 待同步 {pending} 条 · 最近同步{' '}
          {lastSyncAt ? new Date(lastSyncAt).toLocaleString('zh-CN') : '—'}
          {!online && <span className="text-amber-600"> · 当前离线</span>}
          {lastError && <span className="text-red-600"> · {lastError}</span>}
        </div>

        <div className="mt-4">
          <button className="btn btn-primary" onClick={onSyncNow} disabled={syncing || !online}>
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>

        <h4 className="mt-5 font-medium text-gray-900">冲突（{conflicts.length}）</h4>
        {conflicts.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">无冲突</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {conflicts.map((c) => (
              <li key={c.clientMutationId} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="font-medium text-amber-900">
                  {ENTITY_LABEL[c.entity] ?? c.entity} · {c.id.slice(0, 8)} · {c.reason ?? '服务端已有更新'}
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  服务端最后更新：{String(c.server?.updatedAt ?? '—')} · 检测时间：
                  {new Date(c.detectedAt).toLocaleString('zh-CN')}
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-secondary" onClick={() => resolveConflict(c.clientMutationId, 'server')}>
                    采用服务端
                  </button>
                  <button className="btn btn-secondary" onClick={() => resolveConflict(c.clientMutationId, 'local')}>
                    保留本地并重推
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {rejections.length > 0 && (
          <>
            <div className="mt-5 flex items-center justify-between">
              <h4 className="font-medium text-gray-900">被拒绝（{rejections.length}）</h4>
              <button className="text-xs text-gray-500 underline" onClick={clearRejections}>
                清除
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {rejections.map((r) => (
                <li key={r.clientMutationId}>
                  · {ENTITY_LABEL[r.entity] ?? r.entity} {r.id.slice(0, 8)}：{r.reason ?? '服务端拒绝'}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
