# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Disable application JSON restore endpoint while maintaining gate/triggers/evidence. Never revert to skipDuplicates/inputlength counts or clear pending gate without exact manifest verification. Gate migration must remain for compatible candidate; first-safe deployment/real rollback not evaluated.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
