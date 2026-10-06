"""Owned isolated integration runner for the SUP-01 / SUP-02 formal suites.

Ownership/isolation rules (mirrors prior executor/reviewer runs):
  * fresh initdb cluster in a fresh mkdtemp root, loopback-only port, role rdpms_exec
  * private mode-0600 env file only (repository dotenv files are never read)
  * test-db guard must confirm the destination before reset/drop
  * backend build uses the already-installed frontend TypeScript via PATH only
  * cleanup: guard drop -> cluster stop -> remove owned dist -> remove temp root

Usage: python3 run-suite.py <output-base-dir> <node --test target> [...]
"""
import json, os, pathlib, secrets, shutil, socket, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[6]
BACKEND = ROOT / 'rdpms-system' / 'backend'
BASE_OUT = pathlib.Path(sys.argv[1]).resolve()
TARGETS = sys.argv[2:]
if not TARGETS:
    sys.exit('at least one node --test target is required')
BASE_OUT.mkdir(parents=True, exist_ok=True)
numbers = [int(p.name.split('-')[-1]) for p in BASE_OUT.glob('attempt-*') if p.name.split('-')[-1].isdigit()]
OUT = BASE_OUT / f'attempt-{max(numbers, default=0) + 1:02d}'
OUT.mkdir()
DIST = BACKEND / 'dist'
assert not DIST.exists(), 'Refuse to replace a pre-existing backend/dist (ownership unknown).'
tmp = pathlib.Path(tempfile.mkdtemp(prefix='rdpms-tc3-suite-'))
redact = [secrets.token_hex(24), secrets.token_hex(24), secrets.token_hex(32)]
records, started, built, suite_result = [], False, False, None


def run(label, argv, cwd=BACKEND, timeout=900):
    res = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    content = (res.stdout + res.stderr)
    for secret in redact:
        content = content.replace(secret, '<redacted-test-secret>')
    (OUT / f'{label}.log').write_text(content)
    records.append({'label': label, 'command': argv, 'exitCode': res.returncode, 'log': f'{label}.log'})
    print(label, 'exit=' + str(res.returncode), flush=True)
    return res


db = None
port = None
try:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    db = 'rdpms_test_tc3_exec_' + secrets.token_hex(5)
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
    env = os.environ.copy()
    for line in envfile.read_text().splitlines():
        k, v = line.split('=', 1)
        env[k] = v
    env['RDPMS_TEST_ENV_FILE'] = str(envfile)
    env['RDPMS_EXEC_OWNED_DB'] = db
    env['RDPMS_EXEC_OWNED_PORT'] = str(port)
    env['PATH'] = str(ROOT / 'rdpms-system/frontend/node_modules/.bin') + os.pathsep + env['PATH']
    env.pop('NODE_OPTIONS', None)
    env.pop('NODE_PATH', None)
    (tmp / 'socket').mkdir()
    (tmp / 'uploads').mkdir()
    assert run('initdb', ['/opt/homebrew/bin/initdb', '-D', str(tmp / 'pg'), '-U', role, '--auth=trust'], cwd=ROOT).returncode == 0
    assert run('cluster-start', ['/opt/homebrew/bin/pg_ctl', '-D', str(tmp / 'pg'), '-l', str(tmp / 'postgres.log'),
                                 '-o', f'-h 127.0.0.1 -p {port} -k {tmp}/socket', '-w', 'start'], cwd=ROOT).returncode == 0
    started = True
    check = run('guard-check', ['node', 'scripts/test-db.mjs', 'check'])
    assert check.returncode == 2 and f'/{db}' in (check.stdout + check.stderr) and '127.0.0.1' in (check.stdout + check.stderr)
    assert run('guard-reset', ['node', 'scripts/test-db.mjs', 'reset']).returncode == 0
    assert run('backend-build', ['npm', 'run', 'build']).returncode == 0
    built = True
    suite_result = run('integration-suite', ['node', '--test', *TARGETS], timeout=1800)
finally:
    cleanup = {}
    if started:
        cleanup['guardDropExit'] = run('guard-drop', ['node', 'scripts/test-db.mjs', 'drop']).returncode
        cleanup['clusterStopExit'] = run('cluster-stop', ['/opt/homebrew/bin/pg_ctl', '-D', str(tmp / 'pg'), '-m', 'fast', '-w', 'stop'], cwd=ROOT).returncode
    if built and DIST.exists():
        shutil.rmtree(DIST)
    cleanup['ownedDistRemoved'] = not DIST.exists()
    shutil.rmtree(tmp, ignore_errors=True)
    cleanup['ownedTempRootRemoved'] = not tmp.exists()
    (OUT / 'run-results.json').write_text(json.dumps({
        'date': '2026-10-03-test-contract',
        'executor': 'CodeBuddy (session test-contract-2026-10-03)',
        'database': db,
        'port': port,
        'bindHost': '127.0.0.1',
        'ownerRole': 'rdpms_exec',
        'dotenv': 'new mode-0600 private environment only; repository dotenv files not read',
        'compiler': 'existing frontend TypeScript via PATH; no installation or upgrade',
        'targets': TARGETS,
        'commands': records,
        'cleanup': cleanup,
    }, ensure_ascii=False, indent=2) + '\n')
    sys.exit(suite_result.returncode if suite_result is not None else 1)
