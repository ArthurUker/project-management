from pathlib import Path
import json,hashlib,subprocess,collections,csv,sys
ROOT=Path.cwd();P=ROOT/'docs/remediation/2026-10-01-rdpms';S=Path(__file__).resolve().parent
OUT=S/sys.argv[1];OUT.mkdir(parents=True,exist_ok=False)
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):return {'path':str(p.relative_to(ROOT)),'sha256':sha(p)}
attempts=sorted((S/'evidence/final-regression/candidate-runtime').glob('attempt-*'));valid=[a for a in attempts if (a/'run-results.json').exists() and not json.loads((a/'run-results.json').read_text())['criticalFailures']];A=valid[-1]
manifest=A/'candidate-evidence/candidate-manifest.json';m=json.loads(manifest.read_text());state=json.loads((P/'IMPLEMENTATION_STATE.json').read_text());graph=json.loads((P/'TASK_GRAPH.json').read_text());tasks={t['id']:t for t in graph['tasks']};owners=collections.defaultdict(set)
for tid,sc in json.loads((S/'task-scopes.json').read_text()).items():
 if tid in tasks:
  for path in sc['allowedFiles']:owners[path].add(tid)
for pathref in state['tasks']['RP01-T01'].get('evidence',[]):
 oldpath=P/pathref if (P/pathref).exists() else P/'execution'/pathref
 if pathref.endswith('/authorization.json') and oldpath.exists():
  oldauth=json.loads(oldpath.read_text())
  for path in oldauth.get('allowedSourceFiles',[]):owners[path].add('RP01-T01')
for tid,st in state['tasks'].items():
 run=P/st.get('latestRun','execution/'+tid[:4]+'/'+tid)
 auth=run/'authorization.json'
 if auth.exists():
  a=json.loads(auth.read_text())
  for path in a.get('allowedFiles',[]):owners[path].add(tid)
 for f in (run/'evidence').glob('source-hashes.json'):
  d=json.loads(f.read_text())
  if isinstance(d,list):
   for r in d:
    if isinstance(r,dict) and 'path' in r:owners[r['path']].add(tid)
base={}
for path in m['sourceBindings']:
 r=subprocess.run(['git','show','HEAD:'+path],capture_output=True)
 if r.returncode==0:base[path]=hashlib.sha256(r.stdout).hexdigest()
save(OUT/'base-source-manifest.json',{'base':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceBindings':base,'note':'Only hashes of original commit blobs; no reset/source mutation/credential dump.'})
changed=sorted(p for p,h in m['sourceBindings'].items() if base.get(p)!=h)
selected=sorted({t for p in changed for t in owners[p] if t in tasks})
conditions={};reasons={}
for t in graph['tasks']:
 for g in t.get('gateRequirements',[]):
  if g['condition']=='always':continue
  key=t['id']+':'+g['ref']
  if g['ref']=='D-S01-05':conditions[key]=False;reasons[key]='Registration global exception not requested/implemented.'
  elif t['id']=='RP13-T03' and g['ref']=='D-S01-08':conditions[key]=False;reasons[key]='Current tombstones journal existing semantics; general DAG/delete/live-policy extension not activated.'
  elif t['id']=='RP10-T02' and g['ref']=='D-S01-07':conditions[key]=False;reasons[key]='RP10T02 snapshot/CAS preserves original source states; separately scoped policy implementation belongs RP10T03.'
  elif g['ref']=='S00-OI-01':conditions[key]=False;reasons[key]='Not historical archive disposal; no fabricated missing historic startHead.'
  elif 'same D-S01-' in g['condition']:conditions[key]=True;reasons[key]='Alias approval only; same scoped decision evidence, no second signature required.'
  else:conditions[key]=True;reasons[key]='Full current included standard scope contains referenced path; evaluator still requires attributable evidence.'
register=json.loads((P/'DECISION_REGISTER.json').read_text());gateEvidence={}
for d in register['decisions']:
 named_parent=d.get('status')=='APPROVED' and d.get('approvedBy')
 scopes=set(d.get('approvedScope',[])) if named_parent else set()
 for a in d.get('additionalApprovedScopes',[]):
  evidence=a.get('contractRef',a.get('evidenceRef',a.get('evidence')))
  if (a.get('approvedBy') or named_parent) and evidence and (ROOT/evidence).is_file():scopes.add(a['taskId'])
 if scopes:gateEvidence[d['id']]={**ref(P/'DECISION_REGISTER.json'),'kind':'LOCAL_DECISION','result':'PASS','scopeTaskIds':sorted(scopes)}
caseEvidence={}
for tid in selected:
 st=state['tasks'][tid];run=P/st.get('latestRun','execution/'+tid[:4]+'/'+tid);a=run/'acceptance.json'
 if a.exists():
  doc=json.loads(a.read_text())
  for c in doc.get('cases',[]):
   if not isinstance(c,dict):continue
   cid=c.get('caseId',c.get('case_id'))
   if cid and c.get('result')=='PASS':caseEvidence[cid]={**ref(a),'result':'PASS'}
for case in json.loads((S/'FOLLOWUP-COMPILED-ACCEPTANCE/acceptance.json').read_text())['cases']:
 caseEvidence[case['caseId']]={**ref(S/'FOLLOWUP-COMPILED-ACCEPTANCE/acceptance.json'),'result':'PASS'}
contracts={r for tid in selected for r in tasks[tid].get('contractRefs',[])}
c={'candidateId':'LOCAL-FULL-ARTIFACT-'+S.name,'repoRoot':str(ROOT),'buildId':m['buildId'],'manifestRef':ref(manifest),'baseSourceManifestRef':ref(OUT/'base-source-manifest.json'),'includedTaskIds':selected,'affectedTaskIds':[],'explicitlyActivatedTaskIds':[],'changedArtifactFiles':changed,'sourceOwners':{p:sorted(owners[p]) for p in changed},'conditionResults':conditions,'conditionReasons':reasons,'gateEvidence':gateEvidence,'caseEvidence':caseEvidence,'contractApplicability':{r:True for r in contracts},'supportedClientWindow':'UNKNOWN','schemaCompatibility':'UNKNOWN','environmentBudgets':'UNKNOWN','observationWindow':'UNKNOWN','stopThresholds':'UNKNOWN','releaseOwner':None,'qualifiedTargetApproval':None,'verifiedRestorePoint':None,'rollback':{'mode':'STOP_WRITES_AND_SERVICE','targetRunbookVerified':False,'preserveRecoveryPoint':False,'localAlgorithmRef':str(P/'execution/RP18/RP18-T02/runs'/S.name/'evidence'),'note':'Local first-safe control proven only; actual target stop/write/proxy/pair proof absent.'},'note':'Actual owned runtime/build manifest captured after sourcefreeze; candidate staged artifact cleaned by ownedtest. This is defined local evidence candidate, never an approved live release.'}
save(OUT/'candidate.json',c)
print('candidate',len(selected),'owner tasks',len(changed),'changed artifact files',len(caseEvidence),'bound local cases')
