# Rollback

**Risk:** This window is metadata-only and writes exclusively under
`window-b-paths/`. It does not modify any frozen file, shared ledger, root
history, business source, or other window's directory.

**Rollback procedure (if required):**
1. Remove the partition directory:
   `docs/remediation/2026-10-01-rdpms/execution/supplements/parallel-lr7-2026-10-04-p01/window-b-paths/`
   (and only this directory).
2. No other file in the repository is affected; nothing else needs reverting.
3. If a correction needs revision, start a new attempt/run with a new artifact set; do **not** silently mutate already-frozen bytes of this window.

**No shared-state rollback needed** because no shared state was written.
