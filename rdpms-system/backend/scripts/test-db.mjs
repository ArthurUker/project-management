#!/usr/bin/env node
/**
 * scripts/test-db.mjs —— 专用隔离测试库的守卫与生命周期（RF02 起）
 *
 * 子命令：
 *   check    校验环境（默认；缺条件退出码 2 = ENV_BLOCKED）
 *   reset    销毁并重建测试库 → 迁移 → 授权 → 校验（可反复执行）
 *   migrate  仅迁移（不销毁）
 *   drop     销毁测试库
 *
 * 硬性约束见 scripts/lib/testDbGuard.mjs（禁止触碰生产库与 rdpms_drill）。
 * 建库通道：RDPMS_TEST_ADMIN_URL（CI 超级用户）或本机 `sudo -n -u postgres`。
 */
import { spawnSync } from 'node:child_process';
import {
  BACKEND_ROOT, PRISMA_CLI, checkEnvironment, blocked, describeEnv, resolveEnv,
} from './lib/testDbGuard.mjs';

function runNode(env, script, args = []) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, ...env, NODE_ENV: 'test' },
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    console.error(`[test-db] ${script} ${args.join(' ')} 失败（exit=${res.status}）`);
    process.exit(res.status ?? 1);
  }
}

function runPrisma(env, args) {
  runNode(env, PRISMA_CLI, args);
}

async function withClient(url, fn) {
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

/** 管理通道：优先 RDPMS_TEST_ADMIN_URL（CI），否则本机 sudo -n -u postgres */
async function adminExec(sql, { database = 'postgres' } = {}) {
  const env = resolveEnv();
  if (env.RDPMS_TEST_ADMIN_URL) {
    const adminUrl = env.RDPMS_TEST_ADMIN_URL;
    const parsed = new URL(adminUrl);
    parsed.pathname = `/${database}`;
    try {
      await withClient(parsed.toString(), (client) => client.$executeRawUnsafe(sql));
      return true;
    } catch (err) {
      return { error: `通过 RDPMS_TEST_ADMIN_URL 执行失败：${String(err.message).split('\n')[0]}` };
    }
  }
  const res = spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    return {
      error: '缺少建库通道：未提供 RDPMS_TEST_ADMIN_URL，且本机 sudo -n -u postgres 不可用'
        + `（${(res.stderr || '').trim().split('\n').pop() || 'unknown'}）`,
    };
  }
  return true;
}

async function databaseExists(target) {
  const env = resolveEnv();
  const url = env.RDPMS_TEST_ADMIN_URL || env.DIRECT_URL;
  try {
    return await withClient(url, async (client) => {
      const rows = await client.$queryRawUnsafe(
        `SELECT 1 FROM pg_database WHERE datname = '${target.dbName}'`,
      );
      return rows.length > 0;
    });
  } catch {
    return true; // 无法确认时按存在处理，交给管理通道判断
  }
}

async function grantToAppRole(env, target, directTarget) {
  const appRole = target.username;
  const migrateRole = directTarget.username;
  if (appRole === migrateRole) return { failures: [] };

  const statements = [
    `GRANT CONNECT ON DATABASE "${target.dbName}" TO "${appRole}"`,
    `GRANT USAGE ON SCHEMA public TO "${appRole}"`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${appRole}"`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${appRole}"`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${migrateRole}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${appRole}"`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE "${migrateRole}" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${appRole}"`,
  ];

  const failures = [];
  await withClient(env.DIRECT_URL, async (client) => {
    for (const sql of statements) {
      try {
        await client.$executeRawUnsafe(sql);
      } catch (err) {
        failures.push(`${sql.slice(0, 60)}… → ${String(err.message).split('\n')[0]}`);
      }
    }
  });
  return { failures };
}

async function verifyAppRole(env) {
  return withClient(env.DATABASE_URL, async (client) => {
    const rows = await client.$queryRawUnsafe(
      'SELECT current_user AS role, current_database() AS db,'
      + ' (SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema())::int AS tables',
    );
    return rows[0];
  });
}

const command = process.argv[2] || 'check';
const { env, problems, dbTarget, directTarget } = checkEnvironment();

if (problems.length > 0) blocked(problems, '使用隔离测试库');
describeEnv({ env, dbTarget, directTarget });

if (command === 'check') {
  try {
    const info = await verifyAppRole(env);
    console.log(`[test-db] OK：${info.role}@${info.db} 可读 ${info.tables} 张表`);
    process.exit(0);
  } catch (err) {
    console.error(`[test-db] ENV_BLOCKED：测试库已配置但运行角色不可用 —— ${String(err.message).split('\n')[0]}`);
    console.error('[test-db] 提示：先执行 npm run test:db:reset 重建并授权。');
    process.exit(2);
  }
}

if (command === 'drop') {
  if (await databaseExists(dbTarget)) {
    await adminExec(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbTarget.dbName}' AND pid <> pg_backend_pid()`,
    );
    const dropped = await adminExec(`DROP DATABASE IF EXISTS "${dbTarget.dbName}"`);
    if (dropped !== true) blocked([dropped.error, '销毁测试库需要管理通道'], '销毁测试库');
  }
  console.log(`[test-db] 已销毁 ${dbTarget.dbName}`);
  process.exit(0);
}

if (command === 'reset') {
  if (await databaseExists(dbTarget)) {
    await adminExec(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbTarget.dbName}' AND pid <> pg_backend_pid()`,
    );
    const dropped = await adminExec(`DROP DATABASE IF EXISTS "${dbTarget.dbName}"`);
    if (dropped !== true) blocked([dropped.error, '重建测试库需要 DROP/CREATE DATABASE 权限'], '重建测试库');
  }
  const created = await adminExec(`CREATE DATABASE "${dbTarget.dbName}" OWNER "${directTarget.username}"`);
  if (created !== true) blocked([created.error, `需要创建数据库 ${dbTarget.dbName}`], '创建测试库');

  runPrisma(env, ['migrate', 'deploy']);

  // 先授权再种子：种子以运行角色（DATABASE_URL）执行，需要表级权限
  const granted = await grantToAppRole(env, dbTarget, directTarget);
  if (granted.failures.length) {
    console.warn('[test-db] 部分授权语句未生效（通常是 public schema 归属限制）：');
    for (const f of granted.failures) console.warn(`  - ${f}`);
  }

  if (!env.SEED_ADMIN_PASSWORD) {
    blocked([
      '缺少 SEED_ADMIN_PASSWORD（种子脚本拒绝在无口令环境执行；顶层账号 admin 的口令必须外置）',
      `请在测试环境文件中提供测试专用强口令`,
    ], '构造最小测试数据');
  }
  runNode(env, 'prisma/seed.js');
  try {
    const info = await verifyAppRole(env);
    console.log(`[test-db] 重建完成：${info.role}@${info.db} 可读 ${info.tables} 张表`);
  } catch (err) {
    console.error(`[test-db] ENV_BLOCKED：迁移后运行角色仍不可读 —— ${String(err.message).split('\n')[0]}`);
    process.exit(2);
  }
  process.exit(0);
}

if (command === 'migrate') {
  runPrisma(env, ['migrate', 'deploy']);
  process.exit(0);
}

console.error(`[test-db] 未知子命令: ${command}（可用：check / reset / migrate / drop）`);
process.exit(1);
