#!/usr/bin/env node
/**
 * scripts/check-undefined.mjs —— 后端「未定义标识符」静态检查（RF01）
 *
 * 背景（F02/F21）：reports.js 调用了未导入的 assertProjectCapability，
 * 普通构建无法发现，只有请求走到该行才会 500。本检查把这一类错误前移到提交前。
 *
 * 实现：用 TypeScript 编译器以 checkJs 模式解析 src 下所有 .js，
 * 只报告「找不到名字」类诊断（TS2304 / TS2552），其余类型噪声不参与判定，
 * 避免把整个 JS 代码库变成类型改造项目。
 *
 * 退出码：
 *   0 = 无未定义标识符
 *   1 = 存在未定义标识符
 *   2 = 找不到 TypeScript 编译器（环境未安装，属 ENV_BLOCKED 而非通过）
 *
 * 用法：node scripts/check-undefined.mjs [--root <backend 目录>] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const UNDEFINED_CODES = new Set([2304, 2552]);
/** TS 语法错误码区间（1000–1999）：语法错误同样必须让检查失败，否则「解析失败=无未定义标识符」会假通过 */
const isSyntaxErrorCode = (code) => code >= 1000 && code < 2000;

function parseArgs(argv) {
  const args = { root: process.cwd(), json: false, full: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') args.root = path.resolve(argv[++i]);
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--full') args.full = true;
  }
  return args;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

async function loadTypeScript(root) {
  const candidates = [
    path.join(root, 'node_modules/typescript/lib/typescript.js'),
    path.join(root, '../frontend/node_modules/typescript/lib/typescript.js'),
    path.join(root, '../../node_modules/typescript/lib/typescript.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const mod = await import(pathToFileURL(candidate).href);
      return mod.default ?? mod;
    }
  }
  return null;
}

/**
 * 完整类型检查报告（非门禁）：
 * 按 05 ADR-02，后端为「JS 逐模块迁移到 TS」目标；在迁移完成前，
 * 完整 checkJs 诊断数量不可能归零，因此单独提供报告模式，与阻断门禁明确区分。
 */
function printFullReport(ts, program, diagnostics, files) {
  const byCode = new Map();
  for (const d of diagnostics) {
    byCode.set(d.code, (byCode.get(d.code) ?? 0) + 1);
  }
  const sorted = [...byCode.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`[check-undefined] 完整类型检查报告（非门禁）：${files.length} 个文件，`
    + `${diagnostics.length} 条诊断，${sorted.length} 种错误码`);
  for (const [code, count] of sorted) {
    const sample = diagnostics.find((d) => d.code === code);
    const msg = sample ? ts.flattenDiagnosticMessageText(sample.messageText, ' ').slice(0, 80) : '';
    console.log(`  TS${code}: ${count} 条  例：${msg}`);
  }
  console.log('[check-undefined] 该报告不阻断构建；未定义标识符门禁见 npm run lint:undefined');
}

const { root, json, full } = parseArgs(process.argv.slice(2));
// 运行时源码 + 种子 + 运维脚本（同一「遗漏 import」缺陷族在种子/脚本中同样致命）
const SCAN_DIRS = ['src', 'prisma', 'scripts'].map((d) => path.join(root, d));

const existingDirs = SCAN_DIRS.filter((d) => fs.existsSync(d));
if (existingDirs.length === 0) {
  console.error(`[check-undefined] 找不到可扫描目录: ${SCAN_DIRS.join(', ')}`);
  process.exit(2);
}

const ts = await loadTypeScript(root);
if (!ts) {
  console.error('[check-undefined] ENV_BLOCKED: 未找到 TypeScript 编译器'
    + '（尝试 backend/node_modules、frontend/node_modules）。本检查未运行，不能视为通过。');
  process.exit(2);
}

const files = existingDirs.flatMap((d) => walk(d)).sort();
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowJs: true,
  checkJs: true,
  noEmit: true,
  strict: false,
  skipLibCheck: true,
  resolveJsonModule: true,
  // 仅加载 Node 全局类型（process/console/URL 等），避免把浏览器/测试全局混入判定
  types: ['node'],
};

const program = ts.createProgram(files, options);
const allDiagnostics = ts.getPreEmitDiagnostics(program);

if (full) {
  printFullReport(ts, program, allDiagnostics, files);
  process.exit(0);
}

const diagnostics = allDiagnostics
  .filter((d) => UNDEFINED_CODES.has(d.code) || isSyntaxErrorCode(d.code));

const results = diagnostics.map((d) => {
  const file = d.file ? path.relative(root, d.file.fileName) : '(unknown)';
  const { line, character } = d.file && d.start !== undefined
    ? d.file.getLineAndCharacterOfPosition(d.start)
    : { line: 0, character: 0 };
  return {
    file,
    line: line + 1,
    column: character + 1,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  };
});

if (json) {
  console.log(JSON.stringify({ scannedFiles: files.length, findings: results }, null, 2));
} else if (results.length === 0) {
  const scanned = existingDirs.map((d) => path.relative(process.cwd(), d) || '.').join(', ');
  console.log(`[check-undefined] no undefined identifiers in ${files.length} file(s) under ${scanned}`);
} else {
  console.error(`[check-undefined] 发现 ${results.length} 处未定义标识符或语法错误：`);
  for (const r of results) {
    console.error(`  ${r.file}(${r.line},${r.column}): TS${r.code}: ${r.message}`);
  }
}

process.exit(results.length === 0 ? 0 : 1);
