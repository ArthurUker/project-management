# RP05-T01 — 项目嵌套硬删除授权与同项目 parent 校验

## 状态

- 子任务：`implementation COMPLETE`；`validation ENV_BLOCKED`；`release NOT_EVALUATED`。
- 旧发现：B02（P1）与 B19（P2）仍 `SUPPORTED`，均未 `FIX_ACCEPTED`。
- HEAD 保持 `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。任务开始项目路由是 RP04-T02 完成状态（SHA-256 `2f6ce4ecfe44d738bab830d222205f42d7f6e574e115645c6a16b1a9139a64c7`）；开始时 `tasks.js` / `sync.js` 与 HEAD 一致，精确起止摘要见 `evidence/source-digest-comparison.json`。

## 实施差异

- `projects.put('/:id')` 收到嵌套 `tasks` 数组时，除 `tasks.update` 外，对现有任务的物理删除要求独立 `tasks.delete` 权限和项目 `delete` 能力；若数组创建新任务，则要求 `tasks.create`；生成阶段要求 `project_phases.create`。即便具备删除权，只要待物理删除任务存在跨项目子项，整个事务也拒绝，避免 FK 级联触及其他项目任务。
- 项目嵌套 `milestones` 替换现在分别要求新建/更新/删除动作权限，并要求项目删除能力后才移除既有行。
- 在线任务创建和更新可设置 `parentId`，但父任务必须存在且同属任务项目；拒绝跨项目或自身为父的直接自环。
- 离线 sync task upsert 对非空 `parentId` 执行同项目校验；拒绝跨项目和直接自环，不改变 delete/stale/delete-wins/tombstone 路径。
- 新增真实 PostgreSQL 集成场景覆盖无 `tasks.delete` 时的拒绝及 ID 保留、HTTP/sync 跨项目引用拒绝、合法同项目 parent、既有跨项目子项阻止父项目整批物理删除。场景未运行。

## 影响边界与待批准范围

- 无 schema/migration/dependency 变化。失败的项目更新在既有事务内回滚。
- 旧项目 PUT 数组在存在任务/里程碑时可能被拒绝，直到用户具有各自所需动作权限；跨项目子项存在时即使获授权也拒绝整批任务替换。在线单任务路由是保留 ID 的替代操作。
- 本任务仅校验 parent 的存在和同项目归属，并拒绝直接自环；一般 DAG、软删 parent 是否可引用、restore/tombstone 及历史异常修复仍属 D-S01-08 / 后续 gated tasks，不由本任务激活。
- S03-OI-05 不适用：没有修改 sync stale/delete adapter、delete-wins 或墓碑语义。
- 没有运行 migration、数据库、HTTP、sync 或浏览器验收；B02/B19 仍未 FIX_ACCEPTED。
