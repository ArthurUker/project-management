# R06 · 同步写入、回执与状态机

状态：审阅完成（旧发现均 SUPPORTED；新增静态发现 R06-N01）。日期：2026-09-30。HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`，与基线一致。本包只读审阅同步 push 及其直接依赖，未重跑历史故障、未运行测试、未改业务代码。

## 范围与执行路径

入口 `POST /api/sync/push` 在路由全局认证之后解析设备与最多 500 条 changes；设备 upsert 后先查当前可见 project IDs，然后按 changes 顺序逐条处理（`sync.js:38,340-360`）。对于每条变更，先校验 key/entity/id，按全局 `clientMutationId` 检查已存在的成功回执并可直接重放，之后才读取实体、确定项目、检查可见项目/作者、加载项目成员能力及实体动作权限（`sync.js:362-421`）。新写入再做可选 `baseUpdatedAt` 冲突比较、白名单字段过滤和实体写入；最后独立 upsert `SyncMutation`，循环完成后更新设备时间并写非严格汇总审计（`424-588`）。

真实顺序：`auth → device upsert → visible-project query → global mutationId receipt prefetch/replay → entity read → project/owner authorization → project capability + entity action guard → optional stale-base compare → business write → separate SyncMutation upsert → lastPushAt → best-effort aggregate writeAudit`。回执读取发生在项目可见范围列表之后，但**早于该 mutation 对应实体/作者授权**；回执查找本身只使用 mutation ID。

## 写路径矩阵

`SYNC_ENTITIES` 在 `sync.js:41-149` 规定以下字段和默认动作授权。各写入先通过 `loadSyncAccess` 与 `assertSyncEntityActions`（`172-260,414-422`）；删除使用独立 delete permission，更新/创建使用相应权限。允许字段为代码白名单，`projectId` 从实体/原载荷单独取值；服务端字段按 `serverOwned` 删除。

| 实体 | 离线新建 / 写字段（摘要） | 动作权限与额外约束 | 状态、CAS 与单条原子范围 |
|---|---|---|---|
| projects | 不允许新建；name/description/status/type/position/managerId/dates | `projects.update`；没有项目 status/archive transition 专项守卫；managerId 是普通白名单字段 | 更新用 `updateMany(id, observed updatedAt)` CAS；状态可以直接传入。managerId 同步未复用 HTTP 的 manager ProjectMember 升降级事务。 |
| projectPhases | 可建；名称、排序、status、日期、进度、milestone、notes | create/update/delete 对应 `project_phases.*`；现有 status 改动另需 change_status + transition | 普通更新用单语句 CAS；状态额外动作权限，但本包未发现/审阅完整状态图。创建/删除直接写。 |
| tasks | 可建；业务字段；code/完成/开始时间服务端拥有 | `tasks.create/update/delete`；状态变更 `tasks.change_status + transition`；指派 `tasks.assign + assign`；phase 必须同项目且未软删 | 更新可把普通字段、状态、指派组合成同一个 Prisma 事务；首次写 CAS，后续命令复用该事务行；单个业务事务不包含 SyncMutation 回执或审计。创建与 tombstone delete 在事务外。 |
| milestones | 可建；name/description/phase/dueDate/status；completedAt 派生 | `milestones.create/update/delete`；phase 引用须同项目 | 通用单语句 CAS 更新；创建/删除直接写，无与回执事务。没有独立 status transition guard。 |
| monthlyProgress | 可建；内容字段；submittedBy 服务端拥有 | `progress.create/update/delete`；项目 `manage_members` 写能力 | 通用单语句 CAS 更新；创建/删除直接写。 |
| reports | 可建；reportType/period/content；author/status/version 等服务端拥有；ownOnly | `reports.create/update/delete`；作者、项目 write、draft 状态锁；周期/内容共用 report command 校验 | 已有草稿保存调用共享 helper 与 observed-updatedAt CAS，但传的是根 Prisma client，不在同步 receipt 事务内；创建直接写；无同步 submit 命令。 |
| projectMembers | 可建；role/userId；tombstone 为 leftAt | create/update/delete 都以 `projects.manage_members`；项目 capability `manage_members` | 通用 CAS 默认 timestampField=`joinedAt`，但 role 更新本身不改 joinedAt；更新、创建、leftAt 退出及 SyncMutation 分开写。成员行没有 updatedAt/revision。 |

基线 CAS 的边界：existing entity 的普通 upsert 以服务端读取到的 timestamp 构造 CAS；若请求提供 baseUpdatedAt 且已落后，先返回 conflict（delete 被该比较排除）。请求没有带 baseUpdatedAt 时，不会识别客户端离线基线过期，只能用读到实体到真正 UPDATE 之间的 CAS 防止窄竞态。delete 路径执行直接 `update(id)` tombstone，没有 CAS。

## 回执协议对照

| 属性 | 同步 `SyncMutation` | HTTP `MutationReceipt` helper |
|---|---|---|
| 唯一作用域 | 全局唯一 `clientMutationId`；记录 user/device/entity/id/op/status/result，但 lookup/upsert 只以 key 为条件（sync.js:363-367,546-566；schema:486-503） | `(actorId, command, resourceScope, idempotencyKey)` 复合唯一键（schema:1600-1618） |
| 主体/资源检查 | 成功回执重放在逐实体授权之前；已知旧 mutationId 可返回旧结果 | 路由先做当前授权；helper 按 actor/command/resource/key 查回执 |
| 请求载荷绑定 | 无 payloadHash；同 key 的不同 mutation 数据不比较 | 对规范化 payload 求 SHA-256；同作用域同 key 不同内容返回 409（payloadHash.js:12-30; receipts.js:50-58,98-104） |
| 业务写 + 回执 + 审计 | 不共享事务；SyncMutation 在业务写后独立 upsert；只有循环末尾汇总 writeAudit（sync.js:543-588） | 有 key 时 placeholder、validate、execute、严格审计及 response 回填在同一 Prisma transaction；无 key 仍运行业务+审计事务但不去重（receipts.js:86-128；strictAudit.js:17-20） |
| 重试与部分批次 | 每条 outcome 单独落回执；失败/conflict 下次重新判定并覆盖；无整批 transaction。500条上限是批量界限，不构成整批原子承诺 | 每个 HTTP command 独立事务；唯一键冲突后事务外读已提交回执。回执保留期标记 24h，但此处未审清理程序。 |

HTTP 对照限制：审阅直接检查了 reports 的幂等路径（`reports.js:163-225,317-381,384-429`），其严格审计与 mutation receipt 同事务；任务 HTTP 使用共享 task command，但 command transaction 后调用可降级 `writeAudit`（`tasks.js:277-312`），本身未见 `withIdempotency`。因此不能把“HTTP 一律采用严格 receipt contract”作为已确认事实。项目 HTTP 更新也通过事务处理 manager 变更与成员关系，而 sync 项目通用写不经过该事务（`projects.js:306-378`）。

## 历史发现核对

### B05 · P2 · SUPPORTED · 回执缺主体及载荷绑定

**触发前提与影响边界：** 攻击者/其他主体须**已知道一个已成功的 mutationId**；本审计不证明随机键可预测或可猜。认证用户对某项目提交 tasks mutation 后，任何同 mutationId 的已成功 `SyncMutation` 都被 push 预取，并于该 mutation 的项目成员和实体动作授权之前原样返回。载荷、userId、entity、entityId 不参与 replay key 比对；结果只证明可取回旧结果元数据/ID/time 与虚假的 applied acknowledgment，不证明报告正文泄露或旧写被覆盖。

**历史 H：** `backend-results.json#B05_SYNC_REPLAY_SCOPE_AND_PAYLOAD`：原用户提交 `audit-cm-shared` 后，同主体不同 title payload 和 outsider（零实体权限）请求均收到 `replayed:true,status:applied`；DB title 仍为 `first-content`。这是 2026-09-29 隔离 PostgreSQL 路由探针，非本轮执行。

