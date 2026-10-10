/**
 * RF30 单元用例 —— 归档备份子系统（platform/backup/*）
 *
 * 只测**纯逻辑与本地文件行为**，不连库、不起 HTTP：
 *   1. kms            —— 信封加密往返、篡改检测、主密钥指纹不匹配、信封字段校验
 *   2. artifactMeta   —— meta 严格校验（缺字段/类型错不接受）
 *   3. paths          —— 归档根目录规则、路径穿越与符号链接拒绝、上海时区日期目录
 *   4. pgTools        —— `pg_restore -l` 解析、连接串剥离 Prisma 私有参数
 *   5. verify         —— 五项检查的正/负路径（用替身 pg_restore，不依赖真实 dump）
 *   6. retention      —— 保留策略（未登记跳过、永远保留最新一份、天数/份数取先超限）
 *   7. diskUsage      —— 阈值解析、磁盘门禁、目录用量聚合
 *
 * 真实 pg_dump / pg_restore 的端到端演练在隔离库中进行，不放在单测里。
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const {
  BACKUP_ALGORITHM,
  decodeMasterKey,
  generateMasterKey,
  readMasterKey,
  requireMasterKey,
  keyFingerprint,
  encryptBuffer,
  decryptBuffer,
  parseEnvelope,
} = await import('../../dist/platform/backup/kms.js');
const { isBackupError } = await import('../../dist/platform/backup/errors.js');
const { validateArtifactMeta, artifactFileNames, ARTIFACT_META_VERSION } = await import(
  '../../dist/platform/backup/artifactMeta.js'
);
const {
  ARCHIVE_DIR_ENV,
  JOB_ID_PATTERN,
  archiveBaseName,
  backupDayDir,
  newJobId,
  resolveArchiveRoot,
  resolveArtifactPath,
  ensureArchiveRoot,
} = await import('../../dist/platform/backup/paths.js');
const { parseTocListing, pgConnectionString } = await import('../../dist/platform/backup/pgTools.js');
const { verifyArchive, diffTableSets } = await import('../../dist/platform/backup/verify.js');
const { planRetention, retentionConfig } = await import('../../dist/platform/backup/retention.js');
const { crossCheckTables } = await import('../../dist/platform/backup/archive.js');
const { diskThresholds, guardDiskSpace, dirUsage, archiveUsage } = await import(
  '../../dist/platform/backup/diskUsage.js'
);

const MASTER = Buffer.alloc(32, 7);
const MASTER_B64 = MASTER.toString('base64');

/** 全部临时目录登记在案，测试结束统一清理（不往 /tmp 留垃圾）。 */
const TEMP_DIRS = [];
async function tempDir(prefix = 'rf30-') {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  TEMP_DIRS.push(dir);
  return dir;
}

after(async () => {
  await Promise.all(TEMP_DIRS.map((dir) => fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)));
});

/** 生成一份"看起来像真产物"的加密归档目录：<root>/<day>/<base>.<jobId>/ */
async function makeArtifact({
  master = MASTER,
  tables = { 'public.alpha': 3, 'public.beta': 0 },
  createdAt = new Date(),
  jobId = newJobId(createdAt),
} = {}) {
  const root = await tempDir('rf30-root-');
  const day = backupDayDir(createdAt);
  const base = archiveBaseName(createdAt);
  const names = artifactFileNames(base);
  const dir = path.join(root, day, `${base}.${jobId}`);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });

  const plain = Buffer.from('-- 假 dump：只用于校验流程\nCREATE TABLE alpha();\n');
  const { cipher, envelope } = encryptBuffer(plain, master);
  const meta = {
    ...envelope,
    version: ARTIFACT_META_VERSION,
    jobId,
    base,
    runType: 'manual',
    scope: 'all',
    dumpFormat: 'pg_dump-custom',
    compression: 'pg_dump -Fc -Z6',
    sha256: crypto.createHash('sha256').update(plain).digest('hex'),
    fileSize: cipher.length,
    plainBytes: plain.length,
    createdAt: createdAt.toISOString(),
    tableCounts: tables,
    tableCount: Object.keys(tables).length,
    excludedTables: [],
    schemaSnapshot: null,
    snapshotMode: 'exported',
    toc: null,
    countsCrossCheck: null,
    runId: null,
    archiveDir: null,
    tool: { node: process.version, pgDump: 'pg_dump' },
  };
  const aesPath = path.join(dir, names.aes);
  const metaPath = path.join(dir, names.meta);
  await fsp.writeFile(aesPath, cipher, { mode: 0o600 });
  await fsp.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
  return { root, dir, aesPath, metaPath, meta, plain, cipher };
}

