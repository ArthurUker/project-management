# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Keep account protection and strict audit; do not restore unsafe admin→SUPER reset. Target containment/rollback not run.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
