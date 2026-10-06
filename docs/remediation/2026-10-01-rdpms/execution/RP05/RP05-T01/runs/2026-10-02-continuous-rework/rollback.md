# Rollback — RP05-T01 fixture correction

Only two test request bodies gained the existing project name as a valid scalar. Revert only those fixture fields if necessary. No production behavior or schema changed. Removing them restores early NO_VALID_FIELDS rejection and leaves the deletion guards untested. No release rollback was involved.
