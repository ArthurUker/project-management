# Independent verification copy; frozen executor runner is unchanged.
# Changes only ensure this reviewer does not inherit primary-exception suppression.
"""Owned isolated integration runner — 2026-10-03 SUP rework session.

LR5-05 hardening relative to the frozen old runner (execution/supplements/
test-contract-2026-10-03/run-suite.py), which is never modified:

  1. Pre-flight validation of ROOT / backend / target test / DB-guard script /
     compiler binaries happens BEFORE any cluster is created.
  2. backend/dist ownership is declared BEFORE the build starts (the old runner
     set `built` only after a successful build, so a failed build's output was
     not guaranteed to be inspected/removed).
  3. Every cleanup step (guard-drop, cluster-stop, dist removal, temp-root
     removal) is isolated: an exception or non-zero exit in one step never
     prevents the remaining steps or the results write.
  4. run-results.json is always written, including when initdb/cluster-start
     fail; the file records precise commands, exit codes, errors and ownership.
  5. Cleanup failures and required check failures affect the aggregate exit
     code; `suite exit 0` alone can never produce an overall PASS.
  6. guard-check exit 2 before reset is the documented guard contract and is
     recorded as a success precondition, not as a business failure.
  7. If cluster-stop fails, the owned temp root is preserved and a release
     condition is recorded; a running cluster's root is never deleted.

Usage: python3 run-suite.py <output-base-dir> <node --test target> [...]

Simulation switches (control runs only; always labelled SIMULATED_CONTROL):
  RDPMS_SIM_BUILD_FAIL=1   build command exits non-zero
  RDPMS_SIM_DROP_RAISE=1   guard-drop command raises before returning
  RDPMS_SIM_DROP_NONZERO=1 guard-drop command exits non-zero
  RDPMS_SIM_STOP_FAIL=1    cluster-stop command exits non-zero
  RDPMS_SIM_SKIP_SUITE=1   skip the real suite to keep the control run short
  RDPMS_SIM_SKIP_BUILD=1   skip the real backend build to keep the control run short
"""
import json, os, pathlib, secrets, shutil, socket, subprocess, sys, tempfile

SESSION = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path('/Users/renkang/VS Code/project-management')
BACKEND = ROOT / 'rdpms-system' / 'backend'
FRONTEND_BIN = ROOT / 'rdpms-system' / 'frontend' / 'node_modules' / '.bin'
DIST = BACKEND / 'dist'

BASE_OUT = pathlib.Path(sys.argv[1]).resolve()
TARGETS = sys.argv[2:]
if not TARGETS:
    sys.exit('at least one node --test target is required')
BASE_OUT.mkdir(parents=True, exist_ok=True)
numbers = [int(p.name.split('-')[-1]) for p in BASE_OUT.glob('attempt-*') if p.name.split('-')[-1].isdigit()]
OUT = BASE_OUT / f'attempt-{max(numbers, default=0) + 1:02d}'
OUT.mkdir()

SIM = {
    'buildFail': os.environ.get('RDPMS_SIM_BUILD_FAIL') == '1',
    'dropRaise': os.environ.get('RDPMS_SIM_DROP_RAISE') == '1',
    'dropNonZero': os.environ.get('RDPMS_SIM_DROP_NONZERO') == '1',
    'stopFail': os.environ.get('RDPMS_SIM_STOP_FAIL') == '1',
    'skipSuite': os.environ.get('RDPMS_SIM_SKIP_SUITE') == '1',
    'skipBuild': os.environ.get('RDPMS_SIM_SKIP_BUILD') == '1',
}
simulated = any(SIM.values())

if any(SIM.values()):
    sys.exit('Independent real-DB reruns refuse inherited simulation flags')

results = {
    'sessionId': SESSION.name,
    'executor': 'Codex independent reviewer 2026-10-04',
    'kind': 'SIMULATED_CONTROL' if simulated else 'REAL_OWNED_DB_RUN',
    'simulation': SIM if simulated else None,
    'targets': TARGETS,
    'preflight': {},
    'commands': [],
    'cleanup': {},
    'criticalFailures': [],
    'notes': [],
}
records = results['commands']
cleanup = results['cleanup']
critical = results['criticalFailures']


def write_results():
    """Always persist results; a failure here is itself recorded, never fatal."""
    try:
        (OUT / 'run-results.json').write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + '\n')
        return True
    except Exception as exc:  # pragma: no cover - defensive
        print('RESULT WRITE FAILED', type(exc).__name__, exc, flush=True)
        return False


def fail(reason):
    critical.append(reason)
    print('CRITICAL:', reason, flush=True)


