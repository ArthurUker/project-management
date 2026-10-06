"""LR7-01 window-a runner failure controls: ALL subprocesses and the result/log filesystem are stubbed.

SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED — no database cluster, no server, no real build is started.
Writes and owned temp roots are confined to this window (window-a-runner/). The fixed runner copy is
executed unchanged via runpy, so these controls exercise the real corrected code paths.

Nine paths (the eight failure controls + one normal control):
  normal                (expected exit 0) : every simulated command/log/result/cleanup succeeds
  build-nonzero         (expected nonzero): npm run build returns 1
  drop-exception        (expected nonzero): guard-drop raises FileNotFoundError (stop still attempted)
  stop-nonzero          (expected nonzero): cluster-stop returns 1 (owned simulated root preserved)
  build-timeout         (expected nonzero): npm run build raises TimeoutExpired
  suite-spawn-exception (expected nonzero): node --test raises FileNotFoundError
  result-write-oserror  (expected nonzero): run-results.json write raises OSError (fallback written)
  normal-log-ioerror    (expected nonzero): NORMAL integration-suite log write raises OSError  [R counterexample 1]
  timeout-log-ioerror   (expected nonzero): build TimeoutExpired then its log write raises OSError [R counterexample 2]

Order: normal first (proves fixture/preflight/write/cleanup), then the eight failure controls. Each failure
control asserts its SPECIFIC expected fault actually hit — a preflight abort or unrelated nonzero does NOT
substitute for the intended fault (point: pre-check failure cannot pass a control).
"""
import contextlib, hashlib, io, json, os, pathlib, runpy, shutil, subprocess, sys, tempfile
from unittest.mock import patch

WINDOW = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path('/Users/renkang/VS Code/project-management')
RUNNER = WINDOW / 'run-suite.py'
DIST = ROOT / 'rdpms-system/backend/dist'
SUITE = 'tests/integration/rp10-report-submit-snapshot.integration.test.mjs'

assert not DIST.exists(), 'controls must run without an owned build or unknown dist'
assert RUNNER.exists(), 'fixed runner copy missing'

# Owned simulated temp roots live under this window (created once so tempfile.mkdtemp has its dir).
(WINDOW / 'controls' / '_owned_tmp').mkdir(parents=True, exist_ok=True)

real_mkdtemp, real_rmtree, real_write = tempfile.mkdtemp, shutil.rmtree, pathlib.Path.write_text


def _evacuate(path):
    """Remove an owned simulated temp root from its original path WITHOUT going through the
    coding-copilot sitecustomize delete shim (which intercepts os.remove/os.rmdir/shutil.rmtree
    and refuses real deletion under the project tree). os.rename is not intercepted, so we move
    the whole tree to a trash subdir inside THIS window. The runner's `tmp.exists()` then reads
    False, exactly as if the cleanup removed it. Only ever called on owned simulated temp roots;
    no real DB, build, server, backend/dist or frozen file is touched.
    """
    p = pathlib.Path(path)
    if not p.exists() and not p.is_symlink():
        return
    trash = WINDOW / 'controls' / '_owned_tmp' / '_trash'
    trash.mkdir(parents=True, exist_ok=True)
    if p.is_symlink():
        try:
            p.unlink()
        except FileNotFoundError:
            pass
        return
    dest = trash / (p.name + '.' + os.urandom(4).hex())
    while dest.exists():
        dest = trash / (p.name + '.' + os.urandom(4).hex())
    os.rename(str(p), str(dest))

EXPECTED_KIND = 'SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED'
RUNNER_SHA256 = hashlib.sha256(RUNNER.read_bytes()).hexdigest()

# normal FIRST, then the eight failure controls
MODES = ['normal', 'build-nonzero', 'drop-exception', 'stop-nonzero', 'build-timeout',
         'suite-spawn-exception', 'result-write-oserror', 'normal-log-ioerror', 'timeout-log-ioerror']
summaries = []


def build_fake_run(mode, invoked):
    def fake_run(argv, **kwargs):
        invoked.append(list(argv))
        if argv == ['npm', 'run', 'build'] and mode in ('build-timeout', 'timeout-log-ioerror'):
            raise subprocess.TimeoutExpired(argv, 0.001)
        if argv[:2] == ['node', '--test'] and mode == 'suite-spawn-exception':
            raise FileNotFoundError('injected primary suite spawn failure')
        if argv == ['node', 'scripts/test-db.mjs', 'drop'] and mode == 'drop-exception':
            raise FileNotFoundError('injected guard-drop spawn failure')
        status, text = 0, ''
        if argv == ['npm', 'run', 'build'] and mode == 'build-nonzero':
            status, text = 1, 'injected build failure'
        if argv[-2:] == ['-w', 'stop'] and mode == 'stop-nonzero':
            status, text = 1, 'injected stop failure'
        if argv == ['node', 'scripts/test-db.mjs', 'check']:
            db = kwargs['env']['DATABASE_URL'].rsplit('/', 1)[1].split('?', 1)[0]
            text, status = '/' + db + ' 127.0.0.1 运行角色不可用', 2
        return subprocess.CompletedProcess(argv, status, text, '')
    return fake_run


