/**
 * kernel/massAssign.js —— mass-assignment 防护（M-1 §6.3）
 *
 * 规则：
 *   1. 禁止整包透传请求体（整包透传式写法），一律白名单 pick
 *   2. 请求含 GLOBAL_FORBIDDEN_FIELDS 任一字段 -> 400 VALIDATION_ERROR
 *   3. 白名单交集为空 -> 400 NO_VALID_FIELDS
 *   4. 禁止静默丢弃高危字段
 */
import { GLOBAL_FORBIDDEN_FIELDS } from './constants.js';
import { badRequest } from './http.js';

/**
 * 从请求体中按白名单挑取字段。
 * @param {object} body 请求体
 * @param {string[]} whitelist 允许字段
 * @param {{ entityLabel?: string, allowEmpty?: boolean }} opts
 * @returns {object} data
 */
export function pickAllowed(body, whitelist, opts = {}) {
  const { entityLabel = '请求', allowEmpty = false } = opts;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('VALIDATION_ERROR', `${entityLabel}: 请求体必须是 JSON 对象`);
  }

  const forbidden = GLOBAL_FORBIDDEN_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(body, f));
  if (forbidden.length > 0) {
    throw badRequest(
      'VALIDATION_ERROR',
      `${entityLabel}: 包含禁止提交的字段 ${forbidden.join(', ')}`,
      { forbiddenFields: forbidden },
    );
  }

  const data = {};
  for (const key of whitelist) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (!allowEmpty && Object.keys(data).length === 0) {
    throw badRequest(
      'NO_VALID_FIELDS',
      `${entityLabel}: 没有可写入的有效字段`,
      { allowedFields: [...whitelist] },
    );
  }
  return data;
}

/** 创建场景：白名单 + 必填校验（必填字段缺失 -> 400） */
export function pickForCreate(body, whitelist, required, opts = {}) {
  const data = pickAllowed(body, whitelist, { ...opts, allowEmpty: true });
  const missing = required.filter((f) => data[f] === undefined || data[f] === null || data[f] === '');
  if (missing.length > 0) {
    throw badRequest('VALIDATION_ERROR', `缺少必填字段: ${missing.join(', ')}`, { missingFields: missing });
  }
  return data;
}
