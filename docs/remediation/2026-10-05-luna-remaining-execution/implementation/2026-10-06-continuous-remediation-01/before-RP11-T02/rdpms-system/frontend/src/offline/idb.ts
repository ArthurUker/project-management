import { tokenStore } from '../auth/tokenStore';

const DB_NAME = 'rdpms-offline';
const DB_VERSION = 3;
const OWNED = { kv: 'ownerKv', records: 'ownerRecords', outbox: 'ownerOutbox', deadLetters: 'ownerDeadLetters' } as const;
export interface OfflineOwner { userId: string; loginGeneration: string }
export interface OutboxRecord {
  clientMutationId: string; entity: string; op: 'upsert' | 'delete'; id: string;
  data?: Record<string, unknown>; baseUpdatedAt?: string; createdAt: string; userId?: string;
}
export interface RecordRow {
  key: string; entity: string; id: string; projectId?: string | null;
  data: Record<string, unknown>; updatedAt?: string;
}
export function ownerIsCurrent(owner: OfflineOwner): boolean {
  const current = tokenStore.snapshot();
  return current?.actorId === owner.userId && current.loginGeneration === owner.loginGeneration;
}
function assertOwner(owner: OfflineOwner) {
  if (!owner.userId || !owner.loginGeneration || !ownerIsCurrent(owner)) throw new Error('OFFLINE_SESSION_CHANGED');
}
let dbPromise: Promise<IDBDatabase> | null = null;
async function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    const promise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('当前环境不支持 IndexedDB')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      let blocked = false;
      req.onblocked = () => { blocked = true; reject(new Error('OFFLINE_UPGRADE_BLOCKED')); };
      req.onupgradeneeded = () => {
        const db = req.result;
        // Original stores remain intact. They are never attributed to the next login.
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'clientMutationId' });
        if (!db.objectStoreNames.contains('deadLetters')) db.createObjectStore('deadLetters', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('ownerMeta')) db.createObjectStore('ownerMeta');
        if (!db.objectStoreNames.contains(OWNED.kv)) db.createObjectStore(OWNED.kv, { keyPath: ['ownerId', 'key'] });
        if (!db.objectStoreNames.contains(OWNED.records)) db.createObjectStore(OWNED.records, { keyPath: ['ownerId', 'key'] });
        if (!db.objectStoreNames.contains(OWNED.outbox)) db.createObjectStore(OWNED.outbox, { keyPath: ['userId', 'clientMutationId'] });
        if (!db.objectStoreNames.contains(OWNED.deadLetters)) db.createObjectStore(OWNED.deadLetters, { keyPath: ['userId', 'key'] });
      };
      req.onsuccess = () => {
        const db = req.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); dbPromise = null; window.dispatchEvent(new Event('rdpms-offline-versionchange')); };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
    });
    dbPromise = promise;
    void promise.catch(() => { if (dbPromise === promise) dbPromise = null; });
  }
  return dbPromise;
}
function completed<T>(tx: IDBTransaction, value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(value());
    tx.onerror = () => reject(tx.error ?? new Error('OFFLINE_TRANSACTION_ERROR'));
    tx.onabort = () => reject(tx.error ?? new Error('OFFLINE_TRANSACTION_ABORTED'));
  });
}
async function activateOwner(owner: OfflineOwner): Promise<void> {
  assertOwner(owner); const db = await openDb(); assertOwner(owner);
  const tx = db.transaction('ownerMeta', 'readwrite'); const done = completed(tx, () => undefined);
  tx.objectStore('ownerMeta').put(owner, 'activeSession'); await done; assertOwner(owner);
}
async function deactivateOwner(owner: OfflineOwner): Promise<void> {
  const db = await openDb(); const tx = db.transaction('ownerMeta', 'readwrite'); const done = completed(tx, () => undefined);
  const s = tx.objectStore('ownerMeta'); const req = s.get('activeSession');
  req.onsuccess = () => { const active = req.result as OfflineOwner | undefined;
    if (active?.userId === owner.userId && active.loginGeneration === owner.loginGeneration && !ownerIsCurrent(owner)) s.delete('activeSession'); };
  await done;
}
// The meta store serializes session activation with every data operation. The
// local token generation is checked again inside its request callback, before writes.
async function transaction<T>(owner: OfflineOwner, names: Array<keyof typeof OWNED>, mode: IDBTransactionMode,
  work: (stores: Record<string, IDBObjectStore>, result: (v: T) => void, tx: IDBTransaction) => void): Promise<T> {
  assertOwner(owner); const db = await openDb(); assertOwner(owner);
  const tx = db.transaction(['ownerMeta', ...new Set(names.map((n) => OWNED[n]))], mode);
  let value: T; let failure: unknown; const done = completed(tx, () => value);
  const meta = tx.objectStore('ownerMeta').get('activeSession');
  meta.onsuccess = () => {
    try {
      assertOwner(owner); const active = meta.result as OfflineOwner | undefined;
      if (active?.userId !== owner.userId || active.loginGeneration !== owner.loginGeneration) throw new Error('OFFLINE_OWNER_FENCE_CHANGED');
      const stores = Object.fromEntries(names.map((n) => [n, tx.objectStore(OWNED[n])]));
      work(stores, (v) => { value = v; }, tx);
    } catch (error) { failure = error; tx.abort(); }
  };
  try { const result = await done; assertOwner(owner); return result; }
  catch (error) { throw failure ?? error; }
}
function request<T>(req: IDBRequest<T>, result: (v: T) => void) { req.onsuccess = () => result(req.result); }
function ownerKey(owner: OfflineOwner, key: string): IDBValidKey { return [owner.userId, key]; }
function ownedRows<T extends { ownerId?: string; userId?: string }>(rows: T[], owner: OfflineOwner) {
  return rows.filter((r) => (r.ownerId ?? r.userId) === owner.userId);
}
function command(row: OutboxRecord) {
  return JSON.stringify([row.clientMutationId, row.entity, row.op, row.id, row.data ?? null, row.baseUpdatedAt ?? null]);
}
function forOwner(owner: OfflineOwner) {
  const fixed = Object.freeze({ ...owner });
  const all = <T extends { ownerId?: string; userId?: string }>(name: keyof typeof OWNED) =>
    transaction<T[]>(fixed, [name], 'readonly', (s, result) => request(s[name].getAll(), (rows: T[]) => result(ownedRows(rows, fixed))));
  const api = {
    kvGet: <T>(key: string) => transaction<T | undefined>(fixed, ['kv'], 'readonly', (s, result) => request(s.kv.get(ownerKey(fixed, key)), (row) => result(row?.value as T | undefined))),
    kvSet: (key: string, value: unknown) => transaction(fixed, ['kv'], 'readwrite', (s, result) => request(s.kv.put({ ownerId: fixed.userId, key, value }), result)),
    kvDelete: (key: string) => transaction(fixed, ['kv'], 'readwrite', (s, result) => request(s.kv.delete(ownerKey(fixed, key)), result)),
    recordsPutMany: (rows: RecordRow[]) => transaction<void>(fixed, ['records'], 'readwrite', (s, result) => { rows.forEach((r) => s.records.put({ ...r, ownerId: fixed.userId })); result(undefined); }),
    recordsDeleteMany: (keys: string[]) => transaction<void>(fixed, ['records'], 'readwrite', (s, result) => { keys.forEach((k) => s.records.delete(ownerKey(fixed, k))); result(undefined); }),
    recordsAll: () => all<RecordRow & { ownerId: string }>('records'),
    recordsClear: () => transaction<void>(fixed, ['records'], 'readwrite', (s, result) => request(s.records.getAll(), (rows) => { ownedRows(rows, fixed).forEach((r) => s.records.delete([fixed.userId, r.key])); result(undefined); })),
    outboxPut: (row: OutboxRecord) => transaction<void>(fixed, ['outbox'], 'readwrite', (s, result, tx) => {
      if (row.userId && row.userId !== fixed.userId) { tx.abort(); return; }
      request(s.outbox.get(ownerKey(fixed, row.clientMutationId)), (prev: OutboxRecord | undefined) => {
        if (prev && command(prev) !== command(row)) { tx.abort(); return; }
        s.outbox.put({ ...row, userId: fixed.userId }); result(undefined);
      });
    }),
    outboxAll: () => all<OutboxRecord>('outbox'),
    outboxDelete: (key: string) => transaction(fixed, ['outbox'], 'readwrite', (s, result) => request(s.outbox.delete(ownerKey(fixed, key)), result)),
    deadLetterMove: (record: { key: string; clientMutationId: string; userId: string },
      merge?: (existing: { key: string } | undefined) => { key: string; clientMutationId: string; userId: string }) =>
      transaction<void>(fixed, ['deadLetters', 'outbox'], 'readwrite', (s, result, tx) => {
        if (record.userId !== fixed.userId) { tx.abort(); return; }
        request(s.deadLetters.get(ownerKey(fixed, record.key)), (existing) => {
          try { const final = merge ? merge(existing) : record;
            if (final.userId !== fixed.userId || final.key !== record.key || final.clientMutationId !== record.clientMutationId) throw new Error('OFFLINE_INVALID_MOVE');
            s.deadLetters.put(final); s.outbox.delete(ownerKey(fixed, record.clientMutationId)); result(undefined);
          } catch { tx.abort(); }
        });
      }),
    deadLettersForUser: (userId: string) => { if (userId !== fixed.userId) return Promise.reject(new Error('OFFLINE_OWNER_MISMATCH')); return all<{ key: string; userId: string }>('deadLetters'); },
    deadLetterDelete: (key: string) => transaction(fixed, ['deadLetters'], 'readwrite', (s, result) => request(s.deadLetters.delete(ownerKey(fixed, key)), result)),
    deadLettersClearForUser: (userId: string) => { if (userId !== fixed.userId) return Promise.reject(new Error('OFFLINE_OWNER_MISMATCH'));
      return transaction<void>(fixed, ['deadLetters'], 'readwrite', (s, result) => request(s.deadLetters.getAll(), (rows) => { ownedRows(rows, fixed).forEach((r) => s.deadLetters.delete(ownerKey(fixed, r.key))); result(undefined); })); },
  };
  return api;
}
export type OwnedIdb = ReturnType<typeof forOwner>;
export const idb = { activateOwner, deactivateOwner, forOwner };
