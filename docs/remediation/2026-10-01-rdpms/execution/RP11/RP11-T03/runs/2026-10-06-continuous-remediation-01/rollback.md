# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Keep atomic moves and owner stores; preserve recovery originals/local action records, never revert delete-before-persist or global clear. Native failure/page reopen/actual UI cancel proved local preservation; target rollback NOT_RUN.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
