import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { ACCOUNT_RANK } from '../../dist/modules/auth/accountPolicy.js';
import { setRealSyncPermissions } from '../helpers/syncV1Fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';

const db = new PrismaClient(); const run = crypto.randomUUID();
const password = 'SpruceRiver48!Cedar'; const replacement = 'MapleHarbor83!Birch';
const roles = Object.keys(ACCOUNT_RANK); const actors = new Map(); const traces = [];
let app; let count=0;
async function user(role='MEMBER', force=false) {
  const id=`rp01-${run}-${++count}`;
  const u=await db.user.create({data:{id,username:id,displayName:'RP01 synthetic',passwordHash:await bcrypt.hash(password,4),systemRole:role,status:'ACTIVE',mustChangePassword:force}});
  await setRealSyncPermissions(db,id,['users.view','users.enable','users.disable','users.delete','users.reset_password','roles.assign_user','projects.view']);
  return u;
}
async function request(application, token, method, url, body) {
  return application.request(url,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
async function login(u, pw=password, application=app) {
  const r=await application.request('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:u.username,password:pw})});
  assert.equal(r.status,200,'legitimate credentials must succeed'); return r.json();
}
function faultApp(delegate='auditLog') {
  return createApp({db:new Proxy(db,{get(target,key){
    if(key==='$transaction')return (fn,opts)=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){
      if(k===delegate)return new Proxy(t[k],{get(d,m){if(m===(delegate==='auditLog'?'create':'updateMany'))return async()=>{throw new Error(`RP01_${delegate}_FAULT`);};const value=d[m];return typeof value==='function'?value.bind(d):value;}});
      const v=t[k];return typeof v==='function'?v.bind(t):v;
    }})),opts);
    const v=target[key];return typeof v==='function'?v.bind(target):v;
  }})});
}
function beforeCommandGate() {
  let entered,release; const arrived=new Promise(r=>entered=r);const proceed=new Promise(r=>release=r);let hit=false;
  const wrapped=new Proxy(db,{get(target,key){
    if(key==='$transaction')return (fn,opts)=>target.$transaction(tx=>fn(new Proxy(tx,{get(t,k){
      if(k==='$queryRaw')return async(strings,...values)=>{if(!hit&&strings.join('?').includes('ORDER BY id FOR UPDATE')){hit=true;entered();await proceed;}return t.$queryRaw(strings,...values);};
      const v=t[k];return typeof v==='function'?v.bind(t):v;
    }})),opts);
    const v=target[key];return typeof v==='function'?v.bind(target):v;
  }});
  return {application:createApp({db:wrapped}),arrived,release,hit:()=>hit};
}
before(async()=>{app=createApp({db});for(const role of roles){const u=await user(role);const credentials=await login(u);const me=await request(app,credentials.accessToken,'GET','/api/auth/me');assert.equal(me.status,200);actors.set(role,{u,token:credentials.accessToken});}});
after(async()=>{if(process.env.RDPMS_EXEC_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.RDPMS_EXEC_EVIDENCE_DIR,'rp01-persistent-state.json'),JSON.stringify({kind:'REAL_DB_AND_JWT',actors:roles,matrix:traces,actorRetainedUntilWholeDBDrop:true},null,2));await db.$disconnect();});

test('RP01 current actor×target hierarchy protects reset/enable/disable/delete; legal lower targets succeed',async()=>{
  const actions=[['reset','PUT','reset-password',{newPassword:replacement}],['disable','PATCH','status',{status:'DISABLED'}],['enable','PATCH','status',{status:'ACTIVE'}],['delete','DELETE','',undefined]];
  for(const actorRole of roles)for(const targetRole of roles)for(const [action,method,suffix,body] of actions){
    const target=await user(targetRole);if(action==='enable')await db.user.update({where:{id:target.id},data:{status:'DISABLED'}});
    const before=await db.user.findUnique({where:{id:target.id}});const beforeAudit=await db.auditLog.count({where:{entityId:target.id}});
    const {token}=actors.get(actorRole);const r=await request(app,token,method,`/api/users/${target.id}${suffix?'/'+suffix:''}`,body);
    const permitted=ACCOUNT_RANK[actorRole]>ACCOUNT_RANK[targetRole];assert.equal(r.status,permitted?200:403,`${actorRole}/${targetRole}/${action}: ${await r.clone().text()}`);
    const after=await db.user.findUnique({where:{id:target.id}});
    if(!permitted){assert.equal(JSON.stringify(after),JSON.stringify(before),'denial must preserve every account field');assert.equal(await db.auditLog.count({where:{entityId:target.id}}),beforeAudit);}
    else{assert.equal(await db.auditLog.count({where:{entityId:target.id}}),beforeAudit+1);if(action==='reset'){assert.ok(await bcrypt.compare(replacement,after.passwordHash));assert.equal(after.mustChangePassword,true);}if(action==='delete'){assert.ok(after.deletedAt);assert.equal(after.status,'DISABLED');}if(action==='enable'||action==='disable')assert.equal(after.status,body.status);}
    traces.push({actorRole,targetRole,action,httpStatus:r.status,permitted,persistentStateChecked:true});
  }
});

