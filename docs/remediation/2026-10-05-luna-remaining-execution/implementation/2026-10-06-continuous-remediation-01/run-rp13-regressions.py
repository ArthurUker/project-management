from pathlib import Path
import json,subprocess,sys
s=Path(__file__).resolve().parent
runs=[('rp13-t03-acl-regression','tests/integration/rp08-acl-backfill.integration.test.mjs'),('rp13-t03-read-regression','tests/integration/rp08-sync-read-authorization.integration.test.mjs'),('rp13-t03-page-regression','tests/integration/rp13-stable-pull-pagination.integration.test.mjs'),('rp13-t03-browser-acl',str(s/'browser-acl-epoch-regression.integration.mjs')),('rp13-t03-browser-receipts',str(s/'browser-receipts.integration.mjs')),('rp13-t03-browser-restore',str(s/'browser-restore-epoch.integration.mjs')),('rp13-t03-restore-regression','tests/integration/rp16-restore-apply.integration.test.mjs'),('rp13-t03-epoch-regression','tests/integration/rp16-restore-epoch.integration.test.mjs')]
results=[]
for name,target in runs:
 if name in ['rp13-t03-acl-regression','rp13-t03-read-regression','rp13-t03-page-regression','rp13-t03-browser-acl','rp13-t03-browser-receipts']:continue
 print('BEGIN',name,flush=True);code=subprocess.call(['python3',str(s/'run-suite.py'),str(s/'evidence'/name),target]);results.append({'run':name,'exitCode':code});(s/'evidence/rp13-regression-launch.json').write_text(json.dumps(results,indent=2)+'\n')
 if code:break
sys.exit(1 if any(r['exitCode'] for r in results) else 0)
