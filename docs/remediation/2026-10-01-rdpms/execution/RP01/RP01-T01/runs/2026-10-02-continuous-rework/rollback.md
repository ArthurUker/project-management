# Rollback — RP01-T01 scalar DTO rework

No schema, migration, dependency or role relationship policy changed. To reverse the rework, review the scoped patch/hash and revert only the explicit type/length checks and new validation cases in roles.js/test file. Do not remove the command-specific whitelist, server-field denial or global `GLOBAL_FORBIDDEN_FIELDS` protection. Reverting code would restore the confirmed 500 behavior for malformed scalar inputs. Target/release rollback was not run and remains NOT_EVALUATED.
