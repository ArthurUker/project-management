# R08：离线出队、冲突和批量恢复

- **状态：COMPLETE**
- **审计基线 / 当前 HEAD：** `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`
- **范围：** `engine.ts` 上行结果处理、`idb.ts` outbox/deadLetters 持久化、前端 sync push DTO、后端 `/sync/push` 的请求限制、逐条处理与回执。
- **方法：** 当前源码定向审阅 + 继承历史真实引擎/fake-indexeddb/注入 transport 结果；未运行动态测试、未修改业务代码。

## 三类结果及持久化顺序

| 服务端结果 | 客户端动作顺序 | IndexedDB 原子性 | 故障后的可恢复副本 | 结论 |
|---|---|---|---|---|
| `applied` | 收到响应后逐条 `outboxDelete(clientMutationId)`；循环完成后再更新冲突快照、内存状态 | outbox 删除是独立事务；服务端实体写入与 syncMutation 回执亦非同一事务 | 删除失败时队列通常仍在；删除成功表示服务端已回 applied。服务端实体已写而回执未写的故障窗另见“服务端确认与回执” | 成功确认后删队列合理，但批次不是整体原子；按回包逐条提交 |
| `conflict` | **先**独立 `outboxDelete`；把原本地 payload 暂存 `nextConflicts`；本轮全部结果处理后一次 `kvSet(conflictKey, merged)` | 删除与 conflict kv 写入不在同一事务 | 删除后到最终 kvSet 成功前，outbox 与旧 conflict 快照均无新 payload。配额/事务失败/进程中断可丢失唯一恢复副本 | F02 仍支持 / P1；历史探针证实存储失败时 outbox=0、冲突=0 |
| `rejected` | 有主体且能匹配本地行时调用 `deadLetterMove`；在 `deadLetters` 写入和 `outbox` 删除的同一事务提交后加入本轮内存拒绝结果 | 是，覆盖两个 object store；等待事务 complete | 事务失败会 abort 并拒绝，原 outbox 保留；后续 sync catch 报错 | 当前代码比冲突路径完整；注意 unmatched 响应行走 `outboxDelete`，见边界 |

共同收尾：全部结果处理后，将 `state.conflicts` 与本轮冲突合并，按发起主体写入一个 kv key；此写入不是每个 conflict 的事务性迁移。session generation 在每条回包处理前及最终写入前检查，防止旧账号回包污染新会话，但不弥补同主体的先删后存窗口。拒绝结果则先事务移动，最终从主体索引读取 dead-letter 列表更新内存。

## F02：冲突先出队后持久化

- **裁定：SUPPORTED / P1；保留历史 ID，无修订。**
- **入口/前提：** `syncNow()` 推送队列并收到 `status=conflict`；本地 outbox 删除成功，后续批量 conflict snapshot 写入失败或进程中断。
- **当前调用链：** `engine.ts:264-279` 读取整个 outbox 并推送 → `engine.ts:284-304` 先删除冲突项，再仅在内存构造包含原 payload 的 ConflictRecord → `engine.ts:334-340` 末尾才 `kvSet` conflict 快照。`idb.ts:115-118` 证明 outbox 删除独立读写事务；kvSet 走另一 store/事务 (`idb.ts:82-86`)。两者之间没有原子事务。
- **历史证据 H：** `offline-results.json#F02_CONFLICT_DELETED_BEFORE_PERSISTENCE`：注入冲突存储失败后观测 `outboxAfter=0`、`persistedConflicts=0`、错误 `AUDIT_INJECTED_CONFLICT_STORAGE_FAILURE`。历史运行是打包的真实前端引擎 + fake-indexeddb + 注入 transport，不是浏览器 E2E。
- **已检查保护/反证：** applied 删除对应成功写入；rejected 使用 `deadLetterMove` 跨 store 同事务迁移；conflict record 确实包含原 change 数据；会话代次阻止陈旧主体回包写入。上述均未覆盖冲突 outbox 删除与冲突 kv 写入之间的失败窗口。
- **影响边界：** 对已返回 conflict、但本地冲突存储未完成的操作，服务器表示未接受该变更；若随后本地写失败/中断，原 outbox 已删除且本地冲突快照没有新项，无法通过当前持久层恢复该本地 payload。动态证据仅覆盖注入的后续存储失败。
- **建议：** 以 deadLetterMove 的方式实现 conflictMove：同一 IndexedDB readwrite transaction 在 conflicts store (宜独立 object store 或明确 schema) 写入冲突记录并从 outbox 删除；或先可靠写冲突再删除并可安全幂等重入。不得把整份 kv snapshot 的替换当成迁移事务。
- **验收：** 对冲突写入/出队各失败点注入事务失败并重启；任一失败后原 payload 至少存在于 outbox 或 conflict store 之一；成功后仅一份待处置 conflict，重复回包不丢不重复。

## F04：超过服务器单批 500 条后队列无法推进

