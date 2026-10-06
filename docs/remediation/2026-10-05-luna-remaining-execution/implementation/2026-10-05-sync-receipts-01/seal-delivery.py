import pathlib,json,hashlib,datetime,subprocess
R=pathlib.Path.cwd();S=R/'docs/remediation/2026-10-05-luna-remaining-execution/implementation/2026-10-05-sync-receipts-01';P=R/'docs/remediation/2026-10-01-rdpms'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.relative_to(R))
def ref(p):return {'path':rel(p),'sha256':sha(p)}
def read(p):return json.loads(p.read_text())
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
sealpaths=[S/'evidence/payload-manifest.json',S/'final-integrity.json',S/'post-seal-readback.json',S/'READY_FOR_REVIEW.json']
assert not any(p.exists() for p in sealpaths),'Already sealed; never overwrite.'
runroots=[P/f'execution/RP09/{tid}/runs/{S.name}' for tid in ['RP09-T01','RP09-T02']]
paths=sorted({p for root in [S]+runroots for p in root.rglob('*') if p.is_file() and p not in sealpaths},key=rel)
assert not any(p.is_symlink() for p in paths),'No symlink evidence'
manifest={'pathBase':'REPOSITORY','scope':[rel(root) for root in [S]+runroots],'exclusions':[rel(p) for p in sealpaths],'files':[ref(p) for p in paths],'count':len(paths),'meaning':'Immutable delivery payload including final source snapshots; live runtime records bound separately; no self/hash cycles'}
write(sealpaths[0],manifest)
b=read(S/'start-baseline.json');statepaths=[R/v['path'] for v in b['rootBefore']]+[P/n for n in ['PACKAGES.json','OPEN_ITEM_GATES.json','execution/all54-task-status.csv','execution/remaining-task-gates.csv']]
statepaths=sorted(set(statepaths),key=rel)
final={'sealedAt':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'payloadManifest':ref(sealpaths[0]),'payloadCount':len(paths),'runtimeRecordSnapshot':[ref(p) for p in statepaths],'sourceBindings':read(S/'evidence/final-source-hashes.json'),'consistencyEvidence':ref(S/'evidence/final-consistency-check.json'),'validationIndex':ref(S/'evidence/final-validation-index.json'),'counts':read(S/'evidence/current-counts.json'),'ciRegression':'FAIL','independentReview':'PENDING','release':'NOT_EVALUATED','hashBoundary':'This file not in payload; READY binds this file; readback not in immutable payload. Live plan record hashes describe seal checkpoint, not perpetual freeze.'}
write(sealpaths[1],final)
drift=[]
for row in manifest['files']+final['runtimeRecordSnapshot']:
 p=R/row['path']
 if not p.is_file() or sha(p)!=row['sha256']:drift.append(row['path'])
for row in b['protected']:
 p=R/row['path']
 if not p.is_file() or sha(p)!=row['sha256']:drift.append(row['path'])
for row in final['sourceBindings']:
 p=R/row['path'];snapshot=S/'evidence/final-source'/row['path']
 if sha(p)!=row['finalSha256'] or sha(snapshot)!=row['finalSha256']:drift.append(row['path'])
invalid=[]
for p in paths:
 if p.suffix=='.json':
  try:read(p)
  except Exception as e:invalid.append({'path':rel(p),'error':str(e)})
assert not drift and not invalid
readback={'result':'PASS','payloadManifest':ref(sealpaths[0]),'finalIntegrity':ref(sealpaths[1]),'checkedPayloadFiles':len(paths),'checkedRuntimeRecordFiles':len(statepaths),'frozenFilesChecked':len(b['protected']),'finalSourceSnapshotPairsChecked':6,'drift':drift,'invalidJSON':invalid,'meaning':'Post-seal byte/hash and JSON consistency only; CI FAIL unchanged','independentReview':'PENDING','release':'NOT_EVALUATED'}
write(sealpaths[2],readback)
ready={'sessionId':S.name,'status':'READY_FOR_INDEPENDENT_REVIEW','writerStopped':True,'taskIds':['RP09-T01','RP09-T02'],'implementation':'COMPLETE','validationScope':'APPROVED_LOCAL_V1_BACKEND_ONLY','localValidation':'PASS','ciRegression':'FAIL','jointValidation':'NOT_RUN','targetValidation':'NOT_RUN','independentReview':'PENDING','release':'NOT_EVALUATED','manifest':ref(sealpaths[0]),'finalIntegrity':ref(sealpaths[1]),'postSealReadback':ref(sealpaths[2]),'reviewEntry':ref(S/'REVIEW_ENTRY.md'),'handoff':ref(S/'handoff.md'),'nextReadyBusinessTask':None}
write(sealpaths[3],ready)
assert all(sha(R/v['path'])==v['sha256'] for v in manifest['files'])
assert all(sha(R/v['path'])==v['sha256'] for v in final['runtimeRecordSnapshot'])
assert all(sha(R/ready[k]['path'])==ready[k]['sha256'] for k in ['manifest','finalIntegrity','postSealReadback','reviewEntry','handoff'])
print(json.dumps({'result':'PASS','payloadFiles':len(paths),'frozenFiles':len(b['protected']),'drift':0,'ready':ref(sealpaths[3]),'ciRegression':'FAIL'},ensure_ascii=False))
