/**
 * tests/browser/a05.e2e.mjs —— A05 真实浏览器验证：混合「有关联项目 / 无关联项目」的试剂组日报
 *
 * 旧实现：只有「全部记录都缺项目」才提示；混合时无项目那组被 `continue` 静默跳过，
 * 有项目那组保存成功后就清 key 离开页面 —— 用户以为全部成功，被跳过的正文已经丢了。
 *
 * 本套件在真实 Chromium 上验证修复后的契约：
 *   1. 混合保存时，缺项目的记录必须被**明确提示**且正文保留在界面；
 *   2. 该正文同时**本地留存**（IndexedDB，按主体分片），刷新后可找回；
 *   3. 补上项目关联后再保存 → 两条记录各保存一次，本地留存清除。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';
import { apiOk, apiWrite, loginAs, findUserId, readToken, apiFromNode } from './authHelper.mjs';

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

const stack = await startStack({ suite: 'a05 (缺项目记录不得静默丢弃)' });
stack.saveManifest(OUT, { finished: false });
console.log(`[a05] runId=${stack.runId} backend=${stack.backendPort} frontend=${stack.frontendPort} db=${stack.masked.database}`);

const ctx = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 1000 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();

const dialogs = [];
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss().catch(() => {}); });

async function snap(tag) {
  shot += 1;
  const base = path.join(OUT, `${stack.runId}-a05-${String(shot).padStart(2, '0')}-${tag}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`${base}.json`, JSON.stringify({
    url: page.url(),
    text: (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 900),
  }, null, 2));
}

/** 页内读真实 IndexedDB 中的「缺项目留存」键 */
const readPendingDraft = (userId) => page.evaluate(async ({ key }) => {
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('rdpms-offline');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return new Promise((res) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror = () => res(null);
  });
}, { key: `rdpms.pendingDraft:${userId}` });

