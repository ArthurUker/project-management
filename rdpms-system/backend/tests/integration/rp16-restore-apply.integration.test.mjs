import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { createApp } from '../../dist/bootstrap/createApp.js';
import { RESTORE_TABLES } from '../../dist/kernel/backupRestore.js';
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname.slice(1), process.env.RDPMS_EXEC_OWNED_DB);
const db = new PrismaClient(), app = createApp({ db }), uuid = () => crypto.randomUUID(), trace = [];
let actor, token, project;
const backup = data => ({ version: '2.0', data }), json = v => JSON.parse(JSON.stringify(v));
async function req(data, server = app, endpoint = '/restore') { const r = await server.request('/api/backup' + endpoint, { method: data ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) }); const v = await r.json(); trace.push({ endpoint, status: r.status, response: v });
    if(r.status===200 && ['/restore','/restore/reconcile'].includes(endpoint)){ const login=await app.request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:actor.username,password:'Owned Restore Apply 2026!'})});assert.equal(login.status,200);token=(await login.json()).accessToken; } return { r, v }; }
function txProxy(modifier) { let index = 0; return new Proxy(db, { get(t, k) { if (k === '$transaction')
        return async (fn, opts) => { index++; return modifier(t, fn, opts, index); }; return typeof t[k] === 'function' ? t[k].bind(t) : t[k]; } }); }
function replaceModel(tx, model, override) { return new Proxy(tx, { get(t, k) { if (k === model)
        return new Proxy(t[k], { get(m, key) { if (override[key])
                return override[key](m); return typeof m[key] === 'function' ? m[key].bind(m) : m[key]; } }); return typeof t[k] === 'function' ? t[k].bind(t) : t[k]; } }); }
