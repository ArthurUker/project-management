from pathlib import Path
import json,csv,hashlib,collections,datetime,subprocess
R=Path.cwd();P=R/'docs/remediation/2026-10-01-rdpms';S=Path(__file__).resolve().parent;NOW=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
B=P/'execution/RP02/RP02-T02/runs'/S.name;F=P/'execution/RP03/RP03-T01/runs'/S.name;J=B/'joint-validation';J.mkdir(exist_ok=False);(J/'evidence').mkdir()
def ref(p):return str(p.relative_to(R))
def pref(p):return str(p.relative_to(P))
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def hashfile(p):return hashlib.sha256(p.read_bytes()).hexdigest()
proof=json.loads((S/'evidence/final-validation-index.json').read_text());assert all(x['exit']==0 for x in proof['ownedRuns']);assert json.loads((F/'evidence/browser/attempt-07/run-results.json').read_text())['criticalFailures']==[]
save(J/'authorization.json',{'taskId':'RP02-T02','kind':'VALIDATION_ADDENDUM_ONLY','approvedDecisionRef':ref(S/'approval.json'),'frontendDependency':'RP03-T01','noNewBusinessImplementation':True})
passing={'PAC-RP02-04':'Actual JWT exp/expiresIn backend verified and same-origin real Chrome winner/loser preserves successor', 'PAC-RP02-05':'Single-use family loser retains winner; DB insert/audit failures roll back; real committed response loss does not clear newer identities and explicit password recovery works', 'TASK-RP02-T02':'RP03-T01 acceptance dependency implemented and real scoped joint auth evidence passed; full PC01/target/release not evaluated'}
accept={'taskId':'RP02-T02','kind':'APPENDED_JOINT_VALIDATION','cases':[{'caseId':cid,'result':'PASS','scope':scope,'evidence':ref(F/'evidence/frontend-and-browser-bindings.json')} for cid,scope in passing.items()], 'localValidation':'PASS','validation':'PASS','targetValidation':'NOT_RUN','independentReview':'PENDING','release':'NOT_EVALUATED','originalTaskStateRef':pref(B/'task-state.json'),'scope':'Only approved current repo auth lineage and frontend acceptance dependency; not wider PC01/RP11/RP18/access JWT invalidation or deployed client matrix.'}
save(J/'acceptance.json',accept);save(J/'evidence/validation-summary.json',{'backendEvidence':pref(B/'evidence/validation-summary.json'),'frontendEvidence':pref(F/'evidence/validation-summary.json'),'finalIndex':ref(S/'evidence/final-validation-index.json'),'hashes':{ref(F/'evidence/frontend-and-browser-bindings.json'):hashfile(F/'evidence/frontend-and-browser-bindings.json'),ref(S/'evidence/final-validation-index.json'):hashfile(S/'evidence/final-validation-index.json')}})
save(J/'task-state.json',{'taskId':'RP02-T02','implementation':'COMPLETE','validation':'PASS','targetValidation':'NOT_RUN','release':'NOT_EVALUATED','independentReview':'PENDING','evidence':[pref(J/'acceptance.json')],'updatedAt':NOW})
(J/'change-summary.md').write_text('# Backend joint validation addendum\n\nNo further backend code changes. Frontend RP03-T01 acceptance dependency now passes current-candidate real two-tab Chrome/JWT/HTTP/PostgreSQL cases. Original backend delivery/task-state/history hash remains unchanged. Backend implementation + local scoped validation COMPLETE/PASS; target and wider contract open.\n')
(J/'rollback.md').write_text('# Rollback\n\nThis is evidence-only addendum, not schema or business change. Preserve original delivery and append corrections if later evidence contradicts it. Backend code rollback boundary remains original rollback.md; never resurrect consumed tokens or delete audit.\n')
(J/'handoff.md').write_text('# Joint validation handoff\n\nRead acceptance.json and evidence/validation-summary.json, then frontend source hashes and real browser bindings. Current local two-task scope passed; full PC01, legacy/target browsers, IDB/outbox, independent review and release are open.\n')
rows=list(csv.DictReader((P/'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')));columns=list(rows[0])
for row in rows:
 if row['case_id'] in passing:row.update(result='PASS',evidence_ref=pref(J/'acceptance.json'),evidence_level='CURRENT_LOCAL_OWNED_RUNTIME',target_baseline=pref(F/'evidence/source-hashes.json'),owner='Codex single executor')
