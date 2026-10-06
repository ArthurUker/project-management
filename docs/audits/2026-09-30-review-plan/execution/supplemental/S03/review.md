# S03 · 同步协议、并发与跨入口语义补审

状态：`COMPLETE_WITH_PENDING`。HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本包在 R05/R06/R09/R02 已有证据基础上，定向检查同步拉取游标、上行 CAS/回执、任务和汇报在线/离线入口。未改业务代码，未运行测试、浏览器或数据库实验；历史证据仅按原层次继承。

## 判定摘要

- 沿用 B07：分页上限越界会丢行并推进游标，已有历史数据库探针；本次另将“写事务晚于拉取游标提交”保留为尚未复现的并发语义疑点，不扩张成已证的新发现。
- 沿用 B06：单条上行的业务写与 `SyncMutation` 回执分离，已有历史 task 故障注入；批次逐条处理，不把整批原子性设成默认合同。
- 沿用 B16：任务 HTTP PUT/PATCH 未传客户端 revision，而同步离线上行可带 `baseUpdatedAt`；前端任务页面确实填入本地 `updatedAt`。HTTP 状态 PATCH 仍无客户端基线，故在线/离线并发保护不等价。这属于 B16 的入口覆盖补充，不另编号。
- 同步删除分支明确不执行 `baseUpdatedAt` 比较，也不在 `update` 的 where 条件中包含读到的 revision。未找到旧客户端基于 stale delete 成功的证据，记录为待受控验证，不推断实际误删。
- 同键并发竞争、回执保留清理、HTTP 500 后客户端恢复合同尚未被本轮实验确认。现有代码可定位验证目标，详见协议问题与开放项。
- 新增发现：0。R02 的 N-R02-02 当前 access JWT 未即时失效是源码确认；其可接受失效时限属 S01 的策略问题，本包不重复定性。

## 拉取边界与时间顺序

`GET /api/sync/init` 先读可见项目，然后每个实体分别按 `timestamp > since` 查询活动记录（每类最多 3000）与 tombstone（最多 5000），查询只按时间升序；全部查询完成后才生成 `serverTime` 并将其作为 cursor 返回。客户端在 `applyPull` 完成 upsert、tombstone、ACL 清理后保存该 cursor。源码位置：`rdpms-system/backend/src/routes/sync.js:271-327`、`rdpms-system/frontend/src/offline/engine.ts:189-239`。

| 场景 | 当前可证事实 | 裁定 |
|---|---|---|
| 单次查询超过上限 | 没有续页/hasMore，客户端仍保存响应时间 cursor | B07 既有历史 3001 行复现支持；不重复编号 |
| 相同时间戳 / 稳定排序 | 仅按 timestamp 排序，过滤为严格 `gt`，无 id 次级键 | 数据分布与边界影响未实测；补充稳定 keyset/snapshot 协议问题 |
| 最后实体查询后写入 | cursor 在实体查询后生成；代码不是一个跨实体固定快照 | 写入是否会落在下一轮之外，取决于更新时间生成与事务提交可见次序；静态顺序不能单独证明具体丢失 |
| 已开始的写事务在 cursor 后提交 | 事务写入行的 updatedAt 可能早于其提交可见时点；下一次查询仍以较晚 cursor 做 `gt` | **PLANNED_NOT_RUN**。需 DB 屏障控制，不假设时间戳等同提交顺序 |
| 墓碑分页 | tombstone 查询最多 5000、无 continuation | 上限风险同属 B07；本次没有重跑墓碑超限 |

### 最小确定性交错（未运行）

