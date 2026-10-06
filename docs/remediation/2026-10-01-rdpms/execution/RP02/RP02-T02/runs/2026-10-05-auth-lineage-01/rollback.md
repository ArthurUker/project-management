# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. No schema changes.

Never restore unconditional revoke/new-family or double-success path. Safe target rollback not evaluated; no token resurrection or audit deletion.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
