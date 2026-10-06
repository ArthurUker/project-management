// Controlled adapters/storage/lock queue: UNIT evidence, not real browser/JWT/IDB.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
const tails = new Map<string, Promise<unknown>>();
const lockHits: string[] = [];
const locks = { request: (key: string, options: unknown, callback?: () => unknown) => {
  const fn = (typeof options === 'function' ? options : callback) as () => unknown;
  const before = tails.get(key) ?? Promise.resolve();
  const next = before.catch(() => undefined).then(() => { lockHits.push(key); return fn(); });
  tails.set(key, next); return next;
} };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true });
Object.defineProperty(globalThis, 'window', { value: { addEventListener() {} }, configurable: true });
const { tokenStore } = await import('../../src/auth/tokenStore');
const { http } = await import('../../src/api/http');
const { authAPI } = await import('../../src/api/endpoints/auth');
const { ApiError } = await import('../../src/api/error');

const access = (actor: string, revision = '0') => `e30.${btoa(JSON.stringify({ userId: actor, revision }))}.synthetic`;
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const response = (config: InternalAxiosRequestConfig, data = {}, status = 200) =>
  ({ config, data, status, statusText: 'synthetic', headers: {} });
const failure = (config: InternalAxiosRequestConfig, code: string, status = 401) =>
  new AxiosError('synthetic failure', 'ERR_BAD_RESPONSE', config, undefined, response(config, { code, error: code }, status));
async function login(actor = 'A') {
  const ticket = await tokenStore.beginLogin();
  const s = await tokenStore.finishLogin(ticket, actor, access(actor), `refresh-${actor}-${ticket.generation}`);
  assert.ok(s); return s;
}
beforeEach(async () => {
  await tokenStore.clearGeneration(tokenStore.generation()); values.clear(); lockHits.length = 0;
  http.defaults.adapter = async (config) => response(config);
  axios.defaults.adapter = async (config) => response(config);
});

test('legacy two-key credentials are not imported; unrelated last-copy storage is untouched', () => {
  values.set('rdpms.accessToken', access('legacy')); values.set('rdpms.refreshToken', 'legacy');
  values.set('synthetic.unsent', 'last-copy');
  assert.equal(tokenStore.hasSession(), false); assert.equal(tokenStore.getAccessToken(), null);
  assert.equal(values.get('synthetic.unsent'), 'last-copy');
});

test('later B login supersedes delayed A login ticket; same actor relogin also changes generation', async () => {
  const ticket = await tokenStore.beginLogin(); const b = await login('B');
  assert.equal(await tokenStore.finishLogin(ticket, 'A', access('A'), 'old-A'), null);
  assert.deepEqual(tokenStore.snapshot(), b);
  const b2 = await login('B'); assert.notEqual(b.loginGeneration, b2.loginGeneration);
  assert.equal(tokenStore.sameLogin(b), false);
});

test('old failure cannot clear same-login successor or new identity; terminal current failure emits exact generation', async () => {
  const a = await login(); const next = await tokenStore.rotate(a, access('A', '1'), 'refresh-next'); assert.ok(next);
  assert.equal(await tokenStore.expireIfOwned(a), false); assert.deepEqual(tokenStore.snapshot(), next);
  const b = await login('B'); assert.equal(await tokenStore.expireIfOwned(next), false);
  let expiredGeneration = ''; const off = tokenStore.onSessionExpired((g) => { expiredGeneration = g; });
  try { assert.equal(await tokenStore.expireIfOwned(b), true); assert.equal(tokenStore.hasSession(), false);
    assert.equal(expiredGeneration, tokenStore.generation()); }
  finally { off(); }
});

for (const status of [200, 401, 403]) {
  test(`late ordinary ${status} A response after B login is rejected and never clears B or refreshes`, async () => {
    await login(); const entered = deferred<void>(); const release = deferred<void>(); let refreshes = 0;
    http.defaults.adapter = async (config) => { entered.resolve(); await release.promise;
      if (status !== 200) throw failure(config, status === 401 ? 'INVALID_TOKEN' : 'PERMISSION_DENIED', status);
      return response(config, { actor: 'A' }); };
    axios.defaults.adapter = async (config) => { refreshes++; return response(config); };
    const pending = http.post('/owned-write', { clientMutationId: 'original-A', content: 'last-copy' });
    const result = pending.then(() => 'UNEXPECTED_SUCCESS', (error) => error.code);
    await entered.promise; const b = await login('B'); release.resolve();
    assert.equal(await result, 'SESSION_CHANGED'); assert.deepEqual(tokenStore.snapshot(), b); assert.equal(refreshes, 0);
  });
}

