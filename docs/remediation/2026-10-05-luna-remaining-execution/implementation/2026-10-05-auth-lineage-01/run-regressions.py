from pathlib import Path
import subprocess,json,sys
ROOT=Path.cwd();S=Path(__file__).resolve().parent
OUT=ROOT/'docs/remediation/2026-10-01-rdpms/execution/RP03/RP03-T01/runs'/S.name/'evidence/regression'
unit=['rf01-bootstrap','rf01-reports-routes','rf01-undefined-check','rf02-idempotency','rf03-report-period','rf03-super-admin-permissions','rf04-authz-before-replay','rf04-entry-matrix','rf04-post-upsert-authz','rf04-versions-access','rf04-write-authorization','rf05-file-access-policy']
suites={ 'backend-unit-contract':['tests/unit/'+x+'.test.mjs' for x in unit]+['tests/contract/rf01-bootstrap-contract.test.mjs'] }
for name in ['rf02-idempotency','rf02-post-concurrency','rf02-sync-rejection-retry','rf04-write-authorization','rf04-versions-access','rp08-sync-read-authorization','rp10-report-submit-snapshot','b17-role-create']:
 suites[name]=['tests/integration/'+name+'.integration.test.mjs']
results=[]
for name,targets in suites.items():
 command=[sys.executable,str(S/'run-suite.py'),str(OUT/name),*targets]
 print('START',name,flush=True)
 run=subprocess.run(command,cwd=ROOT)
 results.append({'suite':name,'command':command,'exitCode':run.returncode})
 (S/'evidence/regression-session.json').write_text(json.dumps({'serialOwnedResources':True,'results':results},indent=2)+'\n')
 print('DONE',name,run.returncode,flush=True)
 if run.returncode:sys.exit(run.returncode)
sys.exit(0)