# ── 1. pre-flight validation before creating any cluster ─────────────────────
pre = results['preflight']
pre['ROOT'] = str(ROOT)
pre['BACKEND'] = str(BACKEND)
pre['backendExists'] = BACKEND.is_dir()
pre['guardScriptExists'] = (BACKEND / 'scripts/test-db.mjs').is_file()
pre['compilerTsc'] = str(FRONTEND_BIN / 'tsc')
pre['compilerExists'] = (FRONTEND_BIN / 'tsc').exists()
pre['initdbBinary'] = '/opt/homebrew/bin/initdb'
pre['initdbExists'] = pathlib.Path('/opt/homebrew/bin/initdb').exists()
pre['pgCtlBinary'] = '/opt/homebrew/bin/pg_ctl'
pre['pgCtlExists'] = pathlib.Path('/opt/homebrew/bin/pg_ctl').exists()
pre['distExistsAtStart'] = DIST.exists()
pre['targetsExist'] = {t: (BACKEND / t).is_file() for t in TARGETS}

if not (pre['backendExists'] and pre['guardScriptExists'] and pre['compilerExists']
        and pre['initdbExists'] and pre['pgCtlExists']):
    fail('pre-flight validation failed; no cluster was created')
    pre['verdict'] = 'ABORTED'
    write_results()
    sys.exit(1)
if DIST.exists():
    fail('backend/dist exists before start with unknown ownership; refusing to adopt it')
    pre['verdict'] = 'ABORTED'
    write_results()
    sys.exit(1)
for target, ok in pre['targetsExist'].items():
    if not ok:
        fail(f'target test file not found: {target}')
if critical:
    pre['verdict'] = 'ABORTED'
    write_results()
    sys.exit(1)
pre['verdict'] = 'OK'

# ── 2. owned resources ──────────────────────────────────────────────────────
tmp = pathlib.Path(tempfile.mkdtemp(prefix='rdpms-rework-'))
redact = [secrets.token_hex(24), secrets.token_hex(24), secrets.token_hex(32)]
db = None
port = None
started = False
env = None

# build-output ownership is declared before the build ever runs
build_ownership = {
    'path': str(DIST),
    'preExistingAtStart': False,
    'ownershipDeclaredBeforeBuild': True,
    'owner': SESSION.name,
}
results['buildOutputOwnership'] = build_ownership


def run(label, argv, cwd=BACKEND, timeout=1800):
    res = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    content = (res.stdout + res.stderr)
    for secret in redact:
        content = content.replace(secret, '<redacted-test-secret>')
    (OUT / f'{label}.log').write_text(content)
    records.append({'label': label, 'command': argv, 'exitCode': res.returncode, 'log': f'{label}.log'})
    print(label, 'exit=' + str(res.returncode), flush=True)
    return res


try:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    db = 'rdpms_test_rework_' + secrets.token_hex(5)
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

    initdb = run('initdb', ['/opt/homebrew/bin/initdb', '-D', str(tmp / 'pg'), '-U', role, '--auth=trust'],
                 cwd=ROOT, timeout=300)
    if initdb.returncode != 0:
        fail('initdb failed')
    else:
        start = run('cluster-start', ['/opt/homebrew/bin/pg_ctl', '-D', str(tmp / 'pg'), '-l',
                                      str(tmp / 'postgres.log'), '-o',
                                      f'-h 127.0.0.1 -p {port} -k {tmp}/socket', '-w', 'start'],
                    cwd=ROOT, timeout=300)
        started = start.returncode == 0
        if not started:
            fail('cluster-start failed')

    if started:
        check = run('guard-check', ['node', 'scripts/test-db.mjs', 'check'], timeout=300)
        text = check.stdout + check.stderr
        guard_ok = (check.returncode == 2 and f'/{db}' in text and '127.0.0.1' in text
                    and '运行角色不可用' in text)
        results['guardContract'] = {
            'expectedExitCodeBeforeReset': 2,
            'actualExitCode': check.returncode,
            'markersFound': {'db': f'/{db}' in text, 'host': '127.0.0.1' in text,
                             'roleUnavailable': '运行角色不可用' in text},
            'verdict': 'GUARD_CONTRACT_OK' if guard_ok else 'GUARD_CONTRACT_UNEXPECTED',
            'meaning': 'exit 2 before reset is the documented guard contract, not a business failure',
        }
        if not guard_ok:
            fail('guard-check contract not satisfied (expected exit 2 with owned db/host markers)')
        else:
            reset = run('guard-reset', ['node', 'scripts/test-db.mjs', 'reset'], timeout=600)
            if reset.returncode != 0:
                fail('guard-reset failed')
            else:
                if SIM['skipBuild']:
                    results['notes'].append('backend build skipped by simulation switch')
                else:
                    build_argv = (['node', '-e', 'process.exit(1)'] if SIM['buildFail']
                                  else ['npm', 'run', 'build'])
                    build = run('backend-build', build_argv, timeout=900)
                    if build.returncode != 0:
                        fail('backend-build failed')
                if SIM['skipSuite']:
                    results['notes'].append('suite skipped by simulation switch')
                else:
                    suite = run('integration-suite', ['node', '--test', *TARGETS])
                    if suite.returncode != 0:
                        fail('integration-suite failed')
                for label, argv, cwd in (
                        ('backend-typecheck', ['npm', 'run', 'typecheck'], BACKEND),
                        ('undefined-check', ['npm', 'run', 'lint:undefined'], BACKEND),
                        ('git-diff-check', ['git', 'diff', '--check'], ROOT)):
                    res = run(label, argv, cwd=cwd, timeout=900)
                    if res.returncode != 0:
                        fail(f'{label} failed')
