# RP17-T01 rollback

Only `deploy/scripts/backup-pg.sh` changed. Before deployment, reverse only this task diff from `evidence/source-diff.patch`; first protect other shared-worktree changes. No schema or business data changed.

Rsync/manifest failure cleans staging and leaves latest unchanged. An interruption after dated-directory rename but before latest replacement can leave a complete unreferenced snapshot; inspect it before any cleanup. Production backup history was not read or changed. Production rollback and target Linux rehearsal are NOT_RUN. Do not restore the former direct-to-final publication path.
