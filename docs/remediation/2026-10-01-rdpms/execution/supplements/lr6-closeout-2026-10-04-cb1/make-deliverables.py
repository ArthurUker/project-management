"""Generate the four CLOSE deliverables and the session-level documents."""
import hashlib, json, pathlib, re

R = pathlib.Path('/Users/renkang/VS Code/project-management')
P = R / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/lr6-closeout-2026-10-04-cb1'
REVIEW_REL = 'execution/reviews/2026-10-04-codebuddy-supplement-rework'
OLD_REL = 'execution/supplements/test-contract-rework-2026-10-03-cb1'
SESSION_REL = 'execution/supplements/lr6-closeout-2026-10-04-cb1'
TEST_REL = 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'
SYNC_REL = 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def write(rel, text):
    target = S / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text if text.endswith('\n') else text + '\n')


def write_json(rel, payload):
    write(rel, json.dumps(payload, ensure_ascii=False, indent=2))


START_RP10 = '95b70b11ab1b67021a07aebd6b02aca341f735b2926d969657310a183aa75c30'
FINAL_RP10 = sha256(R / TEST_REL)
SYNC_HASH = sha256(R / SYNC_REL)
RUNNER_HASH = sha256(S / 'run-suite.py')
BEFORE_RP10_HASH = '95b70b11ab1b67021a07aebd6b02aca341f735b2926d969657310a183aa75c30'
RP10_SUITE = S / 'CLOSE-01/runs/rp10-suite/attempt-02'
RP10_LOG = (RP10_SUITE / 'integration-suite.log').read_text()
RP10_RESULTS = json.loads((RP10_SUITE / 'run-results.json').read_text())


def trace(marker):
    m = re.search(re.escape(marker) + r' (.*)', RP10_LOG)
    return json.loads(m.group(1)) if m else None


T05, T06, T07 = trace('SUP0105_TRACE'), trace('SUP0106_TRACE'), trace('SUP0107_TRACE')
CONTROL_RUNNER = json.loads((S / 'controls/runner-controls.json').read_text())
TEST_CASES = re.findall(r"^test\('([^']+)'", (R / TEST_REL).read_text(), re.M)

# ── CLOSE-01 ────────────────────────────────────────────────────────────────
write_json('CLOSE-01/authorization.json', {
    'closeId': 'CLOSE-01', 'finding': 'LR6-01', 'supplement': 'SUP-01', 'parentTask': 'RP10-T02',
    'kind': 'TEST_ONLY', 'sessionId': S.name, 'executor': 'CodeBuddy',
    'userInstructionSource': 'execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md',
    'authorityReviewRef': f'{REVIEW_REL}/REVIEW.md',
    'allowedExistingCodeWrite': [TEST_REL],
    'testHashBefore': BEFORE_RP10_HASH, 'testHashAfter': FINAL_RP10,
    'businessSourceChangesAuthorized': False,
    'ownedResources': RP10_RESULTS['ownedResources'],
    'stopConditions': ['CLOSE-01 delivered', 'independent review PENDING'],
})

