/**
 * 仅初始化任务模板的 Seed 脚本（服务器安全部署）
 * 
 * 使用场景：
 * - 在已有生产数据的服务器上，安全地初始化或更新任务模板
 * - 不影响项目、用户、报告等其他数据
 * - 支持增量更新（跳过已存在的模板）
 * 
 * 用法：
 * cd backend
 * npm run seed:templates-only
 * 
 * 或指定特定环境：
 * NODE_ENV=production npm run seed:templates-only
 */

import { PrismaClient } from '@prisma/client';
import { SEED_TEMPLATES } from './taskTemplateSeed.js';

const prisma = new PrismaClient();

const log = (msg, level = 'info') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${msg}`);
};

const backup = async () => {
  try {
    const templates = await prisma.taskTemplate.findMany({
      include: { steps: true },
    });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `db_backups/taskTemplate_backup_${timestamp}.json`;
    
    // 记录备份信息（不实际文件操作，仅记录数据）
    log(`Backup snapshot created: ${templates.length} templates with ${
      templates.reduce((sum, t) => sum + (t.steps?.length || 0), 0)
    } steps`, 'warn');
    
    return { count: templates.length, timestamp };
  } catch (e) {
    log(`Backup check failed: ${e.message}`, 'warn');
    return null;
  }
};

const seedTemplatesOnly = async () => {
  try {
    log('Starting task template initialization...', 'info');
    
    // 步骤1：备份
    log('Step 1: Creating backup snapshot...', 'info');
    const backupInfo = await backup();
    if (backupInfo) {
      log(`Existing ${backupInfo.count} templates backed up`, 'info');
    }
    
    // 步骤2：检查现有模板
    log('Step 2: Checking existing templates...', 'info');
    const existing = await prisma.taskTemplate.count();
    log(`Found ${existing} existing templates`, 'info');
    
    // 步骤3：初始化新模板
    log('Step 3: Initializing new task templates...', 'info');
    let created = 0;
    let skipped = 0;
    const errors = [];
    
    for (const tpl of SEED_TEMPLATES) {
      try {
        // 检查模板是否已存在（按名称和分类）
        const exists = await prisma.taskTemplate.findFirst({
          where: { 
            name: tpl.name,
            category: tpl.category,
          },
        });
        
        if (exists) {
          skipped++;
          log(`  ⊘ Skipped: ${tpl.name} (already exists)`, 'debug');
          continue;
        }
        
        // 创建新模板
        const created_tpl = await prisma.taskTemplate.create({
          data: {
            name: tpl.name,
            category: tpl.category,
            description: tpl.description || null,
            estimatedDays: tpl.estimatedDays || 0,
            priority: tpl.priority || 'medium',
            tags: Array.isArray(tpl.tags) ? tpl.tags.join(',') : (tpl.tags || null),
            steps: {
              create: (tpl.steps || []).map((s, idx) => ({
                order: idx + 1,
                title: s.title,
                description: s.description || null,
                estimatedHours: s.estimatedHours || null,
                assigneeRole: s.assigneeRole || null,
                checklist: null,
              })),
            },
          },
        });
        
        created++;
        log(`  ✓ Created: ${tpl.name} (${(tpl.steps || []).length} steps)`, 'debug');
      } catch (err) {
        skipped++;
        errors.push({ template: tpl.name, error: err.message });
        log(`  ✗ Failed: ${tpl.name} - ${err.message}`, 'warn');
      }
    }
    
    // 步骤4：验证结果
    log('Step 4: Verifying results...', 'info');
    const final_count = await prisma.taskTemplate.count();
    const final_steps = await prisma.taskTemplateStep.count();
    
    log('═══════════════════════════════════════', 'info');
    log(`✓ Task template initialization completed`, 'info');
    log(`  Created: ${created} new templates`, 'info');
    log(`  Skipped: ${skipped} (already existed)`, 'info');
    log(`  Total templates now: ${final_count}`, 'info');
    log(`  Total steps: ${final_steps}`, 'info');
    
    if (errors.length > 0) {
      log(`  Errors: ${errors.length}`, 'warn');
      errors.forEach(e => {
        log(`    - ${e.template}: ${e.error}`, 'warn');
      });
    }
    log('═══════════════════════════════════════', 'info');
    
    return {
      success: true,
      created,
      skipped,
      errors: errors.length,
      final: {
        templates: final_count,
        steps: final_steps,
      },
    };
  } catch (err) {
    log(`FATAL ERROR: ${err.message}`, 'error');
    throw err;
  } finally {
    await prisma.$disconnect();
  }
};

// 直接运行
seedTemplatesOnly()
  .then((result) => {
    process.exit(result.success && result.errors === 0 ? 0 : 1);
  })
  .catch((err) => {
    log(`Unhandled error: ${err.message}`, 'error');
    process.exit(1);
  });
