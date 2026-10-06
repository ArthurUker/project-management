/** Test-only protocol fixture. Never relax the server or fabricate handles.
 * Unit fixtures remain stubs; real DB/JWT acceptance is recorded separately.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../../dist/bootstrap/createApp.js';

export function createSyncUnitApp({ db, actorResolver, ...options }) {
  const actors = new Map();
  db.user.findUnique = async ({ where }) => structuredClone(actors.get(where.id)?.user ?? null);
  db.userRole.findMany = async ({ where }) => {
    const actor = actors.get(where.userId);
    return actor ? [{ role: { permissions: actor.permissions.map(code => ({ permission: { code } })) } }] : [];
  };
  db.syncDevice.findUnique = async ({ where }) => structuredClone(db.state.syncDevices.find(d => d.id === where.id) ?? null);
  db.syncDevice.create = async ({ data }) => {
    assert.ok(!db.state.syncDevices.some(d => d.id === data.id));
    const row = { datasetEpoch: (await db.dataRecoveryState.findUniqueOrThrow({where:{id:1}})).epoch, ...data }; db.state.syncDevices.push(row); return structuredClone(row);
  };
  db.syncDevice.updateMany = async ({ where, data }) => {
    const rows = db.state.syncDevices.filter(d => d.id === where.id && d.userId === where.userId && (!where.datasetEpoch || d.datasetEpoch === where.datasetEpoch));
    rows.forEach(d => Object.assign(d, data)); return { count: rows.length };
  };
  db.syncMutation.findUnique = async ({ where }) => structuredClone(db.state.syncMutations.find(r => where.id ? r.id === where.id : r.clientMutationId === where.clientMutationId) ?? null);
  db.syncMutation.update = async ({ where, data }) => {
    const row = db.state.syncMutations.find(r => r.id === where.id);
    assert.ok(row, 'receipt update must target an existing reservation');
    Object.assign(row, data); return structuredClone(row);
  };
  return createApp({ db, ...options, actorResolver: async c => {
    const actor = await actorResolver(c);
    // Explicit persisted-actor fixture initialized once, not a server bypass.
    if (actor && !actors.has(actor.userId)) actors.set(actor.userId, structuredClone(actor));
    return actor;
  } });
}

export async function setRealSyncPermissions(db, userId, permissions) {
  assert.ok(await db.user.findUnique({ where: { id: userId } }), 'real ACTIVE actor fixture required');
  const code = `SYNC_TEST_${crypto.createHash('sha256').update(userId).digest('hex').slice(0,16)}`;
  const role = await db.role.upsert({ where: { code }, update: {}, create: { code, name: 'Synthetic sync protocol fixture', isSystem: false } });
  await db.$transaction(async tx => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const code of permissions) {
      const permission = await tx.permission.findUnique({ where: { code } });
      assert.ok(permission, `fixture permission must already exist: ${code}`);
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.create({ data: { userId, roleId: role.id } });
  });
}

/** Reserve real handles before push. Reservation failure is returned unchanged. */
export async function syncV1Request(app, url, options = {}, projectId = 'p1') {
  if (url !== '/api/sync/push') return app.request(url, options);
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  const envelope = { ...body, protocolVersion: 1, changes: body.changes.map(c => ({ ...c, projectId: c.projectId ?? c.data?.projectId ?? (c.entity === 'projects' ? c.id : projectId) })) };
  const reserve = await app.request('/api/sync/receipts/reserve', { ...options, body: JSON.stringify(envelope) });
  if (!reserve.ok) return reserve;
  const response = await reserve.json();
  assert.equal(response.protocolVersion, 1);
  assert.equal(response.results.length, envelope.changes.length);
  envelope.changes = envelope.changes.map((c, index) => {
    const receipt = response.results[index];
    assert.ok(['pending','applied','conflict','rejected'].includes(receipt.status), `valid fixture reservation: ${JSON.stringify(receipt)}`);
    assert.ok(receipt.receiptHandle && receipt.payloadHash, 'server-generated reservation is required');
    return { ...c, receiptHandle: receipt.receiptHandle, payloadHash: receipt.payloadHash };
  });
  return app.request(url, { ...options, body: JSON.stringify(envelope) });
}

/** Assertion view of actual response; raw HTTP body/status remain inspectable.
 * A reservation business denial may precede push in v1. No 401/426/500 accepted.
 */
export async function readSyncResult(response) {
  const body = await response.json();
  if (Array.isArray(body.results)) return body;
  assert.ok([400,403,404,409].includes(response.status), `unexpected fixture HTTP ${response.status}: ${JSON.stringify(body)}`);
  assert.ok(body.code && !['SESSION_INVALID','UNAUTHORIZED','UPGRADE_REQUIRED','INVALID_TOKEN'].includes(body.code), 'auth/protocol failure cannot stand in for business rejection');
  assert.ok(body.code !== 'VALIDATION_ERROR' || /phaseId|parentId/.test(body.error ?? ''), 'malformed fixture is not a permission rejection');
  return { ...body, assertionViewOnly: true, actualHttpStatus: response.status, stage: 'reserve', results: [{ status: body.code === 'CONFLICT' ? 'conflict' : 'rejected', code: body.code, reason: body.error ?? body.message ?? body.code }] };
}

export function syncV1JsonRequest(app, url, { method = 'POST', body, actor, headers: extra } = {}) {
  const headers = { 'content-type': 'application/json', ...(extra ?? {}) };
  if (actor) headers['x-test-actor'] = actor;
  return syncV1Request(app, url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
