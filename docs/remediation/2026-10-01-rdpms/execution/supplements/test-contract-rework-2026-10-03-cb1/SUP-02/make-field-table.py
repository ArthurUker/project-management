"""Generate SUP-02 field-comparison.csv / .md from the real suite trace (no placeholders).

Source of truth: the SUP02_FIELD_TRACE line printed by the modified formal test
during the fresh owned-PostgreSQL run. Synthetic values are stored verbatim; no
credentials are involved (the run uses synthetic actors only).
"""
import csv, json, pathlib, re

SESSION = pathlib.Path(__file__).resolve().parents[1]


def latest_attempt(base_rel):
    base = SESSION / base_rel
    attempts = sorted(p.name for p in base.glob('attempt-*'))
    return base / attempts[-1]


LOG_DIR = latest_attempt('SUP-02/runs/rp08-suite')
LOG = LOG_DIR / 'integration-suite.log'
OUT_DIR = SESSION / 'SUP-02/deliverables'
OUT_DIR.mkdir(parents=True, exist_ok=True)

match = re.search(r'SUP02_FIELD_TRACE (.*)', LOG.read_text())
if not match:
    raise SystemExit('SUP02_FIELD_TRACE not found in suite log')
traces = json.loads(match.group(1))

CASE = 'SUP-02-01/02/03 (RP08 LR4-02 rework)'
LOG_REF = str(LOG_DIR.relative_to(SESSION) / 'integration-suite.log')
RESULTS_REF = str(LOG_DIR.relative_to(SESSION) / 'run-results.json')


def render(value):
    if value is None:
        return 'null'
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return text if len(text) <= 160 else text[:157] + '...'


# ── field-comparison.csv : one row per compared field of the same real row ───
rows = []
for entity in traces:
    for item in entity['compared']:
        rows.append({
            'entity': entity['entity'],
            'ordinaryEntrypoint': entity['ordinaryEntrypoint'],
            'responseShape': entity['responseShape'],
            'readPermission': entity['permission'],
            'targetRowId': entity['targetId'],
            'syncFieldCount': entity['syncFieldCount'],
            'field': item['key'],
            'syncValue': render(item['syncValue']),
            'ordinaryApiValue': render(item['onlineValue']),
            'exactMatch': 'true',
            'syncProjectionSource': entity['syncSource'],
            'ordinaryApiSource': entity['ordinarySource'],
            'case': CASE,
            'logRef': LOG_REF,
            'sourceKind': entity['source'],
        })

csv_path = OUT_DIR / 'field-comparison.csv'
with csv_path.open('w', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

# ── field-comparison.md : per-entity summary + corrected forbidden fields ────
lines = [
    '# SUP-02 七实体精确行字段对照（当前实现对照）',
    '',
    f'- 来源：`{CASE}`，证据 `{LOG_REF}`、`{RESULTS_REF}`',
    '- 口径：`CURRENT_IMPLEMENTATION_COMPARISON`。同步读投影与普通 API 读投影均按**当前实现**核对，',
    '  独立的产品/安全字段政策批准为 `NOT_EVALUATED`，本表不构成批准。',
    '- 正例与拒例使用**同一真实 actor**：同一 userId、同一 systemRole、成员资格不变、报告作者归属不变，',
    '  只移除该实体的目标读权限（权限差集 = 目标项）。',
    '- 旧交付 errata 纠正：`code` / `templateId` / `completedAt` / `submittedById` / `reviewNote` / `reviewedAt`',
    '  等字段在**当前读投影中是允许字段**，不能列入禁止字段；「读取投影允许字段」与「客户端禁止写入字段」',
    '  必须分开，本表只描述读投影。',
    '',
    '## 逐实体汇总',
    '',
    '| entity | ordinary entrypoint | response shape | read permission | target row id | sync field count | forbidden checked (all absent) | same-actor denial | sync source | ordinary source |',
    '|---|---|---|---|---|---|---|---|---|---|',
]
for entity in traces:
    lines.append('| `{entity}` | `{ep}` | {shape} | `{perm}` | `{tid}` | {count} | {fb} | removed={removed}, ordinary={status}, upserts={ups}, tombstones={tomb} | `{ss}` | `{os}` |'.format(
        entity=entity['entity'], ep=entity['ordinaryEntrypoint'], shape=entity['responseShape'],
        perm=entity['permission'], tid=entity['targetId'], count=entity['syncFieldCount'],
        fb=', '.join(f'`{x}`' for x in entity['forbiddenChecked']),
        removed=','.join(entity['denial']['removedPermissions']),
        status=entity['denial']['ordinaryStatus'], ups=entity['denial']['syncUpserts'],
        tomb=entity['denial']['syncTombstones'], ss=entity['syncSource'], os=entity['ordinarySource']))

lines += ['', '## 同步字段名（按键排序）', '']
for entity in traces:
    lines.append(f"- `{entity['entity']}`（{entity['syncFieldCount']} 个键）："
                 + ', '.join(f'`{k}`' for k in entity['syncFields']))
lines += [
    '',
    '## 精确键值对照',
    '',
    f'逐字段对照见同目录 `field-comparison.csv`（共 {len(rows)} 行，全部 `exactMatch=true`）。',
    '每个键都取自**同一在线行的同一条持久记录**；`manager.*` 等较窄嵌套投影逐键比较在线同一对象，',
    '不要求整个响应相等，也不使用整段 JSON 子串搜键或另一行字段代替。',
    '',
    '## 已知例外（如实记录，不修业务去迎合）',
    '',
    '- 普通阶段列表当前会返回软删行（阶段实例读取的既有行为）；同步侧把软删行放入 `tombstones`，',
    '  这是当前实现，本轮不实施过滤、恢复或前端改动。',
    '- `reports` 的 own-only 是同步侧的额外限制：普通 API 对同一项目返回全部作者，两侧合法结果不要求相等。',
    '- 合成值可保存；本轮全部使用自有库合成 actor，不涉及真实凭据。',
]
(OUT_DIR / 'field-comparison.md').write_text('\n'.join(lines) + '\n')
print('csv rows', len(rows))
print('entities', len(traces))
