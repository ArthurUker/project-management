/**
 * bootstrap/server.js —— 唯一的服务启动入口（RF01，05 §1）
 *
 * 允许发生：构造 Prisma 客户端、启动期安全守卫、监听端口。
 * 业务模块与测试不得导入本文件。
 */
import { loadConfig } from '../platform/config/configSchema.js';
import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { createApp } from './createApp.js';
import { createPrismaClient } from '../platform/db/client.js';

/**
 * 启动期安全守卫（W12 密钥审计裁定）
 * 生产环境：JWT_SECRET 缺失或命中已知泄露默认值（见 config/leaked-secrets.json，
 * 置于 src 之外以与 OPS 门禁区分"防御性引用"与"实际使用"）一律拒绝启动。
 * 开发环境：不设 JWT_SECRET 时由 jwt.sign 直接报错（fail-fast）。
 */
export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET;
  let leaked = [];
  try {
    leaked = JSON.parse(readFileSync(new URL('../../config/leaked-secrets.json', import.meta.url), 'utf8')).leaked ?? [];
  } catch { /* 清单缺失时仅跳过泄露值比对，未设置仍然拦截 */ }
  if (!secret || leaked.includes(secret)) {
    console.error('[FATAL] JWT_SECRET 未设置或使用了已知泄露的默认值，生产环境拒绝启动');
    process.exit(1);
  }
}

/**
 * 装配并启动 HTTP 服务。
 * @param {{ port?: number, hostname?: string }} [options]
 */
export function startServer(options = {}) {
  loadConfig(process.env);
  assertProductionSecrets();

  const port = options.port ?? Number.parseInt(process.env.PORT || '3000', 10);
  // 默认仅监听回环（OPS 门禁：3000 不得暴露非回环）；如需变更用 HOST 环境变量显式指定
  const hostname = options.hostname ?? process.env.HOST ?? '127.0.0.1';

  const app = createApp({ db: createPrismaClient() });

  console.log(`🚀 R&D PMS API starting on port ${port}...`);
  const server = serve({ fetch: app.fetch, port, hostname });
  console.log(`✅ Server is running at http://localhost:${port}`);
  return server;
}
