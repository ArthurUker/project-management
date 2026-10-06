"""Preparation addendum only. No application or test command is executed."""
from pathlib import Path
import csv
import copy
import hashlib
import json

ROOT = Path(__file__).resolve().parents[6]
OUT = Path(__file__).parent.parent
P = ROOT / 'docs/remediation/2026-10-01-rdpms'
N = ROOT / 'docs/remediation/2026-10-05-luna-remaining-plan'
L = ROOT / 'docs/remediation/2026-10-05-luna-remaining-execution/preparation/2026-10-05T110512Z-luna-preparation-01'
R = ROOT / 'docs/remediation/2026-10-05-codebuddy-luna-independent-review'

def load(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

bindings = {}
def ref(p):
    p = p.resolve(strict=True)
    assert p.is_file() and p.is_relative_to(ROOT)
    x = {'pathBase': 'REPOSITORY', 'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)}
    bindings[x['path']] = x
    return x

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def table(name, rows):
    with (OUT / name).open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        for row in rows:
            w.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v
                        for k, v in row.items()})

assert ROOT.name == 'project-management', ROOT
if (OUT / 'updated-validation-plan.json').exists():
    raise SystemExit('Existing addendum: do not overwrite; resume explicitly.')

for p in [N / 'WORK_ITEMS.json', N / 'VALIDATION_BACKLOG.json', P / 'TASK_GRAPH.json',
          P / 'DECISION_REGISTER.json', P / 'ACCEPTANCE_MATRIX.csv', R / 'findings.json',
          R / 'case-reconciliation.csv', L / 'TASK_ALLOWLIST_DRAFTS.json',
          L / 'APPROVAL_REQUESTS.json', L / 'LP-02/identity-response-matrix.csv',
          L / 'LP-02/last-copy-recovery-matrix.csv']:
    ref(p)

graph = {t['id']: t for t in load(P / 'TASK_GRAPH.json')['tasks']}
backlog = load(N / 'VALIDATION_BACKLOG.json')['tasks']
old_vp = load(L / 'LP-04/validation-plan.json')
resolved = []
for t in old_vp['tasks']:
    for x in t['evidenceRefs']:
        raw = x['refAsRecorded']
        target = P / 'execution' / raw if raw.startswith('RP') else P / raw
        resolved.append({'taskId': t['taskId'], 'recordedRef': raw,
                         'priorExistsObservation': x['exists'], 'exists': target.is_file(),
                         'targetRef': ref(target) if target.is_file() else None,
                         'interpretation': 'Recorded prefix RPxx is relative to P/execution; execution/ is relative to P.'})
write('evidence-resolution.json', {'records': resolved,
      'priorFalseMissingResolved': sum(not x['priorExistsObservation'] and x['exists'] for x in resolved)})

