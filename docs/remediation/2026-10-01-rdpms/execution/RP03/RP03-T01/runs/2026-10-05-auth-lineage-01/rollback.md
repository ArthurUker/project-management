# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. No schema changes.

Do not restore unconditional token writes/clears, global singleflight or cross-identity request replay. Local hunk rollback only after checking downstream changes; target rollout/rollback not evaluated. Existing legacy keys cannot safely restore a refresh token already consumed by the server.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
