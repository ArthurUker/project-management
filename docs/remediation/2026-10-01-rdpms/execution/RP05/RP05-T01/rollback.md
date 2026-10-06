# RP05-T01 rollback boundary

No schema, migration, dependency, or persistent runtime resource changed. A source rollback can restore the localized route guards and parent validation from `evidence/source-diff.patch`; rollback must preserve the predecessor RP04-T01/T02 changes in `projects.js` and unrelated worktree modifications.

Removing these guards would restore the demonstrated unauthorized nested hard-delete path and cross-project parent acceptance, and could restore the source-derived cross-project FK cascade path. Therefore an old unguarded version is not a safe production rollback target. No production rollback was rehearsed or deployed (`NOT_RUN` / `NOT_EVALUATED`). A compatible rollback requires a version that retains these protections or a separately approved containment plan.

No DB cleanup was needed: the isolated integration test and all fixtures were authored but never run.
