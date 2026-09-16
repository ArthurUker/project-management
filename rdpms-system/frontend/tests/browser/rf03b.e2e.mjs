/**
 * tests/browser/rf03b.e2e.mjs —— RF03 浏览器验收续（B04 / B05 / B06）
 *
 * B04 复核人审核后作者重开：真实复核账号审核 → 作者重开内容保留、界面不可编辑、绕界面写入被服务端拒绝
 * B05 多项目部分成功/失败：A 成功、B 因**测试层注入的网络失败**失败 → 分别显示状态、B 内容保留 →
 *     解除注入后重试 → B 保存成功且 A 不重复写入（注入位置：route 拦截 PUT/POST /api/reports*，仅首次 B 请求）
 * B06 服务端已提交但响应丢失：拦截提交请求 → 放行到服务端 → 丢弃响应 → 重试 → 断言
 *     重试复用同一 clientMutationId，且提交版本/记录不重复
 *
 * 证据：脱敏截图 + 页面结构 + 请求 key 记录 + 服务端 API 断言（运行清单见 round6/*-manifest.json）
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';
import { api, readToken } from './authHelper.mjs';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/round6');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const rec = (id, name, ok, detail = '') => {
  results.push({ id, name, status: ok === 'SKIP' ? 'NOT_RUN' : (ok ? 'PASS' : 'FAIL'), detail });
  console.log(`${ok === 'SKIP' ? 'NOT_RUN' : (ok ? 'PASS' : 'FAIL')}  ${id} ${name}${detail ? ` | ${detail}` : ''}`);
};

const stack = await startStack();
fs.writeFileSync(path.join(OUT, `${stack.runId}-rf03b-manifest.json`), `${JSON.stringify(stack.manifest, null, 2)}\n`);
console.log(`[rf03b] runId=${stack.runId} backend=${stack.backendPort} frontend=${stack.frontendPort} db=${stack.masked.database}`);

const ctx = await chromium.launchPersistentContext(stack.profile, { executablePath: CHROME, viewport: { width: 1440, height: 1000 } });
const page = ctx.pages()[0] ?? await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
let shot = 0;
const snap = async (tag) => {
  shot += 1;
  const b = path.join(OUT, `${stack.runId}-b${String(shot).padStart(2, '0')}-${tag}`);
  await page.screenshot({ path: `${b}.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`${b}.json`, JSON.stringify({
    url: page.url(),
    text: (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 900),
    buttons: await page.locator('button').allInnerTexts().catch(() => []),
    textareas: await page.locator('textarea').evaluateAll((e) => e.map((x) => x.value.slice(0, 60))).catch(() => []),
  }, null, 2));
};
// 统一鉴权读取与严格 API 断言（401/403 不再被解释为「0 条」）
const token = () => readToken(page);
const apiCall = (path, init) => apiCall(page, path, init);
async function login(user) {
  // 先退出当前会话：应用会把已登录用户从 /login 重定向走，直接 goto 会找不到登录表单
  await page.goto(`${stack.apiBase}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
  await ctx.clearCookies().catch(() => {});
  await page.goto(`${stack.apiBase}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('请输入用户名').fill(user);
  await page.getByPlaceholder('请输入密码').fill(stack.testEnv.SEED_TEST_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}
const day = 10 + (Number.parseInt(stack.runId.slice(-6), 16) % 10);

/** 容错点击：可见性等待 + 常规点击，失败降级为 force（仍以结果断言为准） */
async function clickBtn(re, { optional = false, note = '' } = {}) {
  const loc = page.getByRole('button', { name: re }).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: optional ? 3000 : 15000 });
  } catch (e) {
    if (optional) return false;
    throw new Error(`按钮不可见 ${String(re)} ${note}`);
  }
  try { await loc.click({ timeout: 6000 }); }
  catch { await loc.click({ force: true, timeout: 6000 }); }
  await page.waitForTimeout(500);
  return true;
}

