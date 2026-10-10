#!/usr/bin/env node
/**
 * scripts/backup-now.mjs —— 归档备份 CLI（systemd timer / 运维手工执行）。
 *
 * 用法：
 *   node scripts/backup-now.mjs [--env-file /srv/rdpms/.env]
 *                               [--run-type manual|scheduled|predeploy]
 *                               [--skip-retention] [--json]
 *
 * 退出码：
 *   0 成功
 *   1 备份作业失败（pg_dump/加密/发布/对账任一环节）
 *   2 配置或参数问题（未配置 BACKUP_MASTER_KEY、归档目录非法、dist 未构建…）
 *
 * 为什么不走 HTTP：定时备份是运维动作，不应依赖某个管理员的 access token；
 * 应用内入口（POST /api/backup/archives/run）只是同一内核的手动触发方式。
 *
 * 要求：先 `npm run build`（本脚本导入 dist/ 下已编译的内核）。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(BACKEND_ROOT, 'dist');

function parseArgs(argv) {
  const args = { envFile: null, runType: 'scheduled', skipRetention: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env-file') args.envFile = argv[++i];
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length);
    else if (arg === '--run-type') args.runType = argv[++i];
    else if (arg.startsWith('--run-type=')) args.runType = arg.slice('--run-type='.length);
    else if (arg === '--skip-retention') args.skipRetention = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '-h' || arg === '--help') {
      console.log('用法: node scripts/backup-now.mjs [--env-file <path>] [--run-type manual|scheduled|predeploy] [--skip-retention] [--json]');
      process.exit(0);
    } else {
      console.error(`[backup] 未知参数：${arg}`);
      process.exit(2);
    }
  }
  if (!['manual', 'scheduled', 'predeploy'].includes(args.runType)) {
    console.error(`[backup] 非法 --run-type：${args.runType}（可选 manual|scheduled|predeploy）`);
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!fs.existsSync(path.join(DIST, 'platform/backup/archive.js'))) {
  console.error('[backup] 未找到 dist/platform/backup/archive.js —— 请先在 backend/ 执行 npm run build');
  process.exit(2);
}

const { readEnvironmentFile } = await import('../dist/platform/config/configSchema.js');
const { isBackupError } = await import('../dist/platform/backup/errors.js');
const { runArchive } = await import('../dist/platform/backup/archive.js');
const { PrismaClient } = await import('@prisma/client');

if (args.envFile) {
  if (!fs.existsSync(args.envFile)) {
    console.error(`[backup] 环境文件不存在：${args.envFile}`);
    process.exit(2);
  }
  try {
    const fileEnv = readEnvironmentFile(args.envFile);
    for (const [key, value] of Object.entries(fileEnv)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (err) {
    console.error(`[backup] 环境文件解析失败：${err.message}`);
    process.exit(2);
  }
}

const log = args.json ? () => {} : (line) => console.log(`[backup] ${line}`);
const client = new PrismaClient();

try {
  const result = await runArchive({
    prisma: client,
    env: process.env,
    codeRoot: BACKEND_ROOT,
    runType: args.runType,
    skipRetention: args.skipRetention,
    log,
  });
  if (args.json) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } else {
    console.log(
      `[backup] 完成 jobId=${result.jobId} 目录=${result.dir} 密文=${result.fileSize} 字节 ` +
        `表=${result.tableCount} 快照=${result.snapshotMode} 耗时=${(result.durationMs / 1000).toFixed(1)}s`,
    );
    for (const warning of result.warnings) console.warn(`[backup] WARN ${warning}`);
    if (result.retention) {
      console.log(
        `[backup] 保留策略：删除 ${result.retention.removed.length} 份（${result.retention.removedBytes} 字节），` +
          `保留 ${result.retention.kept} 份，跳过 ${result.retention.skipped} 份未登记目录`,
      );
      for (const failure of result.retention.errors) console.warn(`[backup] WARN 清理失败 ${failure.dir}：${failure.message}`);
    }
  }
  process.exitCode = 0;
} catch (err) {
  const code = isBackupError(err) ? err.code : 'INTERNAL_ERROR';
  const message = err instanceof Error ? err.message : String(err);
  if (args.json) console.log(JSON.stringify({ ok: false, code, error: message }, null, 2));
  else console.error(`[backup] 失败 ${code}：${message}`);
  process.exitCode = code === 'BACKUP_KMS_NOT_CONFIGURED' || code === 'BACKUP_ARCHIVE_DIR_INVALID' ? 2 : 1;
} finally {
  await client.$disconnect();
}
