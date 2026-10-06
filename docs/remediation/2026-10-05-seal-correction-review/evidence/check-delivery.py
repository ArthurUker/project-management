"""Read-only delivery review. Writes only a new readback beside this script."""
import collections
import csv
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PLAN = ROOT / 'docs/remediation/2026-10-01-rdpms'
S = PLAN / 'execution/supplements/parallel-lr7-2026-10-04-p01'
K = S / 'integration/seal-correction-2026-10-05-01'
J = S / 'integration/readiness-resume-01'
PRIOR = ROOT / 'docs/remediation/2026-10-05-parallel-aggregation-review'
OUT = Path(__file__).parent / 'readback.json'


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None


def load(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))


def canonical(x):
    return hashlib.sha256(json.dumps(x, sort_keys=True, ensure_ascii=False,
                                   separators=(',', ':')).encode()).hexdigest()


def inventory(p):
    return {str(f.relative_to(p)): sha(f) for f in sorted(p.rglob('*')) if f.is_file()}


def ref_result(ref, inherited=None):
    base = ref.get('pathBase', inherited)
    path = ref.get('path', ref.get('relativePath'))
    result = {'declaredBase': base, 'declaredPath': path, 'declaredSha256': ref.get('sha256')}
    if base not in ('REPOSITORY', 'PLAN'):
        result['result'] = 'MISSING_OR_UNKNOWN_BASE'
        # Diagnostic only; never promotes the unbased declaration to PASS.
        result['repositoryCandidateSha256'] = sha(ROOT / path) if path else None
        return result
    root = ROOT if base == 'REPOSITORY' else PLAN
    target = (root / path).resolve()
    if Path(path).is_absolute() or not target.is_relative_to(root.resolve()):
        result['result'] = 'OUT_OF_BASE'
        return result
    actual = sha(target)
    result.update(actualSha256=actual, exists=target.is_file())
    result['result'] = 'MISSING_TARGET' if actual is None else (
        'PASS' if actual == ref.get('sha256') else 'HASH_MISMATCH')
    return result


def scan_refs(value, pointer='', inherited=None):
    refs = []
    if isinstance(value, dict):
        base = value.get('pathBase', inherited)
        if ('path' in value or 'relativePath' in value) and 'sha256' in value:
            refs.append({'pointer': pointer, **ref_result(value, inherited)})
        for key, child in value.items():
            refs.extend(scan_refs(child, pointer + '/' + str(key), base))
    elif isinstance(value, list):
        for i, child in enumerate(value):
            refs.extend(scan_refs(child, pointer + '/' + str(i), inherited))
    return refs


def drift(expected):
    return [{'path': p, 'expected': h, 'actual': sha(ROOT / p)}
            for p, h in expected.items() if sha(ROOT / p) != h]


if OUT.exists():
    raise SystemExit('Readback exists; do not overwrite frozen review evidence.')

prior = load(PRIOR / 'evidence/readback.json')
batch = load(PLAN / 'execution/parallel-2026-10-04/BATCH_MANIFEST.json')
root_names = prior['currentRootRecordHashes']
root_repo_names = {str((PLAN / p).relative_to(ROOT)) for p in root_names}
protected = {p: v['sha256'] for p, v in batch['baseline']['protectedFileHashes'].items()
             if p not in root_repo_names}
start_k_inventory = inventory(K)
current_roots = {p: sha(PLAN / p) for p in root_names}
snapshots = {}
histories = []
history_refs = []
for name, expected in root_names.items():
    snap = K / 'evidence/start-snapshots' / name.replace('/', '_')
    snapshots[name] = {'expectedPriorSha256': expected, 'snapshotSha256': sha(snap),
                       'snapshotMatchesPrior': sha(snap) == expected}
    if name not in ('REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json'):
        snapshots[name]['currentMatchesSnapshot'] = sha(PLAN / name) == sha(snap)
        continue
    old, now = load(snap), load(PLAN / name)
    axis, id_field = ('versions', 'version') if name == 'REVISION_HISTORY.json' else ('entries', 'id')
    stripped = dict(now)
    stripped[axis] = now[axis][:-1]
    new = now[axis][-1]
    cr = new['correctsRef']
    original = old[axis][cr['originalIndex']]
    ids = [e.get(id_field) for e in now[axis]]
    history_check = {'registry': name, 'beforeCount': len(old[axis]), 'afterCount': len(now[axis]),
                     'oneEntryAdded': len(now[axis]) == len(old[axis]) + 1,
                     'oldArraysAndOtherFieldsUnchanged': stripped == old,
                     'newIdentifierField': id_field, 'newIdentifier': new.get(id_field),
                     'newIdentifierUnique': ids.count(new.get(id_field)) == 1,
                     'correctsCanonicalSha256': canonical(original),
                     'correctsCanonicalMatches': canonical(original) == cr['originalCanonicalSha256'],
                     'correctsOriginalVersionMatches': original.get('version') == cr['originalVersion'],
                     'newEntryCanonicalSha256': canonical(new)}
    if name == 'EXECUTION_REVISION_HISTORY.json':
        history_check['newEntryNoVersionAlias'] = 'version' not in new
        history_check['originalIdNullMatches'] = original.get('id') is None and cr['originalId'] is None
    histories.append(history_check)
    for path, metadata in new['sealedArtifactHashes'].items():
        history_refs.append({'registry': name, 'pointer': '/' + axis + '/' + str(len(now[axis])-1)
                             + '/sealedArtifactHashes/' + path,
                             **ref_result({'path': path, **metadata})})
    for field in ('reviewRef', 'evidenceLimitsRef'):
        history_refs.append({'registry': name, 'pointer': '/' + axis + '/' + str(len(now[axis])-1)
                             + '/' + field, **ref_result(new[field])})

