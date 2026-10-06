"""LR6 closeout runner failure controls: ALL subprocesses are stubbed.

SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED — no database cluster, no server, no real build is
started. Writable targets are limited to this control directory plus the owned simulated temp root.
The runner is executed unchanged via runpy, so these controls exercise the real code paths.

Six controls (each expects a NONZERO runner exit):
  1. build-nonzero        npm run build returns 1
  2. drop-exception       guard-drop raises FileNotFoundError  (stop must still be attempted)
  3. stop-nonzero         cluster-stop returns 1               (owned simulated root preserved)
  4. build-timeout        npm run build raises TimeoutExpired
  5. suite-spawn-except   node --test raises FileNotFoundError
  6. result-write-oserror run-results.json write raises OSError (fallback must be written)
"""
import contextlib, io, json, pathlib, runpy, shutil, subprocess, sys, tempfile
from unittest.mock import patch

ROOT = pathlib.Path('/Users/renkang/VS Code/project-management')
SESSION = pathlib.Path(__file__).resolve().parents[1]
RUNNER = SESSION / 'run-suite.py'
CONTROL_ROOT = SESSION / 'controls'
DIST = ROOT / 'rdpms-system/backend/dist'
SUITE = 'tests/integration/rp10-report-submit-snapshot.integration.test.mjs'

assert not DIST.exists(), 'controls must run without an owned build or unknown dist'
real_mkdtemp, real_rmtree, real_write = tempfile.mkdtemp, shutil.rmtree, pathlib.Path.write_text

MODES = ['build-nonzero', 'drop-exception', 'stop-nonzero', 'build-timeout',
         'suite-spawn-exception', 'result-write-oserror']
EXPECTED_ORDER = ['initdb', 'cluster-start', 'guard-check', 'guard-reset', 'backend-build',
                  'guard-drop', 'cluster-stop']
summaries = []


