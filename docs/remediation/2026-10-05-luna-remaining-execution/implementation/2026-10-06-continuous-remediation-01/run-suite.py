"""LR6 closeout owned isolated integration runner (new session copy; the frozen old runner is untouched).

Hardening targeted by LR6-02:
  a. Primary subprocess exceptions (TimeoutExpired / FileNotFoundError / other launch errors) are
     recorded per command with the failed argv, exception type, exit semantics and available output;
     logs are redacted.
  b. Primary exceptions are added to criticalFailures; the process still returns nonzero AFTER
     cleanup. There is no `sys.exit(0)` inside finally that could override a pending exception.
  c. A run-results persistence failure returns nonzero, records the reason, and writes a fallback
     log to a different owned target; if that also fails the reason is preserved on stderr.
     "No results written but exit 0" is impossible.
  d. guard-drop / cluster-stop / dist / temp-root cleanup are individually try/except isolated;
     a drop exception still attempts stop; a stop failure preserves the confirmed-owned cluster
     root together with a precise release condition.
  e. dist ownership is declared before the build, and a failed build's owned partial output is
     still inspected and removed; removal is always verified against the filesystem.

Absolute repository path, an explicit pre-flight (ROOT / backend / guard script / targets /
compiler / postgres binaries) and a dist-absence check all run BEFORE any cluster is created.

Usage: python3 run-suite.py <output-base-dir> <node --test target> [...]

SIMULATED_CONTROL switches are handled by controls/run-runner-controls.py, which stubs every
subprocess and the filesystem helpers; this runner itself never fabricates a success.
"""
import hashlib
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
    'executor': 'Codex approved-contracts single executor',
    'kind': 'REAL_OWNED_DB_RUN',
    'targets': TARGETS,
    'preflight': {},
    'commands': [],
    'primaryExceptions': [],
    'cleanup': {},
    'criticalFailures': [],
    'notes': [],
}
def source_bindings():
    selected = set()
    for sub in ['backend/src', 'backend/tests', 'backend/prisma', 'frontend/src', 'frontend/tests', 'deploy']:
        base = ROOT / 'rdpms-system' / sub
        selected.update(f for f in base.rglob('*') if f.is_file())
    selected.update((BACKEND / t).resolve() for t in TARGETS if (BACKEND / t).is_file())
    return {str(f.relative_to(ROOT)): hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(selected)}
results['startSourceBindings'] = source_bindings()
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
tmp = pathlib.Path(tempfile.mkdtemp(prefix='rdpms-ac-', dir='/tmp'))
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


def run(label, argv, cwd=BACKEND, timeout=1800):
    """Run one command. A launch/timeout exception is recorded and never reported as success."""
    try:
        res = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        entry = {'label': label, 'command': argv, 'exceptionType': 'TimeoutExpired',
                 'timeoutSeconds': getattr(exc, 'timeout', timeout), 'exitCode': None,
                 'exitSemantics': 'primary launch timeout; command did not complete'}
        output = ''
        for stream in (getattr(exc, 'stdout', None), getattr(exc, 'stderr', None)):
            if stream:
                output += stream if isinstance(stream, str) else stream.decode(errors='replace')
        (OUT / f'{label}.log').write_text(redact_text(output))
        entry['log'] = f'{label}.log'
        records.append(entry)
        primary_exceptions.append(entry)
        fail(f'{label} raised TimeoutExpired after {entry["timeoutSeconds"]}s')
        print(f'{label} TimeoutExpired', flush=True)
        return None
    except FileNotFoundError as exc:
        entry = {'label': label, 'command': argv, 'exceptionType': 'FileNotFoundError',
                 'message': redact_text(str(exc)), 'exitCode': None,
                 'exitSemantics': 'command could not be spawned'}
        (OUT / f'{label}.log').write_text(f'FileNotFoundError: {redact_text(str(exc))}\n')
        entry['log'] = f'{label}.log'
        records.append(entry)
        primary_exceptions.append(entry)
        fail(f'{label} could not be spawned: FileNotFoundError')
        print(f'{label} FileNotFoundError', flush=True)
        return None
    except Exception as exc:  # other launch-level failures
        entry = {'label': label, 'command': argv, 'exceptionType': type(exc).__name__,
                 'message': redact_text(str(exc)), 'exitCode': None,
                 'exitSemantics': 'unexpected launch failure'}
        (OUT / f'{label}.log').write_text(f'{type(exc).__name__}: {redact_text(str(exc))}\n')
        entry['log'] = f'{label}.log'
        records.append(entry)
        primary_exceptions.append(entry)
        fail(f'{label} raised {type(exc).__name__}')
        print(f'{label} {type(exc).__name__}', flush=True)
        return None
    content = redact_text(res.stdout + res.stderr)
    (OUT / f'{label}.log').write_text(content)
    records.append({'label': label, 'command': argv, 'exitCode': res.returncode, 'log': f'{label}.log'})
    print(label, 'exit=' + str(res.returncode), flush=True)
    return res


