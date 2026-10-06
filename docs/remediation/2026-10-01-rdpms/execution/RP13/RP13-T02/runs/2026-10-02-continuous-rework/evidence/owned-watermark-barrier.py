import json, os, pathlib, secrets, select, shutil, socket, subprocess, tempfile, time

ROOT = pathlib.Path.cwd()
BACKEND = ROOT / 'rdpms-system/backend'
BASE_OUT = pathlib.Path(__file__).resolve().parent
tries = [int(p.name.split('-')[-1]) for p in BASE_OUT.glob('attempt-*') if p.name.split('-')[-1].isdigit()]
OUT = BASE_OUT / f"attempt-{max(tries, default=0) + 1:02d}"
OUT.mkdir()
psql_buffers = {}
TMP = pathlib.Path(tempfile.mkdtemp(prefix='rdpms-rp13-owned-'))
PORT = None
DB = 'rdpms_test_rp13_exec_' + secrets.token_hex(5)
ROLE = 'rdpms_exec'
URL = None
records = []
started = False
proc_env = os.environ.copy()

def run(label, argv, cwd=BACKEND, input_text=None, timeout=40):
    p = subprocess.run(argv, cwd=cwd, env=proc_env, input=input_text, text=True, capture_output=True, timeout=timeout)
    (OUT / f'{label}.log').write_text(p.stdout + p.stderr)
    records.append({'label': label, 'command': argv, 'exitCode': p.returncode, 'log': f'{label}.log'})
    if p.returncode != 0:
        raise RuntimeError(f'{label} failed: {(p.stdout+p.stderr)[-1000:]}')
    return p

