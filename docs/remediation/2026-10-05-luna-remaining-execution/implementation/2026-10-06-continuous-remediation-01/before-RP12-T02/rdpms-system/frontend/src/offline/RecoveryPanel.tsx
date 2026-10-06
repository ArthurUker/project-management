import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { tokenStore } from '../auth/tokenStore';
import { toMessage } from '../api/error';
import * as engine from './engine';
import type { RecoveryItem } from './engine';

/** Current-owner originals only; server snapshots and unproved legacy bodies are never rendered. */
export default function RecoveryPanel() {
  const { user, status, permissions } = useAuth();
  const [items, setItems] = useState<RecoveryItem[]>([]);
  const [hidden, setHidden] = useState(0); const [quarantine, setQuarantine] = useState(0);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const generation = tokenStore.snapshot()?.loginGeneration;
  const load = useCallback(async () => {
    const owner = tokenStore.snapshot(); if (!owner || !user || owner.actorId !== user.id || status !== 'authenticated') return;
    try { const result = await engine.loadRecovery(); if (!tokenStore.sameLogin(owner)) return;
      setItems(result.items); setHidden(result.hidden); setQuarantine(result.quarantine); setNotice('');
    } catch (error) { if (tokenStore.sameLogin(owner)) { setItems([]); setOpened(null); setNotice(toMessage(error, '当前无法验证权限；原文仍保留')); } }
  }, [user?.id, status, generation, permissions]);
  useEffect(() => { setItems([]); setOpened(null); setHidden(0); setQuarantine(0); void load();
    // Bound the display lease as well as the storage read lease.
    const timer = window.setInterval(() => { setItems([]); setOpened(null); void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const act = async (item: RecoveryItem, action: 'export' | 'retry' | 'local' | 'discard') => {
    const owner = tokenStore.snapshot(); if (!owner) return;
    if (action === 'discard' && !window.confirm('确认放弃这条未提交的原文？删除后不可恢复。请先导出需要保留的内容。')) return;
    setBusy(true);
    try {
      if (action === 'export') {
        const text = await engine.exportRecovery(item.kind, item.key); if (!tokenStore.sameLogin(owner)) return;
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `rdpms-draft-${item.key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
        link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (action === 'retry') await engine.retryRejection(item.key);
      else if (action === 'local') await engine.resolveConflict(item.key, 'local');
      else await engine.discardRecovery(item.kind, item.key, true);
      if (!tokenStore.sameLogin(owner)) return;
      setOpened(null); await load(); setNotice(action === 'export' ? '已导出原始内容；本地副本仍保留' : '操作已持久保存；入队不表示服务端已接受');
    } catch (error) { if (tokenStore.sameLogin(owner)) setNotice(toMessage(error, '操作未完成；请重新核对，原文仍保留')); }
    finally { if (tokenStore.sameLogin(owner)) setBusy(false); }
  };
  if (status !== 'authenticated' || !user) return <p>身份尚未确认；待提交内容仍保留。</p>;
  return <section aria-label="草稿恢复" data-testid="recovery-panel">
    <h4>待提交原文恢复</h4>
    <p>以下内容仅属于当前账号。重新入队不代表保存成功；退出、切号和网络失败不会自动清除原文。</p>
    <button type="button" onClick={() => void load()} disabled={busy}>重新核对权限与草稿</button>
    {notice && <p role="status">{notice}</p>}
    {hidden > 0 && <p>另有 {hidden} 条已保全内容，当前项目权限不允许查看或恢复。</p>}
    {quarantine > 0 && <p>有 {quarantine} 条旧记录缺少可靠账号归属，已隔离保全。不能按当前登录账号认领、导出或删除。</p>}
    <ul>{items.map((item) => <li key={`${item.kind}:${item.key}`} data-recovery-key={item.key}>
      <span>{item.kind === 'conflict' ? '冲突' : item.kind === 'rejected' ? '被拒绝' : '待同步'} · {item.entity} · {item.id} {item.reason}</span>
      <button type="button" onClick={() => setOpened(opened === item.key ? null : item.key)}>查看原文</button>
      <button type="button" disabled={busy} onClick={() => void act(item, 'export')}>导出原文</button>
      {item.kind === 'rejected' && <button type="button" disabled={busy} onClick={() => void act(item, 'retry')}>按原操作重试</button>}
      {item.kind === 'conflict' && <button type="button" disabled={busy} onClick={() => void act(item, 'local')}>保留本地并创建新操作</button>}
      <button type="button" disabled={busy} onClick={() => void act(item, 'discard')}>{item.kind === 'conflict' ? '放弃本地，采用服务端' : '放弃此条原文'}</button>
      {opened === item.key && <div><h5>本地原文</h5><pre>{JSON.stringify(item.payload ?? {}, null, 2)}</pre>{item.kind === 'conflict' && <><h5>当前获准服务端快照</h5>{item.server ? <pre>{JSON.stringify(item.server, null, 2)}</pre> : <p>尚未取得当前快照；不会展示历史服务端内容。</p>}</>}</div>}
    </li>)}</ul>
    {items.length === 0 && <p>当前没有可查看的待提交原文。</p>}
  </section>;
}
