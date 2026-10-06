# RP13-T03 handoff

Implementation COMPLETE, local validation see task-state and acceptance.json, independent review PENDING, release NOT_EVALUATED.

Seven producer DB tables capture exact source revision/scope/epoch/deletion atomically on all DML, commit-visible on-demand publication head allocated in same transaction, no sequence holes on rollback; signed fixed-cut500 pages/latest-revision collapse/current ACL/report own-only/live metadata projection. Native JWT journal9; real Chrome IDB6 revision/tombstone/abort/partial-page; regressions ACL6/read12/legacy pagination2/JWT Chrome ACL7/receipts6 twice/restore1/apply11/epoch10/unit93. Legacy timestamp always full safely; candidate v2 cursor upgrade reset preserves originals. No automatic journal GC or production target claim.

Limits:

- Native fixtures use owned synthetic accounts/DB/HTTP/Chrome; synthetic browser revision mode explicitly not JWT. All source tables producer capture proven by actual DML+DB triggers, plus current native HTTP/sync/restore regression; full UI/template/import actor scenarios not all individually replayed.
- Publisher conservative cap10000 unpublished returns503/rollsback and never falsely advances; target sizing/lag and arbitrary large initial bootstrap not certified. Retain all journal, no automatic garbage collection/scheduling; production operational limits external.
- One uninstrumented receipt owner-reentry regression failed at A automatic retry after correct A→B isolation; scoped diagnostic copy with unchanged assertions passed6 twice. Cause not conclusively determined, original failure retained for independent review; no unrelated auth/retry policy repair.
- Legacy incremental fixture assertions now bind actual v2 signed commit sequence with no wall clock sleep; ordinary legacy fields unchanged. Complete actual supported client and release catalog external.

Cleanup: real DB runs guarded drop/cluster stop exit0 and owned roots/dist absent; browser runs settled Chrome exit, server closed and own profile removed. Earlier failed attempt logs retained.

Next: RP17-T02 immutable backup pair lease/manifests/retention
