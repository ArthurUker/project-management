"""Deliverables part 1: SUP-01 and SUP-02 seven-type artifacts."""
import json, pathlib, re

SESSION = pathlib.Path(__file__).resolve().parents[0]


def latest_attempt(base_rel):
    base = SESSION / base_rel
    attempts = sorted(p.name for p in base.glob('attempt-*'))
    return base / attempts[-1]


RP10_DIR = latest_attempt('SUP-01/runs/rp10-suite')
RP08_DIR = latest_attempt('SUP-02/runs/rp08-suite')
RP10_REF = str(RP10_DIR.relative_to(SESSION))
RP08_REF = str(RP08_DIR.relative_to(SESSION))
RP10_RESULTS = json.loads((RP10_DIR / 'run-results.json').read_text())
RP08_RESULTS = json.loads((RP08_DIR / 'run-results.json').read_text())
RP10_LOG = (RP10_DIR / 'integration-suite.log').read_text()
RP08_LOG = (RP08_DIR / 'integration-suite.log').read_text()


def trace(log, marker):
    match = re.search(re.escape(marker) + r' (.*)', log)
    return json.loads(match.group(1)) if match else None


primitive = trace(RP10_LOG, 'SUP01_PRIMITIVE_TRACE')
restore = trace(RP10_LOG, 'SUP01_RESTORE_SUBMIT_TRACE')
settle = trace(RP10_LOG, 'SUP01_SETTLE_TRACE')
fields = trace(RP08_LOG, 'SUP02_FIELD_TRACE')


def suite_summary(log):
    def num(label):
        match = re.search(rf'ℹ {label} (\d+)', log)
        return int(match.group(1)) if match else None
    return {'tests': num('tests'), 'pass': num('pass'), 'fail': num('fail')}


RP10_SUMMARY = suite_summary(RP10_LOG)
RP08_SUMMARY = suite_summary(RP08_LOG)


def write(path, text):
    target = SESSION / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text if text.endswith('\n') else text + '\n')


def write_json(path, payload):
    write(path, json.dumps(payload, ensure_ascii=False, indent=2))


# ══ SUP-01 ══════════════════════════════════════════════════════════════════
write_json('SUP-01/authorization.json', {
    'supplementId': 'SUP-01', 'parentTaskIds': ['RP10-T02'], 'kind': 'TEST_ONLY',
    'originalFinding': 'LR4-03', 'currentFindings': ['LR5-01', 'LR5-04', 'LR5-05'],
    'sessionId': SESSION.name, 'executor': 'CodeBuddy',
    'userInstructionSource': 'execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md',
    'allowedWrites': [
        'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs',
        'docs/remediation/2026-10-01-rdpms/execution/supplements/test-contract-rework-2026-10-03-cb1/ (new only)',
    ],
    'businessSourceChangesAuthorized': False,
    'resourceOwnership': RP10_RESULTS['ownedResources'],
    'commandsRun': [c['label'] for c in RP10_RESULTS['commands']],
    'stopConditions': ['SUP-01 rework delivered and sealed', 'independent review pending'],
})

