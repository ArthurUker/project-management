// Real-browser IndexedDB and product Tasks harness. Authentication transport is
// synthetic HTTP; this file never represents backend/JWT/target acceptance.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../auth/AuthProvider';
import { useAuth } from '../../auth/useAuth';
import { tokenStore } from '../../auth/tokenStore';
import { SyncProvider } from '../SyncProvider';
import * as engine from '../engine';
import { idb, type OfflineOwner } from '../idb';
import Tasks from '../../pages/Tasks';

const permissions = ['tasks.view', 'projects.view', 'reports.view'];
let auth: ReturnType<typeof useAuth>;
const waiters = new Set<() => void>();
function wait(check: () => boolean) { if (check()) return Promise.resolve(); return new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(() => { waiters.delete(test); reject(new Error('HARNESS_DEADLINE')); }, 10000);
  function test() { if (check()) { window.clearTimeout(timer); waiters.delete(test); resolve(); } }
  waiters.add(test);
}); }
function owner(): OfflineOwner {
  const snapshot = tokenStore.snapshot(); if (!snapshot?.actorId) throw new Error('NO_TEST_OWNER');
  return { userId: snapshot.actorId, loginGeneration: snapshot.loginGeneration };
}
function store() { return idb.forOwner(owner()); }
const sent: Array<{ actorId: string; mutationIds: string[] }> = [];
let pullGate: { entered: Promise<void>; enter: () => void; released: Promise<void>; release: () => void } | null = null;
function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }
function response(actor: string) {
  return { serverTime: new Date().toISOString(), cursor: `cursor-${actor}`, full: true,
    acl: { projectIds: ['shared-project'], permissions, aclVersion: `acl-${actor}` }, entities: ['tasks'],
    changes: { tasks: { upserts: [{ id: `task-${actor}`, projectId: 'shared-project', title: `VISIBLE-${actor}`, status: 'NOT_STARTED', priority: '中', updatedAt: '2026-10-06T00:00:00.000Z' }], tombstones: [] } } };
}
engine.__setSyncTransport({
  init: async () => { const actor = owner().userId; const gate = pullGate;
    if (gate) { gate.enter(); await gate.released; if (pullGate === gate) pullGate = null; }
    return response(actor); },
  push: async (body) => { sent.push({ actorId: owner().userId, mutationIds: body.changes.map((c) => c.clientMutationId) });
    return { serverTime: new Date().toISOString(), conflictCount: 0, results: body.changes.map((c) => ({ ...c, status: 'applied' as const })) }; },
});
function network(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}
async function sync() {
  let observed = false;
  const finished = new Promise<void>((resolve) => { const off = engine.subscribe((state) => {
    if (state.syncing) observed = true;
    if (observed && !state.syncing) { queueMicrotask(() => { off(); resolve(); }); }
  }); });
  network(true); await finished; network(false);
  if (engine.getState().lastError) throw new Error(engine.getState().lastError!);
}
async function raw(storeName: string) {
  return new Promise<unknown[]>((resolve, reject) => { const req = indexedDB.open('rdpms-offline');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction(storeName, 'readonly'); const get = tx.objectStore(storeName).getAll();
      tx.oncomplete = () => { db.close(); resolve(get.result); }; tx.onabort = () => { db.close(); reject(tx.error); }; };
    req.onerror = () => reject(req.error); });
}
function Screen() {
  auth = useAuth();
  useEffect(() => { waiters.forEach((fn) => fn()); }, [auth.status, auth.user]);
  return <><output id="actor">{auth.status}:{auth.user?.id ?? ''}</output><Tasks /></>;
}
const bridge = {
  async login(actor: string) { network(false); await auth.login(actor, 'synthetic'); await wait(() => auth.user?.id === actor);
    await engine.start(actor, permissions); return owner(); },
  async logout() { await auth.logout(); await wait(() => !auth.user); await engine.resetOnLogout(); },
  async waitActor(actor: string | null) { await wait(() => (auth.user?.id ?? null) === actor); },
  async enqueue(key: string, value = 'synthetic-last-copy') { await engine.enqueueChange({ clientMutationId: key, entity: 'tasks', op: 'upsert', id: 'synthetic-task', data: { title: value, projectId: 'shared-project' }, baseUpdatedAt: '2026-10-06T00:00:00.000Z' }); },
  rows: () => store().outboxAll(), cache: () => engine.readCachedRecords('tasks'), sync, network, raw,
  state: () => ({ status: auth.status, actor: auth.user?.id ?? null, generation: tokenStore.snapshot()?.loginGeneration, engine: engine.getState(), deviceId: engine.getDeviceId(), page: document.body.innerText }),
  async staleRead(old: OfflineOwner) { try { await idb.forOwner(old).outboxAll(); return 'UNSAFE_SUCCESS'; } catch (e) { return (e as Error).message; } },
  async staleWrite(old: OfflineOwner) { try { await idb.forOwner(old).recordsPutMany([{ key: 'tasks:late', entity: 'tasks', id: 'late', projectId: 'shared-project', data: { title: 'LATE-A' } }]); return 'UNSAFE_SUCCESS'; } catch (e) { return (e as Error).message; } },
  async staleLogout(old: OfflineOwner) { await idb.deactivateOwner(old); },
  pause: engine.pauseForBootstrap,
  async resume() { await engine.start(owner().userId, permissions); },
  async expireCache() { const o = owner(); const key = `rdpms.sync.acl:${o.userId}`; const acl = await store().kvGet<Record<string, unknown>>(key); await store().kvSet(key, { ...acl, observedAt: Date.now() - 300001 }); },
  async holdPull() { const entered = deferred(); const released = deferred(); pullGate = { entered: entered.promise, enter: entered.resolve, released: released.promise, release: released.resolve }; },
  async beginHeldSync() { network(true); },
  async waitPull() { await pullGate?.entered; },
  releasePull() { pullGate?.release(); },
  async seedLegacy() { await new Promise<void>((resolve, reject) => { const req = indexedDB.open('rdpms-offline', 2);
    req.onupgradeneeded = () => { const db = req.result; db.createObjectStore('kv'); db.createObjectStore('records', { keyPath: 'key' }); db.createObjectStore('outbox', { keyPath: 'clientMutationId' }); db.createObjectStore('deadLetters', { keyPath: 'key' }); };
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').put({ clientMutationId: 'legacy-unknown', entity: 'tasks', op: 'upsert', id: 'old-task', data: { title: 'unknown-last-copy' }, createdAt: '2026-10-05' });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); }; };
    req.onerror = () => reject(req.error); }); },
  sent: () => sent,
};
Object.assign(window, { bridge });
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><SyncProvider><Screen /></SyncProvider></AuthProvider></BrowserRouter>);
window.dispatchEvent(new Event('rdpms-harness-ready'));
