/**
 * tests/browser/rf03.e2e.mjs —— RF03 浏览器验收（B01/B02/B03）
 *
 * 原则：
 *   - 交互全部走用户可见操作（点击、输入），断言以**服务端真实状态**为准（API/DB 核对）；
 *   - 选择器优先 role/label，不依赖 CSS 层级；等待明确状态而非长时间固定等待；
 *   - 失败时保留脱敏截图 + 控制台错误 + 页面结构快照；
 *   - 运行清单记录提交号、源码/构建内容哈希、端口、脱敏库名、实例标识。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';
import { api, readToken } from './authHelper.mjs';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/round6');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let stepNo = 0;
function record(id, name, ok, detail = '') {
  results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${detail ? ` | ${detail}` : ''}`);
}
function envBlocked(reason) {
  results.push({ id: 'ENV', name: '环境', status: 'ENV_BLOCKED', detail: reason });
  console.log(`ENV_BLOCKED  ${reason}`);
}

const stack = await startStack();
const manifestPath = path.join(OUT, `${stack.runId}-manifest.json`);
fs.writeFileSync(manifestPath, `${JSON.stringify(stack.manifest, null, 2)}\n`);
console.log(`[rf03] runId=${stack.runId} 端口 backend=${stack.backendPort} frontend=${stack.frontendPort} db=${stack.masked.database}`);
assert.equal(stack.manifest.git.worktreeDirty, true, '本轮存在未提交改动，清单需标注（不影响断言）');

const context = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 1000 },
});
const page = context.pages()[0] ?? await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

/** 失败取证：截图 + 页面结构（脱敏，不含凭据） */
async function snapshot(tag) {
  stepNo += 1;
  const base = path.join(OUT, `${stack.runId}-${String(stepNo).padStart(2, '0')}-${tag}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  const struct = {
    url: page.url(),
    buttons: await page.locator('button').allInnerTexts().catch(() => []),
    labels: await page.locator('label').allInnerTexts().catch(() => []),
    inputs: await page.locator('input,select,textarea').evaluateAll(
      (els) => els.map((e) => `${e.tagName.toLowerCase()}[${e.type ?? ''}]${e.placeholder ? ` ph=${e.placeholder}` : ''}`),
    ).catch(() => []),
    text: (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 800),
  };
  fs.writeFileSync(`${base}.json`, JSON.stringify(struct, null, 2));
  return struct;
}

// 统一鉴权读取与严格 API 断言（401/403 不再被解释为「0 条」）
const apiToken = () => readToken(page);
const apiGet = (path) => api(page, path);
async function login(username) {
  await page.goto(`${stack.apiBase}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('请输入用户名').fill(username);
  await page.getByPlaceholder('请输入密码').fill(stack.testEnv.SEED_TEST_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

/**
 * 打开「新建日报」并把日期设为指定日期。
 * 注意：不要依赖列表页按钮文案——它是「填写日报/周报/月报」中随当天日期变化的那一个
 * （月末跑 CI 时会变成「填写月报」，从而与用例语义不符）。
 */
async function openNewDaily(dateISO) {
  await page.goto(`${stack.apiBase}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.goto(`${stack.apiBase}/reports/new?type=${encodeURIComponent('日报')}`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/reports\/new/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  const dateInput = page.locator('input[type=date]').first();
  await dateInput.fill(dateISO);
  await page.waitForTimeout(600);
}

/** 添加一个项目条目（返回项目名） */
async function addProject() {
  const addBtn = page.getByRole('button', { name: /添加项目/ }).first();
  await addBtn.click();
  await page.waitForTimeout(900);
  const struct = await snapshot('project-picker');
  // 弹窗/下拉里的项目项：优先含「选择」或项目名前缀按钮
  const candidate = page.getByRole('button', { name: /选择|添加|SYN|项目/ }).last();
  if (await candidate.count()) {
    const label = (await candidate.innerText().catch(() => '')).trim();
    await candidate.click();
    await page.waitForTimeout(900);
    return label || 'unknown';
  }
  throw new Error(`未找到项目选择入口；页面结构见 ${JSON.stringify(struct).slice(0, 300)}`);
}

/** 在最后一个项目条目里填写正文 */
async function fillContent(text) {
  const textareas = page.locator('textarea');
  const count = await textareas.count();
  if (!count) throw new Error('页面没有可填写的正文输入框');
  await textareas.nth(count - 1).fill(text);
  await page.waitForTimeout(300);
}

async function saveDraft() {
  await page.getByRole('button', { name: /保存草稿/ }).first().click();
  await page.waitForTimeout(1800);
}

async function submitDaily() {
  const btn = page.getByRole('button', { name: /提交日报|提交/ }).first();
  await btn.click();
  await page.waitForTimeout(2200);
}

try {
  // ── 前置：登录 + 取项目清单 ──
  await login('test_super_admin');
  const me = await apiGet('/api/auth/me');
  const myUserId = me.body?.id;
  const reportsBefore = await apiGet(`/api/reports?reportType=DAILY&pageSize=100&authorId=${myUserId}`);
  record('B00', '登录后 /api/reports 可访问（超管权限出口修复生效）',
    reportsBefore.status === 200 && Boolean(myUserId), `status=${reportsBefore.status} me.permissions=${(me.body?.permissions ?? []).length}`);

  const day = 10 + (Number.parseInt(stack.runId.slice(-6), 16) % 10);
  const D1 = `2026-09-${String(day).padStart(2, '0')}`;
  const D2 = `2026-09-${String(day + 1).padStart(2, '0')}`;
  const TEXT1 = 'B01-第一天内容-首日';
  const TEXT2 = 'B01-第二天内容-次日';

  // ── B01：同人同项目两天分别新建日报 ──
  await openNewDaily(D1);
  await addProject();
  await fillContent(TEXT1);
  await snapshot('b01-d1-filled');
  await saveDraft();

  // 只统计**本账号**的记录：同 periodKey 可能存在于其它账号/项目（唯一约束是 (项目,作者,类型,周期)）
  const afterD1 = await apiGet(`/api/reports?reportType=DAILY&pageSize=100&authorId=${myUserId}`);
  const rowsD1 = (afterD1.body?.list ?? []).filter((r) => r.periodKey === D1);
  const d1Row = rowsD1.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  record('B01-a', '第一天 DAILY 保存成功且 periodKey 为完整日期',
    afterD1.status === 200 && rowsD1.length >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(d1Row?.periodKey ?? ''),
    `periodKey=${d1Row?.periodKey} 本账号命中 ${rowsD1.length} 条（同日多项目属正常）`);
  const d1Id = d1Row?.id;

  await openNewDaily(D2);
  await addProject();
  await fillContent(TEXT2);
  await saveDraft();

  const afterD2 = await apiGet(`/api/reports?reportType=DAILY&pageSize=100&authorId=${myUserId}`);
  const list = afterD2.body?.list ?? [];
  const r1 = list.find((r) => r.id === d1Id);
  const r2 = list.filter((r) => r.periodKey === D2);
  const d2Row = r2.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  record('B01-b', '第二天新建不覆盖第一天（两条独立记录）',
    Boolean(r1) && Boolean(d2Row) && r1.id !== d2Row.id && r1.periodKey === D1 && d2Row.periodKey === D2,
    `D1(id=${String(r1?.id).slice(0, 8)}) D2(id=${String(d2Row?.id).slice(0, 8)}) 本账号当日记录=${list.filter((r) => [D1, D2].includes(r.periodKey)).length}`);

  // 内容断言：第一天内容仍在
  const d1Detail = await apiGet(`/api/reports/${d1Id}`);
  const d1Text = JSON.stringify(d1Detail.body?.content ?? {});
  record('B01-c', '第一天内容未被第二天覆盖',
    d1Text.includes(TEXT1) && !d1Text.includes(TEXT2), `content 长度=${d1Text.length}`);

  // ── B02：重新打开编辑（回填）+ 再次保存不丢项 ──
  await page.goto(`${stack.apiBase}/reports/${d1Id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const taValues = await page.locator('textarea').evaluateAll((els) => els.map((e) => e.value));
  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  // 回填证据：输入框实际值含原文（textarea 的 value 不体现在 innerText，必须单独读）
  const filledBack = taValues.some((v) => v.includes(TEXT1));
  const projectRowVisible = /项目|SYN|进展|工作/.test(bodyText);
  record('B02-a', '重新打开时正文回填（输入框实际值）', filledBack,
    `textarea 数=${taValues.length} 首个长度=${taValues[0]?.length ?? 0} 行可见=${projectRowVisible}`);
  if (!filledBack) await snapshot('b02-not-filled');

  const textareas = page.locator('textarea');
  const taCount = await textareas.count();
  if (taCount) {
    await textareas.first().fill(`${TEXT1}-已编辑`);
    await saveDraft();
  }
  const d1AfterEdit = await apiGet(`/api/reports/${d1Id}`);
  const editText = JSON.stringify(d1AfterEdit.body?.content ?? {});
  record('B02-b', '再次保存不丢项且改动生效（含“已编辑”标记、原文前缀仍在）',
    editText.includes(TEXT1) && editText.includes('已编辑'),
    `含原文=${editText.includes(TEXT1)} 含已编辑=${editText.includes('已编辑')} 长度=${editText.length}`);

  // ── B03：保存后提交（服务端状态与版本真实变化） ──
  const beforeSubmit = await apiGet(`/api/reports/${d1Id}`);
  await page.goto(`${stack.apiBase}/reports/${d1Id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await submitDaily();
  const afterSubmit = await apiGet(`/api/reports/${d1Id}`);
  const st1 = beforeSubmit.body?.status;
  const st2 = afterSubmit.body?.status;
  const v1 = beforeSubmit.body?.currentVersion;
  const v2 = afterSubmit.body?.currentVersion;
  const versions = await apiGet(`/api/reports/${d1Id}/versions`);
  const versionCount = Array.isArray(versions.body) ? versions.body.length
    : (Array.isArray(versions.body?.list) ? versions.body.list.length : null);
  record('B03-a', '提交后服务端状态与提交版本实际改变',
    st2 === 'SUBMITTED' && st1 !== 'SUBMITTED' && (versionCount === null ? v2 >= v1 : versionCount >= 1),
    `status ${st1}→${st2}, currentVersion ${v1}→${v2}, 版本记录=${versionCount ?? `接口不可用(${versions.status})`}`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const afterReloadText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  record('B03-b', '刷新后仍显示已提交状态（非仅按钮变化）',
    /已提交|待审阅|审阅中/.test(afterReloadText), afterReloadText.slice(0, 120));
} catch (e) {
  record('EXC', '用例执行异常', false, String(e?.message ?? e).slice(0, 400));
  await snapshot('exception');
} finally {
  fs.writeFileSync(path.join(OUT, `${stack.runId}-rf03-results.json`), `${JSON.stringify({
    runId: stack.runId, manifest: stack.manifest, results, consoleErrors: consoleErrors.slice(0, 10),
  }, null, 2)}\n`);
  console.log('\n[rf03] 控制台错误数:', consoleErrors.length);
  await context.close().catch(() => {});
  await stack.stop();
  const failed = results.filter((r) => r.status !== 'PASS');
  console.log(`[rf03] 汇总: ${results.length - failed.length}/${results.length} PASS`);
  process.exit(failed.length ? 1 : 0);
}
