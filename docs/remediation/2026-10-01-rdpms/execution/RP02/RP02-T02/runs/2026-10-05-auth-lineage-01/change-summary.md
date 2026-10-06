# RP02-T02 local implementation

Refresh input is checked before hashing. Conditional single-use consume, same-family successor and strict audit share one short transaction. Current actor row is locked before consume; disabled/deleted/pending/manual-locked actor never auto-activates. Concurrent losers explicitly rejected without revoking winner. Prior login threshold/TTL logic unchanged.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Bearer/body wire shape and actual JWT expiry retained; consumed/revoked token now401 REFRESH_TOKEN_REPLAYED; no migration, no cookies, no new access invalidation policy. Commit/response loss requires explicit relogin as approved.

Changed files:

- rdpms-system/backend/src/routes/auth.js
- rdpms-system/backend/tests/integration/rp02-t02-acceptance.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
