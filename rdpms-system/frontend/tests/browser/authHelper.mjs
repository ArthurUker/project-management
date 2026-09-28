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

/** 必须成功的写入；返回 { status, body }，非 2xx 直接抛错 */
export async function apiWrite(page, path, { method = 'POST', body } = {}) {
  return api(page, path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * 清空浏览器会话（localStorage / sessionStorage / cookie）。
 * 注意：必须在**应用源**下执行——about:blank 属于不透明源，访问 localStorage 会抛 SecurityError，
 * 结果是「以为清了、其实没清」，随后 /login 被已登录用户重定向走，表单永远不出现。
 */
export async function clearSession(page, stack) {
  const ctx = page.context();
  await page.goto(`${stack.apiBase}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
  await ctx.clearCookies().catch(() => {});
}

/**
 * 登录并校验**主体身份**：登录后必须能 200 取到 /api/auth/me，且 id 与期望一致。
 * 旧的失败套件在 token 读取失败后继续执行，把 401 当成「0 条」，导致结论完全反向。
 */
/** 输入框填写：React 首渲染可能把节点换掉，重试而不是直接放弃 */
async function fillWithRetry(locator, value, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await locator.fill(value, { timeout: 8000 });
      return;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastError;
}

export async function loginAs(page, stack, username, { password, expectUserId } = {}) {
  await clearSession(page, stack);
  await page.goto(`${stack.apiBase}/login`, { waitUntil: 'domcontentloaded' });
  const userInput = page.getByPlaceholder('请输入用户名');
  await userInput.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
  await fillWithRetry(userInput, username);
  await fillWithRetry(page.getByPlaceholder('请输入密码'), password ?? stack.testEnv.SEED_TEST_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
  await page.waitForLoadState('networkidle');

  const me = await apiOk(page, '/api/auth/me');
  if (!me?.id || !me?.username) {
    throw new Error(`TEST-AUTH: /api/auth/me 形状异常：${JSON.stringify(me)?.slice(0, 200)}`);
  }
  if (me.username !== username) {
    throw new Error(`TEST-AUTH: 期望登录 ${username}，实际主体为 ${me.username}`);
  }
  if (expectUserId && me.id !== expectUserId) {
    throw new Error(`TEST-AUTH: 主体 id 不匹配（期望 ${expectUserId}，实际 ${me.id}）`);
  }
  return me;
}

/**
 * 用**显式 token**（通常是提前保存的另一账号会话）发起 API 调用。
 * 用于「执行人登录态下核对审计/管理口径」，避免为了读一条审计反复切换账号。
 */
export async function apiAs(page, path, token, { method = 'GET', body, allowFailure = false } = {}) {
  const res = await page.evaluate(async ({ path, token, method, body }) => {
    const r = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text().catch(() => '');
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 300) }; }
    return { status: r.status, body: parsed };
  }, { path, token, method, body: body ?? null });
  if (!allowFailure && (res.status < 200 || res.status >= 300)) {
    throw new Error(`TEST-API-FAILED(as): ${method} ${path} → ${res.status} ${JSON.stringify(res.body)?.slice(0, 200)}`);
  }
  return res;
}

/** 通过用户名解析用户 id（需要 users.view 权限的账号执行） */
export async function findUserId(page, username) {
  const body = await apiOk(page, `/api/users?keyword=${encodeURIComponent(username)}&pageSize=50`);
  const rows = body?.list ?? body?.items ?? [];
  const hit = rows.find((u) => u.username === username);
  if (!hit) throw new Error(`TEST-FIXTURE: 找不到测试账号 ${username}`);
  return hit.id;
}
