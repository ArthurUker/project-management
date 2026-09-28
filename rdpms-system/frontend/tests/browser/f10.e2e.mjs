/**
 * tests/browser/f10.e2e.mjs —— F10 真实浏览器验证（离线被拒变更的持久化 + 恢复闭环）
 *
 * 复核要求（A09 / F10）：拒绝草稿必须「保存了但 UI 拿不回来」不再成立——
 * 用户要能查看、复制、重试、显式放弃；重试必须走**当前权限与最新基线**的校验。
 *
 * 本套件在**真实 Chromium + 真实 IndexedDB + 真实服务端**上执行：
 *   1. 作者离线编辑并保存 → 变更进入 outbox（页内读 IndexedDB 核对）；
 *   2. 撤销该成员的项目成员资格 → 上线 → 同步上行被服务端拒绝；
 *   3. 拒绝记录必须落在持久拒绝区（同一事务移出队列），原文一字不改；
 *   4. UI 能展开查看原文（不是只有一行原因）；
 *   5. 恢复成员资格后点击「重试」→ 变更真正落库，拒绝区与队列清空（恢复闭环）。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';
import { apiWrite, apiAs, apiFromNode, loginAs, findUserId, readToken } from './authHelper.mjs';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/round7');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let shot = 0;
const msg = (e) => String(e?.message ?? e).slice(0, 400);
function rec(id, name, ok, detail = '') {
  results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${detail ? ` | ${detail}` : ''}`);
}
function check(id, name, cond, detail = '') {
  rec(id, name, Boolean(cond), detail);
  if (!cond) throw new Error(`${id} 未通过：${detail}`);
}

const stack = await startStack({ suite: 'f10 (真实浏览器离线拒绝区)' });
stack.saveManifest(OUT, { finished: false });
console.log(`[f10] runId=${stack.runId} backend=${stack.backendPort} frontend=${stack.frontendPort} db=${stack.masked.database}`);

const ctx = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 1000 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

const reportRequests = [];
page.on('request', (req) => {
  try {
    const u = new URL(req.url());
    if (['POST', 'PUT'].includes(req.method()) && /^\/api\/reports/.test(u.pathname)) {
      let sent = null; try { sent = JSON.parse(req.postData() ?? '{}'); } catch { /* 非 JSON */ }
      reportRequests.push({ method: req.method(), path: u.pathname, clientMutationId: sent?.clientMutationId ?? null });
    }
  } catch { /* 观测失败不影响业务断言 */ }
});