test('RP01 self-target and granting peer/higher system roles rejected; lawful binding chooses highest rank',async()=>{
  const admin=actors.get('ADMIN');const self=await request(app,admin.token,'PUT',`/api/users/${admin.u.id}/reset-password`,{newPassword:replacement});assert.equal(self.status,403);
  const target=await user();for(const roleCodes of [['ADMIN'],['SUPER_ADMIN'],['not-custom'],['MEMBER','MEMBER']]){const r=await request(app,admin.token,'PUT',`/api/users/${target.id}/roles`,{roleCodes});assert.ok([400,403].includes(r.status));}
  const r=await request(app,admin.token,'PUT',`/api/users/${target.id}/roles`,{roleCodes:['VIEWER','MANAGER']});assert.equal(r.status,200);assert.equal((await db.user.findUnique({where:{id:target.id}})).systemRole,'MANAGER');assert.equal(await db.userRole.count({where:{userId:target.id}}),2);
});

test('RP01 successful reset revokes actual old refresh and requires server-side password change',async()=>{
  const target=await user();const old=await login(target);const baseline=await request(app,old.accessToken,'GET','/api/users');assert.equal(baseline.status,200);assert.ok((await baseline.json()).list.length>0,'nonempty ordinary endpoint precondition');const admin=actors.get('ADMIN');
  const reset=await request(app,admin.token,'PUT',`/api/users/${target.id}/reset-password`,{newPassword:replacement});assert.equal(reset.status,200);
  assert.equal(await db.refreshToken.count({where:{userId:target.id,revokedAt:null}}),0);
  const refresh=await app.request('/api/auth/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refreshToken:old.refreshToken})});assert.equal(refresh.status,401);
  const current=await login(target,replacement);assert.equal(current.user.mustChangePassword,true);
  for(const [method,url,body] of [['GET','/api/projects'],['GET','/api/users'],['GET','/api/sync/init'],['POST','/api/sync/receipts/reserve',{protocolVersion:1,deviceId:'forced-test',changes:[]}]]){const r=await request(app,current.accessToken,method,url,body);assert.equal(r.status,403);assert.equal((await r.json()).code,'PASSWORD_CHANGE_REQUIRED');}
  for(const url of ['/api/auth/me','/api/auth/profile'])assert.equal((await request(app,current.accessToken,'GET',url)).status,200);
  assert.equal((await request(app,current.accessToken,'POST','/api/auth/verify',{})).status,200);
  const changed=await request(app,current.accessToken,'PUT','/api/auth/password/force',{newPassword:password});assert.equal(changed.status,200);
  assert.equal((await db.user.findUnique({where:{id:target.id}})).mustChangePassword,false);
  const loginAfter=await login(target);assert.equal((await request(app,loginAfter.accessToken,'GET','/api/projects')).status,200);
  assert.equal((await request(app,loginAfter.accessToken,'PUT','/api/auth/password/force',{newPassword:replacement})).status,400);
});

test('RP01 audit/refresh faults roll back resets, status, deletion, role changes and self password atomically',async()=>{
  const superActor=actors.get('SUPER_ADMIN');
  for(const failure of ['auditLog','refreshToken'])for(const [method,suffix,body] of [['PUT','reset-password',{newPassword:replacement}],['PATCH','status',{status:'DISABLED'}],['DELETE','',undefined],['PUT','roles',{roleCodes:['VIEWER']}]] ){
    const target=await user();await login(target);const before=await db.user.findUnique({where:{id:target.id}});const active=await db.refreshToken.count({where:{userId:target.id,revokedAt:null}});const rolesBefore=await db.userRole.findMany({where:{userId:target.id}});const application=faultApp(failure);
    const r=await request(application,superActor.token,method,`/api/users/${target.id}${suffix?'/'+suffix:''}`,body);assert.equal(r.status,500);
    assert.equal(JSON.stringify(await db.user.findUnique({where:{id:target.id}})),JSON.stringify(before));assert.equal(await db.refreshToken.count({where:{userId:target.id,revokedAt:null}}),active);assert.deepEqual(await db.userRole.findMany({where:{userId:target.id}}),rolesBefore);assert.equal(await db.auditLog.count({where:{entityId:target.id,action:{in:['PASSWORD_CHANGE','STATUS_CHANGE','DELETE','PERMISSION_CHANGE']}}}),0);
  }
  for(const force of [false,true])for(const failure of ['auditLog','refreshToken']){
    const target=await user('MEMBER',force);const credentials=await login(target);const before=await db.user.findUnique({where:{id:target.id}});
    const r=await request(faultApp(failure),credentials.accessToken,'PUT',force?'/api/auth/password/force':'/api/auth/password',{oldPassword:password,newPassword:replacement});assert.equal(r.status,500);assert.equal(JSON.stringify(await db.user.findUnique({where:{id:target.id}})),JSON.stringify(before));assert.equal(await db.refreshToken.count({where:{userId:target.id,revokedAt:null}}),1);
  }
});

test('RP01 target promotion committed before command lock is seen; reset cannot act on stale target rank',async()=>{
  const target=await user();const admin=actors.get('ADMIN');const gate=beforeCommandGate();let pending,timer;
  try{pending=request(gate.application,admin.token,'PUT',`/api/users/${target.id}/reset-password`,{newPassword:replacement});await Promise.race([gate.arrived,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('RP01_BARRIER_NOT_REACHED')),10000);})]);assert.equal(gate.hit(),true);await db.user.update({where:{id:target.id},data:{systemRole:'SUPER_ADMIN'}});}
  finally{clearTimeout(timer);gate.release();}
  assert.equal((await pending).status,403);assert.ok(await bcrypt.compare(password,(await db.user.findUnique({where:{id:target.id}})).passwordHash));assert.equal(await db.auditLog.count({where:{entityId:target.id,action:'PASSWORD_CHANGE'}}),0);
});

