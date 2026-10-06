import { Prisma } from '@prisma/client';

const lowerFirst = (name) => name[0].toLowerCase() + name.slice(1);
export const restoreTuple = (fields, row) => JSON.stringify(fields.map((f) => row?.[f] ?? null));
const present = (value) => value !== undefined && value !== null;
const CHUNK = 500;

/** Generated client metadata is authoritative; keys/export scope remain explicitly bounded. */
export function createRestoreRegistry(scope) {
  const models = Prisma.dmmf.datamodel.models;
  const byModel = new Map(scope.map((t) => [t.model, t.key]));
  return scope.map((table) => {
    const model = models.find((m) => lowerFirst(m.name) === table.model);
    if (!model) throw new Error(`RESTORE_REGISTRY_MODEL_MISSING:${table.model}`);
    const pk = model.primaryKey?.fields ?? model.fields.filter((f) => f.isId).map((f) => f.name);
    if (!pk.length) throw new Error(`RESTORE_REGISTRY_PK_MISSING:${table.model}`);
    const uniqueSets = [pk, ...model.fields.filter((f) => f.isUnique).map((f) => [f.name]), ...model.uniqueFields];
    const uniques = [...new Map(uniqueSets.map((fields) => [JSON.stringify(fields), fields])).values()];
    const scalarFields = model.fields.filter((f) => f.kind !== 'object');
    const foreignKeys = model.fields.filter((f) => f.relationFromFields?.length).map((f) => ({
      fields: f.relationFromFields, targetFields: f.relationToFields,
      targetModel: lowerFirst(f.type), targetKey: byModel.get(lowerFirst(f.type)) ?? null,
      nullable: f.relationFromFields.map((name) => !scalarFields.find((s) => s.name === name).isRequired),
    }));
    return { ...table, pk, uniques, scalarFields, foreignKeys };
  });
}

export function restoreScopeMetadata(registry) {
  return { kind: 'APPLICATION_MODULE_JSON', binaryFilesIncluded: false,
    supportedKeys: registry.map((t) => t.key),
    unsupportedModels: Prisma.dmmf.datamodel.models.map((m) => lowerFirst(m.name)).filter((m) => !registry.some((t) => t.model === m)),
    note: 'Module JSON is not a complete database or file backup; external targets are only resolved against current DB state.' };
}

async function queryTuples(db, model, fields, rows, selectFields = fields) {
  const tuples = [...new Map(rows.filter((r) => fields.every((f) => present(r?.[f])))
    .map((r) => [restoreTuple(fields, r), Object.fromEntries(fields.map((f) => [f, r[f]]))])).values()];
  const found = [];
  for (let i = 0; i < tuples.length; i += CHUNK) {
    found.push(...await db[model].findMany({ where: { OR: tuples.slice(i, i + CHUNK) },
      ...(selectFields ? { select: Object.fromEntries(selectFields.map((f) => [f, true])) } : {}) }));
  }
  return found;
}

function scalarError(field, value) {
  if (!present(value)) return value === null && field.isRequired ? 'cannot be null' : null;
  if (field.isList) {
    if (!Array.isArray(value)) return 'must be an array';
    for (const item of value) { const error = scalarError({ ...field, isList: false }, item); if (error) return error; }
    return null;
  }
  if (field.kind === 'enum') {
    const values = Prisma.dmmf.datamodel.enums.find((e) => e.name === field.type)?.values.map((v) => v.name);
    return typeof value === 'string' && values?.includes(value) ? null : 'invalid enum value';
  }
  switch (field.type) {
    case 'String': return typeof value === 'string' ? null : 'must be a string';
    case 'Boolean': return typeof value === 'boolean' ? null : 'must be a boolean';
    case 'Int': return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? null : 'must be a 32-bit integer';
    case 'Float': return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a finite number';
    case 'DateTime': return (value instanceof Date || typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) && Number.isFinite(new Date(value).getTime()) ? null : 'must be an ISO timestamp';
    case 'Json': return null;
    case 'Decimal': return (typeof value === 'string' || typeof value === 'number') && Number.isFinite(Number(value)) ? null : 'invalid decimal';
    case 'BigInt': return typeof value === 'bigint' || typeof value === 'string' && /^-?\d+$/.test(value) ? null : 'invalid bigint';
    case 'Bytes': return 'binary scalar is not supported by module JSON';
    default: return 'unsupported scalar type';
  }
}

