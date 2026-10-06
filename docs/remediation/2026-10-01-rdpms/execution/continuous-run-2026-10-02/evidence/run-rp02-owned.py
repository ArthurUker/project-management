"""Run only RP02-T01 acceptance against a fresh reviewer/executor-owned DB."""
import json, os, pathlib, secrets, shutil, socket, subprocess, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[6]
BACKEND = ROOT / 'rdpms-system/backend'
BASE_OUT = pathlib.Path(__file__).resolve().parent
existing_attempts = [int(p.name.split('-')[-1]) for p in BASE_OUT.glob('attempt-*') if p.name.split('-')[-1].isdigit()]
OUT = BASE_OUT / f'attempt-{max(existing_attempts, default=0) + 1:02d}'
OUT.mkdir()
DIST = BACKEND / 'dist'
assert not DIST.exists(), 'Refuse to replace a pre-existing backend/dist.'

temp_root = pathlib.Path(tempfile.mkdtemp(prefix='rdpms-exec-rp02-'))
secrets_for_redaction = [secrets.token_hex(24), secrets.token_hex(24), secrets.token_hex(32)]
records = []
started = False
build_owned = False

def clean(data):
    for secret in secrets_for_redaction:
        data = data.replace(secret, '<redacted-test-secret>')
    return data

def run(label, argv, cwd=BACKEND, timeout=120):
    result = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    output = clean(result.stdout + result.stderr)
    (OUT / f'{label}.log').write_text(output)
    records.append({'label': label, 'command': argv, 'exitCode': result.returncode, 'log': f'{label}.log'})
    print(label, 'exit=' + str(result.returncode), flush=True)
    return result

try:
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    db_name = 'rdpms_test_rp02_exec_' + secrets.token_hex(5)
    pg_role = 'rdpms_exec'
    url = f'postgresql://{pg_role}@127.0.0.1:{port}/{db_name}?schema=public'
    private_env_file = temp_root / 'test.env'
    private_env_file.write_text('\n'.join([
        f'DATABASE_URL={url}', f'DIRECT_URL={url}',
        f'RDPMS_TEST_ADMIN_URL=postgresql://{pg_role}@127.0.0.1:{port}/postgres',
        f'JWT_SECRET={secrets_for_redaction[2]}',
        f'SEED_SUPER_ADMIN_PASSWORD={secrets_for_redaction[0]}Aa1!',
        f'SEED_ADMIN_PASSWORD={secrets_for_redaction[1]}Aa1!',
        f'UPLOAD_DIR={temp_root}/uploads', 'NODE_ENV=test', 'JWT_ACCESS_TTL=15m',
    ]) + '\n')
    private_env_file.chmod(0o600)
    env = os.environ.copy()
    for line in private_env_file.read_text().splitlines():
        key, value = line.split('=', 1)
        env[key] = value
    env['RDPMS_TEST_ENV_FILE'] = str(private_env_file)
    env['RDPMS_EXEC_OWNED_DB'] = db_name
    env['RDPMS_EXEC_OWNED_PORT'] = str(port)
    env['PATH'] = str(ROOT / 'rdpms-system/frontend/node_modules/.bin') + os.pathsep + env['PATH']
    env.pop('NODE_OPTIONS', None)
    env.pop('NODE_PATH', None)
    (temp_root / 'socket').mkdir()
    (temp_root / 'uploads').mkdir()

    assert run('initdb', ['/opt/homebrew/bin/initdb', '-D', str(temp_root / 'pg'), '-U', pg_role, '--auth=trust'], cwd=ROOT).returncode == 0
    assert run('cluster-start', ['/opt/homebrew/bin/pg_ctl', '-D', str(temp_root / 'pg'), '-l', str(temp_root / 'postgres.log'), '-o', f'-h 127.0.0.1 -p {port} -k {temp_root}/socket', '-w', 'start'], cwd=ROOT).returncode == 0
    started = True
    guard_check = run('guard-check', ['node', 'scripts/test-db.mjs', 'check'])
    # A new empty database is expected to fail the guard's app-role connectivity
    # check before reset. Confirm the target is our localhost DB and that the
    # only reported blocker is the pre-reset role/schema readiness.
    assert guard_check.returncode == 2
    guard_text = guard_check.stdout + guard_check.stderr
    assert f'/{db_name}' in guard_text and '127.0.0.1' in guard_text
    assert '运行角色不可用' in guard_text
    reset = run('guard-reset', ['node', 'scripts/test-db.mjs', 'reset'])
    assert reset.returncode == 0
    build_owned = True
    build = run('backend-build', ['npm', 'run', 'build'])
    assert build.returncode == 0
    test = run('rp02-login-lock-ttl', ['node', '--test', 'tests/integration/rp02-login-lock-ttl.integration.test.mjs'])
finally:
    cleanup = {}
    if started:
        cleanup['guardDropExit'] = run('guard-drop', ['node', 'scripts/test-db.mjs', 'drop']).returncode
        cleanup['clusterStopExit'] = run('cluster-stop', ['/opt/homebrew/bin/pg_ctl', '-D', str(temp_root / 'pg'), '-m', 'fast', '-w', 'stop'], cwd=ROOT).returncode
    if build_owned and DIST.exists():
        shutil.rmtree(DIST)
    cleanup['ownedDistRemoved'] = not DIST.exists()
    shutil.rmtree(temp_root)
    cleanup['ownedTempRootRemoved'] = not temp_root.exists()
    (OUT / 'run-results.json').write_text(json.dumps({
        'date': '2026-10-02', 'taskId': 'RP02-T01', 'database': locals().get('db_name'),
        'port': locals().get('port'), 'bindHost': '127.0.0.1', 'ownerRole': locals().get('pg_role'),
        'dotenv': 'new private mode-0600 temp env only; real repo dotenv files not read',
        'compiler': 'existing frontend TypeScript 5.9.3 on PATH; no dependency operation',
        'commands': records, 'cleanup': cleanup,
    }, ensure_ascii=False, indent=2) + '\n')
