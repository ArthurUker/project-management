#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P1-c 平台检查项 → 母版任务 映射 dry-run（2026-10-14）

输入：platform-checklist.csv（23 项，existingTaskLocation 形如 "p7 液滴与磁珠操作调试"）
      evidence/master-tasks-now.tsv（母版 65 任务现状）
策略：提取 p<N> 阶段 + 中文描述，与该阶段任务标题做字符二元组（bigram）重叠打分；
      仅当最高分任务**明显领先**第二名且达到阈值时判定「可唯一映射」。
只读：不写数据库。输出匹配率与样例，供决定是否落地。
"""
import csv
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REV = os.path.abspath(os.path.join(HERE, '..', '..'))


def bigrams(s):
    s = re.sub(r'\s+', '', s or '')
    return {s[i:i + 2] for i in range(len(s) - 1)} if len(s) >= 2 else ({s} if s else set())


def main():
    tasks = []
    with open(os.path.join(HERE, 'evidence', 'master-tasks-now.tsv'), encoding='utf-8') as f:
        for line in f:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 8:
                tasks.append({'id': p[0], 'phaseCode': p[1], 'phaseName': p[2], 'title': p[3]})
    by_phase = {}
    for t in tasks:
        by_phase.setdefault(t['phaseCode'], []).append(t)

    rows = list(csv.DictReader(open(os.path.join(REV, 'platform-checklist.csv'), encoding='utf-8-sig')))
    out = []
    unique = 0
    for r in rows:
        loc = r['existingTaskLocation'] or ''
        codes = re.findall(r'p(\d{1,2})', loc)
        codes = ['p' + c for c in codes]
        desc = re.sub(r'p\d{1,2}', '', loc).strip('；;，, ')
        desc_bg = bigrams(desc)
        best = []
        for code in codes:
            for t in by_phase.get(code, []):
                score = len(desc_bg & bigrams(t['title'])) / max(1, len(desc_bg))
                best.append((score, code, t['title'], t['id']))
        best.sort(reverse=True)
        top = best[0] if best else None
        second = best[1] if len(best) > 1 else None
        ok = bool(top and top[0] >= 0.3 and (not second or top[0] - second[0] >= 0.15))
        if ok:
            unique += 1
        out.append((r['id'], loc, (top[2] + ' / ' + top[1]) if top else '(无候选)',
                    round(top[0], 2) if top else 0, 'UNIQUE' if ok else 'AMBIGUOUS_OR_NONE'))

    print(f'检查项 {len(rows)} 项；可唯一映射 {unique} 项；待人工判定 {len(rows) - unique} 项\n')
    print(f"{'ID':<8}{'现有位置':<34}{'候选任务':<30}{'得分':<7}判定")
    for cid, loc, cand, sc, verdict in out:
        print(f'{cid:<8}{loc[:32]:<34}{cand[:28]:<30}{sc:<7}{verdict}')


if __name__ == '__main__':
    main()