before(async () => { actor = await db.user.create({ data: { username: 'rp16apply-' + uuid(), displayName: 'Synthetic restore admin', systemRole: 'SUPER_ADMIN', status: 'ACTIVE', passwordHash: await bcrypt.hash('Owned Restore Apply 2026!', 4) } }); const r = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: actor.username, password: 'Owned Restore Apply 2026!' }) }); assert.equal(r.status, 200); const v = await r.json(); assert.equal(v.user.id, actor.id); token = v.accessToken; project = await db.project.create({ data: { code: 'RESTORE-' + uuid(), name: 'Owned restore original', type: 'TESTING', managerId: actor.id, createdById: actor.id } }); });
after(async () => { try {
    fs.writeFileSync(path.join(process.env.RDPMS_EXEC_EVIDENCE_DIR, 'restore-persistent-state.json'), JSON.stringify({ trace, state: await db.dataRecoveryState.findUnique({ where: { id: 1 } }), roles: await db.role.findMany(), project: await db.project.findUnique({ where: { id: project.id } }), audits: await db.auditLog.findMany({ where: { entityType: 'BACKUP' } }) }, null, 2));
}
finally {
    await db.$disconnect();
} });
test('native JWT legal merge reports actual insert/update/unchanged counts and exact persisted fields', async () => {
    const old = await db.role.create({ data: { code: 'OLD-' + uuid(), name: 'before' } }), same = await db.role.create({ data: { code: 'SAME-' + uuid(), name: 'same' } }), fresh = { id: uuid(), code: 'NEW-' + uuid(), name: 'new' };
    const r = await req({ backup: backup({ roles: [{ id: old.id, name: 'after' }, json(same), fresh] }) });
    assert.equal(r.r.status, 200, JSON.stringify(r.v));
    assert.equal(r.v.summary.reconciled, true);
    assert.equal(r.v.summary.inserted, 1);
    assert.equal(r.v.summary.updated, 1);
    assert.equal(r.v.summary.unchanged, 1);
    assert.equal((await db.role.findUnique({ where: { id: old.id } })).name, 'after');
    assert.equal((await db.role.findUnique({ where: { id: fresh.id } })).name, 'new');
    assert.equal((await db.dataRecoveryState.findUnique({ where: { id: 1 } })).status, 'READY');
    assert.equal(await db.auditLog.count({ where: { entityId: r.v.summary.runId } }), 2);
});
async function schemaFixture(modelName, cache) {
    if (cache.has(modelName))
        return cache.get(modelName);
    const m = Prisma.dmmf.datamodel.models.find(m => m.name === modelName), data = {};
    for (const f of m.fields.filter(f => f.kind !== 'object')) {
        if (f.isId)
            data[f.name] = uuid();
        else if (f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt) {
            if (f.isList)
                data[f.name] = [];
            else if (f.kind === 'enum')
                data[f.name] = Prisma.dmmf.datamodel.enums.find(e => e.name === f.type).values[0].name;
            else
                switch (f.type) {
                    case 'String':
                        data[f.name] = f.name === 'createdById' ? actor.id : f.name === 'periodKey' ? '2026-10' : f.name === 'version' ? 'V1.0' : uuid();
                        break;
                    case 'Int':
                    case 'Float':
                    case 'Decimal':
                        data[f.name] = 1;
                        break;
                    case 'Boolean':
                        data[f.name] = false;
                        break;
                    case 'DateTime':
                        data[f.name] = new Date('2026-10-06T00:00:00Z');
                        break;
                    case 'Json':
                        data[f.name] = {};
                        break;
                    default: throw Error('Unsupported required fixture scalar ' + f.type);
                }
        }
    }
    for (const rel of m.fields.filter(f => f.relationFromFields?.length && f.relationFromFields.every(n => m.fields.find(f => f.name === n).isRequired))) {
        let target = await schemaFixture(rel.type, cache);
        if (modelName === 'TaskDependency' && rel.relationFromFields.includes('prerequisiteId'))
            target = await db.task.create({ data: { projectId: target.projectId, title: 'Owned distinct prerequisite' } });
        if (modelName === 'PhaseTransition' && rel.relationFromFields.includes('toPhaseId'))
            target = await db.projectPhase.create({ data: { projectId: target.projectId, name: 'Owned distinct phase', code: 'SECOND-' + uuid(), sortOrder: 2 } });
        rel.relationFromFields.forEach((f, i) => data[f] = target[rel.relationToFields[i]]);
    }
    const result = await db[modelName[0].toLowerCase() + modelName.slice(1)].create({ data });
    cache.set(modelName, result);
    return result;
}
test('all supported tables have native unchanged effects and no append-only update/delete is attempted', async () => {
    const data = {}, cache = new Map();
    for (const t of RESTORE_TABLES) {
        const name = Prisma.dmmf.datamodel.models.find(m => m.name[0].toLowerCase() + m.name.slice(1) === t.model).name;
        data[t.key] = [json(await schemaFixture(name, cache))];
    }
    const r = await req({ backup: backup(data) });
    assert.equal(r.r.status, 200, JSON.stringify(r.v));
    assert.equal(r.v.summary.tables.length, RESTORE_TABLES.length);
    for (const effect of r.v.summary.tables) {
        assert.equal(effect.planned, 1);
        assert.equal(effect.inserted, 0);
        assert.equal(effect.updated, 0);
        assert.equal(effect.deleted, 0);
        assert.equal(effect.unchanged, 1);
    }
    trace.push({ allSupportedTablesNativeEffects: r.v.summary.tables });
});
test('duplicate and 501 target conflict reject full operation without false counts; preview is only advisory', async () => {
    const rows = Array.from({ length: 501 }, () => ({ id: uuid(), code: 'LATE-' + uuid(), name: 'Owned' }));
    const preview = await req({ backup: backup({ roles: rows }) }, app, '/restore/preview');
    assert.equal(preview.v.ok, true);
    const server = createApp({ db: txProxy(async (t, fn, opts, index) => { if (index === 1)
            await t.role.create({ data: { code: rows[500].code, name: 'Concurrent target winner' } }); return t.$transaction(fn, opts); }) });
    const r = await req({ backup: backup({ roles: rows }) }, server);
    assert.equal(r.r.status, 400);
    assert.ok(r.v.validation.errors.some(e => e.includes('target unique conflict code')));
    assert.equal(await db.role.count({ where: { id: { in: rows.map(r => r.id) } } }), 0);
    assert.equal((await db.dataRecoveryState.findUnique({ where: { id: 1 } })).status, 'READY');
});
test('strict audit/insert exception rolls back every table effect and leaves actual failed run state, not success', async () => {
    const fresh = { id: uuid(), code: 'ROLLBACK-' + uuid(), name: 'must rollback' };
    const server = createApp({ db: txProxy((t, fn, opts, index) => t.$transaction(tx => fn(index === 2 ? replaceModel(tx, 'auditLog', { create: () => async () => { throw Error('OWNED_RESTORE_AUDIT_FAULT'); } }) : tx), opts)) });
    const r = await req({ backup: backup({ roles: [fresh] }) }, server);
    assert.equal(r.r.status, 500);
    assert.equal(r.v.rolledBack, true);
    assert.equal(await db.role.findUnique({ where: { id: fresh.id } }), null);
    const state = await db.dataRecoveryState.findUnique({ where: { id: 1 } });
    assert.equal(state.status, 'READY');
    assert.equal(state.failureCode, 'PRE_COMMIT_ROLLBACK');
});
test('postcommit check fault preserves committed rows and durable gate; exact reconcile repairs verification without rerestore', async () => {
    const fresh = { id: uuid(), code: 'COMMITTED-' + uuid(), name: 'retained committed' };
    const server = createApp({ db: txProxy((t, fn, opts, index) => t.$transaction(tx => fn(index === 3 ? replaceModel(tx, 'role', { findMany: () => async () => { throw Error('OWNED_POSTCOMMIT_CHECK_FAULT'); } }) : tx), opts)) });
    const r = await req({ backup: backup({ roles: [fresh] }) }, server);
    assert.equal(r.r.status, 503);
    assert.equal(r.v.committed, true);
    assert.equal(r.v.rolledBack, false);
    assert.equal((await db.role.findUnique({ where: { id: fresh.id } })).name, fresh.name);
    const state = await db.dataRecoveryState.findUnique({ where: { id: 1 } });
    assert.equal(state.status, 'RESTORE_NEEDS_RECONCILIATION');
    assert.ok(state.manifest);
    const denied = await app.request('/api/projects/' + project.id, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'must not write' }) });
    assert.equal(denied.status, 401); assert.equal((await denied.json()).code,'DATASET_EPOCH_CHANGED');
    await assert.rejects(() => db.role.create({ data: { code: 'blocked-' + uuid(), name: 'blocked' } }), /RESTORE_WRITE_BLOCKED/);
    assert.equal((await req({ backup: backup({ roles: [fresh] }) })).r.status, 401);
    const fixed = await req({ runId: state.activeRunId }, app, '/restore/reconcile');
    assert.equal(fixed.r.status, 200);
    assert.equal((await db.dataRecoveryState.findUnique({ where: { id: 1 } })).status, 'READY');
    assert.equal(await db.role.count({ where: { id: fresh.id } }), 1);
});
test('commit response lost is identified from durable state instead of falsely reporting rollback', async () => {
    const fresh = { id: uuid(), code: 'LOST-' + uuid(), name: 'commit response lost' };
    const server = createApp({ db: txProxy(async (t, fn, opts, index) => { const result = await t.$transaction(fn, opts); if (index === 2)
            throw Error('OWNED_COMMIT_RESPONSE_LOST'); return result; }) });
    const r = await req({ backup: backup({ roles: [fresh] }) }, server);
    assert.equal(r.r.status, 503);
    assert.equal(r.v.committed, true);
    assert.equal(r.v.rolledBack, false);
    assert.ok(await db.role.findUnique({ where: { id: fresh.id } }));
    assert.equal((await req({ runId: r.v.runId }, app, '/restore/reconcile')).r.status, 200);
});
test('native writer share lock fences restore admission and current authority remains mandatory', async () => {
    const row = await db.role.create({ data: { code: 'FENCE-' + uuid(), name: 'before' } });
    let held, release, admitting;
    const reached = new Promise(r => held = r), gate = new Promise(r => release = r), admitReached = new Promise(r => admitting = r);
    const writer = db.$transaction(async (tx) => { await tx.role.update({ where: { id: row.id }, data: { name: 'admitted writer' } }); held(); await gate; }, { timeout: 10000 });
    let timer, restoring;
    try {
        await reached;
        const server = createApp({ db: txProxy((t, fn, opts, index) => t.$transaction(tx => fn(index === 1 ? new Proxy(tx, { get(t, k) { if (k === '$queryRaw')
                    return async (...args) => { if (String(args[0]).includes('data_recovery_state'))
                        admitting(); return t.$queryRaw(...args); }; return typeof t[k] === 'function' ? t[k].bind(t) : t[k]; } }) : tx), opts)) });
        restoring = req({ backup: backup({ roles: [{ id: row.id, name: 'restored after writer' }] }) }, server);
        await Promise.race([admitReached, new Promise((_, reject) => timer = setTimeout(() => reject(Error('Restore admission barrier not reached')), 5000))]);
    }
    finally {
        clearTimeout(timer);
        release();
    }
    await writer;
    assert.equal((await restoring).r.status, 200);
    assert.equal((await db.role.findUnique({ where: { id: row.id } })).name, 'restored after writer');
    const saved = await db.user.findUnique({ where: { id: actor.id } });
    await db.user.update({ where: { id: actor.id }, data: { status: 'DISABLED' } });
    const denied = await req({ backup: backup({ roles: [] }) });
    assert.equal(denied.r.status, 401);
    await db.user.update({ where: { id: actor.id }, data: { status: saved.status } });
});
test('composite-key replace reports exact actual deletions and insertion; append-only differences reject atomically', async () => {
    const role = await db.role.create({ data: { code: 'LINK-' + uuid(), name: 'Owned link role' } }), permission = await db.permission.findFirstOrThrow();
    const before = await db.rolePermission.count();
    const r = await req({ mode: 'replace', confirmReplace: true, backup: backup({ rolePermissions: [{ roleId: role.id, permissionId: permission.id }] }) });
    assert.equal(r.r.status, 200, JSON.stringify(r.v));
    assert.equal(r.v.summary.deleted, before);
    assert.equal(r.v.summary.inserted, 1);
    assert.equal(await db.rolePermission.count(), 1);
    assert.deepEqual((await db.rolePermission.findMany()).map(x => [x.roleId, x.permissionId]), [[role.id, permission.id]]);
    const original = await db.systemLog.findFirstOrThrow();
    const failed = await req({ backup: backup({ systemLogs: [{ id: original.id, action: 'attempt append-only mutation' }] }) });
    assert.equal(failed.r.status, 500);
    assert.equal(failed.v.rolledBack, true);
    assert.deepEqual(await db.systemLog.findUnique({ where: { id: original.id } }), original);
});
test('actual attachment and file metadata references are reconciled, while replacement cannot orphan them', async () => {
    const task = await db.task.create({ data: { projectId: project.id, title: 'Owned file reference task' } });
    const file = await db.fileObject.create({ data: { storageKey: 'owned-metadata-only-' + uuid(), originalName: 'synthetic metadata, no physical bytes', mimeType: 'text/plain', sizeBytes: 0, accessScope: 'PROJECT', ownerProjectId: project.id, ownerUserId: actor.id } });
    const attachment = await db.attachment.create({ data: { fileId: file.id, entityType: 'TASK', entityId: task.id } });
    const result = await req({ backup: backup({ tasks: [json(task)] }) });
    assert.equal(result.r.status, 200);
    const state = await db.dataRecoveryState.findUnique({ where: { id: 1 } });
    assert.equal(state.manifest.attachments.length, 1);
    assert.equal(state.manifest.fileMetadata.length, 1);
    assert.equal(state.manifest.fileMetadata[0].id, file.id);
    assert.equal(state.manifest.binaryFilesVerified, false);
    const reject = await req({ backup: backup({ tasks: [] }), mode: 'replace', confirmReplace: true });
    assert.equal(reject.r.status, 400);
    assert.ok(reject.v.validation.errors.some(e => e.includes('retained attachment metadata')));
    assert.ok(await db.task.findUnique({ where: { id: task.id } }));
    assert.deepEqual(await db.attachment.findUnique({ where: { id: attachment.id } }), attachment);
});

