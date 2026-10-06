# Local rollback boundary

Review evidence/source-diff.patch against current bytes; reverse only this task’s hunks or restore exact task-owned before bytes after confirming no later changes. Do not reset/clean/stash or overwrite preexisting edits. New test files may be removed only if still task-owned. Approved additive schema only; retain columns and records on rollback.

Default first-safe containment stopWrites+independent stopService, preserve current/schema/backup/manifest, no blind priorapp or migrate-down. Only separately security-safe/current-schema compatible artifact certified by target operator eligible; successrollback stillfaileddeploy. Partial stop is uncertain, never healthyprevious assertion.

Production rollback/deploy/target environment: NOT_RUN / NOT_EVALUATED. Do not delete audits, report versions or receipts.
