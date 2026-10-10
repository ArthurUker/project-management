/**
 * platform/backup/kms.ts —— 归档产物的信封加密（AES-256-GCM）。
 *
 * 形态（对照参考实现 /opt/foodsentinel/backend/lib/backupKms.js，去掉腾讯云 KMS 分支）：
 *   - 每份备份随机生成 32 字节 DEK；文件用 DEK 做 aes-256-gcm 加密（iv 12 字节、tag 16 字节）；
 *   - DEK 用主密钥（BACKUP_MASTER_KEY，base64 的 32 字节）再加密一次，密文写进 meta.keyMeta.dekCipher；
 *   - .aes 文件是**纯 GCM 密文**，不带自定义文件头；算法/iv/tag/密钥元数据全在旁挂 meta.json；
 *   - meta.keyMeta.keyFingerprint 记录主密钥指纹（仅前 16 hex），便于轮换后判断该用哪把密钥。
 *
 * fail-closed：主密钥缺失或格式非法一律抛错，不做"无密钥则明文落盘"的降级。
 * 轮换语义：换主密钥后旧备份仍可用旧密钥解开（前提是保管得住旧密钥指纹 → 密钥的映射）。
 */
import crypto from 'node:crypto';
import { BackupError } from './errors.js';

export const BACKUP_ALGORITHM = 'aes-256-gcm';
export const BACKUP_KEY_MODE = 'local';
export const MASTER_KEY_ENV = 'BACKUP_MASTER_KEY';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface BackupKeyMeta {
  mode: string;
  algorithm: string;
  /** 主密钥加密后的 DEK：base64(iv(12) || ciphertext(32) || tag(16)) */
  dekCipher: string;
  /** 主密钥指纹（sha256 前 16 hex），用于轮换后定位密钥，不是密钥本身 */
  keyFingerprint: string;
}

export interface BackupEnvelope {
  algorithm: string;
  iv: string;
  tag: string;
  keyMeta: BackupKeyMeta;
}

/** base64 → 32 字节；空值返回 null，格式非法抛错（不静默忽略）。 */
export function decodeMasterKey(raw: string | undefined): Buffer | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new BackupError(
      'BACKUP_KMS_NOT_CONFIGURED',
      `${MASTER_KEY_ENV} 必须是 base64 编码的 ${KEY_BYTES} 字节密钥（当前解码后 ${key.length} 字节）`,
    );
  }
  return key;
}

export function readMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  return decodeMasterKey(env[MASTER_KEY_ENV]);
}

/** 生成密钥：`openssl rand -base64 32`（等价实现，避免部署时依赖 openssl 参数差异）。 */
export function generateMasterKey(): string {
  return crypto.randomBytes(KEY_BYTES).toString('base64');
}

export function keyFingerprint(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function requireMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const key = readMasterKey(env);
  if (!key) {
    throw new BackupError(
      'BACKUP_KMS_NOT_CONFIGURED',
      `未配置 ${MASTER_KEY_ENV}，归档加密不可用（fail-closed，不做明文备份）`,
    );
  }
  return key;
}

function gcmEncrypt(key: Buffer, plain: Buffer): { cipher: Buffer; iv: Buffer; tag: Buffer } {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(BACKUP_ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { cipher: body, iv, tag: cipher.getAuthTag() };
}

function gcmDecrypt(key: Buffer, cipher: Buffer, iv: Buffer, tag: Buffer, what: string): Buffer {
  try {
    const decipher = crypto.createDecipheriv(BACKUP_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cipher), decipher.final()]);
  } catch {
    throw new BackupError('BACKUP_VERIFY_FAILED', `${what}解密失败：GCM 认证未通过（密文损坏或密钥不匹配）`);
  }
}

