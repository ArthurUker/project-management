# RP03-T02 local implementation

Immediate user securityVersion revokes access after password/reset/role/status/delete; version increment + refresh revocation + strict audit transactional. Native authentication checks current active nondeleted row/version. Login cannot mint fresh-version credentials from an old password validated before reset; deterministic race and audit rollback validated. Additive nonnegative users.security_version migration exercised only in self-owned DB.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Existing Bearer/body URLs; access without version now401 and new login/current valid refresh issues versioned token. Additive field default0 retains all existing rows; no old migration rewrite.

Changed files:

- rdpms-system/backend/src/kernel/rbac.js
- rdpms-system/backend/src/routes/users.js
- rdpms-system/backend/src/routes/auth.js
- rdpms-system/backend/src/modules/auth/accountPolicy.ts
- rdpms-system/backend/prisma/schema.prisma
- rdpms-system/backend/prisma/migrations/20261006_user_security_version/migration.sql
- rdpms-system/backend/tests/integration/rp03-security-version.integration.test.mjs
- rdpms-system/backend/tests/integration/rp02-login-lock-ttl.integration.test.mjs
- rdpms-system/backend/tests/integration/rp01-account-policy.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
