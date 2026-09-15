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

const requireDb = !process.argv.includes('--no-db-guard');
const { env, problems, dbTarget, directTarget } = checkEnvironment();

if (problems.length > 0) {
  if (requireDb) blocked(problems, '连接隔离测试库');
  console.warn('[test-db] 守卫未通过（已 --no-db-guard，仅输出提示）');
} else {
  describeEnv({ env, dbTarget, directTarget });
}

const targets = ['tests/rbac.test.mjs', 'tests/integration/'];
const res = spawnSync(process.execPath, ['--test', ...targets], {
  cwd: BACKEND_ROOT,
  env: { ...process.env, ...env },
  stdio: 'inherit',
});

process.exit(res.status ?? 1);
