/**
 * AdaptiveUploadQueue — 渐进式节流上传队列 + 多层去重
 *
 * 解决低性能服务器在数据恢复场景下的 HTTP 429 风暴，并确保数据绝对不重复写入。
 *
 * 三层去重机制：
 *   Layer 1 — 队列内合并：同 recordId 已在队列中时，将 payload 合并而非重复入队
 *   Layer 2 — 幂等键：请求头携带 Idempotency-Key，后端识别重传并返回缓存结果
 *   Layer 3 — 内容指纹：已成功写入的 {recordId + payloadHash} 在 TTL 内直接跳过
 *
 * 自适应节流：
 *   - 连续成功 N 次后自动提速（× speedUpFactor）
 *   - 遇到 429 立即降速（× slowDownFactor）并全局暂停 pauseDuration
 *   - 版本冲突（409）时拉取服务器最新版本号后自动重试
 *
 * @example
 * ```ts
 * import { AdaptiveUploadQueue } from '@/utils/AdaptiveUploadQueue';
 *
 * const queue = new AdaptiveUploadQueue({
 *   initialInterval: 1000,
 *   requestFn: async (collection, recordId, payload, idempotencyKey) => {
 *     const res = await api.put(`/${collection}/${recordId}`, payload, {
 *       headers: { 'Idempotency-Key': idempotencyKey },
 *     });
 *     return res.data;
 *   },
 *   onProgress: (status) => console.log(status),
 * });
 *
 * await Promise.allSettled(records.map(r => queue.enqueue(r.collection, r.id, r.data)));
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueStatus {
  total:           number;
  completed:       number;
  skipped:         number;
  pending:         number;
  inFlight:        number;
  currentInterval: number;
  isPaused:        boolean;
  percent:         number;
}

export interface EnqueueResult {
  skipped?: boolean;
  reason?:  string;
  [key: string]: unknown;
}

/** 由调用方提供的实际 HTTP 请求函数，方便注入 axios/fetch 任意实现 */
export type RequestFn = (
  collection:     string,
  recordId:       string,
  payload:        Record<string, unknown>,
  idempotencyKey: string,
) => Promise<unknown>;

/** 当遇到 409 版本冲突时，用于拉取服务器最新记录的函数 */
export type FetchLatestFn = (
  collection: string,
  recordId:   string,
) => Promise<{ version: number; [key: string]: unknown }>;

export interface AdaptiveUploadQueueOptions {
  /** 初始请求间隔（ms），默认 800 */
  initialInterval?:  number;
  /** 最小请求间隔（ms），默认 400 */
  minInterval?:      number;
  /** 最大请求间隔（ms），默认 15000 */
  maxInterval?:      number;
  /** 最大并发数，低性能服务器建议 1（严格串行），默认 1 */
  maxConcurrent?:    number;
  /** 连续成功多少次后提速，默认 8 */
  speedUpThreshold?: number;
  /** 降速因子（遇到 429），默认 2.0 */
  slowDownFactor?:   number;
  /** 提速因子（连续成功），默认 0.85 */
  speedUpFactor?:    number;
  /** 指纹缓存 TTL（ms），默认 60000 */
  fingerprintTTL?:   number;
  /** 最大指纹缓存条数，默认 500 */
  maxFingerprintCache?: number;
  /** 实际 HTTP 请求函数（必须提供，或使用默认的 fetch 实现） */
  requestFn?:        RequestFn;
  /** 拉取最新记录函数（处理 409 冲突时调用） */
  fetchLatestFn?:    FetchLatestFn;
  /** 进度回调 */
  onProgress?:       (status: QueueStatus) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部队列项
// ─────────────────────────────────────────────────────────────────────────────

interface QueueItem {
  collection:     string;
  recordId:       string;
  payload:        Record<string, unknown>;
  fingerprint:    string;
  attempt:        number;
  idempotencyKey: string;
  resolvers:      Array<(value: EnqueueResult) => void>;
  rejectors:      Array<(reason: unknown) => void>;
  enqueuedAt:     number;
}

interface HttpError extends Error {
  status:      number;
  retryAfter?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AdaptiveUploadQueue
// ─────────────────────────────────────────────────────────────────────────────

export class AdaptiveUploadQueue {
  // ── 节流参数 ────────────────────────────────────────────────────────────────
  private _initialInterval:  number;
  private _minInterval:      number;
  private _maxInterval:      number;
  private _currentInterval:  number;
  private _maxConcurrent:    number;
  private _inFlight:         number = 0;