selected = {
    'RP00-T01': ['RP00/RP00-T01/acceptance.json', 'RP00/RP00-T01/evidence/plan-coverage-static-check.json'],
    'RP00-T03': ['RP00/RP00-T03/acceptance.json', 'RP00/RP00-T03/evidence/revision-support-matrix.json'],
    'RP00-T04': ['RP00/RP00-T04/acceptance.json', 'RP00/RP00-T04/evidence/auth-generation-matrix.json'],
    'RP00-T05': ['RP00/RP00-T05/acceptance.json', 'RP00/RP00-T05/evidence/budget-monitoring-register.json'],
    'RP13-T01': ['RP13/RP13-T01/acceptance.json', 'RP13/RP13-T01/runs/2026-10-02-followup-validation/acceptance.json',
                 'RP13/RP13-T01/runs/2026-10-02-followup-validation/task-state.json'],
    'RP13-T02': ['RP13/RP13-T02/acceptance.json', 'RP13/RP13-T02/task-state.json',
                 'RP13/RP13-T02/runs/2026-10-02-continuous-rework/acceptance.json',
                 'RP13/RP13-T02/runs/2026-10-02-continuous-rework/task-state.json',
                 'RP13/RP13-T02/runs/2026-10-02-continuous-rework/evidence/attempt-02/barrier-summary.json',
                 'RP13/RP13-T02/runs/2026-10-02-continuous-rework/evidence/attempt-02/commands-and-results.json'],
    'RP17-T01': ['RP17/RP17-T01/acceptance.json', 'RP17/RP17-T01/evidence/commands-and-results.json',
                 'RP17/RP17-T01/evidence/owned-fs-validation.log'],
    'RP19-T01': ['RP19/RP19-T01/acceptance.json', 'RP19/RP19-T01/evidence/evidence-inventory.json'],
}
specs = {
 'RP00-T01': {
    'reuse': 'Static scope/ownership/artifact cases already PASS; historic TypeScript absence is a historical observation, not proof of current candidate failure.',
    'gap': 'Current exact candidate/build/config parity and PC11 budgets; historical startHead remains unrecoverable and never blocks business.',
    'inputs': ['Exact candidate task/build/config scope', 'Applicable T-RP-08/T-RP-09 config/auth contract for candidate', 'T-RP-11/T-RP-13 values only for included load/release cases'],
    'fixture': 'Owned candidate tree with exact dirty-source digest, synthetic privileged and zero-permission actors, fresh unique PG/FS only if runtime included.',
    'steps': ['Select only candidate-contained tasks/contracts; record source hash and compiler/config entry.', 'Check generated executable consumes intended config and buildID; run owned auth/non-empty-read smoke.', 'Fail candidate/config mismatch explicitly; retain previous safe candidate; do not deploy.'],
    'assertions': ['Candidate hash/buildID/config provenance agree across executable/health/readiness', 'Wrong config or missing compiler never counted as runtime PASS', 'Historic unknown startHead remains UNKNOWN, not a task blocker'],
    'environment': 'Existing TS plus exact candidate; owned environment only. Target/candidate and approved numeric budgets absent means relevant case INPUT_REQUIRED.',
 },
 'RP00-T03': {
    'reuse': 'Checked-in producer/revision matrix artifact is complete; it cannot prove deployed supported clients.',
    'gap': 'Deployed frontend/backend versions, supported legacy/minimum set, and complete task baseline chain.',
    'inputs': ['S03-OI-09 owner-provided versions/support inventory', 'T-RP-03 selected strict/legacy compatibility window and client cutoff'],
    'fixture': 'One synthetic non-empty task per supported client/version; two authorized actors start from same observed revision.',
    'steps': ['Map field, status, assignee, batch, Kanban and offline producer to payload baseline.', 'For each approved client run A update then stale B update at real conditional-write barrier.', 'Inspect HTTP/sync rejection, DB revision/fields, audit/receipt and retained local payload. Include legacy branch exactly as approved.'],
    'assertions': ['Every supported producer sends/consumes the approved baseline', 'Stale write cannot overwrite newer state', 'Rejected stale write preserves client last copy; mixed batch per-item effects match approved contract'],
    'environment': 'Owned real PG plus actual supported client artifacts/browser/IDB; package.json alone is insufficient.',
 },
 'RP00-T04': {
    'reuse': 'Bearer access and JSON-body refresh, source generation matrix, unsigned joint contract.',
    'gap': 'T-RP-09 selection and complete real JWT/multi-tab lineage proof; D-S01-04 is a separate access invalidation choice.',
    'inputs': ['T-RP-09 family/CAS/replay window/generation/storage/failure-cleanup contract', 'D-S01-04 only for access invalidation events actually included'],
    'fixture': 'Synthetic A/B accounts and valid JWT/refresh tokens, two isolated browser tabs sharing one owned profile and storage.',
    'steps': ['Prove actual login/access/refresh and a non-empty authorized operation.', 'Hold refresh/server response at named token-consumption barrier; trigger two tabs, account switch, logout or newer generation.', 'Release old success/failure and original request retry; inspect actual Authorization, actor, token rows and browser stores.'],
    'assertions': ['One approved token-consumption outcome; exact replay-window behavior', 'Old success/failure cannot mutate newer identity token store', 'Original A request never reaches server authenticated as B', '401/403/offline outcomes are distinct'],
    'environment': 'Owned real PG/JWT and browser tabs; trusted actor injection or mock storage cannot close PC01.',
 },
 'RP00-T05': {
    'reuse': 'Budget register and candidate-scope templates; no approved numeric values.',
    'gap': 'Target limits/baselines, owner thresholds, candidate scope and release observation/containment choice.',
    'inputs': ['T-RP-11 per-domain budgets and measurement baseline', 'T-RP-13 observation window/threshold/owner/stop and safe fallback'],
    'fixture': 'Owned candidate with synthetic payload/graph/queue/files distributions representative of owner-approved constraints.',
    'steps': ['Bind each selected case to effective proxy/app/DB/IDB/FS budget.', 'After approval run bounded load and named failure below/at/above boundary; record measurements and durable state.', 'Exercise local stop/containment without production switch; preserve last safe data/candidate.'],
    'assertions': ['Measured limits are bounded and compared with signed values', 'No infinite retry, lost outbox copy or unsafe old-code fallback', 'All release decisions attributable to named owner, never inferred from a local build'],
    'environment': 'Target-like owned load environment and approved numbers; absent values -> INPUT_REQUIRED, no invented stress threshold.',
 },
 'RP13-T01': {
    'reuse': 'Followup run contains real DB/API 3001 live + 5001 tombstones, stable timestamp/id order and server keyset local PASS.',
    'gap': 'Real client IDB persistence/reopen and RP11-T01 joint ownership/ACL acceptance; late-commit is RP13-T02/03 scope.',
    'inputs': ['RP11-T01 acceptance dependency', 'Approved actor/cache ownership fallback for joint PC04/05 scope'],
    'fixture': 'Reuse frozen server evidence when current source hashes match; owned browser/profile, non-empty mirrors/outbox, actor A and B.',
    'steps': ['Apply first page to real IDB and interrupt before terminal page/checkpoint.', 'Reopen, retry page, inject transaction abort before cursor commit, then finish all streams.', 'Switch/revoke actor between pages and prove old results cannot mutate new namespace; preserve outbox.'],
    'assertions': ['Cursor advances only after all page data commits', 'Reopen/abort cannot create a skipped page or lose pending payload', 'Same timestamp/id replay deduplicates', 'No claim that keyset alone solves late commit'],
    'environment': 'Real IDB/browser or already-installed fake-indexeddb for narrower unit layer; missing package is ENV_BLOCKED, do not install. JWT/browser joint remains separate.',
 },
 'RP13-T02': {
    'reuse': '2026-10-02 run: real PG candidate SQL model hides uncommitted source, serializes publishers, handles source rollback; sequence counterexample proves permanent miss.',
    'gap': 'Unsigned ADR, application producer coverage, publisher crash/retry, resource revision/bootstrap/ACL, epoch/retention and actual client checkpoints.',
    'inputs': ['T-RP-04 selected source/log/snapshot/publisher design and exact producer set', 'T-RP-10 restore epoch/stale cursor/session/receipt/outbox contract', 'S03-OI-01 full applicable proof'],
    'fixture': 'Only after approval: isolated candidate implementation, two PG transactions, real publisher, synthetic live/tombstone resources and owned IDB.',
    'steps': ['Reuse existing model evidence; do not rerun the model merely because the old root artifact says NOT_RUN.', 'At application source commit, publisher commit and snapshot cut barriers, schedule late source, same-resource later revision, publisher crash/restart and page retry.', 'Exercise epoch RESET/ACL loss/expired cursor with retained owner outbox; enumerate every supported producer.'],
    'assertions': ['Every committed eligible change appears in current or subsequent window', 'Late old event never overwrites newer snapshot/revision', 'Crash/retry no loss; watermark never advances past unpublished change', 'Restore/cursor expiry preserves owner last copy and forces approved reauthorization'],
    'environment': 'Approved application candidate + real PG/publisher/IDB. Candidate SQL model PASS remains model-scope, not production safe-watermark acceptance.',
 },
 'RP17-T01': {
    'reuse': 'Owned local FS run proves first snapshot immutable, staging publication and rsync failure preserving latest; not Linux target proof.',
    'gap': 'Target Linux filesystem/inode/permissions/bad-directory matrix and broader PC08 pairing/concurrency.',
    'inputs': ['S05-OI-01 exact owned Linux FS facts', 'T-RP-11 only for package budgets/retention/concurrency cases', 'Exact owned temporary root and commands'],
    'fixture': 'Owned Linux temporary tree with synthetic bytes, symlinks, permissions/inodes; latest points at prior completed snapshot.',
    'steps': ['Create baseline complete snapshot and record every byte/manifest/link target.', 'Fail staging at bad directory, permission denied, unavailable capacity and interrupted copy; inspect last safe snapshot.', 'Publish second completed run then repeat with concurrent run-lock semantics only after RP17-T02 implementation.'],
    'assertions': ['Prior snapshot bytes/manifest/inodes never modified', 'Incomplete staging never becomes latest', 'Cleanup never removes last valid DB/files pair', 'Exact Linux binary/FS/permission behavior documented'],
    'environment': 'Owned Linux host/container with verified FS; current macOS and absent Docker cannot be labeled target PASS.',
 },
 'RP19-T01': {
    'reuse': 'Static evidence inventory preserves R12-N01 candidate; no owner-attributable coordination proof received.',
    'gap': 'External scheduler/write barrier/storage snapshot evidence and paired DB/files same-time restore point.',
    'inputs': ['S05-OI-02 attributable operations/DB-owner evidence', 'No real DB/files access in this authorization'],
    'fixture': 'Owner-provided sanitized scheduler/coordination/config evidence, then own synthetic paired restore resources if allowed.',
    'steps': ['Trace exact backup job and consistency boundary from supplied attributable artifacts.', 'Distinguish same runId/hash labels from actual consistent snapshot proof.', 'If scope is authorized, mutate synthetic metadata/bytes at cut and restore same/mismatched pair; classify candidate supported/refuted/insufficient.'],
    'assertions': ['Candidate cannot become SUPPORTED merely from absent external records', 'Same-time DB/files reference,size/hash consistency demonstrated', 'Uncertain evidence remains PENDING with exact missing owner fields'],
    'environment': 'External evidence first; synthetic restore cannot stand in for actual operations coordination facts.',
 },
}
tasks = []
for old in backlog:
    tid = old['taskId']
    item = {'taskId': tid, 'specStatus': 'SPECIFICATION_ONLY', 'dynamicStatus': 'NOT_RUN',
            'implementationDependencies': graph[tid]['implementationDependencies'],
            'acceptanceDependencies': graph[tid]['acceptanceDependencies'],
            'gateRequirements': graph[tid]['gateRequirements'], 'caseIds': old['caseIds'],
            'minimumNextValidation': specs[tid], 'observedArtifacts': []}
    for rel in selected[tid]:
        q = P / 'execution' / rel
        if q.is_file():
            data = load(q) if q.suffix == '.json' else q.read_text()
            item['observedArtifacts'].append({'ref': ref(q), 'data': data,
                'layer': 'EXISTING_EXECUTOR_ARTIFACT_READ_ONLY_REUSE; not a new dynamic PASS'})
        else:
            item['observedArtifacts'].append({'path': q.relative_to(ROOT).as_posix(), 'exists': False})
    item['cleanupRequired'] = 'Future runs: finally release/settle barriers, guarded drop owned DB, stop exact owned processes, remove exact owned temp root; no audit-row deletion.'
    if tid == 'RP13-T02':
        item['stateInterpretation'] = 'Old root IN_PROGRESS/NOT_RUN is historical. Later run local barrier scope delivered/SIGNOFF_PENDING, validation ENV_BLOCKED; current graph implementation COMPLETE refers to delivered local scope. Preserve these distinct boundaries, not a fabricated current conflict.'
    tasks.append(item)
