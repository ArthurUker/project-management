// Bounded helper-only controls. No application/Prisma import or database access.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const output = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs';
const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
const begin = source.indexOf('const REPORT_WRITE_METHODS');
const end = source.indexOf('function makeApp');
if (begin < 0 || end <= begin) throw new Error('Helper boundaries not found');
let fakeUpserts = 0;
const context = vm.createContext({
  Promise,
  prisma: { report: { upsert: async () => { fakeUpserts += 1; return { id: 'target-id' }; } } },
});
vm.runInContext(source.slice(begin, end), context);

const target = { projectId: 'target-project', authorId: 'target-author', reportType: 'MONTHLY', periodKey: '2028-01', marker: 'target-payload' };
const matcher = vm.runInContext('matchReportWrite', context)(target);
const wrongIdentity = { projectId: 'different-project', authorId: 'different-author', reportType: 'ANNUAL', periodKey: target.periodKey, content: { revision: target.marker } };
const wrongIdentityMatched = matcher({ method: 'create', data: wrongIdentity, where: null, create: null, update: null });

const draftGate = vm.runInContext("draftWriteBarrier('target-id')", context);
await draftGate.client.report.upsert({
  where: { id: 'target-id' },
  create: { id: 'target-id', content: { revision: 'late-draft' } },
  update: { content: { revision: 'late-draft' } },
});

const names = [
  'submit commits first: legacy draft save already past validation is rejected and leaves no business/audit/receipt change',
  'submit commits first: modern CAS draft save with a stale baseline is rejected with INVALID_STATE',
  'sync push shares the same write boundary: late offline report save after submit is rejected',
];
const unfinishedCleanup = names.map((name) => {
  const start = source.indexOf(`test('${name}'`);
  const next = source.indexOf('\ntest(', start + 1);
  const body = source.slice(start, next < 0 ? source.length : next);
  return {
    test: name,
    line: source.slice(0, start).split('\n').length,
    finallyPresent: /\bfinally\b/.test(body),
    clearTimeoutPresent: /\bclearTimeout\b/.test(body),
    inlineTimeoutPresent: /setTimeout/.test(body),
  };
});
const result = {
  kind: 'STATIC_HELPER_CONTROL_WITH_IN_MEMORY_METHOD_STUB',
  databaseAccess: false,
  productAcceptance: 'NOT_EVALUATED',
  sourcePath,
  compoundSelector: target,
  wrongIdentity,
  wrongIdentityMatched,
  upsertDraftGate: { actualInputShape: 'where.id + create/update.content, no data', fired: draftGate.fired(), underlyingStubCalls: fakeUpserts },
  existingDraftCleanup: unfinishedCleanup,
  meaning: 'Pure helper counterexamples only; these controls do not prove an HTTP/database product regression.',
};
fs.writeFileSync(path.join(output, 'helper-controls.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