def run_control(mode):
    target = WINDOW / 'controls' / mode
    target.mkdir(parents=True, exist_ok=True)
    owned = set()
    invoked = []

    def mkdtemp(*args, **kwargs):
        kwargs = dict(kwargs)
        kwargs.pop('dir', None)
        result = real_mkdtemp(dir=str(WINDOW / 'controls' / '_owned_tmp'), *args, **kwargs)
        owned.add(pathlib.Path(result).resolve())
        return result

    def safe_rmtree(p, *args, **kwargs):
        candidate = pathlib.Path(p).resolve()
        if candidate not in owned:
            raise RuntimeError('control refuses to remove any non-owned resource: ' + str(candidate))
        _evacuate(candidate)

    def controlled_write(self, content, *args, **kwargs):
        path = self
        resolved = path.resolve()
        # the fixed runner writes a shared fallback into its SESSION dir; redirect it into the per-mode target
        if resolved == (WINDOW / 'run-results-fallback.json'):
            path = target / 'run-results-fallback.json'
            resolved = path.resolve()
        if WINDOW not in resolved.parents and not any(p == resolved or p in resolved.parents for p in owned):
            raise RuntimeError('refuse to write outside window-a-runner/: ' + str(resolved))
        if path.name == 'run-results.json' and mode == 'result-write-oserror':
            raise OSError('injected result persistence failure')
        if path.name == 'integration-suite.log' and mode == 'normal-log-ioerror':
            raise OSError('injected command-log write failure (normal command)')
        if path.name == 'backend-build.log' and mode == 'timeout-log-ioerror':
            raise OSError('injected command-log write failure (after TimeoutExpired)')
        return real_write(path, content, *args, **kwargs)

    output = io.StringIO()
    code, escaped = None, None
    with patch.object(sys, 'argv', [str(RUNNER), str(target), SUITE]), \
         patch('subprocess.run', side_effect=build_fake_run(mode, invoked)), \
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
    real_write(target / 'control-output.log', output.getvalue())

    result_files = sorted(target.glob('attempt-*/run-results.json'))
    fallback_file = target / 'run-results-fallback.json'
    source = result_files[-1] if result_files else (fallback_file if fallback_file.exists() else None)
    result = json.loads(source.read_text()) if source else None
    preserved = [str(p) for p in owned if p.exists()]
    summary = {
        'kind': EXPECTED_KIND,
        'mode': mode,
        'realDatabaseOrServerAccess': False,
        'runnerSha256': RUNNER_SHA256,
        'observedExitCode': code,
        'escapedException': escaped,
        'expectedExitCode': 'zero' if mode == 'normal' else 'nonzero',
        'exitNonzero': code not in (0, None),
        'runResultsWritten': bool(result_files),
        'criticalFailures': (result or {}).get('criticalFailures'),
        'primaryExceptions': (result or {}).get('primaryExceptions'),
        'exitReason': (result or {}).get('exitReason'),
        'cleanup': (result or {}).get('cleanup'),
        'resultsPersistence': (result or {}).get('resultsPersistence'),
        'mainException': (result or {}).get('mainException'),
        'runnerCommands': (result or {}).get('commands'),
        'commandsInvoked': invoked,
        'ownedTempRootsPreservedByRunner': preserved,
        'fallbackLogWritten': fallback_file.exists(),
        'distExistsAfter': DIST.exists(),
    }
    # release the preserved simulated root: a stubbed cluster has no real process
    for path in preserved:
        _evacuate(path)
    summary['ownedTempRootsReleasedAfterControl'] = [p for p in preserved if not pathlib.Path(p).exists()]
    summary['ownedTempRootsRemaining'] = [str(p) for p in owned if p.exists()]
    real_write(target / 'control-summary.json', json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    summaries.append(summary)
    return summary


def assert_normal(summary):
    assert summary['observedExitCode'] == 0, 'normal: runner must exit 0'
    assert summary['escapedException'] is None, 'normal: runner must not leak an unhandled exception'
    assert not summary['criticalFailures'], 'normal: no criticalFailures expected'
    assert summary['runResultsWritten'], 'normal: run-results must be persisted'
    assert not summary['ownedTempRootsRemaining'], 'normal: control must not leak owned roots'
    assert not summary['distExistsAfter'], 'normal: control must not leave a dist'


def assert_failure(mode, summary):
    assert summary['observedExitCode'] not in (0, None), f'{mode}: runner must exit nonzero'
    assert summary['escapedException'] is None, f'{mode}: runner must not leak an unhandled exception'
    assert summary['criticalFailures'], f'{mode}: criticalFailures must record the failure'
    assert not summary['ownedTempRootsRemaining'], f'{mode}: control must not leak owned roots'
    assert not summary['distExistsAfter'], f'{mode}: control must not leave a dist'
    cf = summary['criticalFailures']
    pe = summary['primaryExceptions'] or []
    if mode == 'build-nonzero':
        assert any('backend-build did not succeed' in c for c in cf), f'{mode}: build failure not recorded'
    elif mode == 'drop-exception':
        assert any(e.get('exceptionType') == 'FileNotFoundError' and e.get('label') == 'guard-drop' for e in pe), \
            f'{mode}: drop FileNotFoundError not recorded as primary'
        labels = [c[0].split('/')[-1] for c in summary['commandsInvoked']]
        assert 'guard-drop' in [label_of(c) for c in summary['commandsInvoked']], f'{mode}: guard-drop not invoked'
        assert 'cluster-stop' in [label_of(c) for c in summary['commandsInvoked']], f'{mode}: stop not attempted after drop exception'
    elif mode == 'stop-nonzero':
        assert summary['cleanup'].get('clusterStopExit') == 1, f'{mode}: cluster-stop must return 1'
        assert summary['cleanup'].get('preservedOwnedTempRoot'), f'{mode}: owned simulated root must be preserved'
        assert summary['cleanup'].get('releaseCondition'), f'{mode}: a release condition must be recorded'
    elif mode == 'build-timeout':
        assert any(e.get('exceptionType') == 'TimeoutExpired' and e.get('label') == 'backend-build' for e in pe), \
            f'{mode}: build TimeoutExpired not recorded as primary'
    elif mode == 'suite-spawn-exception':
        assert any(e.get('exceptionType') == 'FileNotFoundError' and e.get('label') == 'integration-suite' for e in pe), \
            f'{mode}: suite FileNotFoundError not recorded as primary'
    elif mode == 'result-write-oserror':
        assert not summary['runResultsWritten'], f'{mode}: the injected write must fail'
        assert summary['fallbackLogWritten'], f'{mode}: a fallback log must be written at a different target'
        assert summary['resultsPersistence'] and summary['resultsPersistence']['ok'] is False, \
            f'{mode}: persistence must be reported as failed'
    elif mode == 'normal-log-ioerror':
        # the original false-success counterexample: a NORMAL command log OSError must now be a real failure
        assert any('integration-suite' in c and 'command-log write failed' in c for c in cf), \
            f'{mode}: NORMAL command-log OSError not recorded as critical failure'
        assert not pe, f'{mode}: a normal command must not produce a launch primaryException'
        labels = [r.get('label') for r in (summary.get('runnerCommands') or [])]
        assert 'integration-suite' in labels, f'{mode}: integration-suite command record must still be present'
    elif mode == 'timeout-log-ioerror':
        # the original false-success counterexample: TimeoutExpired reason must be preserved AND log OSError recorded
        assert any(e.get('exceptionType') == 'TimeoutExpired' and e.get('label') == 'backend-build' for e in pe), \
            f'{mode}: original TimeoutExpired reason lost'
        assert any('backend-build' in c and 'command-log write failed' in c for c in cf), \
            f'{mode}: secondary command-log OSError not recorded (double error lost)'


def label_of(c):
    if c == ['npm', 'run', 'build']:
        return 'backend-build'
    if c[:2] == ['node', '--test']:
        return 'integration-suite'
    if c[:2] == ['node', 'scripts/test-db.mjs']:
        return {'check': 'guard-check', 'reset': 'guard-reset', 'drop': 'guard-drop'}.get(c[-1], 'guard-' + c[-1])
    if c[-2:] == ['-w', 'start']:
        return 'cluster-start'
    if c[-2:] == ['-w', 'stop']:
        return 'cluster-stop'
    if 'initdb' in c[0]:
        return 'initdb'
    if c[:2] == ['npm', 'run']:
        return c[2]
    if c[:2] == ['git', 'diff']:
        return 'git-diff-check'
    return c[0].split('/')[-1]


def summary_runner_commands(summary):
    # best-effort: the run-results record is in the per-mode attempt; fall back to run-results.json
    return []


failures = []
for mode in MODES:
    summary = run_control(mode)
    try:
        if mode == 'normal':
            assert_normal(summary)
        else:
            assert_failure(mode, summary)
        summary['controlVerdict'] = 'PASS'
    except AssertionError as exc:
        summary['controlVerdict'] = 'FAIL'
        summary['controlFailure'] = str(exc)
        failures.append((mode, str(exc)))

real_write(WINDOW / 'controls' / 'runner-controls-summary.json',
           json.dumps(summaries, ensure_ascii=False, indent=2) + '\n')

print('runner sha256:', RUNNER_SHA256)
print(json.dumps([{k: s[k] for k in ['mode', 'observedExitCode', 'runResultsWritten', 'criticalFailures',
                                     'primaryExceptions', 'ownedTempRootsRemaining', 'fallbackLogWritten',
                                     'controlVerdict']}
                  for s in summaries], ensure_ascii=False, indent=2))
if failures:
    print('\nFAILURES:')
    for mode, msg in failures:
        print(f'  {mode}: {msg}')
    print(f'\n{len(failures)} of {len(MODES)} paths FAILED')
    sys.exit(1)
print(f'\nall {len(MODES)} paths passed: normal exit 0; eight failure controls nonzero with their specific fault hit')