write('SUP-01/change-summary.md', '''# SUP-01 变更摘要（TEST_ONLY）

唯一修改的正式测试：`rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
（起始副本与 sha256 存于 session 根 `evidence/start-copies/`；业务源码改动数 = 0）。

## 1. 屏障统一（LR5-01 第 1–4 项）

- 新增本文件局部受控工具 `gateReportWrite(base, methods, match, options)`，替换旧的单原语
  `gatedClient` / `gateOnReportMethod` / `gateOnReportMethods`；支持 create/upsert/update/updateMany。
- `writeTargetOf(method, args)`：按原语真实形状取参（create→data；upsert→where/create/update；
  update/updateMany→where/data）。
- `matchReportWrite({ reportId, periodKey, marker })`：必须命中「报告 id」或
  「业务唯一键 projectId+authorId+reportType+periodKey」，并命中唯一 payload 标记（content.revision）。
  墓碑恢复写入没有 `data.periodKey` 时通过 `where.id` 仍命中。
- 迁移的旧调用点：A02、A03、A03b、A04b、A06b 及三条草稿保存竞争的 `draftWriteBarrier`
  （保持 `{ client, barrier, fired }` 形状，断言未改）。

## 2. 新增 / 加固的用例

| 用例 | 内容 |
|---|---|
| SUP-01-01 | HTTP 层多原语屏障命中真实 create 写入窗口；赢家 201 + submit 200 后迟到 409 DUPLICATE_PERIOD_KEY |
| SUP-01-01b | 四原语兼容矩阵：create/upsert/updateMany/update 各自独立真实命中，记录 method/目标/命中/释放/持久结果 |
| SUP-01-02 | 墓碑迟到恢复 → 赢家恢复 201 + submit 200 → 放行迟到恢复 409 CONFLICT（新增正式用例） |
| SUP-01-03 | 真实 DB SEMANTIC_NEGATIVE_CONTROL：仅把匹配迟到 create 在测试适配层转真实无条件 upsert |
| SUP-01-04 | 屏障之后中途失败时仍 finally 释放并收束挂起请求/事务 |

## 3. 收束与失败处理

- 相关并发用例改为 `try { ... } finally { await settleGate(gate, pending) }`；`reachBarrier` 的 timer 清理保持。
- BARRIER_NOT_REACHED（超时）与「控制没有产生坏状态」「正常业务失败」分开登记；超时不算缺陷复现。

## 4. 未做

- 未修改业务源码、未临时改源码做负对照、未放宽断言、未跳过或删除原断言。
- 未执行五项源码回退控制（本轮指令明确无需扩成五项）。
''')

write_json('SUP-01/evidence/primitive-matrix.json', {
    'kind': 'REAL_OWNED_DB_TRACE', 'case': 'SUP-01-01b',
    'database': RP10_RESULTS['ownedResources']['database'],
    'logRef': RP10_REF + '/integration-suite.log',
    'note': '四种写入原语各自独立真实命中（不是 create 命中后内部调用 upsert 充数）',
    'traces': primitive,
})
write_json('SUP-01/evidence/restore-submit-race.json', {
    'kind': 'REAL_OWNED_DB_TRACE', 'case': 'SUP-01-02',
    'logRef': RP10_REF + '/integration-suite.log',
    'trace': restore,
    'meaning': '墓碑恢复后 submit 先完成的正式竞争：迟到恢复受控 409 CONFLICT，正文/版本/审计未被覆盖',
})
write_json('SUP-01/evidence/settle-control.json', {
    'kind': 'REAL_OWNED_DB_TRACE', 'case': 'SUP-01-04',
    'logRef': RP10_REF + '/integration-suite.log',
    'trace': settle,
    'meaning': '屏障后中途失败仍释放并收束；挂起请求完成（201），不留悬挂请求/事务',
})
write_json('SUP-01/evidence/semantic-negative-control.json', {
    'kind': 'SEMANTIC_NEGATIVE_CONTROL', 'case': 'SUP-01-03',
    'scope': '仅把匹配的迟到 create 在测试 DB 适配层转成同事务真实无条件 upsert；业务源码、其他请求与 submit 原样',
    'expectations': ['late 201（非干净 409）', 'SUBMITTED 正文与版本快照分离',
                     '多出一份成功 receipt', '多出一条 create 审计'],
    'meaning': 'exit 0 只表示已识别预期坏结果，不是修复或发布 PASS',
    'logRef': RP10_REF + '/integration-suite.log',
})
write_json('SUP-01/evidence/barrier-migration.json', {
    'unifiedTool': 'gateReportWrite + matchReportWrite + writeTargetOf + settleGate',
    'migratedCallSites': {
        'A02': 'create/upsert + periodKey PERIOD(2) + marker late-new-POST',
        'A03': 'create/upsert + periodKey PERIOD(3) + marker first-writer',
        'A03b': 'create/upsert + periodKey PERIOD(4) + marker create-only-late',
        'A04b': 'updateMany/update/upsert + reportId + marker late-post-existing',
        'A06b': 'updateMany/update/upsert + reportId + marker late-restore',
        'draftWriteBarrier (legacy PUT / modern CAS / sync push)': 'updateMany/update/upsert + reportId + data.content',
        'SUP-01-01': 'all four primitives + periodKey + marker late-new-POST',
        'SUP-01-03': 'create/upsert + periodKey + marker control-late (emulateUpsert)',
    },
    'removedHelpers': ['gatedClient', 'gateOnReportMethod', 'gateOnReportMethods'],
    'assertionsRemovedOrWeakened': 0,
})
write_json('SUP-01/evidence/suite-run.json', {
    'resultsRef': RP10_REF + '/run-results.json',
    'database': RP10_RESULTS['ownedResources']['database'],
    'commands': RP10_RESULTS['commands'],
    'guardContract': RP10_RESULTS['guardContract'],
    'cleanup': RP10_RESULTS['cleanup'],
    'summary': RP10_SUMMARY,
})