except Exception as exc:
    message = str(exc)
    for secret in redact:
        message = message.replace(secret, '<redacted-test-secret>')
    fail('primary execution exception: ' + type(exc).__name__ + ': ' + message)
    results['primaryException'] = {'type': type(exc).__name__, 'message': message}
finally:
    # ── 3. cleanup: every step isolated, results always written ──────────────
    if started:
        drop_argv = ['node', 'scripts/test-db.mjs', 'drop']
        if SIM['dropRaise']:
            drop_argv = [str(tmp / 'missing-drop-binary')]
        elif SIM['dropNonZero']:
            drop_argv = ['node', '-e', 'process.exit(3)']
        try:
            cleanup['guardDropExit'] = run('guard-drop', drop_argv, timeout=300).returncode
        except Exception as exc:
            cleanup['guardDropError'] = f'{type(exc).__name__}: {exc}'
            print('guard-drop raised', type(exc).__name__, flush=True)
        if cleanup.get('guardDropExit') not in (0, None) or 'guardDropError' in cleanup:
            fail('guard-drop cleanup failed')
    else:
        cleanup['guardDropSkipped'] = 'cluster never started'

    if started or (tmp / 'pg/postmaster.pid').exists():
        stop_argv = (['node', '-e', 'process.exit(1)'] if SIM['stopFail']
                     else ['/opt/homebrew/bin/pg_ctl', '-D', str(tmp / 'pg'), '-m', 'fast', '-w', 'stop'])
        try:
            cleanup['clusterStopExit'] = run('cluster-stop', stop_argv, cwd=ROOT, timeout=300).returncode
        except Exception as exc:
            cleanup['clusterStopError'] = f'{type(exc).__name__}: {exc}'
            print('cluster-stop raised', type(exc).__name__, flush=True)
        if cleanup.get('clusterStopExit') != 0 or 'clusterStopError' in cleanup:
            fail('cluster-stop cleanup failed')

    # dist: owned because it was absent at start; remove regardless of build outcome.
    # The removal result is always verified against the filesystem, so a transient
    # rmtree error cannot masquerade as "not removed" when the path is verifiably gone.
    try:
        if DIST.exists():
            shutil.rmtree(DIST)
    except Exception as exc:
        cleanup['ownedDistError'] = f'{type(exc).__name__}: {exc}'
    finally:
        cleanup['ownedDistRemoved'] = not DIST.exists()
    if not cleanup.get('ownedDistRemoved', False):
        fail('owned backend/dist was not removed')

    stop_ok = (cleanup.get('clusterStopExit') == 0) and 'clusterStopError' not in cleanup
    if stop_ok:
        try:
            shutil.rmtree(tmp)
        except Exception as exc:
            cleanup['ownedTempRootError'] = f'{type(exc).__name__}: {exc}'
        cleanup['ownedTempRootRemoved'] = not tmp.exists()
        if not cleanup['ownedTempRootRemoved']:
            fail('owned temp root was not removed')
    else:
        cleanup['ownedTempRootRemoved'] = False
        cleanup['preservedOwnedTempRoot'] = str(tmp)
        cleanup['releaseCondition'] = ('cluster-stop did not succeed; the owned temp root is preserved '
                                       'on purpose. Release: run pg_ctl -D <root>/pg -m fast -w stop, '
                                       'then remove the root. Never delete a root with a running cluster.')
        fail('cluster-stop failed, owned temp root preserved (release condition recorded)')

    cleanup['ownershipVerification'] = {
        'ownedDatabase': db,
        'ownedPort': port,
        'ownedTempRoot': str(tmp),
        'rootExistsAfterCleanup': tmp.exists(),
        'postmasterPidExists': (tmp / 'pg/postmaster.pid').exists(),
        'distExistsAfterCleanup': DIST.exists(),
        'note': 'ownership is asserted from the owned db/port/root recorded above, not from a global process scan',
    }

    results['exitReason'] = 'no critical failures' if not critical else 'critical failures: ' + '; '.join(critical)
    if not write_results():
        fail('result persistence failed')

sys.exit(0 if not critical else 1)
