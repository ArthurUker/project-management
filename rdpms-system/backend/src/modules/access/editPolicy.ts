/**
 * modules/access/editPolicy.ts —— 编辑写入的「并发基线 / 旧客户端兼容」策略（RF04 复核第三轮）
 *
 * 背景：并发基线（expectedUpdatedAt / baseUpdatedAt）是防止「无知覆盖」的手段。
 * 兼容路径（不带基线也无条件写入）只能是**临时过渡**，必须写清适用面与退出条件。
 *
 * 策略（三条硬规则）：
 *   1. 声明新版契约的客户端（`X-Client-Contract: v2`）**必须**携带并发基线；
 *      缺失一律 400 `CONCURRENCY_BASELINE_REQUIRED`，禁止自动回落到旧版兼容路径。
 *   2. 旧版兼容路径只对「客户端未声明契约」且「目标处于可编辑草稿态」的数据开放。
 *   3. **已提交 / 已审核 / 实验科学数据一律不得**走兼容路径无条件覆盖——
 *      即便客户端很老，也必须带基线或走正常锁定流程。
 *
 * 兼容窗口退出条件：本仓库前端（声明 v2）发布后，兼容路径只服务于未升级的旧客户端；
 * 待 05 §8 记录的客户端升级窗口关闭后，本模块的 `allowLegacyCompat` 置 false 即彻底下线。
 */
import { HttpError, badRequest } from '../../kernel/http.js';

export const CLIENT_CONTRACT_HEADER = 'x-client-contract';
export const CLIENT_CONTRACT_V2 = 'v2';

/** 兼容路径总开关：关闭后所有写入都必须带并发基线 */
export const allowLegacyCompat = true;

export function readClientContract(headers: {
  get?: (name: string) => string | null | undefined;
}, body?: Record<string, unknown> | null): string | null {
  const fromHeader = headers?.get?.(CLIENT_CONTRACT_HEADER) ?? null;
  const fromBody = typeof body?.clientContract === 'string' ? (body.clientContract as string) : null;
  const value = (fromHeader ?? fromBody ?? '').trim().toLowerCase();
  return value || null;
}

/** 是否为「声明新版契约」的客户端 */
export function isModernClient(clientContract: string | null): boolean {
  if (!clientContract) return false;
  return clientContract === CLIENT_CONTRACT_V2 || clientContract === '2';
}

/**
 * 规则 1：新版客户端必须带基线。
 * @param baseline 已解析的并发基线（无 → undefined/null）
 */
export function assertBaselineForModernClient(
  clientContract: string | null,
  baseline: unknown,
  command: string,
): void {
  if (!isModernClient(clientContract)) return;
  if (baseline === undefined || baseline === null || baseline === '') {
    throw badRequest(
      'CONCURRENCY_BASELINE_REQUIRED',
      `${command}：新版客户端必须携带并发基线（expectedUpdatedAt），不能回落到旧版兼容路径`,
      { header: CLIENT_CONTRACT_HEADER, received: clientContract },
    );
  }
}

/**
 * 实验科学数据识别（规则 3 的判定依据）。
 *
 * 现状：本系统未给汇报打「科学数据」布尔字段，实验数据以内容形状体现——
 * 试剂/样品实验类汇报在 content 中带 `reagentReports`（见前端 REPORT_TYPE 模板）。
 * 因此采用**内容形状**判定，并且宁可判严（判为科学数据即拒绝无基线覆盖）。
 * 若后续 schema 增加 `dataClass` 字段，应改为读该字段并在本节记录变更。
 */
export function isScientificReportContent(
  reportType: string | null | undefined,
  content: unknown,
): boolean {
  const type = String(reportType ?? '').toUpperCase();
  if (type === 'REAGENT' || type === 'EXPERIMENT' || type === 'SCIENTIFIC') return true;
  // 规范化：库内 content 可能是对象，也可能是 JSON 字符串（历史数据/离线队列写入口径）
  const normalized = normalizeStoredContent(content);
  if (!normalized) return false;
  if (Array.isArray(normalized.reagentReports) && normalized.reagentReports.length > 0) return true;
  // 兼容其它实验数据形状（样品/试剂条目）
  return Array.isArray(normalized.samples) && normalized.samples.length > 0;
}

/** 把库内 content 规范化为对象（字符串按 JSON 解析；解析失败视为「非空未知内容」→ 按科学数据从严处理） */
export function normalizeStoredContent(content: unknown): Record<string, unknown> | null {
  if (content === null || content === undefined) return null;
  if (typeof content === 'object') {
    const record = content as Record<string, unknown>;
    return Object.keys(record).length ? record : null;
  }
  if (typeof content === 'string') {
    const text = content.trim();
    if (!text || text === '{}') return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && Object.keys(parsed).length
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      // 无法解析但确实有内容 → 从严：按实验数据对待
      return { __unparsable: true };
    }
  }
  return null;
}

export interface LegacyCompatSubject {
  /** 目标是否已锁定（已提交 / 已审核等） */
  locked: boolean;
  /** 目标是否属于实验科学数据 */
  scientific?: boolean;
  /** 幂等/日志用的对象描述 */
  label: string;
}

/**
 * 规则 2/3：旧客户端兼容路径的准入判定。
 * 不满足即拒绝——宁可让老客户端报错重试，也不能静默覆盖已定稿数据。
 */
export function assertLegacyCompatAllowed(subject: LegacyCompatSubject): void {
  // 注意：subject 必须来自**服务端已有记录**（含规范化后的内容），
  // 不得来自客户端请求头、也不得由「本次 payload 是否包含某个字段」推断——
  // 否则客户端只要不带该字段就能绕过保护。
  if (!allowLegacyCompat) {
    throw badRequest(
      'CONCURRENCY_BASELINE_REQUIRED',
      `${subject.label}：旧客户端兼容路径已下线，请升级客户端后重试`,
    );
  }
  if (subject.locked) {
    throw new HttpError(
      409,
      'CONCURRENCY_BASELINE_REQUIRED',
      `${subject.label} 已提交或已审核，不得走旧客户端兼容路径覆盖；请携带并发基线或先撤回`,
    );
  }
  if (subject.scientific) {
    throw new HttpError(
      409,
      'CONCURRENCY_BASELINE_REQUIRED',
      `${subject.label} 属于实验科学数据，禁止无基线覆盖；请携带并发基线`,
    );
  }
}
