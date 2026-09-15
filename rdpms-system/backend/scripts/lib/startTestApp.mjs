/**
 * scripts/lib/startTestApp.mjs —— 为集成测试启动隔离应用（RF04 验证补强）
 *
 * 目的：T4/T5 等 HTTP 断言不再因为「本机没起服务」而跳过。
 * 做法：用构建产物 dist/index.js + 隔离测试库环境，在**动态空闲端口**上启动一个真实服务，
 *      等待 /health 就绪后返回 base URL 与关闭函数；启动失败视为 ENV_BLOCKED（不得静默跳过）。
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { BACKEND_ROOT } from './testDbGuard.mjs';

/** 取一个空闲端口 */
export function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base, { timeoutMs = 20_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return true;
    } catch { /* 未就绪，继续等待 */ }
    await new Promise((r) => { setTimeout(r, intervalMs); });
  }
  return false;
}

/**
 * 启动隔离应用。
 * @param {object} env 测试环境变量（含 DATABASE_URL / JWT_SECRET 等）
 * @returns {Promise<{base: string, stop: () => Promise<void>, log: () => string}>}
 */
export async function startTestApp(env) {
  const port = await findFreePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, ...env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5_000);
      child.on('exit', () => { clearTimeout(timer); resolve(); });
    });
  };

  const ready = await waitForHealth(base);
  if (!ready) {
    await stop();
    throw new Error(`隔离应用未能在 20s 内就绪（端口 ${port}）。进程输出：\n${output}`);
  }
  return { base, stop, log: () => output };
}