write('updated-validation-plan.json', {'status': 'SPECIFICATION_ONLY', 'dynamicStatus': 'NOT_RUN',
                                      'taskCount': 8, 'tasks': tasks})

# 13 existing cases, concrete run matching and remaining assertion scope.
matrix = list(csv.DictReader((P / 'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')))
by_case = {x['case_id']: x for x in matrix}
review_rows = list(csv.DictReader((R / 'case-reconciliation.csv').open()))
run_map = {
 'RP04-T01': 'RP04/RP04-T01/runs/2026-10-02-followup-validation/acceptance.json',
 'RP04-T02': 'RP04/RP04-T02/runs/2026-10-03-codebuddy-b18-rework/acceptance.json',
 'RP05-T01': 'RP05/RP05-T01/runs/2026-10-02-continuous-rework/acceptance.json',
 'RP08-T01': 'RP08/RP08-T01/runs/2026-10-03-codebuddy-lr3-validation/acceptance.json',
 'RP14-T01': 'RP14/RP14-T01/runs/2026-10-02-followup-validation/acceptance.json',
}
scope_checks = {
 'AC-B04-02': ('RP08-T01', ['AC-B04-02'], 'Server permission rejection/ACL response is not real cached-row eviction. Need RP08-T02/real IDB owner and T-RP-04/T-RP-12.'),
 'AC-B11-02': ('RP14-T01', ['AC-B11-02'], 'FAILED/SKIPPED policy case remains NOT_RUN pending T-RP-05; CLEAN/INFECTED bytes are separate.'),
 'AC-B19-01': ('RP05-T01', ['AC-B19-01'], 'Run explicitly covers online create/update and sync cross-project parent with authorized same-project success. Verify exact route/log/DB row before future matrix synchronization.'),
 'AC-B19-02': ('RP05-T01', [], 'All cycle lengths is optional DAG scope, not established by same-project guard. D-S01-08 plus explicit RP05-T03 activation required.'),
 'AC-B19-03': ('RP05-T01', ['AC-B19-03'], 'External-child containment is observed; original recursive projectId requirement needs path-by-path comparison, not wholesale PASS from a single fixture.'),
 'AC-B19-04': ('RP05-T01', [], 'No real legacy-anomaly inventory. Data owner snapshot/report S04-OI-01 and D-S01-08 disposition needed; no cleanup now.'),
 'PAC-RP04-01': ('RP04-T01', ['AC-B03-01', 'AC-B03-02', 'AC-B03-03'], 'Local legal/illegal transition, template startDate and batch assertions available. Package row still original result; preserve JWT/target limits.'),
 'PAC-RP04-02': ('RP04-T02', ['AC-B18-01', 'AC-B18-02'], 'Aggregate child fault and same-key retry local PASS; RP09-T01 acceptance dependency/PC03 joint remain open.'),
 'PAC-RP04-03': ('RP04-T01', ['AC-B20-01', 'AC-B20-02', 'AC-B20-03'], 'Project list/count/stats/detail evidence available. Explicit search/recycle assertions must match definition; phase-resource filter is separate CONTRACT_UNRESOLVED.'),
 'PAC-RP04-04': ('RP04-T02', ['AC-B18-01', 'AC-B18-03'], 'Local child/sequence/audit/receipt failure evidence exists; exact numbering/event effects and RP09 joint acceptance still separately required.'),
 'PAC-RP05-01': ('RP05-T01', ['PAC-RP05-01'], 'Reachable legal fixture plus no-delete permission preserves task rows. Exact attachment/link assertion matching remains required; no tasks:[]-only unreachable fixture.'),
 'PAC-RP05-02': ('RP05-T01', ['PAC-RP05-02', 'AC-B19-01'], 'HTTP/sync guards observed; enumerate nested array path assertions separately against definition.'),
 'PAC-RP05-03': ('RP05-T01', ['PAC-RP05-03', 'AC-B19-03'], 'Actual A edit cannot cascade-delete external B child; before/after parent/child evidence exists. No broad DAG conclusion.'),
}
case_rows = []
for row in review_rows:
    cid = row['caseId']; tid, ids, explanation = scope_checks[cid]
    q = P / 'execution' / run_map[tid]; data = load(q); observed = [c for c in data.get('cases', []) if c.get('id', c.get('caseId')) in ids]
    case_rows.append({'caseId': cid, 'originalResult': by_case[cid]['result'],
        'originalDefinition': by_case[cid]['target_behavior'], 'originalTaskRefs': by_case[cid]['task_refs'],
        'runRef': ref(q), 'actualCaseRows': observed, 'assertionAnalysis': explanation,
        'preparationDisposition': row['reviewDisposition'], 'proposedScopeOnly': row['proposedScopeOnly'],
        'requiredRemainingEvidence': row['remainingRequirement'], 'originalMatrixWrites': 'NONE',
        'dynamicStatus': 'NOT_RUN_BY_THIS_RUN'})