write_json('SUP-01/acceptance.json', {
    'supplementId': 'SUP-01', 'parentTaskIds': ['RP10-T02'], 'kind': 'TEST_ONLY',
    'originalFinding': 'LR4-03', 'currentFindings': ['LR5-01', 'LR5-04', 'LR5-05'],
    'cases': [
        {'id': 'SUP-01-01', 'meaning': '原语兼容/实际屏障命中', 'status': 'PASS', 'kind': 'REAL_OWNED_DB',
         'evidence': 'SUP-01/evidence/suite-run.json; SUP-01/evidence/barrier-migration.json'},
        {'id': 'SUP-01-01b', 'meaning': '四原语各自独立真实命中（兼容性矩阵）', 'status': 'PASS',
         'kind': 'REAL_OWNED_DB', 'evidence': 'SUP-01/evidence/primitive-matrix.json'},
        {'id': 'SUP-01-02', 'meaning': '当前两条正常修复竞争（新建 + 恢复后 submit）', 'status': 'PASS',
         'kind': 'REAL_OWNED_DB', 'evidence': 'SUP-01/evidence/restore-submit-race.json; SUP-01/evidence/suite-run.json'},
        {'id': 'SUP-01-03', 'meaning': '真实 DB 语义负对照', 'status': 'PASS',
         'kind': 'SEMANTIC_NEGATIVE_CONTROL', 'evidence': 'SUP-01/evidence/semantic-negative-control.json'},
        {'id': 'SUP-01-04', 'meaning': '完整正式回归 + 释放/收束 + 无范围外改动', 'status': 'PASS',
         'kind': 'REAL_OWNED_DB', 'evidence': 'SUP-01/evidence/settle-control.json; SUP-01/evidence/suite-run.json',
         'detail': '整套件 %s/%s 通过' % (RP10_SUMMARY['tests'], RP10_SUMMARY['pass'])},
    ],
    'requiredChecks': {
        'backend build': 'exit 0', 'typecheck': 'exit 0', 'lint:undefined': 'exit 0', 'git diff --check': 'exit 0',
        'guard check contract': RP10_RESULTS['guardContract']['verdict'],
        'guard drop': RP10_RESULTS['cleanup']['guardDropExit'],
        'cluster stop': RP10_RESULTS['cleanup']['clusterStopExit'],
    },
    'uncovered': ['五项源码回退控制（本轮指令明确无需扩成五项）',
                  'AC-B10-02 / INT-PC03-01 未完成；不采用新 submit 政策',
                  '完整 JWT 链、前端 IDB、目标环境与部署：NOT_RUN'],
    'businessAcceptanceImpact': 'none; RP10-T02 原本地接受不因本轮自动撤销或升级',
})

write('SUP-01/rollback.md', '''# SUP-01 回滚说明（人工撤销范围，不执行）

本轮 SUP-01 的仓库增量只有：

1. `rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
   （起始副本 session 根 `evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start`，
   sha256 `dc5ceb9c9c409453bba2d3357f37eb68cc44e3ef2bcf956107adf330e23ff53b`）。
2. 本 session 的 `SUP-01/` 新增文档、证据与运行目录。
3. 六个受控记录文件中本轮追加的 continuation / handoff 章节 / 版本 entry。

人工撤销：把起始副本覆盖回该测试文件，删除本 session 的 SUP-01 与 runs 目录，
并删除六文件中本轮新增条目（不触碰旧条目）。

`backend/src`、`frontend/src` 本轮零改动，因此**没有业务回滚**；本轮不部署，不存在生产回滚验收。
''')

