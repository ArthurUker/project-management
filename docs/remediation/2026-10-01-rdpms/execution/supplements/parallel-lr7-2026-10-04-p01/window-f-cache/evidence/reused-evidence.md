# 复用证据（REUSED_VERIFIED_EVIDENCE）

来源：`RP13-T02`，运行 `2026-10-02-continuous-rework`。
本窗口**未重跑**这些证据，仅引用其结论支撑 `T-RP-04`/`T-RP-12` 待批准方案。

## 1. WATERMARK_ADR_DRAFT.md（路径见下）

`docs/remediation/2026-10-01-rdpms/execution/RP13/RP13-T02/evidence/WATERMARK_ADR_DRAFT.md`

关键结论（原文要点，非本轮改写）：

- 当前 `updatedAt > since` 拉取无法建立提交顺序：一个事务可分配早于 `/sync/init` 返回时间戳的 `updatedAt`，在该拉取提交后仍未关闭，随后提交；下一次严格大于请求便永久排除该行。更大的时间窗、页上限、`MAX(id)` 或普通 sequence 分配本身不能证明所有更小值已提交。
- 所需不变量：一旦客户端 checkpoint `C` 被确认，每个合格的已提交源变更要么体现在透过 `C` 的已完成拉取中，要么有持久更后位置供后续拉取返回；页游标仅在固定窗口每页本地应用后才前进；每页校验授权，ACL 丢失清除新越权本地行而不删 actor 的 outbox。
- 候选选项 3：事务 outbox + 提交可见发布序列（单一发布态行锁持到提交），是**测试候选**，非批准架构；选项 1（时间窗+重叠）无硬最大延迟边界、不推荐；选项 2（max id）可跳迟到低 id；选项 4（WAL/CDC LSN）无当前 CDC 服务/owner 证据。
- 明确要求：每一写路径（HTTP/sync push/模板聚合/批量导入/注册报告命令/备份恢复/级联/后台任务/管理脚本）必须同事务写 outbox 或显式 epoch reset 或按批准规则禁用；未知生产者覆盖是发布阻断项。
- **决定**：未选任何选项；选项 3 仅为测试候选；保持 `T-RP-04`、`T-RP-10`、`S03-OI-01` 打开；不签署 draft、不迁 schema、不建 publisher、不标记 B07 修复。

## 2. barrier-summary.json（attempt-02）

`docs/remediation/2026-10-01-rdpms/execution/RP13/RP13-T02/runs/2026-10-02-continuous-rework/evidence/attempt-02/barrier-summary.json`

- `unsafeSequenceCounterexample`：`allocatedSecondValue=2`，`checkpointMax=2`，`lateFirstValueCommittedAfterCut=1`，`rowsReturnedAboveCheckpoint=0` → 结果 **`PERMANENT_MISS_DEMONSTRATED`**（seq/MAX(id) 递增可永久漏行）。
- `candidateTransactionalBarrier`：`uncommittedSourceHiddenAtCut=[0,0]`，`nextPullAfterCommit="1|late|1|revision-1"`，`competingPublisherRows=["2|event-pub-a","3|event-pub-b"]`，`rollbackRowsAndState="0|0|3"` → 结果 **`PASS_FOR_CANDIDATE_SQL_MODEL_ONLY`**（仅候选 SQL 协议模型，非应用实现）。
- 局限（原文）：合成 SQL 协议模型，非应用实现；无生产方案被选/批准；无生产者覆盖、bootstrap/ACL/游标、restore epoch、客户端 IDB、publisher 崩溃恢复或保留证据。

## 3. owned-watermark-barrier.py

`docs/remediation/2026-10-01-rdpms/execution/RP13/RP13-T02/runs/2026-10-02-continuous-rework/evidence/owned-watermark-barrier.py`

- 自有 guard 库 `rdpms_test_rp13_exec_2d8708b2f5`，bind `127.0.0.1:63900`，`rdpms_test_*` 前缀（非 `rdpms`/共享/生产/历史固定审计库）。
- 模拟标记：`SIMULATED_CONTROL_ALL_SUBPROCESSES_STUBBED` 不适用（此为自有合成 SQL 模型，非 subprocess 桩）；其结果为候选 SQL 模型验证，不能当真实 DB/JWT/产品验收。

## 复用声明

- 报告 25/25、同步 12/12、字段 101/101 按最近独立复核 R（2026-10-04-codebuddy-lr6-closeout）及绑定 hash 复用；本轮未重跑。
- 本窗口 `T-RP-04`/`T-RP-12` barrier 相关结论**直接引用**上述 RP13-T02 证据，属 `REUSED_VERIFIED_EVIDENCE`，不伪称本轮新增运行。