table('case-evidence-reconciliation.csv', case_rows)

# Explicit events and immutable initiating actor/generation, no new protocol selection.
identity = []
def add_identity(cid, scenario, origin, sequence, assertions, inputs='T-RP-09 generation/family/cleanup selection'):
    identity.append({'caseId': cid, 'scenario': scenario, 'initiatingContext': origin,
        'successPrecondition': 'Synthetic actual A and B login/access plus non-empty authorized operation; capture A actor/gen/token and owned storage before barrier.',
        'deterministicSequence': sequence, 'networkAndDurableAssertions': assertions,
        'pendingFields': inputs, 'evidenceLayerRequired': 'REAL_JWT_PG_AND_OWNED_BROWSER_TABS; mock layer recorded separately',
        'status': 'SPECIFICATION_ONLY', 'dynamicStatus': 'NOT_RUN'})
for name, transition in [('same-generation', 'Keep A/g1 active'), ('newer-generation', 'Advance A to g2 before release'),
                         ('A-to-B', 'Complete B/gB login before release'), ('logout', 'Logout before release')]:
    add_identity('ID-SUCCESS-'+name, 'Old refresh success', 'A/g1 captured at request start',
                 'Hold refresh result after token-consumption barrier; '+transition+'; release success; record token/store/actor.',
                 'Only approved same owner/generation may accept result; newer A/B/logout stores untouched; no B request with A token; server lineage outcome recorded.')
    add_identity('ID-FAILURE-'+name, 'Old refresh failure', 'A/g1 captured at request start',
                 'Hold error response before client cleanup; '+transition+'; release failure; reopen/read store.',
                 'Cleanup compares initiating lineage; stale failure cannot clear A/g2 or B/gB. Logout cannot be undone. Exact access/refresh/owner keys checked.')
    add_identity('ID-REPLAY-'+name, 'Original protected request retry', 'Original command belongs to A/g1 with immutable request/key/hash',
                 'Hold A request auth-expiry response; '+transition+'; release and attempt approved refresh/retry.',
                 'A original request is never sent with B credential. If lineage changes cancel/hold it; allowed same-owner replay reuses immutable command and applies once.')
