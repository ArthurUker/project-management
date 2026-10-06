# R09 · 任务与汇报并发、提交快照

状态：COMPLETE_WITH_PENDING。HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`，基线相同。本包只审阅任务 HTTP 写入、汇报保存/提交/审核/驳回、共享命令及回执边界；未运行测试、未重跑历史探针、未改业务代码。

## 结论摘要

- **B10 · SUPPORTED / P1**：汇报提交先在事务外读取完整 report 快照，校验闭包捕获该对象；事务内 `submitReport` 依据捕获的正文创建版本，再以仅含 `id` 的无条件 update 标记 `SUBMITTED`。历史受控交错仍与当前代码顺序一致。提交幂等 receipt 与版本/状态/严格审计在单次 `withIdempotency` 事务内，但该事务不重读/锁定/比较原 report 修订，因此事务原子性本身没有消除提交前并发保存导致的快照陈旧窗口。
- **B16 · SUPPORTED / P2**：在线 PUT 接口读取任务后调用 task commands 时没有传 `cas`；helper 因而走无条件 `task.update`。状态 PATCH 直接 update，也不接受 revision。历史以过期 `expectedUpdatedAt` 覆盖的证据与当前路径一致。
- 未确认新增缺陷。审核批准/驳回和状态 PATCH 都是在先读后无条件更新且审计独立写；当前静态证据确认无 CAS/事务边界，但没有独立受控交错、特定并发影响复现或足以拆成新 ID 的影响证据，本包不新增发现。任务创建、删除和多命令组合在矩阵列明。

## 状态 / 修订 / 事务矩阵

| 操作/入口 | 来源状态与权限/DTO | 修订/CAS | 业务及审计/receipt 事务 | 结论与边界 |
|---|---|---|---|---|
| 汇报 POST 创建或命中同周期草稿 | `reports.create` + 项目 write；白名单 projectId/type/periodKey/month/content；已存在时额外要求 update 权限、作者/项目归属；已提交/已审阅锁定；草稿/NEEDS_REVISION可更新 | 新版客户端需要 expectedUpdatedAt；已有稿用 `updateMany(id, expectedUpdatedAt ?? validate时current.updatedAt)`；同周期不存在时 upsert，无 report 行 revision 谓词 | `withIdempotency` 事务包 validate、内容 upsert/update、严格审计与 receipt | 幂等及审计原子；使用服务端 validate 读版本作为旧客户端 CAS 的静态顺序。 |
| 汇报 PUT 保存 | 必须存在且未删除；`reports.update`、项目 write、作者及可写状态校验；白名单 content/type/period | 可选 expectedUpdatedAt；声明 modern contract 时必须提供；新客户端将其传 `saveReportDraft` CAS；旧客户端草稿兼容可无 CAS，helper 走无条件 update | helper 位于 `withIdempotency` 事务中；receipt key 可选，无 key 仍有业务/严格审计事务 | 有基线路径有 CAS；旧客户端兼容路径明确无 CAS且审计留痕。 |
| 汇报 POST submit | 存在且未删；`reports.submit`、项目 write、作者本人；validate 仅拒 REVIEWED；SUBMITTED/NEEDS_REVISION没有来源状态拒绝 | **无 expected revision / 状态谓词**。路由先查 report；`submitReport` 按捕获的 `report.content` 复制版本，随后 `update where id` 只设 SUBMITTED | versions + status + strict audit + idempotency receipt 同在 helper transaction；路由初始读取和事务不共享锁/CAS | B10仍SUPPORTED。换新 key 可再次对 SUBMITTED 执行，重复提交状态并未阻止；版本号按事务内 `findFirst max + 1`。 |
| 汇报 approve/reject | 必须初始查得 SUBMITTED；不可审批自己；`reports.review` + 项目 transition；reject 要 note | 读状态之后 `report.update(where id)` 无状态/revision条件 | report update后在事务外 `writeAudit`；无幂等receipt、无显式事务 | 静态确认保护形式；未新增发现：无竞态受控证据，本包不推断实际并发结果。 |
| 任务 PUT 更新 | 任务先查；`tasks.update` + 项目 write；字段白名单；状态变化需 change_status/transition，指派需 assign；混合操作由一个 Prisma transaction 执行 | `taskCommands` 的三个函数都可接受 cas，但 route 调用只传 actor/access/task/fields/status/assignee，不传 cas；无 expectedUpdatedAt DTO 解析/校验 | fields/status/assignment 操作同一事务 all-or-none；事务结束后普通 `writeAudit` | B16仍SUPPORTED。组合事务避免部分业务写，不等于并发 CAS；审计不是同事务。 |
| 任务 PATCH status | 要求 change_status + transition；服务端派生 completedAt/progressPercent/startedAt | 直接 update where id，无客户端基线及旧状态谓词 | update 后事务外普通 writeAudit | 只确认代码边界；不将此静态发现单列为新发现。 |
| 任务创建 | tasks.create + 项目 write；字段白名单、phase 同项目；创建后写普通 audit | 新资源，无基线 | task.create 与 audit 分离 | 失败/审计故障原子性未在本包验证；不属 B16。 |
| 任务删除 | tasks.delete + 项目 write；收集后代、批量写 deletedAt；再普通 audit | 无版本条件 | 软删与 audit 分离 | 版本/级联正确性不在 B16，本包不扩展。 |

## B10 · P1 · SUPPORTED · 汇报提交版本快照可能落后于最终正文

**入口与调用链：** `POST /api/reports/:id/submit` → route 在 `reports.js:391` 通过根 Prisma 读取 report → 在路由外完成项目/作者授权 → `withIdempotency` 做 receipt lookup/新命令 transaction（`399-414`）→ `submitReport(tx,{actor,report})`（`416`）→ `reportCommands.ts:147-165` 查版本号、从传入 report 的 content 建 ReportVersion，再按 id 无条件更新状态为 SUBMITTED → 同事务 strict audit、receipt 完成。

**触发前提与证据：** 并发草稿保存恰好发生在 route `findUnique` 返回之后、submit 事务内版本创建之前。历史隔离 PostgreSQL 受控交错 `backend-results.json#B10_REPORT_SUBMIT_STALE_SNAPSHOT` 与 `verify-backend.mjs:175-197` 记录：提交读取后注入并发正文更新，最后正文为 `concurrent-save`，提交版本为 `before`，response 200；新 idempotency key 再提交已 SUBMITTED 报告仍 200。它是历史复现，不是本轮执行。

