from pathlib import Path
import subprocess,sys
s=Path(__file__).resolve().parent
for out,test in [('rp19-t03-calculator','tests/integration/rp19-release-gates.integration.test.mjs'),('final-regression/candidate-runtime','tests/integration/rp18-runtime-candidate.integration.test.mjs')]:
 r=subprocess.run([sys.executable,str(s/'run-suite.py'),str(s/'evidence'/out),test])
 if r.returncode:sys.exit(r.returncode)
