# R11 · 跨项目关系与软删模型约束

状态：COMPLETE_WITH_PENDING。基线/HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本包仅审阅 schema、初始迁移、tasks/sync 命令与 R03/R06/R09 结果；未运行迁移、数据库查询、业务测试或历史探针，未修改业务代码。迁移目录其余文件未逐一审阅，仅抽查当前相关表在初始迁移中的建表、索引和 FK 定义；执行/性能语义留待后续。

## 关系不变量 → 命令校验 → 数据库约束

| 关系/不变量 | 命令层证据 | schema / migration 约束 | 结论 |
|---|---|---|---|
| Task.parent 与子任务必须同项目；无环 | Sync task 白名单允许 `parentId`，但 `assertSyncEntityActions()` 只校验 phase，没有校验 parent 的项目归属或循环（`sync.js:69-82,236-248`）。HTTP task create/update DTO 不接收 parentId（`tasks.js:172-177,235-240`）。 | `Task.parent` FK 只引用 `Task.id`，无 `(projectId,id)` 复合 FK，也无环约束；删除动作 `onDelete:Cascade`（schema:818-867；migration SQL:1340-1347）。 | **B19 SUPPORTED**：历史隔离探针证明跨项目 parent 可被 sync 建立，当前代码仍有同一路径。仅证明异常边可建立；不宣称可删除他人任务。环约束亦不在 DB 层。 |
| Task.phase 必须属于同项目且存活 | HTTP task create/update 检查 phase 的 projectId，但不检查 `deletedAt`（`tasks.js:185-190,270-275`）；Sync 通过 `assertPhaseBelongsToProject` 检查归属（`sync.js:245-246`，实现位置由模块导入）。 | Task.phase FK 只引用 phase id；无复合 project FK。ProjectPhase 有 `deletedAt`，唯一约束为 `(projectId,code)`，索引含项目/排序与状态/软删（schema:741-773；migration:1040,1340-1344）。 | 项目归属主要依赖应用校验；deleted phase 可否重新指派尚无跨包证据，记模型/命令差异待确认，不新增缺陷。 |
| TaskDependency 两端同项目、无自依赖/环 | HTTP prerequisites 明确检查同项目及自身，循环检测只查询拟加边的反向直接边（`tasks.js:92-119`）。 | 两端 FK 各引用 Task.id；唯一键 `(taskId,prerequisiteId)`，不承载同项目或 DAG 约束（schema:878-891；migration:1351-1355）。 | 同项目/自环由应用命令承担。静态检查不能排除长度≥3的有向环；未有独立历史复现或运行证据，本包不新增缺陷 ID，列为待补验证/模型约束候选。 |
| 成员每项目每用户至多一行，退出保留历史 | 成员加入/角色/leftAt 同步语义见 R06；不重审授权细节。 | `ProjectMember` 有唯一 `(projectId,userId)`，`leftAt` 软退出，无 updatedAt/revision（schema:634-648；migration 建表:254-265，唯一由 schema 初始迁移索引段核对）。 | B08（R05）关于新授权成员增量游标未回填仍 SUPPORTED；成员模型解释是加入时间可承担同步时间戳但角色变化/退出复用字段的版本语义需明确，不重复编号。 |
| 软删及级联保持本地可恢复语义 | R03 B20：项目列表/统计未统一 alive filter；详情会拒绝软删项目。Task HTTP 删除先递归找未删子项，再批量设 deletedAt；递归条件仅 parentId 与 deletedAt=null，未附 projectId（`tasks.js:355-376`）。Sync init 使用 tombstone 字段与范围查询（R05/R06）；sync delete 单条设置 deletedAt（`sync.js:436-449`）。 | Project/ProjectPhase/Task 均有 deletedAt；Task/Project/Phase 的物理 FK cascade 与业务软删不同。软删不会触发数据库 onDelete cascade。 | B20 维持历史裁定（本包不重复编号）；应统一定义聚合墓碑、删除/恢复与同步传播。任务递归未按 projectId 限定的静态路径不等于已证明跨项目越权删除，遵循 B19 边界。 |

## B19 · P2 · SUPPORTED（历史探针 + 当前源码）

