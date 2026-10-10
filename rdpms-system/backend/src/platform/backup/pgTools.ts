/**
 * platform/backup/pgTools.ts —— pg_dump / pg_restore 的进程封装与 TOC 解析。
 *
 * 要点：
 *   - 连接串必须**剥掉 URI 查询参数**：DATABASE_URL 带 `?schema=public&connection_limit=10`，
 *     这些是 Prisma 的私有参数，libpq 会直接报 "invalid URI query parameter"；
 *   - 运维如需 sslmode / connect_timeout 等 libpq 参数，用 BACKUP_PG_DUMP_DSN 单独给；
 *   - pg_restore -l 支持从 stdin 读归档 —— 校验路径因此可以做到**明文不落盘**。
 */
import { spawn } from 'node:child_process';
import { BackupError } from './errors.js';

export const PG_DUMP_BIN_ENV = 'PG_DUMP_BIN';
export const PG_RESTORE_BIN_ENV = 'PG_RESTORE_BIN';
export const PG_DSN_ENV = 'BACKUP_PG_DUMP_DSN';

export interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface CommandOptions {
  stdin?: Buffer;
  timeoutMs?: number;
  maxStdoutBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_STDOUT_BYTES = 64 * 1024 * 1024;
const MAX_STDERR_CHARS = 8000;

export function resolvePgBin(kind: 'dump' | 'restore', env: NodeJS.ProcessEnv = process.env): string {
  const bin = kind === 'dump' ? env[PG_DUMP_BIN_ENV] : env[PG_RESTORE_BIN_ENV];
  if (bin && bin.trim()) return bin.trim();
  return kind === 'dump' ? 'pg_dump' : 'pg_restore';
}

/** 去掉查询参数后的连接串（Prisma 私有参数不是 libpq 参数）。 */
export function pgConnectionString(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env[PG_DSN_ENV] ?? env.DATABASE_URL ?? '').trim();
  if (!raw) {
    throw new BackupError('BACKUP_ARCHIVE_DIR_INVALID', '缺少 BACKUP_PG_DUMP_DSN / DATABASE_URL，无法连接数据库');
  }
  const cut = raw.indexOf('?');
  return cut === -1 ? raw : raw.slice(0, cut);
}

export function runCommand(bin: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdoutBytes = options.maxStdoutBytes ?? MAX_STDOUT_BYTES;
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new BackupError(
          'BACKUP_PG_DUMP_FAILED',
          `无法启动 ${bin}：${err.message}（请确认已安装并配置 ${bin === 'pg_dump' ? PG_DUMP_BIN_ENV : PG_RESTORE_BIN_ENV}）`,
        ),
      );
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxStdoutBytes) stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    // pg_restore -l 只需要读归档的 TOC，可能在消费完 stdin 之前就退出并关闭管道；
    // 此时写入会得到 EPIPE。这是正常时序而非失败 —— 判定依据是退出码与 stderr，
    // 没有这个处理器时未捕获的 'error' 事件会让整个进程崩掉（生产实测踩到）。
    child.stdin.on('error', () => {
      /* 忽略 stdin 写失败：交由 close 事件按退出码判定 */
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal: signal ?? null,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8').slice(0, MAX_STDERR_CHARS),
        timedOut,
      });
    });
    if (options.stdin) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

export interface TocSummary {
  tables: string[];
  dataEntries: number;
  entries: number;
}

/**
 * 解析 `pg_restore -l` 输出。
 * 行格式：`<dumpId>; <tableoid> <oid> <desc...> <namespace> <tag> <owner>`
 * desc 可能含空格（TABLE / TABLE DATA / MATERIALIZED VIEW DATA / FK CONSTRAINT…），
 * 因此从右往左取 owner / tag / namespace，中间整体作为 desc。
 */
export function parseTocListing(text: string): TocSummary {
  const tables = new Set<string>();
  let dataEntries = 0;
  let entries = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const semicolon = line.indexOf(';');
    if (semicolon <= 0) continue;
    const fields = line.slice(semicolon + 1).trim().split(/\s+/);
    if (fields.length < 5) continue;
    entries += 1;
    const owner = fields[fields.length - 1];
    const tag = fields[fields.length - 2];
    const namespace = fields[fields.length - 3];
    const desc = fields.slice(2, fields.length - 3).join(' ');
    const qualified = namespace && namespace !== '-' ? `${namespace}.${tag}` : tag;
    if (desc === 'TABLE') tables.add(qualified);
    else if (desc === 'TABLE DATA') dataEntries += 1;
    void owner;
  }
  return { tables: [...tables].sort(), dataEntries, entries };
}

/** 用 pg_restore -l 从内存缓冲读归档（stdin），返回 TOC 摘要。 */
export async function readTocFromBuffer(dump: Buffer, env: NodeJS.ProcessEnv = process.env): Promise<TocSummary> {
  const bin = resolvePgBin('restore', env);
  const result = await runCommand(bin, ['-l'], { stdin: dump, timeoutMs: 5 * 60 * 1000 });
  if (result.timedOut) {
    throw new BackupError('BACKUP_PG_RESTORE_FAILED', `${bin} -l 超时（归档可能损坏）`);
  }
  if (result.code !== 0) {
    throw new BackupError('BACKUP_PG_RESTORE_FAILED', `${bin} -l 失败：${result.stderr.trim() || `退出码 ${result.code}`}`);
  }
  const toc = parseTocListing(result.stdout);
  if (toc.tables.length === 0) {
    throw new BackupError('BACKUP_PG_RESTORE_FAILED', `${bin} -l 未解析出任何 TABLE 条目（归档格式可能不是 custom）`);
  }
  return toc;
}

export async function readTocFromFile(file: string, env: NodeJS.ProcessEnv = process.env): Promise<TocSummary> {
  const bin = resolvePgBin('restore', env);
  const result = await runCommand(bin, ['-l', file], { timeoutMs: 5 * 60 * 1000 });
  if (result.timedOut) {
    throw new BackupError('BACKUP_PG_RESTORE_FAILED', `${bin} -l 超时（归档可能损坏）`);
  }
  if (result.code !== 0) {
    throw new BackupError('BACKUP_PG_RESTORE_FAILED', `${bin} -l 失败：${result.stderr.trim() || `退出码 ${result.code}`}`);
  }
  const toc = parseTocListing(result.stdout);
  if (toc.tables.length === 0) {
    throw new BackupError('BACKUP_PG_RESTORE_FAILED', `${bin} -l 未解析出任何 TABLE 条目（归档格式可能不是 custom）`);
  }
  return toc;
}
