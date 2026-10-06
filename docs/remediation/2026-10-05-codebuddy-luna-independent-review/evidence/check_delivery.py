"""Independent static review. Writes only this new review directory.

Does not run any executor script, application, build, test, database, or network call.
"""
from pathlib import Path
import collections
import csv
import hashlib
import json

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).parent
P = ROOT / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/parallel-lr7-2026-10-04-p01'
M = S / 'integration/seal-overlay-2026-10-05-02'
K = S / 'integration/seal-correction-2026-10-05-01'
N = ROOT / 'docs/remediation/2026-10-05-luna-remaining-plan'
L = ROOT / 'docs/remediation/2026-10-05-luna-remaining-execution/preparation/2026-10-05T110512Z-luna-preparation-01'
R = ROOT / 'docs/remediation/2026-10-05-seal-correction-review'

def load(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None

def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                   separators=(',', ':')).encode()).hexdigest()

def inventory(path):
    return {p.relative_to(path).as_posix(): sha(p) for p in sorted(path.rglob('*')) if p.is_file()}

def drift(expected):
    return [{'path': p, 'expected': h, 'actual': sha(ROOT / p)}
            for p, h in expected.items() if sha(ROOT / p) != h]

def check_ref(x, pointer, inherited=None):
    path = x.get('path', x.get('relativePath'))
    base = x.get('pathBase', inherited)
    actual = (ROOT / path).resolve() if path else None
    in_root = bool(actual and actual.is_relative_to(ROOT) and not Path(path).is_absolute())
    digest = sha(actual) if in_root else None
    return {'pointer': pointer, 'path': path, 'base': base,
            'declaredSha256': x.get('sha256'), 'actualSha256': digest,
            'byteResult': 'MATCH' if base == 'REPOSITORY' and digest and digest == x.get('sha256') else 'FAIL',
            'canonicalPathField': 'path' in x,
            'ownPathBase': x.get('pathBase') == 'REPOSITORY'}

def scan_refs(x, pointer='', inherited=None):
    result = []
    if isinstance(x, dict):
        base = x.get('pathBase', inherited)
        if ('path' in x or 'relativePath' in x) and 'sha256' in x:
            result.append(check_ref(x, pointer, inherited))
        for k, v in x.items():
            if k not in ('originalDeclaration', 'historicalDiagnostics'):
                result.extend(scan_refs(v, pointer + '/' + k, base))
    elif isinstance(x, list):
        for i, v in enumerate(x):
            result.extend(scan_refs(v, pointer + '/' + str(i), inherited))
    return result

if (OUT / 'readback.json').exists():
    raise SystemExit('Refuse to overwrite independent evidence.')

start_m, start_l = inventory(M), inventory(L)
root_names = ['IMPLEMENTATION_STATE.json', 'execution/state.json', 'HANDOFF.md',
              'execution/handoff.md', 'REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json']
start_roots = {s: sha(P / s) for s in root_names}
batch = load(P / 'execution/parallel-2026-10-04/BATCH_MANIFEST.json')
prior = load(ROOT / 'docs/remediation/2026-10-05-parallel-aggregation-review/evidence/readback.json')
old_review = load(R / 'evidence/readback.json')
root_paths = {(P / s).relative_to(ROOT).as_posix() for s in root_names}
protected = {p: x['sha256'] for p, x in batch['baseline']['protectedFileHashes'].items()
             if p not in root_paths}
frozen = batch['frozenPlanTree']
excluded = set(frozen['excludedRelativePaths'])
frozen_inventory = {p: h for p, h in inventory(P).items()
                    if p not in excluded and not any(p.startswith(e) for e in excluded if e.endswith('/'))}