test('reconciliation commit response loss uses durable READY proof, not a false pending state',async()=>{
 const fresh={id:uuid(),code:'VERIFIED-LOST-'+uuid(),name:'already reconciled'};
 const server=createApp({db:txProxy(async(t,fn,opts,index)=>{const result=await t.$transaction(fn,opts);if(index===3)throw Error('OWNED_RECONCILIATION_RESPONSE_LOST');return result;})});
 const result=await req({backup:backup({roles:[fresh]})},server);assert.equal(result.r.status,200);assert.equal(result.v.summary.reconciled,true);assert.equal(result.v.summary.reconciliationResponseRecovered,true);assert.equal((await db.dataRecoveryState.findUnique({where:{id:1}})).status,'READY');assert.equal(await db.role.count({where:{id:fresh.id}}),1);
});

test('historical duplicate-user restore is reversed: two valid distinct PKs with same username reject, insert neither', async()=>{
 const username='restore-duplicate-'+uuid(), ids=[uuid(),uuid()];
 const rows=ids.map(id=>({id,username,displayName:'Owned duplicate fixture',passwordHash:actor.passwordHash}));
 const count=await db.user.count();const result=await req({backup:backup({users:rows})});
 assert.equal(result.r.status,400);assert.ok(result.v.validation.errors.some(e=>e.includes('duplicate payload unique username')));
 assert.equal(await db.user.count({where:{id:{in:ids}}}),0);assert.equal(await db.user.count(),count);
});