**当前代码核对：** route 仍将事务外 report 对象传入命令；命令只用该对象 `id/content` 建快照，随后 update 条件只含 id。route validate 只拒 `REVIEWED`，不要求 `DRAFT`/`NEEDS_REVISION`，亦未比较 updatedAt。版本/状态/严格审计/receipt 同事务可避免这些写之间半提交，但并未使被捕获的正文与当前行修订一致。

**已有保护/反证：** 幂等 helper 在有 key 时按 actor/command/resource/key/payloadHash 处理重试；成功 receipt 和版本/状态/严格审计处于同一事务。相同 key 重试回放首次响应；不同 key 不受此保护。报告保存端支持 updatedAt CAS，但提交端没有接收保存基线或使用 CAS。不能将“存在幂等回执”解释成“提交快照并发安全”。

**已证明影响：** 历史受控测试观察到审批版本正文与 report 当前正文不同，且已提交状态下用另一个幂等 key 仍可再次成功提交。证据不说明真实用户出现频率，不证明法规审计已实际受损；P1维持历史级别。

**建议与验收：** 将提交实现改为共享事务命令：事务内按允许来源状态及 expected revision 条件读取/锁定；版本内容取同一成功 CAS 修订，状态条件更新影响行数必须为1；审核/驳回亦使用状态+revision条件并将关键审计置于同一事务。验收控制 save-after-read / submit 交错时只能保存先提交或明确 409；快照正文、修订号和最终状态一致；对 SUBMITTED 使用新 key 提交按业务状态拒绝；版本唯一性并发无重复/缺号。这里只是建议，未实施/未验收。

## B16 · P2 · SUPPORTED · 在线任务修改未应用客户端并发基线

**入口与调用链：** `PUT /api/tasks/:id`（`tasks.js:231-245`）→ 白名单解析、预读取 task → 拆出字段/status/assignee → Prisma transaction 内分别调用 `updateTaskFields`、`changeTaskStatus`、`assignTask`（`284-295`）→ route 在事务后 writeAudit。taskCommands 虽支持 `cas`，内部 `writeWithCas` 只有收到该参数才走 `updateMany(where id + cas)`；否则直接 `update(where id)`（`taskCommands.ts:61-74,92-123`）。当前 HTTP 三个调用都未传 cas。状态 PATCH (`tasks.js:316-347`) 则绕过命令，直接 `update(where id)`。

