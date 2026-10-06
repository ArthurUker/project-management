from pathlib import Path
import json,hashlib,re,difflib,datetime
R=Path.cwd();S=Path(__file__).resolve().parent;P=R/'docs/remediation/2026-10-01-rdpms';T=S/'FOLLOWUP-SYNC-V1-CI';(T/'evidence').mkdir(parents=True,exist_ok=True)
def ref(p):return str(p.relative_to(R))
def save(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
results=[]
for n in ['ci-all-unit-contract','ci-rf04','ci-rf02','ci-rp10']:
 run=sorted((S/'evidence'/n).glob('attempt-*'))[-1];rr=json.loads((run/'run-results.json').read_text());assert not rr['criticalFailures'];log=(run/'integration-suite.log').read_text();counts={k:int(v) for k,v in re.findall(r'(?:# |ℹ )(tests|pass|fail|skipped) (\d+)',log)};assert counts['fail']==0;results.append({'suite':n,'counts':counts,'runRef':ref(run/'run-results.json'),'sha256':hashlib.sha256((run/'run-results.json').read_bytes()).hexdigest(),'cleanup':rr['cleanup']})
files=json.loads((S/'task-scopes.json').read_text())['FOLLOWUP-SYNC-V1-CI']['allowedFiles'];patch=[];hashes=[]
for name in files:
 p=R/name;old=S/'before'/name;before=old.read_text() if old.exists() else '';after=p.read_text();patch+=list(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='before/'+name,tofile='after/'+name));hashes.append({'path':name,'before':hashlib.sha256(old.read_bytes()).hexdigest() if old.exists() else None,'after':hashlib.sha256(p.read_bytes()).hexdigest()})
save(T/'evidence/source-hashes.json',hashes);(T/'evidence/source-diff.patch').write_text(''.join(patch));save(T/'evidence/validation-summary.json',results)
summary='Migrated original RF04 unit/integration, RF02 retry and RP10 sync race fixtures to actual v1 reservations. Original case names and denial/CAS/content/barrier assertions retained; same-key changed-payload now explicit409, refused execution leaves pending reservation. Real DB grant fixtures replace stale middleware grants. Unit-only assertion view exposes reservation-denial stage and actual HTTP status; no 401/426/500 accepted as business denial. No business source changed.'
(T/'change-summary.md').write_text('# Sync v1 CI follow-up\n\n'+summary+'\n')
save(T/'authorization.json',{'ref':ref(S/'authorization.json'),'taskId':'FOLLOWUP-SYNC-V1-CI','kind':'TEST_ONLY','allowedFiles':files})
save(T/'acceptance.json',{'status':'PASS','scope':'Selected previously failing legacy-wire test groups + complete existing backend unit/contract targets','runs':results,'jointClientValidation':'NOT_RUN','target':'NOT_RUN','release':'NOT_EVALUATED','independentReview':'PENDING'})
save(T/'task-state.json',{'taskId':'FOLLOWUP-SYNC-V1-CI','kind':'TEST_ONLY','implementation':'COMPLETE','validation':'PASS','parentTaskIds':['RP09-T01','RP09-T02'],'includedIn54TaskGraph':False,'independentReview':'PENDING','release':'NOT_EVALUATED'})
(T/'rollback.md').write_text('# Test-only rollback\n\nReview task diff and restore only task-owned test/helper bytes after verifying no later changes. No business rollback, DB schema changes or production operations. Preserve failed attempts.\n')
(T/'handoff.md').write_text('# Follow-up complete\n\n'+summary+'\n\nAll accepted owned databases/cluster roots/dist cleaned; failures retained. Next RP01-T02 under current user delegated approval. Existing frozen runs and19fail evidence unchanged.\n')
for name in ['IMPLEMENTATION_STATE.json','execution/state.json']:
 p=P/name;d=json.loads(p.read_text());d.setdefault('authorizationContinuations',[]).append({'id':S.name+'-ci','taskId':'FOLLOWUP-SYNC-V1-CI','stateRef':ref(T/'task-state.json'),'validation':'PASS','release':'NOT_EVALUATED'});d['ciRegression']={'latest':{'result':'PASS','scope':'Existing backend unit/contract + three affected integration groups','evidenceRef':ref(T/'acceptance.json'),'priorFailureEvidencePreserved':True,'frontendTargetReleaseNotRun':True}};d['activeTask']='RP01-T02';save(p,d)
for n in ['HANDOFF.md','execution/handoff.md']:
 with (P/n).open('a') as f:f.write('\n\n## 2026-10-06 Sync v1 CI fixture migration\n\n'+summary+'\n\nEvidence: '+ref(T/'acceptance.json')+'. No54 task count change. Next RP01-T02.\n')
for name,key,idfield in [('REVISION_HISTORY.json','versions','version'),('EXECUTION_REVISION_HISTORY.json','entries','id')]:
 p=P/name;d=json.loads(p.read_text());d[key].append({idfield:S.name+'-ci','date':'2026-10-06','kind':'TEST_ONLY_PROTOCOL_FIXTURE_MIGRATION','acceptanceRef':ref(T/'acceptance.json'),'release':'NOT_EVALUATED'});save(p,d)
scopes=json.loads((S/'task-scopes.json').read_text());scopes['FOLLOWUP-SYNC-V1-CI']['state']='COMPLETE';save(S/'task-scopes.json',scopes)
print([(x['suite'],x['counts']) for x in results])
