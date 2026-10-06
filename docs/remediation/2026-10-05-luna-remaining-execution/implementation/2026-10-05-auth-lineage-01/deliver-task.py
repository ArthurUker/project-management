from pathlib import Path
import json,hashlib,csv,datetime,collections,difflib,sys
ROOT=Path.cwd();P=ROOT/'docs/remediation/2026-10-01-rdpms';S=Path(__file__).resolve().parent
TASK=sys.argv[1];RUN=P/'execution'/TASK[:4]/TASK/'runs'/S.name
CONFIG=json.loads((S/(TASK+'-delivery.json')).read_text());NOW=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def ref(p):return str(p.relative_to(ROOT))
changes=[];patch=[]
for name in CONFIG['files']:
 f=ROOT/name;b=S/'before'/name;old=b.read_text() if b.exists() else '';new=f.read_text();changes.append({'path':name,'beforeSha256':hashlib.sha256(b.read_bytes()).hexdigest() if b.exists() else None,'afterSha256':hashlib.sha256(f.read_bytes()).hexdigest()});patch.extend(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='before/'+name,tofile='after/'+name))
save(RUN/'evidence/source-hashes.json',changes);(RUN/'evidence/source-diff.patch').write_text(''.join(patch))
checks=[]
for runname in CONFIG['runs']:
 attempts=sorted((RUN/'evidence'/runname).glob('attempt-*'));current=attempts[-1];j=json.loads((current/'run-results.json').read_text());assert not j['criticalFailures'],j['criticalFailures'];assert j['cleanup']['ownedTempRootRemoved'] and j['cleanup']['ownedDistRemoved'];checks.append({'path':ref(current/'run-results.json'),'sha256':hashlib.sha256((current/'run-results.json').read_bytes()).hexdigest(),'commandResults':j['commands'],'cleanup':j['cleanup']})
save(RUN/'evidence/validation-summary.json',{'taskId':TASK,'runs':checks,'limits':CONFIG['limits'],'earlierAttempts':'Preserved; only enumerated current attempts support acceptance'})
rows=list(csv.DictReader((P/'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')));fields=list(rows[0]);cases=[]
for cid,scope in CONFIG['casePass'].items():
 r=next(r for r in rows if r['case_id']==cid);cases.append({'caseId':cid,'result':'PASS','scope':scope,'evidence':ref(RUN/'evidence/validation-summary.json')});r['result']='PASS';r['evidence_ref']=str((RUN/'acceptance.json').relative_to(P));r['evidence_level']='CURRENT_LOCAL_OWNED_RUNTIME' if not cid.startswith(('DECISION','GATE-D-')) else 'NAMED_APPROVAL_ARTIFACT';r['target_baseline']='Current dirty-worktree hashes: '+str((RUN/'evidence/source-hashes.json').relative_to(P));r['owner']='Codex single executor';
 if cid.startswith(('DECISION','GATE-D-')):r['evidence_level']='NAMED_APPROVAL_ARTIFACT'
for cid,reason in CONFIG['notRun'].items():cases.append({'caseId':cid,'result':'NOT_RUN','reason':reason})
save(RUN/'acceptance.json',{'taskId':TASK,'approvalRef':ref(S/'approval.json'),'cases':cases,'localValidation':'PASS','jointValidation':CONFIG.get('validation','PASS'),'targetValidation':'NOT_RUN','independentReview':'PENDING','release':'NOT_EVALUATED','limits':CONFIG['limits']})
state={'taskId':TASK,'packageId':TASK[:4],'implementation':'COMPLETE','validation':CONFIG.get('validation','PASS'),'targetValidation':'NOT_RUN','release':'NOT_EVALUATED','independentReview':'PENDING','owner':'Codex single executor','evidence':[str((RUN/'acceptance.json').relative_to(P)),str((RUN/'evidence/validation-summary.json').relative_to(P))],'updatedAt':NOW,'approvedBy':'郭仁康','approvedRole':'研发副总监'};save(RUN/'task-state.json',state)
(RUN/'change-summary.md').write_text('# '+TASK+' local implementation\n\n'+CONFIG['summary']+'\n\nApproved by 郭仁康（研发副总监）; exact contract in session approval.json.\n\nAPI/schema: '+CONFIG['compatibility']+'\n\nChanged files:\n\n'+'\n'.join('- '+x['path'] for x in changes)+'\n\nSource before snapshots and task-specific diff are retained. No commits/deployments.\n')
(RUN/'rollback.md').write_text('# Local rollback boundary\n\nReview evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. No schema changes.\n\n'+CONFIG['rollback']+'\n\nProduction rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.\n')
(RUN/'handoff.md').write_text('# '+TASK+' handoff\n\nImplementation COMPLETE, local scope passed (see task-state for joint validation), independent review PENDING, release NOT_EVALUATED.\n\n'+CONFIG['summary']+'\n\nLimits:\n\n'+'\n'.join('- '+x for x in CONFIG['limits'])+'\n\nCleanup: all accepted runs guarded drop + cluster stop exit 0; owned roots and dist absent. Earlier failed attempt logs retained.\n\nNext: '+CONFIG['next']+'\n')
with (P/'ACCEPTANCE_MATRIX.csv').open('w',encoding='utf-8-sig',newline='') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
for path in [P/'IMPLEMENTATION_STATE.json',P/'execution/state.json']:
 d=json.loads(path.read_text());old=d['tasks'].setdefault(TASK,{});old.update({k:v for k,v in state.items() if k not in ['taskId','packageId']});old['latestRun']=str(RUN.relative_to(P));old['evidence']=list(dict.fromkeys(old.get('evidence',[])+state['evidence']));d['activeTask']=None;d['nextReadyTask']=CONFIG['nextTask'];d['updatedAt']=NOW;counts={'tasks':54,'implementation':dict(collections.Counter(x['implementation'] for x in (d if path.name=='IMPLEMENTATION_STATE.json' else json.loads((P/'IMPLEMENTATION_STATE.json').read_text()))['tasks'].values())),'validation':dict(collections.Counter(x['validation'] for x in (d if path.name=='IMPLEMENTATION_STATE.json' else json.loads((P/'IMPLEMENTATION_STATE.json').read_text()))['tasks'].values())),'release':'NOT_EVALUATED for all tasks'};counts['incompleteImplementation']=54-counts['implementation'].get('COMPLETE',0);counts['note']='Implementation/local/target/release are separate; original planning checkpoints preserved';d['counts']=counts
 if 'all54Summary' in d:d['all54Summary']=counts
 package=d['packages'].setdefault(TASK[:4],{});package=package if isinstance(package,dict) else {'previousMirrorValue':package};d['packages'][TASK[:4]]=package;package.update(status='IN_PROGRESS',validation='NOT_RUN',release='NOT_EVALUATED');package.setdefault('completedEvidence',[]).append(str((RUN/'task-state.json').relative_to(P)));package['statusNote']='All required implementation tasks may be complete locally, but package joint/target/release acceptance remains open.';save(path,d)
