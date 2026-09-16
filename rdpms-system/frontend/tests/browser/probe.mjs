/**
 * tests/browser/probe.mjs —— 浏览器环境与页面结构探针
 *
 * 目的：在写断言之前**先看清**真实界面（按钮/输入/链接文案），
 * 并记录运行清单（提交号、构建标识、端口、测试库），用于排除「旧进程结果」。
 */
import { chromium } from 'playwright-core';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/round5');
fs.mkdirSync(OUT, { recursive: true });

const stack = await startStack({ backendPort: 3400, frontendPort: 5400 });
console.log('[probe] 运行清单:', JSON.stringify(stack.manifest, null, 2));
fs.writeFileSync(path.join(OUT, 'run-manifest.json'), `${JSON.stringify(stack.manifest, null, 2)}\n`);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

try {
  await page.goto(`${stack.apiBase}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, 'probe-1-login.png') });

  await page.getByPlaceholder('请输入用户名').fill('test_super_admin');
  await page.getByPlaceholder('请输入密码').fill(stack.testEnv.SEED_TEST_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  console.log('[probe] 登录后 URL =', page.url());
  await page.screenshot({ path: path.join(OUT, 'probe-2-home.png') });

  await page.goto(`${stack.apiBase}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'probe-3-reports.png'), fullPage: true });

  const dump = async (label) => {
    const buttons = await page.locator('button').allInnerTexts();
    const links = await page.locator('a').allInnerTexts();
    const inputs = await page.locator('input,select,textarea').evaluateAll(
      (els) => els.map((e) => `${e.tagName}[${e.type ?? ''}]${e.placeholder ? ` ph=${e.placeholder}` : ''}${e.name ? ` name=${e.name}` : ''}`),
    );
    console.log(`\n[probe] === ${label} ===`);
    console.log('buttons:', JSON.stringify(buttons.map((b) => b.trim()).filter(Boolean)));
    console.log('links:', JSON.stringify(links.map((l) => l.trim()).filter(Boolean).slice(0, 20)));
    console.log('inputs:', JSON.stringify(inputs.slice(0, 20)));
    console.log('text:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600));
  };

  await dump('reports 列表页');

  // 找新建入口：候选文案逐个尝试
  const candidates = ['新建', '新建汇报', '创建', '填写日报', '去填写', '新建日报'];
  for (const c of candidates) {
    const btn = page.getByRole('button', { name: c, exact: false });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(1500);
      console.log(`[probe] 点击「${c}」后 URL =`, page.url());
      await page.screenshot({ path: path.join(OUT, 'probe-4-new.png'), fullPage: true });
      await dump(`新建入口：${c}`);
      break;
    }
  }
  console.log('\n[probe] 控制台错误:', JSON.stringify(errors.slice(0, 5)));
} finally {
  await page.screenshot({ path: path.join(OUT, 'probe-last.png'), fullPage: true }).catch(() => {});
  await browser.close();
  await stack.stop();
  fs.writeFileSync(path.join(OUT, 'probe-backend.log'), stack.logs.backend);
  fs.writeFileSync(path.join(OUT, 'probe-frontend.log'), stack.logs.frontend);
}
