import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const backend=process.argv[2];
const require=createRequire(backend+'/package.json');
const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const {createApp}=await import(pathToFileURL(backend+'/dist/bootstrap/createApp.js'));
const db=new PrismaClient();
const run=crypto.randomUUID();
const observations=[];
let gate=null;
function wrapModel(model,entity) {
 return new Proxy(model,{get(target,key){
  const value=target[key];
  if(typeof value!=='function') return value;
  return async args=>{
   if(gate&&!gate.fired&&gate.entity===entity&&gate.method===key&&gate.matches(args)){
    gate.fired=true;gate.ready();await gate.released;
   }
   return value.call(target,args);
  };
 }});
}
function wrapClient(client){
 return new Proxy(client,{get(target,key){
  if(key==='report'||key==='user') return wrapModel(target[key],key);
  if(key==='$transaction')return (fn,options)=>target.$transaction(tx=>fn(wrapClient(tx)),options);
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
}
function barrier(entity,method,matches){
 let ready,release;const reached=new Promise(r=>ready=r),released=new Promise(r=>release=r);
 gate={entity,method,matches,reached,released,ready,release,fired:false};return gate;
}
async function reach(b){
 let timer;try{await Promise.race([b.reached,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('barrier not reached')),4000))]);}finally{clearTimeout(timer);}
}
async function req(app,path,method='GET',body){
 const response=await app.request(path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,body:await response.json()};
}
try{
 await db.$queryRaw`SELECT 1`;
 const user=await db.user.create({data:{id:'cb-review-'+run,username:'cb-review-'+run,displayName:'Synthetic reviewer',passwordHash:'synthetic-only',systemRole:'ADMIN',status:'ACTIVE'}});
 const actor={userId:user.id,user,systemRole:'ADMIN',permissions:['projects.create','projects.view','reports.create','reports.submit','reports.update','reports.view','tasks.view','users.disable']};
 const app=createApp({db:wrapClient(db),actorResolver:async()=>actor});
 const valid=await req(app,'/api/projects','POST',{name:'Independent positive project '+run,type:'TESTING',clientMutationId:'project-'+run});
 assert.equal(valid.status,201,JSON.stringify(valid.body));
 const projectId=valid.body.id;
 observations.push({case:'legal-authorized-project',status:valid.status,persisted:await db.project.count({where:{id:projectId}})});
 for(const [label,patch] of [['subtype-object',{subtype:{x:1}}],['type-array',{type:['TESTING']}],['date-boolean',{startDate:false}]]){
  const name=label+'-'+run;const key='invalid-'+label+'-'+run;
  const before={sequence:await db.codeSequence.findMany(),projects:await db.project.count(),audit:await db.auditLog.count(),receipts:await db.mutationReceipt.count()};
  const response=await req(app,'/api/projects','POST',{name,type:'TESTING',...patch,clientMutationId:key});
  const after={sequence:await db.codeSequence.findMany(),projects:await db.project.count(),audit:await db.auditLog.count(),receipts:await db.mutationReceipt.count()};
  assert.equal(response.status,400,JSON.stringify(response.body));assert.deepEqual(after,before);
  observations.push({case:'project-'+label,status:response.status,noResidue:true});
 }
 // Inverse of LR2-01: same PUT read/write gap, now rejected.
 const putReport=await db.report.create({data:{projectId,authorId:user.id,reportType:'MONTHLY',periodKey:'2026-10',content:{revision:'put-source'}}});
 const putGate=barrier('report','updateMany',a=>a.where?.id===putReport.id&&a.data?.content);
 const putPending=req(app,'/api/reports/'+putReport.id,'PUT',{content:{revision:'late-put'},clientMutationId:'late-put-'+run});
 try{
  await reach(putGate);
  const submitted=await req(app,'/api/reports/'+putReport.id+'/submit','POST',{clientMutationId:'put-submit-'+run});
  assert.equal(submitted.status,200,JSON.stringify(submitted.body));
  putGate.release();const put=await putPending;
  const row=await db.report.findUnique({where:{id:putReport.id}}),version=await db.reportVersion.findFirst({where:{reportId:putReport.id}});
  assert.equal(put.status,409);assert.deepEqual(row.content,version.content);
  const receipts=await db.mutationReceipt.count({where:{command:'PUT /api/reports/:id',resourceScope:'report:'+putReport.id}});
  assert.equal(receipts,0);
  observations.push({case:'late-PUT-inverse',status:put.status,code:put.body.code,persistedStatus:row.status,content:row.content,versionContent:version.content,failedSaveReceipts:receipts});
 }finally{putGate.release();gate=null;}
 // Uncovered POST new-row branch: validation sees no row; another command creates
 // and submits that same business key before the first upsert executes.
 const payload={projectId,reportType:'MONTHLY',periodKey:'2026-11',content:{revision:'late-new-POST'},clientMutationId:'late-post-'+run};
 const postGate=barrier('report','upsert',a=>a.where?.projectId_authorId_reportType_periodKey?.periodKey==='2026-11');
 const pending=req(app,'/api/reports','POST',payload);
 try{
  await reach(postGate);
  const created=await req(app,'/api/reports','POST',{...payload,content:{revision:'winner-created'},clientMutationId:'winner-post-'+run});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const submitted=await req(app,'/api/reports/'+created.body.id+'/submit','POST',{clientMutationId:'winner-submit-'+run});
  assert.equal(submitted.status,200,JSON.stringify(submitted.body));
  postGate.release();const late=await pending;
  const row=await db.report.findUnique({where:{id:created.body.id}});
  const versions=await db.reportVersion.findMany({where:{reportId:created.body.id},orderBy:{version:'asc'}});
  const audit=await db.auditLog.findMany({where:{entityId:created.body.id},select:{action:true,metadata:true}});
  const receipts=await db.mutationReceipt.findMany({where:{actorId:user.id},select:{command:true,resourceScope:true}});
  observations.push({case:'late-POST-after-absent-row-validation',firstValidateSawAbsent:true,createStatus:created.status,submitStatus:submitted.status,latePostStatus:late.status,persistedStatus:row.status,currentVersion:row.currentVersion,currentContent:row.content,versionContent:versions[0].content,audit,receipts});
  assert.equal(late.status,201,JSON.stringify(late.body));assert.equal(row.status,'SUBMITTED');assert.notDeepEqual(row.content,versions[0].content);
 }finally{postGate.release();gate=null;}
 // Correct fence: login already read ACTIVE and checked the real password.
 const password='Independent synthetic password 2026!';
 const target=await db.user.create({data:{username:'login-fence-'+run,displayName:'Synthetic login target',passwordHash:await bcrypt.hash(password,4),systemRole:'MEMBER',status:'ACTIVE'}});
 const loginGate=barrier('user','updateMany',a=>a.where?.id===target.id&&a.data?.lastLoginAt);
 const loginPending=req(app,'/api/auth/login','POST',{username:target.username,password});
 try{
  await reach(loginGate);
  const disabled=await req(app,'/api/users/'+target.id+'/status','PATCH',{status:'DISABLED'});
  assert.equal(disabled.status,200,JSON.stringify(disabled.body));
  loginGate.release();const login=await loginPending;
  const row=await db.user.findUnique({where:{id:target.id}});
  const refresh=await db.refreshToken.count({where:{userId:target.id}}),audit=await db.auditLog.count({where:{actorId:target.id,action:'login'}});
  assert.equal(login.status,403);assert.equal(login.body.code,'ACCOUNT_DISABLED');assert.equal(row.status,'DISABLED');assert.equal(row.lastLoginAt,null);assert.equal(refresh,0);assert.equal(audit,0);
  observations.push({case:'login-stale-ACTIVE-before-conditional-reset',disabledStatus:disabled.status,loginStatus:login.status,code:login.body.code,persistedStatus:row.status,lastLoginAt:row.lastLoginAt,refreshCount:refresh,successAuditCount:audit,accessTokenPresent:!!login.body.accessToken});
 }finally{loginGate.release();gate=null;}
 console.log(JSON.stringify({run,database:'unique owned PostgreSQL',authentication:'trusted injected actor for protected routes; real bcrypt login for login fence; not end-to-end JWT acceptance',instrumentation:'deterministic pauses immediately before real ORM upsert/updateMany; unchanged actual SQL and transaction execution',observations},null,2));
}finally{gate?.release();await db.$disconnect();}
