import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { HttpError } from '../../kernel/http.js';
type Registry=Record<string,any>;
const tables:Record<string,string>={projects:'projects',projectPhases:'project_phases',tasks:'tasks',milestones:'milestones',monthlyProgress:'monthly_progress',reports:'reports',projectMembers:'project_members'};
const PAGE_SIZE=500, MAX_PUBLISH=10000;
/** Head allocation and publication COMMIT together. Producers never lock this head. */
export async function publishCommittedChanges(db:any):Promise<void>{
 await db.$transaction(async(tx:any)=>{
  const states=await tx.$queryRaw`SELECT epoch,status FROM data_recovery_state WHERE id=1 FOR SHARE`;
  const dataset=states[0];if(!dataset||dataset.status!=='READY')throw new HttpError(503,'RESTORE_NEEDS_RECONCILIATION','Dataset is not ready');
  await tx.syncPublicationState.upsert({where:{epoch:dataset.epoch},create:{epoch:dataset.epoch},update:{}});
  await tx.$queryRaw`SELECT epoch FROM sync_publication_state WHERE epoch=${dataset.epoch}::uuid FOR UPDATE`;
  const state=await tx.syncPublicationState.findUniqueOrThrow({where:{epoch:dataset.epoch}});
  if(!state.initialized){
   // Known table names only. Lock source set before copying; no head lock in producers.
   for(const table of Object.values(tables).sort())await tx.$executeRaw(Prisma.raw(`LOCK TABLE "${table}" IN SHARE MODE`));
   for(const [entity,table] of Object.entries(tables)){
    const tombstone=entity==='projectMembers'?'left_at':'deleted_at';
    await tx.$executeRaw(Prisma.sql`SELECT rdpms_capture_sync_row(${dataset.epoch}::uuid,${entity},to_jsonb(t),CASE WHEN ${Prisma.raw('t.'+tombstone)} IS NULL THEN 'upsert' ELSE 'delete' END) FROM ${Prisma.raw('"'+table+'"')} t WHERE NOT EXISTS (SELECT 1 FROM sync_source_revisions r WHERE r.epoch=${dataset.epoch}::uuid AND r.entity=${entity} AND r.entity_id=t.id)`);
   }
  }
  const pending=await tx.syncChangeEvent.findMany({where:{epoch:dataset.epoch,publishedSequence:null},orderBy:[{entity:'asc'},{entityId:'asc'},{revision:'asc'}],take:MAX_PUBLISH+1});
  if(pending.length>MAX_PUBLISH)throw new HttpError(503,'SYNC_PUBLISH_BACKLOG_TOO_LARGE','Publication cap reached; no cursor advancement. Target budget not certified.');
  let head:bigint=state.head;
  for(const event of pending){head++;const changed=await tx.syncChangeEvent.updateMany({where:{id:event.id,publishedSequence:null},data:{publishedSequence:head}});if(changed.count!==1)throw new Error('SYNC_PUBLICATION_ASSIGNMENT_CONFLICT');}
  await tx.syncPublicationState.update({where:{epoch:dataset.epoch},data:{head,initialized:true}});
 },{isolationLevel:'ReadCommitted',timeout:180000,maxWait:15000});
}
function sign(value:any):string{
 const key=process.env.JWT_SECRET;if(!key)throw new Error('JWT_SECRET_REQUIRED');
 const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return 'rdpms2.'+payload+'.'+crypto.createHmac('sha256',key).update(payload).digest('base64url');
}
function decode(raw:string):any{
 if(!raw.startsWith('rdpms2.'))throw new HttpError(409,'RESET_REQUIRED','Legacy checkpoint requires controlled full snapshot; retain original outbox');
 const [,payload,sig,...extra]=raw.split('.');const key=process.env.JWT_SECRET;if(!key)throw new Error('JWT_SECRET_REQUIRED');
 const expected=crypto.createHmac('sha256',key).update(payload??'').digest('base64url');
 if(extra.length||!sig||Buffer.byteLength(sig)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw new HttpError(400,'SYNC_CURSOR_INVALID','Invalid signed cursor');
 let value;try{value=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw new HttpError(400,'SYNC_CURSOR_INVALID','Invalid cursor');}return value;
}
const integer=(v:any):bigint=>{if(typeof v!=='string'||! /^\d+$/.test(v))throw new HttpError(400,'SYNC_CURSOR_INVALID','Invalid sequence');return BigInt(v);};
function assertBinding(state:any,auth:any,acl:any,deviceId:string){
 if(state.version!==2||state.actorId!==auth.userId)throw new HttpError(400,'SYNC_CURSOR_INVALID','Cursor owner/device mismatch');
 if(state.epoch!==acl.datasetEpoch)throw new HttpError(409,'RESET_REQUIRED','Dataset changed; retain original commands');
 if(state.deviceId!==deviceId)throw new HttpError(400,'SYNC_CURSOR_INVALID','Cursor device mismatch');
 if(state.aclVersion!==acl.aclVersion)throw new HttpError(409,'RESET_REQUIRED','Current authorization changed; full backfill required');
}
export async function pullPublishedChanges(db:any,registry:Registry,auth:any,acl:any,params:{deviceId:string;since?:string;pageToken?:string}){
 const state=await db.syncPublicationState.findUniqueOrThrow({where:{epoch:acl.datasetEpoch}});
 let lower=0n,upper:bigint=state.head,after=0n,full=true;
 const binding={version:2,actorId:auth.userId,deviceId:params.deviceId,epoch:acl.datasetEpoch,aclVersion:acl.aclVersion};
 if(params.pageToken){const p=decode(params.pageToken);assertBinding(p,auth,acl,params.deviceId);if(p.kind!=='page')throw new HttpError(400,'SYNC_CURSOR_INVALID','Expected page cursor');lower=integer(p.lower);upper=integer(p.upper);after=integer(p.after);full=p.full===true;}
 else if(params.since){const p=decode(params.since);assertBinding(p,auth,acl,params.deviceId);if(p.kind!=='checkpoint')throw new HttpError(400,'SYNC_CURSOR_INVALID','Expected checkpoint');lower=integer(p.sequence);full=false;}
 if((!full&&lower<state.floor)||upper<state.floor||upper>state.head||lower>upper||after>upper)throw new HttpError(409,'RESET_REQUIRED','Retained sequence window no longer available');
 const entities=Object.keys(registry).filter(k=>auth.permissions.includes(registry[k].readPermission));
 let rows:any[]=[];
 if(entities.length&&acl.projectIds.length){
  // Collapse by SOURCE revision before filtering incremental sequence. Older late publication
  // cannot replace the already published higher revision; authorization filtering precedes collapse.
  rows=await db.$queryRaw(Prisma.sql`SELECT * FROM (
    SELECT DISTINCT ON(entity,entity_id) * FROM sync_change_events
    WHERE epoch=${acl.datasetEpoch}::uuid AND published_sequence<=${upper}
      AND entity IN (${Prisma.join(entities)}) AND project_id IN (${Prisma.join(acl.projectIds)})
      AND (entity<>'reports' OR author_id=${auth.userId})
    ORDER BY entity,entity_id,revision DESC,published_sequence DESC
   ) latest WHERE (${full} OR published_sequence>${lower}) AND published_sequence>${after}
   ORDER BY published_sequence ASC LIMIT ${PAGE_SIZE+1}`);
 }
 const hasMore=rows.length>PAGE_SIZE;rows=rows.slice(0,PAGE_SIZE);
 const changes:Record<string,any>=Object.fromEntries(Object.keys(registry).map(k=>[k,{upserts:[],tombstones:[],tombstoneRevisions:{},authorizationTombstones:[]}]));
 for(const entity of entities){const group=rows.filter(e=>e.entity===entity),def=registry[entity];if(!group.length)continue;
  // Only current scope/liveness metadata is read from live rows. Payload is always captured revision.
  const metadata=await db[def.model].findMany({where:{id:{in:group.map(e=>e.entity_id)}},select:{id:true,...(entity==='projects'?{}:{projectId:true}),...(def.ownOnly?{authorId:true}:{}),[def.tombstoneField]:true}});
  const current=new Map<string,any>(metadata.map((m:any)=>[m.id,m]));
  const model=Prisma.dmmf.datamodel.models.find(m=>m.name[0].toLowerCase()+m.name.slice(1)===def.model)!;
  const fields=new Map(model.fields.filter(f=>f.kind!=='object').map(f=>[f.name,f.dbName??f.name]));
  for(const event of group){const live=current.get(event.entity_id);const authorized=live&&acl.projectIds.includes(entity==='projects'?live.id:live.projectId)&&(!def.ownOnly||live.authorId===auth.userId)&&!live[def.tombstoneField];
   if(event.action==='delete'||!authorized){changes[entity].tombstones.push(event.entity_id);changes[entity].tombstoneRevisions[event.entity_id]=String(event.revision);if(!authorized)changes[entity].authorizationTombstones.push(event.entity_id);continue;}
   const projection:any={};for(const name of def.readFields){const dbName=fields.get(name);if(dbName&&Object.hasOwn(event.payload,dbName))projection[name]=event.payload[dbName];}
   projection._syncRevision=String(event.revision);changes[entity].upserts.push(projection);
  }
 }
 const next=rows.length?String(rows.at(-1).published_sequence):String(after);
 return {pullProtocol:2,datasetEpoch:acl.datasetEpoch,serverTime:new Date().toISOString(),
  cursor:sign({...binding,kind:'checkpoint',sequence:String(hasMore?lower:upper)}),full,acl,entities:Object.keys(registry),changes,
  pagination:{hasMore,nextPageToken:hasMore?sign({...binding,kind:'page',lower:String(lower),upper:String(upper),after:next,full}):null}};
}
