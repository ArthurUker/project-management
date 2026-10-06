# S04 · 关系约束与迁移历史定向核对

状态：COMPLETE_WITH_PENDING。HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本包仅读取 Prisma 目标模型、相关迁移片段以及 sync/project 写入口；没有运行迁移、数据库查询、业务测试或历史探针，没有访问业务数据库或修改数据。

## 迁移核对

目标对象在初始迁移 `20260902085743_init_postgres/migration.sql` 建表并定义关系。后续 `20260909120000_batch1_d_model` 添加 TaskDocRef，FK 仅以 task id 连接；`20260910120000_batch4_sync` 增加 device/mutation 表并注释同步增量由业务表 updated_at/deleted_at 派生；`20260910130000_audit_entity_type_string` 修改 AuditLog.entity_type；`20260915120000_mutation_receipts` 新建 HTTP receipt 表；`20260928120000_file_access_scope` 对任务/阶段附件按实体 ID 回填 owner project。定向搜索未发现后续迁移添加 Task.parent/phase、TaskDependency 两端的 projectId 复合约束，也未发现改写 ProjectMember project/user 唯一约束。此结论限定为当前仓库这六个迁移文件及上述对象，不代表已检查其他部署环境的 `_prisma_migrations` 或数据库漂移。

| 不变量 | 当前命令/DB约束 | 结果 |
|---|---|---|
| parent 与 child 同项目 | sync 接收 parentId，guard 未验证父项 projectId；FK `parent_id -> tasks.id` 无 projectId 复合约束 | B19 保持 SUPPORTED |
| parent 删除不跨项目级联 | Project tasks replacement 使用项目范围 `deleteMany`；SQL parent FK 是物理 ON DELETE CASCADE，仅按 id 关联 | 发现 B19 与 B02 组合后的跨项目物理删除链，见下节；未执行组合复现 |
| phase 与 task 同项目 | HTTP/sync 有项目归属校验；数据库 phase FK 只按 id，另有 projectId/phaseId 索引，无复合 FK | 应用层约束；软删 phase 是否可被重新关联仍待规则裁定 |
| task dependency 同项目且无环 | HTTP 检查两端同项目/自依赖并做反向直接边检查；DB 两个 FK 按 id，唯一键 task_id/prerequisite_id，不约束 projectId 或一般 DAG | 不能从静态检查证明任意长度环已被排除；不新增确认缺陷 |
| member 唯一身份关系 | DB 唯一键 project_id/user_id；退出由 left_at 表示，未见角色版本专用列 | 支持单项目一用户一成员行；加入/退出/改角色的 sync revision 合同仍按 R05 pending |
| 软删和硬 FK cascade 区分 | 项目、phase、task 有 deleted_at；初始 migration 另定义物理 ON DELETE CASCADE/SET NULL | 软删不触发 DB 级联；应用物理删除会触发定义的 FK 动作 |

## B19 补充裁定：保持 ID/P2，扩展已证明影响路径

B19 仍为 `SUPPORTED/P2`，但现已能沿已有 B02 与 B19 证据连出一个更具体的删除后果：历史 B19 探针证明 Project B 的 sync 写入可引用 Project A 的父任务；历史 B02 探针证明项目编辑的任务数组路径可物理删除项目任务；当前 `projects.js:402-406` 调用按 Project A 的 projectId 执行 task.deleteMany，而初始迁移 `migration.sql:1346` 与 schema `Task.parent` 定义 parent FK 的 `ON DELETE CASCADE`。当 A 父任务被该路由物理删除时，数据库按 parentId 向下级联，不会加 Project B 范围条件。因此，在数据库应用此迁移约束的前提下，Project A 编辑者可经任务数组替换物理移除指向其父任务的 Project B 子任务行。

两个历史前提分别有证据，当前写路径和 FK 语义连接二者；本包没有对整条组合路径进行一次性动态复现，且未检查实际部署数据库约束是否漂移。这是 B19 已确认根因的影响范围扩展，未另开新 ID、未提高严重度。它不表示 Project B 被访问读取，也不表示单凭 B19 就能删除任意其他项目任务；需要先存在跨项目 parent 边，且另一个用户能通过 Project A 的项目编辑路径物理删除父行。软删父行本身不会触发 DB FK cascade。

建议沿用 B19/B02 修复合同：跨项目 parent 在每个写入口拒绝；移除/隔离项目数组替换的物理删除；删除采用对象级授权的 tombstone 命令。迁移前对真实数据只读盘点跨项目边、孤儿、cycle 与 tombstone 引用，批准处置后才设计复合 FK。

## 覆盖边界与开放项

- S04 定向覆盖了相关 schema 与仓库中六个迁移文件；完整文件摘要见 `source-digests.json`，实际片段/入口见 `coverage.csv`。
- 没有连任何业务 DB，因此异常关系数量、生产 FK 是否与 migration 一致、锁影响和历史异常分布均未知。`S04-OI-01` 需要获准只读数据源及产品批准的数据处置方案；不得从静态 schema 推造存量数据数量。
- 任意长度 dependency cycle、软删 phase 引用等缺乏能确认违反业务规则的政策或动态证据，不作为本包新 finding；由 S01 规则决策和后续受控验收处理。
- 整条跨项目级联删除链基于两条历史探针与当前静态 SQL/FK 语义；未运行组合复现，verification 仍为 `HISTORICAL_ONLY`。

S04 交付 `findings.json` 中 B19 的补充影响裁定，原 R11 文件保持不变。状态为 `COMPLETE_WITH_PENDING`，等待数据现状与目标环境约束确认。
