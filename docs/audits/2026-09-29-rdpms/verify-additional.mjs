// Audit reproductions: assertions confirm defects, NOT acceptance of correct behavior.
// Requires a disposable backend build + dedicated PostgreSQL cluster under RDPMS_AUDIT_ROOT.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = process.env.RDPMS_AUDIT_ROOT;
assert(root && path.basename(root).startsWith('rdpms-deep-audit-'));
const cfg = JSON.parse(await fs.readFile(path.join(root, 'database.json'), 'utf8'));
const url = new URL(cfg.url);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/rdpms_audit_isolated');
process.env.DATABASE_URL = cfg.url;
process.env.DIRECT_URL = cfg.url;
process.env.JWT_SECRET = 'isolated-audit-key-never-used-for-real-accounts';
process.env.JWT_ACCESS_TTL = '15m';
process.env.UPLOAD_DIR = path.join(root, 'uploads');
const backend = path.join(root, 'backend');
const require = createRequire(path.join(backend, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
const [{ data_directory: dataDirectory }] = await db.$queryRawUnsafe('SHOW data_directory');
assert.equal(await fs.realpath(dataDirectory), await fs.realpath(path.join(root, 'pgdata')));
const { createApp } = await import(pathToFileURL(path.join(backend, 'dist/bootstrap/createApp.js')));
const results = [];
const password = 'Audit-Only-Strong!2026';
const passwordHash = await bcrypt.hash(password, 4);
const old = new Date('2026-01-01T00:00:00Z');
const user = async (id, systemRole = 'MEMBER') => db.user.create({ data: {
  id, username: id, displayName: id, passwordHash, systemRole,
}});
const actor = (u, permissions = [], systemRole = 'MEMBER') => ({
  userId: u.id, user: u, systemRole, permissions,
});
const project = async (id, manager, members = []) => db.project.create({ data: {
  id, code: id, name: id, type: 'TESTING', managerId: manager.id, updatedAt: old,
  members: { create: members.map(([u, role]) => ({ userId: u.id, role })) },
}});
async function request(who, method, resource, body, database = db, headers = {}) {
  const app = createApp({ db: database, ...(who ? { actorResolver: async () => who } : {}) });
  const response = await app.request(resource, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  return { status: response.status, body: parsed };
}
function wrapDb(overrides) {
  return new Proxy(db, { get(target, key) {
    if (key in overrides) return overrides[key];
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  }});
}
async function probe(id, fn) {
  try { const evidence = await fn(); results.push({ id, defectReproduced: true, evidence }); }
  catch (e) { results.push({ id, defectReproduced: false, error: e.stack }); }
}
const a = await db.user.findUniqueOrThrow({where:{id:'audit-author'}});
const outsider = await db.user.findUniqueOrThrow({where:{id:'audit-outsider'}});
await probe('B21_REGISTRATION_BYPASSES_PROJECT_SCOPE', async () => {
  const p = await project('audit-registration-scope', a, [[a, 'OWNER']]);
  await db.project.update({where:{id:p.id},data:{subtype:'registration'}});
  await db.task.create({data:{projectId:p.id,title:'registration-private-task'}});
  const reader = actor(outsider, ['projects.view','registrations.view']);
  const online = await request(reader, 'GET', `/api/projects/${p.id}`);
  const detail = await request(reader, 'GET', `/api/registrations/${p.id}`);
  const update = await request(actor(outsider,['registrations.update'],'MANAGER'), 'PUT', `/api/registrations/${p.id}`, {name:'modified-by-nonmember'});
  const row = await db.project.findUniqueOrThrow({where:{id:p.id}});
  assert.equal(online.status,404); assert.equal(detail.status,200);
  assert(detail.body.tasks.some(t=>t.title==='registration-private-task'));
  assert.equal(update.status,200); assert.equal(row.name,'modified-by-nonmember');
  return {normalProjectStatus:online.status,registrationDetailStatus:detail.status,nonmemberReadPrivateTask:true,nonmemberUpdateStatus:update.status,storedName:row.name};
});
await db.$disconnect();
const output = { executedAt: new Date().toISOString(), isolation: { database: 'rdpms_audit_isolated', dataDirectory, port: cfg.port },
  summary: { reproduced: results.filter(x => x.defectReproduced).length, notReproduced: results.filter(x => !x.defectReproduced).length }, results };
await fs.writeFile(path.join(root, 'additional-results.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (output.summary.notReproduced) process.exitCode = 1;