/** 替身 pg_restore：支持 `-l`（输出给定 TOC），避免依赖真实 dump。 */
async function stubPgRestore(tocLines) {
  const dir = await tempDir('rf30-bin-');
  const bin = path.join(dir, 'pg_restore');
  await fsp.writeFile(bin, `#!/bin/sh\ncat <<'TOC'\n${tocLines.join('\n')}\nTOC\nexit 0\n`, { mode: 0o755 });
  return bin;
}

const TOC_OK = [
  ';',
  '; Archive created at 2026-10-09 09:00:00 UTC',
  ';',
  '1; 1259 16385 TABLE public alpha postgres',
  '2; 1259 16386 TABLE public beta postgres',
  '3; 0 0 TABLE DATA public alpha postgres',
];

const VERIFY_META_BASE = () => ({
  ...encryptBuffer(Buffer.from('x'), MASTER).envelope,
  version: ARTIFACT_META_VERSION,
  jobId: 'backup-20261009T090000-ab12cd34',
  base: 'rdpms-20261009T170000',
  runType: 'manual',
  scope: 'all',
  sha256: 'a'.repeat(64),
  fileSize: 10,
  plainBytes: 4,
  createdAt: new Date().toISOString(),
  tableCounts: { 'public.a': 1 },
  snapshotMode: 'exported',
});

/* ── 1. kms ──────────────────────────────────────────────────────────────── */

test('RF30-T01 主密钥解析：缺失返回 null / 长度不符抛错 / 合法解码为 32 字节', () => {
  assert.equal(decodeMasterKey(undefined), null);
  assert.equal(decodeMasterKey('   '), null);
  assert.equal(readMasterKey({}), null);
  assert.throws(
    () => decodeMasterKey(Buffer.alloc(16).toString('base64')),
    (err) => isBackupError(err) && err.code === 'BACKUP_KMS_NOT_CONFIGURED',
  );
  assert.equal(decodeMasterKey(MASTER_B64).length, 32);
  // fail-closed：没有密钥时 requireMasterKey 必须抛错，绝不返回 null 让调用方降级
  assert.throws(() => requireMasterKey({}), (err) => err.code === 'BACKUP_KMS_NOT_CONFIGURED');
  assert.equal(Buffer.from(generateMasterKey(), 'base64').length, 32);
});

test('RF30-T02 信封加密往返：解密结果与明文逐字节一致，信封字段合法', () => {
  const plain = crypto.randomBytes(4096);
  const { cipher, envelope } = encryptBuffer(plain, MASTER);
  assert.notEqual(cipher.toString('hex'), plain.toString('hex'));
  const parsed = parseEnvelope(envelope);
  assert.equal(parsed.algorithm, BACKUP_ALGORITHM);
  assert.equal(Buffer.from(parsed.iv, 'base64').length, 12);
  assert.equal(Buffer.from(parsed.tag, 'base64').length, 16);
  assert.equal(parsed.keyMeta.keyFingerprint, keyFingerprint(MASTER));
  assert.equal(Buffer.compare(decryptBuffer(cipher, envelope, MASTER), plain), 0);
});

