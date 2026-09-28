/**
 * tests/browser/a03.e2e.mjs —— A03 真实浏览器验证：账号切换的本地数据隔离
 *
 * 复核要求（A03/A06）：账号切换后 B 不得读到 A 的缓存 / 游标 / ACL / 冲突 / 拒绝草稿，
 * 且**不得靠静默清空用户内容**来实现隔离。
 *
 * 本套件在真实 Chromium + 真实 IndexedDB 上执行：
 *   1. A 登录并完成一轮同步 → A 的分片键（游标/ACL）真实存在；
 *   2. A 点「登出」→ A 的分片键被清理（共享设备安全），持久拒绝区按策略保留；
 *   3. B 登录并同步 → B 看不到任何 A 的键与记录；页面同步面板无冲突/被拒记录。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';
import { apiWrite, loginAs, findUserId, readToken, apiFromNode } from './authHelper.mjs';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/round7');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const msg = (e) => String(e?.message ?? e).slice(0, 400);
function rec(id, name, ok, detail = '') {
  results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${detail ? ` | ${detail}` : ''}`);
}
function check(id, name, cond, detail = '') {
  rec(id, name, Boolean(cond), detail);
  if (!cond) throw new Error(`${id} 未通过：${detail}`);
}

const stack = await startStack({ suite: 'a03 (账号切换本地数据隔离)' });
stack.saveManifest(OUT, { finished: false });
console.log(`[a03] runId=${stack.runId} backend=${stack.backendPort} frontend=${stack.frontendPort} db=${stack.masked.database}`);

const ctx = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 1000 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();

const readKv = () => page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('rdpms-offline');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const keys = await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').getAllKeys();
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
  return { kvKeys: keys, deadLetters: await read('deadLetters'), records: await read('records') };
});

async function waitFor(fn, { timeout = 15000, interval = 300, label = '条件' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await page.waitForTimeout(interval);
  }
  throw new Error(`等待${label}超时`);
}

const fixtures = {};
try {
  // 夹具：A（成员）有一条可见项目；B（项目经理）与该项目无关
  const sa = await loginAs(page, stack, 'test_super_admin');
  const saToken = await readToken(page);
  const authorId = await findUserId(page, 'test_member');
  const otherId = await findUserId(page, 'test_manager');
  const proj = (await apiWrite(page, '/api/projects', {
    body: { name: `A03-${stack.runId.slice(-8)}`, type: 'TESTING', managerId: sa.id },
  })).body;
  await apiWrite(page, `/api/projects/${proj.id}/members`, { body: { userId: authorId, role: 'MEMBER' } });
  Object.assign(fixtures, { authorId, otherId, projectId: proj.id });

  // ══ 1. A 登录并完成一轮同步 ══
  await loginAs(page, stack, 'test_member', { expectUserId: authorId });
  const afterA = await waitFor(async () => {
    const db = await readKv();
    return db.kvKeys.includes(`rdpms.sync.cursor:${authorId}`) ? db : null;
  }, { label: 'A 的分片游标写入', timeout: 20000 });
  check('A03-B1', 'A 登录后本地分片键按主体写入（游标/ACL 属于 A）',
    afterA.kvKeys.includes(`rdpms.sync.cursor:${authorId}`) && afterA.kvKeys.includes(`rdpms.sync.acl:${authorId}`),
    `A 键=${afterA.kvKeys.filter((k) => k.includes(authorId)).length} 个`);

  // ══ 2. A 登出：清理自己的分片键（不清持久拒绝区）══
  await page.getByRole('button', { name: /登出/ }).first().click();
  await page.waitForURL((u) => u.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const afterLogout = await waitFor(async () => {
    const db = await readKv();
    return db.kvKeys.includes(`rdpms.sync.cursor:${authorId}`) ? null : db;
  }, { label: 'A 的分片键清理', timeout: 10000 });
  check('A03-B2', 'A 登出后其分片键被清理（共享设备安全）',
    !afterLogout.kvKeys.includes(`rdpms.sync.cursor:${authorId}`) && !afterLogout.kvKeys.includes(`rdpms.sync.acl:${authorId}`),
    `剩余键=${JSON.stringify(afterLogout.kvKeys).slice(0, 160)}`);

  // ══ 3. B 登录：不得看到任何 A 的数据 ══
  await loginAs(page, stack, 'test_manager', { expectUserId: otherId });
  const afterB = await waitFor(async () => {
    const db = await readKv();
    return db.kvKeys.includes(`rdpms.sync.cursor:${otherId}`) ? db : null;
  }, { label: 'B 的分片游标写入', timeout: 20000 });
  check('A03-B3', 'B 的键独立写入，且不含 A 的键',
    !afterB.kvKeys.includes(`rdpms.sync.cursor:${authorId}`) && !afterB.kvKeys.includes(`rdpms.sync.acl:${authorId}`),
    `B 键=${afterB.kvKeys.filter((k) => k.includes(otherId)).length} 个，A 残留=${afterB.kvKeys.filter((k) => k.includes(authorId)).length} 个`);
  check('A03-B4', 'B 的持久拒绝区为空（没有继承 A 的草稿）',
    afterB.deadLetters.filter((r) => r.userId === authorId).length === 0
      && afterB.deadLetters.filter((r) => r.userId === otherId).length === 0,
    `拒绝区总条数=${afterB.deadLetters.length}`);
  check('A03-B5', 'B 的本地镜像不含 A 项目的记录',
    afterB.records.filter((r) => String(r.projectId ?? '') === proj.id).length === 0,
    `A 项目残留镜像=${afterB.records.filter((r) => String(r.projectId ?? '') === proj.id).length} 条`);

  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('A03-B6', 'B 的同步面板无冲突/被拒记录',
    !/冲突 \d/.test(bodyText) && !/被拒绝（\d+）/.test(bodyText),
    bodyText.match(/(已同步|待同步 \d+|冲突 \d+)/)?.[0] ?? '未找到同步指示');

  // 收尾：确认 A 的成员关系仍是既成事实（未在验证过程中被改动）
  const members = await apiFromNode(stack, `/api/projects/${proj.id}/members`, saToken);
  const authorStillMember = (Array.isArray(members.body) ? members.body : [])
    .some((m) => (m.userId ?? m.user?.id) === authorId && !m.leftAt);
  check('A03-B7', '验证过程未改动服务端成员关系（隔离靠本地分片而非撤销权限）',
    authorStillMember, `author 仍为成员=${authorStillMember}`);
} catch (e) {
  rec('EXC', '用例执行中断', false, msg(e));
} finally {
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
  };
  fs.writeFileSync(path.join(OUT, `${stack.runId}-a03-results.json`), `${JSON.stringify({
    runId: stack.runId, suite: 'a03', fixtures, summary, results,
  }, null, 2)}\n`);
  stack.saveManifest(OUT, { fields: { fixtures, resultSummary: summary } });
  await ctx.close().catch(() => {});
  await stack.stop();
  console.log(`[a03] 汇总 ${summary.pass}/${summary.total} PASS`);
  process.exit(summary.fail ? 1 : 0);
}
