# Decision Draft — T-RP-03 客户端revision兼容 (PROPOSED)

**Prepared by:** Window E worker (parallel-lr7-2026-10-04-p01) · **Date:** 2026-10-04
**Status:** PROPOSED · `approvedBy`: null · `approvedAt`: null
**Evidence:** `evidence/support-evidence-register.json` · **Matrix:** `evidence/source-client-matrix.md`
**Affected task:** RP10-T01 · **Open item:** S03-OI-09

> This is preparation material for the decision owner. It does not approve strict CAS and does not modify
> any code or root ledger. All policies below are recommendations pending named approval.

## Context (from source)
- Reports already enforce a **version-gated** baseline (`x-client-contract: v2` ⇒ `expectedUpdatedAt`
  required; legacy only for unlocked non-scientific drafts) — `reports.js:323-406`, `editPolicy.ts:44-57,117-141`.
- Tasks do **not** enforce any baseline on any online path (`PUT /:id`, `PATCH /:id/status`,
  `POST /batch/status`) and only optionally on offline sync — B16-class stale-overwrite exposure remains.
- Offline report enqueue (`ReportEdit.tsx:358`) omits `baseUpdatedAt`, so report offline lags report online.

## Recommended policies
1. **P1 — Extend the reports-style contract to tasks.** Reuse `editPolicy.ts` helpers for task online writes
   and the sync `tasks` entity. Modern clients MUST send a baseline.
2. **P2 — Missing-base handling.** Modern client missing baseline ⇒ reject `CONCURRENCY_BASELINE_REQUIRED`
   (400/409). Legacy client missing baseline ⇒ allow only inside a time-boxed, audited compatibility window.
3. **P3 — 409 interaction.** Stale/conflicting baseline ⇒ return conflict with server snapshot. Online: 409
   `CONFLICT`. Offline: `SyncChange` `conflict` + snapshot, stored per-user; `resolveConflict` supports
   `server`/`local`. Missing base never yields a conflict.
4. **P4 — Upgrade window.** Minimum baseline-capable client version + dated cutoff to flip `allowLegacyCompat`
   false (reports first, then tasks). Cutoff = OPEN_INPUT.
5. **P5 — Full-chain scope.** Cover ordinary fields + status + assigneeId (mixed transaction), batch/status,
   and offline sync upsert; also close the offline report `baseUpdatedAt` gap.

## Risk acceptance (placeholder)
- **RA-1:** Until the legacy window closes, legacy no-baseline clients retain stale-overwrite exposure on
  tasks. Acceptable only with an explicit, dated sunset and owner sign-off. `acceptedBy`/`acceptedAt`: null.

## What is required to approve (not provided by this window)
- Chosen option + precise scope (P1–P5).
- Named approver + date.
- Compatible client/schema window from `external-client-evidence-request.md` (deployed versions DV-1/DV-2,
  product window PV-1/PV-2, cutoff UC-1/UC-2).
- Risk acceptance RA-1.

## Relationship to gates
- `S03-OI-09` stays `OPEN`/`NOT_RUN` until the external evidence above is filled and the full supported-client
  matrix is certified.
- `RP10-T01` (strict CAS) stays gated by `S03-OI-09`; this draft is the design input, not the implementation.