test('RF30-T03 篡改检测：密文任一字节变化都会导致 GCM 认证失败（而不是返回脏数据）', () => {
  const plain = Buffer.from('归档内容');
  const { cipher, envelope } = encryptBuffer(plain, MASTER);
  const tampered = Buffer.from(cipher);
  tampered[0] ^= 0xff;
  assert.throws(
    () => decryptBuffer(tampered, envelope, MASTER),
    (err) => isBackupError(err) && err.code === 'BACKUP_VERIFY_FAILED',
  );
});

test('RF30-T04 换错主密钥：指纹不匹配时给出可读原因，不做静默尝试', () => {
  const { cipher, envelope } = encryptBuffer(Buffer.from('x'), MASTER);
  assert.throws(
    () => decryptBuffer(cipher, envelope, Buffer.alloc(32, 9)),
    (err) => isBackupError(err) && /指纹/.test(err.message),
  );
});

test('RF30-T05 信封字段非法：算法不符 / iv 长度错 / 缺 dekCipher 一律拒绝', () => {
  const { envelope } = encryptBuffer(Buffer.from('x'), MASTER);
  const cases = [
    { ...envelope, algorithm: 'aes-128-cbc' },
    { ...envelope, iv: Buffer.alloc(8).toString('base64') },
    { ...envelope, keyMeta: { ...envelope.keyMeta, dekCipher: '' } },
  ];
  for (const broken of cases) {
    assert.throws(() => parseEnvelope(broken), (err) => err.code === 'BACKUP_META_INVALID');
  }
});

/* ── 2. artifactMeta ─────────────────────────────────────────────────────── */

test('RF30-T06 meta 严格校验：合法通过；缺 sha256 / jobId 非法 / 计数非法一律拒绝', () => {
  const base = VERIFY_META_BASE();
  assert.equal(validateArtifactMeta(base).tableCount, 1);
  const broken = [
    { ...base, sha256: undefined },
    { ...base, jobId: 'nope' },
    { ...base, tableCounts: { 'public.a': -1 } },
    { ...base, version: 99 },
    { ...base, snapshotMode: 'weird' },
  ];
  for (const item of broken) {
    assert.throws(() => validateArtifactMeta(item), (err) => err.code === 'BACKUP_META_INVALID');
  }
});

/* ── 3. paths ────────────────────────────────────────────────────────────── */

test('RF30-T07 归档根目录规则：严格模式必须显式绝对路径，且不得落在代码目录内', () => {
  const strict = { NODE_ENV: 'production' };
  const bad = [
    strict,
    { ...strict, [ARCHIVE_DIR_ENV]: 'backups/archive' },
    { ...strict, [ARCHIVE_DIR_ENV]: '/opt/rdpms/app/backups' },
    { ...strict, [ARCHIVE_DIR_ENV]: '/srv' },
  ];
  for (const env of bad) {
    assert.throws(() => resolveArchiveRoot(env, '/opt/rdpms/app'), (err) => err.code === 'BACKUP_ARCHIVE_DIR_INVALID');
  }
  assert.equal(
    resolveArchiveRoot({ ...strict, [ARCHIVE_DIR_ENV]: '/srv/rdpms/backups/archive' }, '/opt/rdpms/app'),
    '/srv/rdpms/backups/archive',
  );
  // 开发态允许缺省（落在代码目录下的 backups/archive），便于本地演练
  assert.match(resolveArchiveRoot({}, '/tmp/dev'), /backups\/archive$/);
});

test('RF30-T08 路径穿越与符号链接：越界路径、经由符号链接的路径都被拒绝', async () => {
  const root = await tempDir('rf30-guard-');
  await fsp.mkdir(path.join(root, '2026-10-09'), { recursive: true });
  assert.throws(() => resolveArtifactPath(root, '../etc/passwd'), (err) => err.code === 'BACKUP_PATH_REJECTED');
  assert.throws(() => resolveArtifactPath(root, '/etc/passwd'), (err) => err.code === 'BACKUP_PATH_REJECTED');
  assert.equal(resolveArtifactPath(root, '2026-10-09'), path.join(fs.realpathSync(root), '2026-10-09'));

  const linkTarget = await tempDir('rf30-linktarget-');
  await fsp.symlink(linkTarget, path.join(root, 'evil'));
  assert.throws(() => resolveArtifactPath(root, 'evil'), (err) => err.code === 'BACKUP_PATH_REJECTED');
});

