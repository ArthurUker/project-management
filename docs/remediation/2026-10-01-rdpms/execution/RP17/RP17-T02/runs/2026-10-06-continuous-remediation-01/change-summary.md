# RP17-T02 local implementation

Immutable paired dump/files custom PG dump/list/hash, full source copy2 metadata verification and safe exact hash/mode/uid/gid/mtimeNS/size dedupe hardlinks; process flock run lease, unique/reentrant bound runId, commit marker after both directory publishes, atomic latest; pair retention validates all bytes, minrecent two/current previous latest/last validated/pins/unknown retained. Native PostgreSQL plus macOS owned FS7/7 including concurrent lease, two-round mutations, inode/permission change, failures/corruption/retention. Actual openrsync metadata regression discovered and avoided; failed attempts preserved. Pair consistentPoint NOT_VERIFIED / restoreEligible false until RP19.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: backup-pg wrapper now installs backup-pair.py alongside; production uses sudo postgres peer and no dotenv. New PG_DIR/pairs/<run>/database.dump+pair.json and UP_DIR/<run> actual immutable directory; latest always fully checked. Old flat dumps/snapshots remain preserved and unclassified. Python3 required; offsite COS/scheduler/log deployment not evaluated. Native test PG branch only verifies owned db/127.0.0.1/exact synthetic DB binding.

Changed files:

- rdpms-system/deploy/scripts/backup-pg.sh
- rdpms-system/deploy/scripts/backup-pair.py
- rdpms-system/backend/tests/integration/rp17-backup-pair.integration.test.mjs

Source before snapshots and task-specific diff are retained. No commits/deployments.
