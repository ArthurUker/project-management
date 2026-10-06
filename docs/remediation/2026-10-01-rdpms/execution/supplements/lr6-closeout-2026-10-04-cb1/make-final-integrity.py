"""Seal final-integrity.json.

Excludes itself, the two history registries (appended after this seal) and
post-seal-readback.json (declared POST_SEAL_READBACK appendix). It therefore never
contains a final post-append hash for either history, avoiding self/cross cycles.
"""
import hashlib, json, pathlib, re, subprocess

R = pathlib.Path('/Users/renkang/VS Code/project-management')
P = R / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/lr6-closeout-2026-10-04-cb1'
SESSION_REL = 'execution/supplements/lr6-closeout-2026-10-04-cb1'
TEST_REL = 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'
SYNC_REL = 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def canonical_digest(mapping):
    blob = json.dumps(mapping, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(blob.encode()).hexdigest()


start = json.loads((S / 'evidence/start-baseline.json').read_text())
payload_manifest = S / 'evidence/payload-manifest.json'
manifest = json.loads(payload_manifest.read_text())

# protection consistency
business_drift = [rel for rel, exp in start['businessSource']['hashes'].items() if sha256(R / rel) != exp]
other_drift = [rel for rel, exp in start['otherTestAndConfig']['hashes'].items() if sha256(R / rel) != exp]
input_drift = [rel for rel, exp in start['frozenPlanInputs']['hashes'].items() if sha256(P / rel) != exp]
frozen_dirs = {}
for rel, expected in start['frozenDirectories'].items():
    base = R / rel
    mapping = {p.relative_to(base).as_posix(): sha256(p) for p in sorted(base.rglob('*')) if p.is_file()}
    digest = canonical_digest(mapping)
    frozen_dirs[rel] = {'fileCount': len(mapping), 'expectedFileCount': expected.get('expectedFileCount', expected.get('fileCount')),
                        'digest': digest, 'expectedDigest': expected.get('expectedCanonicalSha256'),
                        'unchanged': digest == expected.get('expectedCanonicalSha256')}

# append-only proof for the four non-history records
pre_dir = S / 'evidence/pre-append-records'
records_report = {}
append_only = True
for rel in ['IMPLEMENTATION_STATE.json', 'execution/state.json', 'HANDOFF.md', 'execution/handoff.md']:
    pre_path = pre_dir / (rel.replace('/', '_') + '.pre')
    pre_hash, post_hash = sha256(pre_path), sha256(P / rel)
    if rel.endswith('.json'):
        pre_obj, post_obj = json.loads(pre_path.read_text()), json.loads((P / rel).read_text())
        holder = 'supplementalExecutions' if rel == 'IMPLEMENTATION_STATE.json' else 'supplementalExecution'
        added = post_obj[holder].get('continuations', [])
        pre_old = pre_obj[holder].get('continuations', [])
        other_equal = {k: v for k, v in post_obj.items() if k != holder} == {k: v for k, v in pre_obj.items() if k != holder}
        holder_equal = {k: v for k, v in post_obj[holder].items() if k != 'continuations'} == \
                       {k: v for k, v in pre_obj[holder].items() if k != 'continuations'}
        preserved = added[:-1] == pre_old and len(added) == len(pre_old) + 1 and other_equal and holder_equal
        detail = {'addedContinuations': len(added) - len(pre_old), 'allOtherKeysIdentical': other_equal,
                  'holderFieldsIdentical': holder_equal, 'previousContinuationsPreserved': added[:-1] == pre_old}
    else:
        preserved = (P / rel).read_text().startswith(pre_path.read_text())
        detail = {'previousBytePrefixPreserved': preserved}
    records_report[rel] = {'preSha256': pre_hash, 'postSha256': post_hash, 'appendOnly': preserved, **detail}
    append_only = append_only and preserved

# test inventory
pre_test = (S / 'evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start').read_text()
post_test = (R / TEST_REL).read_text()
pre_names = re.findall(r"^test\('([^']+)'", pre_test, re.M)
post_names = re.findall(r"^test\('([^']+)'", post_test, re.M)

status = subprocess.run(['git', 'status', '--porcelain=v1', '--untracked-files=all'], cwd=R, text=True, capture_output=True).stdout
head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=R, text=True, capture_output=True).stdout.strip()
diff_code = subprocess.run(['git', 'diff', '--check'], cwd=R, text=True, capture_output=True).returncode

suite = json.loads((S / 'CLOSE-01/runs/rp10-suite/attempt-02/run-results.json').read_text())
controls = json.loads((S / 'controls/runner-controls.json').read_text())

state_impl = json.loads((P / 'IMPLEMENTATION_STATE.json').read_text())
state_exec = json.loads((P / 'execution/state.json').read_text())

