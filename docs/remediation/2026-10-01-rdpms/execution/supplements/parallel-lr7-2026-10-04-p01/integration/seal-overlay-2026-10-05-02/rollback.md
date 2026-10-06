# 撤回与替代说明（仅追加撤回/替代，保留所有原字节）

本 overlay 的撤回说明**仅追加**，不删除任何已引用目录、不移除任何 history 条目、不回滚业务数据。

- **保留原密封**：旧 K（`seal-correction-2026-10-05-01/`）全部 23 文件字节保持；原 J、A～F、两 state、两 handoff、计划/决定/审计/记忆均不变。
- **替代而非覆盖**：本 overlay 通过 `evidence/reference-overlay.json` 的 13 个准确替代目标发布修正后的有效 ref；原错误声明保留在 `input-binding.json` 的 `historicalDiagnostics` 中记为 FAIL，不作新有效引用解析。
- **撤回方式**：若需撤销本 overlay，仅移除本目录 M 与两份 history 各自新增的一条 entry（reverse of append-only），不触碰旧 K 或其他冻结输入。
- **禁止项**：不得删除 `readiness-resume-01/`(J) 目录、不得移除六根或两 history 的既有条目、不得对业务数据做回滚、不得为“通过”而再改已封存字节。
