# 待签决策材料索引 — C～F（全部 PROPOSED）

> 本索引仅汇总各窗口准备的材料与推荐方案；所有决策仍为 `PROPOSED`，`approvedBy/approvedAt/evidenceRef` 均为 `null`。本汇总不代签、不选生产政策、不启动实施任务。

## C — T-RP-02 回执/保留合同
- **状态**：PROPOSED；来源窗口 `window-c-receipts/`（READY `ec660c2f…`，manifest `5898eb3e…`）。
- **推荐方案（OPT-A）**：扩展 `SyncMutation` 为作用域回执，对齐 `mutationReceipt`。
- **关键待批项**：A1 总体方案；A2 作用域唯一键形态（`actorId+deviceId+clientMutationId+resourceScope`）；A3 `payloadHash` 必填（canonicalize+sha256）；A4 单事务边界（业务写+回执+审计同事务，消 B06）。
- **数值（建议待批准）**：N1 回执保留期 24h（对齐 `RECEIPT_TTL_MS`）；N2 最大离线窗=保留窗；N3 兼容窗口 1 发版周期；N4 留存清理 job 频率 `OPEN_INPUT`（S03-OI-04）。
- **材料文件**：`current-contract.md`、`decision-draft.md/.json`、`acceptance-draft.csv`、`approval-request.md`、`interface-notes.md`。
- **外部缺口**：最大离线窗/保留期确切小时、唯一键最终形态、清理责任人/频率、与 T-RP-07/S03-OI-05 在 delete 范围的交互。

## D — T-RP-09 认证 transport / 跨身份
- **状态**：PROPOSED；来源窗口 `window-d-auth/`（READY `aeb0402f…`，manifest `0f7a93bd…`）。
- **推荐（维持现有 transport）**：Bearer/body 为唯一传输；cookie 仍“不支持”（不得由 CORS 旗标推定）；single-use / family 失败语义、前端 generation fence 与重放归属、兼容与回退。
- **独立门禁（不因本材料隐式批准）**：D-S01-04 access JWT 失效 `PENDING`（由 RP03-T02+PC01 单批准）；T-RP-09/PC01/PC04/PC09/T-RP-12 记录保持空。
- **材料文件**：`transport-current.csv/.md`、`generation-matrix.csv`、`decision-draft.md/.json`、`acceptance-draft.csv`、`approval-request.md`、`interface-notes.md`。
- **外部缺口**：具名安全/认证/前端负责人确认；兼容窗口/残余风险/批准日期与证据；真实部署/受支持范围 `OPEN_INPUT`。

## E — T-RP-03 客户端 revision 兼容
- **状态**：PROPOSED；关联 S03-OI-09；来源窗口 `window-e-revision/`（READY `dc1bff76…`，manifest `cc03bd53…`）。
- **推荐（P1–P5）**：P1 扩展 reports 式契约到 tasks（复用 `editPolicy.ts`）；P2 missing-base 400/409；P3 409 交互（在线 409 / 离线 `conflict`+快照）；P4 升级窗口（最低基线能力客户端版本 + 截止日 `OPEN_INPUT`）；P5 全链范围（普通字段+status+assigneeId+批量+离线同步，闭合离线 report `baseUpdatedAt` 缺口）。
- **外部证据缺口**：部署版本 DV-1/DV-2、产品声明 PV-1/PV-2、升级截止 UC-1/UC-2（`UNCONFIRMED/OPEN_INPUT`）。
- **材料文件**：`source-client-matrix.csv/.md`、`support-evidence-register.json`、`decision-draft.md/.json`、`acceptance-draft.csv`、`external-client-evidence-request.md`。
- **说明**：源码矩阵材料完整 ≠ S03-OI-09 已满足或 RP10-T01 可启动；不更新原 RP00-T03 及根门禁台账。

## F — T-RP-04 水位/引导 + T-RP-12 用户可恢复流程/保留
- **状态**：PROPOSED；T-RP-10 仍 PROPOSED（epoch/reset 耦合）；RP13-T03 受门控不激活；来源窗口 `window-f-cache/`（READY `3813f267…`，manifest `75475cb2…`）。
- **推荐 T-RP-04（O3）**：事务 outbox + 提交可见发布序列（O2 已由 `barrier-summary.json` 证据 `PERMANENT_MISS_DEMONSTRATED` 驳回）。
- **推荐 T-RP-12**：五类显式可恢复状态 + 最后副本保全 + 当前授权校验。
- **证据缺口**：S03-OI-01 自有 PostgreSQL 双会话事务 barrier 本轮未产生（验收 `NOT_RUN`）；conflict/dead-letter/unknown/oversize/quarantine/撤权 真实 IDB 多 tab 验收 `NOT_RUN`；T-RP-11 预算/监控数值未测未批。
- **材料文件**：`watermark-options.md`、`cache-recovery-matrix.csv`、`decision-draft.md/.json`（T-RP-04 与 T-RP-12 各一份）、`acceptance-draft.csv`、`approval-request.md`、`interface-notes.md`。

> 全部 54 任务仍 36 项未完成实施；原 306 验收、包状态、31 开放项、门禁与发布状态均未被改动。
