import { useSync } from '../offline/SyncProvider';

/**
 * 离线横幅（Tencent 意图复刻 / enh 重实现）：断网时提示本地暂存与自动同步
 */
export default function OfflineBanner() {
  const { online, pending, conflicts } = useSync();
  if (online) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
      当前处于离线模式，数据将暂存本地并在联网后自动同步
      {pending > 0 ? `（${pending} 条待同步）` : ''}
      {conflicts.length > 0 ? `，另有 ${conflicts.length} 条冲突待处理` : ''}。
    </div>
  );
}
