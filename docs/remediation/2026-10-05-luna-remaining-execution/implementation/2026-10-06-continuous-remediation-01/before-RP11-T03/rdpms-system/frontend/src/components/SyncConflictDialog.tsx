import { useState } from 'react';
import { useSync } from '../offline/SyncProvider';
import type { DeadLetterRecord } from '../offline/deadLetter';

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
 *
 * A09 复核修复：被拒绝的变更此前只能看到一行原因 + 「清除」，
 * 用户无法查看、复制或修复自己的草稿（承诺了「内容已保留」却拿不回来）。
 * 现在每条拒绝项都可展开查看完整 payload，并可复制 / 重试 / 显式放弃。
 */
export default function SyncConflictDialog({ onClose, onSyncNow }: { onClose: () => void; onSyncNow: () => void }) {
  const {
    conflicts, rejections, resolveConflict, clearRejections, syncing, lastSyncAt, lastError, pending, deviceId, online,
    getRejectedPayload, retryRejection, dropRejection,
  } = useSync();

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeadLetterRecord | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = async (clientMutationId: string) => {
    if (openId === clientMutationId) {
      setOpenId(null);
      setDetail(undefined);
      return;
    }
    setOpenId(clientMutationId);
    setDetail(await getRejectedPayload(clientMutationId));
  };

  const copyPayload = async (clientMutationId: string) => {
    const record = detail?.clientMutationId === clientMutationId ? detail : await getRejectedPayload(clientMutationId);
    const text = JSON.stringify(record?.payload ?? {}, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setNotice('已复制该条内容到剪贴板');
    } catch {
      setNotice('复制失败：请在展开的内容中手动选择复制');
    }
    setOpenId(clientMutationId);
    setDetail(record);
  };

  const retry = async (clientMutationId: string) => {
    setBusyId(clientMutationId);
    try {
      const ok = await retryRejection(clientMutationId);
      setNotice(ok ? '已重新入队：将按你当前的权限与最新数据版本重试' : '重试失败：该记录已不存在');
      if (ok) {
        setOpenId(null);
        setDetail(undefined);
      }
    } finally {
      setBusyId(null);
    }
  };

  const drop = async (clientMutationId: string) => {
    if (!window.confirm('确认放弃该变更？内容将被删除且不可恢复。')) return;
    setBusyId(clientMutationId);
    try {
      await dropRejection(clientMutationId);
      setNotice('已放弃该变更');
      setOpenId(null);
      setDetail(undefined);
    } finally {
      setBusyId(null);
    }
  };

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
            <p className="mt-1 text-xs text-gray-500">
              这些变更服务端没有接受，<strong>你的原文已保留</strong>（仅本人可见，刷新/重新登录后仍在）。可以查看、复制、重试或显式放弃。
            </p>
            {notice && <p className="mt-2 text-xs text-blue-700">{notice}</p>}
            <ul className="mt-2 space-y-2 text-sm text-gray-700">
              {rejections.map((r) => (
                <li key={r.clientMutationId} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">
                        {ENTITY_LABEL[r.entity] ?? r.entity} · {r.id.slice(0, 8)}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {r.reason ?? '服务端拒绝'}
                        {r.code ? `（${r.code}）` : ''}
                        {r.attempts > 1 ? ` · 已拒绝 ${r.attempts} 次` : ''}
                      </span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button className="underline" onClick={() => void toggle(r.clientMutationId)}>
                        {openId === r.clientMutationId ? '收起' : '查看内容'}
                      </button>
                      <button className="underline" onClick={() => void copyPayload(r.clientMutationId)}>
                        复制
                      </button>
                      <button
                        className="underline text-blue-700 disabled:text-gray-400"
                        disabled={busyId === r.clientMutationId}
                        onClick={() => void retry(r.clientMutationId)}
                      >
                        {busyId === r.clientMutationId ? '重试中…' : '重试'}
                      </button>
                      <button
                        className="underline text-red-600 disabled:text-gray-400"
                        disabled={busyId === r.clientMutationId}
                        onClick={() => void drop(r.clientMutationId)}
                      >
                        放弃
                      </button>
                    </div>
                  </div>
                  {openId === r.clientMutationId && (
                    <div className="mt-2">
                      <pre className="max-h-60 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-800">
                        {JSON.stringify(detail?.payload ?? r.payload ?? {}, null, 2)}
                      </pre>
                      {r.payloadConflict && (
                        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                          同一条变更收到过<strong>不同内容</strong>：上面显示的是最早提交的版本（未被覆盖）。
                          后到的内容如下，可自行复制合并：
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-white/70 p-2">
                            {JSON.stringify(r.payloadConflict.payload ?? {}, null, 2)}
                          </pre>
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-500">
                        首次拒绝：{new Date(r.firstRejectedAt).toLocaleString('zh-CN')} · 最近：
                        {new Date(r.lastRejectedAt).toLocaleString('zh-CN')}
                        {r.baseUpdatedAt ? ` · 基线：${r.baseUpdatedAt}` : ''}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
