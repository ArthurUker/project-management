#!/usr/bin/env node
/**
 * scripts/run-unit-tests.mjs —— 前端纯逻辑单元测试运行器（RF03）
 *
 * 背景：仓库前端没有测试栈；引入新依赖需要联网安装，与本轮「不新增依赖」的约束冲突。
 * 方案：复用 Vite 已安装的 esbuild（TS→ESM，无需额外依赖），把 tests/unit 下的 TS 用例
 * 打包到临时目录后用 node:test 运行。
 *
 * 适用边界：只覆盖**纯逻辑/适配器**（日期键、内容归一化、DTO 映射），
 * 不覆盖组件渲染与交互——那属于 06 要求的 test:e2e（浏览器）范围。
 *
 * 用法：npm test（frontend）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const SRC_DIR = path.join(ROOT, 'tests/unit');
const ESBUILD = path.join(ROOT, 'node_modules/.bin/esbuild');

if (!fs.existsSync(ESBUILD)) {
  console.error('[frontend-tests] ENV_BLOCKED: 找不到 esbuild（先在前端目录安装依赖）');
  process.exit(2);
}
if (!fs.existsSync(SRC_DIR)) {
  console.log('[frontend-tests] 没有 tests/unit 目录，跳过');
  process.exit(0);
}

const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.test.ts')).sort();
if (files.length === 0) {
  console.log('[frontend-tests] 没有用例文件，跳过');
  process.exit(0);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdpms-fe-tests-'));
const bundles = [];
for (const file of files) {
  const out = path.join(outDir, file.replace(/\.ts$/, '.mjs'));
  const res = spawnSync(ESBUILD, [
    path.join(SRC_DIR, file),
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--target=node20',
    // 路径别名 @/* 定义在 tsconfig.app.json（根 tsconfig.json 只有 project references）
    '--tsconfig=tsconfig.app.json',
    // vite 注入的 import.meta.env 在 node 下不存在；置空以让 config/env.ts 走默认值
    '--define:import.meta.env={}',
    `--outfile=${out}`,
    '--log-level=warning',
  ], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`[frontend-tests] 打包失败：${file}`);
    process.exit(res.status ?? 1);
  }
  bundles.push(out);
}

const run = spawnSync(process.execPath, ['--test', ...bundles], { cwd: ROOT, stdio: 'inherit' });
fs.rmSync(outDir, { recursive: true, force: true });
process.exit(run.status ?? 1);
