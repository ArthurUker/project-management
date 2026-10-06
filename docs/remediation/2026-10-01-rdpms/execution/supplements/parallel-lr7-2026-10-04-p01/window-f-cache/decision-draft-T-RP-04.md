# 决策草案：T-RP-04 提交可见水位和 bootstrap

状态：`PROPOSED`（未批准、未实现）
决策登记：`DECISION_REGISTER.json:T-RP-04`（`approvedBy/approvedAt/evidenceRef=null`）
父任务：`RP08-T02`、`RP13-T02`；关联 `RP13-T03`、`PC05`、`T-RP-10`

## 推荐方案（仍 PROPOSED）

**O3 — 事务 outbox + 提交可见发布序列**（测试候选）。

- 每个合格源事务在同事务内写 outbox（dataset epoch、entity/id、单调 per-resource source revision、action/tombstone、可重放投影）；源变更与 outbox 同提交或同回滚。
- publisher 幂等认领已提交未发布行；在事务内锁单例发布态行、分配下一事务发布序列、追加不可变事件、标记 outbox 已发布，持锁到提交；唯一键防重试重复。
- 拉取页 `ORDER BY publishedSequence, entity, id`；游标含协议版本/epoch/授权版本/最后应用序列；显式 `hasMore`+续传令牌；客户端全页应用后才前进持久 checkpoint。
- 每资源投影带 source revision；仅当新于缓存 revision 才应用；墓碑带同 revision/epoch。

## 备选

- **O1 时间戳+重叠窗**：无硬最大延迟边界或强制证据，不安全，不推荐。
- **O2 `MAX(id)`/自增**：低 id 可晚提交被跳，永久漏行（见 `barrier-summary.json` `unsafeSequenceCounterexample` = `PERMANENT_MISS_DEMONSTRATED`），由证据驳回。
- **O4 WAL/CDC LSN**：需复制槽/保留/恢复生命周期，无当前 CDC 服务/owner 证据，暂缓。

## 兼容 / 迁移 / 回退 / 用户流程

- 兼容：需批准客户端/schema 兼容窗；当前 `SyncInitResponse` 无 `epoch` 字段（`sync.ts` L48–L56），老客户端须升级或显式标记。
- 迁移：outbox 表 + 发布态行 + source revision 列为**追加式**，无破坏性变更；激活前须逐写路径稽核 producer coverage。
- 回退：追加式 schema；撤回 publisher 后回退到当前 `updatedAt` 窗口（降级、非 safe-watermark）。
- 用户流程：全页应用后才前进 checkpoint；ACL 丢失清本地新越权行但保留 actor outbox；过期游标 `RESET_REQUIRED` 保全 outbox/dead-letter。

## 所需批准（均 pending）

选中选项、命名批准人/日期、兼容客户端/schema 窗、`S03-OI-01` 自有 PostgreSQL 双会话 barrier 证据、风险接受（如有）。

## 复用证据

`RP13-T02` `WATERMARK_ADR_DRAFT.md`、`attempt-02/barrier-summary.json`（见 `evidence/reused-evidence.md`）。未重跑；不把局部 barrier/seq 当生产 safe-watermark。

## 签名

`approvedBy=null`、`approvedAt=null`、`evidenceRef=null`。`RP13-T03` 仍门控；未激活。
