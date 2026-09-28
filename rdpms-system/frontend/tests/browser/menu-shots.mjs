/** 菜单（一级/二级/折叠）视觉取证 —— 一次性工具 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { startStack, CHROME, REPO_ROOT } from './harness.mjs';

const OUT = path.join(REPO_ROOT, 'docs/port/evidence/ui-glass');
fs.mkdirSync(OUT, { recursive: true });

const stack = await startStack();
const context = await chromium.launchPersistentContext(stack.profile, {
  executablePath: CHROME,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = context.pages()[0] ?? (await context.newPage());

async function login(username) {
  await page.goto(`${stack.apiBase}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${stack.apiBase}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('请输入用户名').fill(username);
  await page.getByPlaceholder('请输入密码').fill(stack.testEnv.SEED_TEST_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
  await page.waitForTimeout(1000);
}

// 超管：二级菜单展开（系统分组）
await login('test_super_admin');
await page.goto(`${stack.apiBase}/users`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, 'A1-superadmin-submenu.png') });

// 折叠态
await page.getByTitle('折叠菜单').click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'A2-superadmin-collapsed.png') });
await page.getByTitle('展开菜单').click();
await page.waitForTimeout(400);

// 知识库二级项命中（带查询串）
await page.goto(`${stack.apiBase}/knowledge?module=primers`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, 'A3-knowledge-subnav.png') });

// 普通成员视角
await login('test_member');
await page.goto(`${stack.apiBase}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, 'A4-member-menu.png') });

console.log(`[menu] runId=${stack.runId} 输出 ${OUT}`);
await context.close();
await stack.stop();