with (P/'ACCEPTANCE_MATRIX.csv').open('w',encoding='utf-8-sig',newline='') as out:w=csv.DictWriter(out,fieldnames=columns);w.writeheader();w.writerows(rows)
for name in ['IMPLEMENTATION_STATE.json','execution/state.json']:
 path=P/name;d=json.loads(path.read_text());d['tasks']['RP02-T02'].update(validation='PASS',latestValidationAddendum=pref(J),updatedAt=NOW);d['tasks']['RP02-T02']['evidence'].append(pref(J/'acceptance.json'));d.setdefault('decisions',{})['T-RP-09']='APPROVED';d.setdefault('decisionScopeEvidence',{})['T-RP-09']={'approvedScope':['RP02-T02','RP03-T01'],'evidenceRef':ref(S/'approval.json')}
 d['authorizedTaskIds']=list(dict.fromkeys(d.get('authorizedTaskIds',[])+['RP02-T02','RP03-T01']));d['executionAuthorized']=True;d['activeTask']=None;d['activePackage']=None;d['nextReadyTask']=None;d['latestRun']=ref(S);d['updatedAt']=NOW;d['nextReadyReason']='Two scoped T-RP-09 auth tasks locally delivered; remaining32 implementation tasks need precise decision scope/materials/dependencies or final closure conditions. Approval does not cover undefined policies.';d.setdefault('packages',{}).setdefault('RP02',{})['completedEvidence'].append(pref(J/'task-state.json'));d['counts']={'tasks':54,'implementation':dict(collections.Counter(x['implementation'] for x in d['tasks'].values())),'validation':dict(collections.Counter(x['validation'] for x in d['tasks'].values())),'incompleteImplementation':32,'release':'NOT_EVALUATED for all tasks','note':'22 local implementations complete; validation/target/release separate;2 inactive optional tasks not activated.'}
 if 'all54Summary' in d:d['all54Summary']=d['counts']
 save(path,d)
g=json.loads((P/'TASK_GRAPH.json').read_text());next(t for t in g['tasks'] if t['id']=='RP02-T02').update(validation='PASS',validationStatus='PASS',latestValidationAddendum=pref(J));save(P/'TASK_GRAPH.json',g)
packs=json.loads((P/'PACKAGES.json').read_text());pack=next(p for p in packs['packages'] if p['id']=='RP02');pack['executionTaskStatus']['RP02-T02'].update(validation='PASS',evidence=pref(J/'acceptance.json'));save(P/'PACKAGES.json',packs)
o=json.loads((P/'OPEN_ITEM_GATES.json').read_text());item=next(i for i in o['items'] if i['id']=='S02-OPEN-05');item['validation']='PASS';item['executionResolution']={'status':'SATISFIED_CURRENT_REPO_LOCAL','scope':'Current candidate shared-origin real Chrome tabs, late old failed refresh after successor write and usable protected successor','evidenceRef':pref(F/'acceptance.json'),'sourceHashesRef':pref(F/'evidence/source-hashes.json'),'updatedAt':NOW,'historicalAuditStatusUnchanged':True,'release':'NOT_EVALUATED'};save(P/'OPEN_ITEM_GATES.json',o)
for filename in ['all54-task-status.csv','remaining-task-gates.csv']:
 path=P/'execution'/filename;rs=list(csv.DictReader(path.open()));cols=list(rs[0])
 for row in rs:
  if row['taskId']=='RP02-T02':row.update(validation='PASS',readinessAndNextCondition='Current local scoped joint validation passed; target/release wider contracts open')
 with path.open('w',newline='') as out:w=csv.DictWriter(out,fieldnames=cols);w.writeheader();w.writerows(rs)
state=json.loads((P/'IMPLEMENTATION_STATE.json').read_text());decisions={x['id']:x for x in json.loads((P/'DECISION_REGISTER.json').read_text())['decisions']};readiness=[]
for t in g['tasks']:
 st=state['tasks'][t['id']];deps=[v for v in t['implementationDependencies'] if state['tasks'][v]['implementation']!='COMPLETE'];gates=[]
 for gate in t['gateRequirements']:
  if gate['before']!='IMPLEMENTATION':continue
  decision=decisions.get(gate['ref']);satisfied=decision and decision['status']=='APPROVED' and (not decision.get('approvedScope') or t['id'] in decision['approvedScope'])
  gates.append({**gate,'status':'SATISFIED_SCOPED' if satisfied else 'NEEDS_EXACT_SCOPE_OR_MATERIAL','scopeNote':'Evaluate condition only in listed sub-scope; never globalize conditional gates'})
 if st['implementation']=='COMPLETE':kind='IMPLEMENTED_LOCAL'
 elif not t['requiredForPackageCompletion']:kind='OPTIONAL_NOT_ACTIVATED'
 elif t['id']=='RP15-T01':kind='NEEDS_OWNER_READ_ONLY_DATA'
 elif t['id']=='RP19-T04':kind='FINAL_RECONCILIATION_PENDING_PLAN_ACCEPTANCE'
 elif deps:kind='IMPLEMENTATION_DEPENDENCY_PENDING'
 elif any(x['status']!='SATISFIED_SCOPED' for x in gates):kind='APPLICABLE_SCOPE_DECISION_PENDING'
 else:kind='READY_STANDARD'
 readiness.append({'taskId':t['id'],'title':t['title'],'implementation':st['implementation'],'validation':st['validation'],'activation':t['activation'],'required':t['requiredForPackageCompletion'],'unmetImplementationDependencies':deps,'implementationGates':gates,'acceptanceDependencies_validationOnly':t['acceptanceDependencies'],'laterGates':[x for x in t['gateRequirements'] if x['before']!='IMPLEMENTATION'],'readiness':kind})
