#!/usr/bin/env node
/**
 * scripts/backfill-file-scope.mjs —— 历史文件归属分类（RF05 / F11）
 *
 * 用途：把**未分类**（accessScope=PRIVATE_STAGING 且 classified_at IS NULL）的历史文件
 * 按现有附件关系推导归属：项目内实体 → PROJECT；法规原文 → SHARED_LIBRARY；用户头像 → PUBLIC；
 * 推导不出来的保持未分类（**不自动公开**，由超管在 /api/files?needsClassification=true 里人工分类）。
 *
 * 规则与迁移 20260928120000_file_access_scope 中的回填 SQL 一致，且与
 * modules/files/fileCommands.ts 的 classifyFromAttachments 共用同一实现（避免两套口径）。
 *
 * 用法：
 *   node scripts/backfill-file-scope.mjs            # 只读盘点（默认，不写任何数据）
 *   node scripts/backfill-file-scope.mjs --apply    # 实际写库（幂等；只动未分类记录）
 *   node scripts/backfill-file-scope.mjs --json     # 机器可读输出
 *
 * 前置：`npm run build`（脚本复用 dist 中的领域模块）；数据库连接取 DATABASE_URL / DIRECT_URL。
 */
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const JSON_OUT = args.has('--json');

const { PrismaClient } = await import('@prisma/client');
const { classifyFromAttachments } = await import('../dist/modules/files/fileCommands.js');

const prisma = new PrismaClient();

/** 批量取 entity → projectId 映射（避免逐条查询） */
async function loadProjectMap(attachments) {
  const byType = new Map();
  for (const a of attachments) {
    if (!byType.has(a.entityType)) byType.set(a.entityType, new Set());
    byType.get(a.entityType).add(a.entityId);
  }
  const map = new Map(); // `${entityType}:${entityId}` → projectId
  const collect = async (model, type) => {
    const ids = [...(byType.get(type) ?? [])];
    if (!ids.length) return;
    const rows = await model.findMany({ where: { id: { in: ids } }, select: { id: true, projectId: true } });
    for (const r of rows) map.set(`${type}:${r.id}`, r.projectId);
  };
  await collect(prisma.task, 'TASK');
  await collect(prisma.projectPhase, 'PROJECT_PHASE');
  await collect(prisma.milestone, 'MILESTONE');
  await collect(prisma.report, 'REPORT');
  await collect(prisma.monthlyProgress, 'MONTHLY_PROGRESS');
  return map;
}

async function main() {
  const files = await prisma.fileObject.findMany({
    where: { deletedAt: null, accessScope: 'PRIVATE_STAGING', classifiedAt: null },
    select: { id: true, originalName: true, uploadedById: true, ownerUserId: true },
  });
  const attachments = files.length
    ? await prisma.attachment.findMany({
      where: { fileId: { in: files.map((f) => f.id) }, deletedAt: null },
      select: { id: true, fileId: true, entityType: true, entityId: true, label: true },
    })
    : [];
  const avatarRows = files.length
    ? await prisma.user.findMany({
      where: { avatarFileId: { in: files.map((f) => f.id) } },
      select: { avatarFileId: true },
    })
    : [];
  const avatarIds = new Set(avatarRows.map((r) => r.avatarFileId).filter(Boolean));
  const projectMap = await loadProjectMap(attachments);

  const byFile = new Map();
  for (const a of attachments) {
    if (!byFile.has(a.fileId)) byFile.set(a.fileId, []);
    byFile.get(a.fileId).push(a);
  }

  const plan = [];
  for (const f of files) {
    const classification = classifyFromAttachments(
      { attachments: byFile.get(f.id) ?? [], isUserAvatar: avatarIds.has(f.id) },
      (entityType, entityId) => projectMap.get(`${entityType}:${entityId}`) ?? null,
    );
    plan.push({ id: f.id, originalName: f.originalName, ...classification, hasUploader: Boolean(f.uploadedById ?? f.ownerUserId) });
  }

  const summary = plan.reduce((acc, p) => {
    acc[p.scope] = (acc[p.scope] ?? 0) + 1;
    return acc;
  }, {});
  const result = {
    mode: APPLY ? 'apply' : 'dry-run',
    scanned: files.length,
    summary,
    unclassified: plan.filter((p) => p.scope === 'PRIVATE_STAGING').length,
    plan,
  };

  if (!APPLY) {
    if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`[file-scope] 扫描未分类文件 ${files.length} 条：`, summary);
      for (const p of plan.slice(0, 20)) console.log(`  - ${p.id} ${p.originalName} → ${p.scope}（${p.basis}）`);
      if (plan.length > 20) console.log(`  … 其余 ${plan.length - 20} 条见 --json`);
      console.log('[file-scope] 这是只读盘点，未写入任何数据；需要落库请加 --apply');
    }
    return;
  }

  let applied = 0;
  for (const p of plan) {
    if (p.scope === 'PRIVATE_STAGING') continue; // 未分类保持原样（不自动公开）
    await prisma.fileObject.update({
      where: { id: p.id },
      data: {
        accessScope: p.scope,
        ownerProjectId: p.ownerProjectId ?? null,
        sharedReadPermission: p.sharedReadPermission ?? null,
        classifiedAt: new Date(),
        classifiedById: null, // 回填（非人工）
      },
    });
    applied += 1;
  }
  const after = {
    mode: 'apply',
    scanned: files.length,
    applied,
    keptUnclassified: plan.length - applied,
  };
  if (JSON_OUT) console.log(JSON.stringify(after, null, 2));
  else console.log(`[file-scope] 已分类 ${applied} 条，保留未分类 ${plan.length - applied} 条（需人工分类）`);
}

try {
  await main();
} catch (err) {
  console.error('[file-scope] 失败：', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
