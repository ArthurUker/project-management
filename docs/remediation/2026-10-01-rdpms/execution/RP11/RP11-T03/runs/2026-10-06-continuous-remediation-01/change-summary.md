# RP11-T03 local implementation

Conflict/rejection queue movement, replay and selected discard use owner-fenced native multi-store IDB transactions. Failed write/native abort preserves original; duplicate conflict does not lose/rewrite last copy. Fresh owner/profile/project/permission checks guard recovery, owned unbound original retrieval permitted without implicit retry; no automatic unknown claim or bulk delete. Production SyncConflictDialog uses RecoveryPanel with current projected comparison, original export and confirmed per-item discard, local action audit atomic before removal. Current recovery5 PASS/1 native quota ENV_BLOCKED;13 owner/Tasks regression PASS.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: No new DB schema/HTTP endpoint/dependency. Old bulk clear disabled, unconfirmed discard refused; explicit conflict keep-local creates new key, known rejected retry preserves old key/payload. Existing dialog now uses current authorized path.

Changed files:

- rdpms-system/frontend/src/offline/idb.ts
- rdpms-system/frontend/src/offline/engine.ts
- rdpms-system/frontend/src/offline/RecoveryPanel.tsx
- rdpms-system/frontend/src/offline/tests/rp11-owner.browser.tsx
- rdpms-system/frontend/src/components/SyncConflictDialog.tsx

Source before snapshots and task-specific diff are retained. No commits/deployments.
