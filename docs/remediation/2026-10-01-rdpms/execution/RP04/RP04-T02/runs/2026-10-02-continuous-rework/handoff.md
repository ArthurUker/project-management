# RP04-T02 input rework handoff

The API now rejects malformed nested task scalars before normalization. Three integration tests passed in the fresh owned PostgreSQL database, including valid aggregate/idempotent replay, database rollback fault injection, and eight malformed DTO shapes with zero partial rows. LR-04 is fixed/tested locally. RP09-T01 still blocks broader PAC validation; PC03 and release remain open/not evaluated.

Next: RP05-T01 test fixture repair only, then ordinary sync-read RP08-T01. Preserve report source-state policy for RP10-T02.
