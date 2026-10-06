# Window B (LR7-02) — Path-Contract Correction: Change Summary

**Scope:** Frozen LR6 delivery path-contract correction only. No batch final seal, no root-history append, no business change.

## The contract defect (frozen, not modified)
Every PLAN-relative session key in the LR6 delivery was frozen with `pathBase: "SESSION"`.

- `pathBases.SESSION` = `…/execution/supplements/lr6-closeout-2026-10-04-cb1`
- A SESSION-relative path must therefore be `evidence/payload-manifest.json`, `CLOSE-01/acceptance.json`, etc.
- But the frozen keys are written as `execution/supplements/lr6-closeout-2026-10-04-cb1/CLOSE-01/acceptance.json` — i.e. **already PLAN-relative**.

Under the strict contract (`base/relativePath`, no prefix guess, no fallback), `resolve("SESSION", key)` appends the PLAN-relative key beneath the SESSION root and yields a non-existent path. The independent review already recorded this as 519 `declaredPathBaseFailures` (`R/evidence/seal-readback.json`).

## The correction
Re-declare the base as `PLAN` and leave the relative path unchanged (it is already PLAN-relative). This is the non-destructive, canonical fix. No file content is copied or rewritten — only the path-base contract is corrected.

## What was produced in `window-b-paths/`
- `strict-path-resolver.py` — strict resolver: known bases only, boundary check, existence + SHA-256 verify. Unknown base / traversal / missing file / wrong hash all rejected.
- `build-corrections.py` — reads frozen sources (read-only), emits the artifacts below.
- `evidence/corrections-map.json` — explicit correction mapping per group, referencing old entry index / unique id / canonical hash.
- `evidence/corrected-frozen-payload.json` — corrected 519 session-file records (reference only).
- `evidence/per-file-readback.json` — strict resolve + SHA-256 for all 519 referenced session files and 4 repository references.
- `evidence/synthetic-control.json` — strict-resolver control verdicts (LOCAL_SYNTHETIC_FILE_CONTROL).
- `historical-record-snapshots/` — byte snapshots of the 4 non-history records at batch start, verified against the old seal hash, level `START_OF_THIS_BATCH_SNAPSHOT_MATCHING_OLD_SEAL`.

## Corrected counts
| Group | Corrected |
|---|---|
| payload-manifest sessionFiles | 519 / 519 |
| payload-manifest runner | 1 |
| payload-manifest controls | 1 |
| payload-manifest logs.keyLogs | PLAN-relative refs normalized |
| final-integrity sealedPayloadManifest | 1 |
| seal-readback declaredResolverFailures | 519 / 519 |
| REVISION_HISTORY entry[25].sealedArtifactHashes | 5 |
| EXECUTION_REVISION_HISTORY entry[16].sha256 | 5 |

## Verification layers (not business acceptance)
- 519 old session files: strict-resolved under PLAN, exist, SHA-256 matches declared → PASS.
- 4 repository references: strict-resolved under REPOSITORY, exist, SHA-256 matches → PASS.
- 4 non-history records: snapshot SHA-256 matches old seal → PASS (`START_OF_THIS_BATCH_SNAPSHOT_MATCHING_OLD_SEAL`).
- Synthetic control: legal pass; error base / missing file / wrong hash / traversal / old mislabel all rejected → PASS.

These are file/metadata verifications. No DB, build, JWT, IDB, browser or UI layer was exercised. `independentReview=PENDING`, `release=NOT_EVALUATED`.
