# RP12-T01 local implementation

Durable owner queue sequence, explicit resource/project/parent dependencies and fresh-v1 origin distinguish from legacy ambiguous rows. Frozen bounded snapshots cap500 and256KiB actual UTF8 whole envelopes; same resource serial ordering and confirmed-applied prerequisite markers. Oversize/legacy/dependency cycle retained, no coalescing/rekey. Applied acknowledgement+queue deletion atomic; response identities validated before deletion. Current7 batch+13 owner regression pass; missing target HTTP chain limit remains ENV_BLOCKED.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: No business backend change/new dependency. Old queue cannot be silently upgraded to fresh intent. v1 envelope required; reservation support follows RP12-T02.

Changed files:

- rdpms-system/frontend/src/offline/engine.ts
- rdpms-system/frontend/src/api/endpoints/sync.ts
- rdpms-system/frontend/src/offline/idb.ts
- rdpms-system/frontend/src/offline/tests/rp11-owner.browser.tsx

Source before snapshots and task-specific diff are retained. No commits/deployments.
