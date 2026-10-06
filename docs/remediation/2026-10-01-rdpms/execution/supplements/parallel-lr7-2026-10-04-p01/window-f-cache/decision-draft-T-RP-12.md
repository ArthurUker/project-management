# 决策草案：T-RP-12 用户可恢复流程与保留

状态：`PROPOSED`（未批准、未实现）
决策登记：`DECISION_REGISTER.json:T-RP-12`（`approvedBy/approvedAt/evidenceRef=null`）
父任务：`RP08-T02`、`RP11-T01`、`RP11-T03`、`RP12-T02`；关联 `PC04`、`PC12`

## 推荐方案（仍 PROPOSED）

为 `conflict`/`dead-letter`/`unknown`/`oversize`/`quarantine` 五类建立**显式可恢复状态**，清理前保全最后副本，查看/导出/放弃均校验当前用户授权（按获准归属/ACL），不自动丢弃、不跨 owner 泄露。

## 场景与现状（来源 `cache-recovery-matrix.csv` / `evidence/source-facts.md`）

- **conflict**：`engine.ts` L370–L382 `resolveConflict`；local=以服务端时间为基线新 `clientMutationId` 重推。最后副本在 conflict 记录（L298–L313）。
- **dead_letter（rejected）**：`engine.ts` L315–L339 同 IDB 事务转入；`retryRejection` L390、`dropRejection` L426、`getRejectedPayload` L417。登出保全 L525–L551。
- **unknown**：缺口——`SyncPushResult` 仅 `applied|conflict|rejected`（`sync.ts` L31–L46），无 unknown 状态。
- **oversize**：缺口——`sync.push` 仅限 500 条（`sync.js` L506），无字节/配额守卫。
- **quarantine**：缺口——协议/引擎无 quarantine 概念。
- **logout_unsynced**：`engine.ts` L525–L551 把 outbox 转入 dead-letter（LOGOUT_UNSYNCED），重登录同账户可恢复。

## 兼容 / 迁移 / 回退 / 用户流程

- 兼容：需批准客户端/schema 兼容窗；当前类型缺 unknown/oversize/quarantine。
- 迁移：dead-letter 字段与回执状态为追加式，无破坏性变更；outbox 已按 `userId` 归属（`engine.ts` L173–L177）。
- 回退：禁用新状态回退到当前 conflict/rejected 处理；既有 dead-letter 数据保留。
- 用户流程：每项可查看/选择/导出/放弃；查看/导出/放弃校验当前授权；最后副本保留至显式放弃；不自动丢、不跨 owner 泄露。

## 所需批准（均 pending）

选中选项、命名批准人/日期、兼容客户端/schema 窗、conflict/oversize/quarantine/撤权运行时证据、风险接受（如有）。

## 缺口声明

`unknown`/`oversize`/`quarantine` 为**设计缺口**，已在矩阵与本案列出，不假定已实现；实现需新轮次与批准。

## 签名

`approvedBy=null`、`approvedAt=null`、`evidenceRef=null`。