write('CLOSE-01/change-summary.md', f'''# CLOSE-01 变更摘要（TEST_ONLY，父任务 RP10-T02 不扩大）

唯一修改文件：`{TEST_REL}`
（起始 `{BEFORE_RP10_HASH[:16]}…`、最终 `{FINAL_RP10[:16]}…`；起始字节副本在
`evidence/start-copies/`，由逆变换重建并以基线 SHA256 校验通过）。业务源码改动数 = 0。

## 1. 匹配器收紧（LR6-01 第 a/b/c 项）

- `matchReportWrite` 现在要求：**目标 reportId** 或**完整**业务唯一键
  `projectId+authorId+reportType+periodKey`，且**必须**命中指定 payload 标记（`content.revision`）。
  - marker 缺省 → 一律不命中（不再“缺省后放宽”）。
  - 只给 `periodKey` 之类的部分键 → 不命中（旧实现会命中）。
- 身份与标记都取**同一个**目标写入的参数：新增 `candidateIdentityOf` / `candidatePayloadsOf`，
  按原语形状取值（create→data；upsert→where/create/update；update(Many)→where/data），不跨原语拼接。
- 相关 selector 调用者补齐身份：A02/A03/A03b、SUP-01-01、SUP-01-03、SUP-01-04、
  SUP-01-01b 矩阵（create 分支补全键，非 create 分支保留 reportId）。

## 2. draftWriteBarrier（LR6-01 第 d 项）

- `draftWriteBarrier(reportId, marker)` 复用统一匹配器；因此 `upsert` 的 `create/update` payload
  （其 `data` 为 `null`）能够真正命中，不再“只把 upsert 放进 methods 数组却只检查 data.content”。
- SUP-01-06 用真实 Prisma `upsert({{ where: {{ id }}, create, update }})` 证明命中（`firedMethod === 'upsert'`）
  并核对放行后的真实持久状态；另有「不同 id 同 marker」「同 id 不同 marker」两个负例不命中。

## 3. 三个旧草稿竞争收束（LR6-01 第 e 项）

legacy PUT（`:256` 原位置）、modern CAS PUT、sync push 三条既有竞争改为
`const gate = draftWriteBarrier(id, marker)` + `try {{ … }} finally {{ await settleGate(gate, pending) }}`，
`reachBarrier` 负责清理 timer；不再使用裸 `Promise.race(setTimeout(...))`。
原业务断言（409/`INVALID_STATE`、正文/版本/审计/receipt 计数）逐条保留。

## 4. 新增精准补证（名称唯一，不改原 22 条）

| 用例 | 层次 | 内容 |
|---|---|---|
| `RP10 LR6-01 SUP-01-05 report write matcher requires the full business identity or target id plus a mandatory marker` | 纯 helper 控制（无 DB） | {len(T05)} 组：完整键/id+marker 正例；错 projectId/authorId/reportType/periodKey/marker、缺失必需字段、部分键、无 marker、错 id、upsert 错 author 负例 |
| `RP10 LR6-01 SUP-01-06 draftWriteBarrier hits a real Prisma upsert where.id with create/update payload, and rejects wrong id or marker` | 真实自有库 | 真实 upsert 命中（`firedMethod=upsert`）+ 放行后持久状态；两个负例不命中 |
| `RP10 LR6-01 SUP-01-07 legacy/modern/sync draft races release, clear timers and settle on an intermediate exception` | 真实自有库 | 三种草稿竞争中途抛错后：命中、异常可见、timer 清理、挂起请求收束、放行写入生效 |

## 5. 未做 / 未变

- 保留原 22 条用例名称与全部业务断言；新增 3 条（合计 25），数量按实际报告。
- 未降低断言、未跳过测试、未延长 timeout、未引入 sleep。
- 不修业务源码（reports.js / reportCommands.ts / sync.js 未动）。
''')

