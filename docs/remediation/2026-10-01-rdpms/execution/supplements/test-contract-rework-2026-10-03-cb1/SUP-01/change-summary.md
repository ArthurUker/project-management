# SUP-01 变更摘要（TEST_ONLY）

唯一修改的正式测试：`rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
（起始副本与 sha256 存于 session 根 `evidence/start-copies/`；业务源码改动数 = 0）。

## 1. 屏障统一（LR5-01 第 1–4 项）

- 新增本文件局部受控工具 `gateReportWrite(base, methods, match, options)`，替换旧的单原语
  `gatedClient` / `gateOnReportMethod` / `gateOnReportMethods`；支持 create/upsert/update/updateMany。
- `writeTargetOf(method, args)`：按原语真实形状取参（create→data；upsert→where/create/update；
  update/updateMany→where/data）。
- `matchReportWrite({ reportId, periodKey, marker })`：必须命中「报告 id」或
  「业务唯一键 projectId+authorId+reportType+periodKey」，并命中唯一 payload 标记（content.revision）。
  墓碑恢复写入没有 `data.periodKey` 时通过 `where.id` 仍命中。
- 迁移的旧调用点：A02、A03、A03b、A04b、A06b 及三条草稿保存竞争的 `draftWriteBarrier`
  （保持 `{ client, barrier, fired }` 形状，断言未改）。

## 2. 新增 / 加固的用例

| 用例 | 内容 |
|---|---|
| SUP-01-01 | HTTP 层多原语屏障命中真实 create 写入窗口；赢家 201 + submit 200 后迟到 409 DUPLICATE_PERIOD_KEY |
| SUP-01-01b | 四原语兼容矩阵：create/upsert/updateMany/update 各自独立真实命中，记录 method/目标/命中/释放/持久结果 |
| SUP-01-02 | 墓碑迟到恢复 → 赢家恢复 201 + submit 200 → 放行迟到恢复 409 CONFLICT（新增正式用例） |
| SUP-01-03 | 真实 DB SEMANTIC_NEGATIVE_CONTROL：仅把匹配迟到 create 在测试适配层转真实无条件 upsert |
| SUP-01-04 | 屏障之后中途失败时仍 finally 释放并收束挂起请求/事务 |

## 3. 收束与失败处理

- 相关并发用例改为 `try { ... } finally { await settleGate(gate, pending) }`；`reachBarrier` 的 timer 清理保持。
- BARRIER_NOT_REACHED（超时）与「控制没有产生坏状态」「正常业务失败」分开登记；超时不算缺陷复现。

## 4. 未做

- 未修改业务源码、未临时改源码做负对照、未放宽断言、未跳过或删除原断言。
- 未执行五项源码回退控制（本轮指令明确无需扩成五项）。
