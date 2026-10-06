import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const backend = '/Users/renkang/VS Code/project-management/rdpms-system/backend';
const require = createRequire(`${backend}/package.json`);
const { PrismaClient } = require('@prisma/client');
const { createApp } = await import(pathToFileURL(`${backend}/dist/bootstrap/createApp.js`));

const db = new PrismaClient();
const run = crypto.randomUUID();
try {
  const user = await db.user.create({ data: {
    id: `diag-${run}`, username: `diag-${run}`, displayName: 'Diag actor',
    passwordHash: 'synthetic-only', systemRole: 'ADMIN', status: 'ACTIVE',
  } });
  const project = await db.project.create({ data: {
    code: `DIAG-${run}`, name: 'Diag project', type: 'TESTING', status: 'PLANNING',
    managerId: user.id, createdById: user.id,
    members: { create: [{ userId: user.id, role: 'OWNER', createdById: user.id }] },
  } });
  const app = createApp({ db, actorResolver: async () => ({
    userId: user.id, user, systemRole: 'ADMIN',
    permissions: ['reports.create', 'reports.update', 'reports.submit', 'reports.delete', 'reports.view'],
  }) });
  const response = await app.request('/api/reports', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: project.id, reportType: 'MONTHLY', periodKey: '2027-01', content: { revision: 'diag' }, clientMutationId: \`diag-\${run}\` }),
  });
  const created = await response.json();
  console.log(JSON.stringify({
    probe: 'post-create-diagnostic',
    status: created.status ?? created.error,
    reportId: created.id,
    audits: await db.auditLog.findMany({ select: { action: true, entityType: true, entityId: true, actorId: true } }),
    receipts: await db.mutationReceipt.findMany({ select: { command: true, resourceScope: true, idempotencyKey: true } }),
  }, null, 2));
} finally {
  await db.$disconnect();
}
