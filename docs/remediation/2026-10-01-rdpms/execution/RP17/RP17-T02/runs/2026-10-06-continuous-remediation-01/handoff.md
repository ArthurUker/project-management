# RP17-T02 handoff

Implementation COMPLETE, local validation see task-state and acceptance.json, independent review PENDING, release NOT_EVALUATED.

Immutable paired dump/files custom PG dump/list/hash, full source copy2 metadata verification and safe exact hash/mode/uid/gid/mtimeNS/size dedupe hardlinks; process flock run lease, unique/reentrant bound runId, commit marker after both directory publishes, atomic latest; pair retention validates all bytes, minrecent two/current previous latest/last validated/pins/unknown retained. Native PostgreSQL plus macOS owned FS7/7 including concurrent lease, two-round mutations, inode/permission change, failures/corruption/retention. Actual openrsync metadata regression discovered and avoided; failed attempts preserved. Pair consistentPoint NOT_VERIFIED / restoreEligible false until RP19.

Limits:

- Owned local macOS filesystem/PG only, not target Linux. No genuine stored historical snapshots inspected or reclassified.
- Pair tags/hash/pg_restore -l are not common DB/file restore point or complete recovery. restoreEligible false.
- Source metadata UID/GID mismatch fails unless process can reproduce ownership; published content never chmodded. Xattr/ACL target semantics not certified. Local optinode sharing not accepted as target FS behavior.
- No COS network operation, job installation, service/deployment, production retention change performed. Tool now requires Python3 and helper coinstallation, scheduling/log/offsite settings target gate.

Cleanup: real DB runs guarded drop/cluster stop exit0 and owned roots/dist absent; browser runs settled Chrome exit, server closed and own profile removed. Earlier failed attempt logs retained.

Next: RP17-T03 owned target evidence harness and exact targetLinux ENV gate
