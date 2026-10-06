"""Generate WORKER_MANIFEST.json for window B.

Lists every file under this window-b-paths partition with SHA-256 and pathBase
REPOSITORY (real repo-relative path). Excludes itself and READY.json (written
afterwards). This manifest seals ONLY this window; it does not include any other
window, the batch total manifest, or a root-history final summary.
"""
from __future__ import annotations

import hashlib
import json
import pathlib

REPO = pathlib.Path("/Users/renkang/VS Code/project-management")
OUT = pathlib.Path(__file__).resolve().parent
PREFIX = "docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/window-b-paths"

EXCLUDE = {"WORKER_MANIFEST.json", "READY.json", "make-worker-manifest.py"}

files = {}
for p in sorted(OUT.rglob("*")):
    if not p.is_file():
        continue
    rel = p.relative_to(REPO).as_posix()
    if p.name in EXCLUDE:
        continue
    files[rel] = {"pathBase": "REPOSITORY", "relativePath": rel,
                  "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}

manifest = {
    "kind": "WORKER_MANIFEST",
    "windowId": "B",
    "workId": "LR7-02",
    "batchId": "parallel-lr7-2026-10-04-p01",
    "pathBase": "REPOSITORY",
    "ownWritePrefix": PREFIX + "/",
    "sealsOnly": "this window partition; excludes other windows, batch total manifest, and root-history final summary",
    "excludedFiles": {
        "WORKER_MANIFEST.json": "self",
        "READY.json": "written after this manifest; excluded by protocol",
    },
    "fileCount": len(files),
    "files": files,
}
out_path = OUT / "WORKER_MANIFEST.json"
out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print("worker manifest files:", len(files))
print("worker manifest sha256:", hashlib.sha256(out_path.read_bytes()).hexdigest())
