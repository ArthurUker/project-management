# Handoff — 小型封存 Overlay（SC-01～04）

## 本目录交付
`seal-overlay-2026-10-05-02/`：authorization.json、change-summary.md、evidence/（reference-overlay.json、readiness-normalization.json、input-binding.json、start-snapshots/）、acceptance.json、rollback.md、task-state.json、handoff.md、REVIEW_ENTRY.md、resume.md，以及 `payload-manifest.json`、`final-integrity.json`、`post-seal-readback.json`。

## 接手方须知
1. 旧 K 的 `payload-manifest.json` 对 `evidence/seal-scope.json` 仍记录 `ac5ad…`（实际 `dfb461bc…`），故旧 K 封存仍为 FAIL；本 overlay 另发准确替代，不将旧 K 改判 PASS。
2. 13 个替代绑定已逐项列于 `canonical-reference-index.json` 与 `evidence/reference-overlay.json`，原声明 FAIL 保留、新目标 MATCH。
3. 两份 history 各多一条：`REVISION_HISTORY.json` 增加 `version=parallel-lr7-2026-10-05-seal-overlay-02`，`EXECUTION_REVISION_HISTORY.json` 增加 `id=EXEC-parallel-lr7-2026-10-05-seal-overlay-02`，均 `correctsRef` 精确指向原 `versions[27]` / `entries[18]`。
4. 业务修复（T-RP-02/03/04/09/12 等）、原 36 项任务与 31 历史开放项不在本 overlay 范围，仍待具名批准。
5. 验证口径：所有有效 ref 以 `pathBase=REPOSITORY` + 磁盘真实相对路径 + 磁盘 SHA256 为准；不手拼缺前缀路径、不手抄 hash。