def psql(sql, label):
    return run(label, ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', URL.replace('?schema=public','')], input_text=sql)

def start_session():
    return subprocess.Popen(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', URL.replace('?schema=public','')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)

def send(p, sql):
    p.stdin.write(sql + '\n'); p.stdin.flush()

def read_until(p, marker, timeout=8):
    fd=p.stdout.fileno(); data=psql_buffers.get(fd,''); deadline=time.time()+timeout
    while marker not in data and time.time()<deadline:
        ready,_,_=select.select([fd],[],[],max(0,deadline-time.time()))
        if not ready: break
        chunk=os.read(fd,4096).decode()
        if not chunk: break
        data += chunk
    if marker not in data:
        psql_buffers[fd]=data
        raise TimeoutError(f'psql marker not seen: {marker}; output={data.splitlines()}')
    before,after=data.split(marker,1)
    psql_buffers[fd]=after
    return before.splitlines()+[marker]

try:
    with socket.socket() as s:
        s.bind(('127.0.0.1',0)); PORT=s.getsockname()[1]
    URL=f'postgresql://{ROLE}@127.0.0.1:{PORT}/{DB}?schema=public'
    envfile=TMP/'test.env'
    envfile.write_text(f'DATABASE_URL={URL}\nDIRECT_URL={URL}\nRDPMS_TEST_ADMIN_URL=postgresql://{ROLE}@127.0.0.1:{PORT}/postgres\nJWT_SECRET={secrets.token_hex(32)}\nSEED_SUPER_ADMIN_PASSWORD={secrets.token_hex(16)}Aa1!\nSEED_ADMIN_PASSWORD={secrets.token_hex(16)}Aa1!\nUPLOAD_DIR={TMP}/uploads\nNODE_ENV=test\n')
    envfile.chmod(0o600)
    env=os.environ.copy(); env.update(dict(line.split('=',1) for line in envfile.read_text().splitlines())); proc_env.update(env)
    env.update({'RDPMS_TEST_ENV_FILE':str(envfile),'RDPMS_EXEC_OWNED_DB':DB,'RDPMS_EXEC_OWNED_PORT':str(PORT)})
    (TMP/'socket').mkdir(); (TMP/'uploads').mkdir()
    run('initdb',['/opt/homebrew/bin/initdb','-D',str(TMP/'pg'),'-U',ROLE,'--auth=trust'],cwd=ROOT)
    run('cluster-start',['/opt/homebrew/bin/pg_ctl','-D',str(TMP/'pg'),'-l',str(TMP/'postgres.log'),'-o',f'-h 127.0.0.1 -p {PORT} -k {TMP}/socket','-w','start'],cwd=ROOT); started=True
    check=subprocess.run(['node','scripts/test-db.mjs','check'],cwd=BACKEND,env=env,text=True,capture_output=True)
    (OUT/'guard-check.log').write_text(check.stdout+check.stderr)
    records.append({'label':'guard-check','command':['node','scripts/test-db.mjs','check'],'exitCode':check.returncode,'log':'guard-check.log'})
    if check.returncode != 2 or DB not in check.stdout+check.stderr: raise RuntimeError('guard check did not confirm unique owned destination')
    reset=subprocess.run(['node','scripts/test-db.mjs','reset'],cwd=BACKEND,env=env,text=True,capture_output=True)
    (OUT/'guard-reset.log').write_text(reset.stdout+reset.stderr)
    records.append({'label':'guard-reset','command':['node','scripts/test-db.mjs','reset'],'exitCode':reset.returncode,'log':'guard-reset.log'})
    if reset.returncode: raise RuntimeError('guard reset failed')
    env=os.environ.copy(); env.update(dict(line.split('=',1) for line in envfile.read_text().splitlines())); proc_env.update(env)
    schema='''
CREATE TABLE barrier_source_row(id text PRIMARY KEY, revision int NOT NULL, payload text NOT NULL);
CREATE TABLE barrier_outbox(id text PRIMARY KEY, source_id text NOT NULL, revision int NOT NULL, payload text NOT NULL);
CREATE TABLE barrier_pub_state(id int PRIMARY KEY, next_seq bigint NOT NULL);
CREATE TABLE barrier_event(id text PRIMARY KEY, published_seq bigint NOT NULL UNIQUE, source_id text NOT NULL, revision int NOT NULL, payload text NOT NULL);
INSERT INTO barrier_pub_state VALUES (1,0);
CREATE SEQUENCE unsafe_seq;
CREATE TABLE unsafe_event(id text PRIMARY KEY, published_seq bigint NOT NULL UNIQUE, source_id text NOT NULL, revision int NOT NULL, payload text NOT NULL);
'''
    psql(schema,'schema-setup')
    # An uncommitted source+barrier_outbox is invisible at the prior completed cut.
    a=start_session(); send(a,"BEGIN; INSERT INTO barrier_source_row VALUES ('late',1,'revision-1'); INSERT INTO barrier_outbox VALUES ('out-late','late',1,'revision-1'); SELECT 'SOURCE_READY';")
    read_until(a,'SOURCE_READY')
    before=psql("SELECT next_seq FROM barrier_pub_state WHERE id=1; SELECT count(*) FROM barrier_outbox;",'pull-before-source-commit').stdout.strip().splitlines()
    if before != ['0','0']: raise AssertionError(f'uncommitted source leaked: {before}')
    send(a,'COMMIT;'); send(a,"SELECT 'SOURCE_COMMITTED';"); read_until(a,'SOURCE_COMMITTED'); a.stdin.close(); a.wait(timeout=5)
    # Single transactional publisher writes durable event and sequence under one state-row lock.
    psql("BEGIN; SELECT next_seq FROM barrier_pub_state WHERE id=1 FOR UPDATE; UPDATE barrier_pub_state SET next_seq=next_seq+1 WHERE id=1; INSERT INTO barrier_event SELECT 'event-late',next_seq,'late',1,'revision-1' FROM barrier_pub_state WHERE id=1; COMMIT;",'publisher-one')
    visible=psql("SELECT published_seq||'|'||source_id||'|'||revision||'|'||payload FROM barrier_event WHERE published_seq>0 ORDER BY published_seq;",'pull-after-publish').stdout.strip()
    if visible != '1|late|1|revision-1': raise AssertionError(f'late committed source missing or wrong: {visible}')
    # Transactional sequence counterexample: allocation order is not commit order.
    seqA=start_session(); send(seqA,"BEGIN; SELECT nextval('unsafe_seq'); SELECT 'SEQ_A_READY';"); read_until(seqA,'SEQ_A_READY')
    seq2=psql("SELECT nextval('unsafe_seq');",'unsafe-seq-b-allocate').stdout.strip()
    psql("INSERT INTO unsafe_event VALUES ('unsafe-2',2,'seq2',1,'committed-first');",'unsafe-seq-b-commit')
    cut=psql("SELECT max(published_seq) FROM unsafe_event WHERE id LIKE 'unsafe-%';",'unsafe-seq-cut').stdout.strip()
    send(seqA,'COMMIT;'); send(seqA,"SELECT 'SEQ_A_COMMITTED';"); read_until(seqA,'SEQ_A_COMMITTED'); seqA.stdin.close(); seqA.wait(timeout=5)
    psql("INSERT INTO unsafe_event VALUES ('unsafe-1',1,'seq1',1,'committed-late');",'unsafe-seq-a-commit')
    skipped=psql(f"SELECT count(*) FROM unsafe_event WHERE id LIKE 'unsafe-%' AND published_seq>{cut};",'unsafe-seq-after-cut').stdout.strip()
    # Competing publishers serialize on barrier_pub_state; the waiter receives the committed next value.
    p1=start_session(); send(p1,"BEGIN; SELECT next_seq FROM barrier_pub_state WHERE id=1 FOR UPDATE; UPDATE barrier_pub_state SET next_seq=next_seq+1 WHERE id=1; INSERT INTO barrier_event SELECT 'event-pub-a',next_seq,'pub-a',1,'a' FROM barrier_pub_state WHERE id=1; SELECT 'P1_LOCKED';")
    read_until(p1,'P1_LOCKED')
    p2=start_session(); send(p2,"BEGIN; SELECT 'P2_BEGIN';"); read_until(p2,'P2_BEGIN')
    send(p2,"SELECT next_seq FROM barrier_pub_state WHERE id=1 FOR UPDATE; SELECT 'P2_LOCKED';")
    time.sleep(0.25)
    early=select.select([p2.stdout],[],[],0)[0]
    if early: raise AssertionError('second publisher unexpectedly passed held row lock')
    send(p1,'COMMIT;'); send(p1,"SELECT 'P1_COMMITTED';"); read_until(p1,'P1_COMMITTED'); p1.stdin.close(); p1.wait(timeout=5)
    p2lines=read_until(p2,'P2_LOCKED')
    locked_value=next((line for line in p2lines if line.strip().isdigit()),None)
    if locked_value!='2': raise AssertionError(f'publisher waiter did not observe committed sequence: {p2lines}')
    send(p2,"UPDATE barrier_pub_state SET next_seq=next_seq+1 WHERE id=1; INSERT INTO barrier_event SELECT 'event-pub-b',next_seq,'pub-b',1,'b' FROM barrier_pub_state WHERE id=1; COMMIT; SELECT 'P2_COMMITTED';")
    read_until(p2,'P2_COMMITTED'); p2.stdin.close(); p2.wait(timeout=5)
    competing=psql("SELECT published_seq||'|'||id FROM barrier_event WHERE id IN ('event-pub-a','event-pub-b') ORDER BY published_seq;",'publisher-competing-check').stdout.strip().splitlines()
    if competing != ['2|event-pub-a','3|event-pub-b']: raise AssertionError(f'competing publisher order invalid: {competing}')
    # Rollback leaves neither source/barrier_outbox nor publication sequence consumed.
    psql("BEGIN; INSERT INTO barrier_source_row VALUES ('rolled',1,'rolled'); INSERT INTO barrier_outbox VALUES ('out-rolled','rolled',1,'rolled'); ROLLBACK;",'source-rollback')
    rollback=psql("SELECT (SELECT count(*) FROM barrier_source_row WHERE id='rolled')||'|'||(SELECT count(*) FROM barrier_outbox WHERE id='out-rolled')||'|'||(SELECT next_seq FROM barrier_pub_state WHERE id=1);",'source-rollback-check').stdout.strip()
    if rollback != '0|0|3': raise AssertionError(f'rollback leaked rows or consumed state: {rollback}')
    (OUT/'barrier-summary.json').write_text(json.dumps({
      'ownedDatabase':DB,'bindHost':'127.0.0.1','port':PORT,
      'candidateTransactionalBarrier':{'uncommittedSourceHiddenAtCut':before,'nextPullAfterCommit':visible,'competingPublisherRows':competing,'rollbackRowsAndState':rollback,'result':'PASS_FOR_CANDIDATE_SQL_MODEL_ONLY'},
      'unsafeSequenceCounterexample':{'allocatedSecondValue':seq2,'checkpointMax':cut,'lateFirstValueCommittedAfterCut':'1','rowsReturnedAboveCheckpoint':skipped,'result':'PERMANENT_MISS_DEMONSTRATED'},
      'limitations':['Synthetic SQL protocol model, not application implementation','No production design selected or approved','No producer coverage, bootstrap/ACL/cursor, restore epoch, client IndexedDB, publisher crash recovery or retention evidence'],
    },indent=2)+'\n')
finally:
    if started:
        drop=subprocess.run(['node','scripts/test-db.mjs','drop'],cwd=BACKEND,env=locals().get('env',os.environ.copy()),text=True,capture_output=True)
        (OUT/'guard-drop.log').write_text(drop.stdout+drop.stderr)
        records.append({'label':'guard-drop','command':['node','scripts/test-db.mjs','drop'],'exitCode':drop.returncode,'log':'guard-drop.log'})
        stop=subprocess.run(['/opt/homebrew/bin/pg_ctl','-D',str(TMP/'pg'),'-m','fast','-w','stop'],cwd=ROOT,text=True,capture_output=True)
        (OUT/'cluster-stop.log').write_text(stop.stdout+stop.stderr)
        records.append({'label':'cluster-stop','command':['/opt/homebrew/bin/pg_ctl','-D',str(TMP/'pg'),'-m','fast','-w','stop'],'exitCode':stop.returncode,'log':'cluster-stop.log'})
    shutil.rmtree(TMP)
    (OUT/'commands-and-results.json').write_text(json.dumps(records,indent=2)+'\n')
