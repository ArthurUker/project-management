import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { RESTORE_TABLES, validatePayload } from '../../dist/kernel/backupRestore.js';
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname.slice(1), process.env.RDPMS_EXEC_OWNED_DB);
const db = new PrismaClient(), app = createApp({ db }), uuid = () => crypto.randomUUID(), trace = [];
let actor, token, project;
const payload = (data) => ({ version: '2.0', data });
async function req(endpoint, body) {
  const r = await app.request('/api/backup'+endpoint, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer '+token, 'Content-Type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}) });
  const v = await r.json(); trace.push({endpoint,status:r.status,response:v}); return { r, v };
}
before(async () => {
  actor = await db.user.create({ data:{ username:'restore-registry-'+uuid(), displayName:'Synthetic restore admin', systemRole:'SUPER_ADMIN', status:'ACTIVE', passwordHash:await bcrypt.hash('Owned Restore Test 2026!',4) } });
  const login=await app.request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:actor.username,password:'Owned Restore Test 2026!'})});assert.equal(login.status,200);const v=await login.json();assert.equal(v.user.id,actor.id);token=v.accessToken;
  project=await db.project.create({data:{name:'Owned restore target',code:'RESTORE-'+uuid(),type:'TESTING',managerId:actor.id,createdById:actor.id}});
});
after(async()=>{try{fs.writeFileSync(path.join(process.env.RDPMS_EXEC_EVIDENCE_DIR,'registry-state.json'),JSON.stringify({trace,registry:RESTORE_TABLES.map(t=>({key:t.key,model:t.model,pk:t.pk,uniques:t.uniques,foreignKeys:t.foreignKeys})),roles:await db.role.findMany(),taskCount:await db.task.count(),project:await db.project.findUnique({where:{id:project.id}})},null,2));}finally{await db.$disconnect();}});
test('native JWT authorized nonempty supported preview is readonly and declares module/binary exclusions',async()=>{
 const count=await db.project.count();const r=await req('/restore/preview',{backup:payload({projects:[JSON.parse(JSON.stringify(project))]})});assert.equal(r.r.status,200);assert.equal(r.v.ok,true);assert.equal(r.v.tables[0].existing,1);assert.equal(await db.project.count(),count);assert.equal(r.v.scope.binaryFilesIncluded,false);assert.ok(r.v.scope.unsupportedModels.includes('fileObject'));assert.ok(r.v.scope.unsupportedModels.includes('projectPhase'));const tables=await req('/restore/tables');assert.equal(tables.r.status,200);assert.equal(tables.v.tables.length,RESTORE_TABLES.length);assert.ok(tables.v.tables.find(t=>t.key==='projectMembers').uniqueConstraints.some(f=>f.join('+')==='projectId+userId'));
});
function rowFor(table){const r={};for(const f of table.scalarFields){if(!f.isRequired||f.hasDefaultValue||f.isUpdatedAt)continue;if(f.isList){r[f.name]=[];continue;}switch(f.type){case'String':r[f.name]=uuid();break;case'Int':case'Float':case'Decimal':r[f.name]=1;break;case'Boolean':r[f.name]=false;break;case'DateTime':r[f.name]='2026-10-06T00:00:00.000Z';break;case'Json':r[f.name]={};break;default:if(f.kind==='enum')r[f.name]=Prisma.dmmf.datamodel.enums.find(e=>e.name===f.type).values[0].name;}}
 for(const f of table.pk)r[f]=uuid();return r;}
