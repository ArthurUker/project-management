# RP07-T02 local implementation

Explicit shared transfer locks users and project, validates active same-project member and current actor/grants/version/exact base, promotes new MANAGER or preserves OWNER, demotes prior MANAGER to MEMBER without removal. HTTP/sync/registration call same command. Strict audit and membership/project/other fields atomic; sync receipt also same transaction. Combined participant edits cannot remove active OWNER/prior manager. Native JWT owned DB13/13 plus existing status/write regressions pass; concurrent same-base one success, current account disable before lock rejected, DB/audit faults roll back and sync pending retained. No implicit activation/enrollment/left restore or custom role activation.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: No schema or dependency changes. Changed manager requires exact baseUpdatedAt409 if absent/stale; scalar managerId validation400. Receiptv1 retained; sensitive manager stays global/server blacklist and only explicit adapter handles it.

Changed files:

- rdpms-system/backend/src/modules/projects/projectCommands.ts
- rdpms-system/backend/src/routes/projects.js
- rdpms-system/backend/src/routes/sync.js
- rdpms-system/backend/src/routes/registrations.js
- rdpms-system/backend/tests/integration/rp07-manager-transfer.integration.test.mjs
- rdpms-system/backend/tests/integration/rp07-project-status-shared.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