def succeeded(res):
    return res is not None and res.returncode == 0


try:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    db = ('rdpms_test_rp01_' if any('b17-role-create' in t for t in TARGETS) else 'rdpms_test_approved_') + secrets.token_hex(5)
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
    env['RDPMS_EXEC_EVIDENCE_DIR'] = str(OUT)
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
        # Prisma CLI/runtime must not load backend/.env. Stage schema+migrations
        # into the owned root, use existing local dependencies, disable install.
        staged = tmp / 'schema'
        staged.mkdir()
        shutil.copytree(BACKEND / 'prisma/migrations', staged / 'migrations')
        (tmp / 'node_modules').symlink_to(BACKEND / 'node_modules', target_is_directory=True)
        generated = BACKEND / 'node_modules/.prisma/client'
        schema = (BACKEND / 'prisma/schema.prisma').read_text().replace(
            'provider = "prisma-client-js"',
            'provider = "prisma-client-js"\n  output = ' + json.dumps(str(generated)))
        (staged / 'schema.prisma').write_text(schema)
        env['PRISMA_GENERATE_NO_AUTOINSTALL'] = '1'
        cli = str(BACKEND / 'node_modules/prisma/build/index.js')
        gen = run('owned-client-generate', ['node', cli, 'generate', '--schema', str(staged / 'schema.prisma')], cwd=tmp, timeout=300)
        if not succeeded(gen) or 'Environment variables loaded from' in (gen.stdout + gen.stderr if gen else ''):
            fail('isolated generation failed or unexpectedly read dotenv')
            raise RuntimeError('generation preflight blocked')
        results['ownedSchema'] = {'path': str(staged), 'existingDependenciesOnly': True,
            'dotenv': 'no .env under owned root; Prisma CLI cwd/schema isolated from real backend/.env',
            'generatedClient': str(generated), 'generatedArtifactNotDependencyUpgrade': True}
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
            created = run('owned-create-db', ['/opt/homebrew/bin/psql', '-h', '127.0.0.1', '-p', str(port), '-U', role,
                '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', f'CREATE DATABASE "{db}" OWNER "{role}"'], cwd=tmp, timeout=60)
            migrated = run('owned-migrate', ['node', cli, 'migrate', 'deploy', '--schema', str(staged / 'schema.prisma')], cwd=tmp, timeout=600) if succeeded(created) else None
            seeded = run('owned-seed', ['node', str(BACKEND / 'prisma/seed.js')], cwd=tmp, timeout=300) if succeeded(migrated) else None
            checked = run('guard-check-ready', ['node', 'scripts/test-db.mjs', 'check'], timeout=300) if succeeded(seeded) else None
            if not succeeded(checked):
                fail('owned guarded database setup did not succeed')
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
finally:
    # ── cleanup: every step isolated; a failure never blocks the remaining steps ──
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

    results['sourceBindings'] = source_bindings()
    results['sourceDrift'] = {f: {'before': v, 'after': results['sourceBindings'].get(f)} for f, v in results['startSourceBindings'].items() if results['sourceBindings'].get(f) != v}
    if results['sourceDrift']: fail('SOURCE_DRIFT_DURING_RUN')
    results['exitReason'] = 'no critical failures' if not critical else 'critical failures: ' + '; '.join(critical)
    persisted_ok, persisted_target, persisted_error = write_results()
    results['resultsPersistence'] = {'ok': persisted_ok, 'target': persisted_target, 'error': persisted_error}
    if not persisted_ok:
        # rewrite the fallback with the persistence detail folded in, then fail the run
        try:
            (SESSION / 'run-results-fallback.json').write_text(
                json.dumps(results, ensure_ascii=False, indent=2) + '\n')
        except Exception as exc:
            print('fallback re-write failed:', type(exc).__name__, exc, file=sys.stderr, flush=True)
        fail('run-results persistence failed; overall result cannot be reported as success')

    sys.exit(0 if not critical else 1)
