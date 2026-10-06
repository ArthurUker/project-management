# Source Client Revision Matrix — Window E (extension of RP00-T03)

**Scope:** full client→server revision chain for ordinary fields / status / assignee / batch / offline
enqueue / retry / conflict handling, and the server-side revision field each path uses.
**Mode:** read-only source tracing. **No implementation, no dynamic run.**
**Baseline head:** `138cf2da`. Citations use **working-tree** line numbers + sha256 (some files are DIFF
from head — see `source-hashes.json`). `x-client-contract` header constant = `x-client-contract`
(`editPolicy.ts:19`).

## Evidence tiers
- **SRC** — source observation (current file:line + sha256).
- **HIST** — reused historical evidence (B16 dynamic test, not rerun here).
- **PROP** — proposed policy (T-RP-03 draft).
- **UNCONF** — missing external evidence (deployed/supported versions), recorded as OPEN_INPUT.

## Central asymmetry (the heart of S03-OI-09 / T-RP-03)
| Entity | Online write baseline | Offline (sync) baseline | Strict CAS today? |
|--------|----------------------|-------------------------|------------------|
| Tasks (PUT/PATCH/batch) | **none** — no `expectedUpdatedAt`/`baseUpdatedAt` token accepted or forwarded (`tasks.js:247-330, 333-347, 433-453`; `tasks.ts` endpoint has no baseline field) | optional `baseUpdatedAt`; missing → only observed-ts CAS; present+stale → `conflict` | **No** (B16 class) |
| Reports (PUT/POST) | **enforced for modern client** — `x-client-contract: v2` ⇒ `assertBaselineForModernClient` requires `expectedUpdatedAt` (400/409); legacy only for unlocked non-scientific drafts (`reports.js:323-406, 110-253`; `editPolicy.ts:44-57, 117-141`) | `ReportEdit.tsx:358` sends `data:{content}` **without** `baseUpdatedAt` ⇒ server uses observed-ts CAS only (gap) | Partial (online yes, offline no) |

Reports are the **exemplar** T-RP-03 should extend to tasks: a header-gated contract with a global
`allowLegacyCompat` switch (`editPolicy.ts:23`) and per-write legacy admission (`assertLegacyCompatAllowed`).

## Entry-point chain matrix

### A. Task ordinary fields — online editor save
- Client entry: `Tasks.tsx:508-521` → `taskAPI.update(id, data)`.
- API: `tasks.js:247-330` `PUT /api/tasks/:id` (whitelist `pickAllowed` `tasks.js:251-256`).
- Server revision: **none**. `updateTaskFields(tx,{...})` called with **no `cas`** (`tasks.js:301-312`).
- Base read/send/persist: client does not read or send any baseline; IDB outbox not involved (online path).
- Missing-base branch: N/A (baseline concept absent online) → stale write **accepted** (B16).
- Legacy branch: all online clients are "legacy" for tasks (no contract gating exists).
- Evidence: SRC (`Tasks.tsx` bd716f8d, `tasks.js` a386afba, `tasks.ts` 77090551). Stale-overwrite: HIST B16.

### B. Task status — online (PATCH /:id/status) and Kanban drag
- Client entry: `Tasks.tsx:484-506` (online branch `taskAPI.updateStatus`), `KanbanBoard.tsx:516-539`.
- API: `tasks.js:333-347` `PATCH /api/tasks/:id/status` → `prisma.task.update({where:{id},data:{status...}})` **no CAS, no baseline**.
- Base/persist: none.
- Missing-base: N/A → stale accepted.
- Evidence: SRC.

### C. Task status — offline enqueue (the only first-party offline task producer found)
- Client entry: `Tasks.tsx:491-498`, `KanbanBoard.tsx:523-530` → `enqueueChange({entity:'tasks',op:'upsert',data:{status},baseUpdatedAt: task.updatedAt})`.
- Persist: `engine.ts:171-181` writes `OutboxRecord` to IDB outbox incl. `baseUpdatedAt` (`idb.ts:12-22`, key `clientMutationId`).
- Server: `sync.js:500-749` `POST /api/sync/push`; tasks entity `sync.js:74-95`; conflict precheck
  `sync.js:589-595` (present+stale base → `conflict` with server snapshot); update path
  `sync.js:617-651` passes `casFilter = existing[tsField]` once on first write (`nextCas()` consumed once).
- Base read at client: `task.updatedAt` captured at enqueue (`Tasks.tsx:497`, `KanbanBoard.tsx:529`).
- Missing-base branch: `baseUpdatedAt` absent ⇒ no conflict precheck; `casFilter` still = observed ts, so
  concurrent read→write race protected but **stale-client edit NOT rejected**.
- Conflict/retry branch: `engine.ts:294-314` stores `conflict` keyed by userId (`idb` conflictKey);
  `resolveConflict` (`engine.ts:370-382`) supports `server` (discard) or `local` (re-push with
  `baseUpdatedAt = server.updatedAt`).
- Evidence: SRC (`engine.ts` 5775758e, `idb.ts` 61e81973, `sync.js` ff7f54a5).

### D. Task assignee — online
- Client entry: `Tasks.tsx:508-521` includes `assigneeId` in `data` when editor edits it.
- API: `tasks.js:247-270` splits `assigneeId` → `assignTask(tx,{...})` **no `cas`** (`tasks.js:301-312`).
- Base/persist: none. Missing-base: N/A → stale accepted. Evidence: SRC.

### E. Task assignee — offline
- First-party offline `enqueueChange` caller for assigneeId: **not found** in `Tasks.tsx`/`KanbanBoard.tsx`
  (only status enqueues). Generic sync *could* carry `baseUpdatedAt` but no first-party producer exists.