payload = load(M / 'payload-manifest.json')
payload_refs = scan_refs(payload)
static_names = set(start_m) - {'payload-manifest.json', 'final-integrity.json', 'post-seal-readback.json'}
payload_paths = [x.get('path', x.get('relativePath')) for x in payload['files']]
new_refs = []
for p in sorted(M.rglob('*.json')):
    value = load(p)
    if 'start-snapshots' not in p.parts:
        new_refs.extend({'file': p.relative_to(M).as_posix(), **r} for r in scan_refs(value))

history_checks = []
history_refs = []
for name, axis, id_field, original_index in [('REVISION_HISTORY.json', 'versions', 'version', 27),
                                          ('EXECUTION_REVISION_HISTORY.json', 'entries', 'id', 18)]:
    before = load(M / 'evidence/start-snapshots' / name)
    now = load(P / name)
    new = now[axis][-1]
    cr = new['correctsRef']
    stripped = dict(now)
    stripped[axis] = now[axis][:-1]
    old = now[axis][original_index]
    history_checks.append({'registry': name, 'beforeCount': len(before[axis]), 'afterCount': len(now[axis]),
                           'appendOnly': stripped == before,
                           'newIdUnique': sum(x.get(id_field) == new[id_field] for x in now[axis]) == 1,
                           'originalIndexMatches': cr['originalIndex'] == original_index,
                           'canonicalMethod': 'sorted keys, UTF-8, ensure_ascii=false, compact separators',
                           'declaredOriginalCanonicalSha256': cr['originalCanonicalSha256'],
                           'actualOriginalCanonicalSha256': canonical(old),
                           'originalCanonicalMatches': cr['originalCanonicalSha256'] == canonical(old)})
    history_refs.extend({'registry': name, **r} for r in scan_refs(new))

overlay = load(M / 'evidence/reference-overlay.json')
index = load(R / 'canonical-reference-index.json')
overlay_checks = []
for i, x in enumerate(overlay['entries']):
    original = index['replacementTargetBindings'][i]
    overlay_checks.append({'index': i, 'sourcePointer': x['sourcePointer'],
                           'sourceMatchesIndex': x['sourceFile'] == original['sourceFile'] and x['sourcePointer'] == original['sourcePointer'],
                           'replacementMatchesIndex': x['replacementTargetRef'] == original['replacementTargetRef'],
                           'replacement': check_ref(x['replacementTargetRef'], '/entries/' + str(i)),
                           'originalFailurePreserved': x['originalDeclarationAccepted'] is False})

normalization = []
for node in load(M / 'evidence/readiness-normalization.json')['nodes']:
    ready = load(ROOT / node['sourceReadyRef']['path'])
    pa = node['pendingApprovals']
    value = pa.get('value', pa.get('mappedFromOriginal'))
    normalization.append({'window': node['windowId'],
                          'writerStoppedSourceAndNode': node['writerStopped'] is True and ready['writerStopped'] is True,
                          'pendingValueMatches': value == ready[pa['sourceField']],
                          'review': node['independentReview'], 'release': node['release']})

stable = load(N / 'INPUT_MANIFEST.json')['stableInputFileHashes']
all_luna_json = [(p.relative_to(L).as_posix(), load(p)) for p in sorted(L.rglob('*.json'))]
allow = load(L / 'TASK_ALLOWLIST_DRAFTS.json')['tasks']
graph = {t['id']: t for t in load(P / 'TASK_GRAPH.json')['tasks']}
work = {t['id']: t for t in load(N / 'WORK_ITEMS.json')['tasks']}
allow_checks = []
for t in allow:
    tid = t['taskId']
    w, g = work[tid], graph[tid]
    ceiling = set(w['originalPackageExistingFileCeiling']) | set(w['originalProposedModulePaths'])
    allow_checks.append({'taskId': tid,
                         'implementationDependenciesMatch': t['implementationDependencies'] == g['implementationDependencies'],
                         'acceptanceDependenciesMatch': t['acceptanceDependencies'] == g['acceptanceDependencies'],
                         'gateRequirementsMatch': t['gateRequirements'] == g['gateRequirements'],
                         'outsideOriginalCeiling': sorted(set(t['candidateWritePaths']) - ceiling),
                         'candidatePathCount': len(t['candidateWritePaths']),
                         'testPaths': t['proposedExactTestPaths'], 'grantStatus': t['grantStatus']})
