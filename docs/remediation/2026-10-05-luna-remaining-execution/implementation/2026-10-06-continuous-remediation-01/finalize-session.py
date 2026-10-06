from pathlib import Path
import json,hashlib,collections,subprocess,shutil,csv,datetime
ROOT=Path.cwd();P=ROOT/'docs/remediation/2026-10-01-rdpms';S=Path(__file__).resolve().parent;R=P/'execution/RP19/RP19-T04/runs'/S.name;now=datetime.datetime.now().astimezone().isoformat()
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):return str(p.relative_to(ROOT))
state=json.loads((P/'IMPLEMENTATION_STATE.json').read_text());baseline=json.loads((S/'start-baseline.json').read_text());assert len(state['tasks'])==54
frozen_drift=[r['path'] for r in baseline['protected'] if not (ROOT/r['path']).is_file() or sha(ROOT/r['path'])!=r['sha256']];assert not frozen_drift,frozen_drift
scopes=json.loads((S/'task-scopes.json').read_text());allowed={p for t in scopes.values() for p in t.get('allowedFiles',[])}
for name in ['FOLLOWUP-SYNC-V1-CI','FOLLOWUP-COMPILED-ACCEPTANCE']:
 a=json.loads((S/name/'authorization.json').read_text());allowed.update(a['allowedFiles'])
delta=[r for r in baseline['sourceFiles'] if not (ROOT/r['path']).exists() or sha(ROOT/r['path'])!=r['sha256']];unknown=[r['path'] for r in delta if r['path'] not in allowed];assert not unknown,unknown
all_source={ref(p):sha(p) for d in ['backend/src','backend/tests','backend/prisma','frontend/src','frontend/tests','deploy'] for p in sorted((ROOT/'rdpms-system'/d).rglob('*')) if p.is_file()}
results=[]
for base in sorted((S/'evidence').rglob('run-results.json')):
 d=json.loads(base.read_text());results.append({'path':ref(base),'sha256':sha(base),'criticalFailures':d.get('criticalFailures',[]),'cleanup':d.get('cleanup',{}),'kind':d.get('kind',d.get('layer'))})
# Current owned runner temporaryroots all absent; these paths come from actual recorded ownership.
owned_roots=[]
for row in results:
 d=json.loads((ROOT/row['path']).read_text())
 for k in ['ownedTempRoot','temporaryRoot','ownedProfileRoot']:
  if isinstance(d.get(k),str):owned_roots.append(d[k])
# Source/FS cleanup is proved by each actual run plus final process snapshot; unknown resources never removed.
processes=subprocess.run(['pgrep','-fl','postgres|rdpms-runtime-candidate-owned|run-suite.py'],capture_output=True,text=True)
save(S/'cleanup-final.json',{'at':now,'backendDistExists':(ROOT/'rdpms-system/backend/dist').exists(),'ownedRootPathsFromRecords':owned_roots,'ownedRootsStillExist':[p for p in owned_roots if Path(p).exists()],'actualProcessSnapshot':processes.stdout,'processSnapshotExit':processes.returncode,'note':'No unknown/shared process or root was terminated/adopted; per-run guarddrop/stop/ownrootcleanup authoritative.'})
assert not (ROOT/'rdpms-system/backend/dist').exists()
for tid,scope in scopes.items():
 if tid in state['tasks']:scope['state']=state['tasks'][tid]['implementation'];scope['validation']=state['tasks'][tid]['validation'];scope['canonicalEvidence']=state['tasks'][tid].get('latestRun')
save(S/'task-scopes.json',scopes)
a=json.loads((S/'authorization.json').read_text());a.update(activeTask=None,nextReadyTask=None,stopReason='All current independent authorized local STANDARD work delivered; only4 externalmaterial dependent STANDARD and2inactiveOPTIONAL remain',completedTaskIds=[t for t in scopes if t in state['tasks'] and state['tasks'][t]['implementation']=='COMPLETE']);save(S/'authorization.json',a)
readiness=json.loads((S/'candidate-final/release-readiness.json').read_text());blockgroups=dict(collections.Counter(b['code'] for b in readiness['blockers']));reconciliation=json.loads((R/'evidence/programme-reconciliation.json').read_text());shutil.copytree(S/'candidate-final',R/'evidence/candidate-final')
regressions=[]
for result in json.loads((S/'final-regression-summary.json').read_text())['results']:
 attempts=sorted(Path(result['output']).glob('attempt-*'));good=[a for a in attempts if (a/'run-results.json').exists() and not json.loads((a/'run-results.json').read_text())['criticalFailures']];latest=good[-1];log=(latest/'integration-suite.log').read_text();counts=[line for line in log.splitlines() if line.startswith(('ℹ tests','ℹ pass','ℹ fail'))];regressions.append({'suite':result['label'],'attempt':ref(latest),'counts':counts,'exitCode':0})
