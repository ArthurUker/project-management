import {test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {spawn} from 'node:child_process';import fs from 'node:fs/promises';
const helper=path.resolve('../deploy/scripts/deploy-control.py');
const script=String.raw`
import importlib.util,pathlib,tempfile,shutil,json,hashlib,fcntl,os,subprocess,sys,copy
spec=importlib.util.spec_from_file_location('deploy_control',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
root=pathlib.Path(tempfile.mkdtemp(prefix='rdpms-deploy-control-owned-')).resolve();cases=[];controls=[];child=None
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def fixture(tag):
 r=root/tag;r.mkdir();control=r/'control';control.mkdir();env=r/'synthetic.env';env.write_text('OWNED=only\n')
 def build(name):
  c=r/name;selected={};
  for rel in ['rdpms-system/backend/src/index.js','rdpms-system/backend/prisma/migrations/owned/migration.sql','rdpms-system/backend/dist/index.js','rdpms-system/frontend/src/main.ts','rdpms-system/frontend/dist/index.html','rdpms-system/deploy/scripts/deploy.sh']:
   p=c/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('Owned synthetic control artifact '+name);selected[rel]=sha(p)
  return {'kind':'CANDIDATE_PRE_DDL_PREPARATION','state':'PREPARED_PRE_DDL','result':'PASS','criticalFailures':[],'candidate':str(c),'configFileSha256':sha(env),'buildId':name,'sourceBindings':{k:v for k,v in selected.items() if '/src/' in k or '/prisma/' in k or '/deploy/' in k},'buildBindings':{k:v for k,v in selected.items() if '/dist/' in k},'migrationBindings':{k:v for k,v in selected.items() if '/migrations/' in k}}
 old=build('certifiable-prior');new=build('new-candidate');(control/'current').symlink_to(old['candidate']);contract={'evidenceKind':'REAL_OWNED_FILESYSTEM_SIMULATED_SERVICE_DDL_HOOKS','expectedCurrent':old['candidate'],'candidateBuildId':new['buildId'],'newAppCompatible':True,'migrationCompatibility':{k:{'sha256':v,'newAppCompatible':True,'oldAppCompatible':True} for k,v in new['migrationBindings'].items()}}
 events=[]
 def hook(name):
  def execute(*args):
   events.append([name,*args]);return {'ok':True,'build':args[0] if args else None,'ready':True,'restoreEligible':True,'consistentPointVerified':True,'runId':'SYNTHETIC-HOOK-PAIR'}
  return execute
 hooks={n:hook(n) for n in ['stopWrites','stopService','backup','migrate','restart','restartPrevious','health','ready','smoke','resumeWrites']};return r,control,env,old,new,contract,hooks,events
try:
 r,c,e,o,n,k,h,events=fixture('success');v=m.apply(n,e,c,k,h,r/'evidence');print('CONTROL_INITIAL',json.dumps(v));assert v['result']=='PASS' and (c/'current').resolve()==pathlib.Path(n['candidate']);assert events[0][0]=='stopWrites';assert sum(x[0]=='ready' for x in events)==3;assert events[-1][0]=='resumeWrites';controls.append(v);cases.append('SUCCESS_ATOMIC_IDENTITY_AND_PHASE_ORDER')
 r,c,e,o,n,k,h,events=fixture('drift');(pathlib.Path(n['candidate'])/'rdpms-system/backend/src/index.js').write_text('drift');v=m.apply(n,e,c,k,h,r/'evidence');assert v['result']=='FAIL' and not v['schemaMayHaveChanged'] and not events and str((c/'current').resolve())==o['candidate'];controls.append(v);cases.append('CANDIDATE_DRIFT_PRE_EFFECT_REJECTION')
 r,c,e,o,n,k,h,events=fixture('matrix');k['migrationCompatibility']={};v=m.apply(n,e,c,k,h,r/'evidence');assert v['result']=='FAIL' and not events and not v['schemaMayHaveChanged'];controls.append(v);cases.append('UNKNOWN_SCHEMA_MATRIX_NO_DDL')
 r,c,e,o,n,k,h,events=fixture('migration-fail');h['migrate']=lambda:({'ok':False});v=m.apply(n,e,c,k,h,r/'evidence');assert v['result']=='FAIL' and v['schemaMayHaveChanged'] and v['state']=='MAINTENANCE_REQUIRED';assert ['stopService'] in events and not any(x[0]=='restartPrevious' for x in events);controls.append(v);cases.append('MIGRATION_UNKNOWN_EFFECT_FIRSTSAFE_CONTAINMENT')
 r,c,e,o,n,k,h,events=fixture('ready-fail');h['ready']=lambda b:({'ok':True,'build':'WRONG','ready':True});v=m.apply(n,e,c,k,h,r/'evidence');assert v['result']=='FAIL' and v['state']=='MAINTENANCE_REQUIRED' and str((c/'current').resolve())==n['candidate'];assert ['stopService'] in events;assert not any(x[0]=='restartPrevious' for x in events);controls.append(v);cases.append('WRONG_BUILD_CONTAINED_NO_UNSAFE_ROLLBACK')
 r,c,e,o,n,k,h,events=fixture('safe-rollback');k['safeRollback']={'manifest':o,'securityFloorSafe':True,'postMigrationCompatible':True};h['ready']=lambda b:({'ok':True,'build':b,'ready':b==o['buildId']});v=m.apply(n,e,c,k,h,r/'evidence');assert v['result']=='FAIL' and v['state']=='SAFE_COMPATIBLE_ROLLBACK' and str((c/'current').resolve())==o['candidate'];controls.append(v);cases.append('EXPLICIT_CERTIFIED_COMPATIBLE_ROLLBACK_NOT_DEPLOY_SUCCESS')
 r,c,e,o,n,k,h,events=fixture('unsafe-rollback');k['safeRollback']={'manifest':o,'securityFloorSafe':False,'postMigrationCompatible':True};v=m.apply(n,e,c,k,h,r/'evidence');assert v['result']=='FAIL' and not events and not v['schemaMayHaveChanged'];controls.append(v);cases.append('UNCERTIFIED_SECURITY_FLOOR_REJECTED')
 r,c,e,o,n,k,h,events=fixture('lease');lock=c/'.deploy.lock';held=r/'held';child=subprocess.Popen([sys.executable,'-c','import fcntl,sys,pathlib;f=open(sys.argv[1],"a+");fcntl.flock(f,fcntl.LOCK_EX);pathlib.Path(sys.argv[2]).write_text("ready");sys.stdin.read()',str(lock),str(held)],stdin=subprocess.PIPE)
 import time
 for _ in range(100):
  if held.exists():break
  time.sleep(.01)
 assert held.exists();v=m.apply(n,e,c,k,h,r/'evidence');assert v['state']=='LOCK_BUSY' and not events;child.stdin.close();child.wait(timeout=3);child=None;controls.append(v);cases.append('REAL_LIVING_PROCESS_LEASE_CONTENDER_NO_EFFECT')
 r,c,e,o,n,k,h,events=fixture('stop-uncertain');h['stopWrites']=lambda:({'ok':False});v=m.apply(n,e,c,k,h,r/'evidence');assert v['result']=='FAIL' and v['state']=='MAINTENANCE_UNCONFIRMED' and not v['schemaMayHaveChanged'];assert ['stopService'] in events;controls.append(v);cases.append('PARTIAL_STOP_UNKNOWN_NOT_HEALTHY_ROLLBACK')
 # CLI cannot perform an operator change merely from local fixture approval.
 bad=r/'unapproved-contract.json';bad.write_text(json.dumps(k));cm=r/'candidate-manifest.json';cm.write_text(json.dumps(n));p=subprocess.run([sys.executable,sys.argv[1],'--manifest',str(cm),'--env-file',str(e),'--control-root',str(c),'--contract',str(bad),'--evidence',str(r/'cli-evidence')],capture_output=True,text=True);assert p.returncode==1 and not (r/'cli-evidence').exists();cases.append('LOCAL_APPROVAL_CANNOT_ARM_TARGET_CLI')
 result={'layer':'REAL_OWNED_FILESYSTEM_SIMULATED_SERVICE_DDL_HOOKS','cases':[{'name':x,'result':'PASS'} for x in cases],'controls':controls,'actualServiceOperations':0,'actualDDLOperations':0,'productionDeploymentOperations':0,'limits':['Synthetic service/DDL hook proof is not target service/rollback/DB acceptance','Only actual owned FS lease/rename/hash changes executed']}
finally:
 if child:child.stdin.close();child.wait(timeout=3)
 shutil.rmtree(root);print('CONTROL_CLEANUP',json.dumps({'ownedRootRemoved':not root.exists()}))
if 'result' in locals():result['cleanup']={'ownedRootRemoved':not root.exists()};pathlib.Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'cases':len(cases),'result':'PASS'}))
`;
test('actual owned deployment filesystem and ten explicit synthetic operational controls, no production operations',async()=>{let stdout='',stderr='';const out=path.join(process.env.RDPMS_EXEC_EVIDENCE_DIR,'deploy-control-state.json');const child=spawn('python3',['-c',script,helper,out]);child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const exit=await new Promise((r,j)=>{child.on('error',j);child.on('exit',r)});await fs.writeFile(path.join(process.env.RDPMS_EXEC_EVIDENCE_DIR,'deploy-control-python.log'),stdout+stderr);assert.equal(exit,0,stderr);const result=JSON.parse(await fs.readFile(out));assert.equal(result.cases.length,10);assert.equal(result.actualDDLOperations,0);assert.equal(result.cleanup.ownedRootRemoved,true);});