for (const outcome of ['success', 'failure', 'network']) {
  test(`late refresh ${outcome} A after B cannot write/clear B or replay original`, async () => {
    await login(); const entered = deferred<void>(); const release = deferred<void>(); let requests = 0;
    http.defaults.adapter = async (config) => { requests++; throw failure(config, 'INVALID_TOKEN'); };
    axios.defaults.adapter = async (config) => { entered.resolve(); await release.promise;
      if (outcome === 'failure') throw failure(config, 'INVALID_REFRESH_TOKEN');
      if (outcome === 'network') throw new AxiosError('synthetic network', 'ERR_NETWORK', config);
      return response(config, { accessToken: access('A', '1'), refreshToken: 'next-A' }); };
    const pending = http.post('/owned-write', { key: 'A-immutable', content: 'last-copy' });
    const result = pending.then(() => 'UNEXPECTED_SUCCESS', (error) => error.code);
    await entered.promise; const b = await login('B'); release.resolve();
    assert.equal(await result, 'SESSION_CHANGED'); assert.deepEqual(tokenStore.snapshot(), b); assert.equal(requests, 1);
  });
}

test('old refresh success cannot revive logout or overwrite same actor new login', async () => {
  for (const transition of ['logout', 'relogin']) {
    const a = await login(); const entered = deferred<void>(); const release = deferred<void>();
    http.defaults.adapter = async (config) => { throw failure(config, 'INVALID_TOKEN'); };
    axios.defaults.adapter = async (config) => { entered.resolve(); await release.promise;
      return response(config, { accessToken: access('A', '1'), refreshToken: 'old-success' }); };
    const result = http.get('/auth/me').then(() => 'UNEXPECTED_SUCCESS', (e) => e.code);
    await entered.promise;
    if (transition === 'logout') await tokenStore.clearGeneration(a.loginGeneration); else await login('A');
    const before = tokenStore.snapshot(); release.resolve();
    assert.equal(await result, 'SESSION_CHANGED'); assert.deepEqual(tokenStore.snapshot(), before);
  }
});

test('one-module parallel requests singleflight once; replay actor, method and payload/key stay original', async () => {
  const a = await login(); let refreshes = 0; const seen: Array<{ actor: string | null; data: unknown; retry: boolean }> = [];
  http.defaults.adapter = async (config) => {
    const actor = config.headers.Authorization === `Bearer ${a.accessToken}` ? 'A-old' : 'A-new';
    const retry = (config as InternalAxiosRequestConfig & { _retry?: boolean })._retry === true;
    seen.push({ actor, data: JSON.parse(config.data), retry });
    if (!retry) throw failure(config, 'INVALID_TOKEN');
    assert.equal(config.method, 'post'); return response(config, { applied: true });
  };
  axios.defaults.adapter = async (config) => { refreshes++; return response(config,
    { accessToken: access('A', '1'), refreshToken: 'successor-A' }); };
  const body = { clientMutationId: 'immutable-key', content: { value: 'last-copy' } };
  const results = await Promise.all(Array.from({ length: 3 }, () => http.post('/owned-write', body)));
  assert.equal(results.length, 3); assert.equal(refreshes, 1); assert.equal(tokenStore.snapshot()?.tokenRevision, 1);
  assert.equal(seen.filter((r) => r.retry).length, 3); assert.ok(seen.every((r) => JSON.stringify(r.data) === JSON.stringify(body)));
  assert.ok(seen.filter((r) => r.retry).every((r) => r.actor === 'A-new'));
  assert.ok(lockHits.some((key) => key.startsWith('rdpms.refresh:')));
});

