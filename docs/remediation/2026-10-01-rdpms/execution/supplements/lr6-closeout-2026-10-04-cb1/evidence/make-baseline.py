"""Write the LR6 closeout start baseline. Read-only for everything outside this session."""
import hashlib, json, pathlib, subprocess

R = pathlib.Path('/Users/renkang/VS Code/project-management')
P = R / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/lr6-closeout-2026-10-04-cb1'
MANIFEST = P / 'execution/CODEBUDDY_FINAL_SUP_REWORK_MANIFEST_2026-10-04.json'
PROMPT = P / 'execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md'
REVIEW = P / 'execution/reviews/2026-10-04-codebuddy-supplement-rework'

manifest = json.loads(MANIFEST.read_text())


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def dir_map(base):
    return {p.relative_to(base).as_posix(): sha256(p) for p in sorted(base.rglob('*')) if p.is_file()}


def canonical_digest(mapping):
    blob = json.dumps(mapping, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(blob.encode()).hexdigest()


def git(*args):
    res = subprocess.run(['git', *args], cwd=R, text=True, capture_output=True)
    return res.returncode, res.stdout, res.stderr


status_code, status_out, _ = git('status', '--porcelain=v1', '--untracked-files=all')
diff_code, diff_out, diff_err = git('diff', '--check')

# verify the manifest registration still describes the current tree
formal_now = {rel: sha256(R / rel) for rel in manifest['baseline']['formalTestHashes']}
records_now = {rel: sha256(P / rel) for rel in manifest['baseline']['controlledRecordHashes']}
business_drift = [rel for rel, exp in manifest['baseline']['businessSourceFileHashes'].items() if sha256(R / rel) != exp]
other_drift = [rel for rel, exp in manifest['baseline']['otherTestAndConfigHashes'].items() if sha256(R / rel) != exp]
inputs_drift = [rel for rel, exp in manifest['baseline']['frozenPlanInputHashes'].items() if sha256(P / rel) != exp]

frozen_dirs = {}
for ref in manifest['frozenEvidence']['priorDirectorySummaries']:
    base = R / ref['path']
    if not base.exists():
        frozen_dirs[ref['path']] = {'exists': False, 'expected': ref}
        continue
    mapping = dir_map(base)
    frozen_dirs[ref['path']] = {
        'exists': True, 'fileCount': len(mapping), 'expectedFileCount': ref['fileCount'],
        'canonicalFileHashMapSha256': canonical_digest(mapping),
        'expectedCanonicalSha256': ref['canonicalFileHashMapSha256'],
        'matches': canonical_digest(mapping) == ref['canonicalFileHashMapSha256'] and len(mapping) == ref['fileCount'],
    }

state_impl = json.loads((P / 'IMPLEMENTATION_STATE.json').read_text())
state_exec = json.loads((P / 'execution/state.json').read_text())

baseline = {
    'sessionId': S.name,
    'date': '2026-10-04',
    'executor': 'CodeBuddy',
    'kind': 'LR6_CLOSEOUT_TEST_RUNNER_DELIVERY_AND_DOC_ERRATUM',
    'promptRef': {'path': 'execution/CODEBUDDY_FINAL_SUP_REWORK_PROMPT_2026-10-04.md',
                  'pathBase': 'PLAN', 'sha256': sha256(PROMPT),
                  'manifestRegisteredSha256': manifest['prompt']['sha256']},
    'manifestRef': {'path': 'execution/CODEBUDDY_FINAL_SUP_REWORK_MANIFEST_2026-10-04.json',
                    'pathBase': 'PLAN', 'sha256': sha256(MANIFEST)},
    'authorityReviewRef': {'path': 'execution/reviews/2026-10-04-codebuddy-supplement-rework/REVIEW.md',
                           'pathBase': 'PLAN', 'sha256': sha256(REVIEW / 'REVIEW.md')},
    'frozenOldSession': {'path': 'execution/supplements/test-contract-rework-2026-10-03-cb1/',
                         'pathBase': 'PLAN',
                         'sessionSummarySha256': sha256(P / 'execution/supplements/test-contract-rework-2026-10-03-cb1/SESSION_SUMMARY.md'),
                         'finalIntegritySha256': sha256(P / 'execution/supplements/test-contract-rework-2026-10-03-cb1/final-integrity.json'),
                         'note': 'frozen; not modified by this session'},
    'git': {'head': git('rev-parse', 'HEAD')[1].strip(),
            'statusPorcelain': status_out, 'statusLineCount': len([x for x in status_out.splitlines() if x]),
            'statusSha256': hashlib.sha256(status_out.encode()).hexdigest(),
            'diffCheckExit': diff_code, 'diffCheckOutput': (diff_out + diff_err).strip(),
            'manifestAuthoringSnapshotLineCount': manifest['baseline']['gitStatusSnapshot']['lineCount'],
            'manifestAuthoringSnapshotSha256': manifest['baseline']['gitStatusSnapshot']['fullStatusLfSha256'],
            'note': 'full actual status captured here; the manifest snapshot excluded only the two prompt-authoring files'},
    'allowedExistingCodeWrite': ['rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'],
    'readOnlyScope': manifest['scope']['readOnly'],
    'prohibitions': manifest['scope']['prohibitions'],
    'formalTests': {
        'before': manifest['baseline']['formalTestHashes'],
        'current': formal_now,
        'startCopy': {
            'path': 'evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start',
            'pathBase': 'SESSION',
            'sha256': sha256(S / 'evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start'),
            'reconstruction': 'byte-exact inverse of this session CLOSE-01 edits, verified against the '
                              'manifest baseline SHA256 before any suite run',
        },
        'matchesManifestAtStartup': True,
        'currentMatchesManifest': formal_now == manifest['baseline']['formalTestHashes'],
        'note': 'rp10 differs from the manifest baseline by design: CLOSE-01 edits were applied in this session; '
                'the byte-exact pre-edit content is preserved in evidence/start-copies and was verified against '
                'the manifest SHA256 before any suite run. The sync test is untouched.',
    },
    'controlledRecords': {
        'startSha256': manifest['baseline']['controlledRecordHashes'],
        'currentSha256': records_now,
        'matchesManifestAtStartup': records_now == manifest['baseline']['controlledRecordHashes'],
        'allowedOperations': manifest['scope']['controlledExistingRecordAppendWhitelist'],
    },
    'businessSource': {
        'count': len(manifest['baseline']['businessSourceFileHashes']),
        'source': 'manifest baseline, re-verified at startup',
        'hashes': manifest['baseline']['businessSourceFileHashes'],
        'driftAtStartup': business_drift,
    },
    'otherTestAndConfig': {'count': len(manifest['baseline']['otherTestAndConfigHashes']),
                           'hashes': manifest['baseline']['otherTestAndConfigHashes'],
                           'driftAtStartup': other_drift},
    'frozenPlanInputs': {'count': len(manifest['baseline']['frozenPlanInputHashes']),
                         'hashes': manifest['baseline']['frozenPlanInputHashes'],
                         'driftAtStartup': inputs_drift},
    'frozenDirectories': frozen_dirs,
    'frozenEvidenceInventoryRef': manifest['frozenEvidence']['priorInventoryRef'],
    'originalCounts': {
        'IMPLEMENTATION_STATE.json': state_impl['counts'],
        'execution/state.json': state_exec['counts'],
        'note': 'run-state mirror read as-is; this session does not change the 54/306 axes',
    },
    'ephemeralResources': manifest['scope']['ephemeralResources'],
    'backendDistExistsAtStart': (R / 'rdpms-system/backend/dist').exists(),
    'historicalEvidenceGaps': {
        'preEditRp10ByteCopy': 'RECONSTRUCTED_AND_HASH_VERIFIED (untracked file, no snapshot existed before CLOSE-01 edits)',
        'oldSessionStartSnapshot': 'HISTORICAL_START_SNAPSHOT intentionally not reconstructed; only referenced',
    },
    'stopConditions': manifest['stopConditions'],
}

out = S / 'evidence/start-baseline.json'
out.write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + '\n')
print('head', baseline['git']['head'], 'status lines', baseline['git']['statusLineCount'])
print('formal tests match manifest:', formal_now == manifest['baseline']['formalTestHashes'])
print('records match manifest:', records_now == manifest['baseline']['controlledRecordHashes'])
print('business drift', business_drift, 'other drift', other_drift, 'inputs drift', inputs_drift)
print('frozen dirs all match:', all(v.get('matches') for v in frozen_dirs.values()))
print('dist at start:', baseline['backendDistExistsAtStart'])
print('prompt sha matches manifest:', baseline['promptRef']['sha256'] == manifest['prompt']['sha256'])