write_json('SUP-01/task-state.json', {
    'supplementId': 'SUP-01', 'parentTaskIds': ['RP10-T02'], 'parentTaskStatusChanged': False,
    'kind': 'TEST_ONLY', 'originalFinding': 'LR4-03', 'currentFindings': ['LR5-01', 'LR5-04', 'LR5-05'],
    'delivery': {'sevenTypeArtifacts': True, 'evidenceDir': True, 'status': 'DELIVERED'},
    'implementation': {'scope': 'formal report test only', 'srcChanges': 0, 'testFileChanges': 1,
                       'newTestsAdded': 3, 'suiteTests': RP10_SUMMARY['tests'],
                       'status': 'TEST_ONLY_DELIVERED_NOT_A_BUSINESS_FIX'},
    'validation': {'status': 'LOCAL_REAL_DB_PASS', 'suite': RP10_SUMMARY,
                   'checks': {'build': 0, 'typecheck': 0, 'lint:undefined': 0, 'gitDiffCheck': 0},
                   'meaning': '局部真实自有库通过；不等于业务修复验收或发布验收'},
    'independentReview': 'PENDING', 'release': 'NOT_EVALUATED',
    'uncovered': ['AC-B10-02 / INT-PC03-01', '五项源码回退控制', 'JWT 全链 / IDB / 目标环境 / 部署'],
})

write('SUP-01/handoff.md', '# SUP-01 交接（待独立审阅）\n\n'
      '- 类型：TEST_ONLY，父任务 RP10-T02（状态不变），原映射 LR4-03，本轮处理 LR5-01 及共有 LR5-04/05。\n'
      '- 交付：七类产物齐全；evidence 含四原语轨迹、恢复后 submit 竞争、语义负对照、收束控制、屏障迁移表与套件运行记录。\n'
      '- 整套件 ' + str(RP10_SUMMARY['tests']) + '/' + str(RP10_SUMMARY['pass']) +
      ' 通过；四原语独立命中；语义负对照识别到坏状态——均不等于业务修复验收，release = NOT_EVALUATED。\n'
      '- 未覆盖：AC-B10-02 / INT-PC03-01、五项源码回退控制、JWT 全链、IDB、目标环境、部署。\n'
      '- 下一步：等待独立审阅；不自行选择或启动其他任务。\n')

# ══ SUP-02 ══════════════════════════════════════════════════════════════════
write_json('SUP-02/authorization.json', {
    'supplementId': 'SUP-02', 'parentTaskIds': ['RP08-T01'], 'kind': 'TEST_ONLY',
    'originalFinding': 'LR4-02', 'currentFindings': ['LR5-02', 'LR5-04', 'LR5-05'],
    'sessionId': SESSION.name, 'executor': 'CodeBuddy',
    'userInstructionSource': 'execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md',
    'allowedWrites': [
        'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs',
        'docs/remediation/2026-10-01-rdpms/execution/supplements/test-contract-rework-2026-10-03-cb1/ (new only)',
    ],
    'businessSourceChangesAuthorized': False,
    'resourceOwnership': RP08_RESULTS['ownedResources'],
    'commandsRun': [c['label'] for c in RP08_RESULTS['commands']],
    'stopConditions': ['SUP-02 rework delivered and sealed', 'independent review pending'],
})