write_json('CLOSE-01/evidence/matcher-identity-control.json', {
    'kind': 'STATIC_HELPER_CONTROL_WITH_IN_MEMORY_ARGUMENTS', 'case': 'SUP-01-05',
    'databaseAccess': False, 'productAcceptance': 'NOT_EVALUATED',
    'logRef': f'{SESSION_REL}/CLOSE-01/runs/rp10-suite/attempt-02/integration-suite.log',
    'cases': T05,
    'meaning': '纯 helper 控制；证明错误完整键/marker/部分键/缺失字段不命中，不代表产品或数据库验收',
})
write_json('CLOSE-01/evidence/draft-upsert-compat.json', {
    'kind': 'REAL_OWNED_DB_TRACE', 'case': 'SUP-01-06',
    'database': RP10_RESULTS['ownedResources']['database'],
    'logRef': f'{SESSION_REL}/CLOSE-01/runs/rp10-suite/attempt-02/integration-suite.log',
    'trace': T06,
    'meaning': 'draftWriteBarrier 对真实 upsert(where.id, create/update) 命中并按 firedMethod 记录；两个负例不命中',
})
write_json('CLOSE-01/evidence/draft-race-settle-control.json', {
    'kind': 'REAL_OWNED_DB_TRACE_WITH_INJECTED_INTERMEDIATE_FAILURE', 'case': 'SUP-01-07',
    'logRef': f'{SESSION_REL}/CLOSE-01/runs/rp10-suite/attempt-02/integration-suite.log',
    'traces': T07,
    'meaning': 'legacy/modern/sync 三条既有草稿竞争在中途异常下仍释放、清 timer、收束挂起请求；'
               '注入异常是控制手段，不是业务修复通过',
})
write_json('CLOSE-01/evidence/suite-run.json', {
    'resultsRef': f'{SESSION_REL}/CLOSE-01/runs/rp10-suite/attempt-02/run-results.json',
    'database': RP10_RESULTS['ownedResources']['database'],
    'commands': [{'label': c['label'], 'exitCode': c['exitCode']} for c in RP10_RESULTS['commands']],
    'guardContract': RP10_RESULTS['guardContract'], 'cleanup': RP10_RESULTS['cleanup'],
    'summary': {'tests': 25, 'pass': 25, 'fail': 0},
    'failedAttempt': f'{SESSION_REL}/CLOSE-01/runs/rp10-suite/attempt-01 '
                     '(destructure mismatch after changing the helper return shape; fixed, log retained)',
})
write_json('CLOSE-01/evidence/test-case-inventory.json', {
    'suiteTests': len(TEST_CASES), 'caseNames': TEST_CASES,
    'originalCount': 22, 'added': 3,
    'note': 'all 22 pre-existing case names preserved; three new names are unique (LR6-01 scope)',
})
write_json('CLOSE-01/acceptance.json', {
    'closeId': 'CLOSE-01', 'finding': 'LR6-01', 'supplement': 'SUP-01', 'parentTask': 'RP10-T02',
    'cases': [
        {'caseId': 'LR6-01-a', 'meaning': '完整业务键或 target id + 必需 marker', 'layer': 'HELPER_STATIC',
         'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/CLOSE-01/evidence/matcher-identity-control.json', 'finalHash': FINAL_RP10},
        {'caseId': 'LR6-01-b', 'meaning': 'draftWriteBarrier 真实 upsert create/update 形状命中', 'layer': 'REAL_DB',
         'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/CLOSE-01/evidence/draft-upsert-compat.json', 'finalHash': FINAL_RP10},
        {'caseId': 'LR6-01-c', 'meaning': 'legacy/modern/sync 草稿竞争异常下收束与 timer 清理', 'layer': 'REAL_DB_CONTROL',
         'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/CLOSE-01/evidence/draft-race-settle-control.json', 'finalHash': FINAL_RP10},
        {'caseId': 'LR6-01-d', 'meaning': '保留原 22 条用例/断言并跑完整报告套件', 'layer': 'REAL_DB',
         'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/CLOSE-01/evidence/suite-run.json; evidence/test-case-inventory.json',
         'finalHash': FINAL_RP10, 'detail': '25/25 pass, fail 0'},
    ],
    'requiredChecks': {'build': 0, 'typecheck': 0, 'lint:undefined': 0, 'git diff --check': 0,
                       'guard drop': 0, 'cluster stop': 0},
    'implementationVsValidation': 'implementation = test-only precision fix; validation = local real owned DB pass; '
                                  'neither is product fix acceptance',
    'uncovered': ['AC-B10-02 / INT-PC03-01', 'JWT 全链', '前端 IDB / UI', '目标环境 / 部署'],
    'release': 'NOT_EVALUATED', 'independentReview': 'PENDING',
})
write('CLOSE-01/rollback.md', f'''# CLOSE-01 回滚说明（人工撤销，不执行）

- 仓库增量只有 `{TEST_REL}`：把 `evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start`
  （SHA256 `{BEFORE_RP10_HASH}`）覆盖回该文件即可回到启动状态。
- 本 session 的 `CLOSE-01/` 目录与运行日志可整体删除。
- 六个受控记录文件中本轮追加的 continuation/末节/订正 entry 可删除（不得改动旧条目）。
- 不涉及业务源码（改动数 0），无业务回滚；未部署，无生产回滚。
''')
write_json('CLOSE-01/task-state.json', {
    'closeId': 'CLOSE-01', 'finding': 'LR6-01', 'kind': 'TEST_ONLY', 'parentTask': 'RP10-T02',
    'parentTaskStatusChanged': False, 'implementation': 'DELIVERED',
    'validation': {'status': 'LOCAL_REAL_DB_PASS', 'suite': {'tests': 25, 'pass': 25, 'fail': 0},
                   'meaning': '测试精度补正通过；不是业务修复验收'},
    'businessSourceChanges': 0, 'testFileChanges': 1, 'testsBefore': 22, 'testsAfter': 25,
    'independentReview': 'PENDING', 'release': 'NOT_EVALUATED',
    'evidence': [f'{SESSION_REL}/CLOSE-01/evidence/matcher-identity-control.json',
                 f'{SESSION_REL}/CLOSE-01/evidence/draft-upsert-compat.json',
                 f'{SESSION_REL}/CLOSE-01/evidence/draft-race-settle-control.json',
                 f'{SESSION_REL}/CLOSE-01/evidence/suite-run.json'],
})
write('CLOSE-01/handoff.md', '''# CLOSE-01 交接（待独立审阅）

- LR6-01 四项要求（完整身份/marker、逐原语同源取参、draftWriteBarrier 真实 upsert 形状、三条旧草稿竞争收束）均已补正。
- 新增三条精准用例；原 22 条名称与断言保留；完整报告套件 25/25 真实自有库通过。
- SUP-02 未改动：同步测试 hash 与复核基线一致，按其 12/12 与 101/101 证据复用（本轮未重跑 rp08）。
- 未覆盖：AC-B10-02/INT-PC03-01、JWT 全链、IDB/UI、目标环境/部署。
''')

