from pathlib import Path
import subprocess,json,sys
ROOT=Path.cwd();S=Path(__file__).resolve().parent
unit=['rf01-bootstrap','rf01-reports-routes','rf01-undefined-check','rf02-idempotency','rf03-report-period','rf03-super-admin-permissions','rf04-authz-before-replay','rf04-entry-matrix','rf04-post-upsert-authz','rf04-versions-access','rf04-write-authorization','rf05-file-access-policy']
suites={'backend-unit-contract':['tests/unit/'+x+'.test.mjs' for x in unit]+['tests/contract/rf01-bootstrap-contract.test.mjs']}
for name in ['rf02-idempotency','rf02-post-concurrency','rf02-sync-rejection-retry','rf04-write-authorization','rf04-versions-access','rp08-sync-read-authorization','rp10-report-submit-snapshot','b17-role-create','rp09-scoped-receipt']:
 suites[name]=['tests/integration/'+name+'.integration.test.mjs']
suites['semantic-negative-control']=[str(S/'negative-controls/root-task-outside-tx-control.mjs')]
results=[]
for name,targets in suites.items():
 command=[sys.executable,str(S/'run-suite.py'),str(S/'evidence/regressions'/name),*targets]
 print('START',name,flush=True)
 result=subprocess.run(command,cwd=ROOT)
 results.append({'suite':name,'command':command,'exitCode':result.returncode,'classification':'SEMANTIC_NEGATIVE_CONTROL_EXPECTED_FAILURE' if name=='semantic-negative-control' else 'AWAIT_LOG_ARBITRATION'})
 (S/'evidence/regression-session.json').write_text(json.dumps({'serialOwnedResources':True,'results':results},indent=2)+'\n')
 print('DONE',name,result.returncode,flush=True)
# Per-command logs carry failures, aggregate never hides them.
sys.exit(1 if any(x['exitCode'] for x in results if x['suite']!='semantic-negative-control') else 0)
