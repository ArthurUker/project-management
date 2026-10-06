# RP08-T02 local implementation

Current ACL SHA256 covers actor/system role/security version, sorted permissions and actual project role/membership/manager/projection version in the same repeatable-read snapshot as read projection. Missing/stale ACL forces full historical backfill; signed continuation binds fingerprint and409 on current change. Candidate client stages whole snapshot, invalidates old authorization before further roundtrip, commits mirror+ACL+cursor in one owner-fenced IDB tx only at final page. Native publish abort preserves originals and old cursor but hides old mirror. Denied queue is tagged before staging, remains original-owner; later grant restore cannot auto reserve/query/push isolated original. Explicit safe same-binding action required. NativeACL6/6, actual JWT/backend/browser7/7 including nonempty Tasks then real403 purge, nativeIDB ACL5/5, ordinary sync12/12, oldpagination2/2, owner13/13, receipt10/10,batch7/7 pass.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Existing receipt v1 unchanged. ACL adds role/capability/write-policy projections and full64SHA256 fingerprint; legacy missingfingerprint is safely full rebuild, old signed ACL-less pages reset409. No schema/dependency change. Safe commit-visible journal/epoch are RP13-T03, not claimed here.

Changed files:

- rdpms-system/backend/src/routes/sync.js
- rdpms-system/backend/src/modules/sync/syncReadPolicy.ts
- rdpms-system/frontend/src/offline/engine.ts
- rdpms-system/frontend/src/offline/idb.ts
- rdpms-system/frontend/src/api/endpoints/sync.ts
- rdpms-system/frontend/src/offline/tests/rp11-owner.browser.tsx
- rdpms-system/backend/tests/integration/rp08-acl-backfill.integration.test.mjs
- rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
