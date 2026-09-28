/**
 * tests/browser/rf03b.e2e.mjs —— RF03 浏览器验收续（B04 / B05 / B06），A07 复核后重写
 *
 * 与旧版（round6，3/14 PASS）的区别——旧版的观测本身不可信：
 *   1. token 从 JSON 形态里找（产品存的是原始字符串）→ api() 实际没有 Authorization，
 *      401 被 `body?.list ?? []` 解释成「0 条」，于是「没落库」的结论完全无效；
 *   2. 审核用例没有具备目标项目权限的复核人夹具；
 *   3. B05-e 把 `[] → []` 判为 PASS，B06-d 用 `版本数 <= 1` 连 0 版本也接受；
 *   4. 在 body 文本里搜索原生提示，且大量 catch/force 掩盖前置失败。
 *
 * 本版：
 *   - 统一走 authHelper 的会话辅助：登录后必须 200 取到 /api/auth/me 且主体匹配；
 *   - 所有核查请求非 2xx 立即失败，禁止回落成空数组；
 *   - 保存/提交都按**响应里的记录 ID / 幂等键**核对，不靠列表数量推断；
 *   - 故障注入按**明确 projectId** 匹配，原生 alert/dialog 被捕获；
 *   - 每个场景失败立即中断（不继续制造「看起来通过」的后续断言）。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';
import { api, apiOk, apiWrite, apiAs, loginAs, findUserId, readToken } from './authHelper.mjs';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/round7');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let shot = 0;
const msg = (e) => String(e?.message ?? e).slice(0, 400);

function rec(id, name, ok, detail = '') {
  results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${detail ? ` | ${detail}` : ''}`);
}
/** 断言失败 → 立即中断当前场景（避免后续断言建立在错误前提上） */
function check(id, name, cond, detail = '') {
  rec(id, name, Boolean(cond), detail);
  if (!cond) throw new Error(`${id} 未通过：${detail}`);
}

const stack = await startStack({ suite: 'rf03b (B04/B05/B06)' });
stack.saveManifest(OUT, { finished: false });
console.log(`[rf03b] runId=${stack.runId} backend=${stack.backendPort} frontend=${stack.frontendPort} db=${stack.masked.database}`);

const ctx = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 1000 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

// 原生对话框（alert/confirm）必须显式捕获：旧版在 body 文本里搜索提示，等于没有断言
const dialogs = [];
page.on('dialog', async (d) => {
  dialogs.push({ type: d.type(), message: d.message() });
  await d.dismiss().catch(() => {});
});

// 报告写入的**精确观测**：项目 ID、幂等键、响应状态、服务端返回的记录 ID、是否回执重放
const reportWrites = [];
const submitWrites = [];
// 请求侧观测（必须与响应侧分开）：被 abort 掉的那次请求没有响应，
// 但它的幂等键正是「重试是否复用同一 key」要对比的对象（B05/B06）
const reportRequests = [];
const submitRequests = [];
page.on('request', (req) => {
  try {
    const u = new URL(req.url());
    let sent = null; try { sent = JSON.parse(req.postData() ?? '{}'); } catch { /* 非 JSON */ }
    if (req.method() === 'POST' && u.pathname === '/api/reports') {
      reportRequests.push({ projectId: sent?.projectId ?? null, clientMutationId: sent?.clientMutationId ?? null });
    }
    if (req.method() === 'POST' && /\/api\/reports\/[^/]+\/submit$/.test(u.pathname)) {
      submitRequests.push({ reportId: u.pathname.split('/')[3], clientMutationId: sent?.clientMutationId ?? null });
    }
  } catch { /* 观测失败不影响业务断言 */ }
});
page.on('response', async (res) => {
  try {
    const req = res.request();
    const u = new URL(res.url());
    if (req.method() === 'POST' && u.pathname === '/api/reports') {
      let sent = null; try { sent = JSON.parse(req.postData() ?? '{}'); } catch { /* 非 JSON */ }
      let body = null; try { body = await res.json(); } catch { /* 可能是 HTML 错误页 */ }
      reportWrites.push({
        projectId: sent?.projectId ?? null,
        clientMutationId: sent?.clientMutationId ?? null,
        status: res.status(),
        id: body?.id ?? null,
        replayed: res.headers()['idempotent-replay'] ?? null,
      });
    }
    if (req.method() === 'POST' && /\/api\/reports\/[^/]+\/submit$/.test(u.pathname)) {
      let sent = null; try { sent = JSON.parse(req.postData() ?? '{}'); } catch { /* 非 JSON */ }
      submitWrites.push({
        reportId: u.pathname.split('/')[3],
        clientMutationId: sent?.clientMutationId ?? null,
        status: res.status(),
        replayed: res.headers()['idempotent-replay'] ?? null,
      });
    }
  } catch { /* 观测失败不影响业务断言（后续断言必然失败） */ }
});