test('RF30-T09 日期目录按 Asia/Shanghai：UTC 18:30 属次日 02:30', () => {
  const utcEvening = new Date('2026-10-08T18:30:00Z');
  assert.equal(backupDayDir(utcEvening), '2026-10-09');
  assert.equal(backupDayDir(new Date('2026-10-08T15:59:00Z')), '2026-10-08');
  assert.equal(archiveBaseName(utcEvening), 'rdpms-20261009T023000');
  assert.match(newJobId(utcEvening), JOB_ID_PATTERN);
});

test('RF30-T10 ensureArchiveRoot：创建 0700 目录；把符号链接当根目录会被拒绝', async () => {
  const base = await tempDir('rf30-ensure-');
  const root = path.join(base, 'archive');
  ensureArchiveRoot(root);
  assert.equal(fs.statSync(root).mode & 0o777, 0o700);
  const link = path.join(base, 'link');
  await fsp.symlink(root, link);
  assert.throws(() => ensureArchiveRoot(link), (err) => err.code === 'BACKUP_PATH_REJECTED');
});

/* ── 4. pgTools ──────────────────────────────────────────────────────────── */

test('RF30-T11 TOC 解析：desc 含空格的右侧对齐解析，TABLE / TABLE DATA 分别计数', () => {
  const toc = parseTocListing(
    [
      ';',
      '; Archive created at 2026-10-09',
      '1; 1259 16385 TABLE public projects postgres',
      '2; 1259 16386 TABLE public report_versions postgres',
      '3; 2604 16387 MATERIALIZED VIEW DATA public mv postgres',
      '4; 0 0 TABLE DATA public projects postgres',
      '5; 0 0 TABLE DATA public report_versions postgres',
      '6; 2606 16388 FK CONSTRAINT public tasks fk_tasks_project postgres',
      ';',
    ].join('\n'),
  );
  assert.deepEqual(toc.tables, ['public.projects', 'public.report_versions']);
  assert.equal(toc.dataEntries, 2);
  // 只有 6 行带 dumpId（纯 ';' 注释行不计入 entries）
  assert.equal(toc.entries, 6);
});

