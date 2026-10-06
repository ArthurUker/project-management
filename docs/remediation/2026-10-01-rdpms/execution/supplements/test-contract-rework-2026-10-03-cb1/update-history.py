"""Correct the two entries appended by this session so their digests match the FINAL state.

Only the entries created by this session are touched (versions[-1] / entries[-1]).
Older entries, frozen inputs and every other file stay untouched.
"""
import hashlib, json, pathlib

SESSION = pathlib.Path(__file__).resolve().parents[0]
ROOT = SESSION.parents[5]
PLAN = SESSION.parents[2]
SESSION_REL = 'execution/supplements/test-contract-rework-2026-10-03-cb1'


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


start = json.loads((SESSION / 'evidence/start-baseline.json').read_text())
business = {}
for rel in start['businessSourceFileHashes']:
    path = ROOT / rel
    business[rel] = sha256(path) if path.exists() else None
tests = {
    'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs':
        sha256(ROOT / 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'),
    'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs':
        sha256(ROOT / 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'),
}
current_source = dict(business)
current_source.update(tests)
appendix = {
    'formalTests': tests,
    'businessSourceFiles': len(business),
    'untrackedBusinessSourceFiles': start['untrackedBusinessSourceFiles'],
    'pathBase': 'REPOSITORY_ROOT',
    'note': 'per-file SHA-256 of the final business sources and final formal tests; no aggregate placeholder, '
            'no history self-hash; recomputed after the final suite re-runs',
}
sealed = {
    f'{SESSION_REL}/final-integrity.json': sha256(SESSION / 'final-integrity.json'),
    f'{SESSION_REL}/SESSION_SUMMARY.md': sha256(SESSION / 'SESSION_SUMMARY.md'),
    f'{SESSION_REL}/REVIEW_ENTRY.md': sha256(SESSION / 'REVIEW_ENTRY.md'),
    f'{SESSION_REL}/delivery-errata.md': sha256(SESSION / 'delivery-errata.md'),
    f'{SESSION_REL}/resume.md': sha256(SESSION / 'resume.md'),
    f'{SESSION_REL}/run-suite.py': sha256(SESSION / 'run-suite.py'),
}

path = PLAN / 'REVISION_HISTORY.json'
history = json.loads(path.read_text())
version = history['versions'][-1]
version['currentSourceHashes'] = current_source
version['currentSourceHashAppendix'] = appendix
version['sealedArtifactHashes'] = sealed
version['digestCorrectionNote'] = ('本 entry 的摘要在最终套件重跑与用例名回改后重算，'
                                   '以保证记录与最终状态一致；早期写入的旧摘要已被本版覆盖（仅本轮新增 entry）。')
path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n')

path = PLAN / 'EXECUTION_REVISION_HISTORY.json'
exec_history = json.loads(path.read_text())
entry = exec_history['entries'][-1]
entry['currentSourceHashes'] = current_source
entry['currentSourceHashAppendix'] = appendix
entry['sha256'] = dict(sealed)
entry['sha256'].update({
    'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs':
        tests['rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'],
    'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs':
        tests['rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'],
})
entry['digestCorrectionNote'] = ('本 entry 的摘要在最终套件重跑与用例名回改后重算；'
                                 '两份 history 自身不进各自的 sha256 map，避免自包含。')
path.write_text(json.dumps(exec_history, ensure_ascii=False, indent=2) + '\n')

print('history digests corrected to final state')
print('final-integrity sha256', sealed[f'{SESSION_REL}/final-integrity.json'])
