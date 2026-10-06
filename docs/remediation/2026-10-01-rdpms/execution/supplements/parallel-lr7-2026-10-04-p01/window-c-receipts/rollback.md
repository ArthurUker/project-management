# 回退说明（rollback，PREPARATION_ONLY）

## 本窗口本身的回退

- 本窗口为 **PREPARATION_ONLY**，未修改任何业务源码、测试、共享 helper、schema、guard、seed、依赖、部署脚本或配置，也未更新任何根台账（`DECISION_REGISTER`/`TASK_GRAPH`/`IMPLEMENTATION_STATE`/`OPEN_ITEM_GATES`/`CROSS_PACKAGE_CONTRACTS`）。
- 因此本窗口产物**完全可逆**：删除 `window-c-receipts/` 整个分区即回到授权前状态，无任何业务副作用。
- 未运行真实 DB/构建/浏览器；未启动服务或持有共享锁；未联系负责人。

## 未来实施的回退边界（由实现任务承接，本窗口不实施）

- 回退策略已在 `decision-draft.md` §7 与 `decision-draft.json.migrationAndRollback` 规定：
  - schema 为 **additive 加列** + 可选唯一键调整；新列 nullable，回退不丢数据。
  - 通过 **feature flag** 灰度新事务路径，旧 `sync push` 路径（独立 upsert）保留以便回退。
  - 唯一键若调整，须“先加后删旧约束”。
- 实施回退的具体触发、验证与责任人归 `RP09-T01`/`RP09-T02`/`RP12-T02` 及其门禁，不在本准备窗口范围。

## 不回退项

- `DECISION_REGISTER.T-RP-02.status` 维持 `PROPOSED`，`approvedBy/approvedAt/evidenceRef` 维持 `null`；本窗口未写、未改这些字段。
- 历史审计开放项（B06 SUPPORTED/P1、S03-OI-03 OPEN、S03-OI-04 OPEN）及其冻结账目未被改写。
