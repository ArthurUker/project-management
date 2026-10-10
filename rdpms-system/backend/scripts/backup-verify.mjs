#!/usr/bin/env node
/**
 * scripts/backup-verify.mjs —— 归档产物的离线校验（不连库、不需要应用在跑）。
 *
 * 用法：
 *   node scripts/backup-verify.mjs <产物目录 | *.dump.aes> [--meta <meta.json>]
 *                                  [--env-file /srv/rdpms/.env] [--decrypt-to <file>] [--json]
 *
 * 校验项见 src/platform/backup/verify.ts（meta 形状 / 目录绑定 / 解密 / sha256 / 表清单对账）。
 * --decrypt-to 只在确认需要人工 pg_restore 时使用：输出 0600 明文 .dump，用完请自行删除。
 *
 * 退出码：0 校验通过；1 校验不通过；2 参数/配置问题。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(BACKEND_ROOT, 'dist');

function parseArgs(argv) {
  const args = { target: null, meta: null, envFile: null, decryptTo: null, json: false };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--meta') args.meta = argv[++i];
    else if (arg.startsWith('--meta=')) args.meta = arg.slice('--meta='.length);
    else if (arg === '--env-file') args.envFile = argv[++i];
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length);
    else if (arg === '--decrypt-to') args.decryptTo = argv[++i];
    else if (arg.startsWith('--decrypt-to=')) args.decryptTo = arg.slice('--decrypt-to='.length);
    else if (arg === '--json') args.json = true;
    else if (arg === '-h' || arg === '--help') {
      console.log('用法: node scripts/backup-verify.mjs <产物目录|*.dump.aes> [--meta <meta.json>] [--env-file <path>] [--decrypt-to <file>] [--json]');
      process.exit(0);
    } else if (arg.startsWith('--')) {
      console.error(`[verify] 未知参数：${arg}`);
      process.exit(2);
    } else positional.push(arg);
  }
  args.target = positional[0] ?? null;
  if (!args.target) {
    console.error('[verify] 必须给出产物目录或 .dump.aes 文件');
    process.exit(2);
  }
  return args;
}

function resolveTargets(args) {
  const target = path.resolve(args.target);
  if (!fs.existsSync(target)) {
    console.error(`[verify] 路径不存在：${target}`);
    process.exit(2);
  }
  if (fs.statSync(target).isDirectory()) {
    const files = fs.readdirSync(target);
    const aes = files.find((name) => name.endsWith('.dump.aes'));
    const meta = files.find((name) => name.endsWith('.meta.json'));
    if (!aes) {
      console.error(`[verify] 目录里没有 *.dump.aes：${target}`);
      process.exit(2);
    }
    return { aesPath: path.join(target, aes), metaPath: args.meta ? path.resolve(args.meta) : path.join(target, meta ?? '') };
  }
  const metaPath = args.meta ? path.resolve(args.meta) : `${target.replace(/\.dump\.aes$/, '')}.meta.json`;
  return { aesPath: target, metaPath };
}

const args = parseArgs(process.argv.slice(2));

if (!fs.existsSync(path.join(DIST, 'platform/backup/verify.js'))) {
  console.error('[verify] 未找到 dist/platform/backup/verify.js —— 请先在 backend/ 执行 npm run build');
  process.exit(2);
}

const { readEnvironmentFile } = await import('../dist/platform/config/configSchema.js');
const { isBackupError } = await import('../dist/platform/backup/errors.js');
const { verifyArchive } = await import('../dist/platform/backup/verify.js');
const { decryptBuffer, readMasterKey } = await import('../dist/platform/backup/kms.js');
const { validateArtifactMeta } = await import('../dist/platform/backup/artifactMeta.js');

if (args.envFile) {
  if (!fs.existsSync(args.envFile)) {
    console.error(`[verify] 环境文件不存在：${args.envFile}`);
    process.exit(2);
  }
  const fileEnv = readEnvironmentFile(args.envFile);
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const { aesPath, metaPath } = resolveTargets(args);
if (!metaPath || !fs.existsSync(metaPath)) {
  console.error(`[verify] 找不到 meta.json：${metaPath || '(未推导出)'}`);
  process.exit(2);
}

try {
  const result = await verifyArchive({ aesPath, metaPath, env: process.env });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[verify] ${result.ok ? '通过' : '未通过'} —— ${aesPath}`);
    for (const check of result.checks) {
      console.log(`  ${check.ok ? 'OK  ' : 'FAIL'} ${check.name}：${check.detail}`);
    }
  }

  if (result.ok && args.decryptTo) {
    const master = readMasterKey(process.env);
    if (!master) {
      console.error('[verify] 未配置 BACKUP_MASTER_KEY，无法解密导出');
      process.exitCode = 2;
    } else {
      const meta = validateArtifactMeta(JSON.parse(fs.readFileSync(metaPath, 'utf8')));
      const cipher = fs.readFileSync(aesPath);
      const plain = decryptBuffer(cipher, meta, master);
      const out = path.resolve(args.decryptTo);
      fs.writeFileSync(out, plain, { mode: 0o600 });
      console.log(`[verify] 已解密导出 ${plain.length} 字节 → ${out}（0600，恢复完成后请删除）`);
    }
  }

  process.exitCode = result.ok ? 0 : 1;
} catch (err) {
  const code = isBackupError(err) ? err.code : 'INTERNAL_ERROR';
  const message = err instanceof Error ? err.message : String(err);
  if (args.json) console.log(JSON.stringify({ ok: false, code, error: message }, null, 2));
  else console.error(`[verify] 失败 ${code}：${message}`);
  process.exitCode = code === 'BACKUP_KMS_NOT_CONFIGURED' ? 2 : 1;
}
