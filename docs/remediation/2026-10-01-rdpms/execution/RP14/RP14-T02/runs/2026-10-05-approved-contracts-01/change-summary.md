# RP14-T02 local implementation

Only CLEAN exports bytes across both file aliases and regulatory original-file. Every other or absent scan outcome is refused and redacted denial audited. Legacy raw originals cannot bypass unknown scan. Current resolver elevated context is preserved only for SUPER_ADMIN and sensitive access audited; metadata/delete retain original system permission/resource capability contracts. No migration.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Non-CLEAN and unscanned legacy originals now return 403; URLs and metadata/delete rules retained; CLEAN elevated project access works as intended by existing M-1 contract.

Changed files:

- rdpms-system/backend/src/modules/files/fileReadService.ts
- rdpms-system/backend/src/modules/files/fileAccessPolicy.ts
- rdpms-system/backend/src/routes/files.js
- rdpms-system/backend/src/routes/regulatory-documents.js
- rdpms-system/backend/tests/integration/rp14-scan-elevated-policy.integration.test.mjs
- rdpms-system/backend/tests/integration/rf05-file-scope.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
