/**
 * tests/browser/glass-shots.mjs —— 玻璃主题改造的视觉取证（一次性工具）
 *
 * 复用隔离环境脚手架（后端 dist + vite dev + rdpms_test 库），
 * 登录后逐页截图，用于人工核对改造成效；不做业务断言。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/ui-glass');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['login', '/login', { beforeLogin: true }],
  ['dashboard', '/'],
  ['projects', '/projects'],
  ['tasks', '/tasks'],
  ['reports', '/reports'],
  ['knowledge', '/knowledge'],
  ['reagent-formula', '/reagent-formula'],
  ['project-templates', '/project-templates'],
  ['users', '/users'],
  ['roles', '/roles'],
  ['audit-logs', '/audit-logs'],
  ['system-logs', '/system-logs'],
  ['settings', '/settings'],
];

const stack = await startStack();
console.log(`[glass] runId=${stack.runId} frontend=${stack.apiBase} db=${stack.masked.database}`);

const context = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

const shots = [];
async function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(name);
  console.log(`  截图 ${name} → ${page.url()}`);
}

// 1. 登录页
await page.goto(`${stack.apiBase}/login`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await shot('00-login');

// 2. 登录
await page.getByPlaceholder('请输入用户名').fill('test_super_admin');
await page.getByPlaceholder('请输入密码').fill(stack.testEnv.SEED_TEST_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
await page.waitForTimeout(1200);

// 3. 逐页截图
for (let i = 0; i < ROUTES.length; i += 1) {
  const [name, route, opts] = ROUTES[i];
  if (opts?.beforeLogin) continue;
  await page.goto(`${stack.apiBase}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await shot(`${String(i).padStart(2, '0')}-${name}`);
}

// 4. 移动端视图（侧栏抽屉）
await page.setViewportSize({ width: 420, height: 860 });
await page.goto(`${stack.apiBase}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('90-mobile-dashboard');

fs.writeFileSync(
  path.join(OUT, 'console-errors.json'),
  `${JSON.stringify({ runId: stack.runId, shots, consoleErrors }, null, 2)}\n`,
);
console.log(`[glass] 控制台错误 ${consoleErrors.length} 条`);
await context.close();
await stack.stop();
console.log(`[glass] 完成，输出目录 ${OUT}`);