payload = load(K / 'payload-manifest.json')
payload_refs = scan_refs(payload)
payload_paths = [x['relativePath'] for x in payload['files']]
excluded = {'payload-manifest.json', 'final-integrity.json', 'post-seal-readback.json'}
static_paths = {str((K / p).relative_to(ROOT)) for p in start_k_inventory if p not in excluded}
k_refs = []
json_files = []
for p in sorted(K.rglob('*.json')):
    data = load(p)
    json_files.append(str(p.relative_to(K)))
    if 'start-snapshots' in p.parts:
        continue  # Historical diagnostics are not new effective declarations.
    k_refs.extend({'file': str(p.relative_to(K)), **r} for r in scan_refs(data))

corrections = load(K / 'reference-corrections.json')
old_history_map_checks = []
for c in corrections['historyRefs']:
    old = load(PLAN / c['registry'])
    axis, index = ('versions', 26) if c['registry'] == 'REVISION_HISTORY.json' else ('entries', 17)
    entry = old[axis][index]
    if '.sealedArtifactHashes.' in c['pointer']:
        path = next(p for p in entry['sealedArtifactHashes'] if p.endswith(c['pointer'].split('.')[-2] + '.json'))
        ref = {'path': path, **entry['sealedArtifactHashes'][path]}
    else:
        ref = entry[c['pointer'].split('.')[-1]]
    old_history_map_checks.append({'registry': c['registry'], 'pointer': c['pointer'],
                                   'originalDeclarationMatches': ref['path'] == c['originalDeclaredPath']
                                   and ref['pathBase'] == c['originalDeclaredBase'],
                                   'originalRef': ref_result(ref),
                                   'replacementRef': ref_result(c['newTargetRef']),
                                   'originalHasSha256': 'sha256' in ref,
                                   'sameOriginalHash': ref.get('sha256') == c['newTargetRef']['sha256']
                                   if 'sha256' in ref else 'NOT_APPLICABLE_NO_ORIGINAL_HASH'})

old_nine = load(J / 'evidence/nine-path-evidence-binding.json')
new_nine = load(K / 'evidence/nine-path-evidence-binding.json')
new_nine_untransformed = load(K / 'evidence/nine-path-evidence-binding.json')
nine_checks = []
old_modes = {r['mode']: r for r in old_nine['paths']}
new_modes = {r['mode']: r for r in new_nine['paths']}
for c in corrections['ninePathRefs']['corrections']:
    mode, field = c['pointer'].split('.', 1)
    original, new = old_modes[mode][field], new_modes[mode][field]
    nine_checks.append({'pointer': c['pointer'], 'originalPathMatches': original['path'] == c['originalDeclaredPath'],
                         'preservesOriginalHash': original['sha256'] == new['sha256'] == c['newTargetRef']['sha256'],
                         'copyMatchesCorrection': new == c['newTargetRef'], 'newRef': ref_result(new)})
    new_nine_untransformed['paths'][list(new_modes).index(mode)][field] = original
new_nine_untransformed.pop('pathBaseNormalization', None)
external = corrections['externalEvidenceRequestRef']
external_check = ref_result({'pathBase': external['actualPathBase'], 'path': external['actualPath'],
                            'sha256': external['actualSha256']})

normalization = load(K / 'evidence/readiness-normalization.json')
required = batch['readyProtocol']['requiredFields']
node_checks = []
for node in normalization['nodes']:
    ready = load(ROOT / node['sourceReadyRef']['path'])
    pa = node['pendingApprovals']
    field = pa['sourceField']
    value = pa.get('value', pa.get('mappedFromOriginal'))
    node_checks.append({'window': node['windowId'], 'missingFields': [f for f in required if f not in node],
                         'sourceReadyRef': ref_result(node['sourceReadyRef']),
                         'manifestRef': ref_result(node['workerManifest']),
                         'pendingSourceField': field, 'pendingValueMatchesSource': value == ready[field],
                         'pendingSourcePathMatches': pa['sourceRef'] == node['sourceReadyRef']['path'],
                         'writerStoppedMatchesSource': node['writerStopped'] is True and ready['writerStopped'] is True,
                         'independentReview': node['independentReview'], 'release': node['release']})

