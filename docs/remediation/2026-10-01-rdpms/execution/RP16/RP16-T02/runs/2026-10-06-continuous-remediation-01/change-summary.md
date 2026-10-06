# RP16-T02 local implementation

Transactional module restore revalidates schema constraints after bounded table locks, no skipDuplicates, actual pertable planned/inserted/updated/deleted/unchanged counts. Native JWT/PG11/11:27 supported tables unchanged, insert/update/composite replace, 501 concurrent target winner and original duplicate-user rejection, strictaudit rollback, postcommit/commit response lost distinctions, deterministic prior writer fence, nonempty attachment/file metadata and no-orphan replace. Additive singleton operation gate plus DB shared-lock write triggers retains postcommit expected integrity manifest and blocks subsequent writes until exact reconciliation. Registry5/5 and unit/contract93/93 regressions.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Version2.0 existing module exports only. New status/reconcile API, exact persistent runId/manifest; no automatic repeatrestore, no arbitrary gate release. Current active SUPER/version admission. Commit outcome UNKNOWN is not rolledBack. Additive DataRecoveryState/write triggers retained. No epoch/session invalidation claimed before T03.

Changed files:

- rdpms-system/backend/src/kernel/backupRestore.js
- rdpms-system/backend/src/kernel/restoreSchemaRegistry.js
- rdpms-system/backend/src/routes/backup.js
- rdpms-system/backend/src/kernel/rbac.js
- rdpms-system/backend/src/platform/recovery/dataEpoch.ts
- rdpms-system/backend/prisma/schema.prisma
- rdpms-system/backend/prisma/migrations/20261006_restore_operation_gate/migration.sql
- rdpms-system/backend/tests/integration/rp16-restore-apply.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
