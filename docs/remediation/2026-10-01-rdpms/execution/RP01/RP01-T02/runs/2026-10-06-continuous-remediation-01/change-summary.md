# RP01-T02 local implementation

RP01-T02: superior-only current account policy, no peer/higher/self operations or peer/higher grants; exact forced-password allowlist; resets/status/delete/system role binding and self-password have tx-local current checks, refresh revocation and strict audit. Final formal8 cases include144 matrix combinations. Current93 unit/contract regression passed.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Existing account URLs/body retained, unsafe peer/higher requests403; force-change ordinary requests403. No schema/seed/custom-role binding change.

Changed files:

- rdpms-system/backend/src/routes/users.js
- rdpms-system/backend/src/routes/auth.js
- rdpms-system/backend/src/kernel/rbac.js
- rdpms-system/backend/src/modules/auth/accountPolicy.ts
- rdpms-system/backend/tests/integration/rp01-account-policy.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