frozen_spec = batch['frozenPlanTree']
excluded_paths = set(frozen_spec['excludedRelativePaths'])
frozen_inventory = {p: h for p, h in inventory(PLAN).items()
                    if p not in excluded_paths and not any(p.startswith(e) for e in excluded_paths if e.endswith('/'))}
frozen_digest = canonical(frozen_inventory)
audit_checks = []
for a in batch['frozenAuditTrees']:
    inv = inventory(ROOT / a['path'])
    audit_checks.append({'path': a['path'], 'count': len(inv),
                         'matches': len(inv) == a['fileCount'] and canonical(inv) == a['canonicalInventorySha256']})
state = load(PLAN / 'IMPLEMENTATION_STATE.json')
tasks = list(state['tasks'].values())
task_counts = {axis: dict(collections.Counter(t[axis] for t in tasks))
               for axis in ('implementation', 'validation', 'release')}
rows = list(csv.DictReader((PLAN / 'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')))
acceptance_counts = dict(collections.Counter(r['result'] for r in rows))
scope = load(K / 'evidence/seal-scope.json')
scope_products = scope['referenceGraph']['kStaticProducts']
post = load(K / 'post-seal-readback.json')
post_history_matches = {n: current_roots[n] == post[field] for n, field in (
    ('REVISION_HISTORY.json', 'revisionHistoryFinalSha'),
    ('EXECUTION_REVISION_HISTORY.json', 'executionRevisionHistoryFinalSha'))}
output = {
    'date': '2026-10-05', 'scope': 'INDEPENDENT_STATIC_DELIVERY_REVIEW_ONLY',
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'productCommandsRun': [], 'productSourceWrites': False, 'rootRecordWrites': False,
    'immutableProtectionCount': len(protected), 'immutableProtectionDrift': drift(protected),
    'workerInventoryCount': len(prior['workerInputHashes']), 'workerDrift': drift(prior['workerInputHashes']),
    'oldIntegrationInventoryCount': len(prior['integrationInputHashes']),
    'oldIntegrationDrift': drift(prior['integrationInputHashes']),
    'frozenPlanCount': len(frozen_inventory), 'frozenPlanDigest': frozen_digest,
    'frozenPlanMatches': len(frozen_inventory) == frozen_spec['fileCount']
                         and frozen_digest == frozen_spec['canonicalInventorySha256'],
    'frozenAuditChecks': audit_checks, 'snapshotChecks': snapshots, 'historyChecks': histories,
    'currentRootRecordHashes': current_roots, 'currentKInventory': start_k_inventory,
    'jsonParsedCount': len(json_files), 'jsonFiles': json_files,
    'payloadCount': len(payload_refs), 'payloadUnique': len(set(payload_paths)),
    'payloadChecks': payload_refs, 'staticCoverageMatches': set(payload_paths) == static_paths,
    'newKTypedReferenceChecks': k_refs, 'newHistoryReferenceChecks': history_refs,
    'newTypedReferenceFailures': [{'origin': 'K', **r} for r in k_refs if r['result'] != 'PASS']
                                 + [{'origin': 'HISTORY', **r} for r in history_refs if r['result'] != 'PASS'],
    'oldHistoryCorrectionChecks': old_history_map_checks, 'ninePathCorrectionChecks': nine_checks,
    'ninePathOriginalResultsAndLimitsPreserved': new_nine_untransformed == old_nine,
    'externalRequestCheck': external_check, 'normalizationChecks': node_checks,
    'scopeCountChecks': {'actualAllKFiles': len(start_k_inventory), 'actualStaticKFiles': len(static_paths),
                        'declaredStaticCount': scope['counts']['newKStaticProductCount'],
                        'graphStaticEntryCount': len(scope_products),
                        'graphStaticMissing': sorted(static_paths - set(scope_products)),
                        'oldTopLevelEntries': len(load(J / 'payload-manifest.json')['files']),
                        'oldTopLevelUnique': len({x.get('path', x.get('relativePath'))
                                                 for x in load(J / 'payload-manifest.json')['files']})},
    'postSealDeclaredOverall': post['overall'], 'postSealHistoryHashesMatch': post_history_matches,
    'taskCount': len(tasks), 'taskCounts': task_counts,
    'acceptanceRowCount': len(rows), 'acceptanceCounts': acceptance_counts,
    'reviewInputPreservation': {'currentKMatchesStart': inventory(K) == start_k_inventory,
                               'currentRootsMatchStart': {p: sha(PLAN / p) for p in root_names} == current_roots},
    'limitations': ['No product build, test, runner, control, database, JWT, browser or IDB command executed.',
                    'Unbased declarations remain failures even if a repository-root diagnostic candidate matches.',
                    'Unsigned policy packets are not approved or comprehensively independently accepted.']
}
OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: output[k] for k in (
    'immutableProtectionCount', 'immutableProtectionDrift', 'workerDrift', 'oldIntegrationDrift',
    'frozenPlanCount', 'frozenPlanMatches', 'payloadCount', 'payloadUnique', 'staticCoverageMatches',
    'newTypedReferenceFailures', 'scopeCountChecks', 'taskCounts', 'acceptanceCounts')}, ensure_ascii=False, indent=2))
