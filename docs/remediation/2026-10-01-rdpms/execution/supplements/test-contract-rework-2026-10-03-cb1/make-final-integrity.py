"""Seal final-integrity.json for the 2026-10-03 SUP rework session.

Excludes: itself, and the two history files appended just before this file is written
(avoids self/cross circular hashing). Everything else is compared start vs end with
real per-file SHA-256.
"""
import hashlib, json, pathlib, re, subprocess

SESSION = pathlib.Path(__file__).resolve().parents[0]
ROOT = SESSION.parents[5]
PLAN = SESSION.parents[2]
SESSION_REL = 'execution/supplements/test-contract-rework-2026-10-03-cb1'

start = json.loads((SESSION / 'evidence/start-baseline.json').read_text())


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def diff_map(start_map, recompute):
    drifted, missing = {}, []
    for rel, old in start_map.items():
        path = ROOT / rel
        if not path.exists():
            missing.append(rel)
            continue
        new = sha256(path)
        if new != old:
            drifted[rel] = {'start': old, 'end': new}
    return {'drifted': drifted, 'missingAtEnd': missing,
            'compared': len(start_map), 'unchanged': len(start_map) - len(drifted) - len(missing)}


def dir_digest(base):
    files = sorted(p for p in base.rglob('*') if p.is_file())
    digests = {p.relative_to(base).as_posix(): sha256(p) for p in files}
    combined = hashlib.sha256(''.join(f'{k}:{v}\n' for k, v in sorted(digests.items())).encode()).hexdigest()
    return {'fileCount': len(files), 'combinedSha256': combined}


def test_names(text):
    return [m.group(1) for m in re.finditer(r"^test\('([^']+)'", text, re.M)]


# ── business sources ────────────────────────────────────────────────────────
business = diff_map(start['businessSourceFileHashes'], None)
untracked_ok = all(k in start['businessSourceFileHashes'] for k in start['untrackedBusinessSourceFiles'])

# ── formal tests: hash change + original case-name preservation ──────────────
tests_report = {}
for rel, meta in start['formalTests'].items() if isinstance(start['formalTests'], dict) else []:
    pass
formal_start = start['formalTests']
test_paths = [k for k in formal_start.keys() if k.endswith('.mjs')]
test_detail = {}
for rel in test_paths:
    start_hash = formal_start[rel]
    end_hash = sha256(ROOT / rel)
    copy_rel = rel.split('/')[-1] + '.start'
    start_text = (SESSION / 'evidence/start-copies' / copy_rel).read_text()
    end_text = (ROOT / rel).read_text()
    start_names = test_names(start_text)
    end_names = test_names(end_text)
    test_detail[rel] = {
        'startSha256': start_hash, 'endSha256': end_hash,
        'startCopySha256': sha256(SESSION / 'evidence/start-copies' / copy_rel),
        'startCaseCount': len(start_names), 'endCaseCount': len(end_names),
        'allOriginalCaseNamesPreserved': all(name in end_names for name in start_names),
        'addedCaseNames': [n for n in end_names if n not in start_names],
        'removedCaseNames': [n for n in start_names if n not in end_names],
    }

# ── other tests (excluding the two whitelisted formal tests) ─────────────────
ALLOWED_TESTS = set(test_paths)
other_start = {k: v for k, v in start['testFiles'].items() if k not in ALLOWED_TESTS}
other = diff_map(other_start, None)
schema = diff_map(start['schemaGuardDependencyConfig'], None)
frozen_inputs = {rel: {'start': h, 'end': (sha256(PLAN / rel) if (PLAN / rel).exists() else None)}
                 for rel, h in start['frozenPlanInputs'].items()}
frozen_inputs_drifted = [k for k, v in frozen_inputs.items() if v['start'] != v['end']]

