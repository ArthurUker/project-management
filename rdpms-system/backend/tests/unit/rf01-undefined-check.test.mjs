/**
 * RF01 回归用例 3/3 —— 未定义标识符检查（F02/F21）
 *
 * 验收（06_重构任务与发布门禁.md RF01）：
 *   - 「CI 故意遗漏导入时失败」
 *
 * 本用例同时验证两件事：
 *   1. 仓库当前源码的未定义标识符检查为 0（修复后）；
 *   2. 当有人故意删掉一个 import 时，检查脚本必须失败（构造临时副本验证）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const CHECKER = path.join(BACKEND_ROOT, 'scripts/check-undefined.mjs');

function runChecker(root) {
  try {
    const stdout = execFileSync(process.execPath, [CHECKER, '--root', root], {
      encoding: 'utf8',
      timeout: 180_000,
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

test('RF01-07 当前后端源码不存在未定义标识符', () => {
  assert.ok(fs.existsSync(CHECKER), `缺少检查脚本 ${CHECKER}`);
  const result = runChecker(BACKEND_ROOT);
  assert.equal(result.code, 0, `存在未定义标识符：\n${result.stdout}`);
  assert.match(result.stdout, /no undefined identifiers/i);
});

test('RF01-08 故意遗漏 import 时检查必须失败', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-check-'));
  // 复刻真实目录布局：<sandbox>/rdpms-system/{backend,frontend}
  // 使检查脚本能按仓库真实相对路径解析 TypeScript（backend/node_modules 下没有 tsc）
  const tmp = path.join(sandbox, 'rdpms-system', 'backend');
  const fakeFrontend = path.join(sandbox, 'rdpms-system', 'frontend');
  const realFrontendModules = path.join(BACKEND_ROOT, '../frontend/node_modules');
  try {
    fs.mkdirSync(tmp, { recursive: true });
    fs.mkdirSync(fakeFrontend, { recursive: true });
    for (const dir of ['src', 'prisma', 'scripts']) {
      fs.cpSync(path.join(BACKEND_ROOT, dir), path.join(tmp, dir), { recursive: true });
    }
    // 复制依赖类型解析所需的 package.json（不复制 node_modules）
    fs.copyFileSync(path.join(BACKEND_ROOT, 'package.json'), path.join(tmp, 'package.json'));
    fs.symlinkSync(
      path.join(BACKEND_ROOT, 'node_modules'),
      path.join(tmp, 'node_modules'),
      'dir',
    );
    fs.symlinkSync(realFrontendModules, path.join(fakeFrontend, 'node_modules'), 'dir');

    const target = path.join(tmp, 'src/routes/reports.js');
    const source = fs.readFileSync(target, 'utf8');
    // 删除整个 projectAccess 导入语句（不假设单行还是多行写法）
    const withoutImport = source.replace(
      /import\s*\{[^}]*\}\s*from\s*'\.\.\/kernel\/projectAccess\.js';\s*\n/s,
      '',
    );
    assert.notEqual(withoutImport, source, '用例构造失败：未能删除 projectAccess 导入语句');

    // 先确认该副本本身在「保留导入」时是干净的
    const clean = runChecker(tmp);
    assert.equal(clean.code, 0, `构造的干净副本不应报错：\n${clean.stdout}`);

    // 再故意删掉导入：检查必须失败并指出具体文件与标识符
    fs.writeFileSync(target, withoutImport);
    const broken = runChecker(tmp);
    assert.notEqual(broken.code, 0, '删除导入后检查脚本必须失败');
    assert.match(broken.stdout, /assertProjectCapability/);
    assert.match(broken.stdout, /reports\.js/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
