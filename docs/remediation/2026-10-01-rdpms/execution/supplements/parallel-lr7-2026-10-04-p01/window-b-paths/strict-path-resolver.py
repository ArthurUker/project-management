"""Strict path resolver for LR7-02 path-contract correction (window B).

Contract (from COMMON_RULES.md §5 and BATCH_MANIFEST pathBases):

    REPOSITORY : /Users/renkang/VS Code/project-management
    PLAN       : /Users/renkang/VS Code/project-management/docs/remediation/2026-10-01-rdpms
    SESSION    : PLAN/execution/supplements/lr6-closeout-2026-10-04-cb1

A relative path is RELATIVE TO the declared pathBase. There is NO prefix
guessing and NO silent fallback: the only valid interpretation of a
(pathBase, relativePath) pair is base/relativePath. Any other behaviour
(including re-deriving a base from the path string) is forbidden.

The frozen LR6 delivery mislabeled every PLAN-relative session key with
pathBase "SESSION". Under the strict contract, resolve("SESSION", key) would
append the already-PLAN-relative key beneath the SESSION root, escaping into a
nonexistent path — i.e. the old manifest fails the strict resolver, which is
exactly the contract violation this window corrects (by re-declaring the base
as PLAN, leaving the key unchanged because it already is PLAN-relative).
"""
from __future__ import annotations

import hashlib
import pathlib

REPOSITORY = "/Users/renkang/VS Code/project-management"
PLAN = "/Users/renkang/VS Code/project-management/docs/remediation/2026-10-01-rdpms"
SESSION = (
    "/Users/renkang/VS Code/project-management/docs/remediation/2026-10-01-rdpms"
    "/execution/supplements/lr6-closeout-2026-10-04-cb1"
)

KNOWN_BASES = {
    "REPOSITORY": REPOSITORY,
    "PLAN": PLAN,
    "SESSION": SESSION,
}

# PLAN-relative prefix carried by every mislabeled key in the frozen delivery.
SESSION_REL = "execution/supplements/lr6-closeout-2026-10-04-cb1"


class PathBaseError(ValueError):
    """Unknown pathBase — no guess or fallback is permitted."""


class BoundaryEscapeError(ValueError):
    """Resolved path leaves the declared base directory."""


class FileNotFoundUnderBaseError(FileNotFoundError):
    """File does not exist at the strictly resolved location."""


class HashMismatchError(ValueError):
    """Computed SHA-256 differs from the declared SHA-256."""


def sha256_of(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def strict_resolve(path_base: str, relative_path: str) -> pathlib.Path:
    """Resolve (path_base, relative_path) strictly.

    Returns an existing absolute path. Raises on unknown base, traversal
    outside the base, or a missing file. Does NOT guess or fallback.
    """
    if path_base not in KNOWN_BASES:
        raise PathBaseError(
            f"unknown pathBase {path_base!r}; allowed={sorted(KNOWN_BASES)}; no guess/fallback"
        )
    base = pathlib.Path(KNOWN_BASES[path_base])
    rel = pathlib.PurePosixPath(relative_path)
    if rel.is_absolute():
        raise PathBaseError(f"relative_path must be relative, got absolute: {relative_path!r}")
    if ".." in rel.parts:
        # caught again by boundary check, but fail fast with a clear reason
        raise BoundaryEscapeError(f"relative_path contains parent traversal: {relative_path!r}")
    resolved = (base / rel).resolve()
    base_resolved = base.resolve()
    if resolved != base_resolved and base_resolved not in resolved.parents:
        raise BoundaryEscapeError(
            f"resolved path escapes base: {resolved} not under {base_resolved}"
        )
    if not resolved.exists():
        raise FileNotFoundUnderBaseError(f"file does not exist: {resolved}")
    if not resolved.is_file():
        raise FileNotFoundUnderBaseError(f"not a regular file: {resolved}")
    return resolved


def strict_resolve_and_verify(path_base: str, relative_path: str, expected_sha256: str) -> dict:
    """Strictly resolve, then verify existence + SHA-256.

    Returns a compact evidence dict; raises on any failure.
    """
    resolved = strict_resolve(path_base, relative_path)
    actual = sha256_of(resolved)
    if actual != expected_sha256:
        raise HashMismatchError(
            f"sha256 mismatch for {path_base}:{relative_path}: "
            f"expected {expected_sha256}, got {actual}"
        )
    return {
        "pathBase": path_base,
        "relativePath": relative_path,
        "resolvedPath": str(resolved),
        "sha256": actual,
        "verified": True,
    }


def is_mislabeled_session_key(relative_path: str, declared_base: str) -> bool:
    """True when a PLAN-relative key is declared with the SESSION base.

    The frozen delivery only ever committed this specific error: a key that
    already starts with SESSION_REL (i.e. it is PLAN-relative) tagged SESSION.
    """
    return declared_base == "SESSION" and relative_path.startswith(SESSION_REL + "/")


if __name__ == "__main__":
    # smoke self-check: the canonical correction resolves cleanly
    key = f"{SESSION_REL}/CLOSE-01/acceptance.json"
    ev = strict_resolve_and_verify("PLAN", key, sha256_of(strict_resolve("PLAN", key)))
    print("self-check PLAN resolve ok:", ev["resolvedPath"])
    # the original (mislabeled) pair must fail: file does not exist under SESSION
    try:
        strict_resolve("SESSION", key)
        print("UNEXPECTED: SESSION resolution succeeded")
    except FileNotFoundUnderBaseError:
        print("self-check SESSION mislabel correctly rejected (file missing)")
    # unknown base rejected
    try:
        strict_resolve("BOGUS", key)
        print("UNEXPECTED: unknown base accepted")
    except PathBaseError:
        print("self-check unknown base correctly rejected")
