from pathlib import Path
import json,hashlib,datetime,collections
ROOT=Path.cwd();P=ROOT/'docs/remediation/2026-10-01-rdpms';S=Path(__file__).resolve().parent

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def ref(p):return {'pathBase':'REPOSITORY','path':str(p.relative_to(ROOT)),'sha256':sha(p)}
assert not (S/'payload-manifest.json').exists()
base=json.loads((S/'start-baseline.json').read_text());drift=[r['path'] for r in base['protected'] if not (ROOT/r['path']).exists() or sha(ROOT/r['path'])!=r['sha256']];assert not drift
histories={name:json.loads((P/name).read_text()) for name in ['REVISION_HISTORY.json','EXECUTION_REVISION_HISTORY.json']}
for name,key in [('REVISION_HISTORY.json','versions'),('EXECUTION_REVISION_HISTORY.json','entries')]:
 old=json.loads((S/'before/records'/name).read_text())[key];assert histories[name][key][:len(old)]==old
for p in S.rglob('*.json'):json.loads(p.read_text())
exclude={S/'payload-manifest.json',S/'final-integrity.json',S/'post-seal-readback.json',S/'READY_FOR_REVIEW.json'}
selected={p for p in S.rglob('*') if p.is_file() and p not in exclude}
for rp in (P/'execution').glob('RP*'):
 for task in rp.glob('RP*'):
  run=task/'runs'/S.name
  if run.exists():selected.update(p for p in run.rglob('*') if p.is_file())
rootRecords=[P/f for f in ['IMPLEMENTATION_STATE.json','TASK_GRAPH.json','PACKAGES.json','ACCEPTANCE_MATRIX.csv','FINDING_TO_PACKAGE.json','DECISION_REGISTER.json','HANDOFF.md','execution/state.json','execution/handoff.md','execution/all54-task-status.csv','execution/remaining-task-gates.csv']];selected.update(rootRecords)
save(S/'payload-manifest.json',{'pathBase':'REPOSITORY','formatVersion':1,'scope':'Owned continuoussession payload+all canonicalnewruns+latestcontrolledrecords','excludedProtocolFiles':['payload-manifest.json','final-integrity.json','post-seal-readback.json','READY_FOR_REVIEW.json'],'historyFinalHashes':'Bound separately post-seal, not circularly inpayload','files':[ref(p) for p in sorted(selected)]})
manifest=S/'payload-manifest.json';source=json.loads((S/'final-source-and-freeze.json').read_text());save(S/'final-integrity.json',{'sessionId':S.name,'payloadManifest':ref(manifest),'head':source['head'],'protectedFrozenFiles':len(base['protected']),'protectedDrift':drift,'existingSourceDeltasAuthorized':source['changedExistingFiles'],'unownedChanges':source['unownedChanges'],'release':'NOT_EVALUATED','programme':'NOT_CLOSED','metadataSourceProof':ref(S/'final-source-and-freeze.json'),'cleanupProof':ref(S/'cleanup-final.json'),'finalReconciliation':ref(P/'execution/RP19/RP19-T04/runs'/S.name/'evidence/programme-reconciliation.json'),'sealingRule':'Payload→integrity→appendhistory→postreadback→READY; no self/hashcycle'})
for name,key,idfield in [('REVISION_HISTORY.json','versions','version'),('EXECUTION_REVISION_HISTORY.json','entries','id')]:
 d=histories[name];uid=S.name+'-FINAL-SEAL';assert not any(x.get(idfield)==uid for x in d[key]);d[key].append({idfield:uid,'kind':'SCOPED_CONTINUOUS_LOCAL_DELIVERY_SEAL','at':datetime.datetime.now().astimezone().isoformat(),'integrityRef':ref(S/'final-integrity.json'),'summaryRef':ref(S/'SESSION_SUMMARY.md'),'release':'NOT_EVALUATED','independentReview':'PENDING','programme':'NOT_CLOSED','counts':{'implementationComplete':48,'localValidationPASS':34,'envBlocked':12,'notRun':8,'remainingStandard':4,'optionalInactive':2}});save(P/name,d)
drift=[x['path'] for x in json.loads(manifest.read_text())['files'] if sha(ROOT/x['path'])!=x['sha256']];assert not drift
st=json.loads((P/'IMPLEMENTATION_STATE.json').read_text());mi=json.loads((P/'execution/state.json').read_text());assert len(st['tasks'])==len(mi['tasks'])==54
assert all(st['tasks'][k]['implementation']==mi['tasks'][k]['implementation'] and st['tasks'][k]['validation']==mi['tasks'][k]['validation'] for k in st['tasks'])
save(S/'post-seal-readback.json',{'result':'PASS','boundFileCount':len(selected),'payloadDrift':drift,'integrity':ref(S/'final-integrity.json'),'historyRefs':[ref(P/name) for name in histories],'mirror54Agreement':True,'protectedFrozenFiles':len(base['protected']),'protectedDrift':[],'release':'NOT_EVALUATED'})
save(S/'READY_FOR_REVIEW.json',{'sessionId':S.name,'writerStopped':True,'status':'LOCAL_AUTHORIZED_INDEPENDENT_SCOPE_DELIVERED_EXTERNAL_INPUT_PENDING','independentReview':'PENDING','release':'NOT_EVALUATED','programme':'NOT_CLOSED','taskCount':54,'implementation':{'COMPLETE':48,'IN_PROGRESS':1,'NOT_STARTED':5},'validation':{'PASS':34,'ENV_BLOCKED':12,'NOT_RUN':8},'cases306':{'PASS':223,'ENV_BLOCKED':43,'NOT_RUN':40},'remainingStandardTaskIds':['RP10-T01','RP15-T01','RP15-T02','RP15-T03'],'optionalInactiveTaskIds':['RP01-T03','RP05-T03'],'readOrder':['SESSION_SUMMARY.md','handoff.md','candidate-final/release-readiness.json','RP19-T04 programme-reconciliation andremaining-work','final-regression-readback.json','final-source-and-freeze.json','payload-manifest.json','final-integrity.json','post-seal-readback.json'],'integrityRef':ref(S/'final-integrity.json'),'readbackRef':ref(S/'post-seal-readback.json')})
# Read after final write; then cease all editing.
ready=json.loads((S/'READY_FOR_REVIEW.json').read_text());assert ready['writerStopped'];assert ready['integrityRef']['sha256']==sha(S/'final-integrity.json');assert ready['readbackRef']['sha256']==sha(S/'post-seal-readback.json')
print('SEALED',len(selected),'payloadfiles;zero drift; READY sha256',sha(S/'READY_FOR_REVIEW.json'))
