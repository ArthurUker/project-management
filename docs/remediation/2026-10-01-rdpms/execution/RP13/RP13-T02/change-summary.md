# RP13-T02 design draft

Created `evidence/WATERMARK_ADR_DRAFT.md` from the mapped B07 risk, current sync route/client changes, PC05/PC06/PC11/PC12 contracts, and registered gates. The draft compares timestamp overlap, max-ID, transactional outbox with commit-visible sequence, and WAL/CDC. It describes option 3 as a candidate, not a decision; lists source-revision/epoch/cursor semantics, producer coverage, retention/RESET, and deterministic barrier evidence.

No source code, schema, migration, or database changed. No business/security decision was approved. S03-OI-01 barrier evidence is unavailable; T-RP-04 and T-RP-10 remain PROPOSED. Therefore the ADR is unsigned, task implementation remains IN_PROGRESS, validation NOT_RUN, and B07 remains open.
