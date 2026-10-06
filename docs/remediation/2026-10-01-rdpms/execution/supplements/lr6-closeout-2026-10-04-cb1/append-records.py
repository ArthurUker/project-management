"""Append the four non-history controlled records (state x2 + handoff x2).

History entries are appended later (CLOSE-03 sealing order d). Pre-append copies are
saved to evidence/pre-append-records/ so append-only can be proven structurally.
"""
import hashlib, json, pathlib, shutil

R = pathlib.Path('/Users/renkang/VS Code/project-management')
P = R / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/lr6-closeout-2026-10-04-cb1'
SESSION_REL = 'execution/supplements/lr6-closeout-2026-10-04-cb1'
REVIEW_REL = 'execution/reviews/2026-10-04-codebuddy-supplement-rework'
OLD_REL = 'execution/supplements/test-contract-rework-2026-10-03-cb1'
PRE = S / 'evidence/pre-append-records'
PRE.mkdir(parents=True, exist_ok=True)


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


FOUR = ['IMPLEMENTATION_STATE.json', 'execution/state.json', 'HANDOFF.md', 'execution/handoff.md']
for rel in FOUR:
    shutil.copyfile(P / rel, PRE / (rel.replace('/', '_') + '.pre'))

CONT = {
    'sessionId': S.name,
    'date': '2026-10-04',
    'executor': 'CodeBuddy',
    'kind': 'LR6_CLOSEOUT_SUPPLEMENT',
    'authorityReview': f'{REVIEW_REL}/REVIEW.md',
    'promptRef': 'execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md',
    'workItems': [
        {'closeId': 'CLOSE-01', 'finding': 'LR6-01', 'supplement': 'SUP-01', 'parentTask': 'RP10-T02',
         'kind': 'TEST_ONLY', 'result': 'report test precision fix: full identity/id + mandatory marker, '
         'per-primitive parameter shapes, draftWriteBarrier real upsert, three legacy/modern/sync draft races '
         'with try/finally + timer cleanup + settle; 3 new control cases, all 22 original cases retained; '
         'full report suite 25/25 in a fresh owned DB'},
        {'closeId': 'CLOSE-02', 'finding': 'LR6-02', 'kind': 'RUNNER_ONLY_IN_NEW_SESSION',
         'result': 'new-session runner records primary subprocess exceptions, keeps nonzero after cleanup, '
         'returns nonzero on result-persistence failure with a fallback log, isolates each cleanup step, '
         'preserves the owned cluster root when stop fails; six safe simulated controls all nonzero'},
        {'closeId': 'CLOSE-03', 'finding': 'LR6-03', 'kind': 'NEW_CORRECTION_DELIVERY_AND_SEALING',
         'result': 'unique per-registry id with explicit correctsRef (index + old id + old canonical sha256 + '
         'old session), non-cyclic payload/final seals excluding both histories/self/readback, '
         'real per-file hash readback'},
        {'closeId': 'CLOSE-04', 'finding': 'LR6-04', 'supplement': 'SUP-03',
         'parentTasks': ['RP04-T01', 'RP08-T01'], 'kind': 'DOCUMENT_ERRATUM_ONLY',
         'result': 'new erratum separates single-project resolver/404 from the global manager/active-member/'
         'elevated visibility filter; no project.deletedAt condition in the global branch; no code change'},
    ],
    'acceptedEvidenceReuse': {'SUP-02': 'REUSED_INDEPENDENTLY_VERIFIED_EVIDENCE (12/12 and 101/101 from the '
                                        'independent review run; rp08 not rerun this round)'},
    'runnerControls': 'SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED; six controls; no real cluster or server',
    'businessSourceChanges': 0,
    'syncFormalTestChanges': 0,
    'realReportSuite': {'tests': 25, 'pass': 25, 'fail': 0, 'ownedDatabase': True},
    'requiredChecks': {'build': 0, 'typecheck': 0, 'lint:undefined': 0, 'gitDiffCheck': 0},
    'parentTaskStatusChanged': False,
    'originalTaskAndAcceptanceCountsChanged': False,
    'independentReview': 'PENDING',
    'release': 'NOT_EVALUATED',
    'evidenceRoot': SESSION_REL,
    'reviewEntry': f'{SESSION_REL}/REVIEW_ENTRY.md',
    'sessionSummary': f'{SESSION_REL}/SESSION_SUMMARY.md',
    'payloadManifest': f'{SESSION_REL}/evidence/payload-manifest.json',
    'finalIntegrity': f'{SESSION_REL}/final-integrity.json',
    'postSealReadback': f'{SESSION_REL}/post-seal-readback.json',
    'nextBusinessInputs': f'{SESSION_REL}/next-business-inputs.md',
    'correctsOldDelivery': {
        'REVISION_HISTORY.json': 'versions[24] duplicate version id from the previous session '
                                 '(corrected by a new unique entry with correctsRef)',
        'EXECUTION_REVISION_HISTORY.json': 'entries[15] old executor session entry '
                                          '(corrected by a new unique entry with correctsRef)',
    },
    'note': 'CLOSE items are supplemental deliveries; they are not added to the original 54 tasks and do not '
            'change the 306 acceptance rows, package statuses, gates or approvals; local PASS is not fix '
            'acceptance or release acceptance',
}

