# Handoff — Window E (T-RP-03 / S03-OI-09 client revision matrix)

**To:** Integrator / aggregator of batch `parallel-lr7-2026-10-04-p01`
**From:** Window E worker · **Date:** 2026-10-04
**Status:** READY_FOR_AGGREGATION (materials complete; gate S03-OI-09 remains OPEN by design)

## What this window delivered
A read-only, preparation-only extension of the `RP00-T03` revision matrix plus `T-RP-03` decision prep and
the `S03-OI-09` external-evidence gap request. All under `window-e-revision/`.

| File | Purpose |
|------|---------|
| `evidence/source-client-matrix.md` / `.csv` | Full client→server revision chain (fields/status/assignee/batch/offline/retry/conflict), base read/send/persist, missing-base & legacy branches, file:line + sha256, evidence tier |
| `evidence/support-evidence-register.json` | Strict separation: source observation / build version / deployed version / product-declared supported version / upgrade cutoff (last three UNCONFIRMED/OPEN_INPUT) |
| `decision-draft.json` / `.md` | T-RP-03 recommended compatibility contract (all PROPOSED, signatures null) |
| `acceptance-draft.csv` | Support-side scenarios + real IDB/UI acceptance requirements (dynamic NOT_RUN) |
| `evidence/external-client-evidence-request.md` | Itemized missing deployment/support/upgrade evidence with blank fill-in |
| `evidence/source-hashes.json` | Per-cited-file working-tree vs HEAD sha256 (DIFF disclosure) |
| `authorization.json`, `change-summary.md`, `acceptance.json`, `rollback.md`, `task-state.json`, `REVIEW_ENTRY.md` | Common seven categories |

## Key technical finding for the integrator
**Asymmetry:** reports online writes already enforce a version-gated baseline (`x-client-contract:v2` ⇒
`expectedUpdatedAt` required; legacy only for unlocked non-scientific drafts). **Tasks do not** on any online
path, and only optionally on offline sync. This is the core of S03-OI-09 / the work RP10-T01 would do.
The report path is the natural exemplar for T-RP-03 to extend to tasks. Two concrete gaps noted:
task `POST /batch/status` has no baseline/CAS at all; report offline enqueue omits `baseUpdatedAt`.

## Drift to reconcile before any gate change
Several business source files this window READ carry uncommitted modifications vs frozen HEAD `138cf2da`
(sync.ts, engine.ts, sync.js, tasks.js, reports.js, reportCommands.ts — see `source-hashes.json`, DIFF).
These are inherited pre-existing changes, not produced here, and this window changed no code. The integrator
should reconcile them to the committed baseline before using any citation to alter a gate.

## Gate impact (unchanged by this window)
- `S03-OI-09`: OPEN / NOT_RUN — deployed-supported-client inventory and product window are OPEN_INPUT.
- `T-RP-03`: PROPOSED (draft only).
- `RP10-T01`: not started (gated by S03-OI-09).

## What is needed next (outside this window)
1. Fill `external-client-evidence-request.md` from deployment/telemetry/product-owner sources.
2. Owner approves T-RP-03 (named approver/date) → only then can RP10-T01 strict CAS proceed and S03-OI-09 move toward NOT_OPEN.
