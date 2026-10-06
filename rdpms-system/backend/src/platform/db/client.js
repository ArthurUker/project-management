/** Instance-scoped public Prisma facade. Authenticated requests retain their epoch. */
import { PrismaClient } from '@prisma/client';
import { resolveDb, setFallbackDbFactory, resetFallbackDb, currentContext } from '../requestContext.js';
import { HttpError } from '../../kernel/http.js';
export function createPrismaClient(options) { return new PrismaClient(options); }
setFallbackDbFactory(() => createPrismaClient());

const DESCRIPTOR = Symbol('rdpms.publicQueryDescriptor');
function fence() {
  const ctx = currentContext();
  return ctx?.datasetEpoch && !ctx.recoveryOperation ? ctx.datasetEpoch : null;
}
async function protectedTransaction(client, epoch, callback, options) {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('rdpms.dataset_epoch', ${epoch}, true)`;
    const rows = await tx.$queryRaw`SELECT epoch, status FROM data_recovery_state WHERE id = 1 FOR SHARE`;
    if (rows.length !== 1 || rows[0].status !== 'READY') throw new HttpError(503, 'RESTORE_NEEDS_RECONCILIATION', 'Dataset is not ready');
    if (rows[0].epoch !== epoch) throw new HttpError(409, 'DATASET_EPOCH_CHANGED', 'Dataset changed; preserve original commands and reauthenticate');
    return callback(tx);
  }, options);
}
function descriptor(client, epoch, model, method, args) {
  const execute = (target) => model === null ? target[method](...args) : target[model][method](...args);
  let started;
  const start = () => started ??= protectedTransaction(client, epoch, execute);
  // Own public thenable, not a private Prisma engine object. Batch calls replay descriptors on one tx.
  return { [DESCRIPTOR]: { client, epoch, execute, alreadyStarted: () => Boolean(started) },
    then: (resolve, reject) => start().then(resolve, reject),
    catch: (reject) => start().catch(reject), finally: (callback) => start().finally(callback),
    [Symbol.toStringTag]: 'RdpmsEpochQuery' };
}
export const prisma = new Proxy({}, {
  get(_target, prop) {
    const client = resolveDb(), value = client[prop], epoch = fence();
    if (!epoch) return typeof value === 'function' ? value.bind(client) : value;
    if (prop === '$transaction') return (queries, options) => {
      if (typeof queries === 'function') return protectedTransaction(client, epoch, queries, options);
      if (!Array.isArray(queries)) throw new Error('INVALID_PUBLIC_TRANSACTION');
      const list = queries.map((q) => q?.[DESCRIPTOR]);
      if (list.some((q) => !q || q.client !== client || q.epoch !== epoch || q.alreadyStarted())) throw new Error('MIXED_OR_STARTED_TRANSACTION_BATCH');
      return protectedTransaction(client, epoch, async(tx) => { const results=[]; for (const q of list) results.push(await q.execute(tx)); return results; }, options);
    };
    if (['$queryRaw','$executeRaw','$queryRawUnsafe','$executeRawUnsafe'].includes(prop)) return (...args) => descriptor(client,epoch,null,prop,args);
    if (value && typeof value === 'object' && typeof value.findMany === 'function') return new Proxy(value, { get(model, method) {
      const operation = model[method]; return typeof operation === 'function' ? (...args) => descriptor(client,epoch,prop,method,args) : operation;
    } });
    return typeof value === 'function' ? value.bind(client) : value;
  },
  has(_target, prop) { return prop in resolveDb(); },
});
/** @returns {any} Public scoped facade also applies when typed commands take an explicit db. */
export function getScopedDb() { return prisma; }
export { resetFallbackDb };
