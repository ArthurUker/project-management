/**
 * W11 · 本地合成测试数据构造器（仅用于本地开发库）
 *
 * 目的：为 perm-matrix / smoke 中被 SKIP 的 2 行 files download 用例构造测试数据：
 *   1. CLEAN    —— 正常下载路径（期望 200）
 *   2. INFECTED —— 下载阻断路径（期望 403 + code=FILE_INFECTED）
 *
 * 约束：
 *   - 仅连本地库（host 必须为 127.0.0.1/localhost，库名不得含 staging/prod/production）；
 *   - 极小占位文本文件（<1KB），不引入二进制；
 *   - 幂等：按 originalName 定位，重复执行只更新状态不重复建行。
 *
 * 用法：node scripts/seed-test-files.mjs
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');

/** 环境守卫：只允许本地开发库 */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL 未设置');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL 解析失败');
  }
  const host = parsed.hostname;
  const db = (parsed.pathname || '').replace(/^\//, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`拒绝执行：数据库 host 非本机（${host}）`);
  }
  if (/staging|prod|production/i.test(db)) {
    throw new Error(`拒绝执行：库名疑似非本地环境（${db}）`);
  }
  console.log(`[guard] 本地库确认通过 host=${host} db=${db}`);
}

const FIXTURES = [
  {
    originalName: 'w11-fixture-clean.txt',
    scanStatus: 'CLEAN',
    body: 'W11 synthetic fixture: CLEAN file for download-path verification.\n',
  },
  {
    originalName: 'w11-fixture-infected.txt',
    scanStatus: 'INFECTED',
    body: 'W11 synthetic fixture: INFECTED file for download-block verification.\n',
  },
];

async function upsertFixture(fx, actorId) {
  const buf = Buffer.from(fx.body, 'utf8');
  const checksum = crypto.createHash('sha256').update(buf).digest('hex');

  const existing = await prisma.fileObject.findFirst({
    where: { originalName: fx.originalName, deletedAt: null },
  });

  const storageKey = existing?.storageKey
    ?? `${new Date().getFullYear()}/${crypto.randomUUID()}-${fx.originalName}`;
  const full = path.resolve(UPLOAD_ROOT, storageKey);
  if (!full.startsWith(UPLOAD_ROOT)) throw new Error('非法存储路径');
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buf);

  const data = {
    storageKey,
    provider: 'LOCAL',
    originalName: fx.originalName,
    mimeType: 'text/plain',
    sizeBytes: buf.length,
    checksum,
    scanStatus: fx.scanStatus,
    scannedAt: new Date(),
    uploadedById: actorId,
    deletedAt: null,
  };

  const row = existing
    ? await prisma.fileObject.update({ where: { id: existing.id }, data })
    : await prisma.fileObject.create({ data });

  return row;
}

async function main() {
  assertLocalDatabase();

  const actor = await prisma.user.findFirst({
    where: { username: 'superadmin' },
    select: { id: true },
  });
  if (!actor) throw new Error('未找到 superadmin，请先执行 prisma db seed');

  const rows = [];
  for (const fx of FIXTURES) {
    // eslint-disable-next-line no-await-in-loop
    rows.push(await upsertFixture(fx, actor.id));
  }

  console.log('\n── W11 合成文件已就绪 ──');
  for (const r of rows) {
    console.log(`  ${r.scanStatus.padEnd(9)} ${r.id}  ${r.originalName}`);
  }
  console.log(`\n导出到测试脚本：\n  export SMOKE_BUSINESS_FILE_ID=${rows.find((r) => r.scanStatus === 'CLEAN').id}`);
  console.log(`  export SMOKE_INFECTED_FILE_ID=${rows.find((r) => r.scanStatus === 'INFECTED').id}\n`);
}

main()
  .catch((e) => {
    console.error('❌ 构造失败：', e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
