import { useState } from 'react';
import { useSync } from '../offline/SyncProvider';
import SyncConflictDialog from './SyncConflictDialog';

/**
 * 顶栏同步状态指示（Tencent 意图复刻 / enh 重实现）
 * 点击打开同步面板：立即同步 + 冲突处置 + 被拒清单
 */
export default function SyncStatusIndicator() {
  const { online, syncing, pending, conflicts, lastSyncAt, lastError, syncNow } = useSync();
  const [open, setOpen] = useState(false);

  const dot = !online
    ? 'bg-gray-400'
    : syncing
      ? 'bg-amber-400 animate-pulse'
      : conflicts.length > 0
        ? 'bg-red-500'
        : pending > 0
          ? 'bg-amber-500'
          : 'bg-green-500';

  const label = !online
    ? '离线'
    : syncing
      ? '同步中…'
      : conflicts.length > 0
        ? `冲突 ${conflicts.length}`
        : pending > 0
          ? `待同步 ${pending}`
          : '已同步';

  const title = lastError
    ? `同步异常：${lastError}`
    : lastSyncAt
      ? `最近同步 ${new Date(lastSyncAt).toLocaleString('zh-CN')}`
      : '尚未同步';

  return (
    <>
      <button
        type="button"
        title={title}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </button>
      {open && <SyncConflictDialog onClose={() => setOpen(false)} onSyncNow={syncNow} />}
    </>
  );
}
