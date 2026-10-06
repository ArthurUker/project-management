# 批准请求（T-RP-04 / T-RP-12）

本文件列出使两决策从 `PROPOSED` 转为批准所需的 owner / 环境 / 数据。**本轮不批准、不代签**；所有 `approvedBy/approvedAt/evidenceRef` 保持 null。

## T-RP-04 批准清单

1. **选中选项**：推荐 O3（事务 outbox + 提交可见发布序列）作为候选，但须经 barrier 证据与命名批准确认；O2 已由 `barrier-summary.json` 证据驳回（`PERMANENT_MISS_DEMONSTRATED`）。
2. **命名批准人 / 日期**：数据库/架构负责人签字。
3. **兼容客户端/schema 窗**：当前 `SyncInitResponse` 无 `epoch`（`sync.ts` L48–L56），老客户端升级/兼容策略需明确。
4. **barrier 证据**：`S03-OI-01` 自有 PostgreSQL 双会话事务 barrier（本轮未产生；见 `acceptance-draft.csv` `AC-T-RP-04-BARRIER`）。
5. **producer coverage**：逐写路径（HTTP/sync push/模板聚合/批量导入/注册报告/备份恢复/级联/后台任务/管理脚本）同事务写 outbox 或显式 epoch reset 或批准禁用——未知覆盖为发布阻断项。
6. **风险接受**（如有）。

## T-RP-12 批准清单

1. **选中选项**：五类显式可恢复状态 + 最后副本保全 + 当前授权校验。
2. **命名批准人 / 日期**：产品/数据/前端负责人签字。
3. **兼容客户端/schema 窗**：`SyncPushResult` 需新增 `unknown`；新增 `oversize`/`quarantine` 状态与 dead-letter 字段（当前为缺口）。
4. **运行时证据**：conflict/dead-letter/unknown/oversize/quarantine/撤权 的真实 IDB 多 tab 验收（本轮 `NOT_RUN`；见 `acceptance-draft.csv`）。
5. **风险接受**（如有）。

## 跨决策依赖（仍开放）

- `T-RP-10`（restore epoch 与 stale cursor/session/outbox）：`PROPOSED`，未批准；T-RP-04 的 epoch/reset 与之耦合。
- `T-RP-11`（预算/监控）：数值未测未批；publisher/锁/保留预算需测量或批准。
- `S03-OI-01`：OPEN；是 T-RP-04 barrier 证据前置。
- `RP13-T03`：受 T-RP-04/T-RP-10 门控，不得因本材料激活。

## 本轮状态

- 所有验收 `NOT_RUN`；不把局部 barrier/seq 当生产 safe-watermark。
- `independentReview=PENDING`，`release=NOT_EVALUATED`。
