"""Run a bounded current-candidate review in a new, reviewer-owned PostgreSQL cluster.
Uses the existing frontend TypeScript compiler; never installs dependencies or loads real env files.
"""
import json, os, secrets, socket, subprocess, tempfile, shutil, pathlib, time, sys
ROOT = pathlib.Path(__file__).resolve().parents[7]
BACKEND = ROOT / 'rdpms-system/backend'
SOURCE_OUT = pathlib.Path(__file__).resolve().parent
OUT = SOURCE_OUT / 'supplemental-run' if '--supplemental-only' in sys.argv else SOURCE_OUT
OUT.mkdir(exist_ok=True)
dist = BACKEND / 'dist'
assert not dist.exists(), 'Refuse to replace an existing dist directory'
tmp = pathlib.Path(tempfile.mkdtemp(prefix='rdpms-luna-review-'))
env = os.environ.copy()
secret_values = [secrets.token_hex(24), secrets.token_hex(24), secrets.token_hex(32)]
records = []
started = False
build_owned = False
def clean(text):
    import re
    for s in secret_values: text = text.replace(s, '<redacted-test-secret>')
    return re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '<redacted-test-jwt>', text)
def run(label, argv, timeout=60, cwd=BACKEND):
    proc = subprocess.run(argv,cwd=cwd,env=env,text=True,capture_output=True,timeout=timeout)
    (OUT/(label+'.log')).write_text(clean(proc.stdout+proc.stderr))
    records.append({'label':label,'command':argv,'exitCode':proc.returncode,'log':label+'.log'})
    print(label, 'exit='+str(proc.returncode),flush=True)
    return proc.returncode
try:
    env['LC_ALL']='C'
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
    db='rdpms_test_rp01_review_'+secrets.token_hex(4)
    role='rdpms_review'
    url=f'postgresql://{role}@127.0.0.1:{port}/{db}?schema=public'
    private=tmp/'test.env'
    private.write_text('\n'.join([f'DATABASE_URL={url}',f'DIRECT_URL={url}',f'RDPMS_TEST_ADMIN_URL=postgresql://{role}@127.0.0.1:{port}/postgres',f'JWT_SECRET={secret_values[2]}',f'SEED_SUPER_ADMIN_PASSWORD={secret_values[0]}Aa1!',f'SEED_ADMIN_PASSWORD={secret_values[1]}Aa1!',f'UPLOAD_DIR={tmp}/uploads','NODE_ENV=test','JWT_ACCESS_TTL=15m']))
    private.chmod(0o600)
    for line in private.read_text().splitlines():
        k,v=line.split('=',1);env[k]=v
    env['RDPMS_TEST_ENV_FILE']=str(private)
    env['REVIEW_OWNED_DATABASE']=db;env['REVIEW_OWNED_PORT']=str(port)
    env['PATH']=str(ROOT/'rdpms-system/frontend/node_modules/.bin')+os.pathsep+env['PATH']
    (tmp/'socket').mkdir();(tmp/'uploads').mkdir()
    assert run('initdb',['/opt/homebrew/bin/initdb','-D',str(tmp/'pg'),'-U',role,'--auth=trust'],cwd=ROOT)==0
    assert run('cluster-start',['/opt/homebrew/bin/pg_ctl','-D',str(tmp/'pg'),'-l',str(tmp/'postgres.log'),'-o',f'-h 127.0.0.1 -p {port} -k {tmp}/socket','-w','start'],cwd=ROOT)==0
    started=True
    assert run('guarded-reset',['node','scripts/test-db.mjs','reset'],timeout=90)==0
    build_owned=True
    assert run('backend-build',['npm','run','build'])==0
    baseline_auth=subprocess.check_output(['git','show','HEAD:rdpms-system/backend/src/routes/auth.js'],cwd=ROOT,text=True)
    (dist/'routes/auth.baseline-review.js').write_text(baseline_auth)
    suites=[] if '--supplemental-only' in sys.argv else ['b17-role-create','rp02-login-lock-ttl','rp04-project-snapshot-active','rp04-project-create-aggregate','rp05-parent-delete-guard','rp07-project-status-shared','rp13-stable-pull-pagination','rp14-infected-file-read']
    for name in suites:
        run(name,['node','--test',f'tests/integration/{name}.integration.test.mjs'],timeout=60)
    run('route-spotchecks',['node',str(SOURCE_OUT/'route-spotchecks.mjs'),str(BACKEND),'--supplemental'],timeout=60)
finally:
    cleanup={}
    if started:
        cleanup['guardedDatabaseDropExit']=run('guarded-drop',['node','scripts/test-db.mjs','drop'])
        cleanup['clusterStopExit']=run('cluster-stop',['/opt/homebrew/bin/pg_ctl','-D',str(tmp/'pg'),'-m','fast','-w','stop'],cwd=ROOT)
    if build_owned and dist.exists():shutil.rmtree(dist)
    cleanup['ownedDistRemoved']=not dist.exists()
    shutil.rmtree(tmp)
    cleanup['ownedTempRootRemoved']=not tmp.exists()
    (OUT/'validation-results.json').write_text(json.dumps({'asOf':'2026-10-02','originalBaseline':'138cf2da1b63195cef7e884f69bdf8ded6ed3c21','compiler':'existing frontend TypeScript 5.9.3','database':locals().get('db'),'bindHost':'127.0.0.1','port':locals().get('port'),'databaseOwnerRole':'rdpms_review','dotenv':'private temp file only; real env files not read','commands':records,'cleanup':cleanup},ensure_ascii=False,indent=2)+'\n')