**当前 S：** push 在 `sync.js:362-367` 以 `clientMutationId IN (...)` 全局预取；命中 `applied` 的分支在 `384-392` 直接回放；项目内实体授权发生在 `399-421`。表中 key 是全局唯一且没有 hash 字段（schema:486-503）。与之对照，HTTP helper 按 actor+command+resource+key 和 payloadHash 绑定（receipts.js:33-58,98-104; schema:1594-1618）。

**保护/限制：** `sync.use('*', authMiddleware)` 需要认证；回执 key 必须已知；无凭据猜测或正文读取证据。项目可见集合在预取前计算，但预取/回放不会把单条回执和本次目标资源关联，不能消除已知 key 情形。维持既有 P2，不扩张攻击前提。

**修复与验收建议：** 让同步写走统一回执 contract（actor+command+resource+key+canonical payload hash）；先重做当前实体授权再查回执；错主体/资源拒绝，错载荷 409；验证已知 key 的跨主体 replay、同主体不同 payload、合法同 payload 重试和撤权后重试。

### B06 · P1 · SUPPORTED · 同步业务写入与回执非原子

**历史 H：** `backend-results.json#B06_SYNC_WRITE_RECEIPT_NOT_ATOMIC` 记录注入 SyncMutation upsert 故障后 HTTP 500，task title 已提交、回执数为 0。实际为隔离库真实 SQL 写入后注入 receipt persistence failure；本轮未重跑。