for cid, scene, sequence, assertion, inputs in [
 ('ID-ME-SWITCH','Slow /me A to B','Hold A /me response; complete B login/non-empty request; release A response.','B profile/permissions remain; no A profile written into B cache; request actor snapshots observed.','T-RP-09 auth-state generation and profile ownership'),
 ('ID-ME-LOGOUT','Slow /me after logout','Hold A /me; logout; release A response.','No re-login from late /me; auth/cache remain logged out; A unsent payload remains recoverable.','T-RP-09/T-RP-12'),
 ('ID-OFFLINE','Offline then newer login','Hold/delay A network failure; offline A; establish B on reconnect; deliver old failure.','No token cleared merely for network failure; old A retry never becomes B; A outbox preserved.','T-RP-09/T-RP-12'),
 ('ID-401','Auth expiry 401','Send actual expired access with valid originating refresh; observe one approved refresh/retry.','Credential expiry handled once within original lineage; terminal failure never clears newer token.','T-RP-09 replay/cleanup window'),
 ('ID-403','Current permission denial 403','Use valid token but remove target permission; request real existing resource.','No refresh loop; resource remains denied; no mutation or receipt/DB side effect.','Current permission contract, no new policy'),
 ('ID-REVOKE','Disable/downgrade/password reset','Hold authorized original A request or refresh; apply synthetic approved revocation event; release.','Exactly signed event invalidation time and all auth entrypoints; DB version/refresh/audit atomic; no silent activation.','D-S01-04 event-by-event time bound and T-RP-09'),
 ('ID-TABS','Two tabs same refresh family','Two owned tabs capture same token; barrier immediately before real conditional token consume; release both in controlled order.','Strict single-use or approved bounded replay outcome only; no double successor outside approved window; failure cannot erase valid successor.','T-RP-09 choose CAS/family/window/failure behavior; no implicit dual-success'),
 ('ID-TABS-SWITCH','Two tabs with account switch','Tab1 holds A refresh success/failure; tab2 logs into B with approved cross-tab notification; release tab1.','Both tab states obey chosen generation ownership; late A response never mutates or authenticates B request.','T-RP-09 tab coordination/storage/fallback capability'),
]: add_identity(cid,scene,'A/g1 and exact request actor captured',sequence,assertion,inputs)
table('identity-response-addendum.csv', identity)

