"""LR7-01 corrected isolated integration runner (window-a fix copy).

This is a NEW tool copy owned by parallel window A. It is a corrected variant of the
LR6 closeout runner (docs/remediation/2026-10-01-rdpms/execution/supplements/lr6-closeout-2026-10-04-cb1/run-suite.py).

What LR7-01 fixes (the two false-success (kind=SIMULATED_CONTROL) counterexamples in
R/evidence/runner-log-failure-controls.json proved the old runner exited 0 with empty
criticalFailures when a command-log write raised OSError):

  a. NORMAL command-log write OSError is now recorded as a criticalFailure (point 2).
     Before the fix, the OSError propagated out of run() into the finally block, which
     did `sys.exit(0 if not critical else 1)` and exited 0 with no criticalFailure.
  b. PRIMARY exception-log write OSError (TimeoutExpired / FileNotFoundError) no longer
     loses the original reason (point 2). The primary entry, primaryExceptions record and
     primary fail() are registered BEFORE the (now isolated) log write, so a second OSError
     is appended as a separate criticalFailure and the original exception type stays readable.
  c. Outer try/except/cleanup split: finally ONLY cleans up; result persistence and the final
     nonzero decision happen AFTER the finally block, so a successful SystemExit in finally can
     no longer override a pending main-execution exception (point 3).
  d. Each cleanup step (guard-drop / cluster-stop / dist / temp-root) is independently isolated;
     a stop failure preserves the confirmed-owned simulated root with an explicit release condition
     (point 4). STOP control keeps the simulated root only after confirming no real process owns it.
  e. Real mode is interface-only this round: every control stubs all subprocesses and confines
     writes/temp to this window. No real DB, build, server, JWT, IDB, browser or UI runs.

SIMULATED_CONTROL switches are exercised by window-a-runner/runner-controls.py, which stubs every
subprocess and the filesystem helpers; this runner itself never fabricates a success.
"""
import json, os, pathlib, secrets, shutil, socket, subprocess, sys, tempfile

ROOT = pathlib.Path(os.environ.get('RDPMS_ROOT', '/Users/renkang/VS Code/project-management')).resolve()
SESSION = pathlib.Path(__file__).resolve().parent
BACKEND = ROOT / 'rdpms-system' / 'backend'
FRONTEND_BIN = ROOT / 'rdpms-system' / 'frontend' / 'node_modules' / '.bin'
DIST = BACKEND / 'dist'
INITDB = '/opt/homebrew/bin/initdb'
PGCTL = '/opt/homebrew/bin/pg_ctl'

BASE_OUT = pathlib.Path(sys.argv[1]).resolve()
TARGETS = sys.argv[2:]
if not TARGETS:
    print('at least one node --test target is required', file=sys.stderr)
    sys.exit(2)
BASE_OUT.mkdir(parents=True, exist_ok=True)
numbers = [int(p.name.split('-')[-1]) for p in BASE_OUT.glob('attempt-*') if p.name.split('-')[-1].isdigit()]
OUT = BASE_OUT / f'attempt-{max(numbers, default=0) + 1:02d}'
OUT.mkdir(parents=True, exist_ok=True)

results = {
    'sessionId': SESSION.name,
    'executor': 'CodeBuddy (LR7-01 window-a fix copy)',
    'kind': 'SIMULATED_CONTROL_RUNNER_FIX_COPY',
    'targets': TARGETS,
    'preflight': {},
    'commands': [],
    'primaryExceptions': [],
    'cleanup': {},
    'criticalFailures': [],
    'notes': [],
}
records = results['commands']
cleanup = results['cleanup']
critical = results['criticalFailures']
primary_exceptions = results['primaryExceptions']


def fail(reason):
    if reason not in critical:
        critical.append(reason)
    print('CRITICAL:', reason, flush=True)


def write_results(target=None):
    """Persist results; never report success when persistence fails."""
    path = target or (OUT / 'run-results.json')
    try:
        path.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
        return True, str(path), None
    except Exception as exc:
        detail = f'{type(exc).__name__}: {exc}'
        fail(f'run-results write failed at {path}: {detail}')
        fallback = SESSION / 'run-results-fallback.json'
        try:
            fallback.write_text(json.dumps({
                'kind': results['kind'], 'targets': TARGETS,
                'failedResultsTarget': str(path), 'writeError': detail,
                'criticalFailures': critical, 'commands': records,
                'note': 'fallback persistence because the primary run-results write failed',
            }, ensure_ascii=False, indent=2) + '\n')
            results['notes'].append(f'fallback results written to {fallback}')
            return False, str(fallback), detail
        except Exception as exc2:
            detail2 = f'{type(exc2).__name__}: {exc2}'
            print(f'FALLBACK WRITE FAILED for {path} ({detail}); fallback error: {detail2}',
                  file=sys.stderr, flush=True)
            return False, None, f'{detail} | fallback failed: {detail2}'


