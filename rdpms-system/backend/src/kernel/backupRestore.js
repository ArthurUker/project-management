import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../platform/db/client.js';
import { createRestoreRegistry, validateRestorePayload, restoreTuple } from './restoreSchemaRegistry.js';
import { admitRestore, requireRecoveryAdmin, restoreRunContext, recoveryHash } from '../platform/recovery/dataEpoch.js';
import { writeAuditStrict } from '../platform/audit/strictAudit.js';
import { AUDIT_ACTIONS } from './constants.js';
/** Application module JSON only. Unsupported tables and binary files are excluded. */
export const RESTORE_TABLES = createRestoreRegistry([
    { key: 'users', model: 'user', appendOnly: false },
    { key: 'roles', model: 'role', appendOnly: false },
    { key: 'permissions', model: 'permission', appendOnly: false },
    { key: 'docCategories', model: 'docCategory', appendOnly: false },
    { key: 'taskTemplates', model: 'taskTemplate', appendOnly: false },
    { key: 'taskTemplateSteps', model: 'taskTemplateStep', appendOnly: false },
    { key: 'reagentMaterials', model: 'reagentMaterial', appendOnly: false },
    { key: 'reagentLots', model: 'reagentLot', appendOnly: false },
    { key: 'reagentFormulas', model: 'reagentFormula', appendOnly: false },
    { key: 'formulaComponents', model: 'formulaComponent', appendOnly: false },
    { key: 'prepRecords', model: 'prepRecord', appendOnly: false },
    { key: 'projectTemplates', model: 'projectTemplate', appendOnly: false },
    { key: 'projects', model: 'project', appendOnly: false },
    { key: 'projectMembers', model: 'projectMember', appendOnly: false },
    { key: 'tasks', model: 'task', appendOnly: false },
    { key: 'taskDependencies', model: 'taskDependency', appendOnly: false },
    { key: 'milestones', model: 'milestone', appendOnly: false },
    { key: 'phaseTransitions', model: 'phaseTransition', appendOnly: false },
    { key: 'reports', model: 'report', appendOnly: false },
    { key: 'reportVersions', model: 'reportVersion', appendOnly: false },
    { key: 'monthlyProgress', model: 'monthlyProgress', appendOnly: false },
    { key: 'docDocuments', model: 'docDocument', appendOnly: false },
    { key: 'docVersions', model: 'docVersion', appendOnly: false },
    { key: 'primers', model: 'primer', appendOnly: false },
    { key: 'sampleMaterials', model: 'sampleMaterial', appendOnly: false },
    { key: 'rolePermissions', model: 'rolePermission', appendOnly: false },
    { key: 'systemLogs', model: 'systemLog', appendOnly: true },
]);
export async function validatePayload(payload, { mode = 'merge', db = prisma } = {}) {
    const result = await validateRestorePayload(db, RESTORE_TABLES, payload, { mode });
    if (mode === 'replace') {
        for (const [key, entityType] of [['tasks', 'TASK'], ['projects', 'PROJECT'], ['reports', 'REPORT'], ['docDocuments', 'DOCUMENT'], ['milestones', 'MILESTONE'], ['monthlyProgress', 'MONTHLY_PROGRESS'], ['docVersions', 'DOC_VERSION'], ['projectTemplates', 'TEMPLATE'], ['taskTemplates', 'TEMPLATE'], ['reagentFormulas', 'FORMULA'], ['prepRecords', 'PREP_RECORD'], ['primers', 'PRIMER'], ['sampleMaterials', 'SAMPLE'], ['users', 'USER']]) {
            if (!result.includedKeys.includes(key))
                continue;
            const table = RESTORE_TABLES.find((t) => t.key === key);
            const originals = await db[table.model].findMany({ select: { id: true } });
            for (let i = 0; i < originals.length; i += 500) {
                if (await db.attachment.count({ where: { entityType, entityId: { in: originals.slice(i, i + 500).map((r) => r.id) } } }))
                    result.errors.push(`replace blocked by retained attachment metadata -> ${key}`);
            }
        }
        result.ok = result.errors.length === 0;
    }
    result.securityPolicy = { existingUsers: 'PRESERVE_CURRENT_AUTH_FIELDS', newUsers: 'PENDING_ACTIVATION_UNGUESSABLE_SECRET_MEMBER', allSessions: 'REVOKE_ON_SUCCESSFUL_RESTORE', binaryFilesVerified: false };
    return result;
}
const PROTECTED_USER_AUTH_FIELDS = ['username','passwordHash','mustChangePassword','passwordChangedAt','systemRole','status','deletedAt','securityVersion','failedLoginAttempts','lockedUntil','lastLoginAt','lastLoginIp'];
async function safeRestoreData(tx, data) {
  const effective = {...data}, ignoredSecurityFields = [];
  if (data.users) {
    effective.users = [];
    for (const row of data.users) {
      const current = await tx.user.findUnique({where:{id:row.id}}), next = {...row};
      if (current) {
        for (const field of PROTECTED_USER_AUTH_FIELDS) {
          if (row[field] !== undefined && recoveryHash([row[field]]) !== recoveryHash([current[field]])) ignoredSecurityFields.push({userId:row.id,field});
          next[field] = current[field];
        }
      } else {
        next.passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'),10);
        next.status = 'PENDING_ACTIVATION'; next.systemRole = 'MEMBER'; next.mustChangePassword = true;
        next.securityVersion = 0; next.deletedAt = null; next.failedLoginAttempts = 0;
        next.lockedUntil = null; next.lastLoginAt = null; next.lastLoginIp = null; next.passwordChangedAt = null;
        ignoredSecurityFields.push({userId:row.id,field:'IMPORTED_AUTHENTICATION_DISABLED'});
      }
      effective.users.push(next);
    }
  }
  return {effective,ignoredSecurityFields};
}

