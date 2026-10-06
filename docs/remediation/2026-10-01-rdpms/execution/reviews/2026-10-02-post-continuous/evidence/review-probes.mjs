import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const backend=process.argv[2];
const require=createRequire(backend+'/package.json');
const {PrismaClient}=require('@prisma/client');
const {createApp}=await import(pathToFileURL(backend+'/dist/bootstrap/createApp.js'));
const db=new PrismaClient();
const run=crypto.randomUUID();
const observations=[];
let activeBarrier;
const gatedDb=new Proxy(db,{get(target,property){
 if(property==='$transaction') return (callback,options)=>target.$transaction(async tx=>{
  const gatedReport=new Proxy(tx.report,{get(model,key){
   if(key==='update') return async args=>{
    if(activeBarrier && args.where.id===activeBarrier.reportId && args.data.content){
     activeBarrier.ready(); await activeBarrier.release;
    }
    return model.update(args);
   };
   const v=model[key];return typeof v==='function'?v.bind(model):v;
  }});
  const gatedTx=new Proxy(tx,{get(t,k){if(k==='report')return gatedReport;const v=t[k];return typeof v==='function'?v.bind(t):v;}});
  return callback(gatedTx);
 },options);
 const v=target[property];return typeof v==='function'?v.bind(target):v;
}});
try {
 await db.$queryRaw`SELECT 1`;
 const user=await db.user.create({data:{id:'post-review-'+run,username:'post-review-'+run,displayName:'Synthetic reviewer',passwordHash:'synthetic-only',systemRole:'ADMIN',status:'ACTIVE'}});
 let actor={userId:user.id,user,systemRole:'ADMIN',permissions:['projects.create','projects.view','reports.submit','reports.update','tasks.view','reports.view','roles.create']};
 const app=createApp({db:gatedDb,actorResolver:async()=>actor});
 const req=async(path,method='GET',body)=>{
  const response=await app.request(path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 };
 const valid=await req('/api/projects','POST',{name:'Review positive fixture',type:'TESTING',clientMutationId:'review-valid-'+run});
 assert.equal(valid.status,201,JSON.stringify(valid.body));
 observations.push({case:'aggregate-authorized-positive',status:valid.status,projectId:valid.body.id,persisted:await db.project.count({where:{id:valid.body.id}})});
 const projectId=valid.body.id;
 for(const [label,payload] of [['subtype-object',{subtype:{unexpected:'object'}}],['array-project-type',{type:['TESTING']}],['boolean-startDate',{startDate:false}]]){
  const name='Review-'+label+'-'+run;
  const result=await req('/api/projects','POST',{name,type:'TESTING',...payload,clientMutationId:'review-'+label+'-'+run});
  const row=await db.project.findFirst({where:{name},select:{type:true,subtype:true,startDate:true}});
  observations.push({case:'aggregate-'+label,status:result.status,code:result.body.code,persisted:row});
 }
 const role=await req('/api/roles','POST',{code:'POST_REVIEW_'+run.replaceAll('-','').slice(0,12).toUpperCase(),name:'Positive role'});
 assert.equal(role.status,201,JSON.stringify(role.body));
 const invalidRole=await req('/api/roles','POST',{code:['ARRAY_ROLE'],name:'Invalid'});
 assert.equal(invalidRole.status,400);
 observations.push({case:'role-scalar-positive-and-negative',success:role.status,invalidArray:invalidRole.status});
 const report=await db.report.create({data:{projectId,authorId:user.id,reportType:'MONTHLY',periodKey:'2026-10',content:{revision:'submit-source'}}});
 let ready,release;
 const gateReady=new Promise(r=>ready=r),gateRelease=new Promise(r=>release=r);
 activeBarrier={reportId:report.id,ready,release:gateRelease};
 const updatePromise=req('/api/reports/'+report.id,'PUT',{content:{revision:'late-draft-write'},clientMutationId:'review-draft-'+run});
 try {
  await Promise.race([gateReady,new Promise((_,reject)=>setTimeout(()=>reject(new Error('draft gate not reached')),5000))]);
  const submitted=await req('/api/reports/'+report.id+'/submit','POST',{clientMutationId:'review-submit-'+run});
  assert.equal(submitted.status,200,JSON.stringify(submitted.body));
  release();const updated=await updatePromise;
  const persisted=await db.report.findUnique({where:{id:report.id}});
  const version=await db.reportVersion.findFirst({where:{reportId:report.id}});
  observations.push({case:'submit-commits-before-validated-draft-write',submitStatus:submitted.status,lateDraftStatus:updated.status,reportStatus:persisted.status,currentVersion:persisted.currentVersion,currentContent:persisted.content,versionContent:version.content,receiptCount:await db.mutationReceipt.count({where:{resourceScope:'report:'+report.id}})});
  assert.equal(updated.status,200);assert.equal(persisted.status,'SUBMITTED');assert.notDeepEqual(persisted.content,version.content);
 }finally{release();activeBarrier=null;}
 actor={...actor,permissions:[]};
 const zero=await req('/api/sync/init');assert.equal(zero.status,200);
 observations.push({case:'zero-permission-current-source',responseStatus:zero.status,visibleProjectCount:zero.body.acl.projectIds.length,upsertCount:Object.values(zero.body.changes).reduce((n,b)=>n+b.upserts.length,0)});
 console.log(JSON.stringify({run,authentication:'injected trusted actor; not JWT acceptance',database:'unique owned real PostgreSQL',instrumentation:'only pauses actual report.update after route validation; original transaction/ORM/SQL execute unchanged',observations},null,2));
}finally{await db.$disconnect();}
