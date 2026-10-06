# RP06-T01 local implementation

No registration global exception. Ordinary active-member alive registration list/stats/detail scope same read snapshot; linked tasks/counts/phases/milestones/members/regulatory projection requires corresponding grant and alive rows. Native current account/grants/version rechecked; writes lock users/project/currentmember before fresh admission. Update/profile requires write, stage transition; strict audit and state atomic. SUPER nonmember elevated scope logged. Creator OWNER/new manager controlled active enrollment and template scaffold+sequence+project/profile/audit same tx. Native JWT10/10 entry/capability/no-grant/nonmember/left/deleted/type/projection/rollback/current-revoke/barrier/concurrentstage cases, plus manager13/13 regression. First Serializable stale-snapshot barrier failure preserved; bounded locked ReadCommitted writer refinement fixes admission, read RepeatableRead unchanged.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Same routes and ordinary response structure; inaccessible linked collections/count keys omitted, scope restricted instead of oldglobal. No newDELETE/export route or schema/dependency changes. Templates global active catalog unchanged.

Changed files:

- rdpms-system/backend/src/routes/registrations.js
- rdpms-system/backend/src/modules/projects/registrationAccess.ts
- rdpms-system/backend/tests/integration/rp06-registration-scope.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
