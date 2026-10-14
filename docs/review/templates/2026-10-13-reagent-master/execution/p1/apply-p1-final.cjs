/**
 * P1 收尾落地（2026-10-14，用户确认后执行）
 * ------------------------------------------------------------------
 * ① P1-c 剩余 12 项平台检查，按用户确认的逐项建议落点：
 *    复制 8 项（DMF-02/07/11/12、CTRL-01/02/03/05）+ 归并组 4 项
 *    （DMF-06→芯片方案确认、FIELD-03→应用验证场景执行、CTRL-04→片外体系评审、
 *      SAMPLE-01→样本方案设计+抗干扰与样本适用性）
 * ② P1-e A/B/C 分级（方案三用途定级 + 方案二证据深度）落地为任务级 [分级要求] 标注
 *    （母版 p8 已有「按等级/A 类最低/C 类增强」结构，天然对应，不新增阶段）
 * 落地方式：追加到 template_tasks.regulatory_notes（幂等，原内容保留；该列现状为空/已有平台检查）
 * 先全量备份；不触碰项目实例。
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const HERE = __dirname;
const REV = path.resolve(HERE, '..', '..');
const require_ = createRequire('/mnt/datadisk0/rdpms/app/rdpms-system/backend/package.json');
const { PrismaClient } = require_('@prisma/client');
const TEMPLATE_CODE = 'TPL-REAGENT-MASTER';

/** 12 项检查的落点（任务标题 → 检查 ID；同一任务可挂多项） */
const CHECK_TARGETS = {
  'DMF-02': ['前处理条件验证', '液滴与磁珠操作调试'],
  'DMF-07': ['芯片方案确认', '包装与运输验证'],
  'DMF-11': ['液滴与磁珠操作调试', '特异性与交叉反应'],
  'DMF-12': ['芯片内扩增验证', '重复性与批间一致性'],
  'CTRL-01': ['技术方案评审', '片外体系评审'],
  'CTRL-02': ['前处理条件验证', '片外体系评审'],
  'CTRL-03': ['反应体系优化', '芯片内扩增验证'],
  'CTRL-05': ['片外性能初评', '应用验证场景执行'],
  'DMF-06': ['芯片方案确认'],
  'FIELD-03': ['应用验证场景执行'],
  'CTRL-04': ['片外体系评审'],
  'SAMPLE-01': ['样本方案设计', '抗干扰与样本适用性'],
};

/** A/B/C 分级标注（任务标题 → 标注文本）；方案三用途定级 + 方案二证据深度 */
const TIER_NOTES = {
  '项目价值与 Go/No-Go 判断': '立项时确定项目定级与理由并记入项目一页卡：A 科研/教育、B 食品安全或动物水产检测、C 对外交付。定级决定证据深度（A 记录完整、B 预定义验收+重复性、C 完整 V&V+风险闭环+版本冻结），后续验证范围按定级执行。',
  '性能验证方案设计（按等级）': '按定级映射验证等级：A 科研/教育 → A 类最低验证；B 食安/动物水产 → 完整验证（预定义接受标准 + 重复性证据）；C 对外交付 → C 类增强验证 + 风险闭环 + 版本冻结。',
  'A 类最低验证执行': 'A 定级（科研/教育）执行本组；B/C 定级应执行完整验证，不得以 A 类替代。',
  'C 类增强验证': 'C 定级（对外交付）执行本组；A/B 定级可裁剪，但须在验证方案中记录裁剪理由。',
  '放行标准与批检': 'B/C 定级必须预先定义放行标准与批检项目；A 定级可简化并记录理由。',
  '有效期与储运条件确定': 'C 定级必须完整执行；A/B 定级可按用途简化并记录理由。',
  '产品发布评审': 'C 定级（对外交付）必须完整执行；A/B 定级可按需裁剪并记录理由。',
  '客户交付文件': 'C 定级（对外交付）必须完整执行；A/B 定级可按需裁剪并记录理由。',
};

/** CSV 解析（处理引号） */
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',');
  const parseLine = (line) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  return lines.map(parseLine).map((r) => Object.fromEntries(r.map((v, i) => [header[i], v])));
}

