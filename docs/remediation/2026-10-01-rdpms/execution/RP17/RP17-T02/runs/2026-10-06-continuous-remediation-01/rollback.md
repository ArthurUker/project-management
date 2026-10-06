# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Pause unsafe old snapshot backup path; keep new and historical complete/partial/unknown pairs. Do not return to cp softlink snapshot or split age-based dump/uploads pruning. No production backup reclassification or repair. No actual restore accepted merely by hash/list.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
