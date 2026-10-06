import { useSync } from '../offline/SyncProvider';
import RecoveryPanel from '../offline/RecoveryPanel';

/** All recovery payloads/actions use the current-owner authorization path. */
export default function SyncConflictDialog({ onClose, onSyncNow }: { onClose: () => void; onSyncNow: () => void }) {
  const { syncing, lastSyncAt, lastError, pending, deviceId, online } = useSync();
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
    <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between"><h3>离线同步</h3><button className="btn btn-secondary" onClick={onClose}>关闭</button></div>
      <p>设备 {deviceId.slice(0, 8)} · 待同步 {pending} 条 · 最近同步 {lastSyncAt ? new Date(lastSyncAt).toLocaleString('zh-CN') : '—'} {!online && '· 当前离线'} {lastError && `· ${lastError}`}</p>
      <button className="btn btn-primary" onClick={onSyncNow} disabled={syncing || !online}>{syncing ? '同步中…' : '立即同步'}</button>
      <RecoveryPanel />
    </div>
  </div>;
}
