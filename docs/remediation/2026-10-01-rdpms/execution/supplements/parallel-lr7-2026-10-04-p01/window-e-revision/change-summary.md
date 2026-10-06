# Window E — Change Summary (PREPARATION_ONLY)

**Window:** E — T-RP-03 / S03-OI-09 client revision matrix
**Batch:** parallel-lr7-2026-10-04-p01
**Mode:** SOURCE_CLIENT_MATRIX_AND_PROPOSED_POLICY_ONLY
**Date:** 2026-10-04
**Executor:** RDPMS parallel-window E worker

## What was done
This window is read-only on source code and produces **preparation materials only**. It extends the existing
`RP00-T03` revision-support-matrix into a full client→server revision chain matrix, and prepares the
`T-RP-03` compatibility decision and the `S03-OI-09` evidence gap request. No code, schema, test, config,
deploy script, or root ledger was modified.

### Deliverables produced (all under `window-e-revision/`)
1. `evidence/source-client-matrix.md` + `.csv` — every client entry point → API → outbox/queue →
   sync-server → conflict/retry chain, with base read/send/persist, missing-base and legacy branches,
   current file:line and sha256, and per-row evidence tier.
2. `evidence/support-evidence-register.json` — strictly separates source observation, build version,
   deployed version, product-declared supported version, and upgrade cutoff. The last three are
   `UNCONFIRMED` / `OPEN_INPUT` because no external deployment/support evidence was provided to this window.
3. `decision-draft.json` + `.md` — `T-RP-03` recommended client-revision compatibility contract
   (missing-base / 409 interaction, upgrade window, field/status/assignee full-chain scope). All policies
   `PROPOSED`; `approvedBy` / `approvedAt` are null; `evidenceRef` links to this window's register.
4. `acceptance-draft.csv` — support-side scenarios (legal success / missing base / old revision / user
   switch / offline retry) plus the real IndexedDB & UI acceptance requirements. Dynamic execution is
   `NOT_RUN` (no fake-indexeddb installed; window prohibits build/browser/DB).
5. `evidence/external-client-evidence-request.md` — itemized list of truly missing deployment versions,
   support statements, upgrade times, and instance sources, with a blank fill-in structure. No server/SSH/
   credential access was used.
6. Seven common categories: `authorization.json`, `change-summary.md`, `evidence/`, `acceptance.json`,
   `rollback.md`, `task-state.json`, `handoff.md`, `REVIEW_ENTRY.md`.
7. `WORKER_MANIFEST.json` (sha256 of each file, excluding itself and READY.json) and `READY.json`.

## Key findings (source observations, not gate verdicts)
- **Asymmetry confirmed**: reports already enforce a version-gated concurrency baseline
  (`x-client-contract: v2` → `assertBaselineForModernClient` requires `expectedUpdatedAt`; legacy path only
  for unlocked non-scientific drafts), while **tasks do not** on any online path
  (PUT `/:id`, PATCH `/:id/status`, POST `/batch/status`) — no baseline token is accepted or forwarded
  (B16 class stale-overwrite exposure). RP10-T01 is the task that would close this gap.
- **Offline task sync**: `baseUpdatedAt` is optional. Missing base → server uses observed-timestamp CAS only
  (protects read→write race, not stale-client edits). Present-and-stale base → `conflict` (409-equivalent
  status). This matches the prior RP00-T03 matrix and is now extended with the retry/conflict branches.
- **Report offline enqueue** (`ReportEdit.tsx:358`) sends `data:{content}` with **no** `baseUpdatedAt`, so
  the report offline path lacks the baseline the report *online* path enforces — a concrete gap for RP10-T01.
- **Batch status** (`tasks.js:433-453`) does `prisma.task.update({where:{id},data})` with **no CAS and no
  baseline** — the most stale-prone task write path.
- **A03 subject isolation** is enforced in the offline engine (per-user outbox/conflict/dead-letter keys,
  session generation invalidation) and is orthogonal to revision but is included in the matrix because the
  S03-OI-09 question spans "across every entry".

## What was NOT done (per authorization)
- Did not enable strict CAS (RP10-T01). Did not modify any source/schema/test/config/deploy file.
- Did not update `RP00-T03` artifact, `S03-OI-09`, `T-RP-03`, or any root ledger.
- Did not declare `S03-OI-09` PASS — the deployed-supported-client inventory remains `OPEN_INPUT`.

## Drift note
Several business source files this window reads carry uncommitted modifications vs frozen HEAD
`138cf2da` (see `evidence/source-hashes.json`, DIFF rows). These are inherited pre-existing changes, not
produced here. All citations carry the working-tree sha256 plus the HEAD sha256 so the integrator can
reconcile. This window's outputs are unaffected because no code was changed.

## Gate status carried (unchanged by this window)
- `S03-OI-09`: remains `OPEN` / `NOT_RUN` (deployed supported client versions still unidentified).
- `T-RP-03`: remains `PROPOSED` (this window produced a draft, not an approval).
- `RP00-T03`: prior matrix `COMPLETE` for static source scope; gate validation unchanged.
- `RP10-T01`: not started by this window (strict CAS gated by S03-OI-09).
