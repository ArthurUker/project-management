# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

New owned restore target/FS clean afterguarded drop; source/backup original neveroverwrite. Physical restore remains contained until integrity and currentfloor/newEverified. Production no safe whole restore certified, preserve pausedoriginal and pair.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
