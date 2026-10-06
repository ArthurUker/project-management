"""Append one unique correcting entry per registry (CLOSE-03 sealing step d).

Guarantees:
  * the new ids do not exist before the append (count 0) and exist exactly once after;
  * the old entries at versions[24] / entries[15] keep their canonical SHA256 unchanged;
  * no self or cross-history final hash is embedded.
"""
import hashlib, json, pathlib

R = pathlib.Path('/Users/renkang/VS Code/project-management')
P = R / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/lr6-closeout-2026-10-04-cb1'
SESSION_REL = 'execution/supplements/lr6-closeout-2026-10-04-cb1'
REVIEW_REL = 'execution/reviews/2026-10-04-codebuddy-supplement-rework'
OLD_REL = 'execution/supplements/test-contract-rework-2026-10-03-cb1'
TEST_REL = 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'
NEW_VERSION_ID = 'lr6-closeout-2026-10-04-cb1'
NEW_EXEC_ID = 'EXEC-lr6-closeout-2026-10-04-cb1'


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def canonical(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


payload_manifest = S / 'evidence/payload-manifest.json'
final_integrity = S / 'final-integrity.json'
manifest_hash = sha256(payload_manifest)
integrity_hash = sha256(final_integrity)
test_hash = sha256(R / TEST_REL)
session_summary_hash = sha256(S / 'SESSION_SUMMARY.md')
review_entry_hash = sha256(S / 'REVIEW_ENTRY.md')
runner_hash = sha256(S / 'run-suite.py')

sealed = {
    f'{SESSION_REL}/evidence/payload-manifest.json': {'pathBase': 'SESSION', 'sha256': manifest_hash},
    f'{SESSION_REL}/final-integrity.json': {'pathBase': 'SESSION', 'sha256': integrity_hash},
    f'{SESSION_REL}/SESSION_SUMMARY.md': {'pathBase': 'SESSION', 'sha256': session_summary_hash},
    f'{SESSION_REL}/REVIEW_ENTRY.md': {'pathBase': 'SESSION', 'sha256': review_entry_hash},
    f'{SESSION_REL}/run-suite.py': {'pathBase': 'SESSION', 'sha256': runner_hash},
    TEST_REL: {'pathBase': 'REPOSITORY', 'sha256': test_hash},
}

corrects = {
    'REVISION_HISTORY.json': {'arrayIndexZeroBased': 24,
                              'existingId': 'post-2026-10-03-codebuddy-supplements-independent-review',
                              'entryCanonicalSha256': 'b200dc2baa58a251bac6758d9b0f7ec8235230016853b339fb53f7461260cd9d',
                              'sessionRef': OLD_REL + '/',
                              'problem': 'duplicate version id with versions[23]'},
    'EXECUTION_REVISION_HISTORY.json': {'arrayIndexZeroBased': 15,
                                        'existingId': 'EXEC-test-contract-rework-2026-10-03-cb1',
                                        'entryCanonicalSha256': 'c98c21dea65c50b6f5c09884baebf2639c44f511da5b96eb695cbdadaa7fc797',
                                        'sessionRef': OLD_REL + '/',
                                        'problem': 'old executor session entry; no unique id for the LR6 delivery'},
}

# ── REVISION_HISTORY.json ───────────────────────────────────────────────────
path = P / 'REVISION_HISTORY.json'
history = json.loads(path.read_text())
before_ids = [v.get('version') for v in history['versions']]
assert before_ids.count(NEW_VERSION_ID) == 0, 'new version id already present'
old_entry = history['versions'][24]
assert canonical(old_entry) == corrects['REVISION_HISTORY.json']['entryCanonicalSha256'], \
    'versions[24] canonical hash does not match the manifest reference'

history['versions'].append({
    'version': NEW_VERSION_ID,
    'date': '2026-10-04',
    'kind': 'LR6_CLOSEOUT_CORRECTIVE_ENTRY_APPEND_ONLY',
    'sessionId': S.name,
    'reason': 'LR6-01..04 bounded closeout: report-test precision fix (full identity/id + mandatory marker, '
              'draftWriteBarrier real upsert, three legacy/modern/sync draft races with finally/timer/settle), '
              'new-session runner primary-exception and result-persistence hardening with six safe simulated '
              'controls, unique corrective history ids, and a two-sentence phase scope erratum. '
              'No business source change; the previous session remains frozen.',
    'correctsRef': corrects['REVISION_HISTORY.json'],
    'changedOrAddedFiles': [
        TEST_REL,
        f'{SESSION_REL}/ (new session artifacts)',
        'IMPLEMENTATION_STATE.json (append supplementalExecutions.continuations)',
        'execution/state.json (append supplementalExecution.continuations)',
        'HANDOFF.md (append chapter)', 'execution/handoff.md (append chapter)',
    ],
    'currentSourceHashes': {
        TEST_REL: test_hash,
        'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs':
            sha256(R / 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'),
    },
    'sealedArtifactHashes': sealed,
    'reviewRef': {'path': f'{REVIEW_REL}/REVIEW.md', 'pathBase': 'PLAN'},
    'evidenceLimitsRef': {'path': f'{SESSION_REL}/SESSION_SUMMARY.md', 'pathBase': 'PLAN'},
    'releaseStatus': 'NOT_EVALUATED',
    'independentReview': 'PENDING',
    'historyHashPolicy': 'this entry does not contain any final hash of either history registry; '
                         'post-seal-readback.json records them outside the sealed payload',
})
path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n')

# ── EXECUTION_REVISION_HISTORY.json ─────────────────────────────────────────
path = P / 'EXECUTION_REVISION_HISTORY.json'
exec_history = json.loads(path.read_text())
before_exec_ids = [e.get('id') for e in exec_history['entries']]
assert before_exec_ids.count(NEW_EXEC_ID) == 0, 'new exec id already present'
old_exec_entry = exec_history['entries'][15]
assert canonical(old_exec_entry) == corrects['EXECUTION_REVISION_HISTORY.json']['entryCanonicalSha256'], \
    'entries[15] canonical hash does not match the manifest reference'

exec_history['entries'].append({
    'id': NEW_EXEC_ID,
    'date': '2026-10-04',
    'sessionId': S.name,
    'scope': 'LR6-01..04 bounded closeout; TEST_ONLY + RUNNER_ONLY(new session) + DOCUMENT_ERRATUM; '
             'business source unchanged, sync formal test unchanged',
    'pathBase': 'REPOSITORY for source maps; PLAN for plan files; SESSION for session artifacts',
    'correctsRef': corrects['EXECUTION_REVISION_HISTORY.json'],
    'sha256': sealed,
    'currentSourceHashes': {
        TEST_REL: test_hash,
        'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs':
            sha256(R / 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'),
    },
    'reviewRef': {'path': f'{REVIEW_REL}/REVIEW.md', 'pathBase': 'PLAN'},
    'validationRef': {'path': f'{SESSION_REL}/CLOSE-01/evidence/suite-run.json', 'pathBase': 'PLAN'},
    'entryPoint': {'path': f'{SESSION_REL}/authorization.json', 'pathBase': 'PLAN'},
    'releaseStatus': 'NOT_EVALUATED',
    'independentReview': 'PENDING',
    'frozenInputRef': {'path': f'{SESSION_REL}/evidence/start-baseline.json', 'pathBase': 'PLAN'},
    'integrityRef': {'path': f'{SESSION_REL}/final-integrity.json', 'pathBase': 'PLAN'},
    'note': 'append-only corrective entry; no self or cross-history final hash is embedded; original 54/306 axes, '
            'package statuses, gates and approvals unchanged',
})
path.write_text(json.dumps(exec_history, ensure_ascii=False, indent=2) + '\n')

after_version_ids = [v.get('version') for v in json.loads((P / 'REVISION_HISTORY.json').read_text())['versions']]
after_exec_ids = [e.get('id') for e in json.loads((P / 'EXECUTION_REVISION_HISTORY.json').read_text())['entries']]
print('versions', len(before_ids), '->', len(after_version_ids), '| new id count', after_version_ids.count(NEW_VERSION_ID))
print('entries', len(before_exec_ids), '->', len(after_exec_ids), '| new id count', after_exec_ids.count(NEW_EXEC_ID))
print('old version entry unchanged:', canonical(json.loads((P / 'REVISION_HISTORY.json').read_text())['versions'][24])
      == corrects['REVISION_HISTORY.json']['entryCanonicalSha256'])
print('old exec entry unchanged:', canonical(json.loads((P / 'EXECUTION_REVISION_HISTORY.json').read_text())['entries'][15])
      == corrects['EXECUTION_REVISION_HISTORY.json']['entryCanonicalSha256'])
print('revision history sha256:', sha256(P / 'REVISION_HISTORY.json'))
print('exec history sha256:', sha256(P / 'EXECUTION_REVISION_HISTORY.json'))