test('genuinely invalid current refresh clears current credentials; not public login401', async () => {
  await login(); http.defaults.adapter = async (config) => { throw failure(config, 'INVALID_TOKEN'); };
  axios.defaults.adapter = async (config) => { throw failure(config, 'INVALID_REFRESH_TOKEN'); };
  await assert.rejects(http.get('/auth/me'), (e: ApiError) => e.code === 'INVALID_REFRESH_TOKEN');
  assert.equal(tokenStore.hasSession(), false);
  const b = await login('B'); http.defaults.adapter = async (config) => { throw failure(config, 'BAD_CREDENTIALS'); };
  await assert.rejects(authAPI.login({ username: 'bad', password: 'synthetic' }), (e: ApiError) => e.code === 'BAD_CREDENTIALS');
  assert.deepEqual(tokenStore.snapshot(), b);
});

for (const outcome of ['replayed', 'network', 'server', 'malformed', 'wrong-actor']) {
  test(`refresh ${outcome} preserves current tokens, blocks further automatic refresh and keeps last copy`, async () => {
    const a = await login(); values.set('synthetic.unsent', 'last-copy'); let refreshes = 0;
    http.defaults.adapter = async (config) => { throw failure(config, 'INVALID_TOKEN'); };
    axios.defaults.adapter = async (config) => { refreshes++;
      if (outcome === 'replayed') throw failure(config, 'REFRESH_TOKEN_REPLAYED');
      if (outcome === 'network') throw new AxiosError('synthetic network', 'ERR_NETWORK', config);
      if (outcome === 'server') throw failure(config, 'INTERNAL_ERROR', 500);
      return response(config, outcome === 'wrong-actor' ? { accessToken: access('B'), refreshToken: 'B-next' } : {});
    };
    await assert.rejects(http.get('/auth/me')); const after = tokenStore.snapshot();
    assert.equal(after?.accessToken, a.accessToken); assert.equal(after?.refreshToken, a.refreshToken);
    assert.equal(after?.refreshBlocked, true); assert.equal(tokenStore.canRefresh(), false);
    await assert.rejects(http.get('/auth/me')); assert.equal(refreshes, 1); assert.equal(values.get('synthetic.unsent'), 'last-copy');
  });
}

test('stale invalid refresh after successor commit does not clear successor', async () => {
  const a = await login(); const entered = deferred<void>(); const release = deferred<void>();
  http.defaults.adapter = async (config) => { throw failure(config, 'INVALID_TOKEN'); };
  axios.defaults.adapter = async (config) => { entered.resolve(); await release.promise; throw failure(config, 'INVALID_REFRESH_TOKEN'); };
  const result = http.get('/auth/me').catch((e) => e.code); await entered.promise;
  const next = await tokenStore.rotate(a, access('A', '1'), 'A-successor'); assert.ok(next); release.resolve();
  assert.equal(await result, 'INVALID_REFRESH_TOKEN'); assert.deepEqual(tokenStore.snapshot(), next);
});

test('permission403 and ordinary offline do not refresh, clear or block valid session', async () => {
  const a = await login(); let refreshes = 0;
  axios.defaults.adapter = async (config) => { refreshes++; return response(config); };
  http.defaults.adapter = async (config) => { throw failure(config, 'PERMISSION_DENIED', 403); };
  await assert.rejects(http.get('/protected'), (e: ApiError) => e.status === 403);
  http.defaults.adapter = async (config) => { throw new AxiosError('offline', 'ERR_NETWORK', config); };
  await assert.rejects(http.get('/protected'), (e: ApiError) => e.code === 'NETWORK_ERROR');
  assert.equal(refreshes, 0); assert.deepEqual(tokenStore.snapshot(), a);
});

test('explicit captured logout cannot borrow B token or refresh; stale local clear is rejected', async () => {
  const a = await login(); const b = await login('B'); let seen = '';
  http.defaults.adapter = async (config) => { seen = String(config.headers.Authorization); return response(config, { success: true }); };
  await authAPI.logout(a.refreshToken, a.accessToken);
  assert.equal(seen, `Bearer ${a.accessToken}`); assert.equal(await tokenStore.clearGeneration(a.loginGeneration), false);
  assert.deepEqual(tokenStore.snapshot(), b);
});
