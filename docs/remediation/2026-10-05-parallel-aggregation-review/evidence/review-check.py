"""Read-only aggregation review. No application, subprocess, DB, or test execution."""
from pathlib import Path
import collections
import csv
import hashlib
import json
import re
import sys

ROOT = Path('/Users/renkang/VS Code/project-management')
P = ROOT / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/parallel-lr7-2026-10-04-p01'
J = S / 'integration/readiness-resume-01'
OUT = ROOT / 'docs/remediation/2026-10-05-parallel-aggregation-review/evidence/readback.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical(value):
    data = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(data.encode()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def remove_last_array_entry(raw, key):
    match = re.search('"' + re.escape(key) + '"\\s*:\\s*\\[', raw)
    decoder, position, ends = json.JSONDecoder(), match.end(), []
    while True:
        while raw[position].isspace():
            position += 1
        if raw[position] == ']':
            break
        if raw[position] == ',':
            position += 1
            continue
        _, end = decoder.raw_decode(raw, position)
        ends.append(end)
        position = end
    return raw[:ends[-2]] + raw[ends[-1]:]


b = load(P / 'execution/parallel-2026-10-04/BATCH_MANIFEST.json')
prior = load(ROOT / 'docs/remediation/2026-10-04-parallel-handoff-check/evidence/readback.json')
root_names = ['IMPLEMENTATION_STATE.json', 'execution/state.json', 'HANDOFF.md',
              'execution/handoff.md', 'REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json']
root_paths = {str((P / x).relative_to(ROOT)) for x in root_names}
immutable = {r: digest(ROOT / r) for r in b['baseline']['protectedFileHashes'] if r not in root_paths}
immutable_drift = [r for r, h in immutable.items() if h != b['baseline']['protectedFileHashes'][r]['sha256']]
old_worker_drift = [r for inv in prior['workerInputInventory'].values()
                    for r, h in inv.items() if digest(ROOT / r) != h]
worker_checks, worker_inventory = [], {}
for worker in sorted(S.glob('window-*')):
    manifest_path = (worker / 'readiness-amendment-01/WORKER_MANIFEST.json'
                     if worker.name == 'window-a-runner' else worker / 'WORKER_MANIFEST.json')
    manifest = load(manifest_path)
    entries = manifest['files']
    items = (entries.items() if isinstance(entries, dict)
             else ((v.get('path', v.get('relativePath')), v) for v in entries))
    errors = []
    for relative, value in items:
        expected = value if isinstance(value, str) else value['sha256']
        if digest(ROOT / relative) != expected:
            errors.append(relative)
    worker_checks.append({'worker': worker.name, 'entries': len(entries), 'errors': errors})
    worker_inventory.update({str(f.relative_to(ROOT)): digest(f)
                             for f in worker.rglob('*') if f.is_file()})

payload = load(J / 'payload-manifest.json')
payload_paths, payload_errors = [], []
for entry in payload['files']:
    rel = entry.get('path', entry.get('relativePath'))
    payload_paths.append(rel)
    f = ROOT / rel
    if not f.is_file() or digest(f) != entry['sha256']:
        payload_errors.append(rel)

snapshots = S / 'window-b-paths/historical-record-snapshots'
append_checks = []
for rel, old_name, chain in [
        ('IMPLEMENTATION_STATE.json', 'IMPLEMENTATION_STATE.json', ['supplementalExecutions', 'continuations']),
        ('execution/state.json', 'execution__state.json', ['supplementalExecution', 'continuations'])]:
    before, after = load(snapshots / old_name), load(P / rel)
    added = len(after[chain[0]][chain[1]]) - len(before[chain[0]][chain[1]])
    item = after[chain[0]][chain[1]].pop()
    reversed_bytes = remove_last_array_entry((P / rel).read_text(), 'continuations').encode()
    append_checks.append({'path': rel, 'added': added, 'oldSemanticsMatch': before == after,
                          'reverseAppendBytesMatchKnownBaseline': hashlib.sha256(reversed_bytes).hexdigest() == b['baseline']['rootRecordHashes'][rel],
                          'newSessionId': item.get('sessionId')})
for rel, old_name in [('HANDOFF.md', 'HANDOFF.md'), ('execution/handoff.md', 'execution__handoff.md')]:
    before, after = (snapshots / old_name).read_bytes(), (P / rel).read_bytes()
    append_checks.append({'path': rel, 'oldBytePrefixMatches': after.startswith(before),
                          'appendedBytes': len(after) - len(before)})

history_refs, history_checks = [], []
for name, key, index in [('REVISION_HISTORY.json', 'versions', 26),
                         ('EXECUTION_REVISION_HISTORY.json', 'entries', 17)]:
    document = load(P / name)
    entries = document[key]
    entry = entries[index]
    previous_bytes = remove_last_array_entry((P / name).read_text(), key).encode()
    history_checks.append({'registry': name, 'index': index,
        'oldByteHashMatchesKnownBaselineAfterReversingAppend': hashlib.sha256(previous_bytes).hexdigest() == b['baseline']['rootRecordHashes'][name],
        'previousEntryCanonicalMatches': canonical(entries[index - 1]) == b['integrator']['correctsPriorHistoryEntries'][name]['canonicalEntrySha256'],
        'newId': entry.get('id'), 'newVersion': entry.get('version'),
        'entryCanonicalSha256': canonical(entry)})
    for rel, v in entry['sealedArtifactHashes'].items():
        base = ROOT if v['pathBase'] == 'REPOSITORY' else P
        target = base / rel
        history_refs.append({'registry': name, 'pointer': f'/{key}/{index}/sealedArtifactHashes/{rel}',
            'relativePath': rel, 'pathBase': v['pathBase'], 'exists': target.is_file(),
            'hashMatches': digest(target) == v['sha256'] if target.is_file() else False})
    for field in ['reviewRef', 'evidenceLimitsRef']:
        v = entry[field]
        base = ROOT if v['pathBase'] == 'REPOSITORY' else P
        history_refs.append({'registry': name, 'pointer': f'/{key}/{index}/{field}',
            'relativePath': v['path'], 'pathBase': v['pathBase'], 'exists': (base / v['path']).is_file()})

nine_refs = []
def inspect_nine(v, pointer=''):
    if isinstance(v, dict):
        if 'path' in v and 'sha256' in v:
            target = S / v['path']
            nine_refs.append({'pointer': pointer, 'declaredPath': v['path'],
                'declaredBase': v.get('pathBase'),
                'diagnosticExplicitMapping': str(target.relative_to(ROOT)),
                'existsUnderDiagnosticMapping': target.is_file(),
                'hashMatchesUnderDiagnosticMapping': digest(target) == v['sha256'] if target.is_file() else False})
        for k, child in v.items():
            inspect_nine(child, pointer + '/' + k)
    elif isinstance(v, list):
        for i, child in enumerate(v):
            inspect_nine(child, pointer + '/' + str(i))
inspect_nine(load(J / 'evidence/nine-path-evidence-binding.json'))

normalization = load(J / 'evidence/readiness-normalization.json')
bundle = load(J / 'approval-bundle.json')
approval_sources = [{'decision': d['id'], 'path': rel, 'existsUnderExplicitBatchMapping': (S / rel).is_file()}
                    for d in bundle['decisions'] for rel in d['sourceRefs']]
excludes = b['frozenPlanTree']['excludedRelativePaths']
frozen = {str(f.relative_to(P)): digest(f) for f in P.rglob('*') if f.is_file()
          and not any(str(f.relative_to(P)) == e or (e.endswith('/') and str(f.relative_to(P)).startswith(e)) for e in excludes)}
state = load(P / 'IMPLEMENTATION_STATE.json')
acceptance_rows = list(csv.DictReader((P / 'ACCEPTANCE_MATRIX.csv').open()))
post = load(J / 'post-seal-readback.json')
result = {
    'reviewDate': '2026-10-05', 'verdict': 'MATERIAL_PRESERVED_FINAL_SEAL_REQUIRES_CORRECTION',
    'scope': 'Read-only document, reference, byte, ledger and selected unsigned proposal consistency review',
    'productTestsBuildDBRun': False, 'productSourceWrites': False, 'rootRecordWrites': False,
    'immutableProtectionCount': len(immutable), 'immutableProtectionDrift': immutable_drift,
    'oldWorkerDrift': old_worker_drift, 'workerChecks': worker_checks,
    'workerInventoryCount': len(worker_inventory), 'workerInputHashes': worker_inventory,
    'integrationInputHashes': {str(f.relative_to(ROOT)): digest(f) for f in J.rglob('*') if f.is_file()},
    'currentRootRecordHashes': {rel: digest(P / rel) for rel in root_names},
    'payloadEntries': len(payload_paths), 'payloadUniquePaths': len(set(payload_paths)),
    'payloadDuplicates': [r for r, count in collections.Counter(payload_paths).items() if count > 1],
    'payloadHashErrors': payload_errors, 'rootAppendChecks': append_checks,
    'historyChecks': history_checks, 'historyReferenceChecks': history_refs,
    'badExplicitHistoryReferences': [r for r in history_refs if not r['exists']],
    'ninePathReferences': nine_refs, 'ninePathReferenceFileDeclaresBase': load(J / 'evidence/nine-path-evidence-binding.json').get('pathBase'),
    'normalizedPendingApprovalsPresence': {w: 'pendingApprovals' in v for w, v in normalization['windows'].items()},
    'approvalSourceChecks': approval_sources,
    'approvalSignaturesRemainNull': all(d['approvedBy'] is None and d['approvedAt'] is None and d['evidenceRef'] is None for d in bundle['decisions']),
    'frozenPlanFileCount': len(frozen), 'frozenPlanDigestMatches': canonical(frozen) == b['frozenPlanTree']['canonicalInventorySha256'],
    'taskCounts': {axis: dict(collections.Counter(t.get(axis) for t in state['tasks'].values()))
                   for axis in ['implementation', 'validation', 'release']},
    'acceptanceRows': len(acceptance_rows), 'acceptanceCounts': dict(collections.Counter(
        r.get('status', r.get('result', r.get('localResult', 'UNKNOWN'))) for r in acceptance_rows)),
    'postSealHistoryDigestsMatch': digest(P / 'REVISION_HISTORY.json') == post['revisionHistoryFinalSha']
                                and digest(P / 'EXECUTION_REVISION_HISTORY.json') == post['executionRevisionHistoryFinalSha'],
    'limitations': ['No runner or dynamic validation', 'No comprehensive independent acceptance of C-F designs',
                   'Diagnostic rebasing proves target bytes only; undeclared or wrong bases in original metadata remain failures'],
    'reviewToolAuthoringNote': 'Initial read-only review command failed on CSV status-column name before evidence output; fixed the reviewer script only. No executor input was changed.',
}
if OUT.exists():
    raise SystemExit('STOP: preserve existing review evidence; use a new review attempt')
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: result[k] for k in ['verdict', 'immutableProtectionCount', 'immutableProtectionDrift',
    'workerInventoryCount', 'payloadEntries', 'payloadUniquePaths', 'badExplicitHistoryReferences',
    'normalizedPendingApprovalsPresence', 'taskCounts', 'acceptanceCounts']}, ensure_ascii=False))
