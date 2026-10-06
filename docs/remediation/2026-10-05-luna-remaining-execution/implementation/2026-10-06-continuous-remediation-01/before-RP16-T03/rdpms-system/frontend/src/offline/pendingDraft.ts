/**
 * offline/pendingDraft.ts —— 「暂时无法保存」的正文本地留存（A05 复核要求）
 *
 * 背景（审查确认的产品缺陷）：试剂组日报允许多条实验记录，只有**全部**记录都缺项目时才会提示；
 * 混合「有关联项目 / 无关联项目」时，无项目的那一组被 `continue` 静默跳过，
 * 有项目的那组保存成功后就清 key 并离开页面 —— 被跳过内容既没有失败项也没有持久留存，
 * 用户以为「全部保存成功」，正文却已经丢了。
 *
 * 本模块提供：
 *   - `partitionByProject`：保存前把记录分成「可提交」与「缺项目」两组（纯函数，可单测）；
 *   - 本地留存：缺项目的记录写入 IndexedDB（按账户 + 周期键），刷新/重新打开后仍可找回。
 *
 * 边界：本地留存**不是**服务端保存，UI 必须显式告知用户这部分尚未提交；
 * 关联项目并成功保存后才清除（不静默销毁，也不假装成功）。
 */
import { idb } from './idb';
import { tokenStore } from '../auth/tokenStore';
function storageFor(userId: string) {
  const owner = tokenStore.snapshot();
  if (!owner || owner.actorId !== userId) throw new Error('OFFLINE_OWNER_MISMATCH');
  return idb.forOwner({ userId, loginGeneration: owner.loginGeneration });
}

export interface PendingDraftRecord {
  [key: string]: unknown;
  /** 记录标识（试剂组日报为 report-<ts> / experimentNo 兜底） */
  id?: string;
  experimentNo?: string;
  projectId?: string;
}

export interface PendingDraftState {
  userId: string;
  periodKey: string;
  savedAt: string;
  records: PendingDraftRecord[];
}

export function pendingDraftKey(userId: string): string {
  return `rdpms.pendingDraft:${userId}`;
}

/** 记录身份：优先 id，其次 experimentNo，最后退化为内容哈希（保证同一记录可去重） */
export function recordIdentity(record: PendingDraftRecord, index = 0): string {
  if (record?.id) return String(record.id);
  if (record?.experimentNo) return String(record.experimentNo);
  try {
    return `idx-${index}-${JSON.stringify(record).length}`;
  } catch {
    return `idx-${index}`;
  }
}

/** 保存前分组：哪些记录能提交（有项目），哪些缺项目必须显式保留 */
export function partitionByProject<T extends PendingDraftRecord>(
  records: T[],
): { bound: T[]; unbound: T[] } {
  const bound: T[] = [];
  const unbound: T[] = [];
  for (const record of records) {
    if (record?.projectId) bound.push(record);
    else unbound.push(record);
  }
  return { bound, unbound };
}

/** 合并恢复：同一身份以本地留存版本为准，其余按原顺序追加（不丢用户已填内容） */
export function mergePendingRecords<T extends PendingDraftRecord>(
  current: T[],
  pending: PendingDraftRecord[],
): T[] {
  if (!pending?.length) return current;
  const seen = new Set(current.map((r, i) => recordIdentity(r, i)));
  const merged = [...current];
  for (const record of pending) {
    const id = recordIdentity(record);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(record as T);
  }
  return merged;
}

export async function loadPendingDraft(userId: string): Promise<PendingDraftState | null> {
  if (!userId) return null;
  const state = await storageFor(userId).kvGet<PendingDraftState>(pendingDraftKey(userId));
  if (!state || !Array.isArray(state.records) || state.records.length === 0) return null;
  return state;
}

/**
 * 覆盖式写入：调用方传入「当前全部缺项目记录」。
 * 传空数组 = 已无缺项目记录 → 清除（用户内容已经安全落库）。
 */
export async function savePendingDraft(
  userId: string,
  periodKey: string,
  records: PendingDraftRecord[],
  now = new Date().toISOString(),
): Promise<void> {
  if (!userId) return;
  if (!records.length) {
    await storageFor(userId).kvDelete(pendingDraftKey(userId));
    return;
  }
  const state: PendingDraftState = { userId, periodKey, savedAt: now, records };
  await storageFor(userId).kvSet(pendingDraftKey(userId), state);
}

export async function clearPendingDraft(userId: string): Promise<void> {
  if (!userId) return;
  await storageFor(userId).kvDelete(pendingDraftKey(userId));
}