**触发前提与证据：** 客户端读取任务版本后，其他写入已推进记录，首客户端再 PUT 携带旧 `expectedUpdatedAt`。历史隔离 PostgreSQL 探针 `backend-results.json#B16_TASK_HTTP_IGNORES_BASELINE` / `verify-backend.mjs:259-263` 发送旧 timestamp，观测 HTTP 200 且 title 被 stale-overwrite。当前 PUT 白名单不接收 expectedUpdatedAt，未见解析/校验/传递；旧证据与源码一致。

**已有保护/反证：** 状态/指派有专用 permission 与项目能力校验；PUT 混合普通字段、状态、指派时包在同一 Prisma transaction，可防业务子命令间部分提交。共享命令内部具备 CAS 能力，sync route 也会按已有服务端 timestamp 对 updateMany 做 CAS（R06）；然而在线 HTTP 不把客户端基线传给命令。任务 status PATCH 还直接 update，未使用命令 CAS。

**已证明影响：** 旧基线请求可以覆盖当前任务字段且得到200，导致旧编辑静默取代较新值，客户端收不到冲突。历史测试对 PUT/title 有具体观测；其他字段、状态 PATCH 与指派的并发结果是由代码调用路径推得，没有逐字段探针。

**建议与验收：** 明确 revision DTO（优先单调整数 version，或一致精度的 updatedAt）；modern client 必须提交基线；所有字段/状态/指派命令在事务中将基线纳入条件更新、影响0行返回409及当前 revision。状态端点也走命令且校验来源状态。验收两个客户端相同基线：首写成功、次写409、最新值不被覆盖；字段与状态/指派并发都覆盖；兼容旧客户端策略有期限、审计标记和移除验收。

## 汇报版本不变量与共享命令边界

预期不变量应是：一个提交版本只对应一个成功提交的 report 修订；状态转为 SUBMITTED 与版本快照取自同一事务内 revision；同一 idempotency key 同 payload 才回放；状态/修订不允许 stale command 覆盖。当前代码只满足版本、状态、严格审计和 receipt 同事务提交；**尚不满足提交读取与该事务写入间的修订绑定**。保存草稿共享 `saveReportDraft` 命令，HTTP和sync复用且都能传CAS，但客户端基线策略由 HTTP route执行、sync采用服务端读到的时间戳并非同一 DTO 契约。提交命令没有 sync 入口（R06确认）。任务字段/状态/指派共享 taskCommands，HTTP和sync复用业务命令，但HTTP调用没有客户端 CAS，sync路径使用其 observed timestamp CAS；同一 helper 不等于入口修订语义一致。

## 历史 ID 裁定

- B10: `SUPPORTED`, P1；提交快照陈旧的历史受控交错仍对应当前静态顺序。
- B16: `SUPPORTED`, P2；HTTP PUT 接受旧 expectedUpdatedAt 的历史探针仍对应当前 route 不传 cas。
- 新发现：无。审核/驳回及状态端点的缺少显式CAS/事务记录为审阅边界，不扩张为未证实影响。

## 未覆盖与后续验证

- 未运行动态验证、受控交错、故障注入、Prisma/PostgreSQL事务隔离实验；数据库默认隔离与 concurrent version-number 行为不从静态源推断。
- 未复现 B10、B16；本包引用历史隔离运行证据，不能视为当前运行验收。
- 未遍历所有客户端版本/任务字段/状态转换需求；现代客户端如何产生且精确保留 expectedUpdatedAt 需端到端验收。
- 未验证 reviewer 双重并发操作的实际最终写入、audit 故障行为及版本序号竞争；静态矩阵指出入口差异但不建立新问题。
- 未审前端任务编辑并发处理、报告页面重提 UX、数据库实际唯一约束和线上运行日志。

满足任务卡静态路径矩阵、历史ID、共享命令边界要求；上述数据库语义与当前动态复现待后续专项验证，故包为 COMPLETE_WITH_PENDING。SUPPORTED仅指证据支持，不表示缺陷已修复或系统验收通过。