const CHUNK = 500;
const wherePk = (table, row) => table.pk.length === 1 ? { [table.pk[0]]: row[table.pk[0]] }
    : { [table.pk.join('_')]: Object.fromEntries(table.pk.map((f) => [f, row[f]])) };
async function findRows(db, table, rows) {
    const found = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
        found.push(...await db[table.model].findMany({ where: { OR: rows.slice(i, i + CHUNK).map((r) => Object.fromEntries(table.pk.map((f) => [f, r[f]]))) } }));
    }
    return found;
}
function dependencyOrder(tables) {
    const pending = [...tables], ordered = [];
    while (pending.length) {
        const ready = pending.filter((t) => !t.foreignKeys.some((fk) => fk.targetKey !== t.key && pending.some((p) => p.key === fk.targetKey)));
        if (!ready.length)
            throw new Error('RESTORE_TABLE_DEPENDENCY_CYCLE');
        ordered.push(...ready);
        ready.forEach((t) => pending.splice(pending.indexOf(t), 1));
    }
    return ordered;
}
async function lockRestoreTables(tx, tables) {
    const names = Prisma.dmmf.datamodel.models.filter((m) => tables.some((t) => t.model === m.name[0].toLowerCase() + m.name.slice(1)))
        .map((m) => m.dbName || m.name).sort();
    for (const name of names)
        await tx.$executeRaw(Prisma.raw(`LOCK TABLE "${name.replaceAll('"', '""')}" IN SHARE ROW EXCLUSIVE MODE`));
}
async function buildManifest(tx, tables, data, counts) {
    const records = [];
    for (const table of tables) {
        const rows = await findRows(tx, table, data[table.key]);
        if (rows.length !== data[table.key].length)
            throw new Error('RESTORE_ROW_COUNT_MISMATCH');
        const effect = counts.find((c) => c.key === table.key);
        const totalAfter = await tx[table.model].count();
        if (totalAfter !== effect.totalBefore + effect.inserted - effect.deleted)
            throw new Error('RESTORE_TOTAL_COUNT_MISMATCH');
        records.push({ key: table.key, model: table.model, pk: table.pk, totalAfter,
            rows: rows.map((r) => ({ primaryKey: Object.fromEntries(table.pk.map((f) => [f, r[f]])), sha256: recoveryHash(r) })) });
    }
    const ids = tables.flatMap((t) => t.pk.length === 1 && t.pk[0] === 'id' ? data[t.key].map((r) => r.id) : []);
    const attachments = [];
    for (let i = 0; i < ids.length; i += CHUNK)
        attachments.push(...await tx.attachment.findMany({ where: { entityId: { in: ids.slice(i, i + CHUNK) } } }));
    const fileIds = new Set(attachments.map((a) => a.fileId));
    for (const t of tables)
        for (const fk of t.foreignKeys.filter((f) => f.targetModel === 'fileObject')) {
            if (fk.fields.length !== 1 || fk.targetFields[0] !== 'id')
                throw new Error('RESTORE_UNSUPPORTED_FILE_REFERENCE');
            for (const r of data[t.key])
                if (r[fk.fields[0]])
                    fileIds.add(r[fk.fields[0]]);
        }
    const files = [];
    const keys = [...fileIds];
    for (let i = 0; i < keys.length; i += CHUNK)
        files.push(...await tx.fileObject.findMany({ where: { id: { in: keys.slice(i, i + CHUNK) } } }));
    if (files.length !== keys.length)
        throw new Error('RESTORE_FILE_METADATA_REFERENCE_MISSING');
    return { kind: 'MODULE_JSON_METADATA_ONLY', tables: records,
        attachments: attachments.map((r) => ({ id: r.id, sha256: recoveryHash(r) })),
        fileMetadata: files.map((r) => ({ id: r.id, sha256: recoveryHash(r) })), binaryFilesVerified: false };
}
async function verifyManifest(tx, manifest) {
    if (!manifest || manifest.kind !== 'MODULE_JSON_METADATA_ONLY')
        throw new Error('RESTORE_MANIFEST_UNAVAILABLE');
    for (const entry of manifest.tables) {
        const table = RESTORE_TABLES.find((t) => t.key === entry.key && t.model === entry.model);
        if (!table || recoveryHash(table.pk) !== recoveryHash(entry.pk))
            throw new Error('RESTORE_REGISTRY_CHANGED');
        if (await tx[table.model].count() !== entry.totalAfter)
            throw new Error('RESTORE_TOTAL_DRIFT');
        const rows = new Map((await findRows(tx, table, entry.rows.map((r) => r.primaryKey))).map((r) => [restoreTuple(table.pk, r), r]));
        for (const expected of entry.rows) {
            const actual = rows.get(restoreTuple(table.pk, expected.primaryKey));
            if (!actual || recoveryHash(actual) !== expected.sha256)
                throw new Error('RESTORE_ROW_DRIFT');
        }
    }
    for (const [model, entries] of [['attachment', manifest.attachments], ['fileObject', manifest.fileMetadata]]) {
        for (const expected of entries) {
            const row = await tx[model].findUnique({ where: { id: expected.id } });
            if (!row || recoveryHash(row) !== expected.sha256)
                throw new Error('RESTORE_FILE_METADATA_DRIFT');
        }
    }
}
/** Commit status is durable; reconciliation does not retry the original restore payload. */
export async function reconcileRestore({ db = prisma, actor, c, runId }) {
    return db.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT id FROM data_recovery_state WHERE id = 1 FOR UPDATE`;
        await requireRecoveryAdmin(tx, actor);
        const state = await tx.dataRecoveryState.findUniqueOrThrow({ where: { id: 1 } });
        if (state.activeRunId !== runId || state.status !== 'RESTORE_NEEDS_RECONCILIATION')
            throw new Error('RESTORE_RECONCILIATION_NOT_AVAILABLE');
        await restoreRunContext(tx, runId);
        await verifyManifest(tx, state.manifest);
        await writeAuditStrict(tx, { c, actorId: actor.userId, actorName: actor.user.displayName, actorRole: 'SUPER_ADMIN', action: AUDIT_ACTIONS.RESTORE, entityType: 'BACKUP', entityId: runId, metadata: { operation: 'backup.restore.reconcile', permissionCode: 'data.restore', manifestHash: recoveryHash(state.manifest) } });
        await tx.dataRecoveryState.update({ where: { id: 1 }, data: { status: 'READY', failureCode: null } });
        return { runId, status: 'READY', summary: state.summary, scope: 'MODULE_JSON_METADATA_ONLY', binaryFilesVerified: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 180000, maxWait: 15000 });
}
export async function applyRestore(payload, { mode = 'merge', db = prisma, actor, c } = {}) {
    const validation = await validatePayload(payload, { mode, db });
    if (!validation.ok) {
        const err = new Error('Restore validation rejected; no data writes');
        err.validation = validation;
        throw err;
    }
    const runId = await admitRestore(db, actor, recoveryHash(payload)), startedAt = Date.now();
    let committed = false, summary;
    try {
        summary = await db.$transaction(async (tx) => {
            await restoreRunContext(tx, runId);
            await requireRecoveryAdmin(tx, actor);
            const included = dependencyOrder(RESTORE_TABLES.filter((t) => validation.includedKeys.includes(t.key)));
            await lockRestoreTables(tx, included);
            const checked = await validatePayload(payload, { mode, db: tx });
            if (!checked.ok) {
                const err = new Error('Restore transaction validation rejected');
                err.validation = checked;
                throw err;
            }
            const {effective: data, ignoredSecurityFields} = await safeRestoreData(tx,payload.data);
            const effects = [];
            for (const t of included)
                effects.push({ key: t.key, planned: data[t.key].length, totalBefore: await tx[t.model].count(), inserted: 0, created: 0, updated: 0, deleted: 0, unchanged: 0 });
            if (mode === 'replace')
                for (const t of [...included].reverse())
                    if (!t.appendOnly) {
                        const result = await tx[t.model].deleteMany();
                        effects.find((e) => e.key === t.key).deleted = result.count;
                    }
            const available = new Map(), pending = [];
            for (const t of included) {
                const existing = await findRows(tx, t, data[t.key]);
                const byPk = new Map(existing.map((r) => [restoreTuple(t.pk, r), r]));
                available.set(t.key, existing);
                for (const row of data[t.key])
                    pending.push({ t, row, existing: byPk.get(restoreTuple(t.pk, row)) });
            }
            while (pending.length) {
                const ready = pending.filter(({ t, row }) => t.foreignKeys.every((fk) => {
                    if (fk.fields.some((f) => row[f] == null))
                        return true;
                    const target = included.find((p) => p.key === fk.targetKey);
                    if (!target)
                        return true;
                    const wanted = Object.fromEntries(fk.targetFields.map((f, i) => [f, row[fk.fields[i]]]));
                    if ((available.get(target.key) || []).some((r) => restoreTuple(fk.targetFields, r) === restoreTuple(fk.targetFields, wanted)))
                        return true;
                    return !pending.some((p) => p.t === target && restoreTuple(fk.targetFields, p.row) === restoreTuple(fk.targetFields, wanted));
                }));
                if (!ready.length)
                    throw new Error('RESTORE_ROW_DEPENDENCY_CYCLE');
                for (const t of included) {
                    const group = ready.filter((n) => n.t === t), effect = effects.find((e) => e.key === t.key);
                    const inserts = group.filter((n) => !n.existing);
                    for (let i = 0; i < inserts.length; i += CHUNK) {
                        const batch = inserts.slice(i, i + CHUNK);
                        const result = await tx[t.model].createMany({ data: batch.map((n) => n.row) });
                        if (result.count !== batch.length)
                            throw new Error('RESTORE_INSERT_COUNT_MISMATCH');
                        effect.inserted += result.count;
                        effect.created += result.count;
                    }
                    for (const node of group.filter((n) => n.existing)) {
                        const patch = Object.fromEntries(Object.entries(node.row).filter(([k, v]) => !t.pk.includes(k) && recoveryHash([v]) !== recoveryHash([node.existing[k]])));
                        if (!Object.keys(patch).length) {
                            effect.unchanged++;
                            continue;
                        }
                        if (t.appendOnly)
                            throw new Error('RESTORE_APPEND_ONLY_CONFLICT');
                        const updated = await tx[t.model].update({ where: wherePk(t, node.row), data: patch });
                        if (restoreTuple(t.pk, updated) !== restoreTuple(t.pk, node.row))
                            throw new Error('RESTORE_UPDATE_PK_MISMATCH');
                        effect.updated++;
                    }
                    available.get(t.key).push(...group.map((n) => n.row));
                    group.forEach((n) => pending.splice(pending.indexOf(n), 1));
                }
            }
            const securityUpdated = await tx.user.updateMany({data:{securityVersion:{increment:1}}});
            const revoked = await tx.refreshToken.updateMany({where:{revokedAt:null},data:{revokedAt:new Date()}});
            const datasetEpoch = crypto.randomUUID();
            await tx.dataRecoveryState.update({where:{id:1},data:{epoch:datasetEpoch}});
            const initiatingUser = await tx.user.findUniqueOrThrow({where:{id:actor.userId}});
            const manifest = await buildManifest(tx, included, data, effects);
            const result = { runId, mode, tables: effects, created: effects.reduce((n, e) => n + e.inserted, 0), inserted: effects.reduce((n, e) => n + e.inserted, 0), updated: effects.reduce((n, e) => n + e.updated, 0), deleted: effects.reduce((n, e) => n + e.deleted, 0), unchanged: effects.reduce((n, e) => n + e.unchanged, 0), durationMs: Date.now() - startedAt, scope: checked.scope, datasetEpoch, ignoredSecurityFields, securityEffects: { updatedUsers:securityUpdated.count, revokedRefreshTokens:revoked.count, initiatingVersion:initiatingUser.securityVersion, note:'Security housekeeping is separate from module input row changes' } };
            await writeAuditStrict(tx, { c, actorId: actor.userId, actorName: actor.user.displayName, actorRole: 'SUPER_ADMIN', action: AUDIT_ACTIONS.RESTORE, entityType: 'BACKUP', entityId: runId, after: result, metadata: { operation: 'backup.restore.apply', permissionCode: 'data.restore', payloadHash: recoveryHash(payload), integrityManifest: manifest } });
            await tx.dataRecoveryState.update({ where: { id: 1 }, data: { status: 'RESTORE_NEEDS_RECONCILIATION', manifest, summary: result } });
            return result;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 180000, maxWait: 15000 });
        committed = true;
        await reconcileRestore({ db, actor: { ...actor, user: { ...actor.user, securityVersion: summary.securityEffects.initiatingVersion } }, c, runId });
        return { ...summary, reconciled: true, status: 'READY', binaryFilesVerified: false };
    }
    catch (err) {
        let durable;
        try { durable = await db.dataRecoveryState.findUniqueOrThrow({ where: { id: 1 } }); }
        catch { err.committed = committed ? true : 'UNKNOWN'; err.code = 'RESTORE_COMMIT_OUTCOME_UNKNOWN'; err.runId = runId; throw err; }
        if (durable.activeRunId === runId && durable.status === 'READY' && durable.manifest && durable.summary) {
            return { ...durable.summary, reconciled: true, status: 'READY', binaryFilesVerified: false, reconciliationResponseRecovered: true };
        }
        if (!committed) committed = durable.activeRunId === runId && durable.status === 'RESTORE_NEEDS_RECONCILIATION';
        if (committed) {
            try {
                await db.dataRecoveryState.updateMany({ where: { id: 1, activeRunId: runId, status: 'RESTORE_NEEDS_RECONCILIATION' }, data: { failureCode: 'POST_COMMIT_RECONCILIATION_FAILED' } });
            }
            catch { /* Durable state already blocks writes; never release on recording failure. */ }
            err.committed = true;
            err.code = 'RESTORE_NEEDS_RECONCILIATION';
            err.runId = runId;
            throw err;
        }
        // Only known pre-commit rollback can release this own run; uncertain/crashed runs stay contained.
        await db.dataRecoveryState.updateMany({ where: { id: 1, activeRunId: runId, status: 'RESTORING', manifest: { equals: Prisma.DbNull } }, data: { status: 'READY', failureCode: 'PRE_COMMIT_ROLLBACK' } });
        throw err;
    }
}