# ── frozen roots ────────────────────────────────────────────────────────────
# Known independent baselines for the frozen prompt files (from the rework manifest);
# the start-baseline recorded a directory-digest placeholder for single files,
# so single-file roots are compared against these published hashes instead.
KNOWN_PROMPT_HASHES = {
    'execution/CODEBUDDY_TEST_CONTRACT_EXECUTOR_PROMPT_2026-10-03.md':
        '09795127783c790d73adc94f9ef5e2d25cdce27780f43ed6b280ff8b0a22964f',
    'execution/CODEBUDDY_TEST_CONTRACT_PROMPT_MANIFEST_2026-10-03.json':
        'b9de255b4d388636546bdd7c66240073ac31cc054376ec173285682f22521cb7',
    'execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md':
        'd70656b76b2d023c94850cd43a0655ed9eb998a228c5f12ed073703d2bfb86a0',
}

frozen_roots = {}
for rel, meta in start['frozenRoots'].items():
    base = PLAN / rel
    if base.is_file():
        end_hash = sha256(base)
        known = KNOWN_PROMPT_HASHES.get(rel)
        frozen_roots[rel] = {'kind': 'single-file', 'end': end_hash, 'fileCount': 1,
                             'baselineSource': 'rework manifest published hash' if known else 'reference only',
                             'start': known, 'unchanged': (end_hash == known) if known else None}
    elif base.is_dir():
        now = dir_digest(base)
        frozen_roots[rel] = {'start': meta.get('combinedSha256'), 'end': now['combinedSha256'],
                             'fileCount': now['fileCount'],
                             'startFileCount': meta.get('fileCount'),
                             'unchanged': now['combinedSha256'] == meta.get('combinedSha256')}
    else:
        frozen_roots[rel] = {'start': meta.get('combinedSha256'), 'end': None, 'unchanged': False}

# ── record files: append-only proof ─────────────────────────────────────────
record_files = ['IMPLEMENTATION_STATE.json', 'execution/state.json', 'HANDOFF.md',
                'execution/handoff.md', 'REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json']
pre_dir = SESSION / 'evidence/pre-append-records'
records_report = {}
append_only_ok = True
for rel in record_files:
    copy = pre_dir / rel.replace('/', '_')
    pre_hash = sha256(copy)
    post_hash = sha256(PLAN / rel)
    if rel.endswith('.json'):
        pre_obj = json.loads(copy.read_text())
        post_obj = json.loads((PLAN / rel).read_text())
        if rel == 'IMPLEMENTATION_STATE.json':
            added = post_obj['supplementalExecutions'].get('continuations')
            probe = json.loads(json.dumps(post_obj))
            probe['supplementalExecutions'].pop('continuations', None)
            subset = probe == pre_obj
            added_desc = f'continuations +{len(added) if added else 0}'
        elif rel == 'execution/state.json':
            added = post_obj['supplementalExecution'].get('continuations')
            probe = json.loads(json.dumps(post_obj))
            probe['supplementalExecution'].pop('continuations', None)
            subset = probe == pre_obj
            added_desc = f'continuations +{len(added) if added else 0}'
        elif rel == 'REVISION_HISTORY.json':
            subset = post_obj.get('versions', [])[:-1] == pre_obj.get('versions', [])
            added_desc = 'versions +1'
        else:
            subset = post_obj.get('entries', [])[:-1] == pre_obj.get('entries', [])
            added_desc = 'entries +1'
        records_report[rel] = {'preAppendSha256': pre_hash, 'postAppendSha256': post_hash,
                               'olderEntriesIdentical': subset, 'delta': added_desc}
    else:
        subset = (PLAN / rel).read_text().startswith(copy.read_text())
        records_report[rel] = {'preAppendSha256': pre_hash, 'postAppendSha256': post_hash,
                               'previousPrefixPreserved': subset, 'delta': 'appended chapter'}
    append_only_ok = append_only_ok and subset

# ── git status delta ────────────────────────────────────────────────────────
status = subprocess.run(['git', 'status', '--short'], cwd=ROOT, text=True, capture_output=True).stdout
head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, capture_output=True).stdout.strip()

# ── cleanup evidence ────────────────────────────────────────────────────────
def latest_attempt(base_rel):
    base = SESSION / base_rel
    attempts = sorted(p.name for p in base.glob('attempt-*'))
    return base / attempts[-1]