last_copy = []
for cid, scenario, owner, source, target, fault, expected, recover, pending in [
 ('LC01','Reliable owner account switch','A owner proven by approved persisted namespace/identity','A outbox exact key/hash/payload','A-owned recoverable destination','Abort move before destination commits','A source remains; B never reads/sends it; no inference from payload','After A reauth, current permission recheck before view/export/retry','T-RP-01/T-RP-09/T-RP-12 storage/migration schema'),
 ('LC02','Unknown owner legacy row','OWNER_UNKNOWN, never assigned to current A/B','Legacy row exact bytes/key','Unassigned quarantine/recoverable namespace as selected','First login/upgrade without provable owner','Original bytes kept; no automatic send or current-user disclosure','Only approved attributable ownership recovery; if unknown preserve and expose only signed governance path','T-RP-01 unknown-owner isolation/access/retention/operator fields OPEN_INPUT'),
 ('LC03','Upgrade blocked','Proven A or explicitly unknown','Old-version source DB row','Approved versioned namespace','Other tab holds DB connection at versionchange','No clearAll or source deletion; blocked upgrade surfaced and retryable','Close owned tab connection via approved flow; reopen original/new DB and compare bytes','T-RP-01/T-RP-09 multi-tab coordination'),
 ('LC04','Versionchange page closes','Original owner captured before upgrade','Old DB row','Approved upgraded namespace','Close page before destination tx commit','Either complete tx or original copy remains; no half-owned row','Reopen and compare exact key/hash/body/owner plus migration marker','T-RP-01 migration atomicity/marker'),
 ('LC05','Transaction abort moving rejection/conflict','Authenticated A matches persisted owner','A outbox','A conflict/deadLetter destination','Abort transaction after destination put before source delete commit','Source or destination complete copy persists; no interval with neither','Reopen and inspect both stores; same command key survives','T-RP-12 selected last-copy transaction scope'),
 ('LC06','Quota exhaustion','Proven owner A','Payload in original store before enqueue/move','Approved recoverable store or explicitly retained source','QuotaError on destination write','No deletion/overwrite of last copy; terminal status not fabricated','Owner can retrieve original bytes through signed recovery/export flow','T-RP-11 size budgets and T-RP-12 user recovery'),
 ('LC07','Page closes during conflict apply','Proven owner A','Original command/conflict body','Conflict result or immutable next command only after selected action','Close between result processing and final persistence','Atomic preserved conflict before outbox removal; old/new command keys distinct','Reopen conflict and current server revision; reauthorize before resolving','T-RP-12 conflict choice; T-RP-02 immutable replay'),
 ('LC08','Permission revoked with unsent data','Proven owner A, current write denied','A unsent payload','Held A recoverable payload; mirror purge separate','Revoke capability then refresh ACL/page','No unauthorized send; cached server rows removed per approved scope; original unsent bytes retained','View/export/abandon only under chosen current authorization policy','T-RP-04/T-RP-12 revoked-owner access/export fields'),
 ('LC09','Logout with unsynced payload','Proven A origin, no active actor after logout','A outbox','A recoverable namespace','Close/abort during logout move/cache cleanup','No source removal before last-copy durable commit; logout cannot disclose A to next B','A reauth and current capability check; explicit recovery UI choices','T-RP-12 logout preservation'),
 ('LC10','User exports then explicitly abandons','Current actor matches owner and export is approved','Last recoverable payload','Owned exported exact byte copy or retained source','Export fails or page closes before confirmed download','Do not mark export completed/delete source on failed export; abandon only exact selected row after confirmation','Inspect exported key/hash/body and source deletion/audit contract','T-RP-12 export confirmation/abandon/audit fields'),
 ('LC11','Unknown/expired receipt','Original A/device/key/hash retained','A immutable outbox command','Held recovery record until approved outcome lookup','Server retention expired or unknown lookup','No silent re-key/replay; retain local original copy and status','Signed unknown/expired user workflow and current authorization','T-RP-02 retention/offline; T-RP-12 recovery'),
 ('LC12','Oversize/quarantine','Proven owner or UNKNOWN explicitly preserved','Unsent payload before send','Signed held/deadLetter/quarantine mechanism','Enqueue/send cap or classification rejection','No destructive auto-drop/truncation; max bytes not invented','Explicit owner/governance review/export/abandon policy','T-RP-11 exact sizes and T-RP-12 mechanism choice'),
]:
    last_copy.append({'caseId':cid,'scenario':scenario,'ownerProof':owner,'sourceLastCopy':source,
      'destination':target,'faultBoundary':fault,'durableAndReopenAssertions':expected,
      'recoveryCondition':recover,'pendingChoice':pending,
      'evidenceLayerRequired':'REAL_OWNED_IDB_BROWSER_TRANSACTION_AND_REOPEN; no mock substitute',
      'status':'SPECIFICATION_ONLY','dynamicStatus':'NOT_RUN'})
table('last-copy-addendum.csv', last_copy)

