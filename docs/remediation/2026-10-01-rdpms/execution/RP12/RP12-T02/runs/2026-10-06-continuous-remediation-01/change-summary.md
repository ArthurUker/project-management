# RP12-T02 local implementation

V1 client records canonical semantic SHA256/device/project/key and reserving stage before reserve; durable bound handle/window before push and pushed stage before HTTP. Original-only query on response loss/partial500, exact identity/hash/handle/status validation before atomic ack, same-owner generation fences, up to3 automatic reservation/push attempts. Unknown/expired/legacy retained without auto reservation/rekey. Original rejection metadata preserved; explicit conflict new intent clears old binding and allocates new sequence. Current real Chrome client10/10, native JWT+DB+IDB6/6, batch7/7, owner13/13, recovery5PASS+quotaENV_BLOCKED. Native joint faults show one business/audit/applied receipt effect and original-only retry.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Existing native backend approved v1 contract. No business backend/schema/dependency change; old legacy ambiguous queues retained. Backend protocol rejects clients lacking reservation; supported deployed client catalog and target HTTP budget remain external.

Changed files:

- rdpms-system/frontend/src/offline/engine.ts
- rdpms-system/frontend/src/api/endpoints/sync.ts
- rdpms-system/frontend/src/offline/idb.ts
- rdpms-system/frontend/src/offline/deadLetter.ts
- rdpms-system/frontend/src/offline/RecoveryPanel.tsx
- rdpms-system/frontend/src/offline/tests/rp11-owner.browser.tsx
- rdpms-system/frontend/src/offline/SyncProvider.tsx

Source before snapshots and task-specific diff are retained. No commits/deployments.