save(S/'final-regression-readback.json',{'realLatestPassedRuns':regressions,'kind':'SERIAL_SUITE_SEPARATE_OWNED_DB','extraPhysicalRestore':ref(P/'execution/RP19/RP19-T02/runs'/S.name/'acceptance.json'),'extraCalculator':ref(P/'execution/RP19/RP19-T03/runs'/S.name/'acceptance.json'),'limits':['9thcalculator/currentruntime5 rerun afterfinalapproval-alias/scoping refinement; allbackend/frontend/prisma appcode unchanged since13group regression.','Earlier native failedattempts retained. Latest summary pointer is not a failed-log overwrite.']})
save(S/'final-source-and-freeze.json',{'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'protectedFiles':len(baseline['protected']),'protectedDrift':frozen_drift,'startExistingSourceFiles':len(baseline['sourceFiles']),'changedExistingFiles':len(delta),'unownedChanges':unknown,'sourceBindings':all_source,'gitStatus':subprocess.check_output(['git','status','--short'],text=True),'checks':{'gitDiffCheck':subprocess.run(['git','diff','--check']).returncode},'noCommitsOrDeployments':True})
count=state['counts'];summary=f'''# Continuous remediation final delivery

Date: {now}. HEAD unchanged {baseline['head']}. Approval 郭仁康 / 研发副总监; exact delegated local contracts recorded before implementation. No target/production/sharedDB/realdata restore, dependencyinstall, git stage/commit/push/merge/deploy or subagents.

## Current plan

54 tasks:48 COMPLETE,1 IN_PROGRESS,5 NOT_STARTED. Validation34 PASS,12 ENV_BLOCKED,8 NOT_RUN. 306 rows:223 PASS,43 ENV_BLOCKED,40 NOT_RUN. Local implementation delivery is separate from target/joint/release acceptance. All release NOT_EVALUATED.32 confirmedSUPPORTED(16P1/16P2)+1PENDING candidate; programme NOT_CLOSED.

This session starts from24 COMPLETE and delivers24 additional standardtask implementations; this continuation finishes9 tasks:RP13-T03,RP17-T02/T03,RP18-T01/T02/T03,RP19-T02/T03/T04. Target-environment verification tasks deliver qualified harness/evidence and remainENV_BLOCKED where targetfacts absent.

## Main delivered boundaries

Commit-visible immutable sevenproducer syncjournal+revision-protected IDB replay; immutable locked backup pairs and targetFS harness; shared compiled config/candidate fullbuild; leased stateful deploycontrol with defaultfirstsafe maintenance; actualowned compiled candidate daemon/JWT/readiness and /var alias CLI execution fix; actualpaired pg_dump/pg_restore/file references/currentauthfloor/newE and oldbinding refusal; exact scoped read-only releasegate calculator; final fullprogramme account.

## Validation

13 serial final groups including8 backendintegration suites + unit/contract93, commitjournal9, restoreepoch10, backuppair7, actualcandidate5. New physicalrestore5 and calculator9 passed. Every ownedDB separatelynew; no skipped/mock target acceptance. B17 required compiled imports+real forcedseedpassword flow; originalDTO/permission/assertions retained. Nativefailures preserved. RealChrome IDB earlier session evidence remains per-task; fullquota/deployedUI/target still open.

Candidate final29 owner tasks /70 changedartifact files, no unowned/drifting sourcefile. Scoped calculation completed; {len(readiness['blockers'])} unsatisfied evidence/target requirements (not {len(readiness['blockers'])} newbugs), grouped in release-readiness.json. Stagedartifact testcleanup deliberately removed, so no current live release candidate can be armed. No global waitfor20packages; no self-approved externalfacts.

## Remaining

4 material-dependent STANDARD:RP10-T01 needs supporteddeployedclient/revision/legacyqueue matrix; RP15-T01 needs data-owner-approved minimizedread-only historicalsnapshot/anomalyinventory, RP15-T02/T03 depend on its actual mapping.2 inactive OPTIONAL:RP01-T03 customrolebinding,RP05-T03 generalDAG extension. Existing localrepairauthorization remains valid; repeatedapproval is unnecessary, actualmaterial is still needed.

Target Linux/filesystem/writer/snapshot/RPO_RTO, actualsystemd/proxy/versions, browserquota/clientcatalog, storage/offline/locklag/budget, observation/stopcriteria, qualifiedtargetrelease/runbook and fullverifiedrestorepoint remain unproved. See RP19-T04 evidence/remaining-work.md.

## Review order

1.READY_FOR_REVIEW.json → this SESSION_SUMMARY.md → handoff.md.
2.RP19-T04 programme-reconciliation.json/.csv and remaining-work.md.
3.candidate-final/candidate.json and release-readiness.json.
4.current9 deliveredtask authorization → changes/source-diff → native latestlogs → acceptance/rollback.
5.final-regression-readback.json,final-source-and-freeze.json,cleanup-final.json.
6.payload-manifest.json → final-integrity.json → post-seal-readback.json.

No further independent activated code task ready; no programme/finding/target/release closure asserted. Append a new uniquely owned continuation after receiving externalmaterials; do not edit sealedrun evidence.
'''
(S/'SESSION_SUMMARY.md').write_text(summary)
(S/'handoff.md').write_text('# Exact continuation\n\n'+summary.split('## Review order')[1]+'\n\nNo running runner/owneddaemon remains. Read newest rootstate+thisfinalaccount beforeacting; preserveallsealed/history/audit artifacts. Localauthorization persists. TaskAPI/schemaactualdiffs retained per-task beforebytes. Next material-drivenRP10T01 orRP15; do not activateoptionalextensions or performproductionchange.\n')
(R/'evidence/session-summary.md').write_text(summary)
save(S/'session-final-state.json',{'status':'CURRENT_INDEPENDENT_LOCAL_SCOPE_DELIVERED_EXTERNAL_INPUT_PENDING','counts':count,'cases':reconciliation['306CaseResults'],'release':'NOT_EVALUATED','programme':'NOT_CLOSED','nextReadyTask':None,'standardRemaining':[r['taskId'] for r in reconciliation['remainingTasks'] if not r['optional']],'optionalInactive':[r['taskId'] for r in reconciliation['remainingTasks'] if r['optional']],'candidateBlockerGroups':blockgroups,'writerStopped':'READY issued only after seal'})
# Root latest metadata mirrored explicitly without altering old planning checkpoints.
for path in [P/'IMPLEMENTATION_STATE.json',P/'execution/state.json']:
 d=json.loads(path.read_text());d['activeTask']=None;d['nextReadyTask']=None;d['nextReadyBusinessTask']=None;d['localWorkBoundary']='CURRENT_INDEPENDENT_AUTHORIZED_STANDARD_SCOPE_DELIVERED';d['remainingMaterialRef']=ref(R/'evidence/remaining-work.json');save(path,d)
for path in [P/'HANDOFF.md',P/'execution/handoff.md']:
 with path.open('a') as f:f.write('\n\n## '+now+' Continuous local delivery final checkpoint\n\n48/54 implementations COMPLETE;34 localPASS/12ENV_BLOCKED/8NOT_RUN;306cases223PASS/43ENV_BLOCKED/40NOT_RUN.4externalmaterialdependentSTANDARD+2inactiveOPTIONAL remain. AllreleaseNOT_EVALUATED/programmeNOT_CLOSED. Authoritative review '+ref(S/'SESSION_SUMMARY.md')+'; exactremainingmaterials '+ref(R/'evidence/remaining-work.md')+'. Localauthorization persists, no repeatedapproval required. No nextindependentbusiness task; no commits/deployments/realdata access.\n')
print('freeze',len(baseline['protected']),'zero drift; allowed existingdelta',len(delta),'regression groups',len(regressions))
