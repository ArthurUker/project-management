/**
 * tests/browser/authHelper.mjs —— 浏览器套件共用的鉴权与 API 断言工具
 *
 * 背景（审查确认的测试有效性缺陷）：
 *   产品 `tokenStore.ts` 把**原始 JWT** 存在 `localStorage['rdpms.accessToken']`，
 *   而旧套件的 token() 只在 JSON 字符串里找 `"accessToken":"..."`，导致 api() 实际未带 Authorization，
 *   401 被 `body?.list ?? []` 静默解释成「数据库 0 条」，并派生出 `/reports/undefined`。
 *
 * 本模块：
 *   - 统一从 `rdpms.accessToken` 读取令牌（兼容 JSON 包裹的旧形态），取不到即抛错（不再静默继续）；
 *   - `api()` 在非 2xx 时**显式抛错并附带 status/body**，禁止把 401/403 当成空数据；
 *   - `apiOk()` 用于「必须成功」的读取，返回 body。
 */

export const TOKEN_KEY = 'rdpms.accessToken';

/** 读取当前浏览器上下文中的访问令牌；取不到 → 抛错（属测试环境/鉴权缺陷，不是业务 0 条） */
export async function readToken(page) {
  const token = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parsed;
        if (parsed && typeof parsed === 'object') return parsed.accessToken ?? parsed.token ?? null;
      } catch {
        return raw; // 原始 JWT（产品实际形态）
      }
    }
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) ?? '';
      const m = /"accessToken":"([^"]+)"/.exec(v);
      if (m) return m[1];
      if (/^ey[\w-]+\.[\w-]+\./.test(v)) return v;
    }
    return null;
  }, TOKEN_KEY);
  if (!token) {
    throw new Error(`TEST-AUTH: 页面中取不到访问令牌（localStorage['${TOKEN_KEY}'] 缺失）——断言不可继续`);
  }
  return token;
}

/**
 * 在页面上下文内发起 API 调用。
 * @param {boolean} [options.allowFailure] true 时不抛错（用于「预期失败」的断言）；默认非 2xx 抛错
 */
export async function api(page, path, { allowFailure = false, ...init } = {}) {
  const token = await readToken(page);
  const res = await page.evaluate(async ({ path, init, token }) => {
    const headers = { ...(init.headers ?? {}), Authorization: `Bearer ${token}` };
    const r = await fetch(path, { ...init, headers });
    let body = null;
    const text = await r.text().catch(() => '');
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
    return { status: r.status, body, headers: { replay: r.headers.get('idempotent-replay') } };
  }, { path, init, token });

  if (!allowFailure && (res.status < 200 || res.status >= 300)) {
    throw new Error(`TEST-API-FAILED: ${init.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(res.body)?.slice(0, 300)}`);
  }
  return res;
}

/** 必须成功的读取，直接返回 body */
export async function apiOk(page, path) {
  const res = await api(page, path);
  return res.body;
}