# ── pre-flight (real paths only; no cluster yet) ────────────────────────────
pre = results['preflight']
pre.update({
    'ROOT': str(ROOT),
    'ROOTexists': ROOT.is_dir(),
    'gitDirExists': (ROOT / '.git').exists(),
    'BACKEND': str(BACKEND),
    'backendExists': BACKEND.is_dir(),
    'guardScriptExists': (BACKEND / 'scripts/test-db.mjs').is_file(),
    'compilerPath': str(FRONTEND_BIN / 'tsc'),
    'compilerExists': (FRONTEND_BIN / 'tsc').exists(),
    'initdbPath': INITDB, 'initdbExists': pathlib.Path(INITDB).exists(),
    'pgCtlPath': PGCTL, 'pgCtlExists': pathlib.Path(PGCTL).exists(),
    'distExistsAtStart': DIST.exists(),
    'targetsExist': {t: (BACKEND / t).is_file() for t in TARGETS},
})
missing = [k for k in ['ROOTexists', 'gitDirExists', 'backendExists', 'guardScriptExists',
                       'compilerExists', 'initdbExists', 'pgCtlExists'] if not pre[k]]
if missing:
    fail(f'pre-flight failed: {missing}; no cluster was created')
    pre['verdict'] = 'ABORTED'
    write_results()
    sys.exit(1)
if DIST.exists():
    fail('backend/dist exists before start with unknown ownership; refusing to adopt it')
    pre['verdict'] = 'ABORTED'
    write_results()
    sys.exit(1)
bad_targets = [t for t, ok in pre['targetsExist'].items() if not ok]
if bad_targets:
    fail(f'target test file(s) not found: {bad_targets}')
    pre['verdict'] = 'ABORTED'
    write_results()
    sys.exit(1)
pre['verdict'] = 'OK'


# ── owned resources ────────────────────────────────────────────────────────
tmp = pathlib.Path(tempfile.mkdtemp(prefix='rdpms-lr7-'))
redact = [secrets.token_hex(24), secrets.token_hex(24), secrets.token_hex(32)]
db = None
port = None
started = False
env = None
build_ownership = {'path': str(DIST), 'preExistingAtStart': False,
                   'ownershipDeclaredBeforeBuild': True, 'owner': SESSION.name}
results['buildOutputOwnership'] = build_ownership


def redact_text(content):
    for secret in redact:
        content = content.replace(secret, '<redacted-test-secret>')
    return content


def _register_primary(label, entry):
    """Point 1/2: register the command failure and primary exception BEFORE any failable log write."""
    entry['log'] = f'{label}.log'
    records.append(entry)
    primary_exceptions.append(entry)
    fail(f'{label} raised {entry.get("exceptionType", "exception")}')


def _safe_log_write(label, path, content, primary_reason=None):
    """Point 2: a log write failure must never lose the already-registered primary reason; it is
    recorded as an independent criticalFailure and echoed to stderr (no fake success)."""
    try:
        path.write_text(content)
    except OSError as exc:
        detail = f'{type(exc).__name__}: {exc}'
        if primary_reason is not None:
            fail(f'{label} command-log write failed after primary failure ({primary_reason}): {detail}')
            print(f'DOUBLE ERROR: {label} primary={primary_reason}; command-log OSError={detail}',
                  file=sys.stderr, flush=True)
        else:
            fail(f'{label} command-log write failed: {detail}')
            print(f'COMMAND LOG WRITE OSError for {label}: {detail}', file=sys.stderr, flush=True)


def run(label, argv, cwd=BACKEND, timeout=1800):
    """Run one command. A launch/timeout exception is recorded and never reported as success.

    LR7-01: every log write is isolated so an OSError extends (never replaces) the recorded failure.
    """
    try:
        res = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        entry = {'label': label, 'command': argv, 'exceptionType': 'TimeoutExpired',
                 'timeoutSeconds': getattr(exc, 'timeout', timeout), 'exitCode': None,
                 'exitSemantics': 'primary launch timeout; command did not complete'}
        out = ''
        for stream in (getattr(exc, 'stdout', None), getattr(exc, 'stderr', None)):
            if stream:
                out += stream if isinstance(stream, str) else stream.decode(errors='replace')
        _register_primary(label, entry)
        _safe_log_write(label, OUT / f'{label}.log', redact_text(out),
                        primary_reason=f'TimeoutExpired after {entry["timeoutSeconds"]}s')
        print(f'{label} TimeoutExpired', flush=True)
        return None
    except FileNotFoundError as exc:
        entry = {'label': label, 'command': argv, 'exceptionType': 'FileNotFoundError',
                 'message': redact_text(str(exc)), 'exitCode': None,
                 'exitSemantics': 'command could not be spawned'}
        _register_primary(label, entry)
        _safe_log_write(label, OUT / f'{label}.log', f'FileNotFoundError: {redact_text(str(exc))}\n',
                        primary_reason='FileNotFoundError')
        print(f'{label} FileNotFoundError', flush=True)
        return None
    except Exception as exc:  # other launch-level failures
        entry = {'label': label, 'command': argv, 'exceptionType': type(exc).__name__,
                 'message': redact_text(str(exc)), 'exitCode': None,
                 'exitSemantics': 'unexpected launch failure'}
        _register_primary(label, entry)
        _safe_log_write(label, OUT / f'{label}.log', f'{type(exc).__name__}: {redact_text(str(exc))}\n',
                        primary_reason=type(exc).__name__)
        print(f'{label} {type(exc).__name__}', flush=True)
        return None
    content = redact_text(res.stdout + res.stderr)
    records.append({'label': label, 'command': argv, 'exitCode': res.returncode, 'log': f'{label}.log'})
    _safe_log_write(label, OUT / f'{label}.log', content)  # normal command: OSError becomes a criticalFailure
    print(label, 'exit=' + str(res.returncode), flush=True)
    return res


