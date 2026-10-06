from pathlib import Path
import subprocess,sys,json,datetime
S=Path(__file__).resolve().parent
selected=[('candidate-runtime',['tests/integration/rp18-runtime-candidate.integration.test.mjs']),('b17',['tests/integration/b17-role-create.integration.test.mjs']),('login-lock',['tests/integration/rp02-login-lock-ttl.integration.test.mjs']),('project-aggregate',['tests/integration/rp04-project-create-aggregate.integration.test.mjs']),('parent-delete',['tests/integration/rp05-parent-delete-guard.integration.test.mjs']),('sync-read',['tests/integration/rp08-sync-read-authorization.integration.test.mjs']),('report-concurrency',['tests/integration/rp10-report-submit-snapshot.integration.test.mjs']),('receipt-recovery',['tests/integration/rp09-receipt-recovery.integration.test.mjs']),('file-scope',['tests/integration/rf05-file-scope.integration.test.mjs']),('commit-journal',['tests/integration/rp13-commit-journal.integration.test.mjs']),('restore-epoch',['tests/integration/rp16-restore-epoch.integration.test.mjs']),('backup-pair',['tests/integration/rp17-backup-pair.integration.test.mjs']),('unit-contract',[str(p.relative_to('rdpms-system/backend')) for d in ['unit','contract'] for p in sorted(Path('rdpms-system/backend/tests',d).glob('*.mjs'))])]
results=[]
for label,targets in selected:
 output=S/'evidence/final-regression'/label
 print('START '+label,flush=True)
 r=subprocess.run([sys.executable,str(S/'run-suite.py'),str(output),*targets])
 results.append({'label':label,'exitCode':r.returncode,'targets':targets,'output':str(output)})
 (S/'final-regression-summary.json').write_text(json.dumps({'kind':'SERIAL_EACH_SUITE_NEW_OWNED_DB','results':results,'finished':len(results)==len(selected),'passed':all(x['exitCode']==0 for x in results)},indent=2)+'\n')
 if r.returncode:print('STOP_FAILED '+label,flush=True);sys.exit(r.returncode)
print('FINAL_SERIAL_REGRESSIONS_COMPLETE',flush=True)
