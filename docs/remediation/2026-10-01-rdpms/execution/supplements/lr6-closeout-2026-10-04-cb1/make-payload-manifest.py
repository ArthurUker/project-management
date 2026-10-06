"""Build evidence/payload-manifest.json.

Excludes by declared design: payload-manifest.json (self), final-integrity.json,
post-seal-readback.json (POST_SEAL_READBACK appendix), REVISION_HISTORY.json and
EXECUTION_REVISION_HISTORY.json (appended after this manifest is sealed).
"""
import hashlib, json, pathlib

R = pathlib.Path('/Users/renkang/VS Code/project-management')
P = R / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/lr6-closeout-2026-10-04-cb1'
SESSION_REL = 'execution/supplements/lr6-closeout-2026-10-04-cb1'
# only these exact session-relative paths are excluded; control fallback logs stay sealed
EXCLUDED_SESSION_PATHS = {'evidence/payload-manifest.json', 'final-integrity.json',
                          'post-seal-readback.json', 'run-results-fallback.json'}
EXCLUDED_NAMES = {'REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json'}


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


session_files = {}
excluded_present = []
for path in sorted(S.rglob('*')):
    if not path.is_file():
        continue
    relative = path.relative_to(S).as_posix()
    if relative in EXCLUDED_SESSION_PATHS or path.name in EXCLUDED_NAMES:
        excluded_present.append(f'{SESSION_REL}/{relative}')
        continue
    session_files[f'{SESSION_REL}/{relative}'] = {'pathBase': 'SESSION', 'sha256': sha256(path)}

records = {}
for rel in ['IMPLEMENTATION_STATE.json', 'execution/state.json', 'HANDOFF.md', 'execution/handoff.md']:
    records[rel] = {'pathBase': 'PLAN', 'sha256': sha256(P / rel)}

repo_files = {
    'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs':
        {'pathBase': 'REPOSITORY', 'sha256': sha256(R / 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'),
         'role': 'the only existing code file modified this round'},
    'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs':
        {'pathBase': 'REPOSITORY', 'sha256': sha256(R / 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'),
         'role': 'read-only reference; SUP-02 evidence reuse; unchanged'},
    'rdpms-system/backend/src/routes/phases.js':
        {'pathBase': 'REPOSITORY', 'sha256': sha256(R / 'rdpms-system/backend/src/routes/phases.js'),
         'role': 'CLOSE-04 static reference; unchanged'},
    'rdpms-system/backend/src/kernel/projectAccess.js':
        {'pathBase': 'REPOSITORY', 'sha256': sha256(R / 'rdpms-system/backend/src/kernel/projectAccess.js'),
         'role': 'CLOSE-04 static reference; unchanged'},
}

runner = {'path': f'{SESSION_REL}/run-suite.py', 'pathBase': 'SESSION', 'sha256': sha256(S / 'run-suite.py')}
controls = {'path': f'{SESSION_REL}/controls/run-runner-controls.py', 'pathBase': 'SESSION',
            'sha256': sha256(S / 'controls/run-runner-controls.py'),
            'summary': f'{SESSION_REL}/controls/runner-controls.json'}
logs = {rel: meta for rel, meta in session_files.items()
        if rel.endswith('.log') or '/runs/' in rel or rel.endswith('.json') and '/runs/' in rel}
logs_summary = {
    'finalReportSuite': f'{SESSION_REL}/CLOSE-01/runs/rp10-suite/attempt-02/integration-suite.log',
    'finalReportSuiteResults': f'{SESSION_REL}/CLOSE-01/runs/rp10-suite/attempt-02/run-results.json',
    'failedAttempt01': f'{SESSION_REL}/CLOSE-01/runs/rp10-suite/attempt-01/integration-suite.log',
    'runnerControls': [f'{SESSION_REL}/controls/{mode}/control-output.log' for mode in
                       ['build-nonzero', 'drop-exception', 'stop-nonzero', 'build-timeout',
                        'suite-spawn-exception', 'result-write-oserror']],
    'supersededHarnessRun': f'{SESSION_REL}/controls/_superseded-attempts/first-harness-run/build-nonzero/control-output.log',
}

payload = {
    'sessionId': S.name,
    'date': '2026-10-04',
    'generator': f'{SESSION_REL}/make-payload-manifest.py',
    'excludedByDesign': {
        'files': sorted(set([f'{SESSION_REL}/evidence/payload-manifest.json',
                             f'{SESSION_REL}/final-integrity.json',
                             f'{SESSION_REL}/post-seal-readback.json',
                             'REVISION_HISTORY.json (PLAN)', 'EXECUTION_REVISION_HISTORY.json (PLAN)'])),
        'reason': 'self, sealed-final, POST_SEAL_READBACK appendix and the two registries appended after this '
                  'manifest is sealed; including them would create self/cross-hash cycles',
    },
    'excludedNamesPresentInSession': excluded_present,
    'counts': {'sessionFiles': len(session_files), 'sessionRecords': len(records), 'repoFiles': len(repo_files)},
    'sessionFiles': session_files,
    'controlledRecordFiles': records,
    'repositoryFiles': repo_files,
    'runner': runner,
    'controls': controls,
    'logs': {'paths': sorted(logs.keys()), 'keyLogs': logs_summary},
    'currentFormalTest': {
        'path': 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs',
        'pathBase': 'REPOSITORY',
        'sha256': sha256(R / 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'),
        'preEditSha256': sha256(S / 'evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start'),
    },
    'fourNonHistoryRecords': records,
    'pathBases': {'REPOSITORY': str(R), 'PLAN': str(P), 'SESSION': str(S)},
}

out = S / 'evidence/payload-manifest.json'
out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
print('session files sealed:', len(session_files))
print('records:', len(records), 'repo files:', len(repo_files))
print('manifest sha256:', sha256(out))
print('excluded present:', excluded_present)
print('runner sha256:', runner['sha256'])
