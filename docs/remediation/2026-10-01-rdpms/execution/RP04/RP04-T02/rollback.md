# RP04-T02 rollback boundary

No database schema, migration, dependency, or persistent runtime resource changed. Local rollback can restore the `projects.post('/')` handler and the added integration test from the task-start source represented by `evidence/source-diff.patch`; do not revert the pre-existing RP04-T01 edits in `projects.js` while doing so.

Restoring the old handler reintroduces the B18 partial-aggregate behavior and post-commit best-effort audit. It is not a safe production rollback target without an explicit containment plan. No production version was selected, rollback was not rehearsed, and no deployment occurred; production rollback status is `NOT_RUN` / release `NOT_EVALUATED`.

The new integration test installs database triggers only in a newly created task-owned throwaway database. It must not be run against the existing backend `.env`, a shared database, or the frozen audit database. The test runner must drop the exact throwaway database after evidence capture; no such database was created in this task.
