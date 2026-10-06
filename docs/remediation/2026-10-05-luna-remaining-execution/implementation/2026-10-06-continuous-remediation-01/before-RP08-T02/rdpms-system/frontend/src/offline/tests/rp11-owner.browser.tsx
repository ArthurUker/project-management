// Real-browser IndexedDB and product Tasks harness. Authentication transport is
// synthetic HTTP; this file never represents backend/JWT/target acceptance.
import { useEffect, useState } from 'react';
import SyncConflictDialog from '../../components/SyncConflictDialog';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../auth/AuthProvider';
import { useAuth } from '../../auth/useAuth';
import { tokenStore } from '../../auth/tokenStore';
import { SyncProvider } from '../SyncProvider';
import * as engine from '../engine';
import { idb, type OfflineOwner } from '../idb';
import Tasks from '../../pages/Tasks';

const permissions = ['tasks.view', 'projects.view', 'reports.view', 'tasks.update', 'tasks.update_status'];
let auth: ReturnType<typeof useAuth>;
let openPanel: (value: boolean) => void;
let savedConflict: import('../idb').OutboxRecord | null = null;
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
const sent: Array<{ actorId: string; mutationIds: string[]; bytes: number }> = [];
let pushMode = 'normal';
let pushCall = 0;
let heldPush: ReturnType<typeof deferred> | null = null;
let enteredPush: ReturnType<typeof deferred> | null = null;
let pullGate: { entered: Promise<void>; enter: () => void; released: Promise<void>; release: () => void } | null = null;
function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }
function response(actor: string) {
  return { serverTime: new Date().toISOString(), cursor: `cursor-${actor}`, full: true,
    acl: { projectIds: ['shared-project'], permissions, aclVersion: `acl-${actor}` }, entities: ['tasks'],
    changes: { tasks: { upserts: [{ id: `task-${actor}`, projectId: 'shared-project', title: `VISIBLE-${actor}`, status: 'NOT_STARTED', priority: '中', updatedAt: '2026-10-06T00:00:00.000Z' }], tombstones: [] } } };
}
const nativeBackend = Boolean((window as unknown as { nativeBackend?: boolean }).nativeBackend);
const reserveCalls: Array<{ actorId: string; keys: string[] }> = []; const queryCalls: Array<{ actorId: string; keys: string[] }> = [];
const receipts = new Map<string, { actorId: string; deviceId: string; command: import('../../api').SyncChange; response: import('../../api').SyncPushResult | null; handle: string; expiresAt: string }>();
// The synthetic server oracle persists across page reload, separately from product IDB.
if (!nativeBackend) { for (const [key, value] of JSON.parse(localStorage.getItem('owned.test.receipt-oracle') ?? '[]')) receipts.set(key, value); }
function persistOracle() { localStorage.setItem('owned.test.receipt-oracle', JSON.stringify([...receipts])); }
if (!nativeBackend) engine.__setSyncTransport({
  reserve: async (body) => { reserveCalls.push({ actorId: owner().userId, keys: body.changes.map(c => c.clientMutationId) }); const response = { protocolVersion: 1 as const, results: body.changes.map((change) => {
    let receipt = receipts.get(change.clientMutationId);
    if (!receipt) { receipt = { actorId: owner().userId, deviceId: body.deviceId, command: structuredClone(change), response: null, handle: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86400000).toISOString() }; receipts.set(change.clientMutationId, receipt); }
    return { ...change, status: receipt.response?.status ?? 'pending', receiptHandle: receipt.handle, payloadHash: receipt.command.payloadHash, expiresAt: receipt.expiresAt };
  }) }; persistOracle(); if (pushMode === 'reserve-loss') throw new Error('SYNTHETIC_RESERVE_COMMITTED_RESPONSE_LOST'); return response; },
  query: async (body) => { queryCalls.push({ actorId: owner().userId, keys: body.changes.map(c => c.clientMutationId) }); return { protocolVersion: 1 as const, results: body.changes.map((change) => {
    const receipt = receipts.get(change.clientMutationId);
    if (!receipt || receipt.actorId !== owner().userId || receipt.deviceId !== body.deviceId || receipt.command.payloadHash !== change.payloadHash || receipt.handle !== change.receiptHandle || pushMode === 'query-unknown' || ['missing', 'duplicate', 'unknown'].includes(pushMode)) return { ...change, status: 'unknown' as const };
    if (pushMode === 'expired') return { ...change, status: 'expired' as const };
    return { ...change, status: receipt.response?.status ?? 'pending', receiptHandle: receipt.handle, payloadHash: receipt.command.payloadHash, expiresAt: receipt.expiresAt, result: receipt.response };
  }) }; },
  init: async () => { const actor = owner().userId; const gate = pullGate;
    if (gate) { gate.enter(); await gate.released; if (pullGate === gate) pullGate = null; }
    return response(actor); },
  push: async (body) => {
    pushCall++; sent.push({ actorId: owner().userId, mutationIds: body.changes.map((c) => c.clientMutationId), bytes: new TextEncoder().encode(JSON.stringify({ protocolVersion: 1, ...body })).byteLength });
    if (pushMode === 'fail-second' && pushCall === 2) throw new Error('OWNED_BATCH_SECOND_RESPONSE_LOST');
    if (pushMode === 'hold-once' && pushCall === 1) { enteredPush?.resolve(); await heldPush?.promise; }
    const results = body.changes.map((c) => ({ ...c, status: pushMode === 'reject-parent' ? 'rejected' as const : 'applied' as const }));
    for (const result of results) { const receipt = receipts.get(result.clientMutationId); if (receipt) receipt.response = structuredClone(result); }
    persistOracle();
    if (pushMode === 'commit-loss' || pushMode === 'query-unknown' || pushMode === 'expired') throw new Error('SYNTHETIC_PUSH_COMMITTED_RESPONSE_LOST');
    if (pushMode === 'missing') results.pop();
    if (pushMode === 'duplicate' && results.length) results.push(results[0]);
    if (pushMode === 'bad-hash' && results.length) results[0] = { ...results[0], payloadHash: '0'.repeat(64) };
    if (pushMode === 'bad-handle' && results.length) results[0] = { ...results[0], receiptHandle: 'not-original' };
    if (pushMode === 'bad-status' && results.length) results[0] = { ...results[0], status: 'fabricated' as 'applied' };
    if (pushMode === 'unknown' && results.length) results[0] = { ...results[0], clientMutationId: 'not-submitted' };
    return { serverTime: new Date().toISOString(), conflictCount: 0, results };
  },
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
  const [panel, setPanel] = useState(false); openPanel = setPanel;
  useEffect(() => { waiters.forEach((fn) => fn()); }, [auth.status, auth.user]);
  return <><output id="actor">{auth.status}:{auth.user?.id ?? ''}</output><Tasks />{panel && <SyncConflictDialog onClose={() => setPanel(false)} onSyncNow={() => void engine.syncNow()} />}</>;
}
let oldConnection: IDBDatabase | null = null;
let nativePut: typeof IDBObjectStore.prototype.put | null = null;
async function seedFixture(version: number, count: number) {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('rdpms-offline', version);
    req.onupgradeneeded = () => {
      const db = req.result; db.createObjectStore('kv'); db.createObjectStore('records', { keyPath: 'key' });
      db.createObjectStore('outbox', { keyPath: 'clientMutationId' });
      if (version >= 2) db.createObjectStore('deadLetters', { keyPath: 'key' });
    };
    req.onsuccess = () => { const db = req.result; const stores = [...db.objectStoreNames]; const tx = db.transaction(stores, 'readwrite');
      for (let i = 0; i < count; i++) tx.objectStore('outbox').put({ clientMutationId: `old-${i}`, entity: 'tasks', op: 'upsert', id: `task-${i}`,
        ...(i % 3 === 1 ? { userId: 'A' } : i % 3 === 2 ? { userId: 'B' } : {}), data: { title: `LAST-COPY-${i}`, projectId: 'shared-project' }, createdAt: '2026-10-05' });
      tx.objectStore('records').put({ key: 'tasks:legacy-cache', entity: 'tasks', id: 'legacy-cache', data: { title: 'UNOWNED-CACHE' } });
      tx.objectStore('kv').put({ userId: 'A', records: [{ id: 'missing-project', description: 'A-PENDING-LAST-COPY' }] }, 'rdpms.pendingDraft:A');
      if (version >= 2) {
        tx.objectStore('deadLetters').put({ key: 'A:old-rejected', userId: 'A', clientMutationId: 'old-rejected', code: 'PERMISSION_DENIED', payload: { title: 'A-REJECTED-LAST-COPY' } });
        tx.objectStore('deadLetters').put({ key: 'B:guessed', userId: 'B', clientMutationId: 'guessed', code: 'LOGOUT_UNSYNCED', payload: { title: 'UNPROVEN-LAST-COPY' } });
      }
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
    }; req.onerror = () => reject(req.error);
  });
}
const bridge = {
  panel: (value: boolean) => openPanel(value),
  recovery: engine.loadRecovery,
  exportRecovery: engine.exportRecovery,
  discardRecovery: engine.discardRecovery,
  resolveConflict: engine.resolveConflict,
  retryRejection: engine.retryRejection,
  async directConflict(key: string, serverText = 'server-synthetic') { const o = owner(); const pending = (await store().outboxAll()).find((r) => r.clientMutationId === key); if (!pending) throw new Error('NO_PENDING'); savedConflict = pending;
    await store().conflictMove(pending, `rdpms.sync.conflicts:${o.userId}`, { clientMutationId: key, change: pending, entity: pending.entity, op: pending.op, id: pending.id, detectedAt: new Date().toISOString(), server: { updatedAt: '2026-10-06T01:00:00.000Z', content: serverText } } as Parameters<ReturnType<typeof idb.forOwner>['conflictMove']>[2]); },
  async replayConflict() { if (!savedConflict) throw new Error('NO_SAVED_CONFLICT'); await store().conflictMove(savedConflict, `rdpms.sync.conflicts:${owner().userId}`, { clientMutationId: savedConflict.clientMutationId, change: savedConflict }); },
  async conflictRows() { return store().kvGet(`rdpms.sync.conflicts:${owner().userId}`); },
  async actions() { return (await raw('ownerKv') as Array<{ key: string; ownerId: string; value: unknown }>).filter((r) => r.ownerId === owner().userId && r.key.startsWith('rdpms.recovery.action:')).map((r) => r.value); },
  abortNextStore(name: string) { nativePut = IDBObjectStore.prototype.put; let armed = true; IDBObjectStore.prototype.put = function(...args) { const req = nativePut!.apply(this, args); if (armed && this.name === name) { armed = false; this.transaction.abort(); } return req; }; },
  async directRejected(key: string) { const o = owner(); const row = (await store().outboxAll()).find((r) => r.clientMutationId === key); if (!row) throw new Error('NO_PENDING');
    await store().deadLetterMove({ key: `${o.userId}:${key}`, userId: o.userId, clientMutationId: key, entity: row.entity, op: row.op, id: row.id, projectId: 'shared-project', payload: row.data, original: structuredClone(row), baseUpdatedAt: row.baseUpdatedAt, reason: 'Synthetic rejected', firstRejectedAt: new Date().toISOString(), lastRejectedAt: new Date().toISOString(), attempts: 1 } as Parameters<ReturnType<typeof idb.forOwner>['deadLetterMove']>[0]); },
  seedFixture,
  async holdLegacy() { oldConnection = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('rdpms-offline'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); return oldConnection.version; },
  async oldState() { const db = oldConnection; if (!db) throw new Error('NO_OLD_CONNECTION'); return new Promise((resolve, reject) => { const tx = db.transaction('outbox', 'readonly'); const req = tx.objectStore('outbox').getAll(); tx.oncomplete = () => resolve({ version: db.version, rows: req.result }); tx.onabort = () => reject(tx.error); }); },
  closeLegacy() { oldConnection?.close(); oldConnection = null; },
  async schema() { return new Promise((resolve, reject) => { const req = indexedDB.open('rdpms-offline'); req.onsuccess = () => { const db = req.result; const state = { version: db.version, stores: [...db.objectStoreNames] }; db.close(); resolve(state); }; req.onerror = () => reject(req.error); }); },
  abortUpgrade() { nativePut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { const req = nativePut!.apply(this, args); if (this.name === 'legacyQuarantine') this.transaction.abort(); return req; }; },
  armCloseUpgrade() { nativePut = IDBObjectStore.prototype.put; let fired = false; IDBObjectStore.prototype.put = function(...args) { const req = nativePut!.apply(this, args); if (!fired && this.name === 'legacyQuarantine') { fired = true; (window as unknown as { notifyUpgrade: (text: string) => void }).notifyUpgrade('NATIVE_UPGRADE_COPY_STARTED'); } return req; }; },
  restoreNativePut() { if (nativePut) IDBObjectStore.prototype.put = nativePut; nativePut = null; },
  async loginNative(username: string, password: string, actorId: string) { network(false); await auth.login(username, password); await wait(() => auth.user?.id === actorId); await engine.start(actorId, auth.user?.permissions ?? []); return owner(); },
  enqueueNative: engine.enqueueChange,
  async manualSync() { Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); await engine.syncNow(true); network(false); },
  reserveCalls: () => reserveCalls, queryCalls: () => queryCalls,
  async setRecovery(key: string, status: 'unknown' | 'expired') { const row = (await store().outboxAll()).find(r => r.clientMutationId === key)!; await store().outboxTransport(row, { recoveryStatus: status }); },
  async nativeSyncStart() { network(true); },
  async syncExpectRetained() { try { await sync(); } catch { return engine.getState().lastError; } return null; },
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
  async resume() { await engine.start(owner().userId, nativeBackend ? auth.user?.permissions ?? [] : permissions); },
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
  pushMode(mode: string) { pushMode = mode; pushCall = 0; if (mode === 'hold-once') { heldPush = deferred(); enteredPush = deferred(); } },
  waitPush: () => enteredPush?.promise, releasePush: () => heldPush?.resolve(),
  async seedBatch(count: number, content = 'small', origin: 'fresh-v1' | 'legacy-unverified' = 'fresh-v1') {
    for (let i = 0; i < count; i++) await store().outboxPut({ clientMutationId: `batch-${i}`, entity: 'tasks', op: 'upsert', id: `task-${i}`, projectId: 'shared-project', data: { title: content }, userId: owner().userId, origin, createdAt: new Date().toISOString() });
  },
  async batchPlan() { return engine.planSyncBatch(await store().outboxAll(), engine.getDeviceId()); },
  async awaitSyncEnd() { if (!engine.getState().syncing) return; await new Promise<void>((resolve) => { const off = engine.subscribe((s) => { if (!s.syncing) queueMicrotask(() => { off(); resolve(); }); }); }); network(false); },
  async queueExplicit(key: string, id: string, dependsOn: string[] = []) { await engine.enqueueChange({ clientMutationId: key, entity: 'tasks', op: 'upsert', id, projectId: 'shared-project', data: { title: key }, dependsOn }); },
};
Object.assign(window, { bridge });
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><SyncProvider><Screen /></SyncProvider></AuthProvider></BrowserRouter>);
window.dispatchEvent(new Event('rdpms-harness-ready'));