test('RP01 actor forced-change committed before command lock denies stale middleware actor',async()=>{
  const actor=await user('ADMIN');const credentials=await login(actor);const target=await user();const gate=beforeCommandGate();let pending,timer;
  try{pending=request(gate.application,credentials.accessToken,'PUT',`/api/users/${target.id}/reset-password`,{newPassword:replacement});await Promise.race([gate.arrived,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('RP01_BARRIER_NOT_REACHED')),10000);})]);await db.user.update({where:{id:actor.id},data:{mustChangePassword:true}});}
  finally{clearTimeout(timer);gate.release();}
  const r=await pending;assert.equal(r.status,403);assert.equal((await r.json()).code,'PASSWORD_CHANGE_REQUIRED');assert.ok(await bcrypt.compare(password,(await db.user.findUnique({where:{id:target.id}})).passwordHash));
});


test('RP01 enabling a disabled user also rolls back on strict audit failure',async()=>{
  const target=await user();await login(target);await db.user.update({where:{id:target.id},data:{status:'DISABLED'}});
  const before=await db.user.findUnique({where:{id:target.id}});const r=await request(faultApp('auditLog'),actors.get('ADMIN').token,'PATCH',`/api/users/${target.id}/status`,{status:'ACTIVE'});
  assert.equal(r.status,500);assert.equal(JSON.stringify(await db.user.findUnique({where:{id:target.id}})),JSON.stringify(before));
});

test('RP01 current DB permission revocation before command lock denies stale middleware grant',async()=>{
  const actor=await user('ADMIN');const credentials=await login(actor);const target=await user();const gate=beforeCommandGate();let pending,timer;
  try{pending=request(gate.application,credentials.accessToken,'PUT',`/api/users/${target.id}/reset-password`,{newPassword:replacement});await Promise.race([gate.arrived,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('RP01_BARRIER_NOT_REACHED')),10000);})]);await db.userRole.deleteMany({where:{userId:actor.id}});}
  finally{clearTimeout(timer);gate.release();}
  const r=await pending;assert.equal(r.status,403);assert.equal((await r.json()).code,'PERMISSION_DENIED');assert.ok(await bcrypt.compare(password,(await db.user.findUnique({where:{id:target.id}})).passwordHash));
});
