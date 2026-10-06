# 最小下一业务输入清单（只摘录当前登记，不批准、不启动）

来源：`execution/remaining-task-gates.csv`（当前版本，逐行摘录）与 `DECISION_REGISTER.json` 的引用名。
本文件只说明**解锁所需的最小外部输入**，区分实施依赖（implementation）与验收依赖（validation）；
不代签、不批准、不自动创建任务，也不承诺“一个批准解锁全部”。

| 解锁任务 | 当前登记 | 需要的最小外部输入 | 类型 |
|---|---|---|---|
| **RP09-T01**（RP09，NOT_STARTED / NOT_RUN） | `implementationGates_before_IMPLEMENTATION` = `T-RP-02`（always）；另有 `T-RP-07`（仅当 delete command adapter 被修改）、`S03-OI-05`（仅当 stale/delete command adapter 变化） | `T-RP-02` 对应决定/门禁的具名批准（材料按决定登记） | 实施依赖 |
| **RP08-T02**（RP08，NOT_STARTED / NOT_RUN；实施依赖 `RP08-T01` 已完成） | `implementationGates_before_IMPLEMENTATION` = `T-RP-04`（always）+ `T-RP-12`（always）；`acceptanceDependencies_validation_only` = `RP11-T01` | `T-RP-04` 与 `T-RP-12` 的具名批准；验收还需 `RP11-T01` | 实施依赖 + 验收依赖 |
| **RP02-T02**（RP02，NOT_STARTED / NOT_RUN） | `implementationGates_before_IMPLEMENTATION` = `T-RP-09`（always）；`acceptanceDependencies_validation_only` = `RP03-T01` | `T-RP-09` 的具名批准；验收需 `RP03-T01` | 实施依赖 + 验收依赖 |
| **RP10-T01**（RP10，NOT_STARTED / NOT_RUN） | `implementationGates_before_IMPLEMENTATION` = `T-RP-03`（always）+ `S03-OI-05`（条件）；清单另要求“支持客户端矩阵”材料 | `T-RP-03` 的具名批准 + 支撑客户端矩阵材料 | 实施依赖 |
| **RP15-T01**（RP15，按清单要求） | 数据所有者只读快照为前置材料（登记于 `OPEN_ITEM_GATES.json` / 决定登记） | **数据所有者提供的只读快照** | 实施依赖（材料） |

说明：

- 以上仅为**最小输入**，不构成批准；`nextReadyBusinessTask` 当前为 `null`。
- `T-RP-*` / `S03-OI-*` 的完整定义与批准材料要求见 `DECISION_REGISTER.json`、
  `OPEN_ITEM_GATES.json`、`TASK_GRAPH.json`；本文件不复制其全文。
- 条件型门禁（如 `T-RP-07`、`S03-OI-05`、`S03-OI-06`、`D-S01-08`）只在对应代码路径被修改时才生效，
  不能预先当成“已满足”。
- 本会话仅完成 LR6-01～04 四项补充交付；剩余 36 项实施未完成任务的统计与门禁未改变。