async function snap(tag) {
  shot += 1;
  const base = path.join(OUT, `${stack.runId}-b${String(shot).padStart(2, '0')}-${tag}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`${base}.json`, JSON.stringify({
    url: page.url(),
    text: (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 900),
    buttons: await page.locator('button').allInnerTexts().catch(() => []),
    textareas: await page.locator('textarea').evaluateAll((e) => e.map((x) => x.value.slice(0, 80))).catch(() => []),
    dialogs,
  }, null, 2));
}

async function waitFor(fn, { timeout = 12000, interval = 200, label = '条件' } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await page.waitForTimeout(interval);
  }
  throw new Error(`等待${label}超时`);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 打开「新建日报」并设定日期。
 * 不依赖列表页按钮文案（「填写日报」/「填写月报」会随当天日期变化），
 * 而是走与列表页相同的目标路由 `/reports/new?type=日报`（Reports.tsx:111 的同一形式）。
 */
async function openNewDaily(dateISO) {
  await page.goto(`${stack.apiBase}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.goto(`${stack.apiBase}/reports/new?type=${encodeURIComponent('日报')}`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/reports\/new/, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.locator('input[type=date]').first().fill(dateISO);
  await page.waitForTimeout(400);
}

/** 按**项目名**选择项目（明确标识匹配，不点「最后一个按钮」） */
async function addProjectByName(name) {
  await page.getByRole('button', { name: /添加项目/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: new RegExp(escapeRe(name)) }).first().click();
  await page.waitForTimeout(400);
}

/** 第 index 个项目块的正文（通用模板：每块 3 个 textarea：计划/完成/计划） */
async function fillProjectContent(index, text) {
  const ta = page.locator('textarea').nth(index * 3);
  await ta.waitFor({ state: 'visible', timeout: 8000 });
  await ta.fill(text);
  await page.waitForTimeout(200);
}

async function clickSave() {
  await page.getByRole('button', { name: /保存草稿/ }).first().click();
  await page.waitForTimeout(1500);
}

async function clickSubmit() {
  await page.getByRole('button', { name: /提交日报|提交/ }).first().click();
  await page.waitForTimeout(1500);
}

const listReports = (query) => apiOk(page, `/api/reports?pageSize=100&${query}`);

/** 业务审计条数（审计表 append-only，断言一律用增量） */
async function auditTotal(token, entityId, action) {
  const filter = action ? `&action=${action}` : '';
  const res = await apiAs(page, `/api/audit-logs?entityType=REPORT&entityId=${entityId}${filter}&pageSize=1`, token);
  return res.body?.total ?? 0;
}

let saToken = null;
const fixtures = {};

try {
  // ══ 夹具（B00）════════════════════════════════════════════════════════════
  // 执行人 = 普通成员（reports.create/update/submit，无 review）；复核人 = 项目经理（reports.review）
  const sa = await loginAs(page, stack, 'test_super_admin');
  saToken = await readToken(page);
  const authorId = await findUserId(page, 'test_member');
  const reviewerId = await findUserId(page, 'test_manager');
  const runTag = stack.runId.slice(-8);

  const mkProject = async (suffix, managerId) => {
    const res = await apiWrite(page, '/api/projects', {
      body: { name: `RF03B-${suffix}-${runTag}`, type: 'TESTING', managerId },
    });
    const project = res.body;
    if (!project?.id || !project?.name) throw new Error(`创建项目失败：${JSON.stringify(res.body)?.slice(0, 200)}`);
    return project;
  };
  const projA = await mkProject('A', reviewerId); // 复核人=项目经理（自动 MANAGER 成员）
  const projB = await mkProject('B', sa.id);
  for (const p of [projA, projB]) {
    await apiWrite(page, `/api/projects/${p.id}/members`, { body: { userId: authorId, role: 'MEMBER' } });
  }
  const membersA = await apiOk(page, `/api/projects/${projA.id}/members`);
  const authorIsMember = (Array.isArray(membersA) ? membersA : membersA?.list ?? [])
    .some((m) => (m.userId ?? m.user?.id) === authorId && !m.leftAt);

  Object.assign(fixtures, {
    author: { username: 'test_member', userId: authorId },
    reviewer: { username: 'test_manager', userId: reviewerId },
    projects: { A: { id: projA.id, name: projA.name }, B: { id: projB.id, name: projB.name } },
  });
  check('B00', '夹具就绪：普通执行人为项目成员、复核人为项目经理，且服务端可核验',
    Boolean(sa.id && authorId && reviewerId) && Boolean(projA.id && projB.id) && authorIsMember,
    `author=${authorId.slice(0, 8)} reviewer=${reviewerId.slice(0, 8)} projA=${projA.id.slice(0, 8)} projB=${projB.id.slice(0, 8)} member=${authorIsMember}`);

  // 用例日期：取「该执行人在目标项目下当月还没有 DAILY 记录的日期」（避免撞上已提交记录）
  const mine = await listReports(`reportType=DAILY&authorId=${authorId}&projectId=${projA.id}`);
  const used = new Set((mine.list ?? []).map((r) => r.periodKey));
  const free = [];
  for (let d = 1; d <= 28 && free.length < 3; d += 1) {
    const key = `2026-09-${String(d).padStart(2, '0')}`;
    if (!used.has(key)) free.push(key);
  }
  if (free.length < 3) throw new Error('找不到三个空闲日报日期（该账号当月在该项目下记录过多）');
  const [D4, D5, D6] = free;
  console.log(`[rf03b] 用例日期 ${D4} / ${D5} / ${D6}`);

  // ══ B04 ══ 提交 → 复核人审核 → 作者重开（只读 + 服务端拒绝绕界面写入）
  {
    const T4 = 'B04-待复核内容-原文';
    await loginAs(page, stack, 'test_member', { expectUserId: authorId });
    await openNewDaily(D4);
    await addProjectByName(projA.name);
    await fillProjectContent(0, T4);
    await clickSave();

    const saved = await waitFor(
      () => reportWrites.find((w) => w.projectId === projA.id && w.status === 201 && w.id),
      { label: '保存响应（含记录 ID）' },
    );
    check('B04-a', '作者保存日报：用保存响应里的记录 ID 与服务端核对（不靠列表推断）',
      Boolean(saved.id), `projectId=${saved.projectId.slice(0, 8)} status=${saved.status} id=${saved.id.slice(0, 8)} key=${String(saved.clientMutationId).slice(0, 8)}`);
    const id4 = saved.id;

    const rows4 = await listReports(`reportType=DAILY&authorId=${authorId}&projectId=${projA.id}&periodKey=${D4}`);
    const row4 = (rows4.list ?? []).find((r) => r.id === id4);
    check('B04-b', '同一 (项目,作者,类型,周期) 仅一条草稿，且内容为本次填写',
      (rows4.list ?? []).length === 1 && row4?.status === 'DRAFT' && JSON.stringify(row4?.content ?? {}).includes(T4),
      `记录数=${(rows4.list ?? []).length} status=${row4?.status} 含原文=${JSON.stringify(row4?.content ?? {}).includes(T4)}`);

    await page.goto(`${stack.apiBase}/reports/${id4}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await clickSubmit();
    const afterSubmit = await apiOk(page, `/api/reports/${id4}`);
    check('B04-c', '作者提交后服务端状态为已提交（版本快照已写）',
      afterSubmit.status === 'SUBMITTED', `status=${afterSubmit.status}`);

    // 复核人（项目经理，目标项目的 MANAGER 成员）在审阅页操作
    await loginAs(page, stack, 'test_manager', { expectUserId: reviewerId });
    await page.goto(`${stack.apiBase}/reports/${id4}/review`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    dialogs.length = 0;
    await page.getByRole('button', { name: /已阅/ }).first().click();
    await page.waitForTimeout(1200);
    const afterReview = await apiOk(page, `/api/reports/${id4}`);
    check('B04-d', '复核人（有目标项目权限）审核后服务端进入已审阅',
      afterReview.status === 'REVIEWED' && afterReview.reviewerId === reviewerId,
      `status=${afterReview.status} reviewer=${String(afterReview.reviewerId).slice(0, 8)} dialogs=${JSON.stringify(dialogs.map((d) => d.message).slice(0, 2))}`);

    // 作者重开：内容保留 + 只读 UI + 服务端仍拒绝绕界面写入
    await loginAs(page, stack, 'test_member', { expectUserId: authorId });
    await page.goto(`${stack.apiBase}/reports/${id4}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const tas4 = await page.locator('textarea').evaluateAll((e) => e.map((x) => x.value));
    const body4 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check('B04-e', '作者重开内容保留（输入框实际值）', tas4.some((v) => v.includes(T4)), `textarea 数=${tas4.length}`);

    const saveBtn = page.getByRole('button', { name: /保存草稿/ }).first();
    const saveDisabledOrHidden = (await saveBtn.count()) === 0 || await saveBtn.isDisabled();
    check('B04-f', '已审阅状态在界面上只读（保存草稿不可用 + 状态提示）',
      saveDisabledOrHidden && /已审阅|已审核|锁定|只读/.test(body4),
      `保存草稿不可用=${saveDisabledOrHidden} 提示命中=${/已审阅|已审核|锁定|只读/.test(body4)}`);
    if (!saveDisabledOrHidden) await snap('b04-not-locked');

    const bypass = await api(page, `/api/reports/${id4}`, {
      allowFailure: true,
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: { projectReports: [{ plan: 'B04-绕过界面写入' }] }, clientMutationId: `b04-bypass-${runTag}` }),
    });
    check('B04-g', '绕过界面直接写入被服务端拒绝（提示不等于授权）',
      bypass.status === 403 || bypass.status === 409,
      `status=${bypass.status} code=${bypass.body?.code ?? ''}`);
  }

  // ══ B05 ══ 多项目部分成功/失败：按明确 projectId 注入故障 → 重试（键与内容双重核对）
  {
    const TA = 'B05-项目A-内容';
    const TB = 'B05-项目B-内容';
    let injected = 0;
    await loginAs(page, stack, 'test_member', { expectUserId: authorId });
    await openNewDaily(D5);
    await addProjectByName(projA.name);
    await fillProjectContent(0, TA);
    await addProjectByName(projB.name);
    await fillProjectContent(1, TB);
    await snap('b05-filled');

    reportWrites.length = 0;
    reportRequests.length = 0; // 只比较本场景自己的请求（否则会误取到 B04 的 key）
    dialogs.length = 0;
    await page.route('**/api/reports', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      let sent = null; try { sent = JSON.parse(req.postData() ?? '{}'); } catch { /* 非 JSON */ }
      if (sent?.projectId === projB.id && injected === 0) {
        injected += 1;
        return route.abort('connectionfailed');
      }
      return route.continue();
    });

    await clickSave();
    check('B05-a', '故障注入确实发生（按 projectId 命中，而不是「第二个请求」）',
      injected === 1, `注入次数=${injected} 目标项目=${projB.id.slice(0, 8)}`);

    const rows1 = await listReports(`reportType=DAILY&authorId=${authorId}&periodKey=${D5}`);
    const aRows1 = (rows1.list ?? []).filter((r) => r.projectId === projA.id);
    const bRows1 = (rows1.list ?? []).filter((r) => r.projectId === projB.id);
    check('B05-b', '部分成功：A 项目已落库（1 条）、B 项目未落库（0 条）',
      aRows1.length === 1 && bRows1.length === 0,
      `A=${aRows1.length} B=${bRows1.length}（旧套件用「>=1 条」掩盖了这一点）`);
    const idA = aRows1[0].id;

    const tasAfterFail = await page.locator('textarea').evaluateAll((e) => e.map((x) => x.value));
    check('B05-c', '失败项目的正文仍保留在界面（未丢失）',
      tasAfterFail.some((v) => v.includes(TB)), `textarea 数=${tasAfterFail.length}`);
    check('B05-d', '原生提示明确告知「未全部成功」（捕获 dialog，不在 body 文本里搜）',
      dialogs.some((d) => /部分|失败|未成功|重试/.test(d.message)),
      JSON.stringify(dialogs.map((d) => d.message).slice(0, 2)));

    const auditBeforeA = await auditTotal(saToken, idA);
    const rowABefore = (await apiOk(page, `/api/reports/${idA}`)).updatedAt;
    const keyA1 = reportRequests.find((w) => w.projectId === projA.id)?.clientMutationId;
    const keyB1 = reportRequests.find((w) => w.projectId === projB.id)?.clientMutationId;

    await page.unroute('**/api/reports');
    dialogs.length = 0;
    await clickSave();

    const rows2 = await listReports(`reportType=DAILY&authorId=${authorId}&periodKey=${D5}`);
    const aRows2 = (rows2.list ?? []).filter((r) => r.projectId === projA.id);
    const bRows2 = (rows2.list ?? []).filter((r) => r.projectId === projB.id);
    const idB = bRows2[0]?.id;
    check('B05-e', '重试后两个项目各落库一条（缺一不可，且集合恰好为 2）',
      aRows2.length === 1 && bRows2.length === 1 && Boolean(idB),
      `A=${aRows2.length}(id=${String(idA).slice(0, 8)}) B=${bRows2.length}(id=${String(idB).slice(0, 8)})`);
    check('B05-f', 'A 项目未被重复写入（同一记录 ID + updatedAt 未变）',
      aRows2[0].id === idA && aRows2[0].updatedAt === rowABefore,
      `id 相同=${aRows2[0].id === idA} updatedAt 相同=${aRows2[0].updatedAt === rowABefore}`);
    check('B05-g', 'B 项目内容正确落库（含重试时提交的正文）',
      JSON.stringify(bRows2[0].content ?? {}).includes(TB), `含 TB=${JSON.stringify(bRows2[0].content ?? {}).includes(TB)}`);

    const keyA2 = reportRequests.filter((w) => w.projectId === projA.id).pop()?.clientMutationId;
    const keyB2 = reportRequests.filter((w) => w.projectId === projB.id).pop()?.clientMutationId;
    check('B05-h', '重试复用各自的幂等键（A 回执重放、B 原 key 重发）',
      Boolean(keyA1) && keyA1 === keyA2 && Boolean(keyB1) && keyB1 === keyB2,
      `A key ${String(keyA1).slice(0, 8)}→${String(keyA2).slice(0, 8)} B key ${String(keyB1).slice(0, 8)}→${String(keyB2).slice(0, 8)}`);
    const auditAfterA = await auditTotal(saToken, idA);
    check('B05-i', 'A 项目没有产生重复业务审计（回执重放而非再次写入）',
      auditAfterA === auditBeforeA && auditBeforeA >= 1,
      `该记录业务审计 ${auditBeforeA}→${auditAfterA}`);
  }

  // ══ B06 ══ 服务端已提交但响应丢失 → 重试复用同一 key，不重复写版本/审计
  {
    const T6 = 'B06-提交后丢响应';
    await loginAs(page, stack, 'test_member', { expectUserId: authorId });
    await openNewDaily(D6);
    await addProjectByName(projA.name);
    await fillProjectContent(0, T6);
    reportWrites.length = 0;
    reportRequests.length = 0;
    await clickSave();
    const saved6 = await waitFor(
      () => reportWrites.find((w) => w.projectId === projA.id && w.status === 201 && w.id),
      { label: '保存响应' },
    );
    const id6 = saved6.id;
    // 保存成功后会跳回列表页：必须显式回到该日报的编辑页再提交
    await page.goto(`${stack.apiBase}/reports/${id6}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    let dropped = 0;
    submitWrites.length = 0;
    submitRequests.length = 0;
    dialogs.length = 0;
    await page.route('**/api/reports/**', async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      if (req.method() === 'POST' && /\/submit$/.test(u.pathname) && dropped === 0) {
        dropped += 1;
        await route.fetch();          // 放行到服务端：服务端确实已提交
        await route.abort('failed');  // 丢弃响应：模拟「服务端成功但客户端没收到」
        return;
      }
      return route.continue();
    });

    await clickSubmit();
    const serverAfterDrop = await apiOk(page, `/api/reports/${id6}`);
    check('B06-a', '响应丢失发生在服务端已处理之后（服务端已是已提交）',
      dropped === 1 && serverAfterDrop.status === 'SUBMITTED',
      `丢弃=${dropped} status=${serverAfterDrop.status} dialog=${JSON.stringify(dialogs.map((d) => d.message).slice(0, 1))}`);

    const auditBeforeRetry = await auditTotal(saToken, id6);
    dialogs.length = 0;
    await clickSubmit(); // 重试（先 PUT 更新回放，再提交回放）
    await page.waitForTimeout(1200);

    const afterRetry = await apiOk(page, `/api/reports/${id6}`);
    const versions = await apiOk(page, `/api/reports/${id6}/versions`);
    const versionCount = Array.isArray(versions) ? versions.length : null;
    check('B06-b', '重试后服务端状态仍为已提交，且**版本数恰好 1**（不是 0 也不是 2）',
      afterRetry.status === 'SUBMITTED' && versionCount === 1,
      `status=${afterRetry.status} versions=${versionCount}（旧断言 <=1 连 0 版本也接受）`);

    const submitKeys = submitRequests.map((w) => w.clientMutationId);
    check('B06-c', '提交重试复用同一幂等键（两次请求 key 相同；第一次响应被丢弃仍可从请求侧核对）',
      submitKeys.length >= 2 && Boolean(submitKeys[0]) && submitKeys[0] === submitKeys[1],
      `keys=${JSON.stringify(submitKeys.slice(0, 3).map((k) => String(k).slice(0, 8)))} 服务端响应=${submitWrites.length} 次`);

    const rows6 = await listReports(`reportType=DAILY&authorId=${authorId}&projectId=${projA.id}&periodKey=${D6}`);
    check('B06-d', '未重复创建同日记录', (rows6.list ?? []).length === 1, `记录数=${(rows6.list ?? []).length}`);

    // 审计 action 取值为小写枚举（kernel/constants.js AUDIT_ACTIONS）
    const submitAudit = await auditTotal(saToken, id6, 'submit');
    const updateAudit = await auditTotal(saToken, id6, 'update');
    const createAudit = await auditTotal(saToken, id6, 'create');
    const auditAfterRetry = await auditTotal(saToken, id6);
    check('B06-e', '创建/更新/提交各只产生一次业务审计，重试未新增任何审计（回执重放）',
      createAudit === 1 && updateAudit === 1 && submitAudit === 1 && auditAfterRetry === auditBeforeRetry,
      `create=${createAudit} update=${updateAudit} submit=${submitAudit} 总审计 ${auditBeforeRetry}→${auditAfterRetry}`);

    await page.unroute('**/api/reports/**');
  }

  rec('B99', '控制台错误（仅供排查，不参与判定）', true, `consoleErrors=${consoleErrors.length}`);
} catch (e) {
  rec('EXC', '用例执行中断', false, msg(e));
  await snap('exception');
} finally {
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
  };
  fs.writeFileSync(path.join(OUT, `${stack.runId}-rf03b-results.json`), `${JSON.stringify({
    runId: stack.runId, suite: 'rf03b', fixtures, summary, results, consoleErrors: consoleErrors.slice(0, 10),
  }, null, 2)}\n`);
  stack.saveManifest(OUT, {
    fields: { fixtures, resultSummary: summary },
  });
  await ctx.close().catch(() => {});
  await stack.stop();
  console.log(`[rf03b] 汇总 ${summary.pass}/${summary.total} PASS`);
  process.exit(summary.fail ? 1 : 0);
}