async function snap(tag) {
  shot += 1;
  const base = path.join(OUT, `${stack.runId}-f10-${String(shot).padStart(2, '0')}-${tag}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`${base}.json`, JSON.stringify({
    url: page.url(),
    text: (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1200),
  }, null, 2));
}

/** 页内直接读真实 IndexedDB（浏览器证据，不是 fake-indexeddb） */
async function readOfflineDb() {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('rdpms-offline');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const read = (store) => new Promise((res, rej) => {
      if (!db.objectStoreNames.contains(store)) return res([]);
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const [outbox, deadLetters] = await Promise.all([read('outbox'), read('deadLetters')]);
    return { outbox, deadLetters };
  });
}

async function waitFor(fn, { timeout = 15000, interval = 300, label = '条件' } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`等待${label}超时`);
}

let saToken = null;
const fixtures = {};

try {
  // ══ 夹具：项目 + 作者(成员) + 一份草稿日报 ══════════════════════════════════
  const sa = await loginAs(page, stack, 'test_super_admin');
  saToken = await readToken(page);
  const authorId = await findUserId(page, 'test_member');
  const runTag = stack.runId.slice(-8);
  const projectRes = await apiWrite(page, '/api/projects', {
    body: { name: `F10-${runTag}`, type: 'TESTING', managerId: sa.id },
  });
  const project = projectRes.body;
  if (!project?.id) throw new Error(`创建项目失败：${JSON.stringify(projectRes.body)?.slice(0, 200)}`);
  await apiWrite(page, `/api/projects/${project.id}/members`, { body: { userId: authorId, role: 'MEMBER' } });

  const day = 10 + (Number.parseInt(stack.runId.slice(-6), 16) % 10);
  const D = `2026-09-${String(day).padStart(2, '0')}`;
  const OFFLINE_TEXT = 'F10-离线草稿-未提交';

  // 草稿必须由**执行人本人**创建：由管理员代建的记录作者是管理员，页面会正确判定为只读
  await loginAs(page, stack, 'test_member', { expectUserId: authorId });
  const draftRes = await apiWrite(page, '/api/reports', {
    body: {
      projectId: project.id,
      reportType: 'DAILY',
      periodKey: D,
      content: { projectReports: [{ projectId: project.id, plan: 'F10-原始内容', completed: '', nextPlan: '', docRefs: [] }] },
    },
  });
  const reportId = draftRes.body?.id;
  Object.assign(fixtures, {
    author: { username: 'test_member', userId: authorId },
    project: { id: project.id, name: project.name },
    reportId,
  });
  check('F10-a', '夹具就绪：作者为项目成员，且草稿的作者就是执行人本人',
    Boolean(reportId) && draftRes.body?.status === 'DRAFT' && draftRes.body?.authorId === authorId,
    `project=${project.id.slice(0, 8)} report=${String(reportId).slice(0, 8)} status=${draftRes.body?.status} author 匹配=${draftRes.body?.authorId === authorId}`);

  await page.goto(`${stack.apiBase}/reports/${reportId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ══ 1. 离线编辑并保存 → 变更进入 outbox（不发服务端请求）══════════════════
  reportRequests.length = 0;
  await ctx.setOffline(true);
  await page.waitForTimeout(800);
  const ta = page.locator('textarea').first();
  await ta.fill(OFFLINE_TEXT);
  await page.getByRole('button', { name: /保存草稿/ }).first().click();
  await page.waitForTimeout(1200);

  const afterOfflineSave = await readOfflineDb();
  check('F10-b', '离线保存：变更进入本地队列且未发起服务端写入',
    afterOfflineSave.outbox.length === 1 && reportRequests.filter((r) => r.method !== 'GET').length === 0,
    `outbox=${afterOfflineSave.outbox.length} 服务端写请求=${reportRequests.length} 内容=${String(afterOfflineSave.outbox[0]?.data?.content ? JSON.stringify(afterOfflineSave.outbox[0].data.content).slice(0, 60) : '')}`);
  const clientMutationId = afterOfflineSave.outbox[0]?.clientMutationId;

  // ══ 2. 撤销项目成员资格 → 上线 → 上行被服务端拒绝 ══════════════════════════
  // 浏览器此刻处于离线态，改夹具必须从 Node 侧发起（页面内 fetch 会 Failed to fetch）
  await apiFromNode(stack, `/api/projects/${project.id}/members/${authorId}`, saToken, { method: 'DELETE' });
  const membersAfterRemoval = await apiFromNode(stack, `/api/projects/${project.id}/members`, saToken);
  const stillMember = (Array.isArray(membersAfterRemoval.body) ? membersAfterRemoval.body : [])
    .some((m) => (m.userId ?? m.user?.id) === authorId && !m.leftAt);
  if (stillMember) throw new Error('夹具失效：成员资格未被撤销，拒绝路径无从验证');
  await ctx.setOffline(false);
  let dead;
  try {
    dead = await waitFor(async () => {
      const db = await readOfflineDb();
      return db.deadLetters.length ? db : null;
    }, { label: '拒绝区出现记录', timeout: 20000 });
  } catch (e) {
    const dbg = await readOfflineDb();
    const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const indicator = bodyText.match(/(同步中…|待同步 \d+|冲突 \d+|离线|已同步)/)?.[0] ?? '未知';
    throw new Error(`${msg(e)}｜诊断：outbox=${dbg.outbox.length} dead=${dbg.deadLetters.length} 同步指示=${indicator} url=${page.url()}`);
  }
  check('F10-c', '上行被服务端拒绝后：原文进入持久拒绝区，且同一事务已移出队列',
    dead.deadLetters.length === 1 && dead.outbox.length === 0,
    `deadLetters=${dead.deadLetters.length} outbox=${dead.outbox.length} key=${String(dead.deadLetters[0]?.key).slice(0, 40)}`);
  check('F10-d', '拒绝记录保留原始 payload / 主体归属 / 操作身份',
    dead.deadLetters[0]?.userId === authorId
      && dead.deadLetters[0]?.clientMutationId === clientMutationId
      && JSON.stringify(dead.deadLetters[0]?.payload ?? {}).includes(OFFLINE_TEXT),
    `userId 匹配=${dead.deadLetters[0]?.userId === authorId} key 匹配=${dead.deadLetters[0]?.clientMutationId === clientMutationId} 含原文=${JSON.stringify(dead.deadLetters[0]?.payload ?? {}).includes(OFFLINE_TEXT)}`);

  // 服务端状态用**管理员会话**核对：撤权后原成员对本资源应得到 404（隐藏存在性），
  // 这不是缺陷；用他的会话来读会得到 404，从而把「读不到」误判成「内容没写进去」
  const serverAfterReject = (await apiAs(page, `/api/reports/${reportId}`, saToken)).body;
  check('F10-e', '服务端内容未被修改（拒绝 = 真的没写进去）',
    !JSON.stringify(serverAfterReject.content ?? {}).includes(OFFLINE_TEXT),
    `服务端含离线原文=${JSON.stringify(serverAfterReject.content ?? {}).includes(OFFLINE_TEXT)}`);

  // ══ 3. UI：拒绝草稿可被发现、可展开查看（A09）══════════════════════════════
  await page.getByRole('button', { name: /已同步|待同步|冲突|离线|同步中/ }).first().click();
  await page.waitForTimeout(800);
  const dialogText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('F10-f', '同步面板列出被拒绝的变更（不再只有一行原因就「清除」）',
    /被拒绝/.test(dialogText) && /查看内容/.test(dialogText),
    dialogText.match(/被拒绝（\d+）[^|]{0,60}/)?.[0] ?? '未找到被拒区');
  await page.getByRole('button', { name: '查看内容' }).first().click();
  await page.waitForTimeout(600);
  const expanded = await page.locator('pre').first().innerText().catch(() => '');
  check('F10-g', '展开后能看到**原文 JSON**（可在界面复制/修复）',
    expanded.includes(OFFLINE_TEXT) || dialogText.includes(OFFLINE_TEXT),
    `pre 含原文=${expanded.includes(OFFLINE_TEXT)}`);
  await snap('f10-rejection-visible');

  // ══ 4. 恢复权限 → 点击「重试」→ 真正落库（恢复闭环）═══════════════════════
  // 恢复权限必须用**管理员会话**（执行人自己没有 projects.manage_members）
  await apiFromNode(stack, `/api/projects/${project.id}/members`, saToken, {
    method: 'POST',
    body: { userId: authorId, role: 'MEMBER' },
  });
  await page.getByRole('button', { name: '重试' }).first().click();
  await waitFor(async () => {
    const db = await readOfflineDb();
    return db.deadLetters.length === 0 && db.outbox.length === 0;
  }, { label: '拒绝区与队列清空', timeout: 20000 });
  const serverAfterRetry = (await apiAs(page, `/api/reports/${reportId}`, saToken)).body;
  check('F10-h', '恢复权限后重试：变更真正落库，拒绝区与队列清空',
    JSON.stringify(serverAfterRetry.content ?? {}).includes(OFFLINE_TEXT),
    `服务端含离线原文=${JSON.stringify(serverAfterRetry.content ?? {}).includes(OFFLINE_TEXT)} 拒绝区=0 队列=0`);

  rec('F10-i', '控制台错误（仅供排查，不参与判定）', true, `consoleErrors=${consoleErrors.length}`);
} catch (e) {
  rec('EXC', '用例执行中断', false, msg(e));
  await snap('exception');
} finally {
  await ctx.setOffline(false).catch(() => {});
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
  };
  fs.writeFileSync(path.join(OUT, `${stack.runId}-f10-results.json`), `${JSON.stringify({
    runId: stack.runId, suite: 'f10', fixtures, summary, results, consoleErrors: consoleErrors.slice(0, 10),
  }, null, 2)}\n`);
  stack.saveManifest(OUT, { fields: { fixtures, resultSummary: summary } });
  await ctx.close().catch(() => {});
  await stack.stop();
  console.log(`[f10] 汇总 ${summary.pass}/${summary.total} PASS`);
  process.exit(summary.fail ? 1 : 0);
}
