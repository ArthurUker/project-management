# 回滚说明 — readiness-resume-01 汇总交付

本汇总的写入均为**追加**或**新增 J 目录**，未修改任何受保护文件、worker 文件、旧 READY/manifest/日志、Q 指令目录或旧 `WAITING_FOR_WORKERS.md`。因此回滚是减法的：

1. **删除本汇总新增目录**：`execution/supplements/parallel-lr7-2026-10-04-p01/integration/readiness-resume-01/`（含全部 J 交付、payload-manifest、final-integrity、post-seal-readback）。
2. **撤销六根记录追加**（均为本次新增，不影响原内容）：
   - `IMPLEMENTATION_STATE.json`：`supplementalExecutions.continuations[]` 末尾新增的 `parallel-lr7-2026-10-04-p01-integration` 条目。
   - `execution/state.json`：`supplementalExecution.continuations[]` 末尾同 ID 条目。
   - `HANDOFF.md`：末尾新增的汇总章节。
   - `execution/handoff.md`：末尾新增的汇总章节。
   - `REVISION_HISTORY.json`：`versions[]` 末尾新增的 `parallel-lr7-2026-10-04-p01-integration` 订正 entry。
   - `EXECUTION_REVISION_HISTORY.json`：`entries[]` 末尾新增的 `EXEC-parallel-lr7-2026-10-04-p01-integration` 订正 entry。
3. **保留**：旧 `WAITING_FOR_WORKERS.md`、所有 worker 交付、A 新补正、B～F 原交付、原六根记录其它字段/旧 continuation/旧 history entry 均不动。

> 进入汇总证据后的封存目录**不得用删除作为回滚**（见 amendment-review-01/REVIEW.md）。如需撤回，应追加撤回/替代记录并保留原字节；上述“删除 J 目录”仅针对本汇总新产物，且前提是这些尚未被后续执行引用。
