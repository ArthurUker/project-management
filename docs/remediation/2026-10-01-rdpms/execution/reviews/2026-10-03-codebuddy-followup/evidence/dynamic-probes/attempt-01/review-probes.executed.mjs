import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const backend=process.argv[2],require=createRequire(backend+'/package.json');
const {PrismaClient}=require('@prisma/client'),bcrypt=require('bcryptjs');
const {createApp}=await import(pathToFileURL(backend+'/dist/bootstrap/createApp.js'));
const db=new PrismaClient(),run=crypto.randomUUID(),observations=[];
let gate=null,actor=null;
function wrap(client){return new Proxy(client,{get(t,k){
 if(k==='$transaction')return (fn,opts)=>t.$transaction(tx=>fn(wrap(tx)),opts);
 if(k==='report'||k==='user')return new Proxy(t[k],{get(model,method){
  const value=model[method];if(typeof value!=='function')return value;
  return async args=>{
   const b=gate;
   if(b&&!b.fired&&b.entity===k&&b.methods.includes(method)&&b.matches(args)){
    b.fired=true;b.ready();await b.released;
    if(b.emulateUpsert){
     const d=args.data;
     return model.upsert({where:{projectId_authorId_reportType_periodKey:{projectId:d.projectId,authorId:d.authorId,reportType:d.reportType,periodKey:d.periodKey}},create:d,update:{content:d.content,updatedById:d.authorId,deletedAt:null},include:args.include});
    }
   }
   return value.call(model,args);
  };
 }});
 const v=t[k];return typeof v==='function'?v.bind(t):v;
}});}
function barrier(entity,methods,matches,emulateUpsert=false){
 let ready,release;const reached=new Promise(r=>ready=r),released=new Promise(r=>release=r);
 return gate={entity,methods,matches,emulateUpsert,reached,released,ready,release,fired:false};
}
async function reached(b){let timer;try{await Promise.race([b.reached,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('barrier not reached')),4000))]);}finally{clearTimeout(timer);}}
const app=createApp({db:wrap(db),actorResolver:async()=>actor});
const plain=createApp({db,actorResolver:async()=>actor});
async function req(path,method='GET',body,target=app){const response=await target.request(path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
try{
 await db.$queryRaw`SELECT 1`;
 const user=await db.user.create({data:{username:'followup-owner-'+run,displayName:'Synthetic owner',passwordHash:'synthetic-only',systemRole:'ADMIN',status:'ACTIVE'}});
 const other=await db.user.create({data:{username:'followup-viewer-'+run,displayName:'Synthetic viewer',passwordHash:'synthetic-only',systemRole:'ADMIN',status:'ACTIVE'}});
 const outsider=await db.user.create({data:{username:'followup-outsider-'+run,displayName:'Synthetic outsider',passwordHash:'synthetic-only',systemRole:'ADMIN',status:'ACTIVE'}});
 const perms=['projects.view','project_phases.view','tasks.view','milestones.view','progress.view','reports.view','projects.create','reports.create','reports.update','reports.submit','reports.delete','users.disable'];
 actor={userId:user.id,user,systemRole:user.systemRole,permissions:perms};
 const project=await db.project.create({data:{code:'FOLLOWUP-'+run,name:'Independent synthetic project',type:'TESTING',status:'PLANNING',managerId:user.id,createdById:user.id,members:{create:[{userId:user.id,role:'OWNER',createdById:user.id},{userId:other.id,role:'VIEWER',createdById:user.id}]}}});
 const projectId=project.id;
 const post=(period,revision,key,target=app)=>req('/api/reports','POST',{projectId,reportType:'MONTHLY',periodKey:period,content:{revision},clientMutationId:key},target);
 const first=await post('2026-10','legitimate-create','positive-'+run);
 assert.equal(first.status,201,JSON.stringify(first.body));
 assert.equal(await db.report.count({where:{id:first.body.id,status:'DRAFT'}}),1);
 assert.equal(await db.mutationReceipt.count({where:{actorId:user.id,idempotencyKey:'positive-'+run}}),1);
 observations.push({case:'positive-real-POST-create',status:first.status,persistedStatus:'DRAFT'});

 // A gate on either write primitive keeps the boundary stable across the repair.
 for(const [period,control] of [['2026-11',false],['2026-12',true]]){
  const lateKey='late-'+period+'-'+run;
  const b=barrier('report',['create','upsert'],a=>a.data?.periodKey===period||a.create?.periodKey===period,control);
  const pending=post(period,control?'control-late':'late-rejected',lateKey);
  try{
   await reached(b);
   const winner=await post(period,'winner-source','winner-'+period+'-'+run,plain);
   assert.equal(winner.status,201,JSON.stringify(winner.body));
   const submitted=await req('/api/reports/'+winner.body.id+'/submit','POST',{clientMutationId:'submit-'+period+'-'+run},plain);
   assert.equal(submitted.status,200,JSON.stringify(submitted.body));
   b.release();const late=await pending;
   const row=await db.report.findUnique({where:{id:winner.body.id}}),version=await db.reportVersion.findFirst({where:{reportId:row.id}});
   const receipt=await db.mutationReceipt.count({where:{actorId:user.id,idempotencyKey:lateKey}});
   const creates=await db.auditLog.count({where:{entityId:row.id,action:'create'}});
   if(!control){assert.equal(late.status,409);assert.equal(late.body.code,'DUPLICATE_PERIOD_KEY');assert.deepEqual(row.content,version.content);assert.equal(receipt,0);assert.equal(creates,1);}
   else{assert.equal(late.status,201);assert.notDeepEqual(row.content,version.content);assert.equal(receipt,1);assert.equal(creates,2);}
   observations.push({case:control?'semantic-negative-control-unconditional-upsert':'fixed-absent-row-POST-race',createStatus:winner.status,submitStatus:submitted.status,lateStatus:late.status,code:late.body.code,persistedStatus:row.status,currentVersion:row.currentVersion,currentContent:row.content,versionContent:version.content,lateReceiptCount:receipt,createAuditCount:creates,controlBoundary:control?'Only matching delayed create is adapted to real unconditional Prisma upsert; no source edit; actual PostgreSQL transaction/audit/receipt retained':'Unchanged current source/Prisma SQL'});
  }finally{b.release();gate=null;}
 }
 const deleted=await req('/api/reports/'+first.body.id,'DELETE');assert.equal(deleted.status,200);
 const restoreKey='late-restore-'+run;
 const restoreGate=barrier('report',['updateMany'],a=>a.where?.id===first.body.id&&a.where?.deletedAt);
 const restoring=post('2026-10','late-restore',restoreKey);
 try{
  await reached(restoreGate);
  const winner=await post('2026-10','winner-restored','winner-restore-'+run,plain);assert.equal(winner.status,201);
  const submitted=await req('/api/reports/'+first.body.id+'/submit','POST',{clientMutationId:'restored-submit-'+run},plain);assert.equal(submitted.status,200);
  restoreGate.release();const late=await restoring;
  const row=await db.report.findUnique({where:{id:first.body.id}}),version=await db.reportVersion.findFirst({where:{reportId:row.id}});
  assert.equal(late.status,409);assert.deepEqual(row.content,version.content);assert.equal(row.status,'SUBMITTED');assert.equal(row.deletedAt,null);
  const receipts=await db.mutationReceipt.count({where:{actorId:user.id,idempotencyKey:restoreKey}});assert.equal(receipts,0);
  const restoreAudit=await db.auditLog.count({where:{entityId:row.id,action:'update',metadata:{path:['restoredFromTombstone'],equals:true}}});assert.equal(restoreAudit,1);
  observations.push({case:'tombstone-restored-and-submitted-before-late-restore',winnerStatus:winner.status,submitStatus:submitted.status,lateStatus:late.status,persistedStatus:row.status,currentContent:row.content,versionContent:version.content,lateReceiptCount:receipts,restoreAuditCount:restoreAudit});
 }finally{restoreGate.release();gate=null;}

 const phase=await db.projectPhase.create({data:{projectId,code:'P1',name:'Real phase',sortOrder:1}});
 const task=await db.task.create({data:{projectId,phaseId:phase.id,title:'Real task',assigneeId:other.id,createdById:user.id}});
 const milestone=await db.milestone.create({data:{projectId,phaseId:phase.id,name:'Real milestone',dueDate:new Date('2026-12-31')}});
 const progress=await db.monthlyProgress.create({data:{projectId,periodKey:'2026-10',submittedById:user.id,actualWork:'Real progress'}});
 const member=await db.projectMember.findFirst({where:{projectId,userId:user.id,leftAt:null}});
 const matrix=[
  ['projects','projects.view','/api/projects/'+projectId,projectId],
  ['projectPhases','project_phases.view','/api/projects/'+projectId+'/phases',phase.id],
  ['tasks','tasks.view','/api/projects/'+projectId+'/tasks',task.id],
  ['milestones','milestones.view','/api/projects/'+projectId+'/milestones',milestone.id],
  ['monthlyProgress','progress.view','/api/progress?projectId='+projectId,progress.id],
  ['reports','reports.view','/api/projects/'+projectId+'/reports',first.body.id],
  ['projectMembers','projects.view','/api/projects/'+projectId+'/members',member.id],
 ];
 const forbidden=['createdById','updatedById','deletedAt','reviewerId','leftAt','metadata'];
 for(const [entity,permission,path,id] of matrix){
  actor={...actor,permissions:perms};
  const online=await req(path),sync=await req('/api/sync/init');assert.equal(online.status,200);assert.equal(sync.status,200);
  const onlineRow=online.body.id===id?online.body:online.body.list?.find(x=>x.id===id);
  const syncRow=sync.body.changes[entity].upserts.find(x=>x.id===id);
  assert.ok(onlineRow,'online persisted row missing '+entity);assert.ok(syncRow,'sync persisted row missing '+entity);
  for(const [key,value] of Object.entries(syncRow)){
   assert.ok(Object.hasOwn(onlineRow,key),'not an online field '+entity+'.'+key);
   if(key==='manager'&&value){for(const [nested,v] of Object.entries(value))assert.deepEqual(v,onlineRow.manager[nested]);}
   else assert.deepEqual(value,onlineRow[key],entity+'.'+key);
  }
  for(const field of forbidden)assert.equal(Object.hasOwn(syncRow,field),false,entity+'.'+field);
  actor={...actor,permissions:perms.filter(p=>p!==permission)};
  const denied=await req(path),noSync=await req('/api/sync/init');assert.equal(denied.status,403);assert.deepEqual(noSync.body.changes[entity],{upserts:[],tombstones:[]});
  observations.push({case:'same-actor-online-sync-fields-and-permission-'+entity,onlineStatus:online.status,deniedOnlineStatus:denied.status,fieldCount:Object.keys(syncRow).length,sameRowId:id,allScalarValuesCompared:true,permission});
 }
 actor={...actor,permissions:perms};
 // Check the factual tombstone statement in the supplied read contract.
 await db.projectPhase.update({where:{id:phase.id},data:{deletedAt:new Date()}});
 const phases=await req('/api/projects/'+projectId+'/phases'),phaseSync=await req('/api/sync/init');
 const onlineReturnsDeleted=phases.body.list.some(x=>x.id===phase.id);
 assert.equal(onlineReturnsDeleted,true);assert.ok(phaseSync.body.changes.projectPhases.tombstones.includes(phase.id));assert.equal(phaseSync.body.changes.projectPhases.upserts.some(x=>x.id===phase.id),false);
 observations.push({case:'ordinary-phase-tombstone-contract-fact',onlineStatus:phases.status,onlineReturnsDeleted,deletedAt:phases.body.list.find(x=>x.id===phase.id).deletedAt,syncReturnsAs:'tombstone only',meaning:'Supplied matrix says all ordinary active views exclude tombstones; phases route is an existing exception. Not a sync unauthorized data leak.'});
 actor={userId:outsider.id,user:outsider,systemRole:'ADMIN',permissions:perms};
 const outside=await req('/api/sync/init');assert.deepEqual(outside.body.acl.projectIds,[]);
 assert.equal(JSON.stringify(outside.body).includes(phase.id),false);
 observations.push({case:'nonmember-phase-tombstone-not-leaked',status:outside.status,tombstonePresent:false});

 // Recheck the permanent C01 boundary with a positive credential fixture.
 actor={userId:user.id,user,systemRole:'ADMIN',permissions:perms};
 const password='Synthetic followup login password 2026!';
 const makeLoginUser=async tag=>db.user.create({data:{username:tag+'-'+run,displayName:'Synthetic login user',passwordHash:await bcrypt.hash(password,4),systemRole:'MEMBER',status:'ACTIVE'}});
 const good=await makeLoginUser('followup-positive');const successful=await req('/api/auth/login','POST',{username:good.username,password});
 assert.equal(successful.status,200);assert.ok(successful.body.accessToken);assert.equal(await db.refreshToken.count({where:{userId:good.id,revokedAt:null}}),1);
 const target=await makeLoginUser('followup-fence');const loginGate=barrier('user',['updateMany'],a=>a.where?.id===target.id&&a.data?.lastLoginAt);
 const loginPending=req('/api/auth/login','POST',{username:target.username,password});
 try{
  await reached(loginGate);const disabled=await req('/api/users/'+target.id+'/status','PATCH',{status:'DISABLED'},plain);assert.equal(disabled.status,200);
  loginGate.release();const login=await loginPending;const row=await db.user.findUnique({where:{id:target.id}});
  assert.equal(login.status,403);assert.equal(login.body.code,'ACCOUNT_DISABLED');assert.equal(row.lastLoginAt,null);assert.equal(row.failedLoginAttempts,0);assert.equal(row.lockedUntil,null);
  const refresh=await db.refreshToken.count({where:{userId:target.id}}),audit=await db.auditLog.count({where:{actorId:target.id,action:'login'}});assert.equal(refresh,0);assert.equal(audit,0);
  observations.push({case:'permanent-login-fence-recheck',positiveLoginStatus:successful.status,disableStatus:disabled.status,loginStatus:login.status,code:login.body.code,persistedStatus:row.status,lastLoginAt:row.lastLoginAt,failedLoginAttempts:row.failedLoginAttempts,lockedUntil:row.lockedUntil,refreshCount:refresh,successLoginAuditCount:audit,accessTokenPresent:!!login.body.accessToken});
 }finally{loginGate.release();gate=null;}
 console.log(JSON.stringify({run,database:'unique owned real PostgreSQL',authentication:'injected actor for protected endpoints; real bcrypt successful login and conditional reset; not full JWT acceptance',source:'unchanged worktree source compiled by owned runner',negativeControl:'Only one matching test DB adapter create is converted into real unconditional upsert to emulate the removed write primitive; source and old artifacts are untouched',observations},null,2));
}finally{gate?.release();await db.$disconnect();}
