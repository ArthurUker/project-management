# RP19-T02 local implementation

Real owned pg_dump and pg_restore into a new guarded target. Three deterministic add/change/delete writer rounds settled; actual RESTORING DB barrier rejected external write during capture. All public tablecounts and every restored file reference/size/hash match. Wrongpair/corruptdump refused beforetarget. Owned-only seal requires exact userID/RBAC catalogs, preserves latest password/status/rank/version floor, createsnewUUIDE/revokesoldrefresh, keepsolddevices/ordinary+sync receipts/events; oldJWT/refresh/device reject, newlogin/current nonempty pull succeed. Invalidfloor/policy/ownership refuse without clearingcontainment. Published pair remains NOT_VERIFIED/restoreEligibleFalse. Final5/5 attempt03, earlierempty-query fixturefailure preserved.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: New integrity checker and OWNED_DRILL_ONLY securityseal/harness only, not a general production restoration utility; no existing pair formats/migrations/auth policies changed. CurrentID and fullRBAC mismatch explicitly requires ownerreconciliation, no defaultimport/activation. No realexisting target overwritten.

Changed files:

- rdpms-system/deploy/scripts/drill/paired-restore-check.py
- rdpms-system/backend/tests/integration/rp19-paired-restore.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
