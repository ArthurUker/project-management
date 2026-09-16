/**
 * tests/browser/harness.mjs —— 隔离环境浏览器测试脚手架
 *
 * 职责：
 *   1. 用**独立端口**启动后端（隔离测试库）与 vite dev server，并等待就绪；
 *   2. 提供真实浏览器（chrome-headless-shell）会话；
 *   3. 记录并输出**运行清单**：提交号、构建标识、端口、测试库名——
 *      避免把旧进程的结果算到新代码上（每轮必须核对）。
 *
 * 约束：只连 rdpms_test；不读生产配置；凭据只从环境文件读，不写入任何报告。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = path.resolve(HERE, '../..');
export const REPO_ROOT = path.resolve(FRONTEND_ROOT, '../..');
export const BACKEND_ROOT = path.join(REPO_ROOT, 'rdpms-system/backend');
const ENV_FILE = path.join(REPO_ROOT, '.env.test.local');
const CHROME = path.join(
  process.env.HOME ?? '',
  '.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
);

/** 读取隔离测试环境文件（不打印、不外传内容） */
export function loadTestEnv() {
  if (!fs.existsSync(ENV_FILE)) throw new Error(`ENV_BLOCKED: 缺少 ${ENV_FILE}`);
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)="?([^"]*)"?\s*$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  if (!/rdpms_test/.test(env.DATABASE_URL ?? '')) {
    throw new Error('ENV_BLOCKED: DATABASE_URL 未指向 rdpms_test，拒绝在非隔离库运行浏览器测试');
  }
  return env;
}

/** 运行清单：每轮测试都必须记录，避免旧进程结果被误算 */
export function buildRunManifest({ backendPort, frontendPort, database }) {
  const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const head = git(['rev-parse', 'HEAD']);
  const short = git(['rev-parse', '--short', 'HEAD']);
  const dirty = git(['status', '--porcelain']).length > 0;
  // 构建标识：dist 入口的 mtime + 源码树哈希（用于确认跑的是当前代码）
  const distIndex = path.join(BACKEND_ROOT, 'dist/index.js');
  const buildId = fs.existsSync(distIndex)
    ? `dist@${fs.statSync(distIndex).mtime.toISOString()}-${fs.statSync(distIndex).size}`
    : 'dist MISSING';
  const srcHash = execFileSync('bash', ['-lc',
    `cd ${BACKEND_ROOT} && find src -type f -name '*.js' -o -name '*.ts' | sort | xargs sha1sum | sha1sum | cut -c1-12`],
    { encoding: 'utf8' }).trim();
  return {
    recordedAt: new Date().toISOString(),
    commit: head,
    commitShort: short,
    worktreeDirty: dirty,
    buildId,
    srcHash,
    backendPort,
    frontendPort,
    database,
    node: process.version,
    browser: CHROME,
  };
}

async function waitPort(port, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
      s.setTimeout(1000, () => { s.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export async function startStack({ backendPort = 3400, frontendPort = 5400 } = {}) {
  const testEnv = loadTestEnv();
  const dbName = /\/rdpms_test/.test(testEnv.DATABASE_URL) ? 'rdpms_test' : 'UNKNOWN';
  const logs = {};

  // 后端：绑定 ::（vite 代理目标是 http://[::1]:<port>）
  const backend = spawn(process.execPath, ['dist/index.js'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, ...testEnv, PORT: String(backendPort), HOST: '::', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  logs.backend = '';
  backend.stdout.on('data', (d) => { logs.backend += d.toString(); });
  backend.stderr.on('data', (d) => { logs.backend += d.toString(); });

  // 前端 dev server：代理 /api → http://[::1]:backendPort
  const vite = spawn(path.join(FRONTEND_ROOT, 'node_modules/.bin/vite'), [
    '--port', String(frontendPort), '--strictPort', '--host', '127.0.0.1',
  ], {
    cwd: FRONTEND_ROOT,
    env: {
      ...process.env,
      // 通过 vite 的 server.proxy 转发；端口用环境变量注入（vite.config 读取）
      VITE_API_PROXY_TARGET: `http://[::1]:${backendPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  logs.frontend = '';
  vite.stdout.on('data', (d) => { logs.frontend += d.toString(); });
  vite.stderr.on('data', (d) => { logs.frontend += d.toString(); });

  const backendUp = await waitPort(backendPort);
  const frontendUp = await waitPort(frontendPort);
  if (!backendUp || !frontendUp) {
    backend.kill(); vite.kill();
    throw new Error(`服务未就绪 backend=${backendUp} frontend=${frontendUp}\n${logs.backend}\n${logs.frontend}`);
  }

  return {
    backend, vite, logs,
    testEnv,
    manifest: buildRunManifest({ backendPort, frontendPort, database: dbName }),
    apiBase: `http://127.0.0.1:${frontendPort}`,
    stop: async () => {
      backend.kill('SIGTERM'); vite.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 800));
    },
  };
}

export { CHROME };
