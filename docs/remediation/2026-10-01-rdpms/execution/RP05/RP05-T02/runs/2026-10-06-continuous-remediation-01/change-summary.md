# RP05-T02 local implementation

ID-preserving child delta replaces destructive array rebuild. Explicit authorized bounded tombstones preserve dependent/attachment rows and sync delete-wins compatibility; current actor/member/version rechecked in aggregate. Candidate editor actual serializer uses original IDs/baselines, explicit removal lists and actor-owned draft namespace. Native JWT/owned PG10/10; parent4/4, write9/9, manager13/13. Only milestones.delete P1 activated with explicit grant and additive permission row, no other permission/default ordinary role expansion.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Legacy arrays upsert without omission-delete; changed aggregates need exact project base and existing child CAS. Explicit delete-wins stable noop retained. Unproven drafts retained/not rebound. Additive milestone delete permission row, retain on rollback.

Changed files:

- rdpms-system/backend/src/modules/projects/projectChildren.ts
- rdpms-system/backend/src/routes/projects.js
- rdpms-system/backend/src/routes/tasks.js
- rdpms-system/backend/src/routes/sync.js
- rdpms-system/backend/tests/integration/rp05-child-delta.integration.test.mjs
- rdpms-system/backend/tests/integration/rp05-parent-delete-guard.integration.test.mjs
- rdpms-system/frontend/src/components/EditProjectModal.tsx
- rdpms-system/frontend/src/api/endpoints/projects.ts
- rdpms-system/frontend/src/shared/projectEditCommand.ts
- rdpms-system/backend/src/kernel/constants.js
- rdpms-system/backend/prisma/seed.js
- rdpms-system/backend/prisma/migrations/20261006_milestone_delete_permission/migration.sql

Source before snapshots and task-specific diff are retained. No commits/deployments.
