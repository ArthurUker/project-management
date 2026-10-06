# RP18-T02 local implementation

Actual FS process deployment lease, candidate/config/output/migration current drift checks, exact baseline CAS, same-FS atomic current pointer, persistent phase/effect records; explicit migration may-effect before invoking and stop/maintenance firstsafe fallback. Certified compatible safe artifact rollback only; unknown/unsafe old blocks. Compiled startup no src fallback, manifest+config fingerprint checks; literal env exec shared schema. Native1 test with10 owned FS/simulated service+DDL controls passed, no actual deploy/DDL/systemd/proxy.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: --prepare preserved; --apply requires explicit target approval plus target gatePASS refs/hooks/compatibility. Missing live proofs denies beforeops. Current startup requires reviewed release manifest/dist, no unsafe src fallback. rdpms-env compiled literal loader, no shellsource. No destructive release cleanup. All current real service changes NOT_RUN.

Changed files:

- rdpms-system/deploy/scripts/deploy-control.py
- rdpms-system/deploy/scripts/deploy.sh
- rdpms-system/deploy/scripts/rdpms-start.sh
- rdpms-system/deploy/scripts/rdpms-env
- rdpms-system/backend/src/platform/config/configExec.ts
- rdpms-system/backend/tests/integration/rp18-deploy-control.integration.test.mjs
- rdpms-system/backend/src/platform/config/configCli.ts

Source before snapshots and task-specific diff are retained. No commits/deployments.