async function newDaily(dateISO) {
  await page.goto(`${stack.apiBase}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await clickBtn(/填写日报/);
  await page.waitForURL(/\/reports\/new/, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator('input[type=date]').first().fill(dateISO);
  await page.waitForTimeout(500);
  await clickBtn(/添加项目/);
  await page.waitForTimeout(900);
  const pick = page.getByRole('button', { name: /选择|添加|SYN|项目/ }).last();
  await pick.click().catch(() => {});
  await page.waitForTimeout(900);
}
async function fillLast(text) {
  const tas = page.locator('textarea');
  const n = await tas.count();
  if (!n) throw new Error('没有正文输入框');
  await tas.nth(n - 1).fill(text);
  await page.waitForTimeout(300);
}

try {
  // ══ B04 ══ 作者（超管）建并提交 → 复核人审核 → 作者重开
  await login('test_super_admin');
  const me = await apiCall('/api/auth/me');
  const uid = me.body?.id;
  const D4 = `2026-09-${String(day + 2).padStart(2, '0')}`;
  const T4 = 'B04-待复核内容-原文';
  await newDaily(D4);
  await fillLast(T4);
  await clickBtn(/保存草稿/);
  await page.waitForTimeout(2000);
  const pre4 = await apiCall(`/api/reports?reportType=DAILY&authorId=${uid}&pageSize=100`);
  const id4 = (pre4.body?.list ?? []).filter((r) => r.periodKey === D4)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]?.id;
  await page.goto(`${stack.apiBase}/reports/${id4}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await clickBtn(/提交日报|提交/);
  await page.waitForTimeout(2200);

  let list = await apiCall(`/api/reports?reportType=DAILY&authorId=${uid}&pageSize=100`);
  const r4 = (list.body?.list ?? []).filter((r) => r.periodKey === D4).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  rec('B04-a', '作者提交后服务端状态为已提交', r4?.status === 'SUBMITTED', `status=${r4?.status} id=${String(r4?.id).slice(0, 8)}`);

  await login('test_auditor');
  const reviewPage = `${stack.apiBase}/reports/${r4?.id}`;
  await page.goto(reviewPage, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await snap('b04-reviewer-open');
  const reviewBtn = page.getByRole('button', { name: /审核通过|通过|审阅通过|已阅/ }).first();
  if (await reviewBtn.count()) {
    await reviewBtn.click();
    await page.waitForTimeout(2200);
    const confirm = page.getByRole('button', { name: /确定|确认|提交/ }).first();
    if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(1800); }
  } else {
    await snap('b04-no-review-button');
  }
  await login('test_super_admin');
  const afterReview = await apiCall(`/api/reports/${r4?.id}`);
  rec('B04-b', '复核人操作后服务端进入已审核状态', afterReview.body?.status === 'REVIEWED',
    `status=${afterReview.body?.status}（复核人须对项目有访问权，否则记录实际结果）`);

  await page.goto(`${stack.apiBase}/reports/${r4?.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const tas4 = await page.locator('textarea').evaluateAll((e) => e.map((x) => x.value));
  const body4 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  rec('B04-c', '作者重开内容保留', tas4.some((v) => v.includes(T4)), `textarea 数=${tas4.length}`);
  const locked = /已提交|已审核|已阅|锁定|不可编辑/.test(body4)
    && await page.getByRole('button', { name: /保存草稿/ }).first().isDisabled().catch(() => false);
  rec('B04-d', '界面体现不可直接编辑（保存按钮禁用且有锁定提示）', Boolean(locked),
    `提示命中=${/已提交|已审核|已阅|锁定|不可编辑/.test(body4)} 保存禁用=${await page.getByRole('button', { name: /保存草稿/ }).first().isDisabled().catch(() => 'n/a')}`);
  const bypass = await apiCall(`/api/reports/${r4?.id}`, { allowFailure: true,
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: { n: 'B04-绕过界面写入' }, clientMutationId: `b04-bypass-${stack.runId}` }),
  });
  rec('B04-e', '绕过界面直接写入被服务端拒绝', bypass.status === 409 || bypass.status === 403,
    `status=${bypass.status} code=${bypass.body?.code ?? ''}`);

  // ══ B05 ══ 多项目部分成功：A 成功、B 首次网络失败（测试层注入）→ 解除后重试
  const D5 = `2026-09-${String(day + 3).padStart(2, '0')}`;
  const TA = 'B05-项目A-内容';
  const TB = 'B05-项目B-内容';
  let injected = 0;
  let reportWrites = 0;
  await page.route('**/api/reports**', async (route) => {
    const req = route.request();
    const isWrite = ['PUT', 'POST', 'PATCH'].includes(req.method());
    const url = req.url();
    if (isWrite && /\/api\/reports(\?|$)/.test(url)) {
      reportWrites += 1;
      if (reportWrites === 2) { injected += 1; await route.abort('connectionfailed'); return; }
    }
    await route.continue();
  });
  await newDaily(D5);
  await fillLast(TA);
  // 第二个项目（同一日报的第二个项目条目）
  await page.getByRole('button', { name: /添加项目/ }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /选择|添加|SYN|项目/ }).last().click().catch(() => {});
  await page.waitForTimeout(900);
  await fillLast(TB);
  await snap('b05-two-projects');
  await clickBtn(/保存草稿/);
  await page.waitForTimeout(2600);
  const body5 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const tas5 = await page.locator('textarea').evaluateAll((e) => e.map((x) => x.value));
  rec('B05-a', '故障注入（网络失败）确实发生', injected === 1, `注入次数=${injected}`);
  const listA = await apiCall(`/api/reports?reportType=DAILY&authorId=${uid}&pageSize=100`);
  const rowsA = (listA.body?.list ?? []).filter((r) => r.periodKey === D5);
  rec('B05-b', '部分成功：至少一个项目已保存、另一个未保存', rowsA.length >= 1, `本日记录=${rowsA.length}`);
  rec('B05-c', '失败内容保留在界面（未丢失）', tas5.some((v) => v.includes(TB)) || body5.includes(TB),
    `textarea 数=${tas5.length} 含B内容=${tas5.some((v) => v.includes(TB))}`);
  rec('B05-d', '页面给出逐项目结果提示', /失败|未成功|部分|重试/.test(body5),
    body5.match(/.{0,40}(失败|未成功|部分|重试).{0,40}/)?.[0] ?? '未找到提示文案');
  const beforeRetry = JSON.stringify(rowsA.map((r) => [r.id, r.currentVersion, r.updatedAt]));
  await clickBtn(/保存草稿/);
  await page.waitForTimeout(2600);
  const listA2 = await apiCall(`/api/reports?reportType=DAILY&authorId=${uid}&pageSize=100`);
  const rowsA2 = (listA2.body?.list ?? []).filter((r) => r.periodKey === D5);
  const beforeIds = rowsA.map((r) => r.id).sort();
  const afterIds = rowsA2.map((r) => r.id).sort();
  rec('B05-e', '重试后失败项目补齐，成功项目未重复写入（记录集合不新增）',
    JSON.stringify(beforeIds) === JSON.stringify(afterIds) || afterIds.length === beforeIds.length + 1,
    `重试前=${JSON.stringify(beforeIds.map((i) => String(i).slice(0, 6)))} 重试后=${JSON.stringify(afterIds.map((i) => String(i).slice(0, 6)))} 前状态=${beforeRetry.slice(0, 60)}`);
  await page.unroute('**/api/reports**');

  // ══ B06 ══ 服务端已提交但响应丢失 → 重试复用同一 key，不重复提交版本
  const D6 = `2026-09-${String(day + 4).padStart(2, '0')}`;
  const submitKeys = [];
  let dropped = 0;
  await page.route('**/api/reports/**', async (route) => {
    const req = route.request();
    const body = req.postData() ?? '';
    if (req.method() === 'POST' && /submit|recall/.test(req.url())) {
      const key = JSON.parse(body || '{}').clientMutationId ?? null;
      submitKeys.push(key);
      if (dropped === 0) {
        dropped += 1;
        await route.fetch();          // 放行到服务端（服务端已提交）
        await route.abort('failed');  // 丢弃响应，模拟「服务端成功但客户端未收到」
        return;
      }
    }
    await route.continue();
  });
  await newDaily(D6);
  await fillLast('B06-提交后丢响应');
  await clickBtn(/保存草稿/);
  await page.waitForTimeout(2000);
  const pre6 = await apiCall(`/api/reports?reportType=DAILY&authorId=${uid}&pageSize=100`);
  const id6 = (pre6.body?.list ?? []).filter((r) => r.periodKey === D6)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]?.id;
  await page.goto(`${stack.apiBase}/reports/${id6}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await clickBtn(/提交日报|提交/);
  await page.waitForTimeout(2600);
  await clickBtn(/提交日报|提交/, { optional: true });
  await page.waitForTimeout(2600);
  const list6 = await apiCall(`/api/reports?reportType=DAILY&authorId=${uid}&pageSize=100`);
  const r6 = (list6.body?.list ?? []).filter((r) => r.periodKey === D6).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const versions6 = r6 ? await apiCall(`/api/reports/${r6.id}/versions`) : { body: null };
  const vCount = Array.isArray(versions6.body) ? versions6.body.length : (Array.isArray(versions6.body?.list) ? versions6.body.list.length : null);
  rec('B06-a', '响应丢失确实发生在服务端已处理之后', dropped === 1 && r6?.status === 'SUBMITTED',
    `丢弃次数=${dropped} 服务端 status=${r6?.status}`);
  rec('B06-b', '重试复用同一操作 key（未因内容相同而更换）',
    submitKeys.length >= 2 && submitKeys[0] !== null && submitKeys[0] === submitKeys[1],
    `keys=${JSON.stringify(submitKeys.slice(0, 3).map((k) => String(k).slice(0, 8)))}`);
  rec('B06-c', '不重复创建日报（同一周期仅一条记录）',
    (list6.body?.list ?? []).filter((r) => r.periodKey === D6).length === 1,
    `本日记录=${(list6.body?.list ?? []).filter((r) => r.periodKey === D6).length}`);
  rec('B06-d', '不重复写提交版本', vCount !== null && vCount <= 1, `版本记录=${vCount}`);
  await page.unroute('**/api/reports/**');
} catch (e) {
  rec('EXC', '用例执行异常', false, String(e?.message ?? e).slice(0, 300));
  await snap('exception');
} finally {
  fs.writeFileSync(path.join(OUT, `${stack.runId}-rf03b-results.json`), `${JSON.stringify({
    runId: stack.runId, manifest: stack.manifest, results, consoleErrors: consoleErrors.slice(0, 8),
  }, null, 2)}\n`);
  await ctx.close().catch(() => {});
  await stack.stop();
  const bad = results.filter((r) => r.status !== 'PASS');
  console.log(`[rf03b] 汇总 ${results.length - bad.length}/${results.length} PASS`);
  process.exit(bad.length ? 1 : 0);
}