approvals = load(L / 'APPROVAL_REQUESTS.json')['requests']
decisions = load(N / 'DECISION_PACKETS.json')['decisions']
decision_by_id = {x.get('decisionId', x.get('id')): x for x in decisions}
approval_checks = []
for a in approvals:
    original = decision_by_id[a['decisionId']]
    approval_checks.append({'decisionId': a['decisionId'], 'sourceStatus': a['sourceStatus'],
                            'originalStatus': original.get('status', original.get('sourceStatus')),
                            'sourceRefCount': len(a['sourceRefs']),
                            'unsigned': all(a[f] is None for f in ('approvedBy', 'approvedAt', 'evidenceRef'))})

binding_checks = []
for lp in ('LP-01', 'LP-02', 'LP-03', 'LP-04'):
    d = load(L / lp / 'evidence/source-bindings.json')
    binding_checks.extend({'package': lp, 'path': x['path'], 'matches': sha(ROOT / x['path']) == x['sha256']}
                          for x in d['generatedArtifacts'])

vp = load(L / 'LP-04/validation-plan.json')
evidence_resolution = []
for t in vp['tasks']:
    refs = []
    for ref in t['evidenceRefs']:
        recorded = ref['refAsRecorded']
        candidate = P / 'execution' / recorded if recorded.startswith('RP') else P / recorded
        refs.append({'ref': recorded, 'executorExists': ref['exists'],
                     'correctlyResolvedPath': candidate.relative_to(ROOT).as_posix(),
                     'correctlyResolvedExists': candidate.is_file(), 'actualSha256': sha(candidate)})
    evidence_resolution.append({'taskId': t['taskId'], 'records': refs,
                                'minimumNextValidationFieldPresent': 'minimumNextValidation' in t,
                                'observedAcceptancePath': t['observedAcceptanceArtifact']['path']})

selected_run_paths = [
    'RP13/RP13-T01/runs/2026-10-02-followup-validation/acceptance.json',
    'RP13/RP13-T02/runs/2026-10-02-continuous-rework/acceptance.json',
    'RP13/RP13-T02/runs/2026-10-02-continuous-rework/evidence/attempt-02/barrier-summary.json',
    'RP04/RP04-T01/runs/2026-10-02-followup-validation/acceptance.json',
    'RP04/RP04-T02/runs/2026-10-03-codebuddy-b18-rework/acceptance.json',
    'RP04/RP04-T02/runs/2026-10-02-continuous-rework/acceptance.json',
    'RP05/RP05-T01/runs/2026-10-02-continuous-rework/acceptance.json',
    'RP14/RP14-T01/runs/2026-10-02-followup-validation/acceptance.json',
]
latest_artifacts = []
for rel in selected_run_paths:
    path = P / 'execution' / rel
    d = load(path)
    latest_artifacts.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(path),
                            'data': d, 'evidenceLevel': 'REUSED_EXISTING_EXECUTOR_ARTIFACT_STATIC_REVIEW; no dynamic rerun'})