# Task-specific narrowing; source ceiling never grants all package files.
draft = copy.deepcopy(load(L / 'TASK_ALLOWLIST_DRAFTS.json'))
remove = {
 'RP10-T01': ['backend/src/routes/reports.js','backend/src/modules/reports/reportCommands.ts',
              'frontend/src/api/endpoints/reports.ts','frontend/src/types/report.ts'],
 'RP16-T01': ['backend/prisma/schema.prisma','backend/src/platform/recovery/dataEpoch.ts'],
 'RP16-T02': ['backend/prisma/schema.prisma'],
}
special = {
 'RP10-T01': 'Full offline CAS producer chain touches sync/engine paths outside RP10 ceiling; register exact cross-package scope and client matrix before implementation, never silently omit those producers.',
 'RP13-T03': 'Producer HTTP/sync/import/restore/cascade path enumeration and frontend bootstrap/epoch are necessary; package ceiling alone cannot authorize all producer writes. Narrow exact paths after approved ADR and register any cross-package scope gap.',
 'RP16-T01': 'Only registry derivation/preview-validation integration. No epoch/restore-effect or business schema changes; T-RP-10 is not silently activated.',
 'RP16-T02': 'Apply transaction/count/post-commit reconciliation only; use existing schema and registry. Actual epoch/session effect belongs RP16-T03.',
 'RP15-T01': 'No source/test writes; only approved owner-supplied schema/anomaly report. No real DB query under current authorization.',
 'RP19-T04': 'No interim re-reconciliation loop. Only final closure once original task/candidate disposition conditions hold.',
}
purpose_by_file = {
 'users.js':'Only this task account mutation authorization/version/forced-change effects, using its separately approved rule; no role binding/seed change.',
 'auth.js':'Only approved token/session transport, consumption or response contract for this task; no automatic activation or new policy.',
 'rbac.js':'Only this task current actor/security-version or hierarchy enforcement consumer; preserve unrelated permissions and seed.',
 'strictAudit.js':'Only required tx-consistent or denial audit for this task; no global best-effort conversion or audit deletion.',
 'roles.js':'Only explicitly activated custom role binding; ordinary role DTO remains accepted and unchanged.',
 'projects.js':'Only this task project relation/aggregate/manager adapter; preserve report/auth and other package semantics.',
 'tasks.js':'Only this task relation/DAG/CAS HTTP producer; exact command scope, no unrelated body/status policy.',
 'sync.js':'Only this task entity/field/receipt/cursor/ACL command path; enumerate impacted operations, no implicit delete adapter change.',
 'registrations.js':'Only current task scoped registration entrypoints or manager transfer adapter, no unnamed global exception.',
 'projectAccess.js':'Only current scope visibility/capability adapter, preserve unrelated project and elevated contracts.',
 'taskCommands.ts':'Only current task shared command relation/CAS invariants; existing callers enumerated before mutation.',
 'projectCommands.ts':'Only scoped atomic project relation/manager command and registered adapters; no new unrelated workflow.',
 'reportCommands.ts':'Only this task signed report source-state/concurrency command; accepted snapshot/late-save guards preserved.',
 'reports.js':'Only this task signed report transition adapter and same-key replay; no draft/body/role-policy expansion.',
 'schema.prisma':'Conditional only: approved task requires exact protocol/session/ACL schema change, with named schema/compatibility/lock contract and migration path separately authorized. Existing schema otherwise read-only.',
 'receipts.js':'Only this task per-command scoped receipt/unknown/idempotent retry; do not alter unrelated HTTP receipt contract.',
 'payloadHash.js':'Only signed normalization/hash version and compatibility for current command scope; immutable retries preserved.',
 'syncMutationCommands.ts':'Only v2 proposed command tx/receipt adapter if selected T-RP-02 design requires it.',
 'syncReadPolicy.ts':'Only scoped approved sync field/own-only/ACL projection; registration exception remains separately gated.',
 'tokenStore.ts':'Only approved actor/generation compare-before-write/clear semantics, preserve initiating identity.',
 'AuthProvider.tsx':'Only scoped auth state/slow-profile/logout generation transitions.',
 'http.ts':'Only scoped auth expiry/refresh/replay lineage; 403/offline remain distinct.',
 'engine.ts':'Only this task owner/ACL/page/outbox/result handling, preserve immutable payload and last copy.',
 'idb.ts':'Only approved owned namespace/transaction/migration for this task; no destructive unknown-owner assignment.',
 'restoreSchemaRegistry.js':'Only schema-aware supported PK/unique/FK registry; no epoch policy.',
 'backupRestore.js':'Only current registry/apply/count/epoch subtask boundaries; no real restore or implied full DB mirror.',
 'backup.js':'Only current JSON restore command/response adapter; no production invocation.',
 'dataEpoch.ts':'Only RP16-T03 after T-RP-10 explicit approval; never activated by registry or count task.',
 'backup-pg.sh':'Only current immutable/concurrent/paired synthetic backup scope; real paths cannot be executed.',
 'backup-drill.py':'Only owned synthetic pair/restore-point drill for current task; no real DB/files.',
 'deploy.sh':'Only current candidate/lock/switch/release evaluation portion; no production switch or release claim.',
 'preflight.sh':'Only current candidate/config gate ordering and approved config semantics.',
 'createApp.js':'Only candidate effective config/readiness construction for approved scope; no auth feature expansion.',
 'configSchema.ts':'Only v2 proposed approved effective config/CLI contract, no arbitrary new config precedence.',
 'rdpms-env':'Only approved candidate CLI config transport; never read real dotenv or SSH.',
}
work = {t['id']:t for t in load(N / 'WORK_ITEMS.json')['tasks']}
for t in draft['tasks']:
    tid=t['taskId']; denied={'rdpms-system/'+x for x in remove.get(tid,[])}
    original=list(t['candidateWritePaths']); t['candidateWritePaths']=[x for x in original if x not in denied]
    t['removedFromPriorDraft']=[{'path':x,'reason':special[tid]} for x in original if x in denied]
    t['fileConditions']=[]
    for path in t['candidateWritePaths']:
        name=Path(path).name
        reason=purpose_by_file.get(name)
        if reason is None:
            reason='Only '+t['title']+' producer/interface consumption in '+path+'; required callsite must be demonstrated before granting this exact file. No unrelated component refactor.'
        condition='Current applicable implementation gates and task baseline satisfied; exact callsite necessary.'
        if name=='schema.prisma':condition='NO_SCHEMA_WRITE_BY_DEFAULT; exact separately approved schema/compatibility/lock plan required.'
        if name in ['auth.js','users.js','rbac.js'] and tid=='RP01-T02':condition='Rank/reset D-S01-01; forced-password-change sub-scope separately D-S01-02.'
        if name=='dataEpoch.ts':condition='RP16-T03 only; T-RP-10 approved; not a registry/count change.'
        t['fileConditions'].append({'path':path,'purpose':reason,'condition':condition,'notGrantedByThisPreparation':True})
    t['scopeGapOrNarrowing']=special.get(tid,'No package-wide grant; prove exact current task caller before authorizing each candidate.')
    t['testEvidenceLayers']=[]
    paths=list(t['proposedExactTestPaths'])
    if tid=='RP03-T02':paths.insert(0,'rdpms-system/backend/tests/integration/rp03-session-revocation.integration.test.mjs')
    if tid=='RP08-T02':paths.insert(0,'rdpms-system/backend/tests/integration/rp08-acl-revision.integration.test.mjs')
    for path in paths:
        layer='OWNED_REAL_PG_HTTP_AND_PERSISTENT_ROWS' if '/backend/tests/' in path else 'OWNED_REAL_FILESYSTEM_OR_SYNTHETIC_CANDIDATE' if '/deploy/tests/' in path else 'REAL_OWNED_IDB_OR_BROWSER; installed unit adapter narrower than JWT/browser chain'
        t['testEvidenceLayers'].append({'path':path,'layer':layer,'status':'DRAFT_NOT_CREATED','mustEstablishSuccessBeforeNegative':True})
    t['proposedExactTestPaths']=paths
    t['includedProposedModules']=[x for x in t['includedProposedModules'] if x in t['candidateWritePaths']]
    t['grantStatus']='DRAFT_NO_BUSINESS_OR_MIGRATION_AUTHORIZATION'
    t['sourceTaskBoundary']=work[tid]['taskBoundary']
