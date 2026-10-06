#!/usr/bin/env python3
"""Prepare an explicitly supplied candidate; never fetch/install/connect/DDL/cut over.
Existing dependencies and generated Prisma client are prerequisites. Failed evidence stays.
"""
import argparse,hashlib,json,os,pathlib,subprocess,sys,uuid,re

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bindings(root,folders):
 result={}
 for folder in folders:
  p=root/folder
  if not p.exists():raise ValueError('CANDIDATE_REQUIRED_PATH_MISSING:'+folder)
  for f in sorted(p.rglob('*')) if p.is_dir() else [p]:
   if f.is_file():result[f.relative_to(root).as_posix()]=sha(f)
 return result

def prepare(candidate,envfile,evidence,build=True):
 candidate=pathlib.Path(candidate).resolve(strict=True);envfile=pathlib.Path(envfile).resolve(strict=True);evidence=pathlib.Path(evidence).absolute()
 if evidence.exists():raise ValueError('CANDIDATE_EVIDENCE_EXISTS_APPEND_NEW_RUN')
 evidence.mkdir(parents=True);result={'kind':'CANDIDATE_PRE_DDL_PREPARATION','commands':[],'criticalFailures':[],'databaseOperations':0,'currentChanges':0,'installOrFetchOperations':0,'candidate':str(candidate),'limits':['Existing preinstalled candidate dependencies only','No target host/DDL/deployment/rollback approval inferred']}
 backend=candidate/'rdpms-system/backend';frontend=candidate/'rdpms-system/frontend';folders=['rdpms-system/backend/src','rdpms-system/backend/prisma','rdpms-system/backend/package.json','rdpms-system/backend/package-lock.json','rdpms-system/backend/tsconfig.json','rdpms-system/frontend/src','rdpms-system/frontend/package.json','rdpms-system/frontend/package-lock.json','rdpms-system/frontend/tsconfig.app.json','rdpms-system/frontend/tsconfig.node.json','rdpms-system/frontend/tsconfig.json','rdpms-system/frontend/index.html','rdpms-system/frontend/vite.config.ts','rdpms-system/frontend/postcss.config.cjs','rdpms-system/frontend/tailwind.config.js','rdpms-system/deploy/scripts']
 def command(label,argv,cwd):
  # Do not inherit real DB/JWT/config/env. Build needs no DB or target credentials.
  env={k:v for k,v in os.environ.items() if k in ['PATH','TMPDIR','LANG','LC_ALL','SHELL','HOME']};env['DATABASE_URL']='postgresql://unused@127.0.0.1:1/candidate_validation_only';env['DIRECT_URL']=env['DATABASE_URL']
  env['PATH']=str(frontend/'node_modules/.bin')+os.pathsep+env.get('PATH','')
  p=subprocess.run(argv,cwd=cwd,env=env,text=True,capture_output=True,timeout=600);(evidence/(label+'.log')).write_text(p.stdout+p.stderr);result['commands'].append({'label':label,'argv':argv,'exitCode':p.returncode})
  if p.returncode:raise RuntimeError('CANDIDATE_COMMAND_FAILED:'+label)
  return p.stdout
 try:
  if (frontend/'public').exists():folders.append('rdpms-system/frontend/public')
  if (backend/'config').exists():folders.append('rdpms-system/backend/config')
  result['sourceBindings']=bindings(candidate,folders);result['sourceFingerprint']=hashlib.sha256(json.dumps(result['sourceBindings'],sort_keys=True).encode()).hexdigest();result['configFileSha256']=sha(envfile)
  # Existing generated client must correspond to actual datamodel; no codegen in shared deps.
  generated=backend/'node_modules/.prisma/client/schema.prisma'
  def datamodel(p):
   text=re.sub(r'generator\s+\w+\s*\{[^}]*\}','',p.read_text())
   tokens=re.findall(r'"(?:\\.|[^"\\])*"|//[^\n]*|[A-Za-z_0-9]+|[^\s]',text)
   return [x for x in tokens if not x.startswith('//')]
  if not generated.is_file() or datamodel(generated)!=datamodel(backend/'prisma/schema.prisma'):raise ValueError('CANDIDATE_GENERATED_CLIENT_SCHEMA_MISMATCH')
  result['generatedClientSchemaSha256']=sha(generated)
  result['nodeVersion']=command('node-version',['node','--version'],backend).strip();result['compilerVersion']=command('compiler-version',[str(frontend/'node_modules/.bin/tsc'),'--version'],backend).strip()
  command('schema-validate',['npx','--no-install','prisma','validate'],backend)
  if build:
   for b in [backend/'dist',frontend/'dist']:
    if b.exists():raise ValueError('CANDIDATE_BUILD_OUTPUT_EXISTS_UNKNOWN_OWNERSHIP')
   command('backend-build',['npm','run','build'],backend);command('frontend-build',['npm','run','build'],frontend)
  if not (backend/'dist/index.js').is_file() or not (frontend/'dist/index.html').is_file():raise ValueError('CANDIDATE_BUILD_OUTPUT_MISSING')
  raw=command('compiled-config',['node',str(backend/'dist/platform/config/configCli.js'),'--env-file',str(envfile),'--code-root',str(backend)],backend);result['effectiveConfig']=json.loads(raw)
  if result['sourceBindings']!=bindings(candidate,folders) or result['configFileSha256']!=sha(envfile):raise ValueError('CANDIDATE_SOURCE_OR_CONFIG_CHANGED_DURING_BUILD')
  result['buildBindings']=bindings(candidate,['rdpms-system/backend/dist','rdpms-system/frontend/dist']);result['buildId']=hashlib.sha256(json.dumps({'source':result['sourceFingerprint'],'outputs':result['buildBindings'],'config':result['configFileSha256']},sort_keys=True).encode()).hexdigest();result['migrationBindings']=bindings(candidate,['rdpms-system/backend/prisma/migrations']);result['state']='PREPARED_PRE_DDL';result['result']='PASS'
 except Exception as e:result['criticalFailures'].append(type(e).__name__+':'+str(e));result['state']='REJECTED_PRE_DDL';result['result']='FAIL'
 (evidence/'candidate-manifest.json').write_text(json.dumps(result,indent=2)+'\n');return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--candidate',required=True);p.add_argument('--env-file',required=True);p.add_argument('--evidence',required=True);p.add_argument('--verify-built',action='store_true');a=p.parse_args()
 try:r=prepare(a.candidate,a.env_file,a.evidence,not a.verify_built);print(r['state']);sys.exit(0 if r['result']=='PASS' else 1)
 except Exception as e:print('CANDIDATE_PREPARATION_REJECTED:'+type(e).__name__,file=sys.stderr);sys.exit(1)
