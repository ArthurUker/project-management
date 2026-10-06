# RP16-T03 local implementation

Current approved module JSON restore epoch/security/session/device/receipt/ACL/request/IDB/draft namespace contract implemented. Native JWT/DB10; native JWT/DB/Chrome joint1; synthetic-auth real Chrome6; unit/contract93; registry5/apply11/security8/refresh11/lock12/receipt22/native browser receipts6/ACL7 scoped regressions. Old pending/applied original bindings remain exact, current new intents work; real signed >3000 continuation token rejects old epoch. Precommit rollback preserves epoch/auth; postcommit failures stay contained with exact initiating recovery credential. All local only.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: JWT missing old epoch requires reauth; current public Prisma callback/batch transactions take expected epoch shared DB lease. Mixed/started public query batches explicitly reject. Additive epoch columns use DB default; old rows retained. Candidate current actor queue isolates old/unproven epoch; drafts new namespace preserves old bytes. Actual deployed client catalog unknown; no release/wholeDR assertion.

Changed files:

- rdpms-system/backend/src/kernel/backupRestore.js
- rdpms-system/backend/src/kernel/restoreSchemaRegistry.js
- rdpms-system/backend/src/platform/recovery/dataEpoch.ts
- rdpms-system/backend/src/kernel/rbac.js
- rdpms-system/backend/src/routes/auth.js
- rdpms-system/backend/src/routes/sync.js
- rdpms-system/backend/src/platform/db/client.js
- rdpms-system/backend/src/platform/requestContext.js
- rdpms-system/backend/src/platform/idempotency/receipts.js
- rdpms-system/backend/src/modules/sync/syncMutationCommands.ts
- rdpms-system/backend/src/modules/sync/syncReadPolicy.ts
- rdpms-system/backend/src/routes/backup.js
- rdpms-system/backend/prisma/schema.prisma
- rdpms-system/backend/prisma/migrations/20261007_dataset_epoch_fences/migration.sql
- rdpms-system/backend/tests/integration/rp16-restore-epoch.integration.test.mjs
- rdpms-system/backend/tests/integration/rp16-restore-apply.integration.test.mjs
- rdpms-system/backend/tests/integration/rp14-scan-elevated-policy.integration.test.mjs
- rdpms-system/backend/tests/integration/rp10-submit-state-policy.integration.test.mjs
- rdpms-system/frontend/src/offline/idb.ts
- rdpms-system/frontend/src/offline/engine.ts
- rdpms-system/frontend/src/auth/tokenStore.ts
- rdpms-system/frontend/src/api/endpoints/sync.ts
- rdpms-system/frontend/src/offline/tests/rp11-owner.browser.tsx
- rdpms-system/backend/tests/helpers/stubDeps.mjs
- rdpms-system/frontend/src/components/EditProjectModal.tsx
- rdpms-system/frontend/src/offline/pendingDraft.ts
- rdpms-system/backend/tests/helpers/syncV1Fixture.mjs
- rdpms-system/backend/tests/integration/rp03-security-version.integration.test.mjs
- rdpms-system/backend/tests/integration/rp02-login-lock-ttl.integration.test.mjs
- rdpms-system/backend/tests/integration/rp09-receipt-recovery.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
