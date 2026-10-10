/**
 * bootstrap/createApp.js —— 应用装配（RF01，05 §1）
 *
 * 只装配 Hono 应用并返回；不监听端口、不构造数据库客户端。
 * 装配入口形如 createApp({db, clock, idGenerator, actorResolver, services})，
 * 测试可注入桩依赖直接对应用发请求（无需数据库、无需端口）。
 *
 * 启动监听只允许发生在 bootstrap/server.js。
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadConfig } from '../platform/config/configSchema.js';
import { runWithContext, currentContext } from '../platform/requestContext.js';

import authRoutes from '../routes/auth.js';
import userRoutes from '../routes/users.js';
import roleRoutes from '../routes/roles.js';
import projectRoutes from '../routes/projects.js';
import reportRoutes from '../routes/reports.js';
import progressRoutes from '../routes/progress.js';
import taskRoutes from '../routes/tasks.js';
import statsRoutes from '../routes/stats.js';
import docsRoutes from '../routes/docs.js';
import projectTemplatesRoutes from '../routes/projectTemplates.js';
import phasesRoutes from '../routes/phases.js';
import reagentsRoutes from '../routes/reagents.js';
import reagentLotsRoutes from '../routes/reagent-lots.js';
import reagentMaterialsRoutes from '../routes/reagentMaterials.js';
import taskTemplatesRoutes from '../routes/taskTemplates.js';
import formulasRoutes from '../routes/formulas.js';
import prepRoutes from '../routes/prep-calculator.js';
import primersRoutes from '../routes/primers.js';
import backupRoutes from '../routes/backup.js';
import backupArchiveRoutes from '../routes/backupArchives.js';
import samplesRoutes from '../routes/samples.js';
import registrationsRoutes from '../routes/registrations.js';
import regulatoryDocumentsRoutes from '../routes/regulatory-documents.js';
import auditRoutes from '../routes/audit.js';
import systemLogsRoutes from '../routes/system-logs.js';
import settingsRoutes from '../routes/settings.js';
import dictRoutes from '../routes/dict.js';
import filesRoutes from '../routes/files.js';
import syncRoutes from '../routes/sync.js';

/**
 * @param {object} [deps]
 * @param {object} [deps.db]            数据库客户端（缺省时使用惰性默认客户端）
 * @param {object} [deps.clock]         时钟（注入后取代 new Date()，供后续命令层使用）
 * @param {object} [deps.idGenerator]   ID 生成器（供后续命令层使用）
 * @param {Function} [deps.actorResolver] 身份解析器（缺省使用 JWT + 权限装载）
 * @param {object} [deps.services]      应用服务集合（RF02+ 的命令入口）
 * @returns {Hono}
 */
export function createApp(deps = {}) {
  const { db, clock, idGenerator, actorResolver, services } = deps;

  // 注意：不修改任何进程级单例；db 与 actorResolver 只在本应用的请求作用域内可见
  const app = new Hono();

  // 依赖挂到上下文 + 进入本实例的作用域（后续中间件与路由都在该作用域内）
  app.use('*', async (c, next) => {
    c.set('deps', { db, clock, idGenerator, services });
    c.set('db', db ?? null);
    return runWithContext({ db: db ?? null, actorResolver: actorResolver ?? null }, next);
  });

  const config = loadConfig(process.env);
  // CORS uses the same documented schema as compiled candidate CLI.
  app.use('*', cors({
    origin: config.origins,
    credentials: config.credentials,
  }));

  // 幂等（RF02）：不再在鉴权前按 key 回放任何缓存。写命令在完成鉴权与资源授权后，
  // 通过 platform/idempotency/receipts.js 的 withIdempotency 查询持久化回执并与业务同事务提交。

  // 根路由
  app.get('/', (c) => c.json({
    name: 'R&D PMS API',
    version: '2.0.0',
    status: 'running',
  }));

  // 健康检查（liveness）
  // 健康检查：附加**本轮实例标识与构建标识**，供测试确认「访问的是本轮进程/本轮构建」，
  // 避免旧进程响应被误算到新代码上（第六轮测试环境要求）。
  const buildId=process.env.RDPMS_BUILD_ID, instanceId=process.env.RDPMS_INSTANCE_ID;
  const healthPayload = () => ({
    status: 'ok',
    ...(instanceId ? { instance: instanceId } : {}),
    ...(buildId ? { build: buildId } : {}),
  });
  app.get('/health', (c) => c.json(healthPayload()));
  app.get('/api/health', (c) => c.json(healthPayload()));

  // 就绪检查（readiness，公开，M-1 P0 契约）：DB 可达即 ready
  app.get('/api/ready', async (c) => {
    try {
      const client = currentContext()?.db ?? db;
      if (!client) throw new Error('数据库未注入');
      await client.$queryRaw`SELECT 1`;
      const dataset=await client.dataRecoveryState.findUnique({where:{id:1},select:{status:true,epoch:true}});
      if(!dataset || dataset.status!=='READY') throw new Error('DATASET_NOT_READY');
      return c.json({ ready: true, db: 'up', ...healthPayload() });
    } catch (err) {
      return c.json({ ready: false, db: 'down', error: 'db unavailable' }, 503);
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
  // 归档备份（整库 pg_dump + 加密 + 历史/校验/保留/磁盘）：与上面共用前缀，路径不重叠
  app.route('/api/backup', backupArchiveRoutes);

  // ── 离线同步 v2（批次四）────────────────────────────────────────────────────
  app.route('/api/sync', syncRoutes);

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

  return app;
}

export default createApp;
