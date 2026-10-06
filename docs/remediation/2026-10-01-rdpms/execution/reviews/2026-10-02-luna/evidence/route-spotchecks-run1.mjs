import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const backend = path.resolve(process.argv[2]);
const require = createRequire(path.join(backend, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { checkEnvironment } = await import(pathToFileURL(path.join(backend, 'scripts/lib/testDbGuard.mjs')));
const guard = checkEnvironment();
assert.deepEqual(guard.problems, []);
assert.match(guard.dbTarget.dbName, /^rdpms_test_rp01_review_/);
assert.equal(guard.dbTarget.port, process.env.REVIEW_OWNED_PORT);
assert.equal(guard.dbTarget.dbName, process.env.REVIEW_OWNED_DATABASE);
const { createApp } = await import(pathToFileURL(path.join(backend, 'dist/bootstrap/createApp.js')));
const prisma = new PrismaClient();
const password = crypto.randomBytes(24).toString('hex');
const prefix = `review-${crypto.randomUUID()}`;
const hash = await bcrypt.hash(password, 4);
const results = [];
const identity = await prisma.$queryRaw`SELECT current_database() AS db, inet_server_port() AS port`;
assert.equal(identity[0].db, process.env.REVIEW_OWNED_DATABASE);
assert.equal(String(identity[0].port), process.env.REVIEW_OWNED_PORT);
const app = createApp({ db: prisma });
async function login(username, supplied) {
  const response = await app.request('/api/auth/login', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ username, password: supplied }) });
  return { status: response.status, body: await response.json() };
}
try {
  const pending = await prisma.user.create({data:{ username:`${prefix}-pending`,displayName:'Review synthetic pending actor',passwordHash:hash,systemRole:'MEMBER',status:'PENDING_ACTIVATION',failedLoginAttempts:4 }});
  const fifth = await login(pending.username, 'wrong synthetic review password');
  const sixth = await login(pending.username, 'wrong synthetic review password');
  const stored = await prisma.user.findUnique({where:{id:pending.id}});
  results.push({case:'pending_activation_lock_threshold',fifthHttp:fifth.status,sixthHttp:sixth.status,persisted:{status:stored.status,failedLoginAttempts:stored.failedLoginAttempts,lockedUntil:stored.lockedUntil},note:'Current route accepts both bad-password checks without setting a lock.'});

  const expired = await prisma.user.create({data:{username:`${prefix}-expired`,displayName:'Review synthetic expired actor',passwordHash:hash,systemRole:'MEMBER',status:'LOCKED',failedLoginAttempts:5,lockedUntil:new Date(Date.now()-60000)}});
  const recovered = await login(expired.username,password);
  const recoveredRow=await prisma.user.findUnique({where:{id:expired.id}});
  results.push({case:'expired_lock_response_vs_database',http:recovered.status,returnedStatus:recovered.body.user?.status,persistedStatus:recoveredRow.status});

  const actor = await prisma.user.create({data:{username:`${prefix}-admin`,displayName:'Review synthetic administrator',passwordHash:hash,systemRole:'ADMIN',status:'ACTIVE'}});
  const authorized = createApp({db:prisma,actorResolver:async()=>({userId:actor.id,user:{id:actor.id,displayName:actor.displayName},systemRole:'ADMIN',permissions:['roles.create','projects.create']})});
  async function post(url,body){const r=await authorized.request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};}
  const validCode=`REVIEW_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const validRole=await post('/api/roles',{code:validCode,name:'Review positive role'});
  assert.equal(validRole.status,201);
  assert.equal((await prisma.role.findUnique({where:{code:validCode}})).isSystem,false);
  results.push({case:'role_invalid_code_type',positiveHttp:validRole.status,...await post('/api/roles',{code:[validCode+'_ARRAY'],name:'Review invalid array code'})});
  results.push({case:'role_invalid_name_type',...await post('/api/roles',{code:validCode+'_NAME',name:['invalid-name-array']})});
  const countBefore=await prisma.project.count({where:{createdById:actor.id}});
  const invalidTask=await post('/api/projects',{name:'Review invalid nested task',tasks:[{title:'Review task',applicability:{}}]});
  const countAfter=await prisma.project.count({where:{createdById:actor.id}});
  results.push({case:'project_invalid_nested_dto',http:invalidTask.status,errorCode:invalidTask.body.code,projectCountBefore:countBefore,projectCountAfter:countAfter});
  console.log(JSON.stringify({ownershipIdentity:identity[0],results},null,2));
} finally {
  // Keep audit-linked synthetic actors until the owned database is dropped.
  await prisma.$disconnect();
}