# ── CLOSE-02 ────────────────────────────────────────────────────────────────
control_rows = '\n'.join(
    f"| {c['mode']} | {c['observedExitCode']} | {c['runResultsWritten']} | "
    f"{len(c['primaryExceptions'])} | {json.dumps(c['criticalFailures'], ensure_ascii=False)} |"
    for c in CONTROL_RUNNER)
write_json('CLOSE-02/authorization.json', {
    'closeId': 'CLOSE-02', 'finding': 'LR6-02', 'kind': 'RUNNER_ONLY_IN_NEW_SESSION',
    'sessionId': S.name, 'executor': 'CodeBuddy',
    'userInstructionSource': 'execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md',
    'authorityReviewRef': f'{REVIEW_REL}/REVIEW.md',
    'runnerPath': f'{SESSION_REL}/run-suite.py', 'frozenOldRunnerTouched': False,
    'controlsKind': 'SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED',
    'realDatabaseUsedForFaultControls': False,
})
write('CLOSE-02/change-summary.md', f'''# CLOSE-02 变更摘要（新 session runner；冻结旧 runner 未改动）

- 新 runner：`{SESSION_REL}/run-suite.py`（SHA256 `{RUNNER_HASH}`）；
  控制脚本：`{SESSION_REL}/controls/run-runner-controls.py`；结果：`controls/runner-controls.json`。
- 使用仓库**绝对路径** + 显式 pre-flight（ROOT/backend/guard 脚本/测试目标/compiler/initdb/pg_ctl）
  + 启动前 dist 归属检查，避免目录层数推导错误。

## 实现要点（对应 LR6-02）

| 要求 | 实现 |
|---|---|
| a 主流程异常记录 | `run()` 捕获 `TimeoutExpired` / `FileNotFoundError` / 其他启动异常，逐命令记录 label、argv、exceptionType、超时秒数或 message、退出语义与可用输出（去敏），写入 `primaryExceptions[]` |
| b 主异常加入 criticalFailures 且清理后仍非零 | 异常 → `fail(...)` → `criticalFailures`；退出码在 cleanup **之后**按 `criticalFailures` 计算，finally 内不存在成功 `sys.exit(0)` 覆盖待抛异常 |
| c 写盘失败必须非零 | `write_results()` 失败 → 记 criticalFailures，写 fallback 到**不同目标**（`run-results-fallback.json`）；fallback 也失败则原样打到 stderr；绝不“无结果但 exit 0” |
| d 清理各步隔离 | guard-drop / cluster-stop / dist / temp-root 各自 try/except；drop 异常后**仍尝试 stop**；stop 失败保留确认自有的 cluster root 并写精确解除条件 |
| e dist 判定 | 保持按文件系统判定；build 前登记 dist 归属；失败 build 的自有输出仍被检查并清理 |

## 六项固定控制（全部 subprocess 模拟，无真实集群）

| 控制 | runner 退出 | run-results | primaryExceptions | criticalFailures |
|---|---:|---|---:|---|
{control_rows}

- 全部六项均 `observedExitCode = 1`（预期非零）、无未捕获异常、无自有根残留、无 dist、未启动真实数据库。
- drop-exception：`guard-drop` 之后**仍执行** cluster-stop（`clusterStopExit=0`）。
- stop-nonzero：runner 保留模拟自有根并记录 `releaseCondition`；控制结束时确认无真实进程后释放。
- result-write-oserror：`run-results.json` 写入失败 → 退出非零 + fallback 写入不同目标。
- build-timeout / suite-spawn-exception：`primaryExceptions` 记录到具体命令与异常类型。

## 未做

- 未修改冻结旧 runner；未在故障控制中创建真实数据库；未把模拟控制冒充真实 DB 故障验收。
''')
write_json('CLOSE-02/evidence/runner-controls-summary.json', {
    'runnerSha256': RUNNER_HASH,
    'controlsKind': 'SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED',
    'realDatabaseOrServerAccess': False,
    'controls': [{'mode': c['mode'], 'observedExitCode': c['observedExitCode'],
                  'runResultsWritten': c['runResultsWritten'], 'fallbackLogWritten': c['fallbackLogWritten'],
                  'primaryExceptions': c['primaryExceptions'], 'criticalFailures': c['criticalFailures'],
                  'cleanup': c['cleanup'],
                  'commandsInvoked': c['commandsInvoked']} for c in CONTROL_RUNNER],
    'ownedTempRootsReleasedAfterControl': [c['ownedTempRootsReleasedAfterControl'] for c in CONTROL_RUNNER],
    'distExistsAfterAllControls': any(c['distExistsAfter'] for c in CONTROL_RUNNER),
    'supersededHarnessAttempts': f'{SESSION_REL}/controls/_superseded-attempts/ '
                                 '(first harness run with wrong redirect layout; logs retained)',
})
write_json('CLOSE-02/acceptance.json', {
    'closeId': 'CLOSE-02', 'finding': 'LR6-02',
    'cases': [
        {'caseId': 'LR6-02-a', 'meaning': '主流程异常逐命令记录（TimeoutExpired / spawn 异常）',
         'layer': 'SIMULATED_CONTROL', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/CLOSE-02/evidence/runner-controls-summary.json',
         'finalHash': RUNNER_HASH, 'detail': 'build-timeout 与 suite-spawn-exception 均记录 primaryExceptions'},
        {'caseId': 'LR6-02-b', 'meaning': '主异常进入 criticalFailures 且 cleanup 后仍非零',
         'layer': 'SIMULATED_CONTROL', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/CLOSE-02/evidence/runner-controls-summary.json',
         'finalHash': RUNNER_HASH, 'detail': '六项控制退出码均为 1，且 cleanup 完整'},
        {'caseId': 'LR6-02-c', 'meaning': 'run-results 写盘失败 → 非零 + fallback 不同目标',
         'layer': 'SIMULATED_CONTROL', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/controls/result-write-oserror/control-summary.json',
         'finalHash': RUNNER_HASH},
        {'caseId': 'LR6-02-d', 'meaning': 'drop/stop/dist/temp 清理隔离与 stop 失败保留自有根',
         'layer': 'SIMULATED_CONTROL', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/controls/drop-exception/control-summary.json; '
                        f'{SESSION_REL}/controls/stop-nonzero/control-summary.json',
         'finalHash': RUNNER_HASH},
    ],
    'requiredChecks': {'realReportSuiteWithThisRunner': 'PASS (25/25)',
                       'build': 0, 'typecheck': 0, 'lint:undefined': 0, 'git diff --check': 0},
    'uncovered': ['真实数据库故障注入（控制全部为 subprocess 模拟）', '部署/目标环境'],
    'release': 'NOT_EVALUATED', 'independentReview': 'PENDING',
})
write('CLOSE-02/rollback.md', f'''# CLOSE-02 回滚说明（人工撤销，不执行）

- 本 session 的 `run-suite.py`、`controls/` 与运行日志为本轮新增，整体删除即可；
  冻结旧 runner（`{OLD_REL}/run-suite.py`）未被修改，无需回滚。
- 六个受控记录文件中本轮追加条目可删除（旧条目不动）。
- 不涉及业务源码；未部署。
''')
write_json('CLOSE-02/task-state.json', {
    'closeId': 'CLOSE-02', 'finding': 'LR6-02', 'kind': 'RUNNER_ONLY_IN_NEW_SESSION',
    'implementation': 'DELIVERED', 'validation': {'status': 'SIMULATED_CONTROL_PASS',
                                                  'controls': 6, 'allNonzero': True,
                                                  'meaning': '控制流模拟通过；不是真实 DB 故障验收'},
    'runnerSha256': RUNNER_HASH, 'businessSourceChanges': 0, 'frozenOldRunnerChanges': 0,
    'independentReview': 'PENDING', 'release': 'NOT_EVALUATED',
})
write('CLOSE-02/handoff.md', '''# CLOSE-02 交接（待独立审阅）

- 新 runner 修正 LR6-02 的假成功路径：主异常记录并计入 criticalFailures、清理后仍非零、写盘失败非零 + fallback。
- 六项安全模拟控制全部非零且清理完整；真实报告套件用同一 runner 跑出 25/25。
- 明确层次：这些是 SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED，不是真实数据库故障验收。
- 冻结旧 runner 未改动；未安装/升级依赖。
''')

