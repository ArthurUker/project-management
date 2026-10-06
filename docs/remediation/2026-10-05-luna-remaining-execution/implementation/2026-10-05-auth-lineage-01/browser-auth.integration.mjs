// Real owned Chrome pages + current candidate AuthProvider/http/tokenStore, real
// password login/Bearer/refresh + private PostgreSQL. CDP only controls owned tabs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const { PrismaClient } = await import(require.resolve('@prisma/client'));
const { serve } = await import(require.resolve('@hono/node-server'));
const bcrypt = require('bcryptjs'); const jwt = require('jsonwebtoken');
const { createApp } = await import(pathToFileURL(path.join(root, 'dist/bootstrap/createApp.js')));
const { authenticate, getAuth, requirePermission } = await import(pathToFileURL(path.join(root, 'dist/kernel/rbac.js')));
const sessionRoot = path.dirname(fileURLToPath(import.meta.url));
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.pathname.slice(1), process.env.RDPMS_EXEC_OWNED_DB);
const db = new PrismaClient(); const app = createApp({ db });
const password = 'Rp03 owned browser fixture 2026!';
const evidence = { layer: 'REAL_CHROME_SHARED_ORIGIN_HTTP_JWT_POSTGRES', cases: [], resources: {}, cleanup: {}, limits: [
  'Own minimal React harness mounts current candidate AuthProvider; not full product pages or release UI.',
  'Expiry token endpoint and protected mutation probe are owned test endpoints; use real signer/authenticate/current DB permissions. Not production routes.',
  'One stale-response test uses an explicit uncoordinated competing real HTTP caller to represent old/legacy traffic; normal two-tab locking is a separate test.',
  'No IndexedDB acceptance, no target/legacy deployment matrix, no D-S01-04 security-version policy acceptance.'
] };
let chrome, chromeExit, temp, server, base, cdp, tab1, tab2, actorA, actorB, armed;
let refreshCalls = 0;
const requests = [];
const serverCalls = [];
const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
async function deadline(promise, label, ms = 12000) {
  let timer; try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`OWNED_DEADLINE_${label}`)), ms); })]); }
  finally { clearTimeout(timer); }
}
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.pending = new Map(); this.events = new Map(); this.id = 0;
    this.opened = new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', () => reject(new Error('OWNED_CDP_OPEN_FAILED')), { once: true }); });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) { const item = this.pending.get(message.id); if (!item) return;
        this.pending.delete(message.id); message.error ? item.reject(new Error(item.method + ': ' + message.error.message)) : item.resolve(message.result); }
      else { const key = `${message.sessionId ?? ''}:${message.method}`; for (const cb of this.events.get(key) ?? []) cb(message.params); this.events.delete(key); }
    });
    this.ws.addEventListener('close', () => { for (const p of this.pending.values()) p.reject(new Error('OWNED_CDP_CLOSED')); this.pending.clear(); });
  }
  async send(method, params = {}, sessionId) {
    await this.opened; const id = ++this.id;
    const result = new Promise((resolve, reject) => this.pending.set(id, { method, resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return deadline(result, method, 15000);
  }
  once(sessionId, method) { const key = `${sessionId}:${method}`; return new Promise((resolve) => { const listeners = this.events.get(key) ?? []; listeners.push(resolve); this.events.set(key, listeners); }); }
}
async function evaluate(tab, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, tab);
  if (result.exceptionDetails) throw new Error('OWNED_BROWSER_EVALUATION: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
  return result.result.value;
}
async function page(route) {
  const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  // Prevent Chrome's shared HTTP-cache queue from serializing controlled held /me
  // responses. Both pages still use the same real origin/storage/Web Locks.
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.send('Page.enable', {}, sessionId); const loaded = cdp.once(sessionId, 'Page.loadEventFired');
  await cdp.send('Page.navigate', { url: base + route }, sessionId); await deadline(loaded, 'PAGE_LOAD');
  await evaluate(sessionId, 'new Promise(r=>window.bridge?r():window.addEventListener("rdpms-harness-ready",r,{once:true}))');
  return sessionId;
}
async function fixture(label) {
  const user = await db.user.create({ data: { username: `rp03-${label.toLowerCase()}-${crypto.randomUUID()}`, displayName: 'Synthetic browser actor',
    passwordHash: await bcrypt.hash(password, 4), status: 'ACTIVE', systemRole: 'MEMBER' } });
  const role = await db.role.create({ data: { code: `RP03_${crypto.randomUUID()}`, name: 'Synthetic browser permission',
    permissions: { create: [{ permission: { connect: { code: 'reports.update' } } }] } } });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return { user, role };
}
async function login(actor = actorA, tab = tab1) {
  await evaluate(tab, `bridge.login(${JSON.stringify(actor.user.username)},${JSON.stringify(password)})`);
  await evaluate(tab, `bridge.waitActor(${JSON.stringify(actor.user.id)})`);
  if (tab !== tab1 && tab !== tab2) return;
  for (const t of [tab1, tab2]) await evaluate(t, `bridge.waitActor(${JSON.stringify(actor.user.id)})`);
}
async function current(tab = tab1) { return evaluate(tab, 'bridge.state()'); }
function barrier(pathname, point = 'after', actorId) {
  assert.equal(armed, undefined); const entered = deferred(); const released = deferred();
  const g = { pathname, point, actorId, hit: false, entered: entered.promise, signalEntered: entered.resolve,
    release: released.resolve, released: released.promise };
  armed = g; return g;
}
async function release(g) { g.release(); if (armed === g) armed = undefined; }
function record(name, details = {}) { evidence.cases.push({ name, status: 'PASS', ...details }); }
const probes = async (marker) => db.systemLog.findMany({ where: { category: 'rp03-owned-probe', action: marker }, select: { userId: true, action: true } });

before(async () => {
  await db.$queryRaw`SELECT 1`; actorA = await fixture('A'); actorB = await fixture('B');
  app.get('/api/testing/expired-access', authenticate, (c) => c.json({ accessToken:
    jwt.sign({ userId: getAuth(c).userId, systemRole: 'MEMBER' }, process.env.JWT_SECRET, { expiresIn: -10 }) }));
  app.post('/api/auth/probe', authenticate, requirePermission('reports.update'), async (c) => {
    const body = await c.req.json(); const actorId = getAuth(c).userId;
    assert.equal(typeof body.clientMutationId, 'string'); assert.equal(body.content, 'synthetic-last-copy');
    requests.push({ actorId, commandKey: body.clientMutationId });
    await db.systemLog.create({ data: { level: 'INFO', category: 'rp03-owned-probe', action: body.clientMutationId, userId: actorId, message: 'Synthetic mutation applied' } });
    return c.json({ applied: true, actorId });
  });
  const bundle = await fs.readFile(path.join(sessionRoot, 'browser-entry.js'));
  const fetchRequest = async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/bundle.js') return new Response(bundle, { headers: { 'Content-Type': 'application/javascript' } });
    if (!url.pathname.startsWith('/api/')) return new Response(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div>${url.pathname === '/fallback' ? '<script>Object.defineProperty(navigator,"locks",{value:undefined})</script>' : ''}<script src="/bundle.js"></script></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    if (url.pathname === '/api/auth/refresh') refreshCalls++;
    const g = armed;
    let requestActor;
    if (g?.actorId) {
      const token = request.headers.get('Authorization')?.slice(7);
      if (token) { try { requestActor = jwt.verify(token, process.env.JWT_SECRET).userId; } catch { /* genuine expiry */ } }
    }
    const matches = g && !g.hit && g.pathname === url.pathname && (!g.actorId || g.actorId === requestActor);
    const trace = { path: url.pathname, method: request.method, barrierPath: g?.pathname ?? null,
      barrierHit: Boolean(matches), point: g?.point ?? null };
    serverCalls.push(trace);
    if (matches) { g.hit = true; if (g.point === 'before') { g.signalEntered(); await g.released; } }
    const response = await app.fetch(request);
    trace.status = response.status;
    if (matches && g.point === 'after') { g.signalEntered(); await g.released; }
    return response;
  };
  server = serve({ fetch: fetchRequest, hostname: '127.0.0.1', port: 0 });
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'rdpms-auth-browser-')); const profile = path.join(temp, 'profile');
  const endpoint = deferred(); let stderr = '';
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-breakpad',
    '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chromeExit = new Promise((resolve) => chrome.once('exit', (code, signal) => resolve({ code, signal })));
  chrome.stderr.on('data', (chunk) => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) endpoint.resolve(match[1]); });
  cdp = new CDP(await deadline(endpoint.promise, 'CHROME_START')); await cdp.opened;
  tab1 = await page('/a'); tab2 = await page('/b');
  await evaluate(tab1, 'localStorage.setItem("synthetic.unsent","last-copy")');
  evidence.resources = { browser: 'Existing Chrome, owned unique headless profile', tempRoot: temp, bindHost: '127.0.0.1',
    database: process.env.RDPMS_EXEC_OWNED_DB, sameOrigin: base, twoTabs: true };
});
after(async () => {
  if (armed) await release(armed);
  if (cdp) { try { await cdp.send('Browser.close'); } catch { /* close tears down socket */ } }
  if (chrome) {
    try { evidence.cleanup.chromeExit = await deadline(chromeExit, 'CHROME_EXIT', 5000); }
    catch { chrome.kill('SIGTERM'); evidence.cleanup.chromeExit = await deadline(chromeExit, 'CHROME_TERM', 5000); }
  }
  if (temp && !chrome?.exitCode && chrome?.signalCode === null) {
    // exitCode 0 is falsy; lifecycle proof below is the settled exit promise, not truthiness.
  }
  if (temp && evidence.cleanup.chromeExit) { await fs.rm(temp, { recursive: true }); evidence.cleanup.ownedProfileRemoved = true; }
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  evidence.cleanup.serverClosed = !server?.listening; await db.$disconnect();
  evidence.actualMutationActors = requests;
  evidence.serverCalls = serverCalls;
  const out = path.join(sessionRoot, 'evidence', `browser-evidence-${crypto.randomUUID()}.json`);
  await fs.writeFile(out, JSON.stringify(evidence, null, 2) + '\n');
  console.log('Owned browser evidence:', path.relative(sessionRoot, out));
});

