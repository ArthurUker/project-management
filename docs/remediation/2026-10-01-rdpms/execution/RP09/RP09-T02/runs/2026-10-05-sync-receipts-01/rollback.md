# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Validated owned containment switch; do not reenable old global replay or independently committing receipt paths. Preserve additive schema and receipt/audit/last-copy data. Target rollback/restore not run.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