async function waitFor(fn, { timeout = 12000, interval = 250, label = '条件' } = {}) {
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
  // ══ 夹具：两个项目，执行人均为成员 ══
  const sa = await loginAs(page, stack, 'test_super_admin');
  const saToken = await readToken(page);
  const authorId = await findUserId(page, 'test_member');
  const mk = async (suffix) => (await apiWrite(page, '/api/projects', {
    body: { name: `A05-${suffix}-${stack.runId.slice(-8)}`, type: 'TESTING', managerId: sa.id },
  })).body;
  const projA = await mk('A');
  const projB = await mk('B');
  for (const p of [projA, projB]) {
    await apiWrite(page, `/api/projects/${p.id}/members`, { body: { userId: authorId, role: 'MEMBER' } });
  }
  const day = 10 + (Number.parseInt(stack.runId.slice(-6), 16) % 10);
  const D = `2026-09-${String(day).padStart(2, '0')}`;
  const TA = 'A05-有关联项目-正文';
  const TB = 'A05-无关联项目-正文';
  Object.assign(fixtures, { authorId, projA: projA.id, projB: projB.id, periodKey: D });

  await loginAs(page, stack, 'test_member', { expectUserId: authorId });
  await page.goto(`${stack.apiBase}/reports/new?type=${encodeURIComponent('日报')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('input[type=date]').first().fill(D);
  await page.waitForTimeout(300);

  // 切到试剂组综合模板（允许多条记录）
  await page.getByRole('button', { name: /试剂组日报/ }).first().click();
  await page.waitForTimeout(600);

  const projectSelects = page.locator('select', { has: page.locator('option', { hasText: '选择项目' }) });
  const summaries = page.locator('textarea[placeholder="简述..."]');
  check('A05-a', '试剂组模板就绪（记录级项目选择 + 工作内容输入）',
    (await projectSelects.count()) >= 1 && (await summaries.count()) >= 1,
    `项目选择控件=${await projectSelects.count()} 简述输入=${await summaries.count()}`);

  // 记录 1：关联项目 A；记录 2：**不关联项目**
  await projectSelects.nth(0).selectOption({ label: projA.name });
  await page.waitForTimeout(300);
  await summaries.nth(0).fill(TA);
  await page.getByRole('button', { name: /添加工作日报/ }).first().click();
  await page.waitForTimeout(500);
  await summaries.nth(1).fill(TB);
  await page.waitForTimeout(300);
  await snap('mixed-filled');

  dialogs.length = 0;
  await page.getByRole('button', { name: /保存草稿/ }).first().click();
  await page.waitForTimeout(2500);

  // ══ 断言：明确提示 + 正文保留 + 本地留存 + 未离页 ══
  check('A05-b', '保存时明确提示「有记录未关联项目」（不是显示全部成功）',
    dialogs.some((m) => /未关联项目/.test(m)),
    JSON.stringify(dialogs.map((m) => m.replace(/\s+/g, ' ').slice(0, 90))));
  const stillOnForm = !/\/reports$/.test(new URL(page.url()).pathname);
  const tas = await summaries.evaluateAll((els) => els.map((e) => e.value));
  check('A05-c', '未关联项目的正文仍保留在界面，且页面未跳走',
    stillOnForm && tas.some((v) => v.includes(TB)),
    `页面=${new URL(page.url()).pathname} 输入值=${JSON.stringify(tas.map((v) => v.slice(0, 12)))}`);

  const rowsAfterPartial = await apiOk(page, `/api/reports?pageSize=100&authorId=${authorId}&periodKey=${D}`);
  const rowA = (rowsAfterPartial.list ?? []).filter((r) => r.projectId === projA.id);
  const rowB = (rowsAfterPartial.list ?? []).filter((r) => r.projectId === projB.id);
  check('A05-d', '有关联项目的记录已保存（1 条），缺项目的记录未误写到他处',
    rowA.length === 1 && rowB.length === 0 && JSON.stringify(rowA[0].content).includes(TA),
    `A=${rowA.length} B=${rowB.length} 含 TA=${JSON.stringify(rowA[0]?.content ?? {}).includes(TA)}`);

  const pending = await waitFor(async () => {
    const v = await readPendingDraft(authorId);
    return v?.records?.length ? v : null;
  }, { label: '缺项目记录的本地留存', timeout: 8000 });
  check('A05-e', '缺项目记录已本地留存（按主体分片的 IndexedDB 键）',
    pending.records.length === 1 && JSON.stringify(pending.records[0]).includes(TB),
    `留存条数=${pending.records.length} 含 TB=${JSON.stringify(pending.records[0]).includes(TB)}`);

  // ══ 刷新后仍可找回 ══
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bodyAfterReload = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const tasAfterReload = await page.locator('textarea[placeholder="简述..."]').evaluateAll((els) => els.map((e) => e.value));
  check('A05-f', '刷新后原正文可找回（界面已恢复 + 明确提示尚未提交）',
    tasAfterReload.some((v) => v.includes(TB)) && /未关联项目/.test(bodyAfterReload),
    `恢复值=${JSON.stringify(tasAfterReload.map((v) => v.slice(0, 12)))} 提示命中=${/未关联项目/.test(bodyAfterReload)}`);
  await snap('after-reload');

  // ══ 补关联项目后再保存：两条各保存一次 ══
  // 刷新后表单里只剩「被恢复的那条未提交记录」（已保存的那条在服务端，不回填到新建页）
  const projectSelects2 = page.locator('select', { has: page.locator('option', { hasText: '选择项目' }) });
  check('A05-f2', '刷新后表单只保留待补关联的记录（1 条），不带入已保存内容',
    (await projectSelects2.count()) === 1,
    `记录数=${await projectSelects2.count()}`);
  await projectSelects2.nth(0).selectOption({ label: projB.name });
  await page.waitForTimeout(400);
  dialogs.length = 0;
  await page.getByRole('button', { name: /保存草稿/ }).first().click();
  await page.waitForTimeout(2500);

  const rowsFinal = await apiOk(page, `/api/reports?pageSize=100&authorId=${authorId}&periodKey=${D}`);
  const finalA = (rowsFinal.list ?? []).filter((r) => r.projectId === projA.id);
  const finalB = (rowsFinal.list ?? []).filter((r) => r.projectId === projB.id);
  check('A05-g', '补关联后两条记录各保存一次（各 1 条，内容各自正确）',
    finalA.length === 1 && finalB.length === 1
      && JSON.stringify(finalA[0].content).includes(TA) && JSON.stringify(finalB[0].content).includes(TB),
    `A=${finalA.length} B=${finalB.length}`);
  check('A05-h', '保存成功后清理本地留存（不留过期副本）',
    (await readPendingDraft(authorId)) === null,
    `留存=${JSON.stringify(await readPendingDraft(authorId))?.slice(0, 60)}`);

  const members = await apiFromNode(stack, `/api/projects/${projA.id}/members`, saToken);
  check('A05-i', '夹具未被验证过程改动（两项目仍是成员关系）',
    (Array.isArray(members.body) ? members.body : []).some((m) => (m.userId ?? m.user?.id) === authorId && !m.leftAt),
    `成员数=${Array.isArray(members.body) ? members.body.length : 'n/a'}`);
} catch (e) {
  rec('EXC', '用例执行中断', false, msg(e));
  await snap('exception');
} finally {
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
  };
  fs.writeFileSync(path.join(OUT, `${stack.runId}-a05-results.json`), `${JSON.stringify({
    runId: stack.runId, suite: 'a05', fixtures, summary, results, dialogs,
  }, null, 2)}\n`);
  stack.saveManifest(OUT, { fields: { fixtures, resultSummary: summary } });
  await ctx.close().catch(() => {});
  await stack.stop();
  console.log(`[a05] 汇总 ${summary.pass}/${summary.total} PASS`);
  process.exit(summary.fail ? 1 : 0);
}
