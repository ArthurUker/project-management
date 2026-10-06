# R05 · 同步拉取、游标与授权变化

状态：COMPLETE。日期：2026-09-30。HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`，与审计基线一致。定向审阅 `GET /sync/init`、实体注册表、项目可见性、服务端时间游标和前端 applyPull/ACL缓存处理。继承历史 B04/B07/B08 证据；本轮没有重跑，也没有执行数据库并发交错。

## 拉取范围矩阵

同步入口统一认证（`sync.js:38`），之后按项目可见性构造 projectIds，并逐实体查询。实体注册表带有写权限字段，但 init 拉取循环没有读取该 permission 字段，亦没有实体级 view permission 检查（`sync.js:41-149,271-317`）。

| 实体 | 查询范围 | ownOnly / 权限说明 | 活动条件与时间字段 | 限制/墓碑 |
|---|---|---|---|---|
| projects | 可见 project ID (`id IN`) | 没有 `projects.view` 检查 | `deletedAt=null`; `updatedAt > since` | 最多3000；deletedAt 墓碑最多5000 |
| projectPhases | `projectId IN visible` | 注册表有 project_phases.update/create/delete，但拉取不校验 view 权限 | `deletedAt=null`; `updatedAt` | 3000/5000 |
| tasks | 同项目范围 | 注册表有 tasks.update/create/delete、status/assign 权限，但拉取不校验 `tasks.view` | `deletedAt=null`; `updatedAt` | 3000/5000 |
| milestones | 同项目范围 | 注册表有 milestones.update/create/delete，但拉取不校验 `milestones.view` | `deletedAt=null`; `updatedAt` | 3000/5000 |
| monthlyProgress | 同项目范围 | 有 progress 写权限配置，拉取无 `progress.view` 检查 | `deletedAt=null`; `updatedAt` | 3000/5000 |
| reports | 同项目范围 | `ownOnly=true` 只限 `authorId=auth.userId`；未校验 reports.view | `deletedAt=null`; `updatedAt` | 3000/5000 |
| projectMembers | 同项目范围 | 写操作要求 `projects.manage_members`，拉取无成员查看权限检查 | `leftAt=null`; 时间字段使用 `joinedAt`（该模型无 updatedAt） | 3000；`leftAt > since` 墓碑最多5000 |

每个实体仅按 `updatedAt > since` 或对应时间字段查询，按该字段升序；没有二级 ID 顺序，也没有续页 token/hasMore。每实体单次最多3000 upserts，墓碑最多5000。响应游标不是最后返回记录位置，而是在所有实体查询后生成 `serverTime`，客户端保存为 cursor（`sync.js:302-327`; `engine.ts:189-239`）。

## B04 · P1 · SUPPORTED · 同步拉取未实施实体查看权限

**入口与前提：** 已认证用户可请求 `GET /api/sync/init`；用户对项目有可见性，但缺某实体的系统查看权限（历史夹具权限数组为空）。服务端按 projectIds 拉取全部登记实体；`SYNC_ENTITIES.permission` 是写入动作字段，不在 init 查询中使用。`ownOnly` 仅对 reports 限 authorId，不构成通用实体权限策略。

**历史证据（H，仅继承）：** `backend-results.json#B04_SYNC_READ_WITHOUT_VIEW_PERMISSION`：在线任务详情 403，同一主体 `/sync/init` 200 且响应含任务。当前源码路径仍符合该结果。

**当前源码（S）：** init 的权限序列为 `authMiddleware → projectVisibilityFilter → projectIds → 对 SYNC_ENTITIES 全量循环查询`（`sync.js:271-317`）。循环条件仅有 project scope、ownOnly、存活字段、时间条件，没有 `def.viewPermission` 或 `auth.permissions` 判定。返回 ACL 带权限码和 ACL hash（`325-333`），但它只给客户端元数据，并没有限制服务端回包。

**客户端撤权清理：** `applyPull()` 在 aclVersion 改变时仅根据可见 projectIds 删除不再可见项目数据（`engine.ts:213-235`）；若项目仍可见但某实体 view 权限被撤销，当前清理没有按实体/字段权限删除缓存。服务端也仍会继续返回实体内容。因此 B04 不仅是初次响应范围，还覆盖同项目内权限变化后的本地保留问题；历史动态证据直接证明的是无实体权限仍可拉取任务，不是每个实体/撤权时序均单独实测。

**反证/保护：** 项目可见性限制到负责人/有效成员（SUPER_ADMIN 全量），reports 只同步本人的记录；路由需已认证。以上不能替代实体级 view 授权。保留 B04 P1，无新根因另编号。

建议实体注册表显式维护 readPermission/queryPolicy，init 统一按有效系统权限、项目能力、ownOnly/字段策略过滤；ACL 缩减需使对应实体缓存失效。验收：HTTP 被拒绝的实体不得从 init 返回；同项目某实体权限撤销后，后端不再返回该实体且前端删除旧缓存。