matrix = list(csv.DictReader((P / 'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')))
copied_disposition = list(csv.DictReader((L / 'LP-04/evidence/ACCEPTANCE_DISPOSITION.csv').open(encoding='utf-8-sig')))
case_gaps = list(csv.DictReader((L / 'LP-04/case-evidence-gap-table.csv').open(encoding='utf-8-sig')))
state = load(P / 'IMPLEMENTATION_STATE.json')
output = {
    'scope': 'INDEPENDENT_STATIC_DELIVERY_REVIEW; NO_PRODUCT_DYNAMIC_COMMANDS',
    'productCommandsRun': [], 'productSourceWrites': False, 'rootRecordWrites': False,
    'immutableProtectedCount': len(protected), 'immutableProtectedDrift': drift(protected),
    'workerCount': len(prior['workerInputHashes']), 'workerDrift': drift(prior['workerInputHashes']),
    'oldIntegrationCount': len(prior['integrationInputHashes']), 'oldIntegrationDrift': drift(prior['integrationInputHashes']),
    'oldKCount': len(old_review['currentKInventory']), 'oldKDrift': [{'path': p, 'actual': sha(K / p), 'expected': h}
                                         for p, h in old_review['currentKInventory'].items() if sha(K / p) != h],
    'frozenPlanCount': len(frozen_inventory),
    'frozenPlanMatches': len(frozen_inventory) == frozen['fileCount'] and canonical(frozen_inventory) == frozen['canonicalInventorySha256'],
    'mInventory': start_m, 'lunaInventory': start_l,
    'mActualFileCount': len(start_m), 'mActualStaticCount': len(static_names),
    'payloadEntryCount': len(payload_refs), 'payloadByteChecks': payload_refs,
    'staticCoverageMatches': set(payload_paths) == {(M / x).relative_to(ROOT).as_posix() for x in static_names},
    'newActiveRefs': new_refs,
    'strictRefSchemaFailures': [x for x in new_refs if not x['canonicalPathField'] or not x['ownPathBase']],
    'byteReferenceFailures': [x for x in new_refs if x['byteResult'] != 'MATCH'],
    'historyChecks': history_checks, 'historyRefChecks': history_refs,
    'overlay13Checks': overlay_checks, 'normalization6Checks': normalization,
    'stableNInputCount': len(stable), 'stableNInputDrift': drift(stable),
    'lunaJsonCount': len(all_luna_json), 'allowlist36Checks': allow_checks,
    'approval21Checks': approval_checks, 'lunaOwnBindingChecks': binding_checks,
    'validationEvidenceResolution': evidence_resolution, 'selectedActualRunArtifacts': latest_artifacts,
    'original306Rows': len(matrix), 'copied306Rows': len(copied_disposition),
    'copiedDispositionBytesMatchN': sha(L / 'LP-04/evidence/ACCEPTANCE_DISPOSITION.csv') == sha(N / 'ACCEPTANCE_DISPOSITION.csv'),
    'extraCaseCount': len(case_gaps), 'extraCaseTableRows': case_gaps,
    'taskCounts': {axis: dict(collections.Counter(t[axis] for t in state['tasks'].values()))
                   for axis in ('implementation', 'validation', 'release')},
    'acceptanceCounts': dict(collections.Counter(r['result'] for r in matrix)),
    'inputPreservation': {'mUnchangedDuringReview': start_m == inventory(M),
                          'lunaUnchangedDuringReview': start_l == inventory(L),
                          'sixRootsUnchangedDuringReview': start_roots == {s: sha(P / s) for s in root_names}},
    'limitations': ['No build/test/DB/JWT/IDB/browser/FS-target/deployment command was run.',
                    'Current verification binds local bytes; it cannot prove every earlier executor action.',
                    'Existing run PASS is not promoted to new joint or target acceptance.'],
}
(OUT / 'readback.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in output.items() if k in (
    'immutableProtectedCount', 'immutableProtectedDrift', 'workerCount', 'workerDrift', 'oldIntegrationDrift',
    'oldKDrift', 'frozenPlanCount', 'frozenPlanMatches', 'mActualFileCount', 'mActualStaticCount',
    'payloadEntryCount', 'staticCoverageMatches', 'byteReferenceFailures', 'historyChecks',
    'stableNInputCount', 'stableNInputDrift', 'lunaJsonCount', 'original306Rows', 'extraCaseCount',
    'taskCounts', 'acceptanceCounts', 'inputPreservation')}, ensure_ascii=False, indent=2))
