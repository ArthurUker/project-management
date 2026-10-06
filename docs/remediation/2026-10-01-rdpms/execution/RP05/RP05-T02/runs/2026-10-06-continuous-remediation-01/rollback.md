# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Pause child-edit/delete feature if candidate adapter unavailable; retain additive permission row and tombstones/relations/audits/receipts. Never restore old destructive rebuild or harddelete. No real/target migration run.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