assert not [x for x in readiness if x['readiness']=='READY_STANDARD']
rd={'capturedAt':NOW,'authority':'TASK_GRAPH implementationDependencies, condition-specific gates and exact DECISION_REGISTER approvedScope; acceptanceDependencies only constrain validation','tasks':readiness,'admittedTaskIds':[],'nextReadyTask':None,'blockerCounts':dict(collections.Counter(x['readiness'] for x in readiness if x['implementation']!='COMPLETE'))}
save(S/'task-readiness.json',rd)
with (S/'task-readiness.csv').open('w',newline='') as out:
 cols=['taskId','title','implementation','validation','readiness','unmetImplementationDependencies','implementationGates','acceptanceDependencies_validationOnly','laterGates'];w=csv.DictWriter(out,fieldnames=cols);w.writeheader();w.writerows({k:json.dumps(x[k],ensure_ascii=False) if isinstance(x[k],(list,dict)) else x[k] for k in cols} for x in readiness)
# The task rows, definitions, dependency/activation/gate metadata and all18 other unapproved decisions stay byte-semantically intact.
old=json.loads((S/'before/records/DECISION_REGISTER.json').read_text())
for decision in old['decisions']:
 if decision['id']!='T-RP-09':assert decision==decisions[decision['id']]
oldg=json.loads((S/'before/records/TASK_GRAPH.json').read_text())
for t in oldg['tasks']:
 now=next(x for x in g['tasks'] if x['id']==t['id'])
 for k in ['implementationDependencies','acceptanceDependencies','gateRequirements','activation','requiredForPackageCompletion','acceptanceCaseIds']:assert t[k]==now[k],(t['id'],k)
oldrows=list(csv.DictReader((S/'before/records/ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')))
mutable={'result','evidence_ref','owner','target_baseline','evidence_level'}
for a,b in zip(oldrows,rows):
 for k in columns:
  if k not in mutable:assert a[k]==b[k],(a['case_id'],k)
message='\n\n## '+NOW+' T-RP-09 scoped auth joint closeout\n\nRP02-T02 and RP03-T01 implementation COMPLETE / current local validation PASS. Backend refresh11/11, old login12/12, frontend controlled unit20/20, genuine same-origin Chrome/JWT/HTTP/Postgres9/9; backend unit/contract93/93 and8 integration regressions68/68 passed. Unknown committed refresh response loss forces explicit relogin and preserves last-copy marker. All accepted owned resources cleared. Original failures retained. T-RP-09 approved only for these2 tasks; broader PC01/IDB/legacy/target/release not accepted. 54 tasks:22 COMPLETE /2 IN_PROGRESS /30 NOT_STARTED; validation14 PASS /33 NOT_RUN /7 ENV_BLOCKED. 306 rows:84 PASS /197 NOT_RUN /25 ENV_BLOCKED. Remaining32 implementation (30 required+2 optional inactive); no admitted ready task. Independent review PENDING; release NOT_EVALUATED. Resume: '+ref(S/'handoff.md')+'.\n'
for path in [P/'HANDOFF.md',P/'execution/handoff.md']:
 with path.open('a') as out:out.write(message)
for filename,key,idfield in [('REVISION_HISTORY.json','versions','version'),('EXECUTION_REVISION_HISTORY.json','entries','id')]:
 path=P/filename;d=json.loads(path.read_text());previous=json.loads((S/'before/records'/filename).read_text());assert d[key][:len(previous[key])]==previous[key];ident=S.name+'-joint-closeout';assert not any(x.get(idfield)==ident for x in d[key]);d[key].append({idfield:ident,'date':NOW,'kind':'CURRENT_LOCAL_AUTH_JOINT_VALIDATION_ADDENDUM','tasks':['RP02-T02','RP03-T01'],'approvalRef':ref(S/'approval.json'),'jointTaskStateRef':{'pathBase':'REPOSITORY','path':ref(J/'task-state.json'),'sha256':hashfile(J/'task-state.json')},'frontendBindingRef':{'pathBase':'REPOSITORY','path':ref(F/'evidence/frontend-and-browser-bindings.json'),'sha256':hashfile(F/'evidence/frontend-and-browser-bindings.json')},'release':'NOT_EVALUATED','independentReview':'PENDING'});save(path,d)
print('Reconciled',state['counts'],dict(collections.Counter(row['result'] for row in rows)),rd['blockerCounts'])
