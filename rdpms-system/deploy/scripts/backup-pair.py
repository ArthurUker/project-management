#!/usr/bin/env python3
"""Immutable paired artifacts. Local manifests prove bytes/pairing, NOT a live common point.
The scheduler must use the separately verified consistent-point barrier before restore eligibility.
"""
import argparse,datetime,fcntl,hashlib,json,os,pathlib,re,shutil,stat,subprocess,sys,tempfile,uuid

def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def atomic_json(p,data):
 tmp=p.with_name('.'+p.name+'.'+uuid.uuid4().hex)
 with tmp.open('x') as f:json.dump(data,f,sort_keys=True,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
 os.replace(tmp,p)
 fd=os.open(p.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def directory(p):
 p=pathlib.Path(p).absolute()
 if p.is_symlink():raise ValueError('DIRECTORY_SYMLINK_REJECTED')
 p.mkdir(parents=True,exist_ok=True)
 return p.resolve()
def files(root):
 entries=[]
 for p in sorted(root.rglob('*')):
  if p.name=='.rdpms-snapshot-manifest.json' and p.parent==root:continue
  s=p.lstat();r={'path':p.relative_to(root).as_posix(),'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'mtimeNs':s.st_mtime_ns}
  if p.is_symlink():
   if not p.resolve().is_relative_to(root):raise ValueError('UPLOAD_SYMLINK_OUTSIDE_SNAPSHOT')
   r.update(kind='symlink',target=os.readlink(p))
  elif p.is_file():r.update(kind='file',size=s.st_size,sha256=sha(p))
  elif p.is_dir():r.update(kind='directory')
  else:raise ValueError('UPLOAD_SPECIAL_FILE_REJECTED')
  entries.append(r)
 return entries

def pg_argv(command):
 # Owned test mode is resource-proven, never a production authentication bypass.
 owned=os.environ.get('RDPMS_EXEC_OWNED_DB')
 if owned:
  if os.environ.get('PGHOST')!='127.0.0.1' or os.environ.get('DB_NAME')!=owned or not owned.startswith('rdpms_test_'):raise ValueError('OWNED_PG_TARGET_MISMATCH')
  return [command]
 return ['sudo','-u','postgres',command]
def command(argv):
 r=subprocess.run(argv,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
 if r.returncode:raise RuntimeError('BACKUP_SUBPROCESS_FAILED:'+pathlib.Path(argv[0]).name+':'+str(r.returncode))

def check_pair(pair,up_root):
 m=json.loads((pair/'pair.json').read_text());run=m['runId'];snap=up_root/run
 if m['state']!='PUBLISHED' or m['formatVersion']!=1 or pair.name!=run or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',run):raise ValueError('PAIR_NOT_PUBLISHED')
 if snap.is_symlink() or not snap.is_dir() or pair.is_symlink():raise ValueError('PAIR_PATH_INVALID')
 if sha(pair/'database.dump')!=m['dumpSha256'] or sha(snap/'.rdpms-snapshot-manifest.json')!=m['fileManifestSha256']:raise ValueError('PAIR_HASH_MISMATCH')
 manifest=json.loads((snap/'.rdpms-snapshot-manifest.json').read_text())
 if manifest['runId']!=run or manifest['entries']!=files(snap):raise ValueError('PAIR_FILES_CHANGED')
 return m,snap

def execute(kind):
 os.umask(0o077)
 db=os.environ.get('DB_NAME','rdpms');run=os.environ.get('RUN_ID') or datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:12]
 if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',run) or not re.fullmatch(r'[A-Za-z0-9_-]+',db):raise ValueError('INVALID_BACKUP_ID')
 if kind not in ['daily','weekly','monthly','predeploy']:raise ValueError('INVALID_BACKUP_KIND')
 source=pathlib.Path(os.environ.get('UPLOAD_SRC','/srv/rdpms/uploads')).absolute()
 if source.is_symlink() or not source.is_dir():raise ValueError('UPLOAD_SOURCE_NOT_DIRECTORY')
 source=source.resolve();pg=directory(os.environ.get('PG_DIR','/srv/rdpms/backups/pg'));up=directory(os.environ.get('UP_DIR','/srv/rdpms/backups/uploads'));pairs=directory(pg/'pairs')
 if source==up or source.is_relative_to(up) or up.is_relative_to(source) or pg.is_relative_to(source) or source.is_relative_to(pg):raise ValueError('BACKUP_SOURCE_OVERLAP')
 lock=pairs/'.backup.lock';fd=os.open(lock,os.O_CREAT|os.O_RDWR|getattr(os,'O_NOFOLLOW',0),0o600)
 with os.fdopen(fd,'a+') as lease:
  try:fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise RuntimeError('BACKUP_RUN_BUSY')
  days={k:int(os.environ.get('KEEP_'+k.upper(),v)) for k,v in [('daily','30'),('weekly','84'),('monthly','365'),('predeploy','0')]}
  if any(v<0 for v in days.values()):raise ValueError('INVALID_RETENTION')
  binding={'dbName':db,'kind':kind,'source':str(source),'pgRoot':str(pg),'uploadRoot':str(up)}
  pair=pairs/run;snap=up/run;latest=up/'latest';previous=None
  if pair.exists() or snap.exists():
   m,_=check_pair(pair,up)
   if m['binding']!=binding:raise ValueError('RUN_ID_BINDING_CONFLICT')
   return {'runId':run,'state':'ALREADY_PUBLISHED','pair':str(pair),'snapshot':str(snap),'consistentPoint':m['consistentPoint']}
  if latest.is_symlink():
   previous=latest.resolve()
   if previous.parent!=up:raise ValueError('LATEST_OUTSIDE_UPLOAD_ROOT')
   check_pair(pairs/previous.name,up)
  elif latest.exists():raise ValueError('LATEST_NOT_SYMLINK')
  dump_stage=pathlib.Path(tempfile.mkdtemp(prefix='.staging-'+run+'-',dir=pairs));file_stage=pathlib.Path(tempfile.mkdtemp(prefix='.staging-'+run+'-',dir=up));owned=[dump_stage,file_stage]
  try:
   atomic_json(dump_stage/'lease.json',{'runId':run,'binding':binding,'pid':os.getpid(),'ownedStages':[str(x) for x in owned]})
   dump=dump_stage/'database.dump';command(pg_argv('pg_dump')+['-Fc','-Z','6','-d',db,'-f',str(dump)]);command(pg_argv('pg_restore')+['-l',str(dump)])
   if (source/'.rdpms-snapshot-manifest.json').exists():raise ValueError('RESERVED_FILE_MANIFEST_COLLISION')
   # Do NOT rely on openrsync link-dest metadata: verified owned counterexample.
   source_entries=files(source)
   shutil.copytree(source,file_stage,symlinks=True,dirs_exist_ok=True)
   for entry in source_entries:
    dst=file_stage/entry['path'];st=dst.lstat()
    if (st.st_uid,st.st_gid)!=(entry['uid'],entry['gid']):os.chown(dst,entry['uid'],entry['gid'],follow_symlinks=False)
   copied=files(file_stage)
   if copied!=source_entries or files(source)!=source_entries:raise ValueError('UPLOAD_SOURCE_CHANGED_OR_METADATA_COPY_MISMATCH')
   if previous and previous.stat().st_dev==file_stage.stat().st_dev:
    old_entries={r['path']:r for r in json.loads((previous/'.rdpms-snapshot-manifest.json').read_text())['entries']}
    for entry in copied:
     if entry['kind']=='file' and old_entries.get(entry['path'])==entry:
      dst=file_stage/entry['path'];dst.unlink();os.link(previous/entry['path'],dst)
   atomic_json(file_stage/'.rdpms-snapshot-manifest.json',{'runId':run,'entries':copied})
   manifest={'formatVersion':1,'runId':run,'state':'PUBLISHED','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'binding':binding,'dumpSha256':sha(dump),'fileManifestSha256':sha(file_stage/'.rdpms-snapshot-manifest.json'),'consistentPoint':'NOT_VERIFIED','restoreEligible':False,'previousRunId':previous.name if previous else None}
   # Publish complete directory paths first, commit marker last. Interrupted orphans aren't eligible.
   os.rename(file_stage,snap);os.rename(dump_stage,pair);atomic_json(pair/'pair.json',manifest)
   check_pair(pair,up)
   pointer=up/('.latest-'+run+'-'+uuid.uuid4().hex);pointer.symlink_to(run)
   try:os.replace(pointer,latest)
   finally:
    if pointer.is_symlink():pointer.unlink()
   # Lease protects backup and retention; no unknown/orphan/legacy tree is ever deleted.
   completed=[]
   for p in pairs.iterdir():
    if p.is_dir() and not p.is_symlink() and (p/'pair.json').is_file():
     try:m,ss=check_pair(p,up);completed.append((m,p,ss))
     except Exception:continue # Corrupt pair is preserved for investigation, not link-dest.
   completed.sort(key=lambda x:x[0]['createdAt'],reverse=True);protected={x[0]['runId'] for x in completed[:2]}|{run}|({previous.name} if previous else set())
   verified=[x for x in completed if x[0].get('restoreVerified') is True and x[0]['binding']['dbName']==db]
   if verified:protected.add(verified[0][0]['runId'])
   removed=[]
   for m,p,ss in completed:
    age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(m['createdAt'])).total_seconds()/86400;keep=days[m['binding']['kind']]
    if m['runId'] in protected or (p/'PINNED').exists() or m['binding']['dbName']!=db or keep==0 or age<=keep:continue
    # Marker disappears BEFORE either member; never leave a claimed complete broken pair.
    os.rename(p/'pair.json',p/'retiring.json');shutil.rmtree(ss);shutil.rmtree(p);removed.append(m['runId'])
   return {'runId':run,'state':'PUBLISHED','pair':str(pair),'snapshot':str(snap),'consistentPoint':'NOT_VERIFIED','retiredPairs':removed}
  finally:
   for p in owned:
    if p.exists() and not p.is_symlink() and p.name.startswith('.staging-'+run+'-'):shutil.rmtree(p)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('kind',nargs='?',default=os.environ.get('KIND','daily'));args=parser.parse_args()
 try:print(json.dumps(execute(args.kind),sort_keys=True))
 except Exception as exc:print('BACKUP_FAILED:'+str(exc),file=sys.stderr);sys.exit(1)