**入口/前提：** 已认证且可写项目 B 的同步主体提交新 task，`projectId=B`、`parentId` 指向项目 A 任务。`SYNC_ENTITIES.tasks.fields` 接受 parentId；push 将过滤后的 data 送入通用 create；task 专属 guard 检查 phase 和动作权限但不检查 parentId。历史 `backend-results.json#B19_CROSS_PROJECT_PARENT_ACCEPTED` 证明隔离数据库接受该关系，历史报告记录 B 成员和 A 父任务互不授权。

**现有保护/反证：** Sync 先限制变更必须归属于 actor 可访问的 projectId；任务 action permission 和项目 write capability 仍执行；phase 有同项目检查。数据库 FK 确保 parent 记录存在，但只按 id 关联。HTTP create/update 不暴露 parentId。以上保护没有阻止 sync 的跨项目 parent 边。

**已证明影响与边界：** 任务树可包含跨项目边，破坏项目内树关系假设；历史结果证明“可建立”。`DELETE /tasks/:id` 的 descendant 查找没有 projectId 条件，源码可形成需要重点审查的关联路径，但本轮未执行该跨项目关系与删除交错，也未证明权限条件/数据组合下可删除他人项目任务。因此不将其写成已证明影响或扩大 B19。

**建议/验收：** 所有写入口共享父任务命令，验证 parent 存在、同 project、未软删且加边后无环；数据库用复合唯一 `(projectId,id)` 与复合外键固化同项目关系（确认 Prisma/PostgreSQL 迁移可表达）；递归始终带 projectId。迁移先只读列出跨项目 parent 边、孤儿引用、循环及被软删父项引用，并由业务决定修复映射/清空/隔离；审阅结果不得自动改数。验收拒绝跨项目边与任何长度循环，合法同项目树可同步，软删边和历史异常按批准方案处理。

## 新发现

未新增已确认缺陷。依赖环检测对长度≥3环的静态缺口、软删 phase 可关联路径列为模型风险与待证项；尚无足够业务不变量/独立运行证据将其建立为新增发现。

## 模型迁移前检查清单

1. 只读查询并分类 `tasks.parent_id` 指向其他 project 的关系、parent 不存在关系、跨项目递归链、任意长度环；输出数量和受影响项目，不导出不必要个人数据。
2. 对 task.phase_id 与 `project_phases.deleted_at` 对账；按实际业务确认任务是否允许关联软删 phase。
3. 对 task_dependencies 检测跨项目边、自环、长度≥2环、两端 tombstone 状态；确认 dependency DAG 是强制不变量还是允许历史异常。
4. 核对 TaskDependency/Task parent 的物理删除、软删除、恢复和 sync tombstone 协议；区分 FK Cascade 与应用墓碑，明确关联记录恢复策略。
5. 检查项目/phase/task 软删后 list/detail/search/sync/递归删除过滤一致性；结合 R03 B20 与 R05 B07/B08 的游标语义，确认墓碑分页完整。
6. 在开发副本预演复合唯一/FK、回填及 NOT VALID/VALIDATE 分步策略（若 PostgreSQL/Prisma 方案允许）；先校验现存数据、锁/索引构建影响与回滚/备份点，再设计迁移。当前未运行只读 SQL、迁移或 explain，不能报告数据数量或性能结论。

## 证据继承与未覆盖

- 读取并对照 R03 项目可见性/软删（B20）、R06 sync entity 白名单/guard/delete 路径、R09 task HTTP 与 report 并发矩阵；并读取历史 B19 原始结果和旧报告。
- 定向审阅了 `schema.prisma` Task/ProjectPhase/ProjectMember/TaskDependency、初始迁移中相关 FK/索引，以及 `tasks.js` / `sync.js` 相关段。其他 migration 文件未逐个审阅，DB 内现存数据、索引约束漂移、递归复杂度和性能均未验证。
- 未运行动态验证，故无法证明当前可操作环境中历史隔离探针的再次结果；旧证据与当前源码相符。没有查询计划，不主张性能问题。
- SUPPORTED 指证据支持既有发现，不代表已修复或系统验收通过；COMPLETE_WITH_PENDING 表示审阅任务完成，遗留数据/业务策略与迁移前检查仍待实施阶段。