## B07 · P1 · SUPPORTED · 有界拉取截断却把游标推进到响应时间

**当前代码（S）：** 对每个实体执行一次 `findMany`，`updatedAt > since`，仅按 timestamp 升序，take=3000；墓碑一次查询 take=5000（`sync.js:302-316`）。无下一页指示或最后行游标。查询完毕后再取 `serverTime=now` 并将其作为客户端 cursor（`319-327`）。客户端无条件在 applyPull 完成后持久化该 cursor（`engine.ts:237-239`）。

**历史证据（H，仅继承）：** `backend-results.json#B07_SYNC_PULL_CAP_LOSES_ROWS` 记录 3001 条符合条件的任务，首轮仅返回3000条，cursor推进；下一轮返回0。历史报告另静态识别“最后一次实体读取与 cursor 生成之间写入、且记录时间早于 serverTime”的遗漏窗口。本轮没有新增并发验证。

**保护与限制：** project scope、软删过滤和按 timestamp 升序提供基础范围控制，但没有稳定 `(timestamp,id)` 排序、固定 snapshot boundary、页 token或 hasMore。若超过上限，已返回的 cursor 仍跨过未返回记录；墓碑也有独立上限风险。毫秒级相同时间值和不同事务提交次序会让基于时间戳的边界更脆弱；这些具体交错本轮未运行。

建议定义固定拉取上界与稳定复合排序 `(changeTime,id)`，用服务器续页 token/分区完成状态；只有所有实体及墓碑都消费到同一边界后才提交客户端检查点。若采用变更日志/序列，须证明提交顺序与可见顺序一致或处理迟提交事务。验收超过3000/5000、同时间戳、拉取中写入和 tombstone 分页，不能丢/重复后推进检查点。

## B08 · P2 · SUPPORTED · 新授权项目只更新 ACL，不回填旧实体

**入口与前提：** 客户端已有 since cursor；主体随后加入一个已存在、含历史数据的项目。可见 projectIds 与 aclVersion 改变，但历史任务 updatedAt 早于 since。

**当前代码（S）：** init 每次计算当前可见 projectIds，并仍用客户端 since 做实体时间过滤（`sync.js:271-304`）；aclVersion 是 projectIds+permissions 集合哈希（`262-267,325-333`）。前端收到 ACL 变化后删除只针对“不再可见”的项目记录，没有检测新增 projectIds 并发起该项目全量快照，随后仍保存原响应 cursor（`engine.ts:213-239`）。ProjectMember 只有 joinedAt/leftAt，无 updatedAt；sync 对其以 joinedAt 作时间字段（schema `634-648`; `sync.js:134-147`）。

**历史证据（H，仅继承）：** `backend-results.json#B08_SYNC_NEW_MEMBERSHIP_NO_BACKFILL`：响应 ACL 包含新项目，但项目与历史任务 upserts 都空。当前查询/客户端流程吻合。本轮未重跑。

**反证/保护：** ACL 版本变化会让客户端进入权限清理路径；该机制能移除已经不可见的项目数据，但它不会为新增授权项目自动回填。成员记录 role 更新没有独立 updatedAt/revision；静态上也无法由 joinedAt可靠表达后续角色变化。本轮历史探针证明新增项目未回填，未单独验证离开重入/角色变更。

建议 ACL 变化返回按项目授权增删事件或 `requiresSnapshot` 集合；新增/重新授权项目执行局部完整快照后再提交 cursor；撤权按同一权限版本原子清理相关实体；成员角色变更需可增量观察的 ACL revision。验收已有 cursor 的用户加入历史项目、退出重入、项目角色变化和撤权。

## 游标和 ACL 协议需要明确的决策

1. 每轮快照的 `upperBound` 如何固定，是否由数据库一致性快照提供；API 不应让多个实体各读一个漂移视图后声称一致。
2. 分页键需稳定复合排序，游标需能续页并表达所有实体/墓碑完成；时间相同不能靠 `gt` 丢边界记录。
3. 授权变化应是独立版本/事件，而不仅是 projectIds+permissions 哈希；新增授权做局部 backfill，撤权必须覆盖实体、附件和本地缓存。
4. 若仍以业务 updatedAt 作为增量日志，需解决“提交晚于 cursor 但时间戳早于 cursor”的窗口；数据库 sequence 也须处理事务提交乱序。
5. 部分成功、分页中断、权限版本变化时的 checkpoint 提交条件和客户端重试语义需协议化。

## 结论与边界

B04 `SUPPORTED/P1`；B07 `SUPPORTED/P1`；B08 `SUPPORTED/P2`；新确认发现0。当前历史证据分别是任务权限差异、3001条上限截断和新增项目无历史回填；不声称本轮刚运行。未做受控DB提交交错、超过上限墓碑测试、真实多设备/浏览器拉取或权限撤销E2E。R05 COMPLETE 表示源码与证据审阅完成，不表示同步已修复/验收。
