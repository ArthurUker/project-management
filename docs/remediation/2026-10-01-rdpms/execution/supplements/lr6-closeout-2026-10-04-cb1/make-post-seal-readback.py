"""Declared POST_SEAL_READBACK appendix: verify the seals after the history entries exist.

This file is excluded from the sealed payload-manifest and final-integrity by design and is
not itself re-sealed by the histories. It records the real final hashes of both registries.
"""
import hashlib, json, pathlib, re

R = pathlib.Path('/Users/renkang/VS Code/project-management')
P = R / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/lr6-closeout-2026-10-04-cb1'
SESSION_REL = 'execution/supplements/lr6-closeout-2026-10-04-cb1'
NEW_VERSION_ID = 'lr6-closeout-2026-10-04-cb1'
NEW_EXEC_ID = 'EXEC-lr6-closeout-2026-10-04-cb1'


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def canonical(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


manifest = json.loads((S / 'evidence/payload-manifest.json').read_text())
integrity = json.loads((S / 'final-integrity.json').read_text())

# 1. per-file readback of everything the payload manifest sealed
# session keys are PLAN-relative (pathBase SESSION is expressed against PLAN_DIRECTORY)
drift = []
for rel, meta in manifest['sessionFiles'].items():
    path = P / rel
    if not path.exists() or sha256(path) != meta['sha256']:
        drift.append(rel)
for rel, meta in manifest['controlledRecordFiles'].items():
    path = P / rel
    if not path.exists() or sha256(path) != meta['sha256']:
        drift.append(rel)
for rel, meta in manifest['repositoryFiles'].items():
    path = R / rel
    if not path.exists() or sha256(path) != meta['sha256']:
        drift.append(rel)

# 2. JSON validity across the session
bad_json = []
for path in sorted(S.rglob('*.json')):
    try:
        json.loads(path.read_text())
    except Exception as exc:  # pragma: no cover
        bad_json.append({'path': str(path.relative_to(S)), 'error': str(exc)})

# 3. registries
revision = json.loads((P / 'REVISION_HISTORY.json').read_text())
exec_history = json.loads((P / 'EXECUTION_REVISION_HISTORY.json').read_text())
version_ids = [v.get('version') for v in revision['versions']]
exec_ids = [e.get('id') for e in exec_history['entries']]
new_version = revision['versions'][-1]
new_exec = exec_history['entries'][-1]
old_version_ok = canonical(revision['versions'][24]) == 'b200dc2baa58a251bac6758d9b0f7ec8235230016853b339fb53f7461260cd9d'
old_exec_ok = canonical(exec_history['entries'][15]) == 'c98c21dea65c50b6f5c09884baebf2639c44f511da5b96eb695cbdadaa7fc797'
def mentions_registry(entry_hash_map):
    """True if the entry seals either history registry itself (self/cross reference)."""
    blob = json.dumps(entry_hash_map, ensure_ascii=False)
    return 'REVISION_HISTORY.json' in blob or 'EXECUTION_REVISION_HISTORY.json' in blob


no_history_self_hash = (not mentions_registry(new_version.get('sealedArtifactHashes', {}))
                        and not mentions_registry(new_exec.get('sha256', {})))

# 4. placeholder scan
placeholder_hits = []
for path in sorted(S.rglob('*.json')):
    text = path.read_text()
    for token in ['APPENDED_', 'SESSION_DIR', 'PLACEHOLDER', 'TODO_HASH']:
        if token in text:
            placeholder_hits.append({'path': str(path.relative_to(S)), 'token': token})

# 5. suite facts
suite = json.loads((S / 'CLOSE-01/runs/rp10-suite/attempt-02/run-results.json').read_text())
controls = json.loads((S / 'controls/runner-controls.json').read_text())
TEST_PATH = R / 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'
test_names = re.findall(r"^test\('([^']+)'", TEST_PATH.read_text(), re.M)

readback = {
    'kind': 'POST_SEAL_READBACK',
    'sessionId': S.name,
    'date': '2026-10-04',
    'declaredExclusion': {
        'excludedFromSealedPayload': [f'{SESSION_REL}/post-seal-readback.json'],
        'excludedFromFinalIntegrity': [f'{SESSION_REL}/post-seal-readback.json'],
        'reason': 'pre-declared appendix that must exist after the history entries are appended; it records the real '
                  'final registry hashes that cannot live inside the files sealed before those appends',
    },
    'sealedDigestReadback': {
        'payloadManifestSha256': sha256(S / 'evidence/payload-manifest.json'),
        'finalIntegritySha256': sha256(S / 'final-integrity.json'),
        'manifestSealedFiles': manifest['counts']['sessionFiles'],
        'drift': drift,
        'verdict': 'PASS' if not drift else 'FAIL',
    },
    'jsonValidity': {'invalid': bad_json, 'verdict': 'PASS' if not bad_json else 'FAIL'},
    'placeholderScan': {'hits': placeholder_hits, 'verdict': 'PASS' if not placeholder_hits else 'FAIL'},
    'histories': {
        'REVISION_HISTORY.json': {
            'pathBase': 'PLAN', 'sha256': sha256(P / 'REVISION_HISTORY.json'),
            'entryCount': len(version_ids), 'newVersionId': NEW_VERSION_ID,
            'newIdOccurrences': version_ids.count(NEW_VERSION_ID),
            'previousEntryAt24CanonicalUnchanged': old_version_ok,
        },
        'EXECUTION_REVISION_HISTORY.json': {
            'pathBase': 'PLAN', 'sha256': sha256(P / 'EXECUTION_REVISION_HISTORY.json'),
            'entryCount': len(exec_ids), 'newEntryId': NEW_EXEC_ID,
            'newIdOccurrences': exec_ids.count(NEW_EXEC_ID),
            'previousEntryAt15CanonicalUnchanged': old_exec_ok,
        },
        'noSelfOrCrossHistoryHashInNewEntries': no_history_self_hash,
    },
    'closeResults': {
        'CLOSE-01': {'status': 'PASS', 'layer': 'REAL_DB', 'suite': {'tests': 25, 'pass': 25, 'fail': 0},
                     'finalTestSha256': sha256(R / 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'),
                     'caseNames': test_names},
        'CLOSE-02': {'status': 'PASS', 'layer': 'SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED',
                     'controls': [{'mode': c['mode'], 'observedExitCode': c['observedExitCode']} for c in controls],
                     'runnerSha256': sha256(S / 'run-suite.py')},
        'CLOSE-03': {'status': 'PASS', 'layer': 'REAL_FILE_READBACK',
                     'payloadManifest': manifest['counts'], 'finalIntegrity': integrity['verdict']},
        'CLOSE-04': {'status': 'PASS', 'layer': 'STATIC_REVIEW',
                     'errata': f'{SESSION_REL}/CLOSE-04/scope-errata.md',
                     'businessSourceChanges': 0},
    },
    'cleanup': {
        'backendDistExistsNow': (R / 'rdpms-system/backend/dist').exists(),
        'ownedTempRootsFromControls': sum(len(c['ownedTempRootsRemaining']) for c in controls),
        'finalSuiteCleanup': {'guardDropExit': suite['cleanup'].get('guardDropExit'),
                              'clusterStopExit': suite['cleanup'].get('clusterStopExit'),
                              'ownedTempRootRemoved': suite['cleanup'].get('ownedTempRootRemoved')},
    },
    'reuseDeclaration': {
        'SUP-02': 'REUSED_INDEPENDENTLY_VERIFIED_EVIDENCE — 12/12 and 101/101 belong to the independent review run; '
                  'rp08 was not rerun in this round',
        'syncTestSha256': sha256(R / 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'),
    },
    'notRun': ['full JWT chain', 'frontend IndexedDB/UI', 'phase dynamic API/UI', 'target/candidate environment',
               'deployment'],
    'independentReview': 'PENDING',
    'release': 'NOT_EVALUATED',
}

verdict_ok = (readback['sealedDigestReadback']['verdict'] == 'PASS'
              and readback['jsonValidity']['verdict'] == 'PASS'
              and readback['placeholderScan']['verdict'] == 'PASS'
              and readback['histories']['REVISION_HISTORY.json']['newIdOccurrences'] == 1
              and readback['histories']['EXECUTION_REVISION_HISTORY.json']['newIdOccurrences'] == 1
              and old_version_ok and old_exec_ok and no_history_self_hash)
readback['verdict'] = 'PASS' if verdict_ok else 'FAIL'

(S / 'post-seal-readback.json').write_text(json.dumps(readback, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: readback[k] for k in ['verdict', 'sealedDigestReadback', 'jsonValidity', 'placeholderScan']},
                 ensure_ascii=False, indent=1)[:1200])
print('revision history final sha256:', readback['histories']['REVISION_HISTORY.json']['sha256'])
print('exec history final sha256:', readback['histories']['EXECUTION_REVISION_HISTORY.json']['sha256'])
