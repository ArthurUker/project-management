# RP17-T01: staged uploads snapshots

- Finding: D01 remains open; this task does not close it.
- Baseline HEAD: `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`. `backup-pg.sh` was unchanged at task start. Start SHA-256 `275b2e0f4f1a0e3cd42a8301758567ddf7d730ce0f5f08a85b7c556dc776ec63`; end SHA-256 `74c033bccf7d5684dea0a66ac91f5b552af2e406d59ff8882e760ec616034101`.
- Only source file changed: `rdpms-system/deploy/scripts/backup-pg.sh`. Snapshot bytes are copied into a new `.staging-*` directory beneath UP_DIR; rsync hard-links from the resolved real previous snapshot; a SHA-256 file manifest is generated; only after both succeed is the dated snapshot renamed into place and a temporary symlink atomically replaced as `latest`. rsync/manifest failure cleans staging and does not move latest. Unsafe latest targets, target collisions and reserved-manifest-name collisions are rejected.
- No business API/schema or database migration. Retention, run lock/runId and pair cleanup remain outside scope; RP17-T02 is gated by T-RP-11.
- Owned temporary filesystem validation passed two add/change/delete rounds, retaining the first snapshot bytes and manifest and confirming unchanged file inode sharing. Injected rsync exit 23 retained the old latest and cleaned staging. The test uses a local FS and sudo/mv wrapper; target Linux validation remains in RP17-T03.
