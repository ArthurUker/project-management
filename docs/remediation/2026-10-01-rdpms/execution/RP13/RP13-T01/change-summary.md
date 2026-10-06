# RP13-T01: stable paged pull

B07 remains SUPPORTED and not FIX_ACCEPTED. Baseline HEAD `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`. Backend sync.js task start reconstructed from preserved RP05/RP07 task diffs and matches RP07 end hash.

Changed backend sync route, frontend SyncInit API type and engine, plus backend pagination integration coverage and frontend checkpoint unit coverage. No schema/migration changes. Server now pages upsert and tombstone streams independently using timestamp+id keysets, a fixed upper timestamp bound, and signed actor/device-bound tokens. Until final page, response cursor remains at the lower bound. Legacy clients receive 409 if result exceeds the page cap without pagination support. Client applies each page to its user-scoped mirror but advances durable cursor only after final page; outbox push follows full pull.

This does not solve late-committing transactions behind a timestamp watermark. AC-B07-03/S03-OI-01 is deferred to RP13-T02.