test('every supported schema PK/single/composite unique constraint rejects duplicate payload tuples',async()=>{
 let constraints=0;for(const t of RESTORE_TABLES){const m=Prisma.dmmf.datamodel.models.find(m=>m.name[0].toLowerCase()+m.name.slice(1)===t.model);assert.deepEqual(t.pk,m.primaryKey?.fields??m.fields.filter(f=>f.isId).map(f=>f.name));assert.equal(t.foreignKeys.length,m.fields.filter(f=>f.relationFromFields?.length).length);
 for(const fields of t.uniques){const a=rowFor(t),b=rowFor(t);for(const f of fields){if(a[f]===undefined){const sf=t.scalarFields.find(s=>s.name===f);a[f]=sf.kind==='enum'?Prisma.dmmf.datamodel.enums.find(e=>e.name===sf.type).values[0].name:sf.type==='Int'?1:uuid();}b[f]=a[f];}const v=await validatePayload(payload({[t.key]:[a,b]}),{db});assert.equal(v.ok,false,t.key+fields);assert.ok(v.errors.some(e=>e.includes(fields.every(f=>t.pk.includes(f))&&fields.length===t.pk.length?'duplicate primary key':'duplicate payload unique '+fields.join('+'))),JSON.stringify({key:t.key,fields,errors:v.errors}));constraints++;}}
 trace.push({allSchemaUniqueConstraintsExercised:constraints});assert.ok(constraints>40);
});
test('all 501 target unique tuples are queried; conflict beyond first chunk rejects with zero role writes',async()=>{
 const code='TAIL-'+uuid();await db.role.create({data:{code,name:'Occupied 501st'}});const rows=Array.from({length:501},(_,i)=>({id:uuid(),code:i===500?code:'FRESH-'+uuid(),name:'Owned '+i}));const count=await db.role.count();const good=await req('/restore/preview',{backup:payload({roles:rows.slice(0,500)})});assert.equal(good.v.ok,true);assert.equal(good.v.tables[0].new,500);const bad=await req('/restore/preview',{backup:payload({roles:rows})});assert.equal(bad.r.status,200);assert.equal(bad.v.ok,false);assert.ok(bad.v.errors.some(e=>e.includes('target unique conflict code')));assert.equal(await db.role.count(),count);
});
test('nullable null is legal but non-null missing phase and required project references are errors; replace does not resolve removed parents',async()=>{
 const valid={id:uuid(),title:'Owned nullable reference',projectId:project.id};const good=await validatePayload(payload({tasks:[{...valid,phaseId:null,parentId:null}]}),{db});assert.equal(good.ok,true,JSON.stringify(good.errors));for(const row of [{...valid,phaseId:uuid()},{...valid,projectId:uuid()},{...valid,projectId:null}]){const bad=await validatePayload(payload({tasks:[row]}),{db});assert.equal(bad.ok,false);assert.ok(bad.errors.length);}const replace=await validatePayload(payload({projects:[],tasks:[valid]}),{mode:'replace',db});assert.equal(replace.ok,false);assert.ok(replace.errors.some(e=>e.includes('unresolved foreign key projectId')));
});
test('supported composite unique target checks, scalar/unknown inputs and retained external replace references fail closed',async()=>{
 await db.projectMember.create({data:{projectId:project.id,userId:actor.id,role:'OWNER'}});const duplicate=await validatePayload(payload({projectMembers:[{id:uuid(),projectId:project.id,userId:actor.id}]}),{db});assert.equal(duplicate.ok,false);assert.ok(duplicate.errors.some(e=>e.includes('target unique conflict projectId+userId')));
 for(const row of [{id:uuid(),code:{},name:'bad'},{id:uuid(),code:'bad-'+uuid(),name:'bad',permissions:{create:[]}},{id:uuid(),code:'bad-'+uuid()}]){assert.equal((await validatePayload(payload({roles:[row]}),{db})).ok,false);}
 const replaced=await validatePayload(payload({users:[JSON.parse(JSON.stringify(actor))]}),{mode:'replace',db});assert.equal(replaced.ok,false);assert.ok(replaced.errors.some(e=>e.includes('retained auditLog')||e.includes('retained project')));
 const failingDb=new Proxy(db,{get(t,k){if(k==='role')return new Proxy(t.role,{get(m,k){if(k==='findMany')return async()=>{throw Error('OWNED_REGISTRY_QUERY_FAULT');};return typeof m[k]==='function'?m[k].bind(m):m[k];}});return typeof t[k]==='function'?t[k].bind(t):t[k];}});await assert.rejects(()=>validatePayload(payload({roles:[{id:uuid(),code:'fault',name:'fault'}]}),{db:failingDb}),/OWNED_REGISTRY_QUERY_FAULT/);
});
