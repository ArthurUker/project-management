"""Account for every existing case without changing its definition or result."""
import collections
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
N = Path(__file__).resolve().parents[1]
P = ROOT / 'docs/remediation/2026-10-01-rdpms'
state = json.loads((P / 'IMPLEMENTATION_STATE.json').read_text())
graph = json.loads((P / 'TASK_GRAPH.json').read_text())['tasks']
rows = list(csv.DictReader((P / 'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')))
remaining = {k for k, v in state['tasks'].items() if v['implementation'] != 'COMPLETE'}
backlog = {k for k, v in state['tasks'].items() if v['implementation'] == 'COMPLETE' and v['validation'] != 'PASS'}
proposed_routes = {
    'AC-B04-02': (['RP08-T02'], 'Cache revocation/backfill belongs to later ACL work; original task/decision links remain unchanged pending review.'),
    'AC-B11-02': (['RP14-T02'], 'FAILED/SKIPPED requires T-RP-05; infected-only acceptance is not this policy.'),
    'AC-B19-01': (['RP05-T01'], 'Check existing same-project HTTP/sync evidence first; do not reopen code automatically.'),
    'AC-B19-02': (['RP05-T03'], 'All cycle lengths is optional DAG scope, not automatically authorized by the earlier parent guard.'),
    'AC-B19-03': (['RP05-T01'], 'Compare actual recursive/project-scope evidence; no inferred coverage from a single guard.'),
    'AC-B19-04': (['RP15-T01', 'RP15-T02'], 'Actual legacy anomalies and disposition require data-owner input; no automatic cleanup.'),
}
cases = []
other = []
for row in rows:
    refs = {t['id'] for t in graph if row['case_id'] in t['acceptanceCaseIds']}
    refs |= set(re.findall(r'RP\d{2}-T\d{2}', row.get('task_refs', '')))
    if row['result'] == 'PASS':
        bucket = 'REUSE_EXISTING_SCOPED_PASS'
    elif refs & remaining:
        bucket = 'REMAINING_IMPLEMENTATION_OR_JOINT_ACCEPTANCE'
    elif refs & backlog:
        bucket = 'COMPLETED_IMPLEMENTATION_OPEN_VALIDATION'
    else:
        bucket = 'ACCEPTED_TASK_WITH_OPEN_CASE_REQUIRES_EVIDENCE_OR_SCOPE_RECONCILIATION'
        targets, why = proposed_routes.get(row['case_id'],
                                           (sorted(refs), 'Inspect task-local/current-run evidence and actual case scope before new validation or record synchronization.'))
        other.append({'caseId': row['case_id'], 'sourceResult': row['result'],
                      'sourceTaskRefs': sorted(refs), 'originalCase': row,
                      'proposedWorkRoute': targets, 'routingRequiresIndependentReview': True,
                      'reason': why, 'nextPreparation': 'LP-04',
                      'codeChangesAuthorizedByThisCase': False, 'newTestOrResultClaim': 'NONE'})
    assert refs, row['case_id']
    cases.append({'caseId': row['case_id'], 'sourceResult': row['result'], 'declaredTaskIds': ';'.join(sorted(refs)),
                  'disposition': bucket, 'originalResultChanged': 'false', 'newProductAcceptance': 'NOT_RUN'})
assert len(rows) == len(cases) == 306 and len({x['caseId'] for x in cases}) == 306
assert len(other) == 13
out = N / 'CASE_REMAINDER.json'
if out.exists() or (N / 'ACCEPTANCE_DISPOSITION.csv').exists():
    raise SystemExit('Do not overwrite existing case-accounting output.')
out.write_text(json.dumps({'count': 13, 'notAdditionalImplementationTasks': True,
                           'notNewlyConfirmedProductDefects': True, 'cases': other}, ensure_ascii=False, indent=2) + '\n')
with (N / 'ACCEPTANCE_DISPOSITION.csv').open('x', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(cases[0]))
    w.writeheader();w.writerows(cases)
print(json.dumps(dict(collections.Counter(c['disposition'] for c in cases)), indent=2))
