/** Shared byte-read guard for every FileObject-backed download alias. */
export type FileReadScanDecision =
  | { allow: true }
  | { allow: false; code: 'FILE_INFECTED'; reason: string };

/**
 * Infection is an unconditional byte-export block. Other scan states retain
 * their existing behavior until the security owner approves T-RP-05.
 */
export function decideFileRead(scanStatus: string | null | undefined): FileReadScanDecision {
  if (scanStatus === 'INFECTED') {
    return { allow: false, code: 'FILE_INFECTED', reason: '文件已感染，禁止下载' };
  }
  return { allow: true };
}
