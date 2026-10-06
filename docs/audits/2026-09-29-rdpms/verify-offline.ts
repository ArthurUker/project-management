// Bundle with the disposable frontend's esbuild. Uses fake-indexeddb, not a browser/real account.
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { idb } from './src/offline/idb';
import * as engine from './src/offline/engine';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
}, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false, userAgent: 'audit', platform: 'audit' }, configurable: true });
Object.defineProperty(globalThis, 'window', { value: {
  addEventListener() {}, removeEventListener() {}, setInterval() { return 1; }, clearInterval() {},
}, configurable: true });
const results: any[] = [];
const emptyPull = () => ({ serverTime: new Date().toISOString(), cursor: new Date().toISOString(), full: false,
  acl: { projectIds: ['shared-project'], permissions: [], aclVersion: 'shared-acl' }, entities: [], changes: {} });
async function probe(id: string, fn: () => Promise<unknown>) {
  try { results.push({ id, defectReproduced: true, evidence: await fn() }); }
  catch (e) { results.push({ id, defectReproduced: false, error: String(e) }); }
}
async function offlineStart(uid: string) {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  await engine.hydrate(); // Ensure the previous probe's online state cannot start an unintended sync.
  await engine.start(uid); await engine.hydrate();
}
async function online() {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  await engine.hydrate();
}

await probe('F01_BOOTSTRAP_ERASES_USER_OUTBOX', async () => {
  await idb.outboxPut({ clientMutationId: 'cold-draft', entity: 'reports', id: 'r1', op: 'upsert', data: { content: { text: 'unsynced-draft' } }, userId: 'user-a', createdAt: new Date().toISOString() });
  await engine.resetOnLogout(); // SyncProvider's first effect sees user=null while AuthProvider is bootstrapping.
  const outbox = await idb.outboxAll(); const recovered = await idb.deadLettersForUser('user-a');
  assert.equal(outbox.length, 0); assert.equal(recovered.length, 0);
  return { outboxBefore: 1, outboxAfter: outbox.length, userDeadLettersAfter: recovered.length,
    trigger: 'fresh module state currentUserId=null; SyncProvider initial user=null effect' };
});

await probe('F02_CONFLICT_DELETED_BEFORE_PERSISTENCE', async () => {
  await offlineStart('user-a');
  await engine.enqueueChange({ clientMutationId: 'conflict-draft', entity: 'reports', id: 'r2', op: 'upsert', data: { content: { text: 'draft-content' } } });
  engine.__setSyncTransport({ init: async () => emptyPull() as any,
    push: async () => ({ serverTime: new Date().toISOString(), conflictCount: 1, results: [{ clientMutationId: 'conflict-draft', entity: 'reports', id: 'r2', op: 'upsert', status: 'conflict', server: {} }] }) as any });
  const saved = idb.kvSet;
  idb.kvSet = async (key, value) => { if (key.startsWith('rdpms.sync.conflicts')) throw new Error('AUDIT_INJECTED_CONFLICT_STORAGE_FAILURE'); return saved(key, value); };
  await online(); await engine.syncNow(); idb.kvSet = saved;
  assert.equal((await idb.outboxAll()).length, 0);
  assert.equal(await idb.kvGet('rdpms.sync.conflicts:user-a'), undefined);
  assert.match(engine.getState().lastError ?? '', /AUDIT_INJECTED/);
  return { outboxAfter: 0, persistedConflicts: 0, lastError: engine.getState().lastError };
});

await probe('F03_RECORD_CACHE_NOT_SCOPED_BY_ACCOUNT', async () => {
  await idb.recordsPutMany([{ key: 'reports:private-a', entity: 'reports', id: 'private-a', projectId: 'shared-project', data: { authorId: 'user-a', content: { text: 'a-draft' } } }]);
  await offlineStart('user-b'); // Account switch without completed logout clear; supported by start().
  engine.__setSyncTransport({ init: async () => emptyPull() as any, push: async () => ({ serverTime: '', results: [], conflictCount: 0 }) });
  await online(); await engine.syncNow();
  const reports = await engine.readCachedRecords('reports');
  assert(reports.some(x => x.data.authorId === 'user-a'));
  return { currentAccount: 'user-b', cachedAuthorVisibleThroughReadCachedRecords: 'user-a', sharedProjectStillAuthorized: true };
});

await probe('F04_OUTBOX_NOT_CHUNKED_TO_SERVER_LIMIT', async () => {
  await offlineStart('user-b');
  for (let i = 0; i < 501; i++) await idb.outboxPut({ clientMutationId: `batch-${i}`, entity: 'tasks', id: `t-${i}`, op: 'upsert', data: { title: 'draft' }, userId: 'user-b', createdAt: new Date().toISOString() });
  let requestSize = 0;
  engine.__setSyncTransport({ init: async () => emptyPull() as any, push: async body => {
    requestSize = body.changes.length; throw new Error('server limit: 500 changes');
  }});
  await online(); await engine.syncNow();
  assert.equal(requestSize, 501); assert.equal((await idb.outboxAll()).length, 501);
  return { requestSize, serverLimit: 500, queueAfter: 501, lastError: engine.getState().lastError };
});
engine.stop();
const output = { executedAt: new Date().toISOString(), kind: 'real frontend engine with fake-indexeddb and injected transport; no browser rendering',
  summary: { reproduced: results.filter(x => x.defectReproduced).length, notReproduced: results.filter(x => !x.defectReproduced).length }, results };
const root = process.env.RDPMS_AUDIT_ROOT!;
await fs.writeFile(path.join(root, 'offline-results.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.summary.notReproduced) process.exitCode = 1;