def succeeded(res):
    return res is not None and res.returncode == 0


# ── main execution (may raise; caught by outer except) ──────────────────────
main_exception = None
try:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    db = 'rdpms_test_lr7_' + secrets.token_hex(5)
    role = 'rdpms_exec'
    url = f'postgresql://{role}@127.0.0.1:{port}/{db}?schema=public'
    envfile = tmp / 'test.env'
    envfile.write_text('\n'.join([
        f'DATABASE_URL={url}', f'DIRECT_URL={url}',
        f'RDPMS_TEST_ADMIN_URL=postgresql://{role}@127.0.0.1:{port}/postgres',
        f'JWT_SECRET={redact[2]}', f'SEED_SUPER_ADMIN_PASSWORD={redact[0]}Aa1!',
        f'SEED_ADMIN_PASSWORD={redact[1]}Aa1!', f'UPLOAD_DIR={tmp}/uploads',
        'NODE_ENV=test', 'JWT_ACCESS_TTL=15m',
    ]) + '\n')
    envfile.chmod(0o600)
    env = {k: v for k, v in os.environ.items()
           if k in {'PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'SHELL'}}
    for line in envfile.read_text().splitlines():
        k, v = line.split('=', 1)
        env[k] = v
    env['RDPMS_TEST_ENV_FILE'] = str(envfile)
    env['RDPMS_EXEC_OWNED_DB'] = db
    env['RDPMS_EXEC_OWNED_PORT'] = str(port)
    env['PATH'] = str(FRONTEND_BIN) + os.pathsep + env['PATH']
    env.pop('NODE_OPTIONS', None)
    env.pop('NODE_PATH', None)
    (tmp / 'socket').mkdir()
    (tmp / 'uploads').mkdir()
    results['ownedResources'] = {
        'database': db, 'port': port, 'bindHost': '127.0.0.1', 'ownerRole': role,
        'tempRoot': str(tmp), 'envFileMode': '0600',
        'dotenv': 'new private env file only; repository dotenv files never read',
        'compiler': 'existing frontend TypeScript via PATH; no install/upgrade',
    }

    if not succeeded(run('initdb', [INITDB, '-D', str(tmp / 'pg'), '-U', role, '--auth=trust'],
                        cwd=ROOT, timeout=300)):
        fail('initdb did not succeed')
    else:
        start = run('cluster-start', [PGCTL, '-D', str(tmp / 'pg'), '-l', str(tmp / 'postgres.log'), '-o',
                                      f'-h 127.0.0.1 -p {port} -k {tmp}/socket', '-w', 'start'],
                    cwd=ROOT, timeout=300)
        started = succeeded(start)
        if not started:
            fail('cluster-start did not succeed')

    if started:
        check = run('guard-check', ['node', 'scripts/test-db.mjs', 'check'], timeout=300)
        text = '' if check is None else (check.stdout + check.stderr)
        guard_ok = succeeded_guard = (check is not None and check.returncode == 2
                                      and f'/{db}' in text and '127.0.0.1' in text
                                      and '运行角色不可用' in text)
        results['guardContract'] = {
            'expectedExitCodeBeforeReset': 2,
            'actualExitCode': None if check is None else check.returncode,
            'markersFound': {'db': f'/{db}' in text, 'host': '127.0.0.1' in text,
                             'roleUnavailable': '运行角色不可用' in text},
            'verdict': 'GUARD_CONTRACT_OK' if guard_ok else 'GUARD_CONTRACT_UNEXPECTED',
            'meaning': 'exit 2 before reset is the documented guard contract, not a business failure',
        }
        if not guard_ok:
            fail('guard-check contract not satisfied (expected exit 2 with owned db/host markers)')
        else:
            if not succeeded(run('guard-reset', ['node', 'scripts/test-db.mjs', 'reset'], timeout=600)):
                fail('guard-reset did not succeed')
            else:
                if not succeeded(run('backend-build', ['npm', 'run', 'build'], timeout=900)):
                    fail('backend-build did not succeed')
                else:
                    if not succeeded(run('integration-suite', ['node', '--test', *TARGETS], timeout=1800)):
                        fail('integration-suite did not succeed')
                for label, argv, cwd in (
                        ('backend-typecheck', ['npm', 'run', 'typecheck'], BACKEND),
                        ('undefined-check', ['npm', 'run', 'lint:undefined'], BACKEND),
                        ('git-diff-check', ['git', 'diff', '--check'], ROOT)):
                    if not succeeded(run(label, argv, cwd=cwd, timeout=900)):
                        fail(f'{label} did not succeed')
except BaseException as exc:  # point 3: capture a main-execution exception; do not exit here
    main_exception = exc
    fail(f'main execution raised {type(exc).__name__}: {exc}')
finally:
    # ── cleanup ONLY: every step isolated; a failure never blocks the remaining steps ──
    if started:
        try:
            drop = run('guard-drop', ['node', 'scripts/test-db.mjs', 'drop'], timeout=300)
            cleanup['guardDropExit'] = None if drop is None else drop.returncode
        except Exception as exc:
            cleanup['guardDropError'] = f'{type(exc).__name__}: {exc}'
        if cleanup.get('guardDropExit') != 0:
            fail('guard-drop cleanup did not succeed')
    else:
        cleanup['guardDropSkipped'] = 'cluster never started'

    if started or (tmp / 'pg/postmaster.pid').exists():
        try:
            stop = run('cluster-stop', [PGCTL, '-D', str(tmp / 'pg'), '-m', 'fast', '-w', 'stop'],
                       cwd=ROOT, timeout=300)
            cleanup['clusterStopExit'] = None if stop is None else stop.returncode
        except Exception as exc:
            cleanup['clusterStopError'] = f'{type(exc).__name__}: {exc}'
        if cleanup.get('clusterStopExit') != 0:
            fail('cluster-stop cleanup did not succeed')

    try:
        if DIST.exists():
            shutil.rmtree(DIST)
    except Exception as exc:
        cleanup['ownedDistError'] = f'{type(exc).__name__}: {exc}'
    finally:
        cleanup['ownedDistRemoved'] = not DIST.exists()
    if not cleanup.get('ownedDistRemoved', False):
        fail('owned backend/dist was not removed')

    stop_ok = cleanup.get('clusterStopExit') == 0
    if stop_ok:
        try:
            shutil.rmtree(tmp)
        except Exception as exc:
            cleanup['ownedTempRootError'] = f'{type(exc).__name__}: {exc}'
        cleanup['ownedTempRootRemoved'] = not tmp.exists()
        if not cleanup['ownedTempRootRemoved']:
            fail('owned temp root was not removed')
    else:
        # point 4: a failed stop preserves the confirmed-owned simulated root with a release condition
        cleanup['ownedTempRootRemoved'] = False
        cleanup['preservedOwnedTempRoot'] = str(tmp)
        cleanup['releaseCondition'] = ('cluster-stop did not succeed; the owned temp root is preserved on '
                                       'purpose. Release: run pg_ctl -D <root>/pg -m fast -w stop, then remove '
                                       'the root. Never delete a root whose cluster may still be running.')
        fail('cluster-stop failed, owned temp root preserved (release condition recorded)')

    cleanup['ownershipVerification'] = {
        'ownedDatabase': db, 'ownedPort': port, 'ownedTempRoot': str(tmp),
        'rootExistsAfterCleanup': tmp.exists(), 'postmasterPidExists': (tmp / 'pg/postmaster.pid').exists(),
        'distExistsAfterCleanup': DIST.exists(),
        'note': 'ownership is asserted from the owned db/port/root recorded above, not from a global process scan',
    }

# ── point 3: persistence and final nonzero decision happen AFTER cleanup ──
results['exitReason'] = 'no critical failures' if not critical else 'critical failures: ' + '; '.join(critical)
if main_exception is not None:
    results['mainException'] = {'type': type(main_exception).__name__, 'message': str(main_exception)}
persisted_ok, persisted_target, persisted_error = write_results()
results['resultsPersistence'] = {'ok': persisted_ok, 'target': persisted_target, 'error': persisted_error}
if not persisted_ok:
    try:
        (SESSION / 'run-results-fallback.json').write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    except Exception as exc:
        print('fallback re-write failed:', type(exc).__name__, exc, file=sys.stderr, flush=True)
    fail('run-results persistence failed; overall result cannot be reported as success')

sys.exit(0 if not critical else 1)
