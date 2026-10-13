/**
 * 合成模板夹具写入（仅写入本轮自有临时库 rdpms_test_p0acc）
 * 数据源：inputs/template-export.json（真实母版导出，sha256 536b4f88…）
 * 复现目标：config 为简化结构（任务仅 7 个字段）+ 结构化行含全部领域字段 → 即 SYS-01 场景。
 * 用法：DATABASE_URL=<临时库> node seed-fixture.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(HERE, '../../../../../../');
const BACKEND = path.join(REPO_ROOT, 'rdpms-system/backend');
const require_ = createRequire(path.join(BACKEND, 'package.json'));
const { PrismaClient } = require_('@prisma/client');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL || !DB_URL.includes('rdpms_test_p0acc')) {
  console.error('FATAL: 仅允许写入本轮自有临时库 rdpms_test_p0acc');
  process.exit(1);
}

const exp = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'inputs', 'template-export.json'), 'utf8'));
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const admin = await prisma.user.findFirst({ where: { username: 'test_super_admin' }, select: { id: true } });
if (!admin) { console.error('FATAL: test_super_admin 不存在'); process.exit(1); }

const existing = await prisma.projectTemplate.findUnique({ where: { code: 'TPL-P0-FIXTURE' }, select: { id: true } });
if (existing) { await prisma.projectTemplate.delete({ where: { id: existing.id } }); }

// 1) 模板行：config 保留真实导出的原始字符串（简化结构 → 复现 SYS-01）
const tpl = await prisma.projectTemplate.create({
  data: {
    code: 'TPL-P0-FIXTURE',
    name: 'P0 合成夹具模板（试剂/芯片母版副本）',
    description: 'P0 验收夹具：由真实母版导出生成，仅存在于临时库',
    category: 'reagent_chip',
    typeLabel: '试剂/芯片开发',
    status: 'ACTIVE',
    isMaster: false,
    config: exp.template.config,
    createdById: admin.id,
  },
  select: { id: true },
});

// 2) 结构化阶段 + 任务（全部领域字段）
let taskCount = 0;
for (const [pi, p] of exp.structuredPhases.entries()) {
  const phase = await prisma.templatePhase.create({
    data: {
      id: p.id, // 保留导出 id —— config 与结构化行的「稳定 ID 合并」依赖同一 ID
      templateId: tpl.id,
      code: p.code ?? `p${pi + 1}`,
      name: p.name,
      description: p.description ?? null,
      sortOrder: p.sortOrder ?? pi + 1,
      plannedStartOffsetDays: p.plannedStartOffsetDays ?? null,
      plannedDurationDays: p.plannedDurationDays ?? null,
      isMilestone: p.isMilestone === true,
    },
    select: { id: true },
  });
  for (const t of p.tasks ?? []) {
    await prisma.templateTask.create({
      data: {
        id: t.id, // 同上：保留导出 id，以复现「config 简化字段 + 结构化补全」
        templatePhaseId: phase.id,
        code: t.code ?? null,
        title: t.title,
        description: t.description ?? null,
        taskType: t.taskType ?? null,
        applicability: t.applicability ?? 'REQUIRED',
        regulatoryPriority: t.regulatoryPriority ?? null,
        expectedDeliverable: t.expectedDeliverable ?? null,
        regulatoryNotes: t.regulatoryNotes ?? null,
        estimatedHours: t.estimatedHours ?? null,
        assigneeRoleCode: t.assigneeRoleCode ?? null,
        sortOrder: t.sortOrder ?? taskCount,
      },
    });
    taskCount += 1;
  }
}

// 3) 模板角色（与真实母版一致）
for (const [ri, r] of exp.templateRoles.entries()) {
  await prisma.templateRole.create({
    data: {
      templateId: tpl.id,
      code: r.code,
      name: r.name,
      description: r.description ?? null,
      permissions: Array.isArray(r.permissions) ? r.permissions : [],
      sortOrder: r.sortOrder ?? ri,
    },
  });
}

const phaseCount = await prisma.templatePhase.count({ where: { templateId: tpl.id } });
console.log(JSON.stringify({
  fixtureTemplateId: tpl.id,
  fixtureCode: 'TPL-P0-FIXTURE',
  phases: phaseCount,
  tasks: taskCount,
  configType: typeof exp.template.config,
  configLength: String(exp.template.config).length,
}, null, 2));
await prisma.$disconnect();