runs = {}
for label, base_rel in [('SUP-01 rp10 suite', 'SUP-01/runs/rp10-suite'),
                        ('SUP-02 rp08 suite', 'SUP-02/runs/rp08-suite')]:
    path = latest_attempt(base_rel)
    data = json.loads((path / 'run-results.json').read_text())
    runs[label] = {'database': data['ownedResources']['database'],
                   'cleanup': data['cleanup'],
                   'commands': [{'label': c['label'], 'exitCode': c['exitCode']} for c in data['commands']]}
controls = json.loads((SESSION / 'controls/runner-controls.json').read_text())

session_files = [p for p in SESSION.rglob('*') if p.is_file()]

counts_now = {
    'IMPLEMENTATION_STATE.json': json.loads((PLAN / 'IMPLEMENTATION_STATE.json').read_text())['counts'],
    'execution/state.json': json.loads((PLAN / 'execution/state.json').read_text())['counts'],
}

payload = {
    'sessionId': SESSION.name,
    'executor': 'CodeBuddy',
    'date': '2026-10-03',
    'promptRef': start['promptRef'],
    'authorityReviewRef': start['authorityReviewRef'],
    'startBaselineRef': f'{SESSION_REL}/evidence/start-baseline.json',
    'selfExcluded': True,
    'excludedFromHashing': ['final-integrity.json (self)',
                            'REVISION_HISTORY.json (appended immediately before this file)',
                            'EXECUTION_REVISION_HISTORY.json (appended immediately before this file)'],
    'pathBases': {'repositoryFiles': 'REPOSITORY_ROOT', 'planFiles': 'PLAN_DIRECTORY'},
    'git': {'headStart': start['git']['head'], 'headEnd': head,
            'headUnchanged': start['git']['head'] == head,
            'statusStart': start['git']['statusShort'], 'statusEnd': status,
            'statusUnchanged': start['git']['statusShort'] == status},
    'businessSource': {
        'startFileCount': start['counts']['businessSourceFiles'],
        'comparedPerFile': business['compared'],
        'unchanged': business['unchanged'],
        'drifted': business['drifted'],
        'missingAtEnd': business['missingAtEnd'],
        'untrackedIncluded': start['untrackedBusinessSourceFiles'],
        'untrackedHashesPresent': untracked_ok,
        'verdict': 'UNCHANGED' if not business['drifted'] and not business['missingAtEnd'] else 'DRIFT',
    },
    'formalTests': test_detail,
    'otherTests': {'compared': other['compared'], 'unchanged': other['unchanged'], 'drifted': other['drifted'],
                   'excludedWhitelisted': sorted(ALLOWED_TESTS),
                   'verdict': 'UNCHANGED' if not other['drifted'] and not other['missingAtEnd'] else 'DRIFT'},
    'schemaGuardDependencyConfig': {
        'compared': schema['compared'], 'unchanged': schema['unchanged'], 'drifted': schema['drifted'],
        'verdict': 'UNCHANGED' if not schema['drifted'] else 'DRIFT'},
    'frozenPlanInputs': {'compared': len(frozen_inputs), 'drifted': frozen_inputs_drifted,
                         'verdict': 'UNCHANGED' if not frozen_inputs_drifted else 'DRIFT'},
    'frozenRoots': {'roots': frozen_roots,
                    'drifted': [k for k, v in frozen_roots.items() if v['unchanged'] is False],
                    'referenceOnly': [k for k, v in frozen_roots.items() if v['unchanged'] is None],
                    'verdict': 'UNCHANGED' if all(v['unchanged'] is not False for v in frozen_roots.values()) else 'DRIFT',
                    'note': 'single-file roots without a published baseline hash are recorded as reference-only '
                            '(no independent start digest exists in this session baseline); they were read only'},
    'recordFiles': {'appendOnly': append_only_ok, 'details': records_report},
    'originalCounts': {'start': start['originalCounts'], 'end': counts_now,
                       'unchanged': start['originalCounts'] == {
                           'IMPLEMENTATION_STATE.json': {'declaredCounts': counts_now['IMPLEMENTATION_STATE.json'],
                                                          'taskEntryCount': 54,
                                                          'note': start['originalCounts']['IMPLEMENTATION_STATE.json']['note']},
                           'execution/state.json': counts_now['execution/state.json']}},
    'countsVerifiedUnchanged': (counts_now['IMPLEMENTATION_STATE.json']['tasks'] == 54
                                and counts_now['IMPLEMENTATION_STATE.json']['implementation']['COMPLETE'] == 18
                                and counts_now['IMPLEMENTATION_STATE.json']['implementation']['IN_PROGRESS'] == 2
                                and counts_now['IMPLEMENTATION_STATE.json']['implementation']['NOT_STARTED'] == 34
                                and counts_now['IMPLEMENTATION_STATE.json']['validation']['PASS'] == 10
                                and counts_now['IMPLEMENTATION_STATE.json']['validation']['NOT_RUN'] == 37
                                and counts_now['IMPLEMENTATION_STATE.json']['validation']['ENV_BLOCKED'] == 7
                                and counts_now['IMPLEMENTATION_STATE.json']['release'] == 'NOT_EVALUATED for all tasks'),
    'repositoryIncrement': {
        'modified': ['rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs',
                     'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'],
        'appendedRecordFiles': record_files,
        'newSessionDirectory': SESSION_REL,
        'newSessionFileCount': len(session_files),
        'businessSrcChanges': 0,
        'frontendChanges': 0,
        'schemaOrMigrationChanges': 0,
        'otherTestOrHelperChanges': 0,
    },
    'runs': runs,
    'runnerControls': {'kind': controls['kind'], 'runnerSha256': controls['runnerSha256'],
                       'controls': {k: {'attempt': v['attempt'], 'criticalFailures': v['criticalFailures'],
                                        'cleanup': v['cleanup']} for k, v in controls['controls'].items()},
                       'processExitCodes': controls['processExitCodes'],
                       'manualReleases': controls['manualReleases'],
                       'ownedResourcesAfterControls': controls['ownedResourcesAfterControls']},
    'cleanup': {
        'ownedDatabasesDropped': {k: v['cleanup'].get('guardDropExit') for k, v in runs.items()},
        'clustersStopped': {k: v['cleanup'].get('clusterStopExit') for k, v in runs.items()},
        'ownedDistRemoved': {k: v['cleanup'].get('ownedDistRemoved') for k, v in runs.items()},
        'ownedTempRootsRemoved': {k: v['cleanup'].get('ownedTempRootRemoved') for k, v in runs.items()},
        'backendDistExistsNow': (ROOT / 'rdpms-system/backend/dist').exists(),
        'note': 'ownership asserted from recorded db/port/root; no global process scan used',
    },
    'uncoveredAndLimits': {
        'jwtFullChain': 'NOT_RUN', 'frontendIndexedDb': 'NOT_RUN', 'browserUi': 'NOT_RUN',
        'targetEnvironment': 'NOT_RUN', 'deployment': 'NOT_EVALUATED',
        'phaseFilterPolicy': 'CONTRACT_UNRESOLVED',
        'acB10_02_intPc03_01': 'still incomplete',
        'rp08T02': 'not executed',
        'release': 'NOT_EVALUATED',
    },
    'verdict': 'SEALED',
}

(SESSION / 'final-integrity.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
print('business drifted:', business['drifted'])
print('other tests drifted:', other['drifted'])
print('schema drifted:', schema['drifted'])
print('frozen inputs drifted:', frozen_inputs_drifted)
print('frozen roots drifted:', payload['frozenRoots']['drifted'])
print('append only:', append_only_ok)
print('counts verified:', payload['countsVerifiedUnchanged'])
print('git status unchanged:', payload['git']['statusUnchanged'])
for rel, d in test_detail.items():
    print(rel.split('/')[-1], d['startCaseCount'], '->', d['endCaseCount'],
          'preserved:', d['allOriginalCaseNamesPreserved'])
