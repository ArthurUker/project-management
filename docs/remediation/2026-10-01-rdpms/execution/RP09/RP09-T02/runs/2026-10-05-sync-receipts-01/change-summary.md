# RP09-T02 local implementation

RP09-T02 scoped backend recovery delivered:22/22 real owned DB/JWT formal cases, receipt-lock/unique/CAS concurrency,24h expiry,unknown without re-reserve,lastPushAt postcommit500,real HTTP loss,current-auth revocation order,repeat/delete/fixture-restore and write-disabled containment. Current RP09-T01 source revalidated30/30. CI old-wire incompatibility remains explicitly FAIL; complete client/target scope open.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: No further schema change. Bounded raw SQL serialization retry and exact server creation/expiry window; RDPMS_SYNC_WRITE_DISABLED=true stops reserve/push with503 while authorized queries remain. Frontend and old protocol fixtures unchanged.

Changed files:

- rdpms-system/backend/src/routes/sync.js
- rdpms-system/backend/src/modules/sync/syncMutationCommands.ts
- rdpms-system/backend/tests/integration/rp09-receipt-recovery.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