g=json.loads((P/'TASK_GRAPH.json').read_text());t=next(t for t in g['tasks'] if t['id']==TASK);t.update(status='COMPLETE',implementationStatus='COMPLETE',validation=CONFIG.get('validation','PASS'),validationStatus=CONFIG.get('validation','PASS'),releaseStatus='NOT_EVALUATED',owner='Codex single executor',latestRun=str(RUN.relative_to(P)));g['executionStatusUpdatedAt']=NOW;save(P/'TASK_GRAPH.json',g)
packs=json.loads((P/'PACKAGES.json').read_text());pack=next(p for p in packs['packages'] if p['id']==TASK[:4]);pack.setdefault('executionTaskStatus',{})[TASK]={'implementation':'COMPLETE','validation':CONFIG.get('validation','PASS'),'release':'NOT_EVALUATED','evidence':str((RUN/'acceptance.json').relative_to(P))};pack['implementationStatus']='IN_PROGRESS';pack['validationStatus']='NOT_RUN';pack['validationStatusNote']='Local subtask accepted; package/joint/target/release evaluation incomplete.';save(P/'PACKAGES.json',packs)
findings=json.loads((P/'FINDING_TO_PACKAGE.json').read_text())
for f in findings['records']:
 if f['id'] in CONFIG['findings']:
  f.update(implementationStatus='COMPLETE',fixStatus='LOCAL_TASK_SCOPED_ACCEPTED_FINDING_WIDER_SCOPE_OPEN',releaseStatus='NOT_EVALUATED',localEvidenceBoundary=CONFIG['summary'],latestExecutionEvidence=str((RUN/'acceptance.json').relative_to(P)))
save(P/'FINDING_TO_PACKAGE.json',findings)
state=json.loads((P/'IMPLEMENTATION_STATE.json').read_text())
for name in ['all54-task-status.csv','remaining-task-gates.csv']:
 f=P/'execution'/name;rs=list(csv.DictReader(f.open()));cols=list(rs[0]);
 for r in rs:
  if r['taskId']==TASK:r.update(implementation='COMPLETE',validation=CONFIG.get('validation','PASS'),readinessAndNextCondition='Local scoped implementation and validation complete; target/release not evaluated')
 if name.startswith('remaining'):rs=[r for r in rs if r['taskId']!=TASK]
 with f.open('w',newline='') as out:w=csv.DictWriter(out,fieldnames=cols);w.writeheader();w.writerows(rs)
message='\n\n## '+NOW+' '+TASK+' — approved local implementation\n\n'+CONFIG['summary']+'\n\nApproval: 郭仁康（研发副总监）, '+ref(S/'approval.json')+'. Task implementation COMPLETE / local evidence PASS; joint validation see task-state; package/target/release not closed. Evidence: '+str(RUN.relative_to(P))+'/acceptance.json. Next: '+CONFIG['next']+'.\n'
for f in [P/'HANDOFF.md',P/'execution/handoff.md']:
 with f.open('a') as out:out.write(message)
for name,key,idfield in [('REVISION_HISTORY.json','versions','version'),('EXECUTION_REVISION_HISTORY.json','entries','id')]:
 f=P/name;d=json.loads(f.read_text());idvalue=S.name+'-'+TASK;assert not any(x.get(idfield)==idvalue for x in d[key]);d[key].append({idfield:idvalue,'date':NOW,'kind':'APPROVED_LOCAL_IMPLEMENTATION','taskId':TASK,'approvedDecisionRef':ref(S/'approval.json'),'taskStateRef':{'pathBase':'REPOSITORY','path':ref(RUN/'task-state.json'),'sha256':hashlib.sha256((RUN/'task-state.json').read_bytes()).hexdigest()},'sourceHashesRef':{'pathBase':'REPOSITORY','path':ref(RUN/'evidence/source-hashes.json'),'sha256':hashlib.sha256((RUN/'evidence/source-hashes.json').read_bytes()).hexdigest()},'release':'NOT_EVALUATED','independentReview':'PENDING'});save(f,d)
print(TASK,'delivered', 'COMPLETE', 'PASS')
