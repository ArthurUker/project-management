# Handoff — Window B (LR7-02)

**What this window delivers:** a strict path resolver and a path-contract correction
mapping for the frozen LR6 delivery, with per-file readback evidence and byte snapshots
of the four non-history records at batch start.

**Key correction rule:** every PLAN-relative session key frozen as `pathBase: "SESSION"`
is re-declared `PLAN` (the key is left unchanged because it is already PLAN-relative).
No frozen file is copied or rewritten; no 519 files are duplicated.

**Artifacts (all under `window-b-paths/`):**
- `evidence/corrections-map.json` — explicit mapping per group, referencing old entry
  index / unique id / canonical hash.
- `evidence/corrected-frozen-payload.json` — corrected 519 session-file records.
- `evidence/per-file-readback.json` — strict resolve + SHA-256 evidence.
- `evidence/synthetic-control.json` — strict-resolver control verdicts.
- `historical-record-snapshots/` — 4 non-history records, level
  `START_OF_THIS_BATCH_SNAPSHOT_MATCHING_OLD_SEAL`.

**For the integrator / summarizer:**
- This window only seals its own partition. It does **not** build the batch total
  manifest, does **not** append any root-history entry, and does **not** update shared
  state/handoff/history.
- The four non-history records are *changing* records: their post-batch final hashes
  are re-sealed by the unique integrator, not claimed here.
- Reuse the canonical entry hashes from BATCH_MANIFEST:
  `REVISION_HISTORY.json[25]` = `7c7c0d4401e30d833b35e02e46a104a5d56febf544d12029cce400667f0e9a82`,
  `EXECUTION_REVISION_HISTORY.json[16]` = `622704d8de8d0cbf00f1548e10b53ce2932d2965c22040f33ca80c86ed3c7a64`.

**Status:** `writerStopped=true`. No further writes to this partition will be made by this window.
