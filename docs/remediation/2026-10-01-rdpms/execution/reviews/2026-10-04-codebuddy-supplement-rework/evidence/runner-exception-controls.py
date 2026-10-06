"""Safe frozen-runner controls: ALL subprocesses simulated; no DB server starts.

Only newly owned temporary files and this review directory are writable.
Frozen executor runner is evaluated unchanged via runpy.
"""
import contextlib
import io
import json
import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch

ROOT = pathlib.Path.cwd()
EVIDENCE = pathlib.Path(__file__).resolve().parent
RUNNER = ROOT / 'docs/remediation/2026-10-01-rdpms/execution/supplements/test-contract-rework-2026-10-03-cb1/run-suite.py'
DIST = ROOT / 'rdpms-system/backend/dist'
assert not DIST.exists(), 'Do not run controls alongside an owned build or adopt unknown dist'
real_mkdtemp = tempfile.mkdtemp
real_rmtree = shutil.rmtree
real_write = pathlib.Path.write_text
summaries = []

for mode in ['build-timeout', 'suite-spawn-exception', 'result-write-exception']:
    target = EVIDENCE / 'runner-exception-controls' / mode
    target.mkdir(parents=True, exist_ok=False)
    owned = set()
    invoked = []

    def mkdtemp(*args, **kwargs):
        result = real_mkdtemp(*args, **kwargs)
        owned.add(pathlib.Path(result).resolve())
        return result

    def safe_rmtree(p, *args, **kwargs):
        candidate = pathlib.Path(p).resolve()
        if candidate not in owned:
            raise RuntimeError('Control refuses to remove any nonowned resource: ' + str(candidate))
        return real_rmtree(candidate, *args, **kwargs)

    def fake_run(argv, **kwargs):
        invoked.append(list(argv))
        if argv == ['npm', 'run', 'build'] and mode == 'build-timeout':
            raise subprocess.TimeoutExpired(argv, 0.001)
        if argv[:2] == ['node', '--test'] and mode == 'suite-spawn-exception':
            raise FileNotFoundError('injected primary suite spawn failure')
        text = ''
        status = 0
        if argv == ['node', 'scripts/test-db.mjs', 'check']:
            db = kwargs['env']['DATABASE_URL'].rsplit('/', 1)[1].split('?', 1)[0]
            text = '/' + db + ' 127.0.0.1 运行角色不可用'
            status = 2
        return subprocess.CompletedProcess(argv, status, text, '')

    def controlled_write(p, *args, **kwargs):
        if p.name == 'run-results.json' and mode == 'result-write-exception':
            raise OSError('injected result persistence failure')
        return real_write(p, *args, **kwargs)

    output = io.StringIO()
    code = None
    escaped = None
    with patch.object(sys, 'argv', [str(RUNNER), str(target), 'tests/integration/rp10-report-submit-snapshot.integration.test.mjs']), \
         patch('subprocess.run', side_effect=fake_run), \
         patch('tempfile.mkdtemp', side_effect=mkdtemp), \
         patch('shutil.rmtree', side_effect=safe_rmtree), \
         patch.object(pathlib.Path, 'write_text', controlled_write), \
         contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
        try:
            runpy.run_path(str(RUNNER), run_name='__main__')
        except SystemExit as exc:
            code = exc.code
        except BaseException as exc:
            escaped = {'type': type(exc).__name__, 'message': str(exc)}
    (target / 'control-output.log').write_text(output.getvalue())
    result_files = list(target.glob('attempt-*/run-results.json'))
    result = json.loads(result_files[0].read_text()) if result_files else None
    remaining = [str(p) for p in owned if p.exists()]
    summary = {
        'kind': 'SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED',
        'mode': mode,
        'realDatabaseOrServerAccess': False,
        'actualDatabaseTestAcceptance': 'NOT_EVALUATED',
        'observedExitCode': code,
        'escapedException': escaped,
        'expectedExitCode': 'nonzero',
        'runResultsWritten': bool(result_files),
        'criticalFailures': result.get('criticalFailures') if result else None,
        'exitReason': result.get('exitReason') if result else None,
        'cleanup': result.get('cleanup') if result else None,
        'commandsInvoked': invoked,
        'ownedTempRootsRemaining': remaining,
        'distExistsAfter': DIST.exists(),
    }
    (target / 'control-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    summaries.append(summary)
    assert not remaining, 'Do not hide leaked owned control resources'
    assert not DIST.exists(), 'Control did not create a build output'

(EVIDENCE / 'runner-exception-controls.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2) + '\n')
print(json.dumps([{k: s[k] for k in ['mode', 'observedExitCode', 'runResultsWritten', 'criticalFailures', 'exitReason', 'ownedTempRootsRemaining']} for s in summaries], ensure_ascii=False, indent=2))
