/**
 * P1-a / P1-b 落地脚本（2026-10-14，用户确认后执行）
 * ------------------------------------------------------------------
 * P1-a 角色映射：把 p1-role-code-mapping.csv 的 proposedRoleCode 写入
 *      template_tasks.assignee_role_code（仅写空值，原值全空 → 可逆）。
 * P1-b 试批（p1 / p3 / p8）：向 expected_deliverable **追加**（不覆盖）：
 *      [验收] <acceptanceProposal> / [前置] <prerequisiteProposal>（"无"则省略）；
 *      同时从 config 对应任务中删除 expectedDeliverable 键，
 *      使结构化行（权威数据源）成为投影来源（可逆：config 已备份）。
 *
 * 纪律：
 *   - 先备份（config 全量 + 两表涉及行），备份在 execution/p1/evidence/backup-<ts>/
 *   - 幂等：已含 [验收] 标记或角色已填则跳过，不重复追加
 *   - 只写母版结构化行与 config 中相关键；不触碰任何项目实例/历史证据
 *   - 逐步输出计数与前后样例
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const HERE = __dirname;
const REVIEW = path.resolve(HERE, '..', '..');
const require_ = createRequire('/mnt/datadisk0/rdpms/app/rdpms-system/backend/package.json');
const { PrismaClient } = require_('@prisma/client');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const TEMPLATE_CODE = 'TPL-REAGENT-MASTER';
const TRIAL_PHASES = new Set(['p1', 'p3', 'p8']); // 用户确认的试批范围

const readCsv = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  .map((line) => line.split(','));

(async () => {
  const prisma = new PrismaClient();
  const tpl = await prisma.projectTemplate.findUnique({
    where: { code: TEMPLATE_CODE },
    include: { phases: { orderBy: { sortOrder: 'asc' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!tpl) throw new Error('母版未找到');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  // ── 0. 备份 ────────────────────────────────────────────────────────────────
  const backupDir = path.join(HERE, 'evidence', `backup-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const rows = [];
  for (const p of tpl.phases) {
    for (const t of p.tasks) {
      rows.push({ id: t.id, phaseCode: p.code, title: t.title, assigneeRoleCode: t.assigneeRoleCode, expectedDeliverable: t.expectedDeliverable });
    }
  }
  fs.writeFileSync(path.join(backupDir, 'template-tasks-before.json'), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(backupDir, 'template-config-before.json'), typeof tpl.config === 'string' ? tpl.config : JSON.stringify(tpl.config));
  console.log(`[备份] ${backupDir}（任务行 ${rows.length} 条 + config 全量）`);

  const result = { backupDir, phaseA: { total: 0, updated: 0, skippedFilled: 0, unmapped: [] }, phaseB: { phases: [...TRIAL_PHASES], total: 0, updated: 0, skippedAlready: 0, samples: [] } };

  // ── P1-a 角色映射 ──────────────────────────────────────────────────────────
  const codeByTitle = readJson(path.join(HERE, 'p1-role-mapping.json'));
  for (const p of tpl.phases) {
    for (const t of p.tasks) {
      result.phaseA.total += 1;
      if (t.assigneeRoleCode) { result.phaseA.skippedFilled += 1; continue; }
      const code = codeByTitle[t.title];
      if (!code) { result.phaseA.unmapped.push(t.title); continue; }
      await prisma.templateTask.update({ where: { id: t.id }, data: { assigneeRoleCode: code } });
      result.phaseA.updated += 1;
    }
  }
  console.log(`[P1-a] 角色映射：写入 ${result.phaseA.updated}/${result.phaseA.total}，跳过已填 ${result.phaseA.skippedFilled}，未映射 ${result.phaseA.unmapped.length}`);

  // ── P1-b 交付物追加（试批 p1/p3/p8）───────────────────────────────────────
  const suggestionById = readJson(path.join(HERE, 'p1-suggestions.json'));

  let cfg = typeof tpl.config === 'string' ? JSON.parse(tpl.config) : JSON.parse(JSON.stringify(tpl.config));
  const removedConfigKeys = [];

  for (const p of tpl.phases) {
    if (!TRIAL_PHASES.has(p.code)) continue;
    for (const t of p.tasks) {
      const s = suggestionById[t.id];
      if (!s) continue;
      result.phaseB.total += 1;
      const before = t.expectedDeliverable || '';
      const acc = (s.acceptance || '').trim();
      const pre = (s.prerequisite || '').trim();
      const addition = [
        acc ? `[验收] ${acc}` : '',
        pre && pre !== '无' ? `[前置] ${pre}` : '',
      ].filter(Boolean).join('\n');
      if (!addition) continue;
      if (before.includes('[验收]')) { result.phaseB.skippedAlready += 1; continue; }
      const after = before ? `${before}\n${addition}` : addition;
      await prisma.templateTask.update({ where: { id: t.id }, data: { expectedDeliverable: after } });
      result.phaseB.updated += 1;
      if (result.phaseB.samples.length < 3) result.phaseB.samples.push({ phase: p.code, title: t.title, before: before.slice(0, 60), after: after.slice(0, 220) });
      // 同步删除 config 中该任务的 expectedDeliverable 键（让结构化行成为投影来源）
      const cph = (cfg.phases || []).find((x) => x.id === p.id);
      const ct = cph && Array.isArray(cph.tasks) ? cph.tasks.find((x) => x.id === t.id) : null;
      if (ct && 'expectedDeliverable' in ct) { delete ct.expectedDeliverable; removedConfigKeys.push(t.id); }
    }
  }
  console.log(`[P1-b] 交付物追加（${[...TRIAL_PHASES].join('/')}）：更新 ${result.phaseB.updated}，跳过已有 ${result.phaseB.skippedAlready}；同步移除 config 键 ${removedConfigKeys.length} 个`);

  // ── 写回 config（仅删除相关键，其余原样） ─────────────────────────────────
  if (removedConfigKeys.length > 0) {
    await prisma.projectTemplate.update({ where: { id: tpl.id }, data: { config: cfg } });
    fs.writeFileSync(path.join(backupDir, 'template-config-after.json'), JSON.stringify(cfg, null, 2));
    console.log(`[config] 已写回（仅移除 ${removedConfigKeys.length} 个 expectedDeliverable 键，其余不变）`);
  }

  // ── 只读复验 ───────────────────────────────────────────────────────────────
  const after = await prisma.projectTemplate.findUnique({
    where: { code: TEMPLATE_CODE },
    include: { phases: { include: { tasks: true } } },
  });
  const all = after.phases.flatMap((p) => p.tasks);
  result.verify = {
    roleFilled: all.filter((t) => t.assigneeRoleCode).length,
    roleTotal: all.length,
    deliverableWithAcceptance: all.filter((t) => (t.expectedDeliverable || '').includes('[验收]')).length,
  };
  console.log('[复验] 角色已填:', result.verify.roleFilled + '/' + result.verify.roleTotal,
    '| 含[验收]交付物:', result.verify.deliverableWithAcceptance);

  fs.writeFileSync(path.join(HERE, 'evidence', `p1-apply-result-${ts}.json`), JSON.stringify(result, null, 2));
  console.log('[证据] evidence/p1-apply-result-' + ts + '.json');
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
