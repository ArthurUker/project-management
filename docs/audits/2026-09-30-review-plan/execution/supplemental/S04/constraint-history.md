# S04 约束演化表

范围：S04 定向覆盖的当前 Prisma model 与仓库中相关迁移片段。完整锚点见 `coverage.csv`，摘要见 `source-digests.json`。未检查部署环境的迁移表或约束漂移。

|对象/不变量|当前模型/迁移证据|演化结论|边界|
|---|---|---|---|
|Task.parent 同项目|`20260902085743_init_postgres/migration.sql:1346` 仅以 `parent_id -> tasks.id` 并 `ON DELETE CASCADE`；`sync.js:69-82,236-248` 允许 parentId 且未核父任务项目|无 projectId 复合 FK；跨项目父边由 B19 支持|部署 DB 是否一致未知|
|Project tasks replacement|`projects.js:402-406` 按 projectId `deleteMany`；parent FK 物理级联|B02 与 B19 组合后扩展 B19 的影响路径|未做组合动态复现|
|Task.phase|初始迁移按 phase id FK；应用入口有项目归属检查|项目一致性主要依赖应用层|软删 phase 再关联规则待 S01|
|TaskDependency|初始迁移 FK 按任务 id、唯一键 `(task_id, prerequisite_id)`；无 projectId 复合关系|数据库不保证同项目或任意长度 DAG|产品规则证据待 S01|
|ProjectMember|初始迁移 project/user 唯一约束|同项目用户只有一条成员行|角色版本/同步 revision 合同仍 pending|
|软删/物理删除|模型有 `deleted_at`；物理 FK 定义 CASCADE/SET NULL|软删不触发 SQL FK cascade|应用中各删除入口需按具体路径分析|

`review.md` 记录逐项源调用链、保护、限制与 B19 补充裁定。
