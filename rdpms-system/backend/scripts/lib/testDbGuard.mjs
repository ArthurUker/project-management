/**
 * scripts/lib/testDbGuard.mjs —— 隔离测试库守卫（RF02 起）
 *
 * 硬性约束：测试只允许打在专用、可销毁的隔离库上；
 * 禁止对生产库（rdpms）、既有 rdpms_drill 或任何非测试命名的库执行写入、清库、迁移。
 *
 * 该模块被 scripts/test-db.mjs（库生命周期）与 scripts/run-integration.mjs（测试运行）共用，
 * 保证「校验」与「执行」使用同一份判定，不会出现一处放行另一处拦截。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKEND_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const REPO_ROOT = path.resolve(BACKEND_ROOT, '../..');
export const ENV_FILE = process.env.RDPMS_TEST_ENV_FILE || path.join(REPO_ROOT, '.env.test.local');
export const PRISMA_CLI = path.join(BACKEND_ROOT, 'node_modules/prisma/build/index.js');

/** 只接受专用测试库命名（允许 rdpms_test_<suffix> 供并行/临时使用） */
export const TEST_DB_PATTERN = /^rdpms_test(_[a-z0-9_]+)?$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
/** 明确禁止触碰的库 */
const FORBIDDEN_DBS = new Set(['rdpms', 'rdpms_drill', 'postgres', 'template0', 'template1']);

export function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * 合并测试环境文件与进程环境变量（文件优先，保证脚本与测试看到同一目标）。
 * 保留全部键（含 SEED_* 等），只强制 NODE_ENV=test 与提供测试专用 JWT 兜底。
 */
export function resolveEnv() {
  const merged = { ...process.env, ...loadEnvFile(ENV_FILE) };
  return {
    ...merged,
    NODE_ENV: 'test',
    JWT_SECRET: merged.JWT_SECRET || 'test-only-secret-not-for-production-use-000000',
  };
}

function parseTarget(url, label, problems) {
  if (!url) {
    problems.push(`缺少 ${label}`);
    return null;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    problems.push(`${label} 不是合法 URL`);
    return null;
  }
  const dbName = (parsed.pathname || '').replace(/^\//, '');
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    problems.push(`${label} 指向非本机主机 ${parsed.hostname}（测试库必须在本机）`);
  }
  if (FORBIDDEN_DBS.has(dbName)) {
    problems.push(`${label} 指向禁止使用的库 ${dbName}`);
  }
  if (!TEST_DB_PATTERN.test(dbName)) {
    problems.push(`${label} 库名 "${dbName}" 不匹配专用测试库命名 ${TEST_DB_PATTERN}（本工具拒绝操作）`);
  }
  return { dbName, hostname: parsed.hostname, port: parsed.port || '5432', username: parsed.username };
}

/**
 * 校验测试环境。
 * @returns {{env: object, problems: string[], dbTarget: object|null, directTarget: object|null}}
 */
export function checkEnvironment() {
  const env = resolveEnv();
  const problems = [];
  const dbTarget = parseTarget(env.DATABASE_URL, 'DATABASE_URL', problems);
  const directTarget = parseTarget(env.DIRECT_URL, 'DIRECT_URL', problems);

  if (dbTarget && directTarget
    && (dbTarget.dbName !== directTarget.dbName || dbTarget.hostname !== directTarget.hostname)) {
    problems.push('DATABASE_URL 与 DIRECT_URL 未指向同一个测试库');
  }
  if (!fs.existsSync(ENV_FILE) && !process.env.DATABASE_URL) {
    problems.push(`缺少测试环境文件 ${ENV_FILE}（或未提供进程环境变量）`);
  }
  if (!fs.existsSync(PRISMA_CLI)) {
    problems.push(`找不到 Prisma CLI：${PRISMA_CLI}（需先在 backend 安装依赖）`);
  }
  return { env, problems, dbTarget, directTarget };
}

/** 打印 ENV_BLOCKED 并退出（退出码 2：阻止合并，不算 PASS） */
export function blocked(problems, action) {
  console.error(`[test-db] ENV_BLOCKED：无法${action}，缺少以下条件：`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('[test-db] 未运行任何数据库操作。RF 任务不得因此标记为完成。');
  process.exit(2);
}

export function describeEnv({ env, dbTarget, directTarget }) {
  console.log(`[test-db] 环境文件: ${ENV_FILE}${fs.existsSync(ENV_FILE) ? '' : '（不存在）'}`);
  if (dbTarget) console.log(`[test-db] DATABASE_URL → ${dbTarget.username}@${dbTarget.hostname}:${dbTarget.port}/${dbTarget.dbName}`);
  if (directTarget) console.log(`[test-db] DIRECT_URL   → ${directTarget.username}@${directTarget.hostname}:${directTarget.port}/${directTarget.dbName}`);
}