test('normal real two-tab expired access coalesces refresh, commits one same-family successor and preserves immutable A actor', async () => {
  await login(); const before = await current(); const rowsBefore = await db.refreshToken.count({ where: { userId: actorA.user.id } });
  await evaluate(tab1, 'bridge.expire()'); const count = refreshCalls;
  const g = barrier('/api/auth/refresh', 'after');
  await evaluate(tab1, 'bridge.start("normal-tab1")');
  try { await deadline(g.entered, 'NORMAL_REFRESH'); await evaluate(tab2, 'bridge.start("normal-tab2")'); }
  finally { await release(g); }
  assert.equal((await evaluate(tab1, 'bridge.finish("normal-tab1")')).result, 'OK');
  assert.equal((await evaluate(tab2, 'bridge.finish("normal-tab2")')).result, 'OK');
  assert.equal(refreshCalls - count, 1); assert.equal(await db.refreshToken.count({ where: { userId: actorA.user.id } }), rowsBefore + 1);
  const a = await current(tab1); const b = await current(tab2);
  assert.equal(a.generation, before.generation); assert.equal(a.fingerprint, b.fingerprint); assert.equal(a.actorId, actorA.user.id);
  for (const marker of ['normal-tab1', 'normal-tab2']) assert.deepEqual(await probes(marker), [{ userId: actorA.user.id, action: marker }]);
  record('NORMAL_TWO_TAB', { refreshCalls: 1, actualActor: actorA.user.id });
});

