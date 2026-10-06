import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs/promises'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
const root=process.cwd();const require=createRequire(path.join(root,'package.json'));
const {PrismaClient}=await import(require.resolve('@prisma/client'));const {serve}=await import(require.resolve('@hono/node-server'));const bcrypt=require('bcryptjs');
const {createApp}=await import(pathToFileURL(path.join(root,'dist/bootstrap/createApp.js')));
const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname.slice(1),process.env.RDPMS_EXEC_OWNED_DB);
const db=new PrismaClient();const app=createApp({db});const S=path.dirname(fileURLToPath(import.meta.url));const ROOT=path.resolve(root,'../..');
const evidence={layer:'REAL_CHROME_NATIVE_JWT_POSTGRES_RESTORE_EPOCH_LAST_COPY',cases:[],trace:[],cleanup:{},limits:['Candidate local fixtures only; no deployed client/target/release acceptance','Test app wrapper controls responses and transaction faults; current production routes/commands/auth/permissions/IDB unchanged']};
let chrome,chromeExit,temp,server,base,cdp,tab1,tab2,actorA,actorB,armed;let mode='normal';let faultCounter=0;const password='Owned native RP12 fixture 2026!';
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};}
async function deadline(promise, label, ms = 12000) {
  let timer; try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`OWNED_DEADLINE_${label}`)), ms); })]); }
  finally { clearTimeout(timer); }
}
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.pending = new Map(); this.events = new Map(); this.id = 0;
    this.opened = new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', () => reject(new Error('OWNED_CDP_OPEN_FAILED')), { once: true }); });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) { const item = this.pending.get(message.id); if (!item) return;
        this.pending.delete(message.id); message.error ? item.reject(new Error(item.method + ': ' + message.error.message)) : item.resolve(message.result); }
      else { const key = `${message.sessionId ?? ''}:${message.method}`; for (const cb of this.events.get(key) ?? []) cb(message.params); this.events.delete(key); }
    });
    this.ws.addEventListener('close', () => { for (const p of this.pending.values()) p.reject(new Error('OWNED_CDP_CLOSED')); this.pending.clear(); });
  }
  async send(method, params = {}, sessionId) {
    await this.opened; const id = ++this.id;
    const result = new Promise((resolve, reject) => this.pending.set(id, { method, resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return deadline(result, method, 15000);
  }
  once(sessionId, method) { const key = `${sessionId}:${method}`; return new Promise((resolve) => { const listeners = this.events.get(key) ?? []; listeners.push(resolve); this.events.set(key, listeners); }); }
}
async function evaluate(tab, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, tab);
  if (result.exceptionDetails) throw new Error('OWNED_BROWSER_EVALUATION: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
  return result.result.value;
}
async function page(route) {
  const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  // Prevent Chrome's shared HTTP-cache queue from serializing controlled held /me
  // responses. Both pages still use the same real origin/storage/Web Locks.
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.send('Page.enable', {}, sessionId); const loaded = cdp.once(sessionId, 'Page.loadEventFired');
  await cdp.send('Page.navigate', { url: base + route }, sessionId); await deadline(loaded, 'PAGE_LOAD');
  await evaluate(sessionId, 'new Promise(r=>window.bridge?r():window.addEventListener("rdpms-harness-ready",r,{once:true}))');
  return sessionId;
}

async function login(actor=actorA,tab=tab1){await evaluate(tab,`bridge.loginNative(${JSON.stringify(actor.username)},${JSON.stringify(password)},${JSON.stringify(actor.id)})`);}
async function rows(tab=tab1){return evaluate(tab,'bridge.rows()');}
async function fixture(key=crypto.randomUUID()) {const project=await db.project.create({data:{code:'RP12-'+crypto.randomUUID(),name:'Owned native receipt',type:'TESTING',managerId:actorA.id,createdById:actorA.id,members:{create:{userId:actorA.id,role:'MANAGER'}}}});const task=await db.task.create({data:{projectId:project.id,title:'before',createdById:actorA.id}});return {key,project,task,change:{clientMutationId:key,entity:'tasks',id:task.id,op:'upsert',projectId:project.id,data:{title:'after-'+key},baseUpdatedAt:task.updatedAt.toISOString()}};}
async function enqueue(f,tab=tab1){await evaluate(tab,`bridge.enqueueNative(${JSON.stringify(f.change)})`);}
async function sync(tab=tab1){return evaluate(tab,'bridge.syncExpectRetained()');}
async function audit(key){return db.auditLog.findMany({where:{metadata:{path:['clientMutationId'],equals:key}}});}
function record(name,details={}){evidence.cases.push({name,result:'PASS',...details});}
function hold(pathname){assert.ok(!armed);const hit=deferred(),released=deferred();armed={pathname,hit:hit.promise,signal:hit.resolve,released:released.promise,release:released.resolve,used:false};return armed;}
function release(g){g.release();if(armed===g)armed=null;}
const proxy=new Proxy(db,{get(t,k){if(k==='$transaction')return (fn,options)=>t.$transaction(tx=>fn(new Proxy(tx,{get(t,k){if(k==='syncMutation')return new Proxy(t[k],{get(m,op){if(op==='update')return async(args)=>{if(mode==='partial'&&++faultCounter===2)throw new Error('OWNED_SECOND_RECEIPT_WRITE_FAULT');return m.update(args);};const v=m[op];return typeof v==='function'?v.bind(m):v;}});const v=t[k];return typeof v==='function'?v.bind(t):v;}})),options);const v=t[k];return typeof v==='function'?v.bind(t):v;}});
const faultApp=createApp({db:proxy});
before(async()=>{
 const sourceNames=['idb.ts','engine.ts','deadLetter.ts','SyncProvider.tsx','RecoveryPanel.tsx'];
 evidence.sourceBindings=await Promise.all(sourceNames.map(async f=>({path:'rdpms-system/frontend/src/offline/'+f,sha256:crypto.createHash('sha256').update(await fs.readFile(path.join(root,'../frontend/src/offline',f))).digest('hex')})));
 for(const label of ['A','B']){const user=await db.user.create({data:{username:'rp12-'+label.toLowerCase()+'-'+crypto.randomUUID(),displayName:'Synthetic '+label,passwordHash:await bcrypt.hash(password,4),status:'ACTIVE',systemRole:'SUPER_ADMIN'}});if(label==='A')actorA=user;else actorB=user;}
 temp=await fs.mkdtemp(path.join(os.tmpdir(),'rdpms-native-sync-browser-'));
 const {build}=await import(pathToFileURL(path.join(root,'../frontend/node_modules/esbuild/lib/main.js')));
 await build({entryPoints:[path.join(root,'../frontend/src/offline/tests/rp11-owner.browser.tsx')],bundle:true,platform:'browser',format:'iife',outfile:path.join(temp,'bundle.js'),tsconfig:path.join(root,'../frontend/tsconfig.app.json'),define:{'import.meta.env':'{}'},logLevel:'warning'});const bundle=await fs.readFile(path.join(temp,'bundle.js'));
 server=serve({hostname:'127.0.0.1',port:0,fetch:async request=>{
 const u=new URL(request.url);if(u.pathname==='/bundle.js')return new Response(bundle,{headers:{'Content-Type':'application/javascript'}});
 if(!u.pathname.startsWith('/api/'))return new Response('<!doctype html><meta charset="utf-8"><div id="root"></div><script>window.nativeBackend=true;Object.defineProperty(navigator,"onLine",{configurable:true,value:false})</script><script src="/bundle.js"></script>',{headers:{'Content-Type':'text/html'}});
 const json=request.method==='POST'&&u.pathname.startsWith('/api/sync/')?await request.clone().json():null;
 const response=await (mode==='partial'?faultApp:app).fetch(request);evidence.trace.push({path:u.pathname,status:response.status,keys:json?.changes?.map(c=>c.clientMutationId),deviceId:json?.deviceId});
 if(mode==='query-denied'&&u.pathname.endsWith('/receipts/query'))return Response.json({error:'Owned uncertain query fixture'},{status:503});
 if(mode==='malformed'&&u.pathname.endsWith('/push')){mode='query-denied';return Response.json({protocolVersion:1,results:[]});}
 const g=armed;if(g&&!g.used&&g.pathname===u.pathname){g.used=true;g.signal();await g.released;}
 return response;
 }});if(!server.listening)await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 const endpoint=deferred();let stderr='';chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'profile'),'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-breakpad','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost','about:blank'],{stdio:['ignore','ignore','pipe']});chromeExit=new Promise(r=>chrome.once('exit',(code,signal)=>r({code,signal})));chrome.stderr.on('data',c=>{stderr+=c;const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)endpoint.resolve(m[1]);});cdp=new CDP(await deadline(endpoint.promise,'CHROME'));await cdp.opened;tab1=await page('/native');tab2=await page('/second');await login();
});
after(async()=>{if(armed)release(armed);if(cdp)try{await cdp.send('Browser.close')}catch{}if(chrome){try{evidence.cleanup.chromeExit=await deadline(chromeExit,'CHROME_EXIT',5000)}catch{chrome.kill('SIGTERM');evidence.cleanup.chromeExit=await deadline(chromeExit,'CHROME_TERM',5000)}}if(temp&&evidence.cleanup.chromeExit){await fs.rm(temp,{recursive:true});evidence.cleanup.ownedProfileRemoved=true;}if(server)await new Promise(r=>{server.close(r);server.closeAllConnections()});evidence.cleanup.serverClosed=!server?.listening;evidence.persistentState={tasks:await db.task.findMany(),receipts:await db.syncMutation.findMany(),audits:await db.auditLog.findMany()};await db.$disconnect();await fs.writeFile(path.join(process.env.RDPMS_EXEC_EVIDENCE_DIR,'native-browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');});
test('actual JWT/backend DB restore changes epoch; browser old uncertain original remains immutable and manual sync sends only new dataset intent',async()=>{
 const legal=await fixture();await enqueue(legal);assert.equal(await sync(),null);assert.equal((await db.task.findUnique({where:{id:legal.task.id}})).title,legal.change.data.title);assert.equal((await rows()).length,0);
 const old=await fixture();await enqueue(old);mode='malformed';await sync();mode='normal';const original=(await rows())[0];assert.equal(original.recoveryStatus,'unknown');assert.ok(original.receiptHandle&&original.payloadHash&&original.datasetEpoch);const persisted=await db.syncMutation.findUnique({where:{id:original.receiptHandle}});assert.equal(persisted.status,'applied');const beforeCount=(await audit(old.key)).length;assert.equal(beforeCount,1);
 const signed=await app.request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:actorA.username,password})});assert.equal(signed.status,200);const oldSession=await signed.json();
 const restored=await app.request('/api/backup/restore',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+oldSession.accessToken},body:JSON.stringify({backup:{version:'2.0',data:{roles:[]}}})});const restoreBody=await restored.json();assert.equal(restored.status,200,JSON.stringify(restoreBody));assert.notEqual(restoreBody.summary.datasetEpoch,original.datasetEpoch);assert.equal((await app.request('/api/auth/me',{headers:{Authorization:'Bearer '+oldSession.accessToken}})).status,401);
 await login();assert.equal(await evaluate(tab1,'bridge.epoch()'),restoreBody.summary.datasetEpoch);assert.deepEqual(await evaluate(tab1,'bridge.cache()'),[]);const isolated=(await rows())[0];assert.equal(isolated.datasetBlocked,restoreBody.summary.datasetEpoch);for(const key of['clientMutationId','data','baseUpdatedAt','deviceId','sequence','receiptHandle','payloadHash','createdAt','datasetEpoch'])assert.deepEqual(isolated[key],original[key]);const sendsBefore=evidence.trace.filter(t=>t.path==='/api/sync/push').length;await evaluate(tab1,'bridge.manualSync()');assert.equal(evidence.trace.filter(t=>t.path==='/api/sync/push').length,sendsBefore);assert.deepEqual(await db.syncMutation.findUnique({where:{id:original.receiptHandle}}),persisted);assert.equal((await audit(old.key)).length,1);
 const fresh=await fixture();await enqueue(fresh);await evaluate(tab1,'bridge.manualSync()');assert.equal((await db.task.findUnique({where:{id:fresh.task.id}})).title,fresh.change.data.title);assert.equal((await audit(fresh.key)).length,1);assert.deepEqual((await rows()).map(r=>r.clientMutationId),[old.key]);assert.equal((await rows())[0].data.title,original.data.title);record('ACTUAL_JWT_DB_CHROME_RESTORE_OLD_LAST_COPY_NO_REPLAY_NEW_INTENT_SUCCESS');
});
