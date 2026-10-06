# 窗口 F 复核条目（REVIEW_ENTRY）

windowId: F
batchId: parallel-lr7-2026-10-04-p01
mode: PROPOSED_APPROVAL_PREPARATION_ONLY

## 范围与模式

- 仅生产 `T-RP-04`/`T-RP-12` 待批准方案材料，复用 `RP13-T02` barrier 证据。
- 未实施 publisher/ACL/IDB 迁移/缓存删除/epoch；未激活 `RP13-T03`。

## 交付清单（摘要）

- authorization.json / task-state.json / change-summary.md / acceptance.json / rollback.md / handoff.md / REVIEW_ENTRY.md（共同七类）
- evidence/reused-evidence.md / evidence/source-facts.md
- watermark-options.md（T-RP-04 选项矩阵，含历史反例与候选证明分离）
- cache-recovery-matrix.csv（T-RP-12 撤权/角色/回填/分页/旧 cursor/outbox 归属 + conflict/dead-letter/unknown/oversize/quarantine 保全）
- decision-draft-T-RP-04.{json,md} / decision-draft-T-RP-12.{json,md}（status=PROPOSED，签名 null）
- acceptance-draft.csv / approval-request.md / interface-notes.md
- WORKER_MANIFEST.json / READY.json

## 验证层次

- 材料交付/来源一致性：`PASS`（见 acceptance.json materialCases）。
- 业务验收：`NOT_RUN`（无真实 DB/browser/IDB 运行）。
- independentReview：`PENDING`；release：`NOT_EVALUATED`。

## 重点声明

- 不把局部 barrier / seq 递增当生产 safe-watermark 验收。
- 不伪称重跑 RP13-T02 证据（REUSED_VERIFIED_EVIDENCE）。
- 不改共享台账/其他窗口；writerStopped=true。