- **裁定：SUPPORTED / P2；保留历史 ID，无修订。**
- **入口/前提：** outbox 行数大于 500 且触发 `syncNow()`。
- **当前调用链：** `engine.ts:264-279` 取全库队列并一次 `transport.push({changes: outbox.map(...)})`，没有 slice/chunk；endpoint `sync.ts:21-28,65-67` 直接将完整 payload POST 到 `/sync/push`；服务端 `sync.js:340-346` 在逐项处理前硬拒绝 `changes.length > 500`。异常走 engine catch，队列没有收到结果回包，不会逐项删除。
- **历史证据 H：** `offline-results.json#F04_OUTBOX_NOT_CHUNKED_TO_SERVER_LIMIT`：501 条全部成为一个请求，模拟服务器 500 上限后 `queueAfter=501`，错误 `server limit: 500 changes`。该实验继承历史注入 transport 的本地上限，不是完整网络端到端，也未测 1001 条。
- **已检查保护/反证：** 服务端确实限制为 500；幂等 ID 支持已处理条目重试；客户端网络异常保留队列。这避免超限请求造成客户端清空，但不产生推进路径。当前没有按条数分批，也没有请求字节大小限制/压缩或队列优先级。
- **影响边界：** 当队列达到 501 条，完整请求在服务端入口被拒，原队列不减少；后续完整重试会重复触发同一限制。501 是代码条件/历史探针命中，不表示所有部署网关均允许相同请求字节数。
- **建议：** 定义客户端与服务端共同的最大条数和请求字节预算，按依赖顺序切片发送；每批只在收到并验证对应 mutationId 全量回包后持久化确认，并让后批等待前批所需父/引用项成功。对缺项、重复项、未知状态、超时保留未确认项并用幂等 ID 重试。
- **验收：** 501、1001 条队列逐批前进；批 1 成功批 2 失败时只保留未确认及依赖未满足项；请求字节上限前主动切批；重启后不重发已确认 applied，也不丢 conflict/rejected；任务/phase/member 等父子引用顺序保持协议所需顺序。

## 事务、重试、依赖与恢复边界

- **客户端事务：** `deadLetterMove` 在 `idb.ts:125-148` 对 `deadLetters` 与 `outbox` 同事务，并等待 transaction complete；冲突迁移却跨独立 outbox 删除与 kv 写入。单条 outbox `put/delete` 通过 `run()` 等到 readwrite transaction complete；错误 handler 主要挂 request.onerror，transaction abort 的统一封装覆盖情况本轮未做故障注入。
- **队列次序/依赖：** `outboxAll()` 是 object store `getAll()`，没有显式 `createdAt` 排序；存储主键是 `clientMutationId`，不是依赖序号。`SyncChange` DTO 仅有 mutation id/entity/op/id/data/baseUpdatedAt，没有 dependsOn/sequence 字段。服务端按输入 `changes` 顺序 for-loop 逐条处理，因此父实体与子实体依赖无协议表达/排序保障。对尚不存在父项的子项，服务端会按 `projectId`/实体存在状态判定并可能 rejected；实际全部实体组合的依赖失败未在历史复现覆盖。
- **部分回包：** 前端遍历服务端返回的 `results`，按每条回包独立处理；没有先验证回包涵盖本次请求全部 mutation IDs、无重复 IDs、状态属于三类。缺失结果对应 outbox 保留；重复回包可能重复执行本地删除/冲突收集；未知 status 进入 rejected 分支并由 dead-letter 逻辑处理。响应结构类型有 status union，但运行时没有校验。
- **超时重试/幂等：** transport 异常无 results 时 catch 不删除队列，重试复用原 mutation ID；服务端只回放已持久化 `applied` receipt，失败回执重新判定，能支持权限/基线改变后同 ID 重试。服务端逐条业务操作与其后的 `syncMutation.upsert` 是分开的 Prisma 调用（`sync.js:396-541,543-568`），并非同一 transaction；若业务写已提交而 receipt upsert 失败，响应可能失败且客户端保留行，再重试时服务端不一定能凭 receipt 回放原结果。该故障窗口由源码结构确认，实际故障/副作用范围未运行验证，本包不裁为新旧缺陷。
- **恢复规则：** 当前 rejected 有主体的迁移原子且 restart 会恢复 deadLetters（R07 已审主体 hydrate）；conflict 是独立 kv 快照恢复，但受 F02 先删后存缺陷影响；applied 只在收到逐条结果后出队。501+ 队列及任何单请求被大小限制拒绝时没有自动推进机制。

## 覆盖、限制与下一步

- 本轮未跑动态测试；旧结果的历史探针足以确认 F02/F04，源码与 R07 对 `engine.ts`、`idb.ts` 摘要相符。
- 没有验证生产代理/应用服务器的 body byte limit、网络断连时服务端实际提交进度、真实浏览器 crash/restart、数据库业务写与 receipt 的故障注入、所有实体依赖图。它们列为验收/设计验证，不作为已观察的新缺陷。
- 未新增发现。服务端每条 mutation 业务操作与 receipt 写入未原子化记录为协议恢复风险/待验证项，不改变旧发现计数。
- 建议验证顺序：先将 conflict 入队迁移变成可恢复原子状态；其次实现有字节预算/依赖顺序的分批；随后对回包全集校验和服务端写入+幂等回执原子性设计补故障点验收。
