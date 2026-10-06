# ADR draft: commit-visible sync watermarks and event revisions

Status: **PROPOSED DRAFT — NOT APPROVED, NOT IMPLEMENTED**  
Scope: RP13-T02 design input for B07; no product, schema, or operational decision is signed here.

## Problem and safety invariant

The current `updatedAt > since` pull cannot establish commit order. A transaction can assign an `updatedAt` earlier than the timestamp returned by `/sync/init`, remain open, and commit after that pull. The next strict-greater-than request then excludes the committed row indefinitely. A larger timestamp window, page limit, `MAX(id)`, or ordinary sequence allocation does not by itself prove that all lower values have committed.

Required invariant: once a client checkpoint `C` is acknowledged, every eligible committed source change is either represented in the completed pull through `C`, or has a durable later position that will be returned by a later pull. A page cursor can advance only after every stream page in the fixed window is applied locally. Authorization is checked for every page; ACL loss purges newly unauthorized local rows without deleting the actor's outbox.

## Options under consideration

1. **Timestamp plus overlap window.** Re-read an agreed overlap before `since`. This is safe only if a measurable hard maximum transaction/replication delay is enforced and cursor retention exceeds it. No such bound or enforcement evidence exists. It is not the present recommendation.
2. **Maximum auto-increment ID.** IDs may be allocated before commit; a later ID can commit first while a lower ID remains open. A max-ID checkpoint can skip the late lower row. Not safe without a separate commit-order barrier.
3. **Commit-visible published sequence backed by a transactional outbox.** Each domain write records the exact source revision/projection or tombstone in the same DB transaction. A publisher later assigns visible sequence numbers while holding one transactional watermark row lock until commit. Because the lock is held through sequence-row and event commit, a later visible sequence cannot commit ahead of an earlier allocator. Rollback discards both assignment and event. This is the candidate option for barrier testing, not an approved architecture.
4. **Database WAL/CDC position.** A commit LSN can represent commit order, but adds operational replication-slot lifecycle, lag, retention, deployment, and recovery dependencies. No current CDC service or owner evidence is recorded; do not assume one exists.

## Candidate design if option 3 passes evidence and approval

- In each eligible source transaction, persist an outbox record containing dataset epoch, entity/id, monotone per-resource source revision, action/tombstone, and the projection needed to reproduce that exact revision. The source mutation and outbox record commit or roll back together.
- A publisher claims committed unpublished rows idempotently. In a transaction, it locks a singleton publication-state row, assigns the next transactional published sequence, appends an immutable event, marks the outbox row published, and commits while still holding the lock. A unique key on source outbox identity prevents duplicate events after retry. Do not use a non-transactional database sequence as the safety proof.
- Pull pages are ordered by `publishedSequence, entity, id`; cursor includes protocol version, dataset epoch, authorization/scope version, and last fully applied published sequence. The response has explicit `hasMore` and continuation token. The client advances its durable checkpoint only after all pages are applied. Replays are idempotent.
- Each resource projection carries source revision. A client applies an event only if its revision is newer than the cached revision; this prevents a delayed old event from replacing a newer snapshot or event. Tombstones carry the same revision and epoch.
- Publisher retries may duplicate delivery but may not omit a committed outbox row. Outbox/event retention must exceed the supported offline interval; expired cursors return `RESET_REQUIRED` and preserve local outbox/dead letters.
- Bootstrap establishes a documented snapshot cut and matching cursor. Snapshot rows include source revision. Events newer than the cut are replayed; duplicate/equal revisions are ignored. ACL is recomputed on each page and ACL loss triggers local purge while retaining unsent owner payloads.
- Restore increments/changes a dataset epoch only under approved T-RP-10 semantics. A cursor from another epoch cannot continue; it triggers controlled resnapshot without erasing outbox content.

## Producer coverage and explicit exclusions

Before activation, inventory every write path that can change a synchronized entity: HTTP routes, sync push, project templates/aggregate creation, batch/import jobs, registration and report commands, backup/restore, relation cascades, scheduled/background jobs, and administrative scripts. Each path must write the outbox in the same transaction, emit an explicit epoch reset, or be disabled under a separately approved rule. Unknown producer coverage is a release blocker, not an implicit success.

RP13-T02 does not implement schema changes or choose retention, ACL reset, restore epoch, old-client compatibility windows, publisher service lifecycle, or resource budgets. Those require T-RP-04, T-RP-10, PC11 measurements, and the applicable owners. RP13-T03 remains gated before implementation by T-RP-04/T-RP-10.

## Required deterministic evidence before signing

S03-OI-01 is unresolved. On a newly created local PostgreSQL test database, use two sessions and a barrier:

1. Session A begins a source transaction, changes a sync entity and writes its outbox row, then pauses before commit.
2. Session B performs/finishes a pull and records the returned checkpoint while A remains open.
3. Commit A; the next pull must return A's exact source revision after the prior checkpoint. Repeat with same-timestamp changes, publisher crash before/after event commit, retry, rollback, page interruption/replay, and two competing publishers.
4. Assert committed source rows and outbox/event rows in PostgreSQL, sequence order and uniqueness, no permanent hole, exact client projection, and no checkpoint advancement before IDB page application completes.
5. Record command, DB target ownership, barriers, baseline, exit status, sanitized logs, durable row counts/revisions, cleanup, and resource/lock timing. No `rdpms`, shared, production, or historical fixed audit DB.

T-RP-04 approval must identify the selected watermark/bootstrap design, exact producer scope, snapshot and expiry/RESET semantics, named approver/date, and compatible client/schema window. T-RP-10 separately defines restored dataset epoch and stale cursor/session/outbox treatment. T-RP-11 budget/monitoring values must be measured or approved before release; no numeric values are invented here.

## Decision

No option is selected. Option 3 is a test candidate only. Keep T-RP-04, T-RP-10, and S03-OI-01 open; do not sign this draft, migrate schema, create a publisher, or mark B07 fixed until the barrier evidence and named approvals exist.
