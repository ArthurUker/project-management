/**
 * platform/backup/retention.ts —— 归档保留策略（纯函数 + 受控执行）。
 *
 * 与参考实现（/opt/foodsentinel/backend/lib/backupService.js 的 cleanupOldBackups）的差异：
 *   参考实现按天数扫描目录删文件，且"某日目录下所有文件"都删（注释与实际不一致）。
 *   本实现改成**先算计划、再照计划执行**：
 *     - 只有"有 meta.json 且 meta.jobId 合法"的产物才进入计划；
 *     - 未登记的目录（没有 meta、或 meta 不可解析）一律 skip，绝不删 —— 清理逻辑不做考古；
 *     - 永远保留最新的一份，即使它已超出保留窗口（避免"全删空"这类不可逆事故）。
 *   两条规则任一为 0/负即视为"该维度不限制"。
 */
import { resolveArtifactPath } from './paths.js';
import { removeArtifactDir } from './atomicFs.js';

export const KEEP_DAYS_ENV = 'BACKUP_KEEP_DAYS';
export const KEEP_COUNT_ENV = 'BACKUP_KEEP_COUNT';
const DEFAULT_KEEP_DAYS = 30;
const DEFAULT_KEEP_COUNT = 60;

export interface RetentionEntry {
  jobId: string;
  /** 相对归档根的产物目录路径 */
  dir: string;
  createdAtMs: number;
  bytes: number;
  /** 是否在 DB 中登记（false → 跳过，不删） */
  registered: boolean;
}

export interface RetentionPlan {
  keep: RetentionEntry[];
  remove: RetentionEntry[];
  skipped: RetentionEntry[];
  keepDays: number;
  keepCount: number;
}

export interface RetentionOutcome {
  removed: Array<{ jobId: string; dir: string; bytes: number }>;
  kept: number;
  skipped: number;
  errors: Array<{ dir: string; message: string }>;
  removedBytes: number;
}

export function retentionConfig(env: NodeJS.ProcessEnv = process.env): { keepDays: number; keepCount: number } {
  const days = Number(env[KEEP_DAYS_ENV] ?? DEFAULT_KEEP_DAYS);
  const count = Number(env[KEEP_COUNT_ENV] ?? DEFAULT_KEEP_COUNT);
  return {
    keepDays: Number.isFinite(days) && days >= 0 ? days : DEFAULT_KEEP_DAYS,
    keepCount: Number.isFinite(count) && count >= 0 ? count : DEFAULT_KEEP_COUNT,
  };
}

export function planRetention(
  entries: RetentionEntry[],
  options: { keepDays: number; keepCount: number; now?: number },
): RetentionPlan {
  const now = options.now ?? Date.now();
  const { keepDays, keepCount } = options;
  const kept: RetentionEntry[] = [];
  const removed: RetentionEntry[] = [];
  const skipped: RetentionEntry[] = [];

  const candidates = entries.filter((entry) => {
    if (!entry.registered) {
      skipped.push(entry);
      return false;
    }
    return true;
  });
  const ordered = [...candidates].sort((a, b) => b.createdAtMs - a.createdAtMs);
  const newestJobId = ordered[0]?.jobId ?? null;

  ordered.forEach((entry, index) => {
    if (entry.jobId === newestJobId) {
      kept.push(entry);
      return;
    }
    const ageDays = (now - entry.createdAtMs) / 86_400_000;
    const tooOld = keepDays > 0 && ageDays > keepDays;
    const beyondCount = keepCount > 0 && index >= keepCount;
    if (tooOld || beyondCount) removed.push(entry);
    else kept.push(entry);
  });

  return { keep: kept, remove: removed, skipped, keepDays, keepCount };
}

export interface ApplyRetentionOptions {
  root: string;
  /** 删除登记行（在删文件之前调用；返回 false 表示登记未见，按失败处理） */
  deleteRegistryRow: (jobId: string) => Promise<void>;
}

/** 照计划执行：先删登记行，再删文件；单个失败不中断整体，逐条记 errors。 */
export async function applyRetention(plan: RetentionPlan, options: ApplyRetentionOptions): Promise<RetentionOutcome> {
  const outcome: RetentionOutcome = {
    removed: [],
    kept: plan.keep.length,
    skipped: plan.skipped.length,
    errors: [],
    removedBytes: 0,
  };
  for (const entry of plan.remove) {
    try {
      resolveArtifactPath(options.root, entry.dir);
      await options.deleteRegistryRow(entry.jobId);
      await removeArtifactDir(options.root, entry.dir);
      outcome.removed.push({ jobId: entry.jobId, dir: entry.dir, bytes: entry.bytes });
      outcome.removedBytes += entry.bytes;
    } catch (err) {
      outcome.errors.push({ dir: entry.dir, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return outcome;
}
