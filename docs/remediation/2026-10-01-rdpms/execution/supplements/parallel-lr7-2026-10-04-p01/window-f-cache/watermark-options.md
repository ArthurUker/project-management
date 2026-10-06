# T-RP-04 选项矩阵：提交可见水位与 bootstrap（待批准）

状态：`PROPOSED DRAFT — NOT APPROVED, NOT IMPLEMENTED`
关联：`RP08-T02`、`RP13-T02`、`RP13-T03`、`PC05`、`T-RP-10`
复用证据：`RP13-T02` `WATERMARK_ADR_DRAFT.md` 与 `attempt-02/barrier-summary.json`（见 `evidence/reused-evidence.md`）

> 本文件只整理**可审查选项**。未选任何生产方案；签名字段为空。不把局部 barrier / `seq` 递增当生产 safe-watermark 验收。不重跑 DB。

## 0. 当前实现事实（只读，来自 `evidence/source-facts.md`）

- 拉取用 `updatedAt > since AND updatedAt <= upperBound`，`upperBound=now()`（`sync.js` L353/L389/L486）。
- 无 source revision、无发布序列、无 outbox 参与读路径；页令牌仅绑定 `actorId`+`deviceId`+时间范围，无 `epoch`/`scope-version`（L315/L323–L347）。
- 前端 `cursor` 仅末页提交（engine.ts L266），ACL 变化清本地数据（L217–L236）。

## 1. 各选项：源修订 / 提交可见性 / 发布顺序

| 选项 | 源修订(source revision) | 提交可见性证明 | 发布顺序 | 当前状态 |
|------|------------------------|----------------|----------|----------|
| O1 时间戳+重叠窗 | 无（仅靠 `updatedAt`） | 无硬最大延迟边界则不安全 | 无 | 不推荐（ADR 选项1） |
| O2 `MAX(id)` / 自增 | 无 | 低 id 可晚提交被跳（永久漏） | id 分配序≠提交序 | 反例证明不安全 |
| O3 事务 outbox + 提交可见发布序列 | 每资源单调 source revision | 单发布态行锁持到提交，后序不抢先 | `publishedSequence` 单调 | 测试候选（ADR 选项3） |
| O4 WAL/CDC LSN | 由 LSN 隐含 | 需复制槽/保留/恢复生命周期 | LSN 顺序 | 无当前 CDC 证据 |

### O2 历史反例（来自 `barrier-summary.json`，REUSED）

`unsafeSequenceCounterexample`：`allocatedSecondValue=2`，`checkpointMax=2`，`lateFirstValueCommittedAfterCut=1`，`rowsReturnedAboveCheckpoint=0` → `PERMANENT_MISS_DEMONSTRATED`。即“MAX(id)/seq 递增”不能证明低值已提交，可作永久漏行反例，**不能**当 safe-watermark。

### O3 局部候选证明（来自 `barrier-summary.json`，REUSED，仅候选 SQL 模型）

`candidateTransactionalBarrier`：`uncommittedSourceHiddenAtCut=[0,0]`（未提交源在切点隐藏），`nextPullAfterCommit="1|late|1|revision-1"`（提交后下轮返回该精确源修订），`competingPublisherRows=["2|event-pub-a","3|event-pub-b"]`（竞争 publisher 序列 2、3 唯一），`rollbackRowsAndState="0|0|3"`（回滚丢弃分配与事件）→ `PASS_FOR_CANDIDATE_SQL_MODEL_ONLY`。**注意**：仅候选 SQL 协议模型，非应用实现，不能当真实 DB/产品验收。

## 2. snapshot 分页切点

- 切点须为**已提交快照**：bootstrap 建立 `snapshot cut` + 匹配 `cursor`；快照行带 source revision；切点之后事件重放，equal/重复 revision 忽略（ADR 候选设计 §）。
- 当前 `upperBound=now()` 不是提交顺序点：开放事务可在切点后提交并永久漏（见 §0/§1 O2）。
- 大分页：`SYNC_UPSERT_PAGE_SIZE=3000`、`SYNC_TOMBSTONE_PAGE_SIZE=5000`（`sync.js` L310–L311）；当前 `hasMore` 用 `take+1` 探测；O3 需 `ORDER BY publishedSequence, entity, id` 且游标含协议版本/epoch/授权版本/最后应用序列。

## 3. ACL 重查（撤权/角色变化）

- 当前每 `/init` 请求重算 `projectIds`（`sync.js` L404–L413），分页每页独立调用 ⇒ 每页重查 ACL；前端 `aclVersion` 变化即清本地不可见数据（engine.ts L217–L236）。
- O3 要求：每页校验授权；ACL 丢失清除新越权本地行，但**不删 actor 的 outbox**（保留待同步内容）；epoch/role 变化触发本地 purge 同时保留未发 owner payload。

## 4. epoch / reset / 游标过期

- 当前无 epoch 概念；页令牌无 scope-version（`sync.js` L323–L347）。
- O3 要求：游标绑定 `epoch`/`scope-version`；过期返回 `RESET_REQUIRED`，**保全本地 outbox / dead-letter**；`T-RP-10` 单独定义 restore epoch 与 stale cursor/session/outbox 处理（仍 `PROPOSED`）。
- 恢复仅在**批准 T-RP-10 语义**下增/改 dataset epoch；异 epoch 游标不能续，触发受控 resnapshot 且不擦 outbox 内容。

## 5. 局限与未决

- 候选 O3 的 producer coverage（HTTP/sync push/模板聚合/批量导入/注册报告/备份恢复/级联/后台任务/管理脚本）尚未逐路径稽核；未知覆盖是发布阻断项。
- 无 `T-RP-10` restore epoch、无 `T-RP-11` 预算/监控数值、无批准客户端/schema 兼容窗、无 publisher 服务生命周期证据。
- 局部 barrier / seq 递增**不能**当生产 safe-watermark。

## 6. 推荐（仍 PROPOSED）

- 推荐方向：以 O3（事务 outbox + 提交可见发布序列）为**待证据候选**，但需先满足 `S03-OI-01` 自有 PostgreSQL 双会话 barrier 证据、命名批准、producer coverage 与兼容窗。
- 在证据与批准到达前，不选生产方案、不迁 schema、不建 publisher、不激活 `RP13-T03`。
- 签名字段：`approvedBy=null`、`approvedAt=null`、`evidenceRef=null`。