path = P / 'IMPLEMENTATION_STATE.json'
state = json.loads(path.read_text())
state['supplementalExecutions'].setdefault('continuations', []).append(CONT)
path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')

path = P / 'execution/state.json'
exec_state = json.loads(path.read_text())
exec_state['supplementalExecution'].setdefault('continuations', []).append(CONT)
path.write_text(json.dumps(exec_state, ensure_ascii=False, indent=2) + '\n')

chapter = f'''

---

## 2026-10-04 CodeBuddy LR6 有界收尾 — {S.name}（待独立审阅）

- 指令：`execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md`；权威复核：
  `{REVIEW_REL}/`。
- 范围与结果：
  - CLOSE-01（LR6-01 / SUP-01 / RP10-T02，TEST_ONLY）：完整业务键或 target id + 必需 marker、
    逐原语同源取参、`draftWriteBarrier` 真实 upsert 形状、legacy/modern/sync 三条旧草稿竞争
    `try/finally` + timer 清理 + 收束；新增 3 条控制用例，原 22 条保留；完整报告套件 **25/25**。
  - CLOSE-02（LR6-02）：新 session runner 记录主流程异常、cleanup 后仍非零、写盘失败非零 + fallback、
    清理各步隔离、stop 失败保留自有根；六项 **SIMULATED_CONTROL** 全部非零（未启动真实数据库）。
  - CLOSE-03（LR6-03）：两 registry 各追加唯一订正 entry（含 correctsRef）；payload/final 封存排除两份 history、
    自身与读回文件；逐文件 hash 读回。
  - CLOSE-04（LR6-04 / SUP-03，文档勘误）：单项目 404 与全局可见性过滤分开陈述，明确全局分支无
    `project.deletedAt` 条件；未改业务代码。
- 复用：SUP-02 按独立复核证据复用（12/12、101/101），本轮未重跑 rp08。
- 边界：业务源码改动 0；同步正式测试未改；原 54/306 轴、包状态、门禁与批准不变；
  `independentReview = PENDING`、`release = NOT_EVALUATED`。
- 入口：`{SESSION_REL}/REVIEW_ENTRY.md`、`{SESSION_REL}/SESSION_SUMMARY.md`、
  `{SESSION_REL}/final-integrity.json`、`{SESSION_REL}/post-seal-readback.json`。
'''
for rel in ('HANDOFF.md', 'execution/handoff.md'):
    with (P / rel).open('a') as handle:
        handle.write(chapter)

print('four non-history records appended')
for rel in FOUR:
    print(rel, 'pre', sha256(PRE / (rel.replace('/', '_') + '.pre'))[:16], 'post', sha256(P / rel)[:16])