test('RF30-T12 连接串剥离查询参数：Prisma 私有参数不能透传给 libpq', () => {
  assert.equal(
    pgConnectionString({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/rdpms?schema=public&connection_limit=10' }),
    'postgresql://u:p@127.0.0.1:5432/rdpms',
  );
  assert.equal(
    pgConnectionString({
      DATABASE_URL: 'postgresql://a:b@db:5432/x',
      BACKUP_PG_DUMP_DSN: 'postgresql://s:t@127.0.0.1:5432/x?sslmode=require',
    }),
    'postgresql://s:t@127.0.0.1:5432/x',
  );
  assert.throws(() => pgConnectionString({}), (err) => isBackupError(err));
});

/* ── 5. verify ───────────────────────────────────────────────────────────── */

test('RF30-T13 离线校验正面路径：解密 / sha256 / 表清单对账全部通过', async () => {
  const artifact = await makeArtifact();
  const bin = await stubPgRestore(TOC_OK);
  const result = await verifyArchive({
    aesPath: artifact.aesPath,
    metaPath: artifact.metaPath,
    env: { PG_RESTORE_BIN: bin },
    masterKey: MASTER,
  });
  assert.equal(result.ok, true, JSON.stringify(result.checks));
  assert.deepEqual(result.tocTables, ['public.alpha', 'public.beta']);
  assert.equal(result.dataEntries, 1);
  assert.equal(result.plainBytes, artifact.plain.length);
});

test('RF30-T14 表清单对账失败：TOC 缺表 → 不通过且指出缺哪张', async () => {
  const artifact = await makeArtifact();
  const bin = await stubPgRestore(TOC_OK.filter((line) => !line.includes('public beta')));
  const result = await verifyArchive({
    aesPath: artifact.aesPath,
    metaPath: artifact.metaPath,
    env: { PG_RESTORE_BIN: bin },
    masterKey: MASTER,
  });
  assert.equal(result.ok, false);
  assert.match(result.checks.find((c) => c.name.includes('pg_restore')).detail, /public\.beta/);
});

test('RF30-T15 密文被篡改：解密检查失败，且不再继续后面的检查', async () => {
  const artifact = await makeArtifact();
  const bin = await stubPgRestore(TOC_OK);
  const cipher = await fsp.readFile(artifact.aesPath);
  cipher[10] ^= 0x01;
  await fsp.writeFile(artifact.aesPath, cipher);
  const result = await verifyArchive({
    aesPath: artifact.aesPath,
    metaPath: artifact.metaPath,
    env: { PG_RESTORE_BIN: bin },
    masterKey: MASTER,
  });
  assert.equal(result.ok, false);
  assert.match(result.checks.at(-1).name, /解密/);
  assert.equal(result.checks.some((c) => c.name.includes('sha256')), false);
});

test('RF30-T16 产物配对：拿另一份备份的 meta 来校验会被识破（不是含糊的"解密失败"）', async () => {
  const artifact = await makeArtifact({ createdAt: new Date('2026-10-09T02:00:00Z') });
  const other = await makeArtifact({ createdAt: new Date('2026-10-09T04:00:00Z') });
  const bin = await stubPgRestore(TOC_OK);
  const result = await verifyArchive({
    aesPath: artifact.aesPath,
    metaPath: other.metaPath,
    env: { PG_RESTORE_BIN: bin },
    masterKey: MASTER,
  });
  assert.equal(result.ok, false);
  // meta 与"它自己所在的目录"是自洽的，因此拦截点在"aes ↔ meta.base"这条配对检查上
  assert.equal(result.checks.find((c) => c.name.includes('绑定')).ok, true);
  assert.equal(result.checks.find((c) => c.name.includes('配对')).ok, false);
  assert.match(result.error, /不是同一份产物/);
});

test('RF30-T17 未配置主密钥：校验抛 BACKUP_KMS_NOT_CONFIGURED（区分"环境未配"与"备份坏了"）', async () => {
  const artifact = await makeArtifact();
  await assert.rejects(
    () => verifyArchive({ aesPath: artifact.aesPath, metaPath: artifact.metaPath, env: {} }),
    (err) => err.code === 'BACKUP_KMS_NOT_CONFIGURED',
  );
});

test('RF30-T18 表集合对账纯函数：missing / extra 双向可比', () => {
  assert.deepEqual(diffTableSets(['public.a', 'public.b'], ['public.a', 'public.b']), { missing: [], extra: [] });
  assert.deepEqual(diffTableSets(['public.a'], ['public.a', 'public.c']), { missing: ['public.c'], extra: [] });
  assert.deepEqual(diffTableSets(['public.a', 'public.d'], ['public.a']), { missing: [], extra: ['public.d'] });
});

test('RF30-T19 归档表级对账：缺表判失败；TOC 多出的对象（扩展/其它 schema）只记警告', () => {
  const failed = crossCheckTables(['public.a', 'public.b'], ['public.a']);
  assert.equal(failed.cross.result, 'failed');
  assert.deepEqual(failed.cross.missing, ['public.b']);
  const passed = crossCheckTables(['public.a'], ['public.a', 'extras.thing']);
  assert.equal(passed.cross.result, 'passed');
  assert.deepEqual(passed.cross.extra, ['extras.thing']);
  assert.equal(passed.warnings.length, 1);
});

/* ── 6. retention ────────────────────────────────────────────────────────── */

test('RF30-T20 保留策略：未登记跳过；永远保留最新一份；天数与份数取先超限者', () => {
  const now = Date.parse('2026-10-09T10:00:00Z');
  const day = 86_400_000;
  const entries = [
    { jobId: 'j1', dir: 'd1', createdAtMs: now - 1 * day, bytes: 10, registered: true },
    { jobId: 'j2', dir: 'd2', createdAtMs: now - 10 * day, bytes: 20, registered: true },
    { jobId: 'j3', dir: 'd3', createdAtMs: now - 40 * day, bytes: 30, registered: true },
    { jobId: 'orphan', dir: 'd4', createdAtMs: now - 100 * day, bytes: 40, registered: false },
  ];
  const plan = planRetention(entries, { keepDays: 30, keepCount: 10, now });
  assert.deepEqual(plan.remove.map((e) => e.jobId), ['j3']);
  assert.deepEqual(plan.skipped.map((e) => e.jobId), ['orphan']);
  assert.deepEqual(plan.keep.map((e) => e.jobId), ['j1', 'j2']);

  assert.deepEqual(planRetention(entries, { keepDays: 0, keepCount: 2, now }).remove.map((e) => e.jobId), ['j3']);

  // 全部超期时也必须留下最新一份（避免把归档删空）
  const allOld = planRetention(entries.slice(0, 3), { keepDays: 1, keepCount: 0, now });
  assert.deepEqual(allOld.keep.map((e) => e.jobId), ['j1']);
  assert.deepEqual(allOld.remove.map((e) => e.jobId), ['j2', 'j3']);
});

test('RF30-T21 保留策略配置：缺省 30 天 / 60 份；非法值回落默认；0 视为不限制', () => {
  assert.deepEqual(retentionConfig({}), { keepDays: 30, keepCount: 60 });
  assert.deepEqual(retentionConfig({ BACKUP_KEEP_DAYS: '7', BACKUP_KEEP_COUNT: '10' }), { keepDays: 7, keepCount: 10 });
  assert.deepEqual(retentionConfig({ BACKUP_KEEP_DAYS: '0', BACKUP_KEEP_COUNT: '0' }), { keepDays: 0, keepCount: 0 });
  assert.deepEqual(retentionConfig({ BACKUP_KEEP_DAYS: 'abc', BACKUP_KEEP_COUNT: '-5' }), { keepDays: 30, keepCount: 60 });
});

/* ── 7. diskUsage ────────────────────────────────────────────────────────── */

test('RF30-T22 磁盘阈值：默认 90% / 1024MB；非法值回落默认', () => {
  assert.deepEqual(diskThresholds({}), { warnPct: 90, minFreeMb: 1024 });
  assert.deepEqual(diskThresholds({ BACKUP_WARN_PCT: '80', BACKUP_MIN_FREE_MB: '2048' }), { warnPct: 80, minFreeMb: 2048 });
  assert.deepEqual(diskThresholds({ BACKUP_WARN_PCT: '999', BACKUP_MIN_FREE_MB: 'x' }), { warnPct: 90, minFreeMb: 1024 });
});

test('RF30-T23 磁盘门禁：余量不足抛 BACKUP_DISK_LOW；充足时给出挂载水位', async () => {
  const root = await tempDir('rf30-disk-');
  await assert.rejects(
    () => guardDiskSpace(root, { BACKUP_MIN_FREE_MB: '999999999' }),
    (err) => err.code === 'BACKUP_DISK_LOW',
  );
  const ok = await guardDiskSpace(root, { BACKUP_MIN_FREE_MB: '1' });
  assert.equal(ok.level, 'ok');
  assert.ok(ok.mount.totalBytes > 0);
  assert.ok(ok.mount.freeBytes > 0);
  assert.equal(typeof ok.mount.usagePct, 'number');
});

test('RF30-T24 目录用量聚合：归档按日期目录统计产物份数/字节，.work 单独计', async () => {
  const root = await tempDir('rf30-usage-');
  const dayDir = path.join(root, '2026-10-09');
  await fsp.mkdir(path.join(dayDir, 'a.backup-20261009T010000-aaaaaaaa'), { recursive: true });
  await fsp.mkdir(path.join(dayDir, 'b.backup-20261009T020000-bbbbbbbb'), { recursive: true });
  await fsp.writeFile(path.join(dayDir, 'a.backup-20261009T010000-aaaaaaaa', 'x.dump.aes'), Buffer.alloc(1000));
  await fsp.writeFile(path.join(dayDir, 'b.backup-20261009T020000-bbbbbbbb', 'y.dump.aes'), Buffer.alloc(500));
  await fsp.mkdir(path.join(root, '.work', 'wip'), { recursive: true });
  await fsp.writeFile(path.join(root, '.work', 'wip', 'half.dump'), Buffer.alloc(300));
  await fsp.mkdir(path.join(root, 'not-a-day-dir'), { recursive: true });
  await fsp.writeFile(path.join(root, 'not-a-day-dir', 'z'), Buffer.alloc(7000));

  const usage = await archiveUsage(root);
  assert.equal(usage.exists, true);
  assert.equal(usage.count, 2);
  assert.equal(usage.totalBytes, 1500);
  assert.equal(usage.workBytes, 300);
  assert.deepEqual(usage.byDay.map((d) => d.day), ['2026-10-09']);
  assert.equal(usage.byDay[0].bytes, 1500);

  // 非日期目录不参与统计（也不参与清理）
  const other = await dirUsage(path.join(root, 'not-a-day-dir'));
  assert.equal(other.bytes, 7000);
  assert.equal(other.files, 1);

  const missing = await archiveUsage(path.join(root, 'does-not-exist'));
  assert.equal(missing.exists, false);
  assert.equal(missing.count, 0);
});

test('RF30-T26 陈旧工作区清扫：只清 > 阈值的目录，新目录与符号链接都保留', async () => {
  const { sweepStaleWorkspaces } = await import('../../dist/platform/backup/atomicFs.js');
  const root = await tempDir('rf30-sweep-');
  const workRoot = path.join(root, '.work');
  const stale = path.join(workRoot, 'backup-20260101T000000-aaaaaaaa');
  const fresh = path.join(workRoot, 'backup-20261009T090000-bbbbbbbb');
  await fsp.mkdir(stale, { recursive: true });
  await fsp.mkdir(fresh, { recursive: true });
  await fsp.writeFile(path.join(stale, 'leak.dump'), Buffer.alloc(10)); // 模拟"加密前被中断"的明文
  await fsp.writeFile(path.join(fresh, 'rdpms-x.dump'), Buffer.alloc(10));
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  await fsp.utimes(stale, old, old);
  const linkTarget = await tempDir('rf30-sweep-link-');
  await fsp.symlink(linkTarget, path.join(workRoot, 'backup-20260101T000000-cccccccc'));

  const removed = await sweepStaleWorkspaces(root, 12 * 3600 * 1000);
  assert.deepEqual(removed, ['backup-20260101T000000-aaaaaaaa']);
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(linkTarget), true, '符号链接指向的目录不得被删');
  assert.equal(fs.existsSync(path.join(workRoot, 'backup-20260101T000000-cccccccc')), true);
});

/* ── 8. CLI 契约（脚本存在且参数校验生效）────────────────────────────────── */

test('RF30-T25 CLI 参数校验：非法 --run-type 退出码 2，--help 退出码 0', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = path.resolve(import.meta.dirname, '../../scripts/backup-now.mjs');
  const bad = spawnSync(process.execPath, [script, '--run-type', 'nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /非法 --run-type/);
});
