import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createIdempotencyMiddleware } from './middleware/idempotency.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import roleRoutes from './routes/roles.js';
import projectRoutes from './routes/projects.js';
import reportRoutes from './routes/reports.js';
import progressRoutes from './routes/progress.js';
import taskRoutes from './routes/tasks.js';
import statsRoutes from './routes/stats.js';
import docsRoutes from './routes/docs.js';
import projectTemplatesRoutes from './routes/projectTemplates.js';
import phasesRoutes from './routes/phases.js';
import reagentsRoutes from './routes/reagents.js';
import reagentLotsRoutes from './routes/reagent-lots.js';
import reagentMaterialsRoutes from './routes/reagentMaterials.js';
import taskTemplatesRoutes from './routes/taskTemplates.js';
import formulasRoutes from './routes/formulas.js';
import prepRoutes from './routes/prep-calculator.js';
import primersRoutes from './routes/primers.js';
import backupRoutes from './routes/backup.js';
import samplesRoutes from './routes/samples.js';
import registrationsRoutes from './routes/registrations.js';
import regulatoryDocumentsRoutes from './routes/regulatory-documents.js';
import auditRoutes from './routes/audit.js';
import systemLogsRoutes from './routes/system-logs.js';
import settingsRoutes from './routes/settings.js';
import dictRoutes from './routes/dict.js';
import filesRoutes from './routes/files.js';

// 初始化 Prisma
export const prisma = new PrismaClient();

// 创建 Hono 应用
const app = new Hono();

// CORS
app.use('*', cors({
  origin: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  credentials: true,
}));

// 幂等键中间件（PUT 请求去重，防止低性能服务器重传导致重复写入）
app.use('/api/*', createIdempotencyMiddleware());

// 根路由
app.get('/', (c) => c.json({
  name: 'R&D PMS API',
  version: '2.0.0',
  status: 'running',
}));

// 健康检查（liveness）
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// 就绪检查（readiness，公开，M-1 P0 契约）：DB 可达即 ready
app.get('/api/ready', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ ready: true, db: 'up' });
  } catch (err) {
    return c.json({ ready: false, db: 'down', error: err?.message || 'db unavailable' }, 503);
  }
});

// ── 认证与账号体系 ────────────────────────────────────────────────────────────
app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/roles', roleRoutes);

// ── 核心业务 ─────────────────────────────────────────────────────────────────
app.route('/api/projects', projectRoutes);
app.route('/api/phases', phasesRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/progress', progressRoutes);
app.route('/api/docs', docsRoutes);
app.route('/api/samples', samplesRoutes);
app.route('/api/primers', primersRoutes);

// ── 试剂体系 ─────────────────────────────────────────────────────────────────
app.route('/api/reagents', reagentsRoutes);            // 聚合读取/导出（写方法 405）
app.route('/api/reagent-lots', reagentLotsRoutes);     // 批次写入唯一入口
app.route('/api/reagent-materials', reagentMaterialsRoutes);
app.route('/api/formulas', formulasRoutes);
app.route('/api/prep', prepRoutes);

// ── 模板与法规 ───────────────────────────────────────────────────────────────
app.route('/api/project-templates', projectTemplatesRoutes);
app.route('/api/task-templates', taskTemplatesRoutes);
app.route('/api/registrations', registrationsRoutes);
app.route('/api/regulatory-documents', regulatoryDocumentsRoutes);

// ── 平台能力（M-1 P0 契约端点）──────────────────────────────────────────────
app.route('/api', auditRoutes);         // 内部 '/audit-logs'、'/audit/entity/...'（显式前缀）
app.route('/api', systemLogsRoutes);    // 内部 '/system-logs'
// settings / dict / files 内部为裸 '/'，必须挂到显式前缀（否则 '/' → /api，'/:enumName' 会吞掉
// 全局单段路径——W10 本地重建时暴露的真实 bug）
app.route('/api/settings', settingsRoutes);
app.route('/api/dict', dictRoutes);
app.route('/api/files', filesRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/backup', backupRoutes);

// 错误处理
app.onError((err, c) => {
  const status = err?.status || 500;
  if (status >= 500) console.error('Error:', err);
  // ConflictError（409 版本冲突）返回结构化响应供前端 AdaptiveUploadQueue 处理
  if (err.name === 'ConflictError') {
    return c.json({ error: err.message, ...err.payload }, 409);
  }
  return c.json(
    {
      error: err.message || 'Internal Server Error',
      code: err.code || err.status || 500,
    },
    status,
  );
});

// 404 处理
app.notFound((c) => c.json({ error: 'Not Found', code: 404 }, 404));

// ── 启动期安全守卫（W12 密钥审计裁定）─────────────────────────────────────────
// 生产环境：JWT_SECRET 缺失或命中已知泄露默认值（见 config/leaked-secrets.json，
// 置于 src 之外以与 OPS 门禁区分"防御性引用"与"实际使用"）一律拒绝启动。
// 开发环境：不设 JWT_SECRET 时由 jwt.sign 直接报错（fail-fast）。
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET;
  let leaked = [];
  try {
    leaked = JSON.parse(readFileSync(new URL('../config/leaked-secrets.json', import.meta.url), 'utf8')).leaked ?? [];
  } catch { /* 清单缺失时仅跳过泄露值比对，未设置仍然拦截 */ }
  if (!secret || leaked.includes(secret)) {
    console.error('[FATAL] JWT_SECRET 未设置或使用了已知泄露的默认值，生产环境拒绝启动');
    process.exit(1);
  }
}

// 启动服务器
const port = Number.parseInt(process.env.PORT || '3000', 10);
console.log(`🚀 R&D PMS API starting on port ${port}...`);

// 默认仅监听回环（OPS 门禁：3000 不得暴露非回环）；如需变更用 HOST 环境变量显式指定
serve({ fetch: app.fetch, port, hostname: process.env.HOST || '127.0.0.1' });

console.log(`✅ Server is running at http://localhost:${port}`);
