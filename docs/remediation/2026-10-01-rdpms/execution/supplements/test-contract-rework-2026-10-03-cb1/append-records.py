"""Append-only update of the six controlled record files for the 2026-10-03 SUP rework.

Rules honoured:
  * IMPLEMENTATION_STATE.json  -> new key supplementalExecutions.continuations[] (existing fields untouched)
  * execution/state.json       -> new key supplementalExecution.continuations[] (existing fields untouched)
  * HANDOFF.md / execution/handoff.md -> append a new session chapter (existing prefix untouched)
  * REVISION_HISTORY.json      -> append one versions entry
  * EXECUTION_REVISION_HISTORY.json -> append one entries entry
No original task/package/count/decision/authorization/latestRun/nextReadyTask field is modified.
"""
import hashlib, json, pathlib

SESSION = pathlib.Path(__file__).resolve().parents[0]
ROOT = SESSION.parents[5]
PLAN = SESSION.parents[2]
SESSION_REL = 'execution/supplements/test-contract-rework-2026-10-03-cb1'


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def sha256_text(text):
    return hashlib.sha256(text.encode()).hexdigest()


# hashes of the artefacts sealed before this append (used inside the entries)
SEALED = {
    'execution/supplements/test-contract-rework-2026-10-03-cb1/final-integrity.json':
        'COMPUTED_LATER',
}

CONT = {
    'sessionId': SESSION.name,
    'date': '2026-10-03',
    'executor': 'CodeBuddy',
    'kind': 'SUPPLEMENT_REWORK_TEST_AND_REVIEW_ONLY',
    'authorityReview': 'execution/reviews/2026-10-03-codebuddy-supplements/REVIEW.md',
    'promptRef': 'execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md',
    'correctOriginalMapping': {'SUP-01': 'LR4-03', 'SUP-02': 'LR4-02', 'SUP-03': 'LR4-02',
                               'note': 'LR4-01 is prior record drift; LR4-04 is not defined in prior findings'},
    'supplementIds': [
        {'supplementId': 'SUP-01', 'parentTaskIds': ['RP10-T02'], 'kind': 'TEST_ONLY',
         'findings': ['LR5-01', 'LR5-04', 'LR5-05'],
         'result': 'formal report test only: unified primitive-aware gate, four-primitive hit matrix, '
                   'restore+submit race, release/settle control, real-DB semantic negative control',
         'suite': 'tests 22 / pass 22 / fail 0 (fresh owned PostgreSQL)'},
        {'supplementId': 'SUP-02', 'parentTaskIds': ['RP08-T01'], 'kind': 'TEST_ONLY',
         'findings': ['LR5-02', 'LR5-04', 'LR5-05'],
         'result': 'seven-entity same-actor permission contrast; field CSV/MD regenerated from the real run; '
                   'old false forbidden-field entries corrected',
         'suite': 'tests 12 / pass 12 / fail 0 (fresh owned PostgreSQL)'},
        {'supplementId': 'SUP-03', 'parentTaskIds': ['RP04-T01', 'RP08-T01'], 'kind': 'REVIEW_ONLY',
         'findings': ['LR5-03', 'LR5-04'],
         'result': 'phase read/write/client/B20 read-only trace; phase-resource DELETE and restore NOT_FOUND; '
                   'direct client caller NOT_FOUND; phase policy CONTRACT_UNRESOLVED; UI/dynamic NOT_RUN'},
    ],
    'sharedDeliveryWork': ['LR5-04', 'LR5-05'],
    'runnerControls': 'three SIMULATED_CONTROL runs (build-fail, drop-raise, stop-fail); '
                      'stop-fail owned cluster manually released per recorded condition',
    'businessSourceChanges': 0,
    'srcChanges': 0,
    'independentReview': 'PENDING',
    'release': 'NOT_EVALUATED',
    'parentTaskStatusChanged': False,
    'originalTaskAndAcceptanceCountsChanged': False,
    'evidenceRoot': SESSION_REL,
    'reviewEntry': f'{SESSION_REL}/REVIEW_ENTRY.md',
    'sessionSummary': f'{SESSION_REL}/SESSION_SUMMARY.md',
    'deliveryErrata': f'{SESSION_REL}/delivery-errata.md',
    'finalIntegrity': f'{SESSION_REL}/final-integrity.json',
    'startBaseline': f'{SESSION_REL}/evidence/start-baseline.json',
    'note': 'SUP ids are not added to the original 54 tasks and do not change the 306 acceptance rows; '
            'local suite PASS is not fix acceptance or release acceptance',
}

# ── 1. IMPLEMENTATION_STATE.json ─────────────────────────────────────────────
path = PLAN / 'IMPLEMENTATION_STATE.json'
state = json.loads(path.read_text())
state['supplementalExecutions'].setdefault('continuations', []).append(CONT)
path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')

# ── 2. execution/state.json ──────────────────────────────────────────────────
path = PLAN / 'execution/state.json'
exec_state = json.loads(path.read_text())
exec_state['supplementalExecution'].setdefault('continuations', []).append(CONT)
path.write_text(json.dumps(exec_state, ensure_ascii=False, indent=2) + '\n')

