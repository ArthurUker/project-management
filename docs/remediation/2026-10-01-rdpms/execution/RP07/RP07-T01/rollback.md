# RP07-T01 rollback boundary

No schema, migration, dependency or persistent runtime resource changed. Local rollback is limited to the new project status command helper and its imports/call sites; retain predecessor RP04/RP05 changes and all unrelated worktree content.

Removing the shared guard or restoring status/managerId as generic sync fields can re-enable archive through `projects.update` alone and manager updates without the approved relationship contract. The old implementation is not a safe production rollback target. No production rollback was rehearsed or deployed (`NOT_RUN` / `NOT_EVALUATED`). Any rollback must retain equivalent archive authorization and transition validation, and keep manager sync disabled until policy is approved.