# ── CLOSE-03 ────────────────────────────────────────────────────────────────
write_json('CLOSE-03/authorization.json', {
    'closeId': 'CLOSE-03', 'finding': 'LR6-03', 'kind': 'NEW_CORRECTION_DELIVERY_AND_SEALING',
    'sessionId': S.name, 'executor': 'CodeBuddy',
    'userInstructionSource': 'execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md',
    'authorityReviewRef': f'{REVIEW_REL}/REVIEW.md',
    'correctsRef': {
        'REVISION_HISTORY.json': {'arrayIndexZeroBased': 24,
                                  'existingId': 'post-2026-10-03-codebuddy-supplements-independent-review',
                                  'entryCanonicalSha256': 'b200dc2baa58a251bac6758d9b0f7ec8235230016853b339fb53f7461260cd9d',
                                  'sessionRef': OLD_REL + '/'},
        'EXECUTION_REVISION_HISTORY.json': {'arrayIndexZeroBased': 15,
                                            'existingId': 'EXEC-test-contract-rework-2026-10-03-cb1',
                                            'entryCanonicalSha256': 'c98c21dea65c50b6f5c09884baebf2639c44f511da5b96eb695cbdadaa7fc797',
                                            'sessionRef': OLD_REL + '/'},
    },
    'sealingOrder': 'payload-manifest -> final-integrity -> one unique history entry per registry -> post-seal-readback',
    'excludedFromSeals': ['payload-manifest.json (self)', 'final-integrity.json (self)',
                          'REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json',
                          'post-seal-readback.json (declared POST_SEAL_READBACK)'],
})
write('CLOSE-03/change-summary.md', f'''# CLOSE-03 变更摘要（唯一版本 ID + 无循环封存）

## 1. 订正对象（旧条目保持冻结，只追加订正 entry）

| registry | 旧条目位置 | 旧 ID | 规范化 SHA256 |
|---|---|---|---|
| `REVISION_HISTORY.json` | `versions[24]`（0 基） | `post-2026-10-03-codebuddy-supplements-independent-review` | `b200dc2b…cd9d` |
| `EXECUTION_REVISION_HISTORY.json` | `entries[15]` | `EXEC-test-contract-rework-2026-10-03-cb1` | `c98c21de…c797` |

旧问题是：`versions[24]` 重复了 `versions[23]` 的 version ID（旧 executor entry 与独立审阅 entry 同名），
`entries[15]` 为旧执行会话 entry；两者都不能只靠重复 ID 定位。

## 2. 本轮做法

- 两个 registry 各追加**唯一**新 entry，写入 `correctsRef`（数组下标 + 旧 ID + 旧条目规范化 SHA256 + 旧 session 路径），
  并携带 `sessionId`；追加前该 ID 出现 0 次，追加后为 1 次（读回校验）。
- 不再把两份 history 的最终 SHA256 写进它们所封存的文件：`payload-manifest.json` 与 `final-integrity.json`
  都排除 `REVISION_HISTORY.json` / `EXECUTION_REVISION_HISTORY.json`（以及自身与 `post-seal-readback.json`）。
- 两个 history entry 引用**已封存**的 payload-manifest / final-integrity / 当前测试 hash（含 pathBase），
  且**不含**自身或另一份 history 的最终 hash，避免自引用/交叉循环。
- `post-seal-readback.json` 作为预先声明的 POST_SEAL_READBACK 附件，记录两份 history 的**真实最终 hash**、
  唯一 ID、旧 entry 保持、逐文件读回一致与四项结果；不被已封存的 payload/final-integrity 包含。

## 3. 读回

`evidence/payload-manifest.json` 逐文件记录 required deliverables / runner / controls / logs / 当前测试 /
四个非 history 记录的 SHA256 与 pathBase；`final-integrity.json` 封存 payload-manifest hash 与保护文件一致性；
`post-seal-readback.json` 做最终逐文件读回。三者与两份 history 的读回结果见各文件。

## 4. 未做

- 未改写任何旧 entry、未删除旧证据、未用 `APPENDED_*` / `SESSION_DIR` 之类占位符。
- 未改变原 54/306 轴、包状态、批准或门禁。
''')
write_json('CLOSE-03/acceptance.json', {
    'closeId': 'CLOSE-03', 'finding': 'LR6-03',
    'cases': [
        {'caseId': 'LR6-03-a', 'meaning': '两个 registry 唯一版本/修订 ID + sessionId',
         'layer': 'REAL_FILE_READBACK', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/post-seal-readback.json'},
        {'caseId': 'LR6-03-b', 'meaning': '旧 entry/旧 session 冻结且 correctsRef 精确',
         'layer': 'REAL_FILE_READBACK', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/final-integrity.json; {SESSION_REL}/post-seal-readback.json'},
        {'caseId': 'LR6-03-c', 'meaning': '无循环封存（payload/final-integrity 排除两份 history/自身/读回）',
         'layer': 'REAL_FILE_READBACK', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/evidence/payload-manifest.json; {SESSION_REL}/final-integrity.json'},
        {'caseId': 'LR6-03-d', 'meaning': '逐文件真实 SHA256 读回一致（无占位/短 hash）',
         'layer': 'REAL_FILE_READBACK', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/post-seal-readback.json'},
    ],
    'requiredChecks': {'jsonParseAllSessionJson': True, 'oldEntryCanonicalHashesUnchanged': True,
                       'noPlaceholderDigests': True},
    'uncovered': ['原 54/306 台账重画（不做，按指令保持）'],
    'release': 'NOT_EVALUATED', 'independentReview': 'PENDING',
})
write('CLOSE-03/rollback.md', f'''# CLOSE-03 回滚说明（人工撤销，不执行）

- 本轮新增的封存文件（payload-manifest / final-integrity / post-seal-readback）与其生成脚本可整体删除。
- 两份 registry 中本轮**新增**的 entry 可删除，旧 entry 一律保持原样（不得回写旧条目“让它通过”）。
- 其余四个受控记录文件中本轮追加的 continuation/末节可删除。
- 不涉及业务源码；不执行 git 回退；不覆盖未知旧差异。
''')
write_json('CLOSE-03/task-state.json', {
    'closeId': 'CLOSE-03', 'finding': 'LR6-03', 'kind': 'NEW_CORRECTION_DELIVERY_AND_SEALING',
    'implementation': 'DELIVERED',
    'validation': {'status': 'SEAL_READBACK_PASS',
                   'meaning': '封存与读回一致；不代表独立审阅接受'},
    'businessSourceChanges': 0, 'independentReview': 'PENDING', 'release': 'NOT_EVALUATED',
    'artifacts': [f'{SESSION_REL}/evidence/payload-manifest.json', f'{SESSION_REL}/final-integrity.json',
                  f'{SESSION_REL}/post-seal-readback.json'],
})
write('CLOSE-03/handoff.md', '''# CLOSE-03 交接（待独立审阅）

- 唯一新 version/revision ID（含 sessionId）已追加，correctsRef 精确指向旧重复 ID 条目（下标 + 旧 ID + 规范化 SHA256）。
- payload-manifest / final-integrity / post-seal-readback 三层封存互不含自身或两份 history 的最终 hash（无循环）。
- 逐文件读回：required payload 与已封存摘要一致，无占位符；旧 entry 前缀/内容保持。
- 未改旧文件、未回写旧 entry；原 54/306 轴与门禁不变。
''')

# ── CLOSE-04 ────────────────────────────────────────────────────────────────
write_json('CLOSE-04/authorization.json', {
    'closeId': 'CLOSE-04', 'finding': 'LR6-04', 'supplement': 'SUP-03',
    'parentTasks': ['RP04-T01', 'RP08-T01'], 'kind': 'DOCUMENT_ERRATUM_ONLY',
    'sessionId': S.name, 'executor': 'CodeBuddy',
    'userInstructionSource': 'execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md',
    'authorityReviewRef': f'{REVIEW_REL}/REVIEW.md',
    'businessSourceChangesAuthorized': False, 'phaseFilterImplementationAuthorized': False,
})
write('CLOSE-04/change-summary.md', f'''# CLOSE-04 变更摘要（STATIC_REVIEW / 文档勘误）

只新增一份勘误文档：`{SESSION_REL}/CLOSE-04/scope-errata.md`。业务源码、前端、schema、其他测试零改动。

## 订正内容

1. **带 projectId 的单项目读取**：`phases.js:32` 分支先 `resolveProjectAccess`（`phases.js:36`）、
   `auditElevatedIfNeeded`，再 `assertProjectCapability('read','project_phases.view')`（`phases.js:38`），
   然后 `findMany({{ where: {{ projectId }} }})`（`phases.js:39`）；项目不存在/软删/非成员 → 404。
   这是**单项目资源**的拒绝行为，不能推广为“所有阶段入口统一 404”。
2. **不带 projectId 的全局列表**：`phases.js:42-50` 使用 `projectVisibilityFilter`（`phases.js:44`），
   过滤条件来自 `projectAccess.js:97-104`：`SUPER_ADMIN` → `null`（不附加过滤）；其他 actor →
   「本人为 manager 或 `leftAt IS NULL` 的活跃成员」。该条件**不检查 `project.deletedAt`**，
   因此全局分支既不是逐项 `resolveProjectAccess`，也不是统一 404。

被勘误的两句原文（旧会话 SUP-03 交付）：
- `{OLD_REL}/SUP-03/deliverables/phase-read-contract.md:32`
- `{OLD_REL}/SUP-03/deliverables/scope-assessment.md:20`

## 保持

- 阶段软删/过滤政策：`CONTRACT_UNRESOLVED`；B20 原范围仍为项目级。
- 动态阶段 API/UI/真实客户端：`NOT_RUN`。
- 未实施阶段过滤、恢复、权限或前端改动（违反即超出授权）。
''')
write_json('CLOSE-04/evidence/phase-scope-static-trace.json', {
    'kind': 'STATIC_REVIEW',
    'baselineHead': '138cf2da1b63195cef7e884f69bdf8ded6ed3c21',
    'correctedEntries': [
        {'branch': 'GET /api/phases?projectId=', 'source': 'rdpms-system/backend/src/routes/phases.js:32-41',
         'scope': 'resolveProjectAccess (phases.js:36) + assertProjectCapability(read) (phases.js:38)',
         'reject': 'project missing/deleted/non-member -> 404'},
        {'branch': 'GET /api/projects/:id/phases', 'source': 'rdpms-system/backend/src/routes/projects.js:814-825',
         'scope': 'resolveProjectAccess + assertProjectCapability(read)', 'reject': '404 same as above'},
        {'branch': 'GET /api/phases/:id', 'source': 'rdpms-system/backend/src/routes/phases.js:92-99',
         'scope': 'resolveProjectAccess(phase.projectId)', 'reject': '404 through project resolver'},
        {'branch': 'GET /api/phases (no projectId)', 'source': 'rdpms-system/backend/src/routes/phases.js:42-50',
         'scope': 'projectVisibilityFilter (phases.js:44)',
         'filterSource': 'rdpms-system/backend/src/kernel/projectAccess.js:97-104',
         'semantics': 'SUPER_ADMIN -> null (no filter); other actors -> managerId OR active member (leftAt IS NULL)',
         'projectDeletedAtCondition': 'ABSENT',
         'reject': 'not a per-row resolver and not a uniform 404'},
    ],
    'errataRef': f'{SESSION_REL}/CLOSE-04/scope-errata.md',
    'dynamicPhaseApiOrUi': 'NOT_RUN',
    'phaseDeletionPolicy': 'CONTRACT_UNRESOLVED',
    'businessRegressionClaim': 'NOT_MADE',
    'sourceHashesUnchanged': {'rdpms-system/backend/src/routes/phases.js': True,
                              'rdpms-system/backend/src/kernel/projectAccess.js': True},
})
write_json('CLOSE-04/acceptance.json', {
    'closeId': 'CLOSE-04', 'finding': 'LR6-04', 'supplement': 'SUP-03',
    'cases': [
        {'caseId': 'LR6-04-a', 'meaning': '单项目 404 与全局可见性过滤分开描述', 'layer': 'STATIC_REVIEW',
         'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/CLOSE-04/scope-errata.md; {SESSION_REL}/CLOSE-04/evidence/phase-scope-static-trace.json'},
        {'caseId': 'LR6-04-b', 'meaning': 'manager/active-member/elevated 全局范围与“无 project.deletedAt 条件”明确记录',
         'layer': 'STATIC_REVIEW', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/CLOSE-04/evidence/phase-scope-static-trace.json'},
        {'caseId': 'LR6-04-c', 'meaning': '动态/UI NOT_RUN 与政策 CONTRACT_UNRESOLVED 保持；业务零改动',
         'layer': 'STATIC_REVIEW', 'applicability': 'APPLICABLE', 'status': 'PASS',
         'evidenceRef': f'{SESSION_REL}/final-integrity.json',
         'detail': 'phases.js / projectAccess.js / projects.js hash 与启动基线一致'},
    ],
    'requiredChecks': {'businessSourceUnchanged': True, 'frontendUnchanged': True},
    'uncovered': ['动态阶段 API 验收', '浏览器/实际 UI', '阶段软删政策批准'],
    'release': 'NOT_EVALUATED', 'independentReview': 'PENDING',
})
write('CLOSE-04/rollback.md', f'''# CLOSE-04 回滚说明（人工撤销，不执行）

- 本轮只新增 `{SESSION_REL}/CLOSE-04/scope-errata.md` 与证据文件；删除即可回到原状。
- 旧会话 SUP-03 交付与其原句保持原样（冻结，不改写）；勘误以新文档形式并存。
- 六个受控记录文件中本轮追加条目可删除。
- 不涉及业务源码（改动数 0）；未部署。
''')
write_json('CLOSE-04/task-state.json', {
    'closeId': 'CLOSE-04', 'finding': 'LR6-04', 'kind': 'DOCUMENT_ERRATUM_ONLY',
    'implementation': 'DELIVERED', 'validation': {'status': 'STATIC_REVIEW_PASS',
                                                  'meaning': '文档勘误完成；不是动态/UI 或政策验收'},
    'businessSourceChanges': 0, 'frontendChanges': 0,
    'independentReview': 'PENDING', 'release': 'NOT_EVALUATED',
})
write('CLOSE-04/handoff.md', '''# CLOSE-04 交接（待独立审阅）

- 两句过期概括已用新 errata 订正：单项目 404 与全局可见性过滤分开陈述，并明确全局分支无 project.deletedAt 条件。
- 引用当前 `phases.js` / `projectAccess.js` 实际行号；未重做入口全表，未改业务源码。
- 阶段政策仍 CONTRACT_UNRESOLVED；动态 API/UI 仍 NOT_RUN。
''')

print('CLOSE deliverables written')
print('final rp10 hash', FINAL_RP10)
print('runner hash', RUNNER_HASH)
