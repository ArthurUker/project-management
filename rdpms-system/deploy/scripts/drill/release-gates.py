#!/usr/bin/env python3
"""Read-only scoped readiness calculator. Never approves/executes a release.
Missing condition, evidence, artifact, client window, or target fact fails closed.
Implementation edges and acceptance edges are deliberately separate.
"""
import argparse,csv,hashlib,json,pathlib,sys

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def evaluate(plan,candidate):
 plan=pathlib.Path(plan).resolve();repo=pathlib.Path(candidate['repoRoot']).resolve()
 tasks={t['id']:t for t in json.loads((plan/'TASK_GRAPH.json').read_text())['tasks']}
 state=json.loads((plan/'IMPLEMENTATION_STATE.json').read_text())['tasks']
 matrix={r['case_id']:r for r in csv.DictReader((plan/'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig'))}
 blockers=[];requirements=[];cases=set();gate_rows=[];contracts=set()
 def block(code,**detail):blockers.append({'code':code,**detail})
 seeds=set(candidate.get('includedTaskIds',[]))|set(candidate.get('affectedTaskIds',[]))
 if not seeds:block('EMPTY_CANDIDATE_SCOPE')
 unknown=seeds-set(tasks)
 if unknown:block('UNKNOWN_TASK',taskIds=sorted(unknown));seeds-=unknown
 closure=set(seeds);pending=list(seeds)
 while pending:
  tid=pending.pop()
  for dep in tasks[tid].get('implementationDependencies',[]):
   if dep not in tasks:block('UNKNOWN_IMPLEMENTATION_DEPENDENCY',taskId=tid,dependency=dep);continue
   if dep not in closure:closure.add(dep);pending.append(dep)
 for tid in sorted(closure):
  task=tasks[tid];s=state.get(tid,{})
  if s.get('implementation')!='COMPLETE':block('IMPLEMENTATION_INCOMPLETE',taskId=tid,status=s.get('implementation','UNKNOWN'))
  activation=task.get('activation','')
  if ('OPTIONAL' in activation or activation.startswith('CONDITIONAL')) and tid not in candidate.get('explicitlyActivatedTaskIds',[]):block('OPTIONAL_TASK_NOT_ACTIVATED',taskId=tid)
  cases.update(task.get('acceptanceCaseIds',[]));contracts.update(task.get('contractRefs',[]))
  # These edges constrain evidence, not admission to implementation closure.
  for dep in task.get('acceptanceDependencies',[]):
   ds=state.get(dep,{})
   if ds.get('validation')!='PASS':block('ACCEPTANCE_DEPENDENCY_PENDING',taskId=tid,dependency=dep,status=ds.get('validation','UNKNOWN'))
  for gate in task.get('gateRequirements',[]):
   condition=gate.get('condition','always');key=tid+':'+gate['ref'];applicable=True if condition=='always' else candidate.get('conditionResults',{}).get(key)
   row={'taskId':tid,'ref':gate['ref'],'before':gate['before'],'condition':condition,'applicable':applicable}
   if applicable is False:row['result']='NOT_APPLICABLE';gate_rows.append(row);continue
   if applicable is not True:row['result']='UNKNOWN';block('GATE_CONDITION_UNKNOWN',**row);gate_rows.append(row);continue
   resolved_ref={'S03-OI-06':'D-S01-04','S03-OI-07':'D-S01-06'}.get(gate['ref'],gate['ref'])
   row['approvalSourceRef']=resolved_ref
   proof=candidate.get('gateEvidence',{}).get(resolved_ref,{})
   if tid not in proof.get('scopeTaskIds',[]) or proof.get('result')!='PASS' or not gate_bound(proof,repo,resolved_ref,tid):row['result']='MISSING_OR_UNBOUND';block('GATE_EVIDENCE_REQUIRED',**row)
   elif gate['before'] in ['VALIDATION','RELEASE'] and gate['ref'].startswith(('S05-','S03-OI-04','S03-OI-09')) and proof.get('kind')!='TARGET_RUNTIME':row['result']='LOCAL_ONLY';block('TARGET_GATE_NOT_PROVEN',**row)
   else:row['result']='PASS'
   gate_rows.append(row)
 for ref in sorted(contracts):
  applicability=candidate.get('contractApplicability',{}).get(ref)
  if applicability is None:block('CONTRACT_APPLICABILITY_UNKNOWN',contract=ref)
  elif applicability is True:
   contracts_input=json.loads((plan/'CROSS_PACKAGE_CONTRACTS.json').read_text())['contracts']
   contract=next((c for c in contracts_input if c['id']==ref),None)
   if not contract:block('UNKNOWN_CONTRACT',contract=ref)
   else:cases.update(contract.get('caseIds',[]))
  elif applicability is not False or not candidate.get('contractReasons',{}).get(ref):block('CONTRACT_EXCLUSION_WITHOUT_REASON',contract=ref)
 for cid in sorted(cases):
  # Gate case IDs are accounted at their actual scope above, not global matrix.
  if cid.startswith(('GATE-','DECISION-')):continue
  row=matrix.get(cid);proof=candidate.get('caseEvidence',{}).get(cid)
  result=proof.get('result') if proof else row.get('result') if row else 'UNKNOWN'
  evidence=proof if proof else {'path':str((plan/row['evidence_ref']).relative_to(repo))} if row and row.get('evidence_ref') else {}
  valid=case_bound(evidence,repo,cid)
  if result!='PASS' or not valid:block('CASE_NOT_PASSED_OR_UNBOUND',caseId=cid,result=result)
  requirements.append({'caseId':cid,'result':result,'evidenceBound':valid})
 manifest_ref=candidate.get('manifestRef',{})
 if not bound(manifest_ref,repo):block('MANIFEST_UNBOUND');manifest={}
 else:
  manifest=json.loads((repo/manifest_ref['path']).read_text())
  if manifest.get('result')!='PASS' or manifest.get('state')!='PREPARED_PRE_DDL' or manifest.get('criticalFailures'):block('CANDIDATE_NOT_PREPARED')
  if candidate.get('buildId')!=manifest.get('buildId'):block('CANDIDATE_BUILD_ID_MISMATCH')
  for path,sha in manifest.get('sourceBindings',{}).items():
   file=repo/path
   if not file.resolve().is_relative_to(repo) or not file.is_file() or digest(file)!=sha:block('CANDIDATE_SOURCE_DRIFT',path=path)
  baseline_ref=candidate.get('baseSourceManifestRef',{})
  if not bound(baseline_ref,repo):block('BASE_SOURCE_MANIFEST_UNBOUND')
  else:
   baseline=json.loads((repo/baseline_ref['path']).read_text()).get('sourceBindings',{})
   actual_changes={p for p,h in manifest.get('sourceBindings',{}).items() if baseline.get(p)!=h}
   if actual_changes!=set(candidate.get('changedArtifactFiles',[])):block('SOURCE_CHANGE_INVENTORY_MISMATCH',missing=sorted(actual_changes-set(candidate.get('changedArtifactFiles',[]))),extra=sorted(set(candidate.get('changedArtifactFiles',[]))-actual_changes))
  for path in candidate.get('changedArtifactFiles',[]):
   owners=candidate.get('sourceOwners',{}).get(path,[])
   if not owners or not set(owners)<=closure:block('SOURCE_OWNER_SCOPE_UNCOVERED',path=path,owners=owners)
   if path not in manifest.get('sourceBindings',{}):block('CHANGED_ARTIFACT_FILE_UNBOUND',path=path)
  artifact=pathlib.Path(manifest.get('candidate','/nonexistent')).resolve()
  if not artifact.is_dir():block('STAGED_ARTIFACT_UNAVAILABLE')
  else:
   for rel,sha in manifest.get('buildBindings',{}).items():
    p=artifact/rel
    if not p.resolve().is_relative_to(artifact) or not p.is_file() or digest(p)!=sha:block('BUILD_ARTIFACT_DRIFT',path=rel)
 if not candidate.get('candidateId'):block('CANDIDATE_ID_MISSING')
 for field in ['supportedClientWindow','schemaCompatibility','environmentBudgets','observationWindow','stopThresholds','releaseOwner','qualifiedTargetApproval','verifiedRestorePoint']:
  value=candidate.get(field)
  if not isinstance(value,dict) or value.get('status') not in ['VERIFIED','APPROVED_TARGET'] or not bound(value,repo):block('RELEASE_FIELD_MISSING_OR_UNVERIFIED',field=field)
 rollback=candidate.get('rollback',{})
 if rollback.get('mode')=='SAFE_ARTIFACT':
  if not rollback.get('securityFloorSafe') or not rollback.get('schemaProtocolCompatible') or not bound(rollback,repo):block('UNSAFE_OR_UNBOUND_ROLLBACK')
 elif rollback.get('mode')=='STOP_WRITES_AND_SERVICE':
  if not rollback.get('targetRunbookVerified') or not rollback.get('preserveRecoveryPoint') or not bound(rollback,repo):block('CONTAINMENT_TARGET_NOT_VERIFIED')
 else:block('SAFE_ROLLBACK_OR_CONTAINMENT_REQUIRED')
 return {'kind':'READ_ONLY_SCOPED_RELEASE_EVALUATION','candidateId':candidate.get('candidateId'),'result':'PASS','implementationClosure':sorted(closure),'acceptanceOnlyDependencies':sorted({d for t in closure for d in tasks[t].get('acceptanceDependencies',[])}-closure),'requiredCases':requirements,'gates':gate_rows,'contractRefs':sorted(contracts),'blockers':blockers,'eligibleForTargetReview':not blockers,'release':'NOT_EVALUATED','programmeClosure':'NOT_EVALUATED','note':'Successful calculation is not product/target/release acceptance; no operation is authorized or run.'}

