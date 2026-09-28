/**
 * tests/browser/harness.mjs —— 隔离环境浏览器测试脚手架（第六轮强化）
 *
 * 设计要点：
 *   1. **复用统一测试库守卫**（backend/scripts/lib/testDbGuard.mjs）：库名完整匹配
 *      `^rdpms_test(_[a-z0-9_]+)?$`、主机限本机、DATABASE_URL 与 DIRECT_URL 必须同库、
 *      显式拒绝 rdpms / rdpms_drill / postgres / template*；校验先于任何迁移、种子、写入。
 *   2. 动态空闲端口 + 只清理本次启动的进程（记 PID，不动未知进程）。
 *   3. 就绪检查除 health 外，核对**本轮实例标识**（RDPMS_INSTANCE_ID），避免访问旧进程。
 *   4. 运行清单记录内容哈希（源码树、构建产物），mtime/size 仅作辅助。
 *   5. 隔离上传目录与浏览器配置目录（互不污染、可整体删除）。
 *
 * 输出：脱敏清单（不含口令；URL 只保留 host/port/库名）。
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checkEnvironment } from '../../../backend/scripts/lib/testDbGuard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = path.resolve(HERE, '../..');
export const REPO_ROOT = path.resolve(FRONTEND_ROOT, '../..');
export const BACKEND_ROOT = path.join(REPO_ROOT, 'rdpms-system/backend');
const CACHE = process.env.HOME ?? '';
export const CHROME = path.join(
  CACHE,
  '.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** 目录内容哈希：按相对路径排序后逐个文件哈希（相对 mtime/size 更可靠） */
export function hashTree(dir, filter = () => true) {
  const files = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (filter(full)) files.push(full);
    }
  };
  walk(dir);
  const h = crypto.createHash('sha256');
  for (const f of files.sort()) {
    h.update(path.relative(dir, f));
    h.update(fs.readFileSync(f));
  }
  return { hash: h.digest('hex').slice(0, 32), files: files.length };
}

/** 动态空闲端口 */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitHealth(port, expectInstance, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await res.json();
      last = body;
      if (res.ok && body?.instance === expectInstance) return body;
    } catch (e) { last = { error: String(e?.message ?? e) }; }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`后端未就绪或实例标识不匹配（期望 ${expectInstance}，最后响应 ${JSON.stringify(last)}）`);
}

async function waitHttp(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status) return true;
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** 测试库守卫：不通过则直接拒绝启动（ENV_BLOCKED，退出码 2） */
export function assertTestEnv() {
  const { env, problems, dbTarget, directTarget } = checkEnvironment();
  if (problems.length) {
    console.error('[browser-harness] ENV_BLOCKED：测试环境不满足隔离要求：');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('[browser-harness] 未启动任何服务，未执行任何数据库操作。');
    process.exit(2);
  }
  // 脱敏标识：只保留 host/port/库名
  const masked = {
    database: dbTarget.dbName,
    directDatabase: directTarget.dbName,
    host: dbTarget.hostname,
    port: dbTarget.port,
  };
  return { env, masked };
}

