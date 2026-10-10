/**
 * platform/backup/verify.ts —— 归档产物的**离线**校验（不依赖生产库、不依赖应用状态）。
 *
 * 五项检查（对照 /opt/foodsentinel/backend/lib/backupVerify.js，本实现多一项路径绑定）：
 *   ① meta.json 可解析且形状合法（validateArtifactMeta）
 *   ② meta.jobId 与产物目录绑定一致（防"换掉 meta 冒充另一份备份"）
 *   ③ .aes 解密成功（GCM 认证通过 == 密文未损坏）+ 字节数与 meta.fileSize 一致
 *   ④ 解密后 sha256 == meta.sha256（证明内容与登记时逐字节相同）
 *   ⑤ pg_restore -l 列出 TABLE 集合 == meta.tableCounts 键集合（表级对账，防 meta 与实际内容不符）
 *
 * 明文全程在内存（pg_restore -l 从 stdin 读），磁盘上不落解密后的 dump。
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { BackupError, isBackupError } from './errors.js';
import { decryptBuffer, readMasterKey } from './kms.js';
import { validateArtifactMeta, type ArtifactMeta } from './artifactMeta.js';
import { jobIdFromDirName } from './paths.js';
import { readTocFromBuffer } from './pgTools.js';

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
  meta: ArtifactMeta | null;
  tocTables: string[];
  dataEntries: number;
  plainBytes: number;
  error: string | null;
}

export interface VerifyOptions {
  aesPath: string;
  metaPath: string;
  env?: NodeJS.ProcessEnv;
  /** 允许调用方直接给密钥（CLI 用），否则从 env 读 BACKUP_MASTER_KEY */
  masterKey?: Buffer | null;
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** 表集合对账：meta.tableCounts 去掉 excludedTables 后应与 TOC 的 TABLE 集合完全一致。 */
export function diffTableSets(
  metaTables: string[],
  tocTables: string[],
): { missing: string[]; extra: string[] } {
  const meta = new Set(metaTables);
  const toc = new Set(tocTables);
  return {
    missing: [...toc].filter((t) => !meta.has(t)).sort(),
    extra: [...meta].filter((t) => !toc.has(t)).sort(),
  };
}

export async function verifyArchive(options: VerifyOptions): Promise<VerifyResult> {
  const env = options.env ?? process.env;
  const checks: VerifyCheck[] = [];
  const result: VerifyResult = {
    ok: false,
    checks,
    meta: null,
    tocTables: [],
    dataEntries: 0,
    plainBytes: 0,
    error: null,
  };

  let cipher: Buffer;
  try {
    cipher = await fsp.readFile(options.aesPath);
  } catch (err) {
    throw new BackupError('BACKUP_ARTIFACT_NOT_FOUND', `读取密文失败：${options.aesPath}`, (err as Error).message);
  }

  let meta: ArtifactMeta;
  try {
    const raw = await fsp.readFile(options.metaPath, 'utf8');
    meta = validateArtifactMeta(JSON.parse(raw));
    result.meta = meta;
    checks.push({ name: 'meta.json', ok: true, detail: `jobId=${meta.jobId} createdAt=${meta.createdAt}` });
  } catch (err) {
    checks.push({ name: 'meta.json', ok: false, detail: isBackupError(err) ? err.message : String((err as Error).message) });
    result.error = 'meta.json 不可用';
    return result;
  }

  // 产物目录名是 <base>.<jobId>，因此按"最后一段"取 jobId 再比对（不能整名相等）
  const dirName = path.basename(path.dirname(options.metaPath));
  const boundOk = jobIdFromDirName(dirName) === meta.jobId;
  checks.push({
    name: 'meta↔目录绑定',
    ok: boundOk,
    detail: boundOk
      ? `目录 ${dirName} 与 meta.jobId 一致（${meta.jobId}）`
      : `目录名 ${dirName} 推导出的 jobId 与 meta.jobId ${meta.jobId} 不一致`,
  });
  if (!boundOk) {
    result.error = 'meta 与产物目录不匹配';
    return result;
  }

  // 配对检查：密文文件名必须由 meta.base 推导出来。
  // 只做 jobId/目录绑定还不够 —— 同一目录里被换成"另一份备份的 aes"同样会解密失败，
  // 但那时报错会是"密钥不匹配"这类误导性原因；这里先按命名规则把配对关系讲清楚。
  const expectedAes = `${meta.base}.dump.aes`;
  const actualAes = path.basename(options.aesPath);
  const pairOk = actualAes === expectedAes;
  checks.push({
    name: '产物配对（aes ↔ meta.base）',
    ok: pairOk,
    detail: pairOk ? actualAes : `密文文件名 ${actualAes} ≠ meta.base 推导值 ${expectedAes}`,
  });
  if (!pairOk) {
    result.error = 'aes 与 meta 不是同一份产物';
    return result;
  }

  const master = options.masterKey ?? readMasterKey(env);
  if (!master) {
    throw new BackupError('BACKUP_KMS_NOT_CONFIGURED', '未配置 BACKUP_MASTER_KEY，无法校验归档（fail-closed）');
  }

  const sizeOk = cipher.length === meta.fileSize;
  checks.push({
    name: '密文字节数',
    ok: sizeOk,
    detail: sizeOk ? `${cipher.length} 字节` : `实际 ${cipher.length} ≠ meta.fileSize ${meta.fileSize}`,
  });

  let plain: Buffer;
  try {
    plain = decryptBuffer(cipher, meta, master);
    checks.push({
      name: '解密（AES-256-GCM 认证）',
      ok: true,
      detail: `明文 ${plain.length} 字节（密钥指纹 ${meta.keyMeta.keyFingerprint}）`,
    });
    result.plainBytes = plain.length;
  } catch (err) {
    checks.push({ name: '解密（AES-256-GCM 认证）', ok: false, detail: isBackupError(err) ? err.message : String(err) });
    result.error = '密文解密失败（内容损坏或密钥不匹配）';
    return result;
  }

  const actualSha = sha256(plain);
  const shaOk = actualSha === meta.sha256;
  checks.push({
    name: 'sha256 一致性',
    ok: shaOk,
    detail: shaOk ? meta.sha256 : `实际 ${actualSha} ≠ meta ${meta.sha256}`,
  });
  if (!shaOk) {
    result.error = '内容哈希与 meta 不一致';
    return result;
  }

  try {
    const toc = await readTocFromBuffer(plain, env);
    result.tocTables = toc.tables;
    result.dataEntries = toc.dataEntries;
    const excluded = new Set(meta.excludedTables);
    const effective = toc.tables.filter((t) => !excluded.has(t));
    const diff = diffTableSets(Object.keys(meta.tableCounts), effective);
    const tocOk = diff.missing.length === 0 && diff.extra.length === 0;
    checks.push({
      name: 'pg_restore -l 表清单对账',
      ok: tocOk,
      detail: tocOk
        ? `${effective.length} 张表一致（TOC 共 ${toc.entries} 条，数据段 ${toc.dataEntries} 项）`
        : `TOC 多出 [${diff.missing.join(', ') || '-'}] / meta 多出 [${diff.extra.join(', ') || '-'}]`,
    });
    if (!tocOk) {
      result.error = '归档表清单与 meta 记录不一致';
      return result;
    }
  } catch (err) {
    checks.push({
      name: 'pg_restore -l 表清单对账',
      ok: false,
      detail: isBackupError(err) ? err.message : String(err),
    });
    result.error = '归档无法被 pg_restore 解析';
    return result;
  }

  result.ok = checks.every((c) => c.ok);
  return result;
}
