/**
 * tests/browser/probe.mjs —— 页面结构探针（第六轮）
 *
 * 目的：在编写断言前记录真实界面的稳定标识（role/label/testid），
 * 同时产出脱敏运行清单（本轮实例标识、内容哈希、端口、库名）。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/round6');
fs.mkdirSync(OUT, { recursive: true });

const stack = await startStack();
console.log('[probe] runId =', stack.runId);
console.log('[probe] 清单 =', JSON.stringify(stack.manifest, null, 2));

const context = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 1000 },
});
const page = context.pages()[0] ?? await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const dump = async (label) => {
  const buttons = await page.locator('button').allInnerTexts();
  const labels = await page.locator('label').allInnerTexts();
  const inputs = await page.locator('input,select,textarea').evaluateAll(
    (els) => els.map((e) => `${e.tagName.toLowerCase()}[type=${e.type ?? ''}]${e.placeholder ? ` ph="${e.placeholder}"` : ''}${e.name ? ` name=${e.name}` : ''}`),
  );
  console.log(`\n[probe] ===== ${label} =====`);
  console.log('URL:', page.url());
  console.log('buttons:', JSON.stringify(buttons.map((b) => b.trim().replace(/\s+/g, ' ')).filter(Boolean)));
  console.log('labels:', JSON.stringify(labels.map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 25)));
  console.log('inputs:', JSON.stringify(inputs.slice(0, 25)));
  console.log('text:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500));
};

try {
  await page.goto(`${stack.apiBase}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('请输入用户名').fill('test_super_admin');
  await page.getByPlaceholder('请输入密码').fill(stack.testEnv.SEED_TEST_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  console.log('[probe] 登录后 URL =', page.url());

  await page.goto(`${stack.apiBase}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'probe-reports.png'), fullPage: true });
  await dump('reports 列表页');

  // 尝试进入新建流程
  for (const name of ['新建', '新建汇报', '填写', '去填写', '新建日报', '创建汇报']) {
    const btn = page.getByRole('button', { name, exact: false });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, 'probe-new.png'), fullPage: true });
      await dump(`点击「${name}」后`);
      break;
    }
  }
  console.log('\n[probe] 控制台错误:', JSON.stringify(errors.slice(0, 6)));
  fs.writeFileSync(path.join(OUT, `${stack.runId}-probe.log`), `runId=${stack.runId}\n`);
  fs.writeFileSync(path.join(OUT, `${stack.runId}-manifest.json`), `${JSON.stringify(stack.manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT, `${stack.runId}-backend.log`), stack.logs.backend);
  fs.writeFileSync(path.join(OUT, `${stack.runId}-frontend.log`), stack.logs.frontend);
} finally {
  await context.close().catch(() => {});
  await stack.stop();
}
