#!/usr/bin/env python3
"""Deploy state machine. CLI requires target release approval/proof; local tests inject
synthetic hooks and exercise only genuinely new owned filesystem controls.
"""
import argparse,fcntl,hashlib,json,os,pathlib,subprocess,sys,time,uuid

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,value):
 tmp=p.with_name('.'+p.name+'-'+uuid.uuid4().hex)
 with tmp.open('x') as f:json.dump(value,f,sort_keys=True,indent=2);f.flush();os.fsync(f.fileno())
 os.replace(tmp,p)
def verify(manifest,envfile=None):
 if manifest['state']!='PREPARED_PRE_DDL' or manifest['result']!='PASS' or manifest['criticalFailures']:raise ValueError('CANDIDATE_NOT_PREPARED')
 root=pathlib.Path(manifest['candidate']).resolve(strict=True)
 generated=root/'rdpms-system/backend/node_modules/.prisma/client/schema.prisma'
 if manifest.get('generatedClientSchemaSha256') and (not generated.is_file() or sha(generated)!=manifest['generatedClientSchemaSha256']):raise ValueError('GENERATED_CLIENT_DRIFT')
 for section in ['sourceBindings','buildBindings','migrationBindings']:
  selected=manifest[section]
  prefixes=['rdpms-system/backend/src','rdpms-system/backend/prisma','rdpms-system/frontend/src','rdpms-system/deploy/scripts'] if section=='sourceBindings' else ['rdpms-system/backend/dist','rdpms-system/frontend/dist'] if section=='buildBindings' else ['rdpms-system/backend/prisma/migrations']
  actual={f.relative_to(root).as_posix() for prefix in prefixes for f in (root/prefix).rglob('*') if f.is_file()}
  if actual-{*selected}:raise ValueError('UNBOUND_CANDIDATE_FILES')
  for rel,digest in selected.items():
   p=root/rel
   if not p.resolve().is_relative_to(root) or not p.is_file() or sha(p)!=digest:raise ValueError('CANDIDATE_HASH_DRIFT')
 if envfile and sha(pathlib.Path(envfile))!=manifest['configFileSha256']:raise ValueError('CANDIDATE_CONFIG_DRIFT')
 return root

def current_target(current):
 if current.is_symlink():return str(current.resolve(strict=True))
 if current.exists():raise ValueError('CURRENT_NOT_SYMLINK')
 return None

def pointer(current,target):
 temp=current.with_name('.current-'+uuid.uuid4().hex);temp.symlink_to(target)
 try:os.replace(temp,current)
 finally:
  if temp.is_symlink():temp.unlink()
 fd=os.open(current.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)

