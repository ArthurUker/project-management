/**
 * RF01 回归用例 1/3 —— 可测试启动（F18）
 *
 * 验收（06_重构任务与发布门禁.md RF01）：
 *   - 导入 app 不监听
 *   - 导入 app 不连接数据库
 *
 * 判定方式：在子进程中以「无 DATABASE_URL、无 JWT_SECRET」的环境导入 createApp 并构建应用。
 *   - 修复前：src/index.js 在模块顶层 new PrismaClient()（缺 DATABASE_URL 直接抛错）并 serve() 启动监听。
 *   - 修复后：导入与构建应用不触碰数据库、不打开端口，进程可正常退出。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BACKEND_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

const CHILD_SCRIPT = `
import { createApp } from './dist/bootstrap/createApp.js';
const app = createApp({ db: {} });
if (typeof app?.fetch !== 'function') { console.error('NO_APP_FETCH'); process.exit(2); }
const listening = (process._getActiveHandles?.() ?? [])
  .filter((h) => h && h.constructor && h.constructor.name === 'Server' && h.listening === true);
if (listening.length > 0) { console.error('LISTENING_SOCKET_OPEN'); process.exit(3); }
console.log('BOOTSTRAP_OK');
process.exit(0);
`;

function runChild(script) {
  const env = { ...process.env };
  // 关键：删除数据库与密钥配置，任何「导入即连库」都会立即失败
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  delete env.JWT_SECRET;
  delete env.NODE_ENV;
  delete env.PORT;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: BACKEND_ROOT,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('RF01-01 导入 createApp 不连接数据库、不监听端口', () => {
  let stdout = '';
  let failed = null;
  try {
    stdout = runChild(CHILD_SCRIPT);
  } catch (err) {
    failed = err;
  }
  assert.equal(
    failed,
    null,
    `构建应用时不应触碰数据库或打开端口；实际失败：${failed?.stderr || failed?.message || ''}`,
  );
  assert.match(stdout, /BOOTSTRAP_OK/);
});

test('RF01-02 入口拆分后 index.js 仍是可启动的服务入口（仅此文件允许 serve）', () => {
  // TS 构建链（ADR-02）后运行时入口是构建产物 dist/index.js
  const indexPath = path.join(BACKEND_ROOT, 'dist/index.js');
  const source = execFileSync(process.execPath, ['-e', `
    import fs from 'node:fs';
    process.stdout.write(fs.readFileSync(${JSON.stringify(indexPath)}, 'utf8'));
  `], { encoding: 'utf8' });

  // 服务入口必须落在 bootstrap/server.js，index.js 只做转发
  assert.match(source, /bootstrap\/server\.js/, 'index.js 应转发到 bootstrap/server.js');
  assert.doesNotMatch(source, /new PrismaClient\(/, 'index.js 不应直接构造 Prisma 客户端');
  assert.doesNotMatch(source, /app\.route\(/, 'index.js 不应注册路由');
});
