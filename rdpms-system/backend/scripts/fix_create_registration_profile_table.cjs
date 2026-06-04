/**
 * 一次性修复脚本：在服务器数据库中创建缺失的 ProjectRegistrationProfile 表
 *
 * 使用方法（在服务器 backend 目录下执行）：
 *   node scripts/fix_create_registration_profile_table.cjs
 *
 * 安全性：脚本会先检查表是否存在，存在则跳过，不会重复创建。
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  // 检查表是否已存在
  const tables = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='ProjectRegistrationProfile'`
  );

  if ((tables || []).length > 0) {
    console.log('✅ Table ProjectRegistrationProfile already exists. Nothing to do.');
    return;
  }

  console.log('Creating table ProjectRegistrationProfile...');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "ProjectRegistrationProfile" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "registrationType" TEXT NOT NULL DEFAULT 'IVD',
      "region" TEXT,
      "authority" TEXT,
      "submissionNo" TEXT,
      "certificateNo" TEXT,
      "currentStage" TEXT,
      "plannedSubmissionDate" DATETIME,
      "expectedApprovalDate" DATETIME,
      "complianceOwnerId" TEXT,
      "riskLevel" TEXT NOT NULL DEFAULT '中',
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectRegistrationProfile_projectId_key" UNIQUE ("projectId"),
      CONSTRAINT "ProjectRegistrationProfile_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProjectRegistrationProfile_complianceOwnerId_fkey"
        FOREIGN KEY ("complianceOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(
    'CREATE INDEX "ProjectRegistrationProfile_registrationType_idx" ON "ProjectRegistrationProfile"("registrationType")'
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX "ProjectRegistrationProfile_currentStage_idx" ON "ProjectRegistrationProfile"("currentStage")'
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX "ProjectRegistrationProfile_complianceOwnerId_idx" ON "ProjectRegistrationProfile"("complianceOwnerId")'
  );

  // 把这条 migration 登记到 _prisma_migrations，防止之后 prisma migrate deploy 重复执行
  try {
    const migrationName = '20260604103000_add_project_registration_profile';
    const checksum = crypto.createHash('sha256').update(migrationName).digest('hex');
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    await prisma.$executeRawUnsafe(`
      INSERT OR IGNORE INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES ('${crypto.randomUUID()}', '${checksum}', '${now}', '${migrationName}', NULL, NULL, '${now}', 1)
    `);
    console.log('✅ Registered migration in _prisma_migrations.');
  } catch (e) {
    console.warn('⚠️  Could not register migration record (non-fatal):', e.message);
  }

  console.log('✅ Done. Please restart the backend process (e.g. pm2 restart rdpms-backend).');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
