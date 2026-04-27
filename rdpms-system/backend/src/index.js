import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import reportRoutes from './routes/reports.js';
import progressRoutes from './routes/progress.js';
import taskRoutes from './routes/tasks.js';
import syncRoutes from './routes/sync.js';
import statsRoutes from './routes/stats.js';
import docsRoutes from './routes/docs.js';
import projectTemplatesRoutes from './routes/projectTemplates.js';
import phasesRoutes from './routes/phases.js';
import reagentsRoutes from './routes/reagents.js';
import reagentMaterialsRoutes from './routes/reagentMaterials.js';
import taskTemplatesRoutes from './routes/taskTemplates.js';
import formulasRoutes from './routes/formulas.js';
import prepRoutes from './routes/prep-calculator.js';
import primersRoutes from './routes/primers.js';

// 初始化Prisma
export const prisma = new PrismaClient();

// 创建Hono应用
const app = new Hono();

// CORS中间件
app.use('*', cors({
  origin: '*',
  credentials: true
}));

// 根路由
app.get('/', (c) => c.json({ 
  name: 'R&D PMS API',
  version: '1.0.0',
  status: 'running'
}));

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// 注册路由
app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/progress', progressRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/docs', docsRoutes);
app.route('/api/project-templates', projectTemplatesRoutes);
app.route('/api/phases', phasesRoutes);
app.route('/api/reagents', reagentsRoutes);
app.route('/api/reagent-materials', reagentMaterialsRoutes);
app.route('/api/task-templates', taskTemplatesRoutes);
app.route('/api/formulas', formulasRoutes);
app.route('/api/prep', prepRoutes);
app.route('/api/primers', primersRoutes);

// 错误处理
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ 
    error: err.message || 'Internal Server Error',
    code: err.status || 500
  }, err.status || 500);
});

// 404处理
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// 启动服务器
const port = parseInt(process.env.PORT || '3000');

console.log(`🚀 R&D PMS API starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port
});

console.log(`✅ Server is running at http://localhost:${port}`);
