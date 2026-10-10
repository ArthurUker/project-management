#!/usr/bin/env node
/**
 * scripts/run-integration.mjs —— 真实集成测试运行器（RF01 收尾）
 *
 * 职责：
 *   1. 先做隔离测试库守卫（生产库 / rdpms_drill / 非测试命名一律拒绝）；
 *   2. 把测试库环境注入子进程后运行 node --test（含原 RBAC 测试与被测集成用例）；
 *   3. 缺库时以退出码 2 结束（ENV_BLOCKED，阻止合并），不产生假 PASS。
 *
 * 用法：npm run test:integration
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { checkEnvironment, blocked, describeEnv, BACKEND_ROOT } from './lib/testDbGuard.mjs';
import { startTestApp } from './lib/startTestApp.mjs';

const requireDb = !process.argv.includes('--no-db-guard');
const { env, problems, dbTarget, directTarget } = checkEnvironment();

if (problems.length > 0) {
  if (requireDb) blocked(problems, '连接隔离测试库');
  console.warn('[test-db] 守卫未通过（已 --no-db-guard，仅输出提示）');
} else {
  describeEnv({ env, dbTarget, directTarget });
}

// TS 构建链（ADR-02）：集成测试跑构建产物，先构建再执行
const build = spawnSync('npm', ['run', '--silent', 'build'], {
  cwd: BACKEND_ROOT,
  env: { ...process.env, ...env },
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.error('[integration] 构建失败，未运行测试');
  process.exit(build.status ?? 1);
}

// RF04 验证补强：准备最小夹具（T4/T5 需要一个「viewer 非成员」的项目）
try {
  process.env.DATABASE_URL = env.DATABASE_URL;
  const { PrismaClient } = await import('@prisma/client');
  const { seedMinimalFixture } = await import('../tests/integration/fixtures.mjs');
  const prisma = new PrismaClient();
  await seedMinimalFixture(prisma);
  await prisma.$disconnect();
  console.log('[integration] 最小夹具已就绪（it-project-1 / it-user-*）');
} catch (err) {
  console.error(`[integration] ENV_BLOCKED：准备夹具失败 —— ${err.message}`);
  process.exit(2);
}

// RF04 验证补强：自动启动隔离应用，使 T4/T5 等 HTTP 断言不再因「未起服务」而跳过
let app = null;
try {
  app = await startTestApp(env);
  console.log(`[integration] 隔离应用已就绪：${app.base}`);
} catch (err) {
  console.error(`[integration] ENV_BLOCKED：无法启动隔离应用 —— ${err.message}`);
  process.exit(2);
}

const targets = ['tests/rbac.test.mjs', 'tests/integration/'];
const res = spawnSync(process.execPath, ['--test', ...targets], {
  cwd: BACKEND_ROOT,
  env: {
    ...process.env,
    ...env,
    RBAC_TEST_BASE: app.base,
    SMOKE_SA_PASSWORD: env.SEED_ADMIN_PASSWORD ?? '',
    SMOKE_TEST_PASSWORD: env.SEED_TEST_PASSWORD ?? '',
  },
  stdio: 'inherit',
});

await app.stop();
process.exit(res.status ?? 1);