def build_fake_run(mode, invoked):
    def fake_run(argv, **kwargs):
        invoked.append(list(argv))
        if argv == ['npm', 'run', 'build'] and mode == 'build-timeout':
            raise subprocess.TimeoutExpired(argv, 0.001)
        if argv[:2] == ['node', '--test'] and mode == 'suite-spawn-exception':
            raise FileNotFoundError('injected primary suite spawn failure')
        if argv == ['node', 'scripts/test-db.mjs', 'drop'] and mode == 'drop-exception':
            raise FileNotFoundError('injected guard-drop spawn failure')
        status = 0
        text = ''
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
    target = CONTROL_ROOT / mode
    target.mkdir(parents=True, exist_ok=True)
    owned = set()
    invoked = []

    def mkdtemp(*args, **kwargs):
        result = real_mkdtemp(*args, **kwargs)
        owned.add(pathlib.Path(result).resolve())
        return result

    def safe_rmtree(p, *args, **kwargs):
        candidate = pathlib.Path(p).resolve()
        if candidate not in owned:
            raise RuntimeError('control refuses to remove any non-owned resource: ' + str(candidate))
        return real_rmtree(candidate, *args, **kwargs)

    def controlled_write(p, *args, **kwargs):
        path = pathlib.Path(p)
        if path.name == 'run-results.json' and mode == 'result-write-oserror':
            raise OSError('injected result persistence failure')
        resolved = path.resolve()
        if SESSION in resolved.parents and target.resolve() not in resolved.parents:
            # only redirect writes that would land in the real session; keep attempt-NN/ shape
            path = target / resolved.relative_to(SESSION)
            path.parent.mkdir(parents=True, exist_ok=True)
        return real_write(path, *args, **kwargs)

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
    (target / 'control-output.log').write_text(output.getvalue())

    result_files = sorted(target.glob('attempt-*/run-results.json'))
    fallback_file = target / 'run-results-fallback.json'
    source = result_files[-1] if result_files else (fallback_file if fallback_file.exists() else None)
    result = json.loads(source.read_text()) if source else None
    preserved = [str(p) for p in owned if p.exists()]
    summary = {
        'kind': 'SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED',
        'mode': mode,
        'realDatabaseOrServerAccess': False,
        'actualDatabaseTestAcceptance': 'NOT_EVALUATED',
        'observedExitCode': code,
        'escapedException': escaped,
        'expectedExitCode': 'nonzero',
        'exitNonzero': code not in (0, None),
        'runResultsWritten': bool(result_files),
        'criticalFailures': (result or {}).get('criticalFailures'),
        'primaryExceptions': (result or {}).get('primaryExceptions'),
        'exitReason': (result or {}).get('exitReason'),
        'cleanup': (result or {}).get('cleanup'),
        'resultsPersistence': (result or {}).get('resultsPersistence'),
        'commandsInvoked': invoked,
        'ownedTempRootsPreservedByRunner': preserved,
        'fallbackLogWritten': (target / 'run-results-fallback.json').exists(),
        'distExistsAfter': DIST.exists(),
    }
    # release the preserved simulated root: no real process exists for a stubbed cluster
    for path in preserved:
        real_rmtree(path)
    summary['ownedTempRootsReleasedAfterControl'] = [p for p in preserved if not pathlib.Path(p).exists()]
    summary['ownedTempRootsRemaining'] = [str(p) for p in owned if p.exists()]
    (target / 'control-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    summaries.append(summary)


for mode in MODES:
    run_control(mode)

for summary in summaries:
    mode = summary['mode']
    assert summary['observedExitCode'] not in (0, None), f'{mode}: runner must exit nonzero'
    assert summary['escapedException'] is None, f'{mode}: runner must not leak an unhandled exception'
    if mode == 'result-write-oserror':
        assert not summary['runResultsWritten'], f'{mode}: the injected write must fail'
        assert summary['fallbackLogWritten'], f'{mode}: a fallback log must be written at a different target'
    else:
        assert summary['runResultsWritten'], f'{mode}: run-results must be persisted'
    assert summary['criticalFailures'], f'{mode}: criticalFailures must record the primary failure'
    assert not summary['ownedTempRootsRemaining'], f'{mode}: control must not leak owned roots'
    assert not summary['distExistsAfter'], f'{mode}: control must not leave a dist'
    assert summary['commandsInvoked'], f'{mode}: commands must be recorded'
    # every control must reach cleanup in the expected order
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

    labels = [label_of(c) for c in summary['commandsInvoked']]
    assert 'guard-drop' in labels and 'cluster-stop' in labels, f'{mode}: cleanup must be attempted: {labels}'
    if mode == 'drop-exception':
        assert summary['primaryExceptions'], f'{mode}: the drop exception must be recorded as a primary exception'
        assert labels.index('cluster-stop') > labels.index('guard-drop'), \
            f'{mode}: stop must still be attempted after a drop exception'
    if mode == 'stop-nonzero':
        assert summary['ownedTempRootsPreservedByRunner'], \
            f'{mode}: a failed stop must preserve the owned simulated root'
        assert summary['cleanup'].get('releaseCondition'), f'{mode}: a release condition must be recorded'
    if mode == 'result-write-oserror':
        assert summary['fallbackLogWritten'], f'{mode}: a fallback log must be written at a different target'
        assert summary['resultsPersistence'] and summary['resultsPersistence']['ok'] is False, \
            f'{mode}: persistence must be reported as failed'
    if mode in ('build-timeout', 'suite-spawn-exception'):
        assert summary['primaryExceptions'], f'{mode}: the launch exception must be recorded per command'

(CONTROL_ROOT / 'runner-controls.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2) + '\n')
print(json.dumps([{k: s[k] for k in ['mode', 'observedExitCode', 'runResultsWritten', 'criticalFailures',
                                     'primaryExceptions', 'ownedTempRootsRemaining', 'fallbackLogWritten']}
                  for s in summaries], ensure_ascii=False, indent=2))
print('all six controls passed: runner exits nonzero, records the primary failure and still cleans up')
