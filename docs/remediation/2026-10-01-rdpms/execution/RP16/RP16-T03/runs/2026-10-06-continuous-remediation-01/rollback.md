# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Retain DataRecoveryState/epoch/security floor/receipts/write triggers. Contain restore/sync instead of activating old unsafe JWT/app. Never decrement version, revive credentials, delete originals, clear pending gate or rekey old uncertain intent. Native reconciliation only exact manifest/current issuer, full first-safe rollback separate RP18.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