def apply(manifest,envfile,control,contract,hooks,evidence):
 control=pathlib.Path(control).resolve(strict=True);evidence=pathlib.Path(evidence).absolute()
 if evidence.exists():raise ValueError('DEPLOY_EVIDENCE_EXISTS')
 evidence.mkdir(parents=True);result={'runId':uuid.uuid4().hex,'kind':contract.get('evidenceKind','TARGET_OPERATION'),'state':'PRECHECK','events':[],'schemaMayHaveChanged':False,'pointerChanged':False,'release':'NOT_EVALUATED'}
 current=control/'current';fd=os.open(control/'.deploy.lock',os.O_CREAT|os.O_RDWR|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'a+') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   result.update(state='LOCK_BUSY',result='FAIL');write(evidence/'deploy-result.json',result);return result
  before=current_target(current);root=None;switched=False;stopped=False;rollback=None
  def record(phase,details=None):result['state']=phase;result['events'].append({'phase':phase,'at':time.time(),**(details or {})});write(evidence/'deploy-result.json',result)
  def invoke(name,*args):
   value=hooks[name](*args)
   if not isinstance(value,dict) or not value.get('ok'):raise ValueError('HOOK_FAILED:'+name)
   return value
  def observe(build):
   for _ in range(3):
    for name in ['health','ready']:
     probe=invoke(name,build)
     if probe.get('build')!=build or name=='ready' and probe.get('ready') is not True:raise ValueError('SERVICE_BUILD_OR_READY_MISMATCH')
   smoke=invoke('smoke',build)
   if smoke.get('build')!=build:raise ValueError('SMOKE_BUILD_MISMATCH')
  try:
   root=verify(manifest,envfile)
   if root.stat().st_dev!=control.stat().st_dev:raise ValueError('CANDIDATE_POINTER_FILESYSTEM_MISMATCH')
   if contract.get('expectedCurrent')!=before:raise ValueError('CURRENT_BASELINE_CHANGED')
   if contract.get('candidateBuildId')!=manifest['buildId'] or contract.get('newAppCompatible') is not True:raise ValueError('APP_SCHEMA_COMPATIBILITY_UNKNOWN')
   for rel,digest in manifest['migrationBindings'].items():
    c=contract.get('migrationCompatibility',{}).get(rel)
    if not c or c.get('sha256')!=digest or c.get('newAppCompatible') is not True:raise ValueError('MIGRATION_COMPATIBILITY_UNKNOWN')
   rollback=contract.get('safeRollback')
   if rollback:
    verify(rollback['manifest'],envfile if rollback.get('sameConfigRequired',True) else None)
    if not rollback.get('securityFloorSafe') or not rollback.get('postMigrationCompatible') or any(not c.get('oldAppCompatible') for c in contract['migrationCompatibility'].values()):raise ValueError('UNSAFE_ROLLBACK_TARGET')
   record('CANDIDATE_VERIFIED',{'buildId':manifest['buildId'],'previous':before})
   stopped=True;record('STOP_WRITES_REQUESTED');invoke('stopWrites');record('WRITES_STOPPED')
   backup=invoke('backup')
   if backup.get('restoreEligible') is not True or backup.get('consistentPointVerified') is not True:raise ValueError('PAIRED_BACKUP_NOT_VERIFIED')
   record('PAIRED_BACKUP_VERIFIED',{'pairId':backup.get('runId')})
   verify(manifest,envfile)
   if current_target(current)!=before:raise ValueError('CURRENT_BASELINE_CHANGED')
   result['schemaMayHaveChanged']=True;record('MIGRATION_STARTED');invoke('migrate');record('MIGRATION_FINISHED')
   verify(manifest,envfile);write(root/'.rdpms-release-manifest.json',manifest)
   if current_target(current)!=before:raise ValueError('CURRENT_BASELINE_CHANGED')
   pointer(current,root);switched=True;result['pointerChanged']=True;record('POINTER_SWITCHED')
   invoke('restart',manifest['buildId']);record('RESTARTED');observe(manifest['buildId']);record('READY_SMOKE_OBSERVED')
   invoke('resumeWrites');record('COMPLETE_CONTROLLED_CUTOVER');result['result']='PASS'
  except Exception as exc:
   result['failure']=type(exc).__name__+':'+str(exc);record('FAILED')
   # Pre-effect failures leave known healthy current alone. Once stopped/DDL invoked,
   # default is containment, never blind pointer rollback into a vulnerable old app.
   if stopped:
    try:
     failed=[]
     for name in ['stopWrites','stopService']:
      try:invoke(name)
      except Exception as failure:failed.append(type(failure).__name__+':'+str(failure))
     if failed:raise RuntimeError(';'.join(failed))
     if result['schemaMayHaveChanged'] and rollback:
      safe=rollback['manifest'];safe_root=verify(safe,envfile if rollback.get('sameConfigRequired',True) else None);write(safe_root/'.rdpms-release-manifest.json',safe);pointer(current,safe_root);invoke('restart',safe['buildId']);observe(safe['buildId']);invoke('resumeWrites');record('SAFE_COMPATIBLE_ROLLBACK')
     elif not result['schemaMayHaveChanged']:
      if rollback and str(pathlib.Path(rollback['manifest']['candidate']).resolve())==before:invoke('restartPrevious');observe(rollback['manifest']['buildId']);invoke('resumeWrites');record('PRE_DDL_CERTIFIED_PREVIOUS_RETAINED')
      else:record('MAINTENANCE_REQUIRED')
     else:record('MAINTENANCE_REQUIRED')
    except Exception as containment:result['containmentFailure']=type(containment).__name__+':'+str(containment);record('MAINTENANCE_UNCONFIRMED')
   result['result']='FAIL'
  write(evidence/'deploy-result.json',result);return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--verify-current');p.add_argument('--manifest');p.add_argument('--env-file');p.add_argument('--control-root');p.add_argument('--contract');p.add_argument('--evidence');a=p.parse_args()
 try:
  if a.verify_current:
   m=json.loads(pathlib.Path(a.verify_current).read_text());verify(m,a.env_file);print(m['buildId']);sys.exit(0)
  contract=json.loads(pathlib.Path(a.contract).read_text())
  if contract.get('releaseDecision')!='APPROVED_TARGET_CHANGE' or not contract.get('targetApprovalRef') or not all(contract.get('targetGates',{}).get(k)=='PASS' for k in ['S05-OI-01','S05-OI-02','S05-OI-04','S05-OI-05']):raise ValueError('TARGET_DEPLOYMENT_NOT_APPROVED_OR_GATES_INCOMPLETE')
  def hook(name):
   argv=contract['hooks'][name]
   if not isinstance(argv,list) or not argv or not pathlib.Path(argv[0]).is_absolute():raise ValueError('HOOK_NOT_EXPLICIT_EXECUTABLE')
   def call(*args):
    # No shell, no secret argv/env printing; operator installed hook owns target privileges.
    res=subprocess.run(argv+list(args),text=True,capture_output=True,timeout=120)
    if res.returncode:return {'ok':False}
    return json.loads(res.stdout)
   return call
  hooks={name:hook(name) for name in ['stopWrites','stopService','backup','migrate','restart','restartPrevious','health','ready','smoke','resumeWrites']}
  result=apply(json.loads(pathlib.Path(a.manifest).read_text()),a.env_file,a.control_root,contract,hooks,a.evidence);print(result['state']);sys.exit(0 if result['result']=='PASS' else 1)
 except Exception as e:print('DEPLOY_REJECTED:'+type(e).__name__+':'+str(e),file=sys.stderr);sys.exit(1)
