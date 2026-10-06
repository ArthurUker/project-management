# 小型封存 Overlay 变更摘要 — SC-01～04

- **目录**：`execution/supplements/parallel-lr7-2026-10-04-p01/integration/seal-overlay-2026-10-05-02/`
- **依据**：`docs/remediation/2026-10-05-seal-correction-review/NEXT_EXECUTION_PROMPT.md` 与 `canonical-reference-index.json`（13 个已确认替代目标）。
- **不重开** A～F，不实施业务修复，不重跑控制/构建/测试/数据库，不修改旧 K、原 J、两 state/两 handoff、计划/决定/审计/记忆。
- **唯一写入**：本目录 M 新建文件；仅向 `REVISION_HISTORY.json` 与 `EXECUTION_REVISION_HISTORY.json` 各追加一个唯一订正 entry。

## 逐项处置（SC-01～04）
- **SC-01（seal-scope 哈希不一致）**：旧 K `payload-manifest.json` 把 `evidence/seal-scope.json` 记录为 `ac5ad…`，实际当前字节为 `dfb461bc…`。Overlay 的 `input-binding.json` 绑定真实当前字节；本 overlay 的 `payload-manifest.json` 在所有静态文件定稿后生成，确保零哈希失配。**旧 K 原结果继续明确为失败。**
- **SC-02（六个引用路径不可解析）**：`final-integrity.json`、`post-seal-readback.json` 两条声明 `n/supplements/…/payload-manifest.json`；两份新 history 共四条声明 `execution/supplements/…`（缺 `docs/remediation/2026-10-01-rdpms/` 前缀）。Overlay 全部改用标准库 `actualPath.resolve().relative_to(ROOT)` + 磁盘 SHA256 构造的真实完整 ref；原错误声明保留在 `historicalDiagnostics` 中记为 FAIL。
- **SC-03（六处 sourceReadyRef 缺 pathBase）**：`evidence/readiness-normalization.json` 六节点 `sourceReadyRef` 及 `pendingApprovals.sourceRef` 均补为显式 `pathBase=REPOSITORY` 的标准 typed ref；原 READY 值、来源、writerStopped、PENDING/NOT_EVALUATED 全部保持，未重新签发、未增加批准值、未声称 conforming。
- **SC-04（计数/图不一致）**：本 overlay 计数仅从最终枚举集合生成 —— M 共 20 文件（17 静态 + 3 seal/readback），旧 K 23/20/3，旧历史 34/32 与 16/14 仅作历史输入数；不再生成封存后需回改的手工计数文件。

## 限制
- 局部静态 MATCH 不是产品修复验收、业务批准或发布验收。
- `independentReview=PENDING`、`release=NOT_EVALUATED`；产品验收 `NOT_RUN`、完整 runner 独立动态验收 `NOT_EVALUATED`。
- 原 54/306/31、包状态、历史开放项均未更新；原 36 项实施任务与待批输入仍未改变。
