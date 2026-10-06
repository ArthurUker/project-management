# RP09-T01 local implementation

Approved RP09-T01 candidate implemented: immutable actor/device/resource/key/hash/version reservations; caller-tx current auth, shared command/CAS, strict audit and successful receipt; seven entity legal updates, six creates, available delete/noop, known-key isolation, real SQL/audit/receipt rollback and per-item batch recovery. 30/30 real owned PostgreSQL tests with actual login/Bearer.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Additive four nullable SyncMutation columns, named new migration tested only in owned DB. Existing global key kept, legacy null records quarantined; protocolVersion1/receiptHandle required. Frontend unchanged; no production activation.

Changed files:

- rdpms-system/backend/src/routes/sync.js
- rdpms-system/backend/src/modules/sync/syncMutationCommands.ts
- rdpms-system/backend/prisma/schema.prisma
- rdpms-system/backend/prisma/migrations/20261005_sync_receipt_v1_scope/migration.sql
- rdpms-system/backend/tests/integration/rp09-scoped-receipt.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
