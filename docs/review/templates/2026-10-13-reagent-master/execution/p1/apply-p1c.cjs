/**
 * P1-c 平台检查表落地（2026-10-14）
 * ------------------------------------------------------------------
 * 只落地 map-checklist.py 判定为 UNIQUE 的 11 项（唯一映射到具体任务）；
 * 其余 12 项（跨多阶段/关键词弱）保持草案，待人工判定，不猜。
 * 落地方式：向 template_tasks.regulatory_notes 追加（该列现为空，可逆）：
 *      [平台检查 DMF-01] <topic>：<minimumCheckProposal>
 * 幂等：已含该检查 ID 标记则跳过。不触碰项目实例。先全量备份。
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const HERE = __dirname;
const REV = path.resolve(HERE, '..', '..');
const require_ = createRequire('/mnt/datadisk0/rdpms/app/rdpms-system/backend/package.json');
const { PrismaClient } = require_('@prisma/client');

const TEMPLATE_CODE = 'TPL-REAGENT-MASTER';

/** 唯一映射结果（来自 map-checklist.py dry-run：得分 1.0 或明显领先） */
const UNIQUE_MAP = {
  'DMF-01': '液滴与磁珠操作调试',
  'DMF-03': '芯片方案确认',
  'DMF-04': '芯片方案确认',
  'DMF-05': '芯片内扩增验证',
  'DMF-08': '芯片内扩增验证',
  'DMF-09': '程序与算法调试',
  'DMF-10': '液滴与磁珠操作调试',
  'FIELD-01': '应用验证场景执行',
  'FIELD-02': '用户体验评价',
  'SAMPLE-02': '应用验证样本准备',
  'CHANGE-01': '芯片方案冻结',
};

(async () => {
  const prisma = new PrismaClient();
  const tpl = await prisma.projectTemplate.findUnique({
    where: { code: TEMPLATE_CODE },
    include: { phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!tpl) throw new Error('母版未找到');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  // 备份
  const backupDir = path.join(HERE, 'evidence', `backup-p1c-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const rows = [];
  for (const p of tpl.phases) for (const t of p.tasks) rows.push({ id: t.id, title: t.title, regulatoryNotes: t.regulatoryNotes });
  fs.writeFileSync(path.join(backupDir, 'template-tasks-before.json'), JSON.stringify(rows, null, 2));
  console.log(`[备份] ${backupDir}`);

  // 读取检查项
  const csvText = fs.readFileSync(path.join(REV, 'platform-checklist.csv'), 'utf8').replace(/^\uFEFF/, '');
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',');
  const iId = header.indexOf('id');
  const iTopic = header.indexOf('topic');
  const iProposal = header.indexOf('minimumCheckProposal');
  const iApplic = header.indexOf('applicability');
  // 简单 CSV 解析（处理引号）
  const parseLine = (line) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const items = lines.map(parseLine);
  const byId = new Map(items.map((r) => [r[iId], r]));

  // 任务标题 → 行（同名任务取阶段序最小者）
  const byTitle = new Map();
  for (const p of tpl.phases) for (const t of p.tasks) if (!byTitle.has(t.title)) byTitle.set(t.title, { task: t, phase: p });

  const result = { uniqueMapped: Object.keys(UNIQUE_MAP).length, updated: 0, skipped: 0, missing: [], samples: [] };
  for (const [cid, title] of Object.entries(UNIQUE_MAP)) {
    const hit = byTitle.get(title);
    const row = byId.get(cid);
    if (!hit || !row) { result.missing.push(`${cid}→${title}`); continue; }
    const tag = `[平台检查 ${cid}]`;
    const note = `${tag} ${row[iTopic]}：${row[iProposal]}`;
    const before = hit.task.regulatoryNotes || '';
    if (before.includes(tag)) { result.skipped += 1; continue; }
    const after = before ? `${before}\n${note}` : note;
    await prisma.templateTask.update({ where: { id: hit.task.id }, data: { regulatoryNotes: after } });
    result.updated += 1;
    if (result.samples.length < 3) result.samples.push({ checkId: cid, task: title, note: note.slice(0, 200) });
  }
  console.log(`[P1-c] 唯一映射 ${result.uniqueMapped} 项 → 写入 ${result.updated}，跳过已有 ${result.skipped}，未命中 ${result.missing.length}`);

  const after = await prisma.projectTemplate.findUnique({
    where: { code: TEMPLATE_CODE },
    include: { phases: { include: { tasks: true } } },
  });
  const all = after.phases.flatMap((p) => p.tasks);
  result.verify = { withPlatformCheck: all.filter((t) => (t.regulatoryNotes || '').includes('[平台检查')).length, total: all.length };
  console.log('[复验] 含平台检查的任务:', result.verify.withPlatformCheck + '/' + result.verify.total);

  fs.writeFileSync(path.join(HERE, 'evidence', `p1c-apply-result-${ts}.json`), JSON.stringify(result, null, 2));
  console.log('[证据] evidence/p1c-apply-result-' + ts + '.json');
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