export function newRunId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function startStack({ uploadDirRoot, suite = 'unknown' } = {}) {
  const { env, masked } = assertTestEnv();
  const runId = newRunId();
  const startedAt = new Date().toISOString();
  const backendPort = await freePort();
  const frontendPort = await freePort();

  // 隔离目录：上传目录 + 浏览器配置目录 + 证据输出
  const tmpRoot = uploadDirRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), `rdpms-browser-${runId}-`));
  const uploads = path.join(tmpRoot, 'uploads');
  const profile = path.join(tmpRoot, 'chrome-profile');
  fs.mkdirSync(uploads, { recursive: true });
  fs.mkdirSync(profile, { recursive: true });

  const buildId = process.env.RDPMS_BUILD_ID ?? runId;
  const logs = { backend: '', frontend: '' };

  const backend = spawn(process.execPath, ['dist/index.js'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      ...env,
      PORT: String(backendPort),
      HOST: '::',
      NODE_ENV: 'test',
      UPLOAD_DIR: uploads,
      RDPMS_INSTANCE_ID: runId,
      RDPMS_BUILD_ID: buildId,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', (d) => { logs.backend += d.toString(); });
  backend.stderr.on('data', (d) => { logs.backend += d.toString(); });

  const vite = spawn(path.join(FRONTEND_ROOT, 'node_modules/.bin/vite'), [
    '--port', String(frontendPort), '--strictPort', '--host', '127.0.0.1',
  ], {
    cwd: FRONTEND_ROOT,
    env: { ...process.env, VITE_API_PROXY_TARGET: `http://[::1]:${backendPort}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (d) => { logs.frontend += d.toString(); });
  vite.stderr.on('data', (d) => { logs.frontend += d.toString(); });

  const pids = { backend: backend.pid, vite: vite.pid };
  try {
    const health = await waitHealth(backendPort, runId);
    const frontendUp = await waitHttp(frontendPort);
    if (!frontendUp) throw new Error('前端未就绪');
    void health;
  } catch (e) {
    backend.kill('SIGTERM'); vite.kill('SIGTERM');
    throw new Error(`${e.message}\n--- backend 日志 ---\n${logs.backend}\n--- vite 日志 ---\n${logs.frontend}`);
  }

  const src = hashTree(path.join(BACKEND_ROOT, 'src'));
  const dist = hashTree(path.join(BACKEND_ROOT, 'dist'));
  const feSrc = hashTree(path.join(FRONTEND_ROOT, 'src'));
  // A10：清单必须同时记录**测试代码与配置**的内容哈希——
  // 只记录业务源码时，无法证明「当次运行用的就是这份测试脚本」
  const testsBrowser = hashTree(path.join(FRONTEND_ROOT, 'tests/browser'));
  const configFiles = [
    path.join(FRONTEND_ROOT, 'vite.config.ts'),
    path.join(FRONTEND_ROOT, 'tsconfig.app.json'),
    path.join(FRONTEND_ROOT, 'package.json'),
    path.join(BACKEND_ROOT, 'package.json'),
  ].filter((f) => fs.existsSync(f));
  const configHash = crypto.createHash('sha256');
  for (const f of configFiles) {
    configHash.update(path.basename(f));
    configHash.update(fs.readFileSync(f));
  }

  const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  // 只在**代码目录**内判定脏工作区：证据输出（截图/清单）本身就是本套件生成的运行产物，
  // 把它们算进来会让每一次运行都必然「脏」，反而失去该字段的意义
  const gitStatus = git(['status', '--porcelain', '--', 'rdpms-system']);

  const manifest = {
    runId,
    suite,
    startedAt,
    finishedAt: null,
    git: {
      head: git(['rev-parse', 'HEAD']),
      headShort: git(['rev-parse', '--short', 'HEAD']),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      worktreeDirty: gitStatus.length > 0,
      // A10：脏工作区必须留痕——未提交改动会改变实际被执行的代码内容
      worktreeStatus: gitStatus ? gitStatus.split('\n').slice(0, 40) : [],
    },
    sourceHash: { backendSrc: src.hash, backendFiles: src.files, frontendSrc: feSrc.hash, frontendFiles: feSrc.files },
    testCodeHash: { browserTests: testsBrowser.hash, browserTestFiles: testsBrowser.files },
    configHash: { hash: configHash.digest('hex').slice(0, 32), files: configFiles.map((f) => path.basename(f)) },
    buildArtifactHash: { dist: dist.hash, distFiles: dist.files, buildId },
    runtime: {
      node: process.version,
      browser: CHROME,
      browserVersion: fs.existsSync(CHROME) ? 'chrome-headless-shell (build 1234)' : 'MISSING',
      frontendMode: 'vite dev server（源码直出，未做生产构建）',
      frontendSourceHash: feSrc.hash,
    },
    ports: { backend: backendPort, frontend: frontendPort },
    testDb: masked,
    isolatedDirs: { tmpRoot, uploads, profile },
    pids,
    buildId,
    instanceId: runId,
    /** A10：本轮使用的合成夹具（账号 / 项目）与结果摘要，由 suite 写入 */
    fixtures: null,
    resultSummary: null,
    postRunHash: null,
  };

  return {
    runId, masked, testEnv: env, manifest, logs, tmpRoot,
    apiBase: `http://127.0.0.1:${frontendPort}`,
    backendPort, frontendPort, profile,
    /**
     * 写出/改写运行清单。开始与结束各写一次：
     * 结束那次必须带 finishedAt、postRunHash（运行后重新计算的内容哈希）与结果摘要，
     * 并且**若运行前后源码哈希不同，本次运行不得作为正式证据**（由调用方断言）。
     */
    saveManifest: (outDir, extra = {}) => {
      fs.mkdirSync(outDir, { recursive: true });
      if (extra.finished !== false) {
        manifest.finishedAt = new Date().toISOString();
        manifest.postRunHash = {
          backendSrc: hashTree(path.join(BACKEND_ROOT, 'src')).hash,
          frontendSrc: hashTree(path.join(FRONTEND_ROOT, 'src')).hash,
          dist: hashTree(path.join(BACKEND_ROOT, 'dist')).hash,
          browserTests: hashTree(path.join(FRONTEND_ROOT, 'tests/browser')).hash,
        };
      }
      Object.assign(manifest, extra.fields ?? {});
      const target = path.join(outDir, `${runId}-manifest.json`);
      fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
      return target;
    },
    /** 结束：只终止本次启动的进程 */
    stop: async () => {
      for (const child of [backend, vite]) {
        if (!child.killed) child.kill('SIGTERM');
      }
      await new Promise((r) => setTimeout(r, 900));
      manifest.finishedAt = manifest.finishedAt ?? new Date().toISOString();
    },
  };
}
