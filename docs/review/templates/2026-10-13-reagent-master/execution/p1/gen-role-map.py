#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P1-a 角色码映射草案（2026-10-14）

把 task-review.csv 的 recommendedRole（自然语言）映射为母版 4 个模板角色码，
供落地 P1-a（写入 template_tasks.assignee_role_code）前审阅。

映射规则（**需确认**）：按「主责优先」顺序命中即取
  owner（项目/产品）> tech_lead（技术/研发）> reviewer（质量/法规/审核）> member（试验/操作/成员）
原始建议文本完整保留在 recommendedRoleText 列，便于人工复核与改写。
只读生成，不写数据库。
"""
import csv
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REV = os.path.abspath(os.path.join(HERE, '..', '..'))

RULES = [
    ('owner', ('产品/项目', '项目/产品', '产品负责人', '项目负责人', '项目管理', '项目')),
    ('tech_lead', ('技术/研发', '技术负责人', '研发', '技术', '设计开发', '设计')),
    ('reviewer', ('质量/法规', '质量', '法规', '审核', '批准', '复核')),
    ('member', ('试验/操作', '试验', '实验', '操作', '成员', '检验', '检测')),
]


def to_code(text):
    t = (text or '').strip()
    if not t:
        return '', ''
    for code, keys in RULES:
        for k in keys:
            if k in t:
                return code, k
    return '', ''


def main():
    rows = []
    with open(os.path.join(REV, 'task-review.csv'), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            code, hit = to_code(r['recommendedRole'])
            rows.append([
                r['sourcePhaseCode'], r['sourcePhaseName'], r['sourceTaskTitle'],
                r['recommendedRole'], code or '(需人工判定)', hit,
                'PROPOSED_NOT_IMPLEMENTED',
            ])
    path = os.path.join(HERE, 'p1-role-code-mapping.csv')
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['phaseCode', 'phaseName', 'taskTitle', 'recommendedRoleText',
                    'proposedRoleCode', 'matchedKeyword', 'status'])
        w.writerows(rows)
    c = Counter(r[4] for r in rows)
    print('写出 p1-role-code-mapping.csv:', len(rows), '行')
    print('角色码分布:', dict(c))
    need = [r[2] for r in rows if r[4].startswith('(')]
    if need:
        print('需人工判定（未命中规则）:', len(need), '条 ->', need[:8])


if __name__ == '__main__':
    main()
