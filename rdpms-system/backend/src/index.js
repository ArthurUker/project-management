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
import backupRoutes from './routes/backup.js';
import samplesRoutes from './routes/samples.js';
import registrationsRoutes from './routes/registrations.js';
import regulatoryDocumentsRoutes from './routes/regulatory-documents.js';

// 初始化Prisma
export const prisma = new PrismaClient();

async function ensureTaskRegulatoryColumns() {
  // 兼容历史数据库：某些环境已升级 Prisma Client，但 Task 表仍缺少新增列。
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("Task")');
  const columnNames = new Set((columns || []).map((col) => col.name));

  const missingColumns = [
    {
      name: 'taskType',
      sql: 'ALTER TABLE "Task" ADD COLUMN "taskType" TEXT'
    },
    {
      name: 'applicabilityStatus',
      sql: 'ALTER TABLE "Task" ADD COLUMN "applicabilityStatus" TEXT DEFAULT \"required\"'
    },
    {
      name: 'regulatoryPriority',
      sql: 'ALTER TABLE "Task" ADD COLUMN "regulatoryPriority" TEXT DEFAULT \"P2\"'
    },
    {
      name: 'expectedDeliverable',
      sql: 'ALTER TABLE "Task" ADD COLUMN "expectedDeliverable" TEXT'
    },
    {
      name: 'regulatoryNotes',
      sql: 'ALTER TABLE "Task" ADD COLUMN "regulatoryNotes" TEXT'
    }
  ].filter((item) => !columnNames.has(item.name));

  if (missingColumns.length === 0) return;

  for (const item of missingColumns) {
    await prisma.$executeRawUnsafe(item.sql);
  }

  console.log(`✅ Patched Task columns: ${missingColumns.map((x) => x.name).join(', ')}`);
}

async function ensureProjectTemplateColumns() {
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("ProjectTemplate")');
  const columnNames = new Set((columns || []).map((col) => col.name));

  const missingColumns = [
    {
      name: 'type',
      sql: 'ALTER TABLE "ProjectTemplate" ADD COLUMN "type" TEXT'
    },
    {
      name: 'parentId',
      sql: 'ALTER TABLE "ProjectTemplate" ADD COLUMN "parentId" TEXT'
    },
    {
      name: 'isMaster',
      sql: 'ALTER TABLE "ProjectTemplate" ADD COLUMN "isMaster" BOOLEAN NOT NULL DEFAULT false'
    },
    {
      name: 'preview',
      sql: 'ALTER TABLE "ProjectTemplate" ADD COLUMN "preview" TEXT'
    },
    {
      name: 'status',
      sql: 'ALTER TABLE "ProjectTemplate" ADD COLUMN "status" TEXT NOT NULL DEFAULT \"active\"'
    }
  ].filter((item) => !columnNames.has(item.name));

  if (missingColumns.length === 0) return;

  for (const item of missingColumns) {
    await prisma.$executeRawUnsafe(item.sql);
  }

  console.log(`✅ Patched ProjectTemplate columns: ${missingColumns.map((x) => x.name).join(', ')}`);
}

async function ensureRegulatoryDocumentTables() {
  // 检查 RegulatoryDocument 表是否存在
  const tables = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('RegulatoryDocument','TaskRegulatoryDocument')`
  );
  const existingTables = new Set((tables || []).map((t) => t.name));

  if (!existingTables.has('RegulatoryDocument')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "RegulatoryDocument" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "dispatchNo" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "fullTitle" TEXT,
        "category" TEXT,
        "applicability" TEXT NOT NULL DEFAULT 'conditional',
        "applicableToIvd" BOOLEAN NOT NULL DEFAULT false,
        "priorityLevel" TEXT NOT NULL DEFAULT 'P3',
        "summary" TEXT,
        "applicabilityNote" TEXT,
        "fileName" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RegulatoryDocument_dispatchNo_key" UNIQUE ("dispatchNo")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX "RegulatoryDocument_priorityLevel_idx" ON "RegulatoryDocument"("priorityLevel")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "RegulatoryDocument_applicability_idx" ON "RegulatoryDocument"("applicability")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "RegulatoryDocument_applicableToIvd_idx" ON "RegulatoryDocument"("applicableToIvd")`);
    console.log('✅ Created table: RegulatoryDocument');
  }

  if (!existingTables.has('TaskRegulatoryDocument')) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "TaskRegulatoryDocument" (
        "taskId" TEXT NOT NULL,
        "regulatoryDocumentId" TEXT NOT NULL,
        "relationType" TEXT NOT NULL DEFAULT 'basis',
        "note" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("taskId", "regulatoryDocumentId"),
        CONSTRAINT "TaskRegulatoryDocument_taskId_fkey"
          FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "TaskRegulatoryDocument_regulatoryDocumentId_fkey"
          FOREIGN KEY ("regulatoryDocumentId") REFERENCES "RegulatoryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX "TaskRegulatoryDocument_taskId_idx" ON "TaskRegulatoryDocument"("taskId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "TaskRegulatoryDocument_regulatoryDocumentId_idx" ON "TaskRegulatoryDocument"("regulatoryDocumentId")`);
    console.log('✅ Created table: TaskRegulatoryDocument');
  }
}

async function ensurePrimerColumns() {
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("Primer")');
  const columnNames = new Set((columns || []).map((col) => col.name));

  const missingColumns = [
    {
      name: 'detectionTarget',
      sql: 'ALTER TABLE "Primer" ADD COLUMN "detectionTarget" TEXT'
    }
  ].filter((item) => !columnNames.has(item.name));

  if (missingColumns.length === 0) return;

  for (const item of missingColumns) {
    await prisma.$executeRawUnsafe(item.sql);
  }

  try {
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Primer_detectionTarget_idx" ON "Primer"("detectionTarget")');
  } catch (err) {
    console.warn('⚠️ Failed to create Primer_detectionTarget_idx:', err?.message || err);
  }

  console.log(`✅ Patched Primer columns: ${missingColumns.map((x) => x.name).join(', ')}`);
}

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
app.route('/api/backup', backupRoutes);
app.route('/api/samples', samplesRoutes);
app.route('/api/registrations', registrationsRoutes);
app.route('/api/regulatory-documents', regulatoryDocumentsRoutes);

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

await ensureTaskRegulatoryColumns();
await ensureProjectTemplateColumns();
await ensureRegulatoryDocumentTables();
await ensurePrimerColumns();

serve({
  fetch: app.fetch,
  port
});

console.log(`✅ Server is running at http://localhost:${port}`);