field_rows = sum(len(r['compared']) for r in fields)
entity_summary = ', '.join('%s(%d)' % (r['entity'], r['syncFieldCount']) for r in fields)
write('SUP-02/change-summary.md', '''# SUP-02 变更摘要（TEST_ONLY）

唯一修改的正式测试：`rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`
（起始副本与 sha256 存于 session 根 `evidence/start-copies/`；业务源码改动数 = 0）。

## 1. 同账号撤权对照（LR5-02 第 3 项）

原用例正例用 member、拒例换成 `fixtures.users.zero`（另一个真实账号），
不能证明“同一合法账号仅失去目标读权限时拒绝”。本轮改为：

- 正例 actor：member + ALL_READ_PERMISSIONS；
- 拒例 actor：**同一 member** + 移除目标权限后的权限集；
- 断言：userId 相同、systemRole 相同、权限差集 `removed == [目标权限]` 且 `added == []`、
  成员资格仍有效（leftAt IS NULL）、reports 目标行作者仍是该 actor。

## 2. 精确行/字段对照保留并加固

- 七实体仍用**活跃目标行**（过滤 deletedAt/leftAt），避免误取 B3 建的墓碑行；
- 逐键逐值 deepEqual；manager 等较窄嵌套投影逐键比较在线同一对象；
- 按真实响应形状解析（members 裸数组 / list-object / single-object），不静默退空集合。

## 3. 字段表纠正（LR5-02 第 6 项）

- 新表按实际读投影与运行结果生成：`deliverables/field-comparison.csv`（FIELDROWS 行逐字段）
  与 `deliverables/field-comparison.md`。
- 纠正旧表误列：code、templateId、completedAt、submittedById、reviewNote、reviewedAt
  在当前**读投影中是允许字段**，不能写成禁止字段；「读取投影允许字段」与「客户端禁止写入字段」分开。
- 每实体登记入口/响应形状/权限/目标 ID/字段数/源码行号/用例与日志引用。
- 来源标 CURRENT_IMPLEMENTATION_COMPARISON；独立产品/安全字段政策批准仍 NOT_EVALUATED。

## 4. 保留的原范围

原 12 条套件全部保留（VIEWER/非成员/零权限/elevated/own-only/撤成员/墓碑/增量），
本轮只改最后一条补充用例，用例总数仍为 SUITETESTS。

七实体字段数：ENTITYSUMMARY。
'''.replace('FIELDROWS', str(field_rows)).replace('SUITETESTS', str(RP08_SUMMARY['tests']))
      .replace('ENTITYSUMMARY', entity_summary))

write_json('SUP-02/evidence/field-trace.json', {
    'kind': 'REAL_OWNED_DB_TRACE', 'case': 'SUP-02-01/02/03',
    'database': RP08_RESULTS['ownedResources']['database'],
    'logRef': RP08_REF + '/integration-suite.log',
    'source': 'CURRENT_IMPLEMENTATION_COMPARISON', 'entities': fields,
})
write_json('SUP-02/evidence/suite-run.json', {
    'resultsRef': RP08_REF + '/run-results.json',
    'database': RP08_RESULTS['ownedResources']['database'],
    'commands': RP08_RESULTS['commands'],
    'guardContract': RP08_RESULTS['guardContract'],
    'cleanup': RP08_RESULTS['cleanup'], 'summary': RP08_SUMMARY,
})

write_json('SUP-02/acceptance.json', {
    'supplementId': 'SUP-02', 'parentTaskIds': ['RP08-T01'], 'kind': 'TEST_ONLY',
    'originalFinding': 'LR4-02', 'currentFindings': ['LR5-02', 'LR5-04', 'LR5-05'],
    'cases': [
        {'id': 'SUP-02-01', 'meaning': '七实体非空相同行', 'status': 'PASS', 'kind': 'REAL_OWNED_DB',
         'evidence': 'SUP-02/evidence/field-trace.json'},
        {'id': 'SUP-02-02', 'meaning': '逐键逐值 + 正确禁止字段', 'status': 'PASS', 'kind': 'REAL_OWNED_DB',
         'evidence': 'SUP-02/deliverables/field-comparison.csv; SUP-02/evidence/field-trace.json'},
        {'id': 'SUP-02-03', 'meaning': '同 actor 仅移除目标读权限', 'status': 'PASS', 'kind': 'REAL_OWNED_DB',
         'evidence': 'SUP-02/evidence/field-trace.json'},
        {'id': 'SUP-02-04', 'meaning': '原套件完整回归及边界', 'status': 'PASS', 'kind': 'REAL_OWNED_DB',
         'evidence': 'SUP-02/evidence/suite-run.json',
         'detail': '整套件 %s/%s 通过，原业务范围保留' % (RP08_SUMMARY['tests'], RP08_SUMMARY['pass'])},
    ],
    'requiredChecks': {
        'backend build': 'exit 0', 'typecheck': 'exit 0', 'lint:undefined': 'exit 0', 'git diff --check': 'exit 0',
        'guard check contract': RP08_RESULTS['guardContract']['verdict'],
        'guard drop': RP08_RESULTS['cleanup']['guardDropExit'],
        'cluster stop': RP08_RESULTS['cleanup']['clusterStopExit'],
    },
    'uncovered': ['RP08-T02 缓存撤权 / 历史回填 / IndexedDB：未执行',
                  'AC-B04-02 / PAC-RP08-02/03/04：未完成',
                  '独立产品/安全字段政策批准：NOT_EVALUATED',
                  'condition=false 的门禁为 NOT_APPLICABLE（非 PASS、非批准）'],
    'businessAcceptanceImpact': 'none; RP08-T01 原本地接受不因本轮自动撤销或升级',
})

