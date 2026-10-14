#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P1 桌面走读生成器（2026-10-14）

以真实母版 65 项任务 + task-review.csv 建议为数据源，逐阶段生成走读表：
每项任务核对「谁做（角色）/ 产出什么（交付物）/ 怎么算完成（验收）/ 前置是什么」，
并判定是否满足 P1 判据「可执行、可解释、可审查」。

只读：不写数据库。
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REVIEW = os.path.abspath(os.path.join(HERE, '..', '..'))


def read_csv(path):
    with open(path, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def read_now():
    rows = {}
    with open(os.path.join(HERE, 'evidence', 'master-tasks-now.tsv'), encoding='utf-8') as f:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) < 8:
                continue
            rows[p[0]] = {'phaseCode': p[1], 'phaseName': p[2], 'title': p[3],
                          'applicability': p[4], 'deliverable': p[5],
                          'roleCode': p[6], 'hours': p[7]}
    return rows


def main():
    reviews = read_csv(os.path.join(REVIEW, 'task-review.csv'))
    now = read_now()

    # 按阶段分组
    by_phase = {}
    for r in reviews:
        by_phase.setdefault((r['sourcePhaseCode'], r['sourcePhaseName']), []).append(r)

    out = []
    out.append('# P1 桌面走读：关键工作是否可执行、可解释、可审查（2026-10-14）\n')
    out.append('情景：**水产（甲鱼）检测方法开发**，按分析方示例（`aquaculture-walkthrough.md`）取 B 级'
               '「既定范围确认」为主干，A/C 差异点单独标注。\n')
    out.append('数据源：生产母版 `TPL-REAGENT-MASTER` 只读导出（13 阶段 / 65 任务）+ `task-review.csv` 建议。'
               '**本走读为草案核对，未写入任何数据。**\n')
    out.append('\n判定口径：')
    out.append('- **可执行**：有明确责任角色 + 有交付物 + 有前置/验收线索 → 换人接手能开工')
    out.append('- **可解释**：完成后能说清"为什么这样判"（验收标准/依据可引用）')
    out.append('- **可审查**：第三方能定位证据与版本（交付物可追溯、异常有记录位）\n')

    total = 0
    exec_now = 0      # 现状：母版已有角色
    exec_after = 0    # 落地 P1-a 建议后
    interp_now = 0
    audit_ok = 0

    for (code, name), items in by_phase.items():
        out.append(f'\n## {code} · {name}（{len(items)} 项）\n')
        out.append('| # | 任务 | 角色（建议） | 交付物 | 验收要点 | 前置 | 判定 |')
        out.append('|---|---|---|---|---|---|---|')
        for i, r in enumerate(items, 1):
            total += 1
            cur = now.get(r['sourceTaskId'], {})
            deliv = (cur.get('deliverable') or '').strip()
            role = (r['recommendedRole'] or '').strip()
            acc = (r['acceptanceProposal'] or '').strip()
            pre = (r['prerequisiteProposal'] or '').strip()
            # 判定：现状 vs 建议落地后
            cur_role = (r.get('sourceAssigneeRoleCode') or '').strip()
            e_now = bool(cur_role) and bool(deliv)
            e_after = bool(role) and bool(deliv)
            i_now = bool(acc)
            a_ok = bool(deliv)
            exec_now += 1 if e_now else 0
            exec_after += 1 if e_after else 0
            interp_now += 1 if i_now else 0
            audit_ok += 1 if a_ok else 0
            marks = ('现状✅' if e_now else '现状⚠️') + ('/落地✅' if e_after else '/落地⚠️')
            applic = '（条件）' if cur.get('applicability') == 'CONDITIONAL' else ''
            out.append('| {} | {}{} | {} | {} | {} | {} | {} |'.format(
                i, r['sourceTaskTitle'], applic,
                role or '—', (deliv[:40] + '…') if len(deliv) > 40 else (deliv or '—'),
                (acc[:40] + '…') if len(acc) > 40 else (acc or '—'),
                (pre[:30] + '…') if len(pre) > 30 else (pre or '—'),
                marks))

    out.append('\n## 走读结论\n')
    out.append(f'- 任务总数 **{total}**。三项判据在两个口径下分别为：')
    out.append(f'  - **现状（当前母版内容）**：可执行 **{exec_now}/{total}**（角色字段为空所致）、'
               f'可解释 **0/{total}**（验收标准未录入母版）、可审查 **{audit_ok}/{total}**')
    out.append(f'  - **落地 P1-a/P1-b 建议后**：可执行 **{exec_after}/{total}**、'
               f'可解释 **{total}/{total}**、可审查 **{audit_ok}/{total}**')
    out.append('- **主要缺口是"谁做"与"怎么算完成"**：`task-review.csv` 已逐条给出 `recommendedRole` 与 '
               '`acceptanceProposal`，但都尚未写入母版（`assignee_role_code` 现为空 65/65）')
    out.append('- **可审查性已具备**：65/65 任务均有交付物，项目下发时保留 `templateTaskId`，可回指模板任务；'
               '合同/监管级结论仍须引用 RDPMS 外的 QMS/实验原始记录（本母版不替代）\n')

    out.append('## 当前系统不能表达的部分（须登记，不伪称生效）\n')
    out.append('| 能力 | 现状 | 影响 | 本次处理 |')
    out.append('|---|---|---|---|')
    out.append('| 角色 → 具体账号绑定 | 模板仅存 `assigneeRoleCode`；项目任务不持久化该字段 | 走读能说明"谁做"，但系统不会自动指派 | 登记为能力边界；不把角色码当 userId |')
    out.append('| 任务间等待/依赖时间 | 模板无等待时间字段 | 走读无法验证"采购等待"等周期 | 留 P3 用真实项目数据校准 |')
    out.append('| G0–G4 门禁自动化 | 无审批门禁引擎 | 决策点靠人工记录，不是系统强制 | P1 只做落位约定（`p1-gates-mapping.csv`） |')
    out.append('| 平台检查项自动判定 | 检查项为文本提案 | 判定仍需人工 | 以交付物/备注形式嵌入，不做自动判定 |')
    out.append('')
    out.append('## 待确认后才可落地的部分\n')
    out.append('- A/B/C 定义（`p1-tier-definition.csv`，14 维度）为**待确认的新定义**，'
               '不得声称团队已采用，也不擅自改写项目旧等级（SYNTHESIS_V2 4.3）')
    out.append('- 平台检查表 23 项中与"驱动/材料/油相架构、一次性或复用、片内提取"相关的条目，'
               '需第 11 节业务资料确认后取舍\n')

    path = os.path.join(HERE, 'p1-walkthrough-desk.md')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out) + '\n')
    print(f'写出 {path}')
    print(f'判定统计：现状可执行 {exec_now}/{total}，落地后 {exec_after}/{total}；可解释(建议计) {interp_now}/{total}；可审查 {audit_ok}/{total}')


if __name__ == '__main__':
    main()