# ── 3/4. HANDOFF.md and execution/handoff.md (append chapter only) ───────────
chapter = f'''

---

## 2026-10-03 CodeBuddy 补充返工会话 — {SESSION.name}（待独立审阅）

- 指令：`execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md`；权威复核：
  `execution/reviews/2026-10-03-codebuddy-supplements/`。
- 范围：SUP-01（TEST_ONLY，父任务 RP10-T02，原映射 **LR4-03**）、
  SUP-02（TEST_ONLY，父任务 RP08-T01，原映射 LR4-02）、
  SUP-03（REVIEW_ONLY，关联 RP04-T01/RP08-T01，原映射 **LR4-02**）；
  共有工作 LR5-04（交付/编号纠正）与 LR5-05（runner 失败清理）。
- 结果：rp10 正式套件 22/22、rp08 正式套件 12/12（各自全新自有 PostgreSQL 库）；
  build / typecheck / lint:undefined / git diff --check 均 0；三次 runner `SIMULATED_CONTROL` 通过；
  stop-fail 保留的自有集群已按记录条件手动释放。
- 业务源码改动数 = 0；只修改两个允许的正式测试，新增文档与证据只在本会话目录。
- 口径：局部套件 PASS ≠ 修复验收；`release = NOT_EVALUATED`；原 54 任务 / 306 验收 / 包状态 /
  门禁 / 31 历史开放项不变；SUP 不加入原任务图。
- 证据：`{SESSION_REL}/REVIEW_ENTRY.md`、`{SESSION_REL}/SESSION_SUMMARY.md`、
  `{SESSION_REL}/delivery-errata.md`、`{SESSION_REL}/final-integrity.json`。
'''

for rel in ('HANDOFF.md', 'execution/handoff.md'):
    target = PLAN / rel
    with target.open('a') as handle:
        handle.write(chapter)

# ── 5/6. history entries ─────────────────────────────────────────────────────
business = json.loads((SESSION / 'evidence/start-baseline.json').read_text())['businessSourceFileHashes']
current_business = {}
for rel in business:
    candidate = ROOT / rel
    current_business[rel] = sha256(candidate) if candidate.exists() else None
tests = {
    'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs':
        sha256(ROOT / 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'),
    'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs':
        sha256(ROOT / 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'),
}
current_source = dict(current_business)
current_source.update(tests)

appendix = {
    'formalTests': tests,
    'businessSourceFiles': len(current_business),
    'untrackedBusinessSourceFiles': [
        'rdpms-system/backend/src/modules/files/fileReadService.ts',
        'rdpms-system/backend/src/modules/projects/projectCommands.ts'],
    'pathBase': 'REPOSITORY_ROOT',
    'note': 'per-file SHA-256 of the current business sources and the two modified formal tests; '
            'no aggregate placeholder and no history self-hash',
}

path = PLAN / 'REVISION_HISTORY.json'
history = json.loads(path.read_text())
history['versions'].append({
    'version': history['versions'][-1]['version'],
    'date': '2026-10-03',
    'kind': 'SUPPLEMENTAL_TEST_AND_REVIEW_REWORK_APPEND_ONLY',
    'reason': '三个 SUP 有界返工（LR5-01/02/03 及共有 LR5-04/05）：只修改两个允许的正式测试与六个受控记录文件，'
              '业务源码零改动；纠正原映射 SUP-01→LR4-03、SUP-03→LR4-02；旧 session/旧审阅保持冻结，'
              '旧起始证据缺失如实记为 HISTORICAL_EVIDENCE_UNAVAILABLE，不倒填。',
    'changedOrAddedFiles': [
        'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs',
        'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs',
        f'{SESSION_REL}/ (new session artifacts)',
        'IMPLEMENTATION_STATE.json (append supplementalExecutions.continuations)',
        'execution/state.json (append supplementalExecution.continuations)',
        'HANDOFF.md (append chapter)', 'execution/handoff.md (append chapter)',
    ],
    'currentSourceHashes': current_source,
    'currentSourceHashAppendix': appendix,
    'reviewRef': f'{SESSION_REL}/REVIEW_ENTRY.md',
    'evidenceLimitsRef': f'{SESSION_REL}/SESSION_SUMMARY.md',
    'releaseStatus': 'NOT_EVALUATED',
})
path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n')

path = PLAN / 'EXECUTION_REVISION_HISTORY.json'
exec_history = json.loads(path.read_text())
exec_history['entries'].append({
    'id': f"EXEC-{SESSION.name}",
    'date': '2026-10-03',
    'scope': 'SUP-01/02/03 rework; TEST_ONLY + REVIEW_ONLY; business source unchanged',
    'pathBase': 'REPOSITORY_ROOT for source maps; PLAN_DIRECTORY for plan files',
    'sha256': {
        'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs': tests[
            'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'],
        'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs': tests[
            'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'],
        f'{SESSION_REL}/final-integrity.json': 'SEE_FINAL_INTEGRITY_SELF_EXCLUDED',
    },
    'currentSourceHashes': current_source,
    'currentSourceHashAppendix': appendix,
    'reviewRef': f'{SESSION_REL}/REVIEW_ENTRY.md',
    'validationRef': f'{SESSION_REL}/SUP-01/evidence/suite-run.json; {SESSION_REL}/SUP-02/evidence/suite-run.json',
    'entryPoint': f'{SESSION_REL}/authorization.json',
    'releaseStatus': 'NOT_EVALUATED',
    'frozenInputRef': f'{SESSION_REL}/evidence/start-baseline.json',
    'integrityRef': f'{SESSION_REL}/final-integrity.json',
    'note': 'append-only entry; self and cross history files are excluded from its sha256 map; '
            'original 54 tasks / 306 acceptance rows / package statuses / gates unchanged',
})
path.write_text(json.dumps(exec_history, ensure_ascii=False, indent=2) + '\n')

print('records appended')