write('SUP-02/rollback.md', '''# SUP-02 回滚说明（人工撤销范围，不执行）

本轮 SUP-02 的仓库增量只有：

1. `rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`
   （起始副本 session 根 `evidence/start-copies/rp08-sync-read-authorization.integration.test.mjs.start`，
   sha256 `07e18190ee5baeee283242361b4de9854ac6e8898509d1fbcd59efa11847f211`）。
2. 本 session 的 `SUP-02/`（含 deliverables/field-comparison.csv|md、evidence、runs）。
3. 六个受控记录文件中本轮追加的条目。

人工撤销：把起始副本覆盖回该测试文件，删除本 session 的 SUP-02 目录，
并删除六文件中本轮新增条目（不触碰旧条目）。

sync.js、普通 API、前端本轮零改动，因此**没有业务回滚**；本轮不部署，不存在生产回滚验收。
''')

write_json('SUP-02/task-state.json', {
    'supplementId': 'SUP-02', 'parentTaskIds': ['RP08-T01'], 'parentTaskStatusChanged': False,
    'kind': 'TEST_ONLY', 'originalFinding': 'LR4-02', 'currentFindings': ['LR5-02', 'LR5-04', 'LR5-05'],
    'delivery': {'sevenTypeArtifacts': True, 'fieldCsv': True, 'fieldMd': True, 'status': 'DELIVERED'},
    'implementation': {'scope': 'formal sync test only', 'srcChanges': 0, 'testFileChanges': 1,
                       'newTestsAdded': 0, 'suiteTests': RP08_SUMMARY['tests'],
                       'status': 'TEST_ONLY_DELIVERED_NOT_A_BUSINESS_FIX'},
    'validation': {'status': 'LOCAL_REAL_DB_PASS', 'suite': RP08_SUMMARY,
                   'checks': {'build': 0, 'typecheck': 0, 'lint:undefined': 0, 'gitDiffCheck': 0},
                   'meaning': '局部真实自有库通过；不等于业务修复验收或发布验收'},
    'independentReview': 'PENDING', 'release': 'NOT_EVALUATED',
    'uncovered': ['RP08-T02 / AC-B04-02 / PAC-RP08-02..04', '独立字段政策批准', 'IDB / 目标环境'],
})

write('SUP-02/handoff.md', '# SUP-02 交接（待独立审阅）\n\n'
      '- 类型：TEST_ONLY，父任务 RP08-T01（状态不变），原映射 LR4-02，本轮处理 LR5-02 及共有 LR5-04/05。\n'
      '- 交付：七类产物 + field-comparison.csv/md（按实际目标行与运行结果生成，纠正旧表误列）。\n'
      '- 整套件 ' + str(RP08_SUMMARY['tests']) + '/' + str(RP08_SUMMARY['pass']) +
      ' 通过；七实体同账号撤权对照成立——不等于业务修复验收，release = NOT_EVALUATED。\n'
      '- 未覆盖：RP08-T02 缓存撤权/历史回填/IDB、AC-B04-02、PAC-RP08-02..04、独立字段政策批准。\n'
      '- 下一步：等待独立审阅；不自行选择或启动其他任务。\n')

print('SUP-01/02 deliverables written')