- Evidence: SRC (negative finding). Missing-base branch: would mirror C if a producer existed.

### F. Task mixed fields + status + assignee — single PUT
- API: `tasks.js:301-312` one `$transaction` composing `updateTaskFields`+`changeTaskStatus`+`assignTask`,
  **no `cas` on any**.
- Base: none. Missing-base: N/A → mixed stale body applied atomically (B16 covers title path only).
- Evidence: SRC + HIST (B16 title only).

### G. Task batch status — POST /batch/status
- Client entry: **no first-party UI caller found** in the read scope (endpoint exists for API/integrators).
- API: `tasks.js:433-453` loops `prisma.task.update({where:{id},data:{status...}})` **no CAS, no baseline**.
- Base/persist: none. Missing-base: N/A → most stale-prone path (no per-row guard at all).
- Evidence: SRC (`tasks.js` a386afba). Flagged as a gap for T-RP-03 (should be contract-gated).

### H. Task generic offline upsert (entity `tasks`)
- Server: `sync.js:74-95, 559-685`. `pickFields` whitelist (no version column). `casFilter`=observed ts;
  conflict only when `baseUpdatedAt` present & stale (`sync.js:589-595`); else `applied` (CAS-on-observed-ts).
- Base read/send/persist: only when a client producer supplies `baseUpdatedAt` (see C/E).
- Evidence: SRC.

### I. Report draft — online PUT /:id (exemplar of enforced baseline)
- Client entry: `ReportEdit.tsx` online branch (else at `:366+`) → REST `reports.update` with
  `expectedUpdatedAt` (carried in UI cache).
- API: `reports.js:323-406` `PUT /api/reports/:id`; parses `expectedUpdatedAt` (`reports.js:337`);
  `readClientContract`+`assertBaselineForModernClient` (`reports.js:342-343`); legacy admission
  `assertLegacyCompatAllowed` (`reports.js:369-373`); `saveReportDraft(tx,{cas:{updatedAt:expectedUpdatedAt}})`
  (`reports.js:382-384`) → atomic UPDATE WHERE `updatedAt = expectedUpdatedAt`; baseline mismatch ⇒ 409
  `CONFLICT` (`reportCommands.ts`).
- Missing-base (modern client): **rejected 400** `CONCURRENCY_BASELINE_REQUIRED` (`editPolicy.ts:44-57`).
- Missing-base (legacy, `allowLegacyCompat=true`, unlocked non-scientific draft): **accepted**, audited
  `noConcurrencyBaseline` (`reports.js:401`).
- Evidence: SRC (`reports.js` f0f16e23, `editPolicy.ts` d77cadd2, `reportCommands.ts` 06293fbd).

### J. Report draft — offline enqueue (GAP for RP10-T01)
- Client entry: `ReportEdit.tsx:354-365` → `enqueueChange({entity:'reports',op:'upsert',id,data:{content}})`
  — **no `baseUpdatedAt`**.
- Server: `sync.js:620-624` reports branch → `saveReportDraft(prisma,{cas: casFilter})` where
  `casFilter = existing[updatedAt]` (observed ts). So offline report write has **no stale-client rejection**,
  unlike the online report path.
- Evidence: SRC. Flagged as a gap: extend `ReportEdit.tsx` offline enqueue to carry `baseUpdatedAt`, and/or
  gate it under T-RP-03's contract.

### K. Conflict handling (all entities)
- Server returns `status:'conflict'` + `server` snapshot only when `baseUpdatedAt` present & stale
  (`sync.js:589-595`) or concurrent CAS fails (`sync.js:661-665`, `syncConflict=true`). Missing base never
  yields a conflict.
- Client: `engine.ts:294-314` (store), `resolveConflict` `engine.ts:370-382` (`server`/`local`),
  `SyncConflictDialog.tsx:124-127` UI. Evidence: SRC.

### L. Retry (rejected / dead-letter)
- `engine.ts:390-401` `retryRejection` re-enqueues original payload + `clientMutationId` (idempotent replay;
  server `sync.js:544-554` replays `applied` results, re-judges non-applied). `syncNow` re-pushes pending
  outbox on reconnect/interval (`engine.ts:241-367, 464-466`). `preservePendingForUser`/`isolateForeignOutbox`
  (`engine.ts:483-503, 558-575`) keep per-user ownership on logout/switch. Evidence: SRC.

### M. Delete
- Online: `tasks.js` DELETE route (separate). Offline: `sync.js:596-609` op=delete uses tombstone,
  **excluded** from stale-base precheck (`sync.js:589` `op!=='delete'`). Stale-delete policy = S03-OI-05
  (out of scope). Evidence: SRC.

## Reused prior evidence
- `revision-support-matrix.json` (RP00-T03) — static task matrix, ordinary-field matrix, revision-carrier
  comparison. Carried forward; not rerun.
- B16 dynamic: `docs/audits/2026-09-29-rdpms/backend-results.json#B16_TASK_HTTP_IGNORES_BASELINE` — stale
  title PUT returned 200 (HIST; not rerun in this window).

## Limitations (carry-over + additions)
- Build `package.json` versions (frontend 1.0.0, backend 2.0.0) are **not** proof of deployed or supported
  clients (see support-evidence-register.json).
- Deployed supported client versions / legacy allowlist / upgrade cutoff: **OPEN_INPUT** (no external
  evidence in this window).
- Dynamic per-field/stale/interleaving runs: NOT_RUN.
- Working-tree DIFF files (sync.ts, engine.ts, sync.js, tasks.js, reports.js, reportCommands.ts) must be
  reconciled to frozen HEAD before any gate change.