test('S02-OPEN-05 real losing old-refresh401 after competing successor write preserves successor in both tabs', async () => {
  await login(); await evaluate(tab1, 'bridge.expire()'); const g = barrier('/api/auth/refresh', 'before');
  await evaluate(tab1, 'bridge.start("late-old-loser")'); let winner;
  try { await deadline(g.entered, 'OLD_REFRESH_BEFORE_CONSUME'); await evaluate(tab2, 'bridge.compete()'); winner = await current(tab2); }
  finally { await release(g); }
  assert.equal((await evaluate(tab1, 'bridge.finish("late-old-loser")')).result, 'OK');
  for (const tab of [tab1, tab2]) assert.equal((await current(tab)).fingerprint, winner.fingerprint);
  assert.deepEqual(await probes('late-old-loser'), [{ userId: actorA.user.id, action: 'late-old-loser' }]);
  record('LATE_OLD_FAILURE_AFTER_SUCCESSOR', { realTabs: 2, caller: 'explicit legacy/uncoordinated real-HTTP competitor' });
});

for (const outcome of ['success', 'failure']) {
  test(`real old refresh ${outcome} after B login never overwrites B or applies A mutation as B`, async () => {
    await login(); await evaluate(tab1, 'bridge.expire()'); const g = barrier('/api/auth/refresh', outcome === 'success' ? 'after' : 'before');
    const marker = `switch-${outcome}`; await evaluate(tab1, `bridge.start(${JSON.stringify(marker)})`); let b;
    try { await deadline(g.entered, 'HELD_REFRESH');
      if (outcome === 'failure') await db.refreshToken.updateMany({ where: { userId: actorA.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await login(actorB, tab2); b = await current(tab2);
    } finally { await release(g); }
    assert.equal((await evaluate(tab1, `bridge.finish(${JSON.stringify(marker)})`)).code, 'SESSION_CHANGED');
    for (const tab of [tab1, tab2]) { await evaluate(tab, `bridge.waitActor(${JSON.stringify(actorB.user.id)})`);
      assert.equal((await current(tab)).fingerprint, b.fingerprint); assert.equal((await current(tab)).shownActor, actorB.user.id); }
    assert.deepEqual(await probes(marker), []);
    record(`A_TO_B_LATE_REFRESH_${outcome.toUpperCase()}`, { actualACommandApplications: 0, newerActor: actorB.user.id });
  });
}

test('actual AuthProvider delayed /me and logout completions cannot overwrite or clear newer B', async () => {
  for (const operation of ['profile', 'logout']) {
    await login(); const g = barrier(operation === 'profile' ? '/api/auth/me' : '/api/auth/logout', 'after', actorA.user.id);
    const marker = `late-${operation}`; await evaluate(tab1, `bridge.start(${JSON.stringify(marker)},${JSON.stringify(operation)})`); let b;
    try { await deadline(g.entered, 'HELD_AUTH_COMPLETION'); await login(actorB, tab2); b = await current(tab2); }
    finally { await release(g); }
    const result = await evaluate(tab1, `bridge.finish(${JSON.stringify(marker)})`);
    assert.equal(result.result, operation === 'logout' ? 'OK' : 'ERROR');
    for (const tab of [tab1, tab2]) { assert.equal((await current(tab)).fingerprint, b.fingerprint);
      assert.equal((await current(tab)).shownActor, actorB.user.id); }
    record(`AUTH_PROVIDER_LATE_${operation.toUpperCase()}`, { currentActor: actorB.user.id });
  }
});

test('genuinely expired current refresh clears both tabs and navigates only its current generation to login', async () => {
  await login(); await evaluate(tab1, 'bridge.expire()');
  await db.refreshToken.updateMany({ where: { userId: actorA.user.id, revokedAt: null }, data: { expiresAt: new Date(0) } });
  await evaluate(tab1, 'bridge.start("invalid-current")'); const result = await evaluate(tab1, 'bridge.finish("invalid-current")');
  assert.equal(result.code, 'INVALID_REFRESH_TOKEN');
  for (const tab of [tab1, tab2]) { await evaluate(tab, 'bridge.waitActor(null)'); assert.equal((await current(tab)).actorId, null); }
  assert.equal((await current(tab1)).path, '/login'); assert.deepEqual(await probes('invalid-current'), []);
  record('INVALID_CURRENT_REFRESH', { currentSessionCleared: true, noMutation: true });
});

test('real committed refresh response loss blocks silent retry, preserves last copy and recovers by explicit password login', async () => {
  await login(); await evaluate(tab1, 'bridge.expire()'); const before = await current();
  const active = await db.refreshToken.findFirstOrThrow({ where: { userId: actorA.user.id, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  const rows = await db.refreshToken.count({ where: { userId: actorA.user.id } }); const count = refreshCalls;
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*api/auth/refresh', requestStage: 'Response' }] }, tab1);
  const intercepted = cdp.once(tab1, 'Fetch.requestPaused');
  await evaluate(tab1, 'bridge.start("committed-response-loss")');
  try {
    const event = await deadline(intercepted, 'REFRESH_COMMITTED_RESPONSE'); assert.equal(event.responseStatusCode, 200);
    assert.ok((await db.refreshToken.findUniqueOrThrow({ where: { id: active.id } })).revokedAt);
    assert.equal(await db.refreshToken.count({ where: { userId: actorA.user.id } }), rows + 1);
    // Fail the actual browser response after the real transaction committed;
    // no adapter or fabricated backend failure is used.
    await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'ConnectionClosed' }, tab1);
    assert.equal((await evaluate(tab1, 'bridge.finish("committed-response-loss")')).code, 'REFRESH_OUTCOME_UNKNOWN');
  } finally { await cdp.send('Fetch.disable', {}, tab1); }
  for (const tab of [tab1, tab2]) { const state = await current(tab); assert.equal(state.actorId, actorA.user.id);
    assert.equal(state.generation, before.generation); assert.equal(state.refreshBlocked, true); assert.equal(state.canRefresh, false); }
  await evaluate(tab1, 'bridge.start("uncertain-retry")');
  assert.equal((await evaluate(tab1, 'bridge.finish("uncertain-retry")')).code, 'REFRESH_OUTCOME_UNKNOWN');
  assert.equal(refreshCalls, count + 1); assert.deepEqual(await probes('committed-response-loss'), []);
  assert.deepEqual(await probes('uncertain-retry'), []); assert.equal(await evaluate(tab1, 'bridge.unsent()'), 'last-copy');
  await login(); assert.notEqual((await current()).generation, before.generation);
  await evaluate(tab1, 'bridge.start("relogin-recovery")'); assert.equal((await evaluate(tab1, 'bridge.finish("relogin-recovery")')).result, 'OK');
  assert.deepEqual(await probes('relogin-recovery'), [{ userId: actorA.user.id, action: 'relogin-recovery' }]);
  record('COMMITTED_RESPONSE_LOSS', { realCommittedSuccessor: 1, automaticRetries: 0, lostCopy: false, explicitPasswordRecovery: true });
});

test('real permission403 and CDP offline network fault never refresh or clear the valid session', async () => {
  await login(); const before = await current(); const count = refreshCalls;
  await db.userRole.deleteMany({ where: { userId: actorA.user.id } });
  try { await evaluate(tab1, 'bridge.start("permission-denied")'); assert.equal((await evaluate(tab1, 'bridge.finish("permission-denied")')).status, 403); }
  finally { await db.userRole.create({ data: { userId: actorA.user.id, roleId: actorA.role.id } }); }
  await cdp.send('Network.enable', {}, tab1);
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, tab1);
  try { await evaluate(tab1, 'bridge.start("offline-command")'); assert.equal((await evaluate(tab1, 'bridge.finish("offline-command")')).code, 'NETWORK_ERROR'); }
  finally { await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, tab1); }
  assert.equal((await current()).fingerprint, before.fingerprint); assert.equal(refreshCalls, count);
  assert.deepEqual(await probes('permission-denied'), []); assert.deepEqual(await probes('offline-command'), []);
  record('CURRENT_PERMISSION_AND_NETWORK', { refreshCalls: 0, unauthorizedWrites: 0 });
});

test('no-Web-Locks page isolates memory session and never overwrites shared B or auto-refreshes', async () => {
  await login(actorB); const b = await current(); const fallback = await page('/fallback');
  assert.equal((await current(fallback)).actorId, null); await login(actorA, fallback); assert.equal((await current(fallback)).canRefresh, false);
  const count = refreshCalls; await evaluate(fallback, 'bridge.memoryExpire()'); await evaluate(fallback, 'bridge.start("fallback-expired")');
  assert.equal((await evaluate(fallback, 'bridge.finish("fallback-expired")')).code, 'SESSION_COORDINATION_UNAVAILABLE');
  assert.equal(refreshCalls, count); assert.equal((await current(fallback)).actorId, actorA.user.id);
  for (const tab of [tab1, tab2]) assert.equal((await current(tab)).fingerprint, b.fingerprint);
  assert.equal(await evaluate(tab1, 'bridge.unsent()'), 'last-copy');
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' }, tab1);
  await fs.writeFile(path.join(sessionRoot, 'evidence', 'owned-auth-provider-final.png'), Buffer.from(screenshot.data, 'base64'));
  record('CAPABILITY_FALLBACK', { sharedBUnchanged: true, automaticRefreshes: 0, lastCopyMarkerPreserved: true });
});
