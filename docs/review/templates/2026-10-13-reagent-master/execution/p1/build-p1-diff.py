#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P1 轻量母版：新版草案与差异预览生成器（2026-10-14）

依据 SYNTHESIS_V2.md 第 10 节「实施时仍须保护在研项目，先做新版草案和差异预览，
不自动重写旧项目证据」——本脚本只生成差异预览与计划，不写入任何数据库。

输入（只读）：
  - task-review.csv        65 项任务逐条建议（分析方产出，非本次编造）
  - platform-checklist.csv 23 项平台检查建议
  - tier-matrix.csv        A/B/C 分级矩阵建议
  - evidence/master-tasks-now.tsv  生产母版 65 项任务现状（只读导出）
输出：本目录下 p1-diff-*.csv / p1-five-records-mapping.csv / p1-plan.md 等
"""
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REVIEW = os.path.abspath(os.path.join(HERE, '..', '..'))
NOW_TSV = os.path.join(HERE, 'evidence', 'master-tasks-now.tsv')


def read_csv(path):
    with open(path, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def read_now():
    """生产母版任务现状：id -> dict"""
    rows = {}
    if not os.path.exists(NOW_TSV):
        return rows
    with open(NOW_TSV, encoding='utf-8') as f:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) < 8:
                continue
            rows[p[0]] = {
                'phaseCode': p[1], 'phaseName': p[2], 'title': p[3],
                'applicability': p[4], 'deliverable': p[5],
                'roleCode': p[6], 'hours': p[7],
            }
    return rows


def w(path, header, rows):
    with open(os.path.join(HERE, path), 'w', newline='', encoding='utf-8-sig') as f:
        cw = csv.writer(f)
        cw.writerow(header)
        cw.writerows(rows)
    print(f'  {path}: {len(rows)} 行')


def main():
    reviews = read_csv(os.path.join(REVIEW, 'task-review.csv'))
    checklist = read_csv(os.path.join(REVIEW, 'platform-checklist.csv'))
    tiers = read_csv(os.path.join(REVIEW, 'tier-matrix.csv'))
    now = read_now()
    print(f'输入：task-review={len(reviews)} 行，platform-checklist={len(checklist)} 行，'
          f'tier-matrix={len(tiers)} 行，生产现状={len(now)} 行')

    # ① 角色映射差异
    rows = []
    for r in reviews:
        tid = r['sourceTaskId']
        cur = now.get(tid, {})
        rows.append([
            r['sourcePhaseCode'], r['sourcePhaseName'], r['sourceTaskTitle'],
            cur.get('roleCode', '') or '(空)',
            r['recommendedRole'] or '(未建议)',
            'FILL_ROLE' if not (cur.get('roleCode') or '') else 'KEEP_OR_REVIEW',
            r['proposalStatus'],
        ])
    w('p1-diff-role.csv',
      ['phaseCode', 'phaseName', 'taskTitle', 'currentRoleCode', 'recommendedRole', 'action', 'proposalStatus'],
      rows)

    # ② 交付物 / 验收 / 前置差异
    rows = []
    for r in reviews:
        tid = r['sourceTaskId']
        cur = now.get(tid, {})
        cur_deliv = (cur.get('deliverable') or '').strip()
        rec_deliv = (r['recommendedDeliverable'] or '').strip()
        if not cur_deliv and not rec_deliv:
            diff = 'BOTH_EMPTY'
        elif not cur_deliv:
            diff = 'FILL_FROM_RECOMMENDATION'
        elif not rec_deliv:
            diff = 'KEEP_CURRENT'
        elif cur_deliv == rec_deliv:
            diff = 'SAME'
        else:
            diff = 'REVIEW_DIFF'
        rows.append([
            r['sourcePhaseCode'], r['sourceTaskTitle'], cur_deliv[:120], rec_deliv[:160],
            r['recommendedAction'], r['recommendedLocation'],
            r['acceptanceProposal'][:120], r['prerequisiteProposal'][:120],
            diff, r['proposalStatus'],
        ])
    w('p1-diff-deliverable.csv',
      ['phaseCode', 'taskTitle', 'currentDeliverable', 'recommendedDeliverable',
       'recommendedAction', 'recommendedLocation', 'acceptanceProposal', 'prerequisiteProposal',
       'diffClass', 'proposalStatus'],
      rows)

    # ③ 平台检查表落点差异（DMF 专项嵌入现有任务）
    rows = []
    for c in checklist:
        rows.append([
            c['id'], c['topic'], c['existingTaskLocation'], c['riskQuestion'],
            c['minimumCheckProposal'], c['enhancementTrigger'], c['acceptanceFormProposal'],
            c['applicability'], c['requirementClass'], c['status'],
        ])
    w('p1-diff-checklist.csv',
      ['checkId', 'topic', 'existingTaskLocation', 'riskQuestion', 'minimumCheckProposal',
       'enhancementTrigger', 'acceptanceFormProposal', 'applicability', 'requirementClass', 'status'],
      rows)

    # ④ 五类核心资料 → 承载位置映射（来自 SYNTHESIS_V2 4.1）
    five = [
        ['项目一页卡', '用途/样本/靶标/结果解释、交付状态、关键需求、A/B/C 选择、限制', 'p1＋p2 范围', 'p1/p2'],
        ['试验计划与结果总表', '每项问题、版本/批次/样本、控制、预定判断、数据位置、结论和异常', 'p5–p11；引用实验系统原始文件，不重复抄写', 'p5-p11'],
        ['系统版本基线单', '试剂/引物探针/芯片/程序/算法/操作文件及复用平台版本', 'p3/p7/p12 版本', 'p3/p7/p12'],
        ['问题、风险与变更台账', '产品风险与项目风险分栏；责任、措施、验证影响及关闭依据', 'p2 风险/变更＋各阶段异常', 'p2 + 各阶段'],
        ['决策与交付记录包', '是否推进/试用/发布、依据和限制；对应版本的操作说明及交接', '评审、客户试用、发布、归档', 'p4/p8/p11/p12/p13'],
    ]
    w('p1-five-records-mapping.csv',
      ['record', 'minimumContent', 'existingTaskMapping', 'relatedPhases'],
      five)

    # ⑤ 五个关键决策位置（4.2）
    gates = [
        ['G0 启动', '要解决什么问题、用于哪里、最后交付什么状态', 'p1', 'A/B/C 均需'],
        ['G1 配置确认', '对将要评价的系统版本、样本及判读规则达成一致', 'p3', 'A/B/C 均需'],
        ['G2 证据结论', '已有试验是否支持当前范围，失败和未覆盖怎样处理', 'p8-p10', 'A 可与 G4 合并'],
        ['G3 外部使用决定', '是否允许限定试用或正式交付，使用文件和支持是否齐备', 'p11-p12', '进入外部试用必须独立明确'],
        ['G4 移交', '当前证据、问题及后续观察由谁接收', 'p13', 'A 可与 G2 合并'],
    ]
    w('p1-gates-mapping.csv', ['gate', 'content', 'relatedPhase', 'tierNote'], gates)

    # ⑥ A/B/C 建议定义（4.3，待确认，不擅自改写项目旧等级）
    tiers_rows = [[t['dimension'], t['A_proposal'], t['B_proposal'], t['C_proposal'],
                   t['reassessmentTrigger'], t['requirementClass'], t['status']] for t in tiers]
    w('p1-tier-definition.csv',
      ['dimension', 'A_proposal', 'B_proposal', 'C_proposal',
       'reassessmentTrigger', 'requirementClass', 'status'],
      tiers_rows)

    # 统计摘要
    summary = {
        'reviews': len(reviews),
        'checklist': len(checklist),
        'tierDimensions': len(tiers),
        'currentRoleFilled': sum(1 for v in now.values() if (v.get('roleCode') or '').strip()),
        'currentDeliverableFilled': sum(1 for v in now.values() if (v.get('deliverable') or '').strip()),
        'diffClassCounts': {},
    }
    for r in reviews:
        cur = now.get(r['sourceTaskId'], {})
        cur_deliv = (cur.get('deliverable') or '').strip()
        rec = (r['recommendedDeliverable'] or '').strip()
        k = 'BOTH_EMPTY' if (not cur_deliv and not rec) else (
            'FILL_FROM_RECOMMENDATION' if not cur_deliv else (
                'KEEP_CURRENT' if not rec else ('SAME' if cur_deliv == rec else 'REVIEW_DIFF')))
        summary['diffClassCounts'][k] = summary['diffClassCounts'].get(k, 0) + 1
    with open(os.path.join(HERE, 'evidence', 'p1-diff-summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print('  差异摘要：', json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    sys.exit(main())