(async () => {
  const prisma = new PrismaClient();
  const tpl = await prisma.projectTemplate.findUnique({
    where: { code: TEMPLATE_CODE },
    include: { phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!tpl) throw new Error('母版未找到');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  const backupDir = path.join(HERE, 'evidence', `backup-p1final-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const rows = [];
  for (const p of tpl.phases) for (const t of p.tasks) rows.push({ id: t.id, title: t.title, regulatoryNotes: t.regulatoryNotes });
  fs.writeFileSync(path.join(backupDir, 'template-tasks-before.json'), JSON.stringify(rows, null, 2));
  console.log(`[备份] ${backupDir}`);

  const byTitle = new Map();
  for (const p of tpl.phases) for (const t of p.tasks) if (!byTitle.has(t.title)) byTitle.set(t.title, t);

  const checklist = parseCsv(fs.readFileSync(path.join(REV, 'platform-checklist.csv'), 'utf8'));
  const byId = new Map(checklist.map((r) => [r.id, r]));

  const result = { checks: { mapped: Object.keys(CHECK_TARGETS).length, written: 0, skipped: 0, missing: [] }, tiers: { mapped: Object.keys(TIER_NOTES).length, written: 0, skipped: 0, missing: [] } };

  // ① 平台检查（12 项）
  for (const [cid, titles] of Object.entries(CHECK_TARGETS)) {
    const row = byId.get(cid);
    if (!row) { result.checks.missing.push(cid); continue; }
    const note = `[平台检查 ${cid}] ${row.topic}：${row.minimumCheckProposal}`;
    for (const title of titles) {
      const t = byTitle.get(title);
      if (!t) { result.checks.missing.push(`${cid}→${title}`); continue; }
      const before = t.regulatoryNotes || '';
      if (before.includes(`[平台检查 ${cid}]`)) { result.checks.skipped += 1; continue; }
      await prisma.templateTask.update({ where: { id: t.id }, data: { regulatoryNotes: before ? `${before}\n${note}` : note } });
      result.checks.written += 1;
    }
  }
  console.log(`[P1-c] 检查 ${result.checks.mapped} 项 → 写入 ${result.checks.written} 条，跳过已有 ${result.checks.skipped}，未命中 ${result.checks.missing.length}`);

  // ② A/B/C 分级标注
  for (const [title, note] of Object.entries(TIER_NOTES)) {
    const t = byTitle.get(title);
    if (!t) { result.tiers.missing.push(title); continue; }
    const before = t.regulatoryNotes || '';
    if (before.includes('[分级要求]')) { result.tiers.skipped += 1; continue; }
    await prisma.templateTask.update({ where: { id: t.id }, data: { regulatoryNotes: before ? `${before}\n[分级要求] ${note}` : `[分级要求] ${note}` } });
    result.tiers.written += 1;
  }
  console.log(`[P1-e] 分级标注 ${result.tiers.mapped} 项 → 写入 ${result.tiers.written}，跳过已有 ${result.tiers.skipped}，未命中 ${result.tiers.missing.length}`);

  const after = await prisma.projectTemplate.findUnique({ where: { code: TEMPLATE_CODE }, include: { phases: { include: { tasks: true } } } });
  const all = after.phases.flatMap((p) => p.tasks);
  result.verify = {
    withPlatformCheck: all.filter((t) => (t.regulatoryNotes || '').includes('[平台检查')).length,
    withTierNote: all.filter((t) => (t.regulatoryNotes || '').includes('[分级要求]')).length,
    withAcceptance: all.filter((t) => (t.expectedDeliverable || '').includes('[验收]')).length,
    withRole: all.filter((t) => t.assigneeRoleCode).length,
    total: all.length,
  };
  console.log('[复验]', JSON.stringify(result.verify));
  fs.writeFileSync(path.join(HERE, 'evidence', `p1final-apply-result-${ts}.json`), JSON.stringify(result, null, 2));
  console.log('[证据] evidence/p1final-apply-result-' + ts + '.json');
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