  // ── 自适应参数 ──────────────────────────────────────────────────────────────
  private _successStreak:    number = 0;
  private _speedUpThreshold: number;
  private _slowDownFactor:   number;
  private _speedUpFactor:    number;

  // ── 队列核心数据结构 ────────────────────────────────────────────────────────
  /** key = `${collection}::${recordId}` → O(1) 查找，用于合并去重 */
  private _queueMap:  Map<string, QueueItem> = new Map();
  /** 有序队列，保持入队顺序 */
  private _queueList: QueueItem[] = [];

  // ── 去重层3：已完成请求的指纹缓存 ──────────────────────────────────────────
  private _completedFingerprints: Map<string, number> = new Map();
  private _fingerprintTTL:        number;
  private _maxFingerprintCache:   number;

  // ── 状态控制 ────────────────────────────────────────────────────────────────
  private _isProcessing: boolean = false;
  private _pausedUntil:  number  = 0;
  private _lastSentTime: number  = 0;

  // ── 进度统计 ────────────────────────────────────────────────────────────────
  private _totalEnqueued:  number = 0;
  private _totalCompleted: number = 0;
  private _totalSkipped:   number = 0;
  private _onProgress:     ((status: QueueStatus) => void) | null;

  // ── 注入函数 ────────────────────────────────────────────────────────────────
  private _requestFn:     RequestFn;
  private _fetchLatestFn: FetchLatestFn;

