/**
 * platform/idempotency/payloadHash.js —— 请求内容哈希（RF02）
 *
 * 用途：幂等回执绑定「请求内容哈希」。同幂等键、不同内容必须拒绝（409），
 * 不能把第一次的响应回放给内容不同的第二次请求。
 *
 * 关键点：键排序后再哈希，保证等价请求（键序不同）得到同一哈希；
 * 哈希只覆盖调用方显式传入的规范化内容，不包含服务端时间/随机数。
 */
import crypto from 'node:crypto';

/** 稳定序列化：对象键按字典序递归排序 */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

/** 规范化 JSON 字符串（用于哈希与比对） */
export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value ?? null));
}

/** sha256(canonicalJson(payload))，hex 小写，长度 64 */
export function hashPayload(payload) {
  return crypto.createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}