**当前 S 与最小范围：** 实体分支先写业务（tasks 的 `prisma.$transaction` 仅包同任务的 fields/status/assignment，sync.js:479-491；report/helper 或通用直接写在 461-524），离开业务 try/catch 后才单独 `prisma.syncMutation.upsert`（543-567）。该回执故障不会回滚先前已提交的业务事务，能够确认旧探针对应的“task正文提交但回执缺失”当前路径仍存在。同步事务未调用 `writeAuditStrict`；汇总 `writeAudit` 在批次尾部且可降级（571-588; strict helper 定义于 strictAudit.js:17-20）。

**保护/反证：** 任务的多字段更新在单任务内 all-or-none；report/task 共用应用命令可收敛部分校验与字段写语义；这都没有把 SyncMutation/严格审计放进同一业务事务。失败记录会作为 rejected/conflict 回执保存以便重试；写回执本身故障仍可能使请求500。

**原子性边界：** 当前 push 顺序逐项处理并逐项回执，不存在批次总事务；因此批次允许此前项已成功而后续项失败/请求中断。计划不预设整批原子要求。明确缺口是每个 mutation 的业务变化、关键业务审计及其成功回执没有共享单事务。协议应返回每项稳定结果，并说明网络错误后客户端通过 mutation key 查询/重试怎样识别部分成功；不要把单项原子化等同于整批全成或全回滚。

**修复与验收建议：** 单 mutation 内统一使用带事务 client 的 command、strict audit 和 actor/resource/payload receipt；receipt 写失败时业务状态、墓碑/版本和审计一并回滚。逐项故障点验收失败全回滚，成功全部可重放；另验部分批次每项结果可恢复，而不要求整批一个事务。

### B09 · P1 · SUPPORTED · sync 可绕过项目归档权限/状态流转

**历史 H：** `backend-results.json#B09_SYNC_ARCHIVE_WITHOUT_TRANSITION`：项目从 PLANNING 到 ARCHIVED；主体是 MEMBER 且只有 `projects.update`，push 结果 applied。隔离 PostgreSQL 探针，未重跑。

**当前 S：** project schema 白名单把 `status` 和 `managerId` 纳入通用字段（sync.js:42-53）。统一实体 guard 对 projects 只按 def.permission=`projects.update` 检查（198-215）；项目通用更新随后走 CAS updateMany，无项目专属归档授权或 status transition 校验（424-435,457-515）。HTTP project PUT 明确检查 `projects.archive` 并依 `STATUS_TRANSITIONS` 拒绝非法流转（projects.js:331-347）。B09 原结论保持 P1，限定于项目 status 的历史触发和当前仍相符的静态路径。

**保护/限制：** push 仍需认证、项目可见/成员能力及 `projects.update`；这些不是归档专属权限或状态图。只证明 PLANNING→ARCHIVED 历史路径，未证明每一种非法项目转换。

**修复与验收建议：** sync 不接受通用 status 字段，改走和 HTTP 相同的项目状态命令/授权/状态图；验收 `projects.update`-only MEMBER 归档被拒，持有 archive 权限但非法边也被拒，两种入口在权限和可允许边上保持一致。

## 新发现 R06-N01 · P2 · SUPPORTED · 离线 managerId 写入未同步负责人成员关系

