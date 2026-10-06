# RP11-T01 local implementation

Authenticated tokenStore actor/login generation fences every IndexedDB operation; durable per-owner records/outbox/kv/dead letters, actor-scoped device identity. Bootstrap/logout hides rather than destroys drafts. Generation-bound hydration/recovery; start coalesces initialization and stop cancels old tails. Tasks cancels old actor responses and never falls back on401/403/404. Current owner/project/permission cache lease max5min; definitive denial invalidates mirror authorization only. Legacy stores retained without ownership inference. Current13 real-browser cases passed including slow/offline /me, two tabs, late writes/cleanup/pull and actual Tasks page.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: IDB additive version3 stores; legacy stores unchanged/read-protected. Ownerless storage calls no longer exposed; pendingDraft uses captured current actor. Existing HTTP unchanged; cache denial now hides stale mirror.

Changed files:

- rdpms-system/frontend/src/offline/idb.ts
- rdpms-system/frontend/src/offline/engine.ts
- rdpms-system/frontend/src/offline/SyncProvider.tsx
- rdpms-system/frontend/src/pages/Tasks.tsx
- rdpms-system/frontend/src/offline/deadLetter.ts
- rdpms-system/frontend/src/offline/tests/rp11-owner.browser.tsx
- rdpms-system/frontend/src/offline/pendingDraft.ts

Source before snapshots and task-specific diff are retained. No commits/deployments.
