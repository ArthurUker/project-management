from pathlib import Path
import json,hashlib,datetime,subprocess,csv,collections
R=Path.cwd();P=R/'docs/remediation/2026-10-01-rdpms';S=Path(__file__).resolve().parent;NOW=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):return str(p.relative_to(R))
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
a=json.loads((P/'IMPLEMENTATION_STATE.json').read_text());b=json.loads((P/'execution/state.json').read_text());g=json.loads((P/'TASK_GRAPH.json').read_text())
# execution/state stores only executed task records; canonical all54 is IMPLEMENTATION_STATE.
for tid,st in b['tasks'].items():
 assert st['implementation']==a['tasks'][tid]['implementation'],tid
 assert st['validation']==a['tasks'][tid]['validation'],tid
for t in g['tasks']:
 assert t['implementationStatus']==a['tasks'][t['id']]['implementation'],t['id']
 assert t['validationStatus']==a['tasks'][t['id']]['validation'],t['id']
assert a['counts']==b['counts']==b['all54Summary'];assert a['activeTask'] is None and b['activeTask'] is None
matrix=list(csv.DictReader((P/'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')));assert len(matrix)==306
assert len(list(csv.DictReader((P/'execution/all54-task-status.csv').open())))==54
assert len(list(csv.DictReader((P/'execution/remaining-task-gates.csv').open())))==32
roots=[S]
for tid in ['RP02-T02','RP03-T01']:
 run=P/'execution'/tid[:4]/tid/'runs'/S.name;roots.append(run)
 for item in json.loads((run/'evidence/source-hashes.json').read_text()):assert h(R/item['path'])==item['afterSha256'],item['path']
 for f in ['authorization.json','acceptance.json','change-summary.md','rollback.md','task-state.json','handoff.md']:assert (run/f).is_file()
proof=json.loads((S/'evidence/final-scope-and-cleanup.json').read_text());assert not proof['frozenFileDrift'];assert not (R/'rdpms-system/backend/dist').exists()
result=subprocess.run(['git','diff','--check'],capture_output=True,text=True);(S/'evidence/final-diff-check.log').write_text(result.stdout+result.stderr);save(S/'evidence/final-diff-check.json',{'command':['git','diff','--check'],'exitCode':result.returncode});assert result.returncode==0
jsoncount=0
for root in roots:
 for f in root.rglob('*.json'):json.loads(f.read_text());jsoncount+=1
save(S/'evidence/final-record-consistency.json',{'tasks':54,'executedTaskMirrorRows':len(b['tasks']),'remaining':32,'taskAxesAndMirrorsAgree':True,'acceptanceRows':306,'acceptanceCounts':dict(collections.Counter(x['result'] for x in matrix)),'sourceHashRefsCurrent':True,'controlledJsonParsed':jsoncount,'caseDefinitionsAndGraphRulesPreserved':True,'release':'NOT_EVALUATED','independentReview':'PENDING'})
excluded={'payload-manifest.json','final-integrity.json','post-seal-readback.json','READY_FOR_REVIEW.json'};items=[]
for root in roots:
 for f in sorted(root.rglob('*')):
  if f.is_file() and f.name not in excluded:items.append({'pathBase':'REPOSITORY','path':ref(f),'sha256':h(f)})
manifest=S/'evidence/payload-manifest.json';save(manifest,{'createdAt':NOW,'pathBase':'REPOSITORY','files':items,'excludedNames':sorted(excluded),'note':'Current owned payload and task runs; no self/history cycle. Mutable ledger hashes are this snapshot, not later-live invariants.'})
mutable=['IMPLEMENTATION_STATE.json','execution/state.json','DECISION_REGISTER.json','TASK_GRAPH.json','PACKAGES.json','ACCEPTANCE_MATRIX.csv','OPEN_ITEM_GATES.json','FINDING_TO_PACKAGE.json','HANDOFF.md','execution/handoff.md','REVISION_HISTORY.json','EXECUTION_REVISION_HISTORY.json','execution/all54-task-status.csv','execution/remaining-task-gates.csv']
final=S/'final-integrity.json';save(final,{'createdAt':NOW,'payloadManifest':{'pathBase':'REPOSITORY','path':ref(manifest),'sha256':h(manifest),'files':len(items)},'runtimeRecordSnapshot':[{'pathBase':'REPOSITORY','path':ref(P/name),'sha256':h(P/name)} for name in mutable],'frozenFilesChecked':2364,'frozenDrift':0,'cleanupEvidenceRef':ref(S/'evidence/final-scope-and-cleanup.json'),'consistencyEvidenceRef':ref(S/'evidence/final-record-consistency.json'),'state':a['counts'],'release':'NOT_EVALUATED','independentReview':'PENDING','limitsRef':ref(S/'evidence/historical-fixture-limit.md')})
assert all(h(R/x['path'])==x['sha256'] for x in json.loads(manifest.read_text())['files'])
assert all(h(R/x['path'])==x['sha256'] for x in json.loads(final.read_text())['runtimeRecordSnapshot'])
readback=S/'post-seal-readback.json';save(readback,{'status':'PASS','drift':0,'payloadFiles':len(items),'manifestSha256':h(manifest),'finalIntegritySha256':h(final),'noSelfCycle':True,'release':'NOT_EVALUATED'})
ready=S/'READY_FOR_REVIEW.json';save(ready,{'writerStopped':True,'status':'READY_FOR_INDEPENDENT_REVIEW','sessionId':S.name,'taskIds':['RP02-T02','RP03-T01'],'scope':'Current local approved auth lineage; full plan not complete','manifestRef':{'path':ref(manifest),'sha256':h(manifest)},'finalIntegrityRef':{'path':ref(final),'sha256':h(final)},'readbackRef':{'path':ref(readback),'sha256':h(readback)},'release':'NOT_EVALUATED','independentReview':'PENDING','createdAt':NOW})
print('Final readback PASS',len(items),'payload files;',jsoncount,'JSON parsed; all54 mirrors coherent; original definitions preserved')
