/** Shared byte-read guard for every FileObject-backed download alias. */
export type FileReadScanDecision =
  | { allow: true }
  | { allow: false; code: 'FILE_INFECTED' | 'FILE_SCAN_NOT_CLEAN'; reason: string };

/**
 * T-RP-05 (郭仁康, 研发副总监): only CLEAN may export bytes. Missing or
 * unrecognized scan results are not evidence of a clean file. This decision
 * is independent of actor privilege, metadata access and deletion policy.
 */
export function decideFileRead(scanStatus: string | null | undefined): FileReadScanDecision {
  if (scanStatus === 'CLEAN') return { allow: true };
  if (scanStatus === 'INFECTED') {
    return { allow: false, code: 'FILE_INFECTED', reason: '文件已感染，禁止下载' };
  }
  return { allow: false, code: 'FILE_SCAN_NOT_CLEAN', reason: '文件尚未通过安全扫描，禁止下载' };
}
