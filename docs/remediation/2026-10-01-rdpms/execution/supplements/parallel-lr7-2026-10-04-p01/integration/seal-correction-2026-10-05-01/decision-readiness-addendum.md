# 决策就绪补遗 — T-RP-02 回执方案批准前澄清（AG-05，仅记录待负责人澄清）

- **关联**：C 窗口 `window-c-receipts/decision-draft.md` 与 `failure-point-matrix.csv` 的 T-RP-02 回执方案。
- **复核裁定**：REVIEW.md `AG-05` 指出方案“任意 500 整体回滚”表述**未满足** `RP00-T02` 与 `FP-06/07/08` 的恢复边界要求。
- **本补遗仅记录待负责人澄清项；不修改 C 草案、不选择 HTTP 状态政策、不批准任何值、不触发任何受门禁约束的业务实施任务。**

## 待负责人澄清项（记录，不代答）
1. **提交前失败（submit-before）恢复边界**：在业务事务提交前失败且无持久化回执时，哪一状态算“安全可整体回滚”，与 `RP00-T02` 的本地事务边界如何对齐。
2. **提交后失败（submit-after）恢复边界**：事务已提交、回执/审计落库失败时的补偿语义，是否进入 dead-letter/unknown 路径，避免与 `FP-06`（已提交不可隐式丢弃）冲突。
3. **批次已提交项（batch-already-committed）边界**：当批次中部分 mutation 已提交、回执生成失败，禁止把已提交项“整批撤销”；需明确 `FP-07/FP-08` 下的部分可见性与客户端重放保护。
4. **unknown 原 key/hash 恢复边界**：`FP-08` 要求未知原 key/hash 不得被回放覆盖；方案须显式说明“任意 500”不会在 unknown 情况下触发覆盖式回滚。

## 关联约束（不得因本补遗自动批准）
- `RP00-T02`：本地原子提交边界。
- `FP-06`：已提交项不隐式丢弃。
- `FP-07`：部分失败可见性。
- `FP-08`：unknown 原 key/hash 不被回放覆盖。
- 上述约束与 T-RP-09（D 认证 transport）、T-RP-12（F 用户可恢复流程/保留）在“回执保留窗 vs 缓存 TTL”“unknown/expired 恢复”上相交，须在 `CROSS_WINDOW_CONFLICTS.md` 裁定后一并批准。

## 状态
- C 方案保持 `PROPOSED`；`approvedBy/approvedAt/evidenceRef=null`。
- 本补遗 `independentReview=PENDING`、`release=NOT_EVALUATED`；仅为批准前澄清记录，不构成任何决策或实现授权。