/** No writes. Passing a transaction makes apply validation use its effective snapshot. */
export async function validateRestorePayload(db, registry, payload, { mode = 'merge' } = {}) {
  const errors = [], warnings = [], tables = [], includedKeys = [], states = new Map();
  const scope = restoreScopeMetadata(registry);
  const finish = () => ({ ok: errors.length === 0, errors, warnings, tables, includedKeys, scope });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.version !== '2.0'
    || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    errors.push('Expected module backup version 2.0 with data object'); return finish();
  }
  if (!['merge', 'replace'].includes(mode)) { errors.push('Invalid restore mode'); return finish(); }
  const byKey = new Map(registry.map((t) => [t.key, t]));
  for (const key of Object.keys(payload.data)) {
    if (!byKey.has(key)) { warnings.push(`Unsupported table excluded: ${key}`); continue; }
    if (!Array.isArray(payload.data[key])) { errors.push(`[${key}] expected array`); continue; }
    includedKeys.push(key);
  }
  if (!includedKeys.length) { errors.push('No supported tables included'); return finish(); }
  for (const key of includedKeys) {
    const table = byKey.get(key), rows = payload.data[key], seen = new Set(), valid = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`[${key}][${index}] expected scalar row object`); continue; }
      let malformed = false;
      for (const name of Object.keys(row)) {
        const field = table.scalarFields.find((f) => f.name === name);
        const reason = field ? scalarError(field, row[name]) : 'unknown or relation input field';
        if (reason) { errors.push(`[${key}][${index}].${name}: ${reason}`); malformed = true; }
      }
      if (table.pk.some((f) => !present(row[f]) || row[f] === '')) { errors.push(`[${key}][${index}] missing primary key ${table.pk.join('+')}`); malformed = true; }
      if (malformed) continue;
      const sig = restoreTuple(table.pk, row);
      if (seen.has(sig)) errors.push(`[${key}] duplicate primary key`);
      seen.add(sig); valid.push(row);
    }
    const existing = new Map((await queryTuples(db, table.model, table.pk, valid, null)).map((r) => [restoreTuple(table.pk, r), r]));
    const effective = valid.map((r) => mode === 'merge' || table.appendOnly ? { ...existing.get(restoreTuple(table.pk, r)), ...r } : r);
    for (let i = 0; i < valid.length; i += 1) {
      const r = effective[i];
      if (!existing.has(restoreTuple(table.pk, valid[i])) || mode === 'replace' && !table.appendOnly) {
        for (const f of table.scalarFields) if (f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt && !present(r[f.name])) errors.push(`[${key}] missing required field ${f.name}`);
      }
      for (const f of table.scalarFields) if (f.isRequired && r[f.name] === null) errors.push(`[${key}] ${f.name} cannot be null`);
    }
    states.set(key, { table, valid, effective, existing });
    const existingCount = valid.filter((r) => existing.has(restoreTuple(table.pk, r))).length;
    tables.push({ key, rows: rows.length, existing: existingCount, new: rows.length - existingCount,
      willDelete: mode === 'replace' && !table.appendOnly ? await db[table.model].count() : 0,
      errors: [], warnings: table.appendOnly ? ['append-only: retain existing rows; no update/delete'] : [] });
  }
  if (errors.length) return finish();
  for (const [key, { table, effective }] of states) {
    for (const fields of table.uniques) {
      const candidates = effective.filter((r) => fields.every((f) => present(r[f]))), seen = new Map();
      for (const r of candidates) {
        const sig = restoreTuple(fields, r);
        if (seen.has(sig)) errors.push(`[${key}] duplicate payload unique ${fields.join('+')}`);
        seen.set(sig, r);
      }
      // Replaced tables lose their old uniques; append-only keeps them. No 500-value truncation.
      if (mode !== 'replace' || table.appendOnly) {
        const hits = await queryTuples(db, table.model, fields, candidates, [...new Set([...fields, ...table.pk])]);
        for (const hit of hits) {
          const owner = seen.get(restoreTuple(fields, hit));
          if (owner && restoreTuple(table.pk, hit) !== restoreTuple(table.pk, owner)) errors.push(`[${key}] target unique conflict ${fields.join('+')}`);
        }
      }
    }
    for (const fk of table.foreignKeys) {
      const required = effective.filter((r) => {
        const missing = fk.fields.some((f) => !present(r[f]));
        if (missing && fk.nullable.some((n) => !n)) errors.push(`[${key}] missing required foreign key ${fk.fields.join('+')}`);
        return !missing;
      });
      const targets = required.map((r) => Object.fromEntries(fk.targetFields.map((f, i) => [f, r[fk.fields[i]]])));
      const targetState = states.get(fk.targetKey);
      const resolved = new Set((targetState?.effective ?? []).map((r) => restoreTuple(fk.targetFields, r)));
      if (!targetState || mode === 'merge' || targetState.table.appendOnly) {
        (await queryTuples(db, fk.targetModel, fk.targetFields, targets)).forEach((r) => resolved.add(restoreTuple(fk.targetFields, r)));
      }
      for (const r of targets) if (!resolved.has(restoreTuple(fk.targetFields, r))) errors.push(`[${key}] unresolved foreign key ${fk.fields.join('+')}`);
    }
  }
  if (mode === 'replace') {
    for (const model of Prisma.dmmf.datamodel.models) {
      const sourceState = [...states.values()].find((s) => s.table.model === lowerFirst(model.name));
      if (sourceState && !sourceState.table.appendOnly) continue;
      for (const relation of model.fields.filter((f) => f.relationFromFields?.length)) {
        const parent = [...states.values()].find((s) => s.table.model === lowerFirst(relation.type) && !s.table.appendOnly);
        if (!parent) continue;
        // Retained/unsupported child rows make destructive replacement unsafe even with cascades.
        const retained = await db[lowerFirst(model.name)].findFirst({ where: { AND: relation.relationFromFields.filter((f) => !model.fields.find((s) => s.name === f).isRequired).map((f) => ({ [f]: { not: null } })) }, select: Object.fromEntries(relation.relationFromFields.map((f) => [f, true])) });
        if (retained) errors.push(`replace blocked by retained ${lowerFirst(model.name)} -> ${parent.table.key} reference`);
      }
    }
    warnings.push('Partial module replacement only; unsupported tables/files are not restored or deleted.');
  }
  for (const table of tables) table.errors = errors.filter((e) => e.startsWith(`[${table.key}]`));
  return finish();
}
