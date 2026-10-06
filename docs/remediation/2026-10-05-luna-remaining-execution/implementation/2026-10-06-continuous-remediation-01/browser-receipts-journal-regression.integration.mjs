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
const evidence={layer:'REAL_CHROME_NATIVE_JWT_BACKEND_POSTGRES_INDEXEDDB_V1_RECEIPTS',cases:[],trace:[],cleanup:{},limits:['Candidate local fixtures only; no deployed client/target/release acceptance','Test app wrapper controls responses and transaction faults; current production routes/commands/auth/permissions/IDB unchanged']};
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
test('native legal JWT → reserve → push → durable query/ack has one business/audit/receipt effect',async()=>{const f=await fixture();await enqueue(f);assert.equal(await sync(),null);assert.equal((await rows()).length,0);assert.equal((await db.task.findUnique({where:{id:f.task.id}})).title,f.change.data.title);assert.equal((await audit(f.key)).length,1);assert.equal((await db.syncMutation.findUnique({where:{clientMutationId:f.key}})).status,'applied');record('NATIVE_LEGAL_NONEMPTY');});
test('native reservation committed response loss preserves original key/hash/device and repeats never-pushed reserve',async()=>{const f=await fixture();await enqueue(f);await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*api/sync/receipts/reserve',requestStage:'Response'}]},tab1);const intercepted=cdp.once(tab1,'Fetch.requestPaused');await evaluate(tab1,'bridge.nativeSyncStart()');const ev=await deadline(intercepted,'RESERVE_RESPONSE');assert.equal(ev.responseStatusCode,200);const receipt=await db.syncMutation.findUnique({where:{clientMutationId:f.key}});assert.equal(receipt.status,'pending');await cdp.send('Fetch.failRequest',{requestId:ev.requestId,errorReason:'ConnectionClosed'},tab1);await evaluate(tab1,'bridge.awaitSyncEnd()');await cdp.send('Fetch.disable',{},tab1);let row=(await rows())[0];assert.equal(row.attempt,'reserving');assert.ok(!row.receiptHandle);assert.equal((await audit(f.key)).length,0);assert.ok(await sync()===null);assert.equal((await rows()).length,0);assert.equal((await db.syncMutation.findUnique({where:{clientMutationId:f.key}})).id,receipt.id);assert.equal((await audit(f.key)).length,1);record('NATIVE_RESERVE_RESPONSE_LOSS');});
test('native committed push response loss queries actual persisted receipt and never duplicates business audit',async()=>{const f=await fixture();await enqueue(f);await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*api/sync/push',requestStage:'Response'}]},tab1);const intercepted=cdp.once(tab1,'Fetch.requestPaused');await evaluate(tab1,'bridge.nativeSyncStart()');const ev=await deadline(intercepted,'COMMITTED_PUSH_RESPONSE');assert.equal(ev.responseStatusCode,200);assert.equal((await audit(f.key)).length,1);assert.equal((await db.task.findUnique({where:{id:f.task.id}})).title,f.change.data.title);await cdp.send('Fetch.failRequest',{requestId:ev.requestId,errorReason:'ConnectionClosed'},tab1);await evaluate(tab1,'bridge.awaitSyncEnd()');await cdp.send('Fetch.disable',{},tab1);assert.equal((await rows()).length,0);assert.equal((await audit(f.key)).length,1);assert.ok(evidence.trace.some(r=>r.path.endsWith('/receipts/query')&&r.keys?.includes(f.key)));record('NATIVE_COMMITTED_RESPONSE_LOSS');});
test('native partial500 commits prefix only; query ack prefix and retries pending original bindings',async()=>{const fsx=await Promise.all([fixture(),fixture(),fixture()]);for(const f of fsx)await enqueue(f);mode='partial';faultCounter=0;await sync();mode='normal';assert.equal((await rows()).length,2);assert.equal((await audit(fsx[0].key)).length,1);for(const f of fsx.slice(1)){assert.equal((await audit(f.key)).length,0);assert.equal((await db.task.findUnique({where:{id:f.task.id}})).title,'before');}await sync();assert.equal((await rows()).length,0);for(const f of fsx)assert.equal((await audit(f.key)).length,1);record('NATIVE_PARTIAL_500_THREE_COMMANDS');});
test('native malformed response and unavailable query preserve original, explicit recheck queries same committed receipt',async()=>{const f=await fixture();await enqueue(f);mode='malformed';await sync();mode='normal';const row=(await rows())[0];assert.equal(row.recoveryStatus,'unknown');assert.ok(row.receiptHandle&&row.payloadHash);const count=evidence.trace.filter(r=>r.path.endsWith('/push')).length;await sync();assert.equal(evidence.trace.filter(r=>r.path.endsWith('/push')).length,count);await evaluate(tab1,'bridge.network(true);true');await evaluate(tab1,'bridge.nativeSyncStart()');await evaluate(tab1,'bridge.awaitSyncEnd()');await evaluate(tab1,'bridge.network(false);true'); // automatic still fenced
await evaluate(tab1,'bridge.manualSync()');assert.equal((await rows()).length,0);assert.equal((await audit(f.key)).length,1);record('NATIVE_UNKNOWN_EXPLICIT_SAME_BINDING_QUERY');});
test('native owner switch during reservation cannot send A command as B or discard A original',async()=>{const f=await fixture();await enqueue(f);const g=hold('/api/sync/receipts/reserve');await evaluate(tab1,'bridge.nativeSyncStart()');try{await deadline(g.hit,'RESERVE_HELD');await login(actorB,tab2);}finally{release(g);}await evaluate(tab1,`bridge.waitActor(${JSON.stringify(actorB.id)})`);await evaluate(tab1,'bridge.awaitSyncEnd()');assert.equal((await rows()).length,0);assert.equal((await audit(f.key)).length,0);const all=await evaluate(tab1,'bridge.raw("ownerOutbox")');assert.ok(all.some(r=>r.userId===actorA.id&&r.clientMutationId===f.key));await login(actorA);const finalError=await sync();console.log('JOURNAL_OWNER_REENTRY',JSON.stringify({finalError,rows:await rows(),state:await evaluate(tab1,'bridge.state()')}));assert.equal((await rows()).length,0);assert.equal((await audit(f.key)).length,1);record('NATIVE_A_RESERVE_B_LOGIN_FENCE');});
