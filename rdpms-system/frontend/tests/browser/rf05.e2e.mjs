/**
 * tests/browser/rf05.e2e.mjs —— RF05 真实浏览器验证：文件作用域在**真实登录会话**下生效
 *
 * 与集成测试的区别：集成测试用注入主体（stub actor）验证策略；本套件用**真实登录 + 真实权限**
 * （权限来自数据库角色）走完整 HTTP 栈，覆盖前端实际使用的下载路径 `/api/files/:id`。
 *
 * 覆盖：
 *   R1 上传后进入私有暂存：上传者可见可下载；
 *   R2 同一环境下的另一个账号（不同角色）看不到、下不到、列表里也查不到（404 语义）；
 *   R3 法规原文入口（import-source）在有 regulatory_documents.view 的账号下可用；
 *   R4 法规文档列表页（走 FileAccessPolicy 的元数据回填）仍正常渲染。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';
import { api, loginAs } from './authHelper.mjs';

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

const stack = await startStack({ suite: 'rf05 (文件作用域)' });
stack.saveManifest(OUT, { finished: false });
console.log(`[rf05] runId=${stack.runId} backend=${stack.backendPort} frontend=${stack.frontendPort} db=${stack.masked.database}`);

const ctx = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 1000 },
});
const page = ctx.pages()[0] ?? await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

async function snap(tag) {
  const base = path.join(OUT, `${stack.runId}-rf05-${tag}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  fs.writeFileSync(`${base}.json`, JSON.stringify({
    url: page.url(),
    text: (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 800),
  }, null, 2));
}

/** 在当前会话下用真实 FormData 上传一个文件（前端同款路径） */
async function uploadViaBrowser(name, content) {
  return page.evaluate(async ({ name, content }) => {
    const token = localStorage.getItem('rdpms.accessToken');
    const fd = new FormData();
    fd.append('file', new File([content], name, { type: 'text/plain' }));
    const res = await fetch('/api/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    return { status: res.status, body };
  }, { name, content });
}

try {
  // ══ R1 上传者：上传后是私有暂存，自己可见可下载 ══
  const owner = await loginAs(page, stack, 'test_member');
  const stamp = `${Date.now()}`;
  const fileName = `rf05-${stamp}.txt`;
  const uploaded = await uploadViaBrowser(fileName, 'rf05-browser-content');
  check('RF05-B1', '上传成功且返回明确作用域（PRIVATE_STAGING）',
    uploaded.status === 201 && uploaded.body?.accessScope === 'PRIVATE_STAGING',
    `status=${uploaded.status} scope=${uploaded.body?.accessScope}`);
  const fileId = uploaded.body?.id;

  const ownerMeta = await api(page, `/api/files/${fileId}/metadata`);
  check('RF05-B2', '上传者本人可读元数据', ownerMeta.status === 200, `status=${ownerMeta.status}`);
  const ownerDl = await api(page, `/api/files/${fileId}`);
  check('RF05-B3', '上传者本人可经前端使用的 /api/files/:id 下载',
    ownerDl.status === 200, `status=${ownerDl.status}`);
  const ownerList = await api(page, '/api/files?pageSize=100');
  check('RF05-B4', '上传者列表包含自己的暂存文件',
    (ownerList.body?.list ?? []).some((r) => r.id === fileId),
    `列表条数=${(ownerList.body?.list ?? []).length}`);

  // ══ R2 另一个账号（真实权限来自角色）：看不到、下不到 ══
  await loginAs(page, stack, 'test_manager');
  const otherMeta = await api(page, `/api/files/${fileId}/metadata`, { allowFailure: true });
  check('RF05-B5', '他人读取元数据被拒（404 隐藏存在性，不是 403）',
    otherMeta.status === 404, `status=${otherMeta.status} code=${otherMeta.body?.code ?? ''}`);
  const otherDl = await api(page, `/api/files/${fileId}`, { allowFailure: true });
  check('RF05-B6', '他人下载被拒（前端实际路径同权）',
    otherDl.status === 404, `status=${otherDl.status}`);
  const otherList = await api(page, '/api/files?pageSize=100');
  check('RF05-B7', '他人列表中不含该文件',
    !(otherList.body?.list ?? []).some((r) => r.id === fileId),
    `列表条数=${(otherList.body?.list ?? []).length}`);

  // ══ R3 法规原文入口（import-source）需要 regulatory_documents.view ══
  await loginAs(page, stack, 'test_super_admin');
  const docs = await api(page, '/api/regulatory-documents?pageSize=5');
  check('RF05-B8', '法规文档列表可读（元数据回填走策略，不因附件被拒）',
    docs.status === 200 && Array.isArray(docs.body?.list),
    `status=${docs.status} rows=${(docs.body?.list ?? []).length}`);
  const firstDoc = (docs.body?.list ?? [])[0];
  if (firstDoc) {
    const orig = await api(page, `/api/regulatory-documents/${firstDoc.id}/original-file`, { allowFailure: true });
    check('RF05-B9', '原文读取状态符合策略（有原文 200 / 无原文 404，均不是 500）',
      orig.status === 200 || orig.status === 404, `status=${orig.status}`);
  } else {
    rec('RF05-B9', '原文读取状态符合策略（无种子数据，跳过）', true, 'SKIP: 列表为空');
  }

  // ══ R4 页面级回归：法规文档页正常渲染 ══
  await page.goto(`${stack.apiBase}/regulatory-documents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('RF05-B10', '法规文档页面正常渲染（策略未破坏既有限制）',
    !/Failed to fetch|500|错误/i.test(bodyText) && bodyText.length > 50,
    bodyText.slice(0, 120));
  await snap('regulatory-page');

  rec('RF05-B11', '控制台错误（仅供排查，不参与判定）', true, `consoleErrors=${consoleErrors.length}`);
} catch (e) {
  rec('EXC', '用例执行中断', false, msg(e));
  await snap('exception');
} finally {
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
  };
  fs.writeFileSync(path.join(OUT, `${stack.runId}-rf05-results.json`), `${JSON.stringify({
    runId: stack.runId, suite: 'rf05', summary, results, consoleErrors: consoleErrors.slice(0, 10),
  }, null, 2)}\n`);
  stack.saveManifest(OUT, { fields: { resultSummary: summary } });
  await ctx.close().catch(() => {});
  await stack.stop();
  console.log(`[rf05] 汇总 ${summary.pass}/${summary.total} PASS`);
  process.exit(summary.fail ? 1 : 0);
}