  constructor(options: AdaptiveUploadQueueOptions = {}) {
    this._initialInterval  = options.initialInterval  ?? 800;
    this._minInterval      = options.minInterval      ?? 400;
    this._maxInterval      = options.maxInterval      ?? 15000;
    this._currentInterval  = this._initialInterval;
    this._maxConcurrent    = options.maxConcurrent    ?? 1;
    this._speedUpThreshold = options.speedUpThreshold ?? 8;
    this._slowDownFactor   = options.slowDownFactor   ?? 2.0;
    this._speedUpFactor    = options.speedUpFactor    ?? 0.85;
    this._fingerprintTTL   = options.fingerprintTTL   ?? 60_000;
    this._maxFingerprintCache = options.maxFingerprintCache ?? 500;
    this._onProgress       = options.onProgress       ?? null;

    this._requestFn     = options.requestFn     ?? this._defaultRequestFn.bind(this);
    this._fetchLatestFn = options.fetchLatestFn ?? this._defaultFetchLatestFn.bind(this);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 入队（含三层去重检查）
  // ─────────────────────────────────────────────────────────────────────────

  enqueue(
    collection: string,
    recordId:   string,
    payload:    Record<string, unknown>,
  ): Promise<EnqueueResult> {
    return new Promise<EnqueueResult>((resolve, reject) => {

      // ── 去重检查1：内容指纹（防止完全相同的数据重复提交）────────────────────
      const fingerprint = this._makeFingerprint(collection, recordId, payload);
      if (this._isRecentlyCompleted(fingerprint)) {
        console.log(`[Queue] ⏭ 跳过重复内容: ${collection}/${recordId}`);
        this._totalSkipped++;
        this._notifyProgress();
        resolve({ skipped: true, reason: 'duplicate_content' });
        return;
      }

      // ── 去重检查2：队列内合并（同 recordId 已在队列中）──────────────────────
      const queueKey = `${collection}::${recordId}`;
      if (this._queueMap.has(queueKey)) {
        const existing = this._queueMap.get(queueKey)!;
        existing.payload     = { ...existing.payload, ...payload };
        existing.fingerprint = this._makeFingerprint(collection, recordId, existing.payload);
        existing.resolvers.push(resolve);
        existing.rejectors.push(reject);
        console.log(`[Queue] 🔀 合并请求: ${collection}/${recordId} | 队列长度: ${this._queueList.length}`);
        return;
      }

      // ── 正常入队 ──────────────────────────────────────────────────────────
      const item: QueueItem = {
        collection,
        recordId,
        payload,
        fingerprint,
        attempt:        0,
        idempotencyKey: this._generateIdempotencyKey(collection, recordId),
        resolvers:      [resolve],
        rejectors:      [reject],
        enqueuedAt:     Date.now(),
      };

      this._queueMap.set(queueKey, item);
      this._queueList.push(item);
      this._totalEnqueued++;
      this._notifyProgress();

      console.log(`[Queue] ➕ 入队: ${collection}/${recordId} | 队列长度: ${this._queueList.length}`);

      if (!this._isProcessing) {
        this._scheduleNext(0);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 调度 & 处理核心
  // ─────────────────────────────────────────────────────────────────────────

  private _scheduleNext(delay: number): void {
    setTimeout(() => this._processNext(), Math.max(0, delay));
  }

  private async _processNext(): Promise<void> {
    // 检查全局暂停
    const now = Date.now();
    if (now < this._pausedUntil) {
      const wait = this._pausedUntil - now;
      console.log(`[Queue] ⏸ 全局暂停，${(wait / 1000).toFixed(1)}s 后恢复`);
      this._scheduleNext(wait);
      return;
    }

    if (this._inFlight >= this._maxConcurrent) return;

    if (this._queueList.length === 0) {
      this._isProcessing = false;
      if (this._totalEnqueued > 0) {
        console.log(
          `[Queue] ✅ 全部完成 | 成功:${this._totalCompleted} | 跳过:${this._totalSkipped}`,
        );
      }
      return;
    }

    this._isProcessing = true;

    // 请求间隔控制
    const elapsed = Date.now() - this._lastSentTime;
    if (elapsed < this._currentInterval) {
      this._scheduleNext(this._currentInterval - elapsed);
      return;
    }

    // 取出队首
    const item     = this._queueList.shift()!;
    const queueKey = `${item.collection}::${item.recordId}`;
    this._queueMap.delete(queueKey);

    // ── 去重检查3：出队时再次检查指纹 ──────────────────────────────────────
    if (this._isRecentlyCompleted(item.fingerprint)) {
      console.log(`[Queue] ⏭ 出队时发现重复，跳过: ${item.collection}/${item.recordId}`);
      this._totalSkipped++;
      this._totalCompleted++;
      this._notifyProgress();
      item.resolvers.forEach(r => r({ skipped: true, reason: 'duplicate_on_dequeue' }));
      this._scheduleNext(0);
      return;
    }

    this._inFlight++;
    this._lastSentTime = Date.now();

    console.log(
      `[Queue] 📤 发送: ${item.collection}/${item.recordId} | ` +
      `间隔:${this._currentInterval}ms | 剩余:${this._queueList.length} | ` +
      `幂等键:${item.idempotencyKey}`,
    );

    try {
      const result = await this._requestFn(
        item.collection,
        item.recordId,
        item.payload,
        item.idempotencyKey,
      );

      this._inFlight--;
      this._successStreak++;
      this._totalCompleted++;
      this._markCompleted(item.fingerprint);
      this._notifyProgress();

      // 自适应提速
      if (this._successStreak >= this._speedUpThreshold) {
        const newInterval = Math.max(
          this._minInterval,
          Math.floor(this._currentInterval * this._speedUpFactor),
        );
        if (newInterval < this._currentInterval) {
          console.log(`[Queue] 🚀 提速: ${this._currentInterval}ms → ${newInterval}ms`);
          this._currentInterval = newInterval;
        }
        this._successStreak = 0;
      }

      item.resolvers.forEach(r => r(result as EnqueueResult));
      this._scheduleNext(this._currentInterval);

    } catch (rawError: unknown) {
      this._inFlight--;
      const error = rawError as HttpError;

      if (error.status === 429) {
        this._successStreak = 0;

        const newInterval = Math.min(
          this._maxInterval,
          Math.floor(this._currentInterval * this._slowDownFactor),
        );
        this._currentInterval = newInterval;

        const retryAfterMs = error.retryAfter ? parseInt(error.retryAfter) * 1000 : null;
        const pauseDuration = retryAfterMs ?? newInterval * 1.5;
        this._pausedUntil = Date.now() + pauseDuration;

        console.warn(
          `[Queue] 🔴 429 降速: 间隔→${newInterval}ms | ` +
          `暂停 ${(pauseDuration / 1000).toFixed(1)}s | ` +
          `重新入队: ${item.collection}/${item.recordId}`,
        );

        item.attempt++;
        if (item.attempt <= 5) {
          this._queueList.unshift(item);
          this._queueMap.set(queueKey, item);
        } else {
          console.error(`[Queue] ❌ 超过最大重试次数: ${item.collection}/${item.recordId}`);
          item.rejectors.forEach(r => r(error));
          this._totalCompleted++;
          this._notifyProgress();
        }

        this._scheduleNext(pauseDuration);

      } else if (error.status === 409) {
        // ── 版本冲突：拉取最新版本号后重试 ────────────────────────────────────
        console.warn(
          `[Queue] ⚠️ 版本冲突(409): ${item.collection}/${item.recordId}，` +
          `尝试获取最新版本后重试`,
        );
        try {
          const latest = await this._fetchLatestFn(item.collection, item.recordId);
          item.payload     = { ...item.payload, version: latest.version };
          item.fingerprint = this._makeFingerprint(item.collection, item.recordId, item.payload);
          item.attempt++;
          if (item.attempt <= 3) {
            this._queueList.unshift(item);
            this._queueMap.set(queueKey, item);
            this._scheduleNext(500);
          } else {
            item.rejectors.forEach(r => r(error));
            this._totalCompleted++;
            this._notifyProgress();
          }
        } catch {
          item.rejectors.forEach(r => r(error));
          this._totalCompleted++;
          this._notifyProgress();
        }

      } else {
        // 其他错误：指数退避（最多 3 次）
        item.attempt++;
        const delay = Math.min(1000 * Math.pow(2, item.attempt), 30_000);
        if (item.attempt <= 3) {
          console.warn(
            `[Queue] ⚠️ 失败(${error.status ?? 'unknown'})，` +
            `第 ${item.attempt} 次重试，${delay}ms 后`,
          );
          this._queueList.unshift(item);
          this._queueMap.set(queueKey, item);
          this._scheduleNext(delay);
        } else {
          item.rejectors.forEach(r => r(error));
          this._totalCompleted++;
          this._notifyProgress();
          this._scheduleNext(this._currentInterval);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 默认 HTTP 实现（仅作兜底；推荐通过 options.requestFn 注入 axios）
  // ─────────────────────────────────────────────────────────────────────────

  private async _defaultRequestFn(
    collection:     string,
    recordId:       string,
    payload:        Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<unknown> {
    const url = `/api/records/${collection}/${recordId}`;
    const response = await fetch(url, {
      method:  'PUT',
      headers: {
        'Content-Type':    'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`) as HttpError;
      err.status      = response.status;
      err.retryAfter  = response.headers.get('Retry-After');
      throw err;
    }
    return response.json();
  }

  private async _defaultFetchLatestFn(
    collection: string,
    recordId:   string,
  ): Promise<{ version: number }> {
    const response = await fetch(`/api/records/${collection}/${recordId}`);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return response.json();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 去重工具方法
  // ─────────────────────────────────────────────────────────────────────────

  /** 生成内容指纹（recordId + 排序后 payload 的简单哈希） */
  private _makeFingerprint(
    collection: string,
    recordId:   string,
    payload:    Record<string, unknown>,
  ): string {
    const sorted  = Object.keys(payload).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = payload[k];
      return acc;
    }, {});
    const content = `${collection}::${recordId}::${JSON.stringify(sorted)}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
    }
    return `${collection}::${recordId}::${hash}`;
  }

  /** 生成幂等键（每次入队唯一，重试时复用同一键） */
  private _generateIdempotencyKey(collection: string, recordId: string): string {
    return `${collection}-${recordId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /** 写入完成指纹缓存 */
  private _markCompleted(fingerprint: string): void {
    if (this._completedFingerprints.size >= this._maxFingerprintCache) {
      const oldest = this._completedFingerprints.keys().next().value;
      if (oldest !== undefined) this._completedFingerprints.delete(oldest);
    }
    this._completedFingerprints.set(fingerprint, Date.now());
  }

  /** 检查指纹是否在近期已完成 */
  private _isRecentlyCompleted(fingerprint: string): boolean {
    const ts = this._completedFingerprints.get(fingerprint);
    if (ts === undefined) return false;
    if (Date.now() - ts > this._fingerprintTTL) {
      this._completedFingerprints.delete(fingerprint);
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 进度 & 状态
  // ─────────────────────────────────────────────────────────────────────────

  private _notifyProgress(): void {
    this._onProgress?.(this.getStatus());
  }

  getStatus(): QueueStatus {
    return {
      total:           this._totalEnqueued,
      completed:       this._totalCompleted,
      skipped:         this._totalSkipped,
      pending:         this._queueList.length,
      inFlight:        this._inFlight,
      currentInterval: this._currentInterval,
      isPaused:        Date.now() < this._pausedUntil,
      percent: this._totalEnqueued > 0
        ? Math.floor((this._totalCompleted / this._totalEnqueued) * 100)
        : 0,
    };
  }

  /** 清空队列并重置所有计数器（调用方负责 reject 正在处理的 promise） */
  reset(): void {
    this._queueMap.clear();
    this._queueList.length = 0;
    this._completedFingerprints.clear();
    this._isProcessing   = false;
    this._pausedUntil    = 0;
    this._lastSentTime   = 0;
    this._inFlight       = 0;
    this._successStreak  = 0;
    this._currentInterval = this._initialInterval;
    this._totalEnqueued  = 0;
    this._totalCompleted = 0;
    this._totalSkipped   = 0;
  }
}
