"""Minimal independent controls. Every subprocess is stubbed; no DB/build is run.

The unchanged executor runner is copied into this new review directory. Writes
and cleanup are restricted to newly created review/control roots. This checks
whether a command-log exception can still be suppressed by finally sys.exit.
"""
import contextlib
import hashlib
import io
import json
import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch

ROOT = pathlib.Path('/Users/renkang/VS Code/project-management')
REVIEW = pathlib.Path(__file__).resolve().parent
ORIGINAL = ROOT / 'docs/remediation/2026-10-01-rdpms/execution/supplements/lr6-closeout-2026-10-04-cb1/run-suite.py'
TARGET = REVIEW / 'control-target-runner.py'
TARGET.write_bytes(ORIGINAL.read_bytes())
assert TARGET.read_bytes() == ORIGINAL.read_bytes()
assert not (ROOT / 'rdpms-system/backend/dist').exists()
real_write = pathlib.Path.write_text
real_mkdtemp = tempfile.mkdtemp
real_rmtree = shutil.rmtree
summaries = []

for mode in ['normal-log-ioerror', 'timeout-log-ioerror']:
    out = REVIEW / 'runner-log-controls' / mode
    out.mkdir(parents=True, exist_ok=False)
    owned = set()
    invoked = []
    injected = []

    def owned_mkdtemp(*args, **kwargs):
        kwargs['dir'] = str(out)
        value = real_mkdtemp(*args, **kwargs)
        owned.add(pathlib.Path(value).resolve())
        return value

    def owned_rmtree(path, *args, **kwargs):
        resolved = pathlib.Path(path).resolve()
        if resolved not in owned:
            raise RuntimeError('Refuse to remove a non-owned resource: ' + str(resolved))
        return real_rmtree(resolved, *args, **kwargs)

    def safe_write(path, *args, **kwargs):
        path = pathlib.Path(path)
        resolved = path.resolve()
        if REVIEW not in resolved.parents and not any(p in resolved.parents for p in owned):
            raise RuntimeError('Refuse to write outside independent owned control roots')
        rejected = 'integration-suite.log' if mode == 'normal-log-ioerror' else 'backend-build.log'
        if path.name == rejected:
            injected.append({'target': str(path), 'error': 'OSError: injected command-log write failure'})
            raise OSError('injected command-log write failure')
        return real_write(path, *args, **kwargs)

    def fake_run(argv, **kwargs):
        invoked.append(list(argv))
        if mode == 'timeout-log-ioerror' and argv == ['npm', 'run', 'build']:
            raise subprocess.TimeoutExpired(argv, 0.001, output='simulated partial output')
        status, output = 0, ''
        if argv == ['node', 'scripts/test-db.mjs', 'check']:
            db = kwargs['env']['DATABASE_URL'].rsplit('/', 1)[1].split('?', 1)[0]
            status, output = 2, '/' + db + ' 127.0.0.1 运行角色不可用'
        return subprocess.CompletedProcess(argv, status, output, '')

    captured = io.StringIO()
    exit_code, escaped = None, None
    with patch.object(sys, 'argv', [str(TARGET), str(out), 'tests/integration/rp10-report-submit-snapshot.integration.test.mjs']), \
            patch('subprocess.run', side_effect=fake_run), \
            patch('tempfile.mkdtemp', side_effect=owned_mkdtemp), \
            patch('shutil.rmtree', side_effect=owned_rmtree), \
            patch.object(pathlib.Path, 'write_text', safe_write), \
            contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
        try:
            runpy.run_path(str(TARGET), run_name='__main__')
        except SystemExit as exc:
            exit_code = exc.code
        except BaseException as exc:
            escaped = {'type': type(exc).__name__, 'message': str(exc)}
    real_write(out / 'control-output.log', captured.getvalue())
    result_file = next(out.glob('attempt-*/run-results.json'), None)
    result = json.loads(result_file.read_text()) if result_file else {}
    preserved = [str(p) for p in owned if p.exists()]
    for path in preserved:
        real_rmtree(path)  # All subprocesses stubbed: these roots have no real cluster.
    summary = {
        'kind': 'SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED',
        'mode': mode,
        'realDatabaseBuildOrServerAccess': False,
        'executorRunnerSha256': hashlib.sha256(ORIGINAL.read_bytes()).hexdigest(),
        'unchangedCopySha256': hashlib.sha256(TARGET.read_bytes()).hexdigest(),
        'injectedLogErrors': injected,
        'observedRunnerExitCode': exit_code,
        'escapedException': escaped,
        'criticalFailures': result.get('criticalFailures'),
        'primaryExceptions': result.get('primaryExceptions'),
        'exitReason': result.get('exitReason'),
        'cleanup': result.get('cleanup'),
        'commandsInvoked': invoked,
        'persistedCommandLabels': [x['label'] for x in result.get('commands', [])],
        'ownedRootsRemaining': [str(p) for p in owned if p.exists()],
        'falseSuccessObserved': bool(injected) and exit_code == 0 and not result.get('criticalFailures'),
    }
    real_write(out / 'control-summary.json', json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    summaries.append(summary)

real_write(REVIEW / 'runner-log-failure-controls.json', json.dumps(summaries, ensure_ascii=False, indent=2) + '\n')
for row in summaries:
    print(json.dumps({k: row[k] for k in ['mode', 'observedRunnerExitCode', 'criticalFailures',
                                         'primaryExceptions', 'falseSuccessObserved', 'ownedRootsRemaining']},
                     ensure_ascii=False))