draft['status']='DRAFT_NARROWED_SPECIFICATION_ONLY'
draft['scopeDoesNotAuthorizeCrossPackageFiles']=True
write('task-allowlist-addendum.json',draft)

register=load(P/'DECISION_REGISTER.json'); regref=ref(P/'DECISION_REGISTER.json'); graphref=ref(P/'TASK_GRAPH.json'); source_requests=load(L/'APPROVAL_REQUESTS.json')['requests']
approval=[]
for i,d in enumerate(register['decisions']):
    x=copy.deepcopy(next(a for a in source_requests if a['decisionId']==d['id']))
    x['sourceRefs'] += [{**regref,'pointer':'/decisions/'+str(i)},
                       {**graphref,'taskIds':d['affectedTaskIds'],'pointerMeaning':'Match tasks by id, preserve condition/before/precise scope.'}]
    x['sourceStatus']=d['status']; x['approvedBy']=None;x['approvedAt']=None;x['evidenceRef']=None
    approval.append(x)
write('approval-source-addendum.json',{'status':'PENDING_OWNER_DECISIONS','count':21,'requests':approval})
write('source-bindings.json',{'status':'READ_ONLY_SOURCE_BINDINGS','count':len(bindings),'files':list(bindings.values()),
                            'oldArtifactsNotOverwritten':True,'dynamicStatus':'NOT_RUN'})
write('task-state.json',{'preparationDelivery':'COMPLETE','scope':'RV-LP-01..05 differential preparation only',
                       'businessImplementation':'NOT_RUN','validation':'SPECIFICATION_ONLY','release':'NOT_EVALUATED',
                       'originalTaskOrMatrixWrites':False,'pendingDecisions':21})

# Self-check is preparation proof only, never product validation.
fail=[]
for x in bindings.values():
    if sha(ROOT/x['path'])!=x['sha256']:fail.append(x['path'])
assert len(tasks)==8 and len(case_rows)==13 and len(draft['tasks'])==36 and len(approval)==21
assert all(x['approvedBy'] is None and x['approvedAt'] is None and x['evidenceRef'] is None for x in approval)
for t in draft['tasks']:
    w=work[t['taskId']];ceiling=set(w['originalPackageExistingFileCeiling'])|set(w['originalProposedModulePaths'])
    assert set(t['candidateWritePaths'])<=ceiling
    assert t['implementationDependencies']==graph[t['taskId']]['implementationDependencies']
    assert t['acceptanceDependencies']==graph[t['taskId']]['acceptanceDependencies']
    assert t['gateRequirements']==graph[t['taskId']]['gateRequirements']
assert not fail,fail
write('evidence/preparation-readback.json',{'result':'PASS','scope':'Preparation content/cardinality/source checks only',
    'taskSpecs':8,'caseAnalysis':13,'taskAllowlist':36,'unsignedDecisions':21,'sourceBindings':len(bindings),
    'falseMissingResolved':sum(not x['priorExistsObservation'] and x['exists'] for x in resolved),
    'identityCases':len(identity),'lastCopyCases':len(last_copy),'productDynamicCommands':0})
print('Preparation addendum generated; all 49 false missing refs resolved; 8/13/36/21 counts verified.')