def gate_bound(ref,repo,gate,tid):
 if not bound(ref,repo):return False
 try:
  d=json.loads((repo/ref['path']).read_text())
  if ref.get('kind')=='LOCAL_DECISION':
   decision=next((x for x in d.get('decisions',[]) if x.get('id')==gate),{})
   named_parent=decision.get('status')=='APPROVED' and decision.get('approvedBy')
   if named_parent and tid in decision.get('approvedScope',[]) and decision.get('evidenceRef') and (repo/decision['evidenceRef']).is_file():return True
   for scope in decision.get('additionalApprovedScopes',[]):
    evidence=scope.get('contractRef',scope.get('evidenceRef',scope.get('evidence')))
    if scope.get('taskId')==tid and (scope.get('approvedBy') or named_parent) and evidence and (repo/evidence).is_file():return True
   return False
  return bool(ref.get('kind')=='TARGET_RUNTIME' and d.get('gateId')==gate and d.get('result')=='PASS' and d.get('targetIdentity') and tid in d.get('scopeTaskIds',[]))
 except (OSError,ValueError,TypeError):return False

def case_bound(ref,repo,cid):
 if not bound(ref,repo):return False
 try:
  d=json.loads((repo/ref['path']).read_text())
  return any(row.get('caseId',row.get('case_id'))==cid and row.get('result')=='PASS' for row in d.get('cases',[]))
 except (OSError,ValueError,TypeError):return False

def bound(ref,repo,allow_unhashed=False):
 try:
  p=(repo/ref['path']).resolve(strict=True)
  return p.is_relative_to(repo) and p.is_file() and (allow_unhashed or ref.get('sha256')==digest(p))
 except (KeyError,OSError,TypeError):return False

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--plan',required=True);p.add_argument('--candidate',required=True);p.add_argument('--evidence',required=True);a=p.parse_args()
 try:
  output=pathlib.Path(a.evidence)
  if output.exists():raise ValueError('EVALUATION_OUTPUT_EXISTS')
  result=evaluate(a.plan,json.loads(pathlib.Path(a.candidate).read_text()));output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'result':result['result'],'blockerCount':len(result['blockers']),'eligibleForTargetReview':result['eligibleForTargetReview'],'release':'NOT_EVALUATED'}));sys.exit(0 if result['eligibleForTargetReview'] else 2)
 except Exception as exc:print('RELEASE_EVALUATION_FAILED:'+type(exc).__name__,file=sys.stderr);sys.exit(1)