使用临时隔离 PostgreSQL 和合成记录，两连接、显式 barrier，不用随机 sleep：连接 W 在事务内更新记录（确认生成时间字段后保持未提交）；连接 R 请求一次 init 并保存返回 cursor；释放 W 提交；随后以该 cursor 再请求 init。逐项记录更新行的数据库 updatedAt、R 的 serverTime、提交顺序、第二次 payload。若字段时间早于 cursor 且第二轮不返回，即实证迟提交窗口；若 DB/ORM 生成时序令条件不可达，应记录实际语义并重设受控点，不以失败的构造宣称窗口不存在。完成后删除唯一合成数据并保存 SQL、日志、清理证据。实验前需确认隔离 DB 所有权与可用性。

## 上行、回执与竞争

### 现有确定调用链

`POST /api/sync/push` 先读取可见项目并按 `clientMutationId` 预取全局回执；成功 `applied` 命中会在单条实体读取和当前动作授权前回放（`sync.js:340-422`，既有 B05）。新 mutation 读取实体、校验可见项目与实体动作，然后可选比较客户端 `baseUpdatedAt`；既有记录更新以服务端读到的时间戳形成 CAS（`424-427,457-515`）。业务写完成后另行 upsert receipt（`543-567`；既有 B06）。客户端收到 per-item `applied` 后删除 outbox，`conflict` 时删除并转入冲突队列（`engine.ts:264-329`）。

### 同键并发与恢复边界

两并发请求均可在读取既有回执 map 时未见成功 receipt。实体 CAS 对一般现有记录可阻止同一旧 revision 的双写，但业务写与回执仍分离；输家记录 conflict 与胜者写 applied 的回执更新次序可能影响最终保留结果。创建资源、删除、无基线请求及不同实体/载荷碰撞的确定 DB 最终状态不能从顺序代码独立推出。没有运行双请求屏障实验，因此不追加确认发现。

HTTP 500 后，客户端现有 `syncNow` 只有在收到响应并逐条处理结果后才移除 outbox。请求抛错时进入 catch/错误状态，未见本地凭响应结果清队列；下一次可能原 mutationId 重发。但服务端可能已写业务而未写 receipt（B06），当前状态查询只返回计数，不提供按 mutationId 查询 outcome 的协议（`sync.js:546-588`；`engine.ts:268-343`；`GET /sync/status` 只给计数，`sync.js:602-614`）。该组合的具体恢复结果与服务端故障点有关，历史 task 故障已证明业务已提交、receipt 缺失的歧义；本次不重跑。

`SyncMutation` 是否有清理机制：schema 保存状态/结果但无清理逻辑在 push 路径；针对 backend/src 的定向搜索未找到 SyncMutation 删除调用。不能据此断言部署中不存在外部清理任务，需检查候选部署配置/运维作业。HTTP `MutationReceipt` 有 expiresAt 标记，receipts.js 注释明确清理任务不在当前范围；超期回执读取行为及任务部署状态未在本包确认。

## 跨入口语义矩阵

