# RP13-T03 local implementation

Seven producer DB tables capture exact source revision/scope/epoch/deletion atomically on all DML, commit-visible on-demand publication head allocated in same transaction, no sequence holes on rollback; signed fixed-cut500 pages/latest-revision collapse/current ACL/report own-only/live metadata projection. Native JWT journal9; real Chrome IDB6 revision/tombstone/abort/partial-page; regressions ACL6/read12/legacy pagination2/JWT Chrome ACL7/receipts6 twice/restore1/apply11/epoch10/unit93. Legacy timestamp always full safely; candidate v2 cursor upgrade reset preserves originals. No automatic journal GC or production target claim.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Additive three journal tables/seven DML triggers; new signed pullProtocol2 candidate, existing legacy keyset remains and timestamp since forces complete resnapshot. Scalar v2 project projection excludes nested manager. Auth/epoch/receipt contracts unchanged. Current original queues retain exact key/body/device. No background process installed, on-demand publisher cap10000 unpublished explicit503/rollback; workload sizing target external.

Changed files:

- rdpms-system/backend/src/routes/sync.js
- rdpms-system/backend/prisma/schema.prisma
- rdpms-system/backend/src/modules/sync/changePublisher.ts
- rdpms-system/backend/prisma/migrations/20261008_sync_commit_journal/migration.sql
- rdpms-system/backend/tests/integration/rp13-commit-journal.integration.test.mjs
- rdpms-system/frontend/src/offline/engine.ts
- rdpms-system/frontend/src/offline/idb.ts
- rdpms-system/frontend/src/api/endpoints/sync.ts
- rdpms-system/frontend/src/offline/tests/rp11-owner.browser.tsx
- rdpms-system/backend/tests/integration/rp08-acl-backfill.integration.test.mjs
- rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
