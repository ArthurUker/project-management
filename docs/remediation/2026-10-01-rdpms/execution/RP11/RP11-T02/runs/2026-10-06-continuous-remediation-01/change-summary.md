# RP11-T02 local implementation

IDB version4 copies every legacy row into immutable source/key/value quarantine and verifies before native upgrade commit. Explicit recorded owner restores only matching outbox/dead/pending-draft partition; unowned mirrors and old guessed logout labels stay quarantined. Existing owner keys win collisions with original retained. Blocked request aborts upgrade after blocker releases rather than performing a rejected background migration; errors retryable. Real versionchange closes old connection and pauses its engine. Real v1/v2/blocked/native abort/page-close/reentry tests passed, plus current13 owner/product Tasks cases.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Additive IDB version4, preserved v1/v2 original stores. Existing explicit owner labels migrate conservatively, unknown/guessed labels unavailable to normal APIs. Candidate may need tab close/retry on blocked upgrade; no dependency change.

Changed files:

- rdpms-system/frontend/src/offline/idb.ts
- rdpms-system/frontend/src/offline/tests/rp11-owner.browser.tsx
- rdpms-system/frontend/src/offline/engine.ts

Source before snapshots and task-specific diff are retained. No commits/deployments.
