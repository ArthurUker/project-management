#!/usr/bin/env python3
"""Pair integrity checker and OWNED-DRILL-ONLY physical restore security seal.
No production restoration, services, backup writes, or general auth-policy import.
The seal requires identical user IDs and current policy; changed catalogs fail closed.
Common-point writer proof is separate: matching tags/hashes are insufficient.
"""
import argparse,base64,importlib.util,json,os,pathlib,re,subprocess,sys,uuid

def module():
 p=pathlib.Path(__file__).resolve().parents[1]/'backup-pair.py'
 spec=importlib.util.spec_from_file_location('pair',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def verify(pair,uploads,snapshot):
 pair=pathlib.Path(pair).resolve(strict=True);uploads=pathlib.Path(uploads).resolve(strict=True)
 m,s=module().check_pair(pair,uploads)
 if pathlib.Path(snapshot).resolve(strict=True)!=s:raise ValueError('WRONG_PAIR_SNAPSHOT')
 return {'runId':m['runId'],'dumpSha256':m['dumpSha256'],'fileManifestSha256':m['fileManifestSha256'],'integrity':'PASS','consistentPoint':m['consistentPoint'],'restoreEligible':False}

def seal(args):
 name=os.environ.get('RDPMS_EXEC_OWNED_DB','');receipt=json.loads(pathlib.Path(args.ownership).read_text())
 if not re.fullmatch(r'rdpms_test_[a-z0-9_]+',name) or os.environ.get('PGHOST')!='127.0.0.1' or receipt.get('targetDB')!=name or receipt.get('sourceDB')==name or str(receipt.get('clusterPort'))!=os.environ.get('PGPORT') or receipt.get('kind')!='NEW_OWNED_RESTORE_TARGET':raise ValueError('OWNED_TARGET_MISMATCH')
 # Calls the existing guard with the target-specific owned envfile; no bypass.
 guard=pathlib.Path(args.backend).resolve()/ 'scripts/test-db.mjs'
 checked=subprocess.run(['node',str(guard),'check'],capture_output=True,text=True,timeout=30)
 if checked.returncode:raise ValueError('TARGET_DB_GUARD_REJECTED')
 floor=json.loads(pathlib.Path(args.security_floor).read_text())
 if floor.get('sourceDB')!=receipt['sourceDB'] or floor.get('kind')!='CURRENT_OWNED_SECURITY_FLOOR' or not isinstance(floor.get('users'),list):raise ValueError('SECURITY_FLOOR_INVALID')
 encoded=base64.b64encode(json.dumps(floor).encode()).decode();run=str(uuid.uuid4());epoch=str(uuid.uuid4())
 # Authentication fields never appear in stdout/logs. SQL data only travels stdin.
 sql="""BEGIN;
 SELECT epoch FROM data_recovery_state WHERE id=1 FOR UPDATE;
 CREATE TEMP TABLE owned_floor AS SELECT convert_from(decode('%s','base64'),'UTF8')::jsonb AS v;
 DO $seal$ DECLARE f jsonb;BEGIN
 SELECT v INTO f FROM owned_floor;
 IF (SELECT status FROM data_recovery_state WHERE id=1)<>'RESTORING' THEN RAISE EXCEPTION 'TARGET_NOT_CONTAINED'; END IF;
 IF (SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM users) IS DISTINCT FROM
    (SELECT coalesce(jsonb_agg(x->>'id' ORDER BY x->>'id'),'[]'::jsonb) FROM jsonb_array_elements(f->'users') x) THEN RAISE EXCEPTION 'USER_CATALOG_CHANGED_NEEDS_OWNER_RECONCILIATION'; END IF;
 IF (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY role_id,permission_id),'[]'::jsonb) FROM role_permissions t) IS DISTINCT FROM f->'rolePermissions'
 OR (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY user_id,role_id),'[]'::jsonb) FROM user_roles t) IS DISTINCT FROM f->'userRoles'
 OR (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM roles t) IS DISTINCT FROM f->'roles'
 OR (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM permissions t) IS DISTINCT FROM f->'permissions' THEN RAISE EXCEPTION 'RBAC_CHANGED_NEEDS_OWNER_RECONCILIATION'; END IF;
 END $seal$;
 UPDATE data_recovery_state SET active_run_id='%s',previous_epoch=epoch,epoch='%s',status='RESTORING';
 SELECT set_config('rdpms.restore_run','%s',true);
 UPDATE users u SET username=x.username,email=x.email,password_hash=x.password_hash,status=x.status::"UserStatus",system_role=x.system_role::"SystemRole",
 must_change_password=x.must_change_password,security_version=greatest(u.security_version,x.security_version)+1,
 password_changed_at=x.password_changed_at,deleted_at=x.deleted_at,failed_login_attempts=x.failed_login_attempts,locked_until=x.locked_until
 FROM owned_floor f, jsonb_to_recordset(f.v->'users') AS x(id text,username text,email text,password_hash text,status text,system_role text,must_change_password boolean,security_version int,password_changed_at timestamptz,deleted_at timestamptz,failed_login_attempts int,locked_until timestamptz)
 WHERE u.id=x.id;
 UPDATE refresh_tokens SET revoked_at=coalesce(revoked_at,now());
 UPDATE data_recovery_state SET status='READY',active_run_id=NULL,failure_code=NULL,updated_at=now();
 COMMIT;"""%(encoded,run,epoch,run)
 result=subprocess.run(['psql','-X','-q','-v','ON_ERROR_STOP=1','-d',name],input=sql,capture_output=True,text=True,timeout=60)
 if result.returncode:raise ValueError('OWNED_SEAL_REJECTED') # no raw PG detail/credentials
 return {'kind':'OWNED_DRILL_ONLY_SECURITY_SEAL','result':'PASS','newEpoch':epoch,'floorUsers':len(floor['users']),'targetDB':name,'catalogPolicy':'EXACT_USER_ID_AND_RBAC_MATCH_REQUIRED','productionEligibility':'NOT_EVALUATED'}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--pair');p.add_argument('--uploads');p.add_argument('--snapshot');p.add_argument('--seal-owned-target',action='store_true');p.add_argument('--ownership');p.add_argument('--security-floor');p.add_argument('--backend');a=p.parse_args()
 try:print(json.dumps(seal(a) if a.seal_owned_target else verify(a.pair,a.uploads,a.snapshot),sort_keys=True))
 except Exception as exc:print('PAIRED_RESTORE_REJECTED:'+str(exc),file=sys.stderr);sys.exit(1)