| 操作 | 在线 HTTP | 离线同步 | 语义差异/既有裁定 |
|---|---|---|---|
| 任务普通字段编辑 | PUT `tasks.js:231-312` 调用共享 task commands，但不读取/传递 expected revision | task mutation 传 `baseUpdatedAt`；push 对现有记录做预比较和首次写 CAS（`sync.js:424-515`） | B16：HTTP 可忽略旧基线；离线在客户端提供基线时可报告冲突。历史 stale HTTP 覆盖证据保留；前端 HTTP 与离线是否对所有版本都发基线尚未验证 |
| 任务状态变更 | 页面在线走 PATCH `tasks.js:315-347`，直接更新且没有客户端 revision；状态派生值在 route 内写入 | 离线任务状态上行经 changeTaskStatus command，复用 status side effects，cas 由 task mutation 首次写消费 | 无论是否复用命令，客户端 revision 合同不同；不另建发现，状态合法边集合及产品规则归 S01 |
| 汇报草稿保存 | PUT 支持 modern client `expectedUpdatedAt`；调用 `saveReportDraft` CAS（`reports.js:303-370`） | push 对已存在 report 构造服务端读取时的 CAS，并调用同一 `saveReportDraft`（`sync.js:424-463`） | 共享写命令但基线来源/缺失策略不同；离线上行 DTO 的 baseUpdatedAt 可选，离线 stale precheck 后亦由 CAS 防窄竞态 |
| 汇报提交 | HTTP POST submit 在 route 外读取 report 后，在命令事务里按捕获内容创建版本并更新状态；R09/B10 | sync registry 不暴露 submit 操作；push 字段不含 status/version | 不存在同语义离线提交入口；B10 快照 revision 绑定缺口维持原裁定 |
| 任务删除 | 在线 DELETE 使用任务删除路由及项目范围后代逻辑（R03/R09） | delete 在 `sync.js:436-448` 更新 tombstone；跳过 stale `baseUpdatedAt` 比较，update where 仅 id | 删除 CAS/重复删除结果未做隔离验证；不把 HTTP 删除覆盖到同步删除结论 |
| 幂等/回执 | reports 使用 actor/command/resource/key/payload hash 的 MutationReceipt；任务 HTTP 不等价地统一使用它（R06） | 全局 clientMutationId SyncMutation；查回执早于资源动作校验，业务与 receipt 分开提交 | B05/B06 保留；不能概括成所有 HTTP 都比 sync 原子 |

前端任务两个入口实际填入当前 task 的 `updatedAt`：Tasks 页面离线状态操作 `frontend/src/pages/Tasks.tsx:484-500`，Kanban 离线状态操作 `frontend/src/components/KanbanBoard.tsx:516-532`。但在线分支调用 `taskAPI.updateStatus`，没有携带这两个任务对象的基线；这与 B16 的 HTTP DTO 缺口一致。HTTP 任务编辑 modal 调用 `taskAPI.update`，本轮不声称所有调用端版本均已枚举。

其余既有待决项不在本包伪装成结论：R06-N01 的 managerId 是否必须同步建立有效 MANAGER 成员关系交 S01 决策；B10 的报告版本号/隔离级别竞争交隔离 DB 验证、复提来源状态交业务规则；B16 的全部任务客户端版本兼容和字段级竞争矩阵仍待实施验收。对应引用登记在 `open-items.json`。

## 历史发现与证据层级

| ID | 本包结果 | 证据与边界 |
|---|---|---|
| B07 | `SUPPORTED / P1` 不变 | 继承 `backend-results.json#B07_SYNC_PULL_CAP_LOSES_ROWS` 的 3001 upsert 历史隔离探针；当前 `sync.js:302-327` 仍没有分页。迟提交交错只有静态风险/待验证，不改旧 ID 裁定 |
| B05 | `SUPPORTED / P2` 不变 | 继承 R06 的已知 mutationId 回执跨主体/载荷回放探针；当前 `sync.js:362-421` 顺序仍相符 |
| B06 | `SUPPORTED / P1` 不变 | 继承 R06 task 写后回执故障注入；当前 `sync.js:457-567` 仍先业务写、后回执。整批 atomicity 未被要求/验证 |
| B16 | `SUPPORTED / P2` 不变 | 继承历史 stale HTTP task PUT 被覆盖探针；本包验证前端离线传基线而在线调用缺基线，扩展路径证据但不另计 |
| B10 | `SUPPORTED / P1` 不变 | 继承 R09 汇报提交 snapshot stale 受控交错；本包确认 sync 没有 submit 命令，不重新复现 |
| N-R02-02 | 源码状态事实沿用，时限待 S01 策略 | 认证中间件不消费 passwordChangedAt；本包不重复登记该发现，也不替代安全政策决定 |

本包级 `SUPPORTED` 仅表示历史和/或当前源码支持对应命题；`COMPLETE_WITH_PENDING` 表示本包静态范围已完成而 DB 竞争语义仍待补证。未执行数据库实验、浏览器实验、测试或故障注入；没有运行证据可作为当前动态验收。
