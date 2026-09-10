/**
 * offline/idb.ts —— 极简 IndexedDB 封装（离线同步 v2）
 *
 * 只做三件事，避免引入额外依赖：
 *   kv      ：光标 / 设备号 / acl 快照
 *   records ：实体镜像（key = `${entity}:${id}`）
 *   outbox  ：本地变更日志（幂等键 clientMutationId 为主键）
 */
const DB_NAME = 'rdpms-offline';
const DB_VERSION = 1;

export interface OutboxRecord {
  clientMutationId: string;
  entity: string;
  op: 'upsert' | 'delete';
  id: string;
  data?: Record<string, unknown>;
  baseUpdatedAt?: string;
  createdAt: string;
}

export interface RecordRow {
  key: string; // `${entity}:${id}`
  entity: string;
  id: string;
  projectId?: string | null;
  data: Record<string, unknown>;
  updatedAt?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持 IndexedDB'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'clientMutationId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
    });
  }
  return dbPromise;
}

function run<T>(
  store: 'kv' | 'records' | 'outbox',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'));
      }),
  );
}

export const idb = {
  // ── kv ──
  kvGet: <T>(key: string) => run<T | undefined>('kv', 'readonly', (s) => s.get(key)),
  kvSet: (key: string, value: unknown) => run('kv', 'readwrite', (s) => s.put(value, key)),
  kvDelete: (key: string) => run('kv', 'readwrite', (s) => s.delete(key)),

  // ── records ──
  recordsPutMany: async (rows: RecordRow[]) => {
    if (!rows.length) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      rows.forEach((row) => store.put(row));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('records 写入失败'));
    });
  },
  recordsDeleteMany: async (keys: string[]) => {
    if (!keys.length) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      keys.forEach((k) => store.delete(k));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('records 删除失败'));
    });
  },
  recordsAll: () => run<RecordRow[]>('records', 'readonly', (s) => s.getAll()),
  recordsClear: () => run('records', 'readwrite', (s) => s.clear()),

  // ── outbox ──
  outboxPut: (row: OutboxRecord) => run('outbox', 'readwrite', (s) => s.put(row)),
  outboxAll: () => run<OutboxRecord[]>('outbox', 'readonly', (s) => s.getAll()),
  outboxDelete: (clientMutationId: string) => run('outbox', 'readwrite', (s) => s.delete(clientMutationId)),
  outboxClear: () => run('outbox', 'readwrite', (s) => s.clear()),

  /** 退出登录时清空本地镜像与队列（共享设备安全） */
  clearAll: async () => {
    await idb.recordsClear();
    await idb.outboxClear();
    await idb.kvDelete('cursor');
    await idb.kvDelete('acl');
  },
};
