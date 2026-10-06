# Rollback — RP04-T02 input validation

No schema change. Revert only the raw task scalar checks and new malformed-input tests after comparing scoped hash/diff. Reverting validation reintroduces a confirmed 500 for malformed applicability and related nested scalar inputs. Do not revert the project's existing aggregate transaction or alter report source-state behavior. No target release rollback was performed.