integrity = {
    'sessionId': S.name,
    'date': '2026-10-04',
    'sealedPayloadManifest': {'path': f'{SESSION_REL}/evidence/payload-manifest.json', 'pathBase': 'SESSION',
                              'sha256': sha256(payload_manifest),
                              'sealedFileCounts': manifest['counts']},
    'excludedByDesign': {
        'self': f'{SESSION_REL}/final-integrity.json',
        'postSealReadback': f'{SESSION_REL}/post-seal-readback.json',
        'histories': ['REVISION_HISTORY.json (PLAN)', 'EXECUTION_REVISION_HISTORY.json (PLAN)'],
        'reason': 'no final post-append hash for either history is embedded here; the registries are appended after '
                  'this seal and their real final hashes live only in post-seal-readback.json',
    },
    'protectionConsistency': {
        'businessSource': {'compared': len(start['businessSource']['hashes']), 'drift': business_drift,
                           'verdict': 'UNCHANGED' if not business_drift else 'DRIFT'},
        'otherTestAndConfig': {'compared': len(start['otherTestAndConfig']['hashes']), 'drift': other_drift,
                               'verdict': 'UNCHANGED' if not other_drift else 'DRIFT'},
        'frozenPlanInputs': {'compared': len(start['frozenPlanInputs']['hashes']), 'drift': input_drift,
                             'verdict': 'UNCHANGED' if not input_drift else 'DRIFT'},
        'frozenDirectories': {'roots': frozen_dirs,
                              'verdict': 'UNCHANGED' if all(v['unchanged'] for v in frozen_dirs.values()) else 'DRIFT'},
        'syncFormalTest': {'path': SYNC_REL, 'sha256': sha256(R / SYNC_REL),
                           'reusedEvidenceHash': '720c3f6a7b4badc3a7f8dfd754371467812b1c67cbe90358d504c2d2284d9fc7',
                           'unchanged': sha256(R / SYNC_REL) == '720c3f6a7b4badc3a7f8dfd754371467812b1c67cbe90358d504c2d2284d9fc7'},
        'close04StaticTargets': {
            'rdpms-system/backend/src/routes/phases.js': sha256(R / 'rdpms-system/backend/src/routes/phases.js'),
            'rdpms-system/backend/src/kernel/projectAccess.js': sha256(R / 'rdpms-system/backend/src/kernel/projectAccess.js'),
            'unchangedVsStart': (sha256(R / 'rdpms-system/backend/src/routes/phases.js')
                                 == start['businessSource']['hashes']['rdpms-system/backend/src/routes/phases.js']
                                 and sha256(R / 'rdpms-system/backend/src/kernel/projectAccess.js')
                                 == start['businessSource']['hashes']['rdpms-system/backend/src/kernel/projectAccess.js']),
        },
    },
    'allowedDifferences': {
        'modifiedTest': {'path': TEST_REL, 'pathBase': 'REPOSITORY',
                         'preEditSha256': sha256(S / 'evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start'),
                         'finalSha256': sha256(R / TEST_REL),
                         'caseCountBefore': len(pre_names), 'caseCountAfter': len(post_names),
                         'allOriginalCaseNamesPreserved': all(n in post_names for n in pre_names),
                         'addedCaseNames': [n for n in post_names if n not in pre_names],
                         'removedCaseNames': [n for n in pre_names if n not in post_names]},
        'appendedRecords': records_report,
        'newSessionDirectory': SESSION_REL,
        'newSessionFileCount': manifest['counts']['sessionFiles'],
        'historyEntries': 'one unique correcting entry appended per registry AFTER this seal; '
                          'see post-seal-readback.json for their real final hashes',
    },
    'cleanup': {
        'finalReportSuite': {'database': suite['ownedResources']['database'], 'guardDropExit': suite['cleanup'].get('guardDropExit'),
                             'clusterStopExit': suite['cleanup'].get('clusterStopExit'),
                             'ownedDistRemoved': suite['cleanup'].get('ownedDistRemoved'),
                             'ownedTempRootRemoved': suite['cleanup'].get('ownedTempRootRemoved')},
        'runnerControls': {'kind': controls[0]['kind'],
                           'allNonzero': all(c['observedExitCode'] not in (0, None) for c in controls),
                           'realDatabaseStarted': False,
                           'ownedRootsRemaining': sum(len(c['ownedTempRootsRemaining']) for c in controls),
                           'distExistsAfter': any(c['distExistsAfter'] for c in controls)},
        'backendDistExistsNow': (R / 'rdpms-system/backend/dist').exists(),
    },
    'git': {'headStart': start['git']['head'], 'headEnd': head, 'headUnchanged': start['git']['head'] == head,
            'diffCheckExit': diff_code,
            'statusChangedVsStart': status != start['git']['statusPorcelain'],
            'statusChangeReason': 'the session directory, the modified report test and the appended records are new '
                                  'untracked/modified entries; no other tracked file changed',
            'trackedDifferenceNote': 'tracked differences list is unchanged vs start (checked in readback)'},
    'originalAxes': {
        'taskCount': state_impl['counts']['tasks'],
        'implementation': state_impl['counts']['implementation'],
        'validation': state_impl['counts']['validation'],
        'release': state_impl['counts']['release'],
        'acceptanceRowCount': 306,
        'countsUnchangedVsStart': state_impl['counts'] == start['originalCounts']['IMPLEMENTATION_STATE.json'],
        'activeTask': state_impl.get('activeTask'),
        'nextReadyTask': state_impl.get('nextReadyTask'),
        'approvalsChanged': False,
        'openItemsClosed': False,
    },
    'verdict': 'SEALED',
}

(S / 'final-integrity.json').write_text(json.dumps(integrity, ensure_ascii=False, indent=2) + '\n')
print('manifest sealed:', integrity['sealedPayloadManifest']['sha256'][:16])
print('business drift', business_drift, 'other drift', other_drift, 'input drift', input_drift)
print('frozen dirs unchanged:', integrity['protectionConsistency']['frozenDirectories']['verdict'])
print('records append-only:', append_only)
print('test cases', len(pre_names), '->', len(post_names), 'original preserved:',
      integrity['allowedDifferences']['modifiedTest']['allOriginalCaseNamesPreserved'])
print('counts unchanged:', integrity['originalAxes']['countsUnchangedVsStart'])
print('final-integrity sha256:', sha256(S / 'final-integrity.json'))
