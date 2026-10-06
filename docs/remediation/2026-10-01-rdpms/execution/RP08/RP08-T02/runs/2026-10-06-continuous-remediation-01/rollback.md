# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Do not return to IDs-only ACL or timestamp incremental on newly granted scopes. Keep actor queue/scopeBlocked metadata and last-copy recovery. Can pause sync; never clear owner outbox when mirror resets.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
