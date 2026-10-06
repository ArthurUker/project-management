# RP10-T03 local implementation

New report submission accepts only DRAFT/NEEDS_REVISION under transaction row lock and conditional status/version update. Existing same-key receipt replay remains before state validation and after current authorization. Approve/reject reread locked status/version and reject stale reviewers; review audit now shares transaction. A late review cannot overwrite a newer resubmitted version. No task CAS/client/session policy or migration changes.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Existing report URLs, submit body and key formats unchanged; new-key SUBMITTED resubmit now409 INVALID_STATE. Delayed review of changed status/version returns409 CONFLICT. Same-key replay keeps original status/body; strict audit failure rolls back transition.

Changed files:

- rdpms-system/backend/src/routes/reports.js
- rdpms-system/backend/src/modules/reports/reportCommands.ts
- rdpms-system/backend/tests/integration/rp10-submit-state-policy.integration.test.mjs
- rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
