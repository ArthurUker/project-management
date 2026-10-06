# CLOSE-01 变更摘要（TEST_ONLY，父任务 RP10-T02 不扩大）

唯一修改文件：`rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs`
（起始 `95b70b11ab1b6702…`、最终 `23e4cff4da62cb27…`；起始字节副本在
`evidence/start-copies/`，由逆变换重建并以基线 SHA256 校验通过）。业务源码改动数 = 0。

## 1. 匹配器收紧（LR6-01 第 a/b/c 项）

- `matchReportWrite` 现在要求：**目标 reportId** 或**完整**业务唯一键
  `projectId+authorId+reportType+periodKey`，且**必须**命中指定 payload 标记（`content.revision`）。
  - marker 缺省 → 一律不命中（不再“缺省后放宽”）。
  - 只给 `periodKey` 之类的部分键 → 不命中（旧实现会命中）。
- 身份与标记都取**同一个**目标写入的参数：新增 `candidateIdentityOf` / `candidatePayloadsOf`，
  按原语形状取值（create→data；upsert→where/create/update；update(Many)→where/data），不跨原语拼接。
- 相关 selector 调用者补齐身份：A02/A03/A03b、SUP-01-01、SUP-01-03、SUP-01-04、
  SUP-01-01b 矩阵（create 分支补全键，非 create 分支保留 reportId）。

## 2. draftWriteBarrier（LR6-01 第 d 项）

- `draftWriteBarrier(reportId, marker)` 复用统一匹配器；因此 `upsert` 的 `create/update` payload
  （其 `data` 为 `null`）能够真正命中，不再“只把 upsert 放进 methods 数组却只检查 data.content”。
- SUP-01-06 用真实 Prisma `upsert({ where: { id }, create, update })` 证明命中（`firedMethod === 'upsert'`）
  并核对放行后的真实持久状态；另有「不同 id 同 marker」「同 id 不同 marker」两个负例不命中。

## 3. 三个旧草稿竞争收束（LR6-01 第 e 项）

legacy PUT（`:256` 原位置）、modern CAS PUT、sync push 三条既有竞争改为
`const gate = draftWriteBarrier(id, marker)` + `try { … } finally { await settleGate(gate, pending) }`，
`reachBarrier` 负责清理 timer；不再使用裸 `Promise.race(setTimeout(...))`。
原业务断言（409/`INVALID_STATE`、正文/版本/审计/receipt 计数）逐条保留。

## 4. 新增精准补证（名称唯一，不改原 22 条）

| 用例 | 层次 | 内容 |
|---|---|---|
| `RP10 LR6-01 SUP-01-05 report write matcher requires the full business identity or target id plus a mandatory marker` | 纯 helper 控制（无 DB） | 16 组：完整键/id+marker 正例；错 projectId/authorId/reportType/periodKey/marker、缺失必需字段、部分键、无 marker、错 id、upsert 错 author 负例 |
| `RP10 LR6-01 SUP-01-06 draftWriteBarrier hits a real Prisma upsert where.id with create/update payload, and rejects wrong id or marker` | 真实自有库 | 真实 upsert 命中（`firedMethod=upsert`）+ 放行后持久状态；两个负例不命中 |
| `RP10 LR6-01 SUP-01-07 legacy/modern/sync draft races release, clear timers and settle on an intermediate exception` | 真实自有库 | 三种草稿竞争中途抛错后：命中、异常可见、timer 清理、挂起请求收束、放行写入生效 |

## 5. 未做 / 未变

- 保留原 22 条用例名称与全部业务断言；新增 3 条（合计 25），数量按实际报告。
- 未降低断言、未跳过测试、未延长 timeout、未引入 sleep。
- 不修业务源码（reports.js / reportCommands.ts / sync.js 未动）。