export function parseEnvelope(value: unknown): BackupEnvelope {
  const meta = value as Partial<BackupEnvelope> | null | undefined;
  if (!meta || typeof meta !== 'object') {
    throw new BackupError('BACKUP_META_INVALID', 'meta.json 缺少加密信封字段');
  }
  if (meta.algorithm !== BACKUP_ALGORITHM) {
    throw new BackupError('BACKUP_META_INVALID', `不支持的加密算法：${String(meta.algorithm)}`);
  }
  const iv = Buffer.from(String(meta.iv ?? ''), 'base64');
  const tag = Buffer.from(String(meta.tag ?? ''), 'base64');
  if (iv.length !== IV_BYTES) throw new BackupError('BACKUP_META_INVALID', `meta.iv 必须是 ${IV_BYTES} 字节`);
  if (tag.length !== TAG_BYTES) throw new BackupError('BACKUP_META_INVALID', `meta.tag 必须是 ${TAG_BYTES} 字节`);
  const keyMeta = meta.keyMeta as Partial<BackupKeyMeta> | undefined;
  if (!keyMeta || typeof keyMeta.dekCipher !== 'string' || !keyMeta.dekCipher) {
    throw new BackupError('BACKUP_META_INVALID', 'meta.keyMeta.dekCipher 缺失');
  }
  return {
    algorithm: BACKUP_ALGORITHM,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    keyMeta: {
      mode: String(keyMeta.mode ?? BACKUP_KEY_MODE),
      algorithm: String(keyMeta.algorithm ?? BACKUP_ALGORITHM),
      dekCipher: keyMeta.dekCipher,
      keyFingerprint: String(keyMeta.keyFingerprint ?? ''),
    },
  };
}

/** 随机 DEK + 用主密钥封装；返回信封字段（写入 meta.json）。 */
export function createEnvelope(master: Buffer): { dek: Buffer; envelope: BackupEnvelope } {
  const dek = crypto.randomBytes(KEY_BYTES);
  const wrapped = gcmEncrypt(master, dek);
  return {
    dek,
    envelope: {
      algorithm: BACKUP_ALGORITHM,
      iv: '',
      tag: '',
      keyMeta: {
        mode: BACKUP_KEY_MODE,
        algorithm: BACKUP_ALGORITHM,
        dekCipher: Buffer.concat([wrapped.iv, wrapped.cipher, wrapped.tag]).toString('base64'),
        keyFingerprint: keyFingerprint(master),
      },
    },
  };
}

export function unwrapDek(keyMeta: BackupKeyMeta, master: Buffer): Buffer {
  const raw = Buffer.from(keyMeta.dekCipher, 'base64');
  if (raw.length !== IV_BYTES + KEY_BYTES + TAG_BYTES) {
    throw new BackupError('BACKUP_META_INVALID', 'keyMeta.dekCipher 长度非法');
  }
  const expected = keyMeta.keyFingerprint;
  const actual = keyFingerprint(master);
  if (expected && expected !== actual) {
    throw new BackupError(
      'BACKUP_VERIFY_FAILED',
      `主密钥指纹不匹配（meta=${expected} / 当前=${actual}），该备份需用对应旧密钥解密`,
    );
  }
  return gcmDecrypt(
    master,
    raw.subarray(IV_BYTES, IV_BYTES + KEY_BYTES),
    raw.subarray(0, IV_BYTES),
    raw.subarray(IV_BYTES + KEY_BYTES),
    'DEK ',
  );
}

/** 加密明文（已压缩的 dump），返回密文与该文件的信封字段。 */
export function encryptBuffer(plain: Buffer, master: Buffer): { cipher: Buffer; envelope: BackupEnvelope } {
  const { dek, envelope } = createEnvelope(master);
  const body = gcmEncrypt(dek, plain);
  return {
    cipher: body.cipher,
    envelope: { ...envelope, iv: body.iv.toString('base64'), tag: body.tag.toString('base64') },
  };
}

/** 解密 .aes 密文；envelope 来自 meta.json。 */
export function decryptBuffer(cipher: Buffer, envelope: BackupEnvelope, master: Buffer): Buffer {
  const parsed = parseEnvelope(envelope);
  const dek = unwrapDek(parsed.keyMeta, master);
  return gcmDecrypt(
    dek,
    cipher,
    Buffer.from(parsed.iv, 'base64'),
    Buffer.from(parsed.tag, 'base64'),
    '归档',
  );
}
