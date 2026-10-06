from pathlib import Path
import subprocess,json,sys
s=Path(__file__).resolve().parent
runs=[('rp16-t03-epoch',['tests/integration/rp16-restore-epoch.integration.test.mjs']),('rp16-t03-apply-regression',['tests/integration/rp16-restore-apply.integration.test.mjs']),('rp16-t03-registry-regression',['tests/integration/rp16-restore-registry.integration.test.mjs']),('rp16-t03-security-regression',['tests/integration/rp03-security-version.integration.test.mjs']),('rp16-t03-refresh-regression',['tests/integration/rp02-t02-acceptance.integration.test.mjs']),('rp16-t03-lock-regression',['tests/integration/rp02-login-lock-ttl.integration.test.mjs']),('rp16-t03-sync-receipts-regression',['tests/integration/rp09-receipt-recovery.integration.test.mjs']),('rp16-t03-browser-receipts-regression',[str(s/'browser-receipts.integration.mjs')]),('rp16-t03-browser-acl-regression',[str(s/'browser-acl.integration.mjs')])]
results=[]
for name,targets in runs:
 if name in ['rp16-t03-epoch','rp16-t03-apply-regression','rp16-t03-registry-regression','rp16-t03-security-regression','rp16-t03-refresh-regression','rp16-t03-lock-regression']: continue
 print('BEGIN',name,flush=True);code=subprocess.call(['python3',str(s/'run-suite.py'),str(s/'evidence'/name),*targets]);results.append({'run':name,'targets':targets,'exitCode':code});(s/'evidence/rp16-t03-regression-launch.json').write_text(json.dumps(results,indent=2)+'\n')
 if code:print('STOP_ON_FAILED_REGRESSION',name,flush=True);break
sys.exit(1 if any(r['exitCode'] for r in results) else 0)