**入口与前提：** 已认证、项目可见且具有 `projects.update` 和 write capability 的主体，对已有 project push `data.managerId`。该字段在 sync 的 project 白名单中；项目 handler 只做通用更新，不处理成员记录。

**当前源码证据：** Sync 直接把 `managerId` 放入 project patch 并写项目行（`sync.js:42-53,453-515`），未在此实体或 command 中操作 `ProjectMember`。HTTP `PUT /projects/:id` 对 managerId 变化则在一个事务中将新负责人 upsert 为活跃 MANAGER、把原负责人从 MANAGER 降为 MEMBER；无变化时也确保当前负责人成员行存在（`projects.js:355-378`）。共享 project access 明确以有效 ProjectMember 为成员/能力依据，managerId 本身不绕过非成员访问拒绝（`projectAccess.js:21-55`）；可见性过滤虽另将 managerId 列为可见条件（`projectAccess.js:94-101`）。

**已证明影响：** 静态代码路径显示相同 `managerId` 变更经 HTTP 与 sync 有不同的关系维护语义：sync 只改变 Project.managerId，既不提升新负责人的 ProjectMember，也不降级旧负责人。基于当前成员能力 resolver，新负责人可能仅因 managerId 获得列表可见性，却仍在项目详情/写入口被视为非成员；旧负责人仍保留原成员角色。未做动态请求证明，未声称所有调用场景必然有可利用安全后果，故 P2，SOURCE_ONLY。

**建议与验收：** 将 manager transfer 纳入共享事务命令并由 sync 调用；若业务允许负责人非成员，需明确双方入口的一致政策。验收同一负责人变更从 HTTP/sync 发起后，project.managerId、新/旧 ProjectMember 的 role/leftAt 及 resolver 实际能力一致；中途任一步失败全部回滚。

## 修复方向、兼容性与验证设计

1. 保留 sync push 的逐 mutation 部分成功语义；按 item 给稳定 outcome/key，并定义请求超时后的状态恢复。无需未经业务讨论将 500 条强制为整批事务。
2. 对每条 mutation 统一：鉴权/当前资源授权 → key scope 与 payloadHash 查重 → command 内校验/CAS → 数据、必要审计、receipt 同事务提交。字段白名单、server-owned 字段与每种实体动作权限应由 command contract 明示。
3. 将 projects.status、projects.managerId 等聚合字段拆为有语义的命令；status 使用同一项目状态边/归档授权，manager transfer 同步 Project 与成员关系。
4. 删除需明确是否要求 expected revision；当前 path 会跳过 stale-base 比较并无条件 tombstone。处理顺序、幂等键以及重复 tombstone 结果均应纳入兼容合同。
5. 修复后设计故障注入：在单 mutation 业务写之后、严格审计写后、receipt 写前后分别故障；断言三者全回滚或全成功。另设批次首项成功、次项断连，验证首项可回放、次项可安全重试。该验证设计不表示本轮已运行。

## 覆盖缺口

- 未审 `reportCommands.submitReport` / report submit 作为 sync 未开放命令的明细；本轮只确认同步无 submit API，HTTP submit 的独立事务路径在 R09 继续细审。
- 未检查每个字段对应全部系统角色默认 grant，不重复 R01；仅核验 guard 调用位置与 code 符号。
- 没有额外复现并发同 key、delete/stale base、批次中断、不同实体 receipt failure 或 manager transfer 差异；历史故障仅继承，不是本轮测试。
- projectPhases/task 状态完整状态图没有扩展审阅；本包聚焦历史 B09 项目归档和字段/命令路径。
- 未证明 syncMutation 状态/结果保留清理策略，也未审客户端如何在 HTTP 500 后查询单条 outcome；这影响协议建议细化，不扩大 B06 已证范围。

## 结论

B05 `SUPPORTED/P2`（有已知 mutationId 前提）；B06 `SUPPORTED/P1`（历史 task SQL 成功而 receipt 故障的静态路径仍分离）；B09 `SUPPORTED/P1`（项目 status 绕过归档专用校验仍存在）。新增 R06-N01 `SUPPORTED/P2 / SOURCE_ONLY`，范围仅是负责人成员关系未沿用 HTTP 转移事务。未运行任何测试或复现。本报告的 SUPPORTED 是证据支持，不是缺陷修复或产品验收。
