"""LR7-02 window-B builder: strict path-contract correction + per-file readback.

Reads ONLY frozen sources (O = lr6-closeout session, R = lr6 independent review,
and the two root history registries for reference). Writes ONLY into this
window-b-paths/ partition. Never modifies any frozen file, shared ledger, or
business code.

Outputs:
  - corrections-map.json          : explicit correction mapping per group
  - corrected-frozen-payload.json : corrected 519 session-file records (PLAN base)
  - evidence/per-file-readback.json : strict resolve+sha for 519 session + 4 repo files
  - historical-record-snapshots/   : 4 non-history record byte snapshots + verification
  - evidence/synthetic-control.json : strict-resolver control verdicts
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import shutil

# Inlined strict resolver (mirrors strict-path-resolver.py so the builder is self-contained).
REPOSITORY = "/Users/renkang/VS Code/project-management"
PLAN = pathlib.Path("/Users/renkang/VS Code/project-management/docs/remediation/2026-10-01-rdpms")
SESSION = (str(PLAN) + "/execution/supplements/lr6-closeout-2026-10-04-cb1")
KNOWN_BASES = {"REPOSITORY": REPOSITORY, "PLAN": PLAN, "SESSION": SESSION}
SESSION_REL = "execution/supplements/lr6-closeout-2026-10-04-cb1"


class PathBaseError(ValueError):
    pass


class BoundaryEscapeError(ValueError):
    pass


class FileNotFoundUnderBaseError(FileNotFoundError):
    pass


class HashMismatchError(ValueError):
    pass


def sha256_of(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def strict_resolve(path_base: str, relative_path: str) -> pathlib.Path:
    if path_base not in KNOWN_BASES:
        raise PathBaseError(f"unknown pathBase {path_base!r}; no guess/fallback")
    base = pathlib.Path(KNOWN_BASES[path_base])
    rel = pathlib.PurePosixPath(relative_path)
    if rel.is_absolute():
        raise PathBaseError("relative_path must be relative")
    if ".." in rel.parts:
        raise BoundaryEscapeError("parent traversal in relative_path")
    resolved = (base / rel).resolve()
    base_resolved = base.resolve()
    if resolved != base_resolved and base_resolved not in resolved.parents:
        raise BoundaryEscapeError(f"escapes base: {resolved}")
    if not resolved.exists() or not resolved.is_file():
        raise FileNotFoundUnderBaseError(f"missing: {resolved}")
    return resolved


def strict_resolve_and_verify(path_base: str, relative_path: str, expected_sha256: str) -> dict:
    resolved = strict_resolve(path_base, relative_path)
    actual = sha256_of(resolved)
    if actual != expected_sha256:
        raise HashMismatchError(f"sha mismatch {path_base}:{relative_path}")
    return {"pathBase": path_base, "relativePath": relative_path, "resolvedPath": str(resolved),
            "sha256": actual, "verified": True}


def is_mislabeled_session_key(relative_path: str, declared_base: str) -> bool:
    return declared_base == "SESSION" and relative_path.startswith(SESSION_REL + "/")


OUT = pathlib.Path(__file__).resolve().parent
EVID = OUT / "evidence"
SNAP = OUT / "historical-record-snapshots"
EVID.mkdir(exist_ok=True)
SNAP.mkdir(exist_ok=True)

O_MANIFEST = PLAN / f"{SESSION_REL}/evidence/payload-manifest.json"
O_INTEGRITY = PLAN / f"{SESSION_REL}/final-integrity.json"
R_SEALREADBACK = PLAN / "execution/reviews/2026-10-04-codebuddy-lr6-closeout/evidence/seal-readback.json"
REV_HISTORY = PLAN / "REVISION_HISTORY.json"
EXEC_HISTORY = PLAN / "EXECUTION_REVISION_HISTORY.json"

manifest = json.loads(O_MANIFEST.read_text())
integrity = json.loads(O_INTEGRITY.read_text())
seal_readback = json.loads(R_SEALREADBACK.read_text())
rev_history = json.loads(REV_HISTORY.read_text())
exec_history = json.loads(EXEC_HISTORY.read_text())

CORRECTED_BASE = "PLAN"


def corrected_ref(key: str, sha: str) -> dict:
    """A mislabeled (SESSION, PLAN-relative key) becomes (PLAN, same key)."""
    return {"pathBase": CORRECTED_BASE, "relativePath": key, "sha256": sha}


# ---------------------------------------------------------------------------
# 1. payload-manifest sessionFiles (519) + runner/controls/logs
# ---------------------------------------------------------------------------
session_corrections = {}
readback_session = {"count": 0, "allPass": True, "failures": []}
for key, meta in manifest["sessionFiles"].items():
    if not is_mislabeled_session_key(key, meta["pathBase"]):
        # Every sessionFile key in the frozen delivery is mislabeled; record any clean one too.
        session_corrections[key] = {"sourcePathBase": meta["pathBase"], "corrected": None,
                                    "note": "already consistent"}
        continue
    ref = corrected_ref(key, meta["sha256"])
    ev = strict_resolve_and_verify(ref["pathBase"], ref["relativePath"], ref["sha256"])
    session_corrections[key] = {"sourcePathBase": meta["pathBase"], "corrected": ref, "readback": ev}
    readback_session["count"] += 1
    if not ev["verified"]:
        readback_session["allPass"] = False
        readback_session["failures"].append(key)

# runner / controls (path field)
def correct_path_field(obj):
    key = obj["path"]
    base = obj["pathBase"]
    if is_mislabeled_session_key(key, base):
        ref = corrected_ref(key, obj["sha256"])
        ev = strict_resolve_and_verify(ref["pathBase"], ref["relativePath"], ref["sha256"])
        return {"source": obj, "corrected": ref, "readback": ev}
    return {"source": obj, "corrected": None, "note": "consistent"}

runner_corr = correct_path_field(manifest["runner"])
controls_corr = correct_path_field(manifest["controls"])

# logs.paths + logs.keyLogs : session-relative references mislabeled as SESSION too
logs_keys = set(manifest["logs"]["paths"])
logs_keylogs = manifest["logs"]["keyLogs"]
keylogs_corrections = {}
for label, val in logs_keylogs.items():
    # keylogs values may be a string or a list of strings (all PLAN-relative session refs)
    items = val if isinstance(val, list) else [val]
    corrected_items = []
    for key in items:
        if isinstance(key, str) and key.startswith(SESSION_REL + "/"):
            exists = strict_resolve("PLAN", key).exists()
            corrected_items.append({"source": key, "sourcePathBase": "SESSION(implicit)",
                                    "correctedPathBase": CORRECTED_BASE, "relativePath": key,
                                    "resolvesUnderPLAN": exists})
        else:
            corrected_items.append({"source": key, "note": "consistent"})
    keylogs_corrections[label] = corrected_items if isinstance(val, list) else corrected_items[0]

# ---------------------------------------------------------------------------
# 2. final-integrity.json sealedPayloadManifest
# ---------------------------------------------------------------------------
spm = integrity["sealedPayloadManifest"]
final_integrity_corr = correct_path_field(spm)

# ---------------------------------------------------------------------------
# 3. seal-readback.json (R/evidence): declaredResolverFailures (519 SESSION-mislabeled)
#    This frozen review readback documents the bug as 519 failures (pathBase SESSION,
#    PLAN-relative key, exists:false). Correction re-declares PLAN; resolve+exist verified.
# ---------------------------------------------------------------------------
seal_session_corrections = {}
seal_readback_session = {"count": 0, "allPass": True, "failures": []}
for item in seal_readback.get("declaredResolverFailures", []):
    key = item["path"]
    base = item.get("pathBase")
    if not is_mislabeled_session_key(key, base):
        seal_session_corrections[key] = {"sourcePathBase": base, "corrected": None}
        continue
    ref = corrected_ref(key, None)
    try:
        resolved = strict_resolve("PLAN", key)
        resolves = True
    except Exception:  # noqa: BLE001
        resolves = False
    seal_session_corrections[key] = {"sourcePathBase": base, "resolvedPathOld": item.get("resolvedPath"),
                                      "oldExists": item.get("exists"), "corrected": ref,
                                      "resolvesUnderPLAN": resolves}
    seal_readback_session["count"] += 1
    if not resolves:
        seal_readback_session["allPass"] = False
        seal_readback_session["failures"].append(key)

# ---------------------------------------------------------------------------
# 4. two old history entries (REVISION_HISTORY[25], EXECUTION_REVISION_HISTORY[16])
# ---------------------------------------------------------------------------
rev_entry = rev_history["versions"][25]
exec_entry = exec_history["entries"][16]
rev_corr_entries = []
for k, m in rev_entry.get("sealedArtifactHashes", {}).items():
    if is_mislabeled_session_key(k, m["pathBase"]):
        ref = corrected_ref(k, m["sha256"])
        ev = strict_resolve_and_verify(ref["pathBase"], ref["relativePath"], ref["sha256"])
        rev_corr_entries.append({"sourceKey": k, "sourcePathBase": m["pathBase"], "corrected": ref, "readback": ev})
exec_corr_entries = []
for k, m in exec_entry.get("sha256", {}).items():
    if is_mislabeled_session_key(k, m["pathBase"]):
        ref = corrected_ref(k, m["sha256"])
        ev = strict_resolve_and_verify(ref["pathBase"], ref["relativePath"], ref["sha256"])
        exec_corr_entries.append({"sourceKey": k, "sourcePathBase": m["pathBase"], "corrected": ref, "readback": ev})

# ---------------------------------------------------------------------------
# 5. four repository references (per-file readback)
# ---------------------------------------------------------------------------
repo_readback = {"count": 0, "allPass": True, "failures": []}
for key, meta in manifest["repositoryFiles"].items():
    ev = strict_resolve_and_verify(meta["pathBase"], key, meta["sha256"])
    repo_readback.setdefault("entries", {})[key] = ev
    repo_readback["count"] += 1
    if not ev["verified"]:
        repo_readback["allPass"] = False
        repo_readback["failures"].append(key)

# ---------------------------------------------------------------------------
# 6. historical-record-snapshots : 4 non-history records (controlled/changing)
# ---------------------------------------------------------------------------
record_snapshots = {}
four_records = manifest["fourNonHistoryRecords"]
for name, meta in four_records.items():
    src = PLAN / name
    dst = SNAP / name.replace("/", "__")
    shutil.copyfile(src, dst)
    actual = sha256_of(dst)
    matches_old_seal = (actual == meta["sha256"])
    record_snapshots[name] = {
        "level": "START_OF_THIS_BATCH_SNAPSHOT_MATCHING_OLD_SEAL",
        "oldSealSha256": meta["sha256"],
        "snapshotSha256": actual,
        "matchesOldSeal": matches_old_seal,
        "declaredPathBase": meta["pathBase"],
        "snapshotPath": dst.name,
        "note": "byte snapshot at batch start; NOT the post-batch final seal (re-sealed by integrator)",
    }

# ---------------------------------------------------------------------------
# 7. synthetic control : strict resolver must reject bad inputs, accept good ones
# ---------------------------------------------------------------------------
ctrl = {"layer": "LOCAL_SYNTHETIC_FILE_CONTROL", "cases": []}


def ctrl_case(name, fn):
    try:
        fn()
        ctrl["cases"].append({"name": name, "result": "UNEXPECTED_PASS", "passed": False})
    except Exception as exc:  # noqa: BLE001
        ctrl["cases"].append({"name": name, "result": type(exc).__name__, "passed": True})


# legal base/path/hash passes
good_key = f"{SESSION_REL}/CLOSE-01/acceptance.json"
good_sha = sha256_of(strict_resolve("PLAN", good_key))
try:
    strict_resolve_and_verify("PLAN", good_key, good_sha)
    ctrl["cases"].append({"name": "legal_base_path_hash_pass", "result": "PASS", "passed": True})
except Exception as exc:  # noqa: BLE001
    ctrl["cases"].append({"name": "legal_base_path_hash_pass", "result": type(exc).__name__, "passed": False})

ctrl_case("error_base_rejected", lambda: strict_resolve("BOGUS", good_key))
ctrl_case("missing_file_rejected",
          lambda: strict_resolve("PLAN", f"{SESSION_REL}/does-not-exist-xyz.json"))
ctrl_case("wrong_hash_rejected",
          lambda: strict_resolve_and_verify("PLAN", good_key, "0" * 64))
ctrl_case("traversal_rejected", lambda: strict_resolve("PLAN", "../../../etc/passwd"))
ctrl_case("old_mislabel_rejected", lambda: strict_resolve("SESSION", good_key))
ctrl["verdict"] = "PASS" if all(c["passed"] for c in ctrl["cases"]) else "FAIL"

# ---------------------------------------------------------------------------
# write artifacts
# ---------------------------------------------------------------------------
corrections_map = {
    "kind": "LR7-02_PATH_CONTRACT_CORRECTIONS",
    "windowId": "B",
    "workId": "LR7-02",
    "batchId": "parallel-lr7-2026-10-04-p01",
    "rule": ("Every PLAN-relative key was frozen with pathBase 'SESSION'. Under the strict contract "
             "that pair resolves outside the session root and fails. Correction: re-declare the base "
             "as 'PLAN'; the relative path is left unchanged because it is already PLAN-relative."),
    "correctedPathBase": CORRECTED_BASE,
    "oldEntryReferences": {
        "REVISION_HISTORY.json": {"array": "versions", "zeroBasedIndex": 25,
                                  "id": rev_entry.get("version"),
                                  "canonicalEntrySha256": "7c7c0d4401e30d833b35e02e46a104a5d56febf544d12029cce400667f0e9a82"},
        "EXECUTION_REVISION_HISTORY.json": {"array": "entries", "zeroBasedIndex": 16,
                                            "id": exec_entry.get("id"),
                                            "canonicalEntrySha256": "622704d8de8d0cbf00f1548e10b53ce2932d2965c22040f33ca80c86ed3c7a64"},
    },
    "groups": {
        "payloadManifest.sessionFiles": {
            "sourceFile": f"{SESSION_REL}/evidence/payload-manifest.json",
            "count": len(session_corrections),
            "correctedCount": sum(1 for v in session_corrections.values() if v.get("corrected")),
            "entries": session_corrections,
        },
        "payloadManifest.runner": {"sourceFile": f"{SESSION_REL}/evidence/payload-manifest.json",
                                   "correction": runner_corr},
        "payloadManifest.controls": {"sourceFile": f"{SESSION_REL}/evidence/payload-manifest.json",
                                    "correction": controls_corr},
        "payloadManifest.logs.keyLogs": {"sourceFile": f"{SESSION_REL}/evidence/payload-manifest.json",
                                         "corrections": keylogs_corrections},
        "finalIntegrity.sealedPayloadManifest": {"sourceFile": f"{SESSION_REL}/final-integrity.json",
                                                 "correction": final_integrity_corr},
        "sealReadback.sessionFiles": {
            "sourceFile": "execution/reviews/2026-10-04-codebuddy-lr6-closeout/evidence/seal-readback.json",
            "count": len(seal_session_corrections),
            "correctedCount": sum(1 for v in seal_session_corrections.values() if v.get("corrected")),
            "note": "identical 519 PLAN-relative keys; correctness inherited from payloadManifest readback",
            "entries": seal_session_corrections,
        },
        "revisionHistory.entry25.sealedArtifactHashes": rev_corr_entries,
        "executionRevisionHistory.entry16.sha256": exec_corr_entries,
    },
    "fourRepositoryReferences": repo_readback,
    "historicalRecordSnapshots": record_snapshots,
    "syntheticControl": ctrl,
    "independentReview": "PENDING",
    "release": "NOT_EVALUATED",
}
(EVID / "corrections-map.json").write_text(json.dumps(corrections_map, ensure_ascii=False, indent=2) + "\n")

# corrected frozen payload (519 session records under PLAN base; reference only)
corrected_payload = {
    "kind": "CORRECTED_FROZEN_PAYLOAD",
    "note": "reference-only corrected replica of the 519 sealed session files; no file content copied",
    "sessionId": manifest["sessionId"],
    "correctedPathBase": CORRECTED_BASE,
    "sessionFiles": {
        key: {"pathBase": CORRECTED_BASE, "relativePath": key, "sha256": meta["sha256"]}
        for key, meta in manifest["sessionFiles"].items()
    },
    "counts": {"sessionFiles": len(manifest["sessionFiles"])},
}
(EVID / "corrected-frozen-payload.json").write_text(json.dumps(corrected_payload, ensure_ascii=False, indent=2) + "\n")

# per-file readback evidence
per_file = {
    "kind": "PER_FILE_READBACK",
    "layer": "REAL_FILE_READBACK",
    "sessionFiles": readback_session,
    "sealReadbackSessionFiles": seal_readback_session,
    "repositoryFiles": repo_readback,
    "fourNonHistoryRecords": record_snapshots,
    "verdict": "PASS" if (readback_session["allPass"] and seal_readback_session["allPass"]
                          and repo_readback["allPass"]
                          and all(v["matchesOldSeal"] for v in record_snapshots.values())) else "FAIL",
}
(EVID / "per-file-readback.json").write_text(json.dumps(per_file, ensure_ascii=False, indent=2) + "\n")
(SNAP / "verification.json").write_text(json.dumps(record_snapshots, ensure_ascii=False, indent=2) + "\n")
(EVID / "synthetic-control.json").write_text(json.dumps(ctrl, ensure_ascii=False, indent=2) + "\n")

print("session corrections:", corrections_map["groups"]["payloadManifest.sessionFiles"]["correctedCount"])
print("seal-readback corrections:", corrections_map["groups"]["sealReadback.sessionFiles"]["correctedCount"])
print("readback session allPass:", readback_session["allPass"], "count:", readback_session["count"])
print("repo readback allPass:", repo_readback["allPass"])
print("record snapshots match old seal:", all(v["matchesOldSeal"] for v in record_snapshots.values()))
print("synthetic control verdict:", ctrl["verdict"])
print("per-file verdict:", per_file["verdict"])
