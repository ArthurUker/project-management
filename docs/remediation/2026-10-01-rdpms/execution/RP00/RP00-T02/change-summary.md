# RP00-T02 — 500 recovery contract targeted static review

- **Task:** RP00-T02; package RP00 remains IN_PROGRESS.
- **Historical issue:** S03-OI-03 (static prerequisite); B06 remains SUPPORTED / P1 and is not fixed by this review.
- **Start/end HEAD:** `138cf2da1b63195cef7e884f69bdf8ded6ed3c21` (unchanged).
- **Source change:** none. No backend/frontend business files, schema, migrations, dependencies, tests, or runtime resources were changed.
- **Review result:** failure-point matrix covers pre-loop failures, validation/rejection, operation error, business-write/receipt gap, partial batch, post-receipt failures, response loss, partial client response processing, and retention expiry/unknown.
- **Confirmed path:** `POST /api/sync/push` persists device metadata, prefetches global receipts, processes items sequentially, writes business effects in entity-specific paths, then separately upserts `SyncMutation`; late errors can escape as 500. The frontend keeps outbox rows on push rejection and resends the stored mutation fields later. `/sync/status` exposes counts but no key-level result.
- **Historical evidence:** B06 is inherited from frozen `backend-results.json`: HTTP 500, changed title persisted, receipt count zero. It was not rerun.
- **Recommended contract:** per-command atomic authorization/CAS/business/audit/scoped receipt; immutable actor/key/hash; key-level outcome query or exact same-key/hash retry; explicit unknown/expired state; retain a durable client copy before deleting outbox. This is a proposed technical contract, not an approval or implementation.
- **Impact boundary:** RP00-T02 static deliverable only. PC03 remains PROPOSED; INT-PC03-01 remains NOT_RUN; deployed retention S03-OI-04 remains OPEN.
- **Inputs:** all 10 frozen S03 source hashes match current files. Additional request/error/IDB files were read-only supplements.

See `evidence/failure-point-matrix.json` for per-failure DB/receipt/HTTP/IDB/retry/last-copy behavior and source line references.
