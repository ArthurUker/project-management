/**
 * offline/idb.ts —— 极简 IndexedDB 封装（离线同步 v2）
 *
 * 只做三件事，避免引入额外依赖：
 *   kv      ：光标 / 设备号 / acl 快照
 *   records ：实体镜像（key = `${entity}:${id}`）
 *   outbox  ：本地变更日志（幂等键 clientMutationId 为主键）
 */
const DB_NAME = 'rdpms-offline';
const DB_VERSION = 2;

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
        // v2：持久拒绝区（F10）—— 被服务端拒绝的离线变更必须可跨刷新/重新登录恢复
        if (!db.objectStoreNames.contains('deadLetters')) {
          const store = db.createObjectStore('deadLetters', { keyPath: 'key' });
          store.createIndex('userId', 'userId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
    });
  }
  return dbPromise;
}

function run<T>(
  store: 'kv' | 'records' | 'outbox' | 'deadLetters',
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

  // ── deadLetters（持久拒绝区，v2）──
  /**
   * **同一事务**内完成「写入持久拒绝区 → 移出待发送队列」。
   * 分两次事务会留下不一致窗口：崩在中间要么丢内容、要么重复上行。
   */
  deadLetterMove: async (
    record: { key: string; clientMutationId: string; userId: string },
    beforePut?: (
      existing: { key: string } | undefined,
    ) => { key: string; clientMutationId: string; userId: string } | Promise<{ key: string; clientMutationId: string; userId: string }>,
  ) => {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['deadLetters', 'outbox'], 'readwrite');
      const deadStore = tx.objectStore('deadLetters');
      const outboxStore = tx.objectStore('outbox');
      const getReq = deadStore.get(record.key);
      getReq.onsuccess = () => {
        const existing = getReq.result as { key: string } | undefined;
        const finalRecord = beforePut ? beforePut(existing) : record;
        Promise.resolve(finalRecord).then((rec) => {
          deadStore.put(rec);
          outboxStore.delete(record.clientMutationId);
        }).catch(() => tx.abort());
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('拒绝记录写入失败'));
      tx.onabort = () => reject(tx.error ?? new Error('拒绝记录事务被中止'));
    });
  },
  /** 只取当前账户的记录（不同账户隔离） */
  deadLettersForUser: async (userId: string) => {
    const all = await run<Array<{ key: string; userId: string }>>(
      'deadLetters', 'readonly', (s) => s.getAll(),
    );
    return (all ?? []).filter((r) => r.userId === userId);
  },
  deadLetterDelete: (key: string) => run('deadLetters', 'readwrite', (s) => s.delete(key)),
  deadLettersClearForUser: async (userId: string) => {
    const rows = await idb.deadLettersForUser(userId);
    if (!rows.length) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('deadLetters', 'readwrite');
      const store = tx.objectStore('deadLetters');
      rows.forEach((r) => store.delete(r.key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('拒绝记录清理失败'));
    });
  },

  /**
   * 退出登录时清空本地镜像与队列（共享设备安全）。
   * 注意：**不清空**持久拒绝区——那是用户尚未取回的内容，重新登录同一账户后必须恢复；
   * 其他账户也读不到它（按 userId 过滤）。
   */
  clearAll: async () => {
    await idb.recordsClear();
    await idb.outboxClear();
    await idb.kvDelete('cursor');
    await idb.kvDelete('acl');
  },
};
